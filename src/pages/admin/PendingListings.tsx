import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { api, ApiError, type PageResponse } from '@/lib/api';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { humanizeEnumValue } from '@/lib/formatters';
import { PendingApprovalsFilters } from '@/components/admin/pending-approvals/PendingApprovalsFilters';
import { PendingApprovalsTable } from '@/components/admin/pending-approvals/PendingApprovalsTable';
import { BulkActionBar } from '@/components/admin/pending-approvals/BulkActionBar';
import { ListingReviewDrawer, type RejectionCode } from '@/components/admin/pending-approvals/ListingReviewDrawer';
import {
  computeQueueStats,
  DEFAULT_FILTER_STATE,
  filterAndSortListings,
  findNextListing,
  isBulkApprovalEligible,
  type AgeBucket,
  type PendingApprovalsFilterState,
  type ReviewFlag,
  REVIEW_FLAGS,
  AGE_BUCKETS,
  type SortOrder,
  SORT_ORDERS,
} from '@/components/admin/pending-approvals/pendingApprovalsHelpers';

// Backend hardcodes these codes in AdminListingController.VALID_REJECTION_CODES — keep in sync.
const REJECTION_CODE_VALUES = [
  'INCOMPLETE_INFO',
  'DUPLICATE_LISTING',
  'INVALID_PHOTOS',
  'POLICY_VIOLATION',
  'OTHER',
] as const;

const REJECTION_CODES: RejectionCode[] = REJECTION_CODE_VALUES.map((value) => ({
  value,
  label: humanizeEnumValue(value),
}));

const QUERY_KEY_BASE = ['pending-listings'] as const;

interface BulkApproveOutcome {
  id: string;
  title: string;
  status: 'fulfilled' | 'rejected';
  message?: string;
}

// The backend's GET /api/admin/listings/pending is a real Spring Pageable
// endpoint but does NOT support server-side search/sort/filter — it always
// sorts by a fixed native-query order and strips any caller-supplied Sort
// (see AdminListingController.pending's doc comment). So we aggregate the
// full queue across pages client-side and do all filtering/sorting/stats
// over the complete array — 100-row single-page fetches silently dropped
// everything past row 100. MAX_PAGES is a safety cap against a pathological
// unbounded loop, not an expected limit (25 * 200 = 5000 rows).
const PENDING_PAGE_FETCH_SIZE = 200;
const MAX_PAGES = 25;
const TABLE_PAGE_SIZE = 20;

interface PendingListingsQueryResult {
  listings: ListingResponse[];
  totalElements: number;
  truncated: boolean;
}

function parseFiltersFromParams(params: URLSearchParams): PendingApprovalsFilterState {
  const ageParam = params.get('age');
  const sortParam = params.get('sort');
  return {
    search: params.get('q') ?? '',
    propertyTypes: params.get('type')?.split(',').filter(Boolean) ?? [],
    localities: params.get('loc')?.split(',').filter(Boolean) ?? [],
    ageBucket: (AGE_BUCKETS as readonly string[]).includes(ageParam ?? '')
      ? (ageParam as AgeBucket)
      : DEFAULT_FILTER_STATE.ageBucket,
    flags: (params.get('flags')?.split(',').filter(Boolean) ?? []).filter((flag): flag is ReviewFlag =>
      (REVIEW_FLAGS as readonly string[]).includes(flag),
    ),
    sort: (SORT_ORDERS as readonly string[]).includes(sortParam ?? '')
      ? (sortParam as SortOrder)
      : DEFAULT_FILTER_STATE.sort,
  };
}

function filtersToParams(filters: PendingApprovalsFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.propertyTypes.length) params.set('type', filters.propertyTypes.join(','));
  if (filters.localities.length) params.set('loc', filters.localities.join(','));
  if (filters.ageBucket !== 'any') params.set('age', filters.ageBucket);
  if (filters.flags.length) params.set('flags', filters.flags.join(','));
  if (filters.sort !== 'oldest') params.set('sort', filters.sort);
  return params;
}

export default function PendingListings() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => parseFiltersFromParams(searchParams), [searchParams]);
  const setFilters = (next: PendingApprovalsFilterState) =>
    setSearchParams(filtersToParams(next), { replace: true });

  const [reviewListing, setReviewListing] = useState<ListingResponse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [statusAnnouncement, setStatusAnnouncement] = useState('');
  const triggerElementRef = useRef<HTMLElement | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkFailures, setBulkFailures] = useState<BulkApproveOutcome[]>([]);

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY_BASE,
    queryFn: async (): Promise<PendingListingsQueryResult> => {
      const firstPage = await api.get<PageResponse<ListingResponse>>(
        `/api/admin/listings/pending?size=${PENDING_PAGE_FETCH_SIZE}&page=0`,
      );
      const aggregated = [...firstPage.content];
      const totalElements = firstPage.page.totalElements;
      const totalPages = firstPage.page.totalPages;
      const pagesToFetch = Math.min(totalPages, MAX_PAGES);
      for (let pageIndex = 1; pageIndex < pagesToFetch; pageIndex += 1) {
        const response = await api.get<PageResponse<ListingResponse>>(
          `/api/admin/listings/pending?size=${PENDING_PAGE_FETCH_SIZE}&page=${pageIndex}`,
        );
        aggregated.push(...response.content);
      }
      return {
        listings: aggregated,
        totalElements,
        truncated: totalPages > MAX_PAGES,
      };
    },
    enabled: isAdmin,
  });

  const { listings = [], totalElements = 0, truncated = false } = data ?? {};

  // Drop any selected id that no longer exists in the queue (approved,
  // rejected, returned, or actioned by another admin) whenever the queue
  // refetches, so selection never points at a listing that has left it.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(listings.map((l) => l.id));
      const next = new Set<string>();
      let changed = false;
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [listings]);

  const filteredListings = useMemo(() => filterAndSortListings(listings, filters), [listings, filters]);

  const page = Math.max(0, parseInt(searchParams.get('p') ?? '0', 10) || 0);
  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 0) {
      next.delete('p');
    } else {
      next.set('p', String(nextPage));
    }
    setSearchParams(next, { replace: true });
  };

  const openReview = (listing: ListingResponse, trigger: HTMLElement | null) => {
    triggerElementRef.current = trigger;
    setReviewListing(listing);
    setDrawerOpen(true);
  };

  const closeReview = () => {
    setDrawerOpen(false);
    // Restore focus to the row/button that opened the drawer once it has closed.
    window.setTimeout(() => triggerElementRef.current?.focus(), 0);
  };

  /**
   * After a successful decision (issue #2369 — "advance to the next item
   * while preserving queue state"): open the next item from the queue order
   * that was in effect when the decision was made, so the admin can keep
   * moderating without returning to the table. Closes normally, restoring
   * focus, once nothing is left to review.
   */
  const advanceOrClose = (decidedId: string) => {
    const next = findNextListing(filteredListings, decidedId);
    if (next) {
      setReviewListing(next);
    } else {
      closeReview();
    }
  };

  /**
   * Shared error handler for all three mutations below. On a 409 (another
   * admin already actioned this listing — ListingStatusException server-side)
   * we must invalidate the queue so the stale row disappears, close the
   * drawer, and tell the admin plainly what happened — previously the queue
   * was left stale and the toast was generic (issue #2369 bug fix).
   */
  const handleMutationError = (error: unknown, fallbackTitle: string) => {
    if (error instanceof ApiError && error.status === 409) {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      closeReview();
      const message = 'This listing was already processed by another admin.';
      toast({ title: 'Already processed', description: message, variant: 'destructive' });
      setStatusAnnouncement(message);
      return;
    }
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    toast({ title: fallbackTitle, description: message, variant: 'destructive' });
    setStatusAnnouncement(`${fallbackTitle}: ${message}`);
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/listings/${id}/approve`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      advanceOrClose(id);
      toast({ title: 'Listing approved', description: 'The listing is now live.' });
      setStatusAnnouncement('Listing approved. The listing is now live.');
    },
    onError: (error) => handleMutationError(error, 'Approval failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, code, note }: { id: string; code: string; note: string }) => {
      const reason = note.trim() ? `${code}: ${note.trim()}` : code;
      return api.post(`/api/admin/listings/${id}/reject`, { rejectionReason: reason });
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      advanceOrClose(id);
      toast({ title: 'Listing rejected', description: 'The broker has been notified.' });
      setStatusAnnouncement('Listing rejected. The broker has been notified.');
    },
    onError: (error) => handleMutationError(error, 'Rejection failed'),
  });

  const returnForEditsMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post(`/api/admin/listings/${id}/return-for-edits`, { note }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      advanceOrClose(id);
      toast({ title: 'Returned for edits', description: 'The broker has been notified.' });
      setStatusAnnouncement('Listing returned for edits. The broker has been notified.');
    },
    onError: (error) => handleMutationError(error, 'Return failed'),
  });

  /**
   * Bulk approval (#2369 Part 2): no dedicated bulk-approval backend endpoint
   * exists (see AdminListingController — only per-listing /approve). Rather
   * than build a new endpoint and a parallel authorization path, this issues
   * one call per eligible listing to the EXISTING /approve endpoint via
   * Promise.allSettled, so every item goes through the exact same
   * @PreAuthorize + status-transition validation as the single-item Approve
   * flow (including the 409 "already processed" case above). Eligibility is
   * computed fresh from each listing's real review flags immediately before
   * dispatch, so an accidentally-selected flagged listing is never sent.
   * Partial failures are surfaced explicitly, never hidden as a false
   * success — see bulkFailures below.
   */
  const bulkApproveMutation = useMutation({
    mutationFn: async (items: ListingResponse[]): Promise<BulkApproveOutcome[]> => {
      const eligibleItems = items.filter(isBulkApprovalEligible);
      const settled = await Promise.allSettled(
        eligibleItems.map((item) => api.post(`/api/admin/listings/${item.id}/approve`)),
      );
      return eligibleItems.map((item, index) => {
        const outcome = settled[index];
        const title = item.title || item.displayId || 'Untitled listing';
        if (outcome.status === 'fulfilled') {
          return { id: item.id, title, status: 'fulfilled' as const };
        }
        const reason = outcome.reason;
        const message =
          reason instanceof ApiError && reason.status === 409
            ? 'Already processed by another admin.'
            : reason instanceof Error
              ? reason.message
              : 'Something went wrong.';
        return { id: item.id, title, status: 'rejected' as const, message };
      });
    },
    onSuccess: (outcomes) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      const succeeded = outcomes.filter((o) => o.status === 'fulfilled');
      const failed = outcomes.filter((o) => o.status === 'rejected');
      setSelectedIds((prev) => {
        const next = new Set(prev);
        succeeded.forEach((o) => next.delete(o.id));
        return next;
      });
      setBulkFailures(failed);
      if (failed.length === 0) {
        toast({
          title: `${succeeded.length} listing${succeeded.length === 1 ? '' : 's'} approved`,
          description: 'The approved listings are now live.',
        });
        setStatusAnnouncement(`${succeeded.length} listings approved and now live.`);
      } else {
        toast({
          title: 'Bulk approval partially failed',
          description: `${succeeded.length} approved, ${failed.length} failed. See details below the queue toolbar.`,
          variant: 'destructive',
        });
        setStatusAnnouncement(
          `${succeeded.length} listings approved, ${failed.length} failed to approve.`,
        );
      }
    },
    onError: (error) => handleMutationError(error, 'Bulk approval failed'),
  });

  const selectedListings = useMemo(
    () => listings.filter((listing) => selectedIds.has(listing.id)),
    [listings, selectedIds],
  );
  const eligibleSelectedListings = useMemo(
    () => selectedListings.filter(isBulkApprovalEligible),
    [selectedListings],
  );

  const toggleRowSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePageSelection = (ids: string[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (select) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkApprove = () => {
    if (eligibleSelectedListings.length === 0 || bulkApproveMutation.isPending) return;
    bulkApproveMutation.mutate(eligibleSelectedListings);
  };

  const stats = useMemo(() => computeQueueStats(listings), [listings]);

  const totalTablePages = Math.max(1, Math.ceil(filteredListings.length / TABLE_PAGE_SIZE));
  const clampedPage = Math.min(page, totalTablePages - 1);
  const pageStart = clampedPage * TABLE_PAGE_SIZE;
  const pageEnd = Math.min(pageStart + TABLE_PAGE_SIZE, filteredListings.length);
  const pagedListings = filteredListings.slice(pageStart, pageEnd);

  const propertyTypeOptions = useMemo(
    () => Array.from(new Set(listings.map((l) => l.propertyType))).sort(),
    [listings],
  );
  const localityOptions = useMemo(
    () =>
      Array.from(new Set(listings.map((l) => l.locality).filter((l): l is string => Boolean(l)))).sort(),
    [listings],
  );

  return (
    <AppLayout>
      <div className="container mx-auto max-w-7xl px-4 py-6">
        {/* aria-live region announces mutation outcomes for screen-reader users */}
        <div role="status" aria-live="polite" className="sr-only">
          {statusAnnouncement}
        </div>

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <ClipboardList className="h-6 w-6 text-primary" aria-hidden="true" />
              Pending approvals
              <Badge variant="secondary" className="text-sm">
                {totalElements} pending
              </Badge>
            </h1>
            <p className="text-muted-foreground">Review broker-submitted listings</p>
            {truncated && (
              <p className="text-xs text-amber-700" data-testid="pending-queue-truncated-note">
                Showing first {PENDING_PAGE_FETCH_SIZE * MAX_PAGES} of {totalElements} — narrow with
                filters to see more.
              </p>
            )}
          </div>

          <div className="flex divide-x divide-border rounded-lg border bg-card">
            <div className="min-w-[110px] flex-1 px-4 py-2.5 text-right">
              <p className="font-mono text-xl font-extrabold leading-none">{stats.newToday}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                New today
              </p>
            </div>
            <div className="min-w-[110px] flex-1 px-4 py-2.5 text-right">
              <p
                className={cn(
                  'font-mono text-xl font-extrabold leading-none',
                  stats.overSevenDays > 0 && 'text-amber-700',
                )}
              >
                {stats.overSevenDays}
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Over 7 days old
              </p>
            </div>
            <div className="min-w-[110px] flex-1 px-4 py-2.5 text-right">
              <p
                className={cn(
                  'font-mono text-xl font-extrabold leading-none',
                  stats.needsAttention > 0 && 'text-amber-700',
                )}
              >
                {stats.needsAttention}
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Needs attention
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <PendingApprovalsFilters
            filters={filters}
            onChange={setFilters}
            propertyTypeOptions={propertyTypeOptions}
            localityOptions={localityOptions}
            resultCount={filteredListings.length}
          />
        </div>

        {isLoading ? (
          <div className="space-y-2" data-testid="pending-loading">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
              <p className="text-muted-foreground">Couldn&apos;t load the pending queue.</p>
              <button
                type="button"
                className="text-sm font-medium text-primary hover:underline"
                onClick={() => refetch()}
              >
                Try again
              </button>
            </CardContent>
          </Card>
        ) : listings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No listings pending review.
            </CardContent>
          </Card>
        ) : filteredListings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No listings match the current filters.
            </CardContent>
          </Card>
        ) : (
          <>
            {bulkFailures.length > 0 && (
              <div
                className="mb-4 rounded-md border border-amber-200 bg-amber-100 p-3 text-sm text-amber-900"
                data-testid="bulk-approve-failures"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">Some listings could not be approved</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {bulkFailures.map((failure) => (
                        <li key={failure.id}>
                          {failure.title}: {failure.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium underline"
                    onClick={() => setBulkFailures([])}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            {selectedIds.size > 0 && (
              <BulkActionBar
                selectedCount={selectedListings.length}
                eligibleCount={eligibleSelectedListings.length}
                pending={bulkApproveMutation.isPending}
                onClear={clearSelection}
                onApprove={handleBulkApprove}
              />
            )}
            <PendingApprovalsTable
              listings={pagedListings}
              onReview={openReview}
              selectedIds={selectedIds}
              onToggleRow={toggleRowSelection}
              onTogglePage={togglePageSelection}
            />
            <nav
              aria-label="Pagination"
              className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-sm text-muted-foreground">
                Showing {pageStart + 1}-{pageEnd} of {filteredListings.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={clampedPage === 0}
                  onClick={() => setPage(clampedPage - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={clampedPage >= totalTablePages - 1}
                  onClick={() => setPage(clampedPage + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
          </>
        )}

        <ListingReviewDrawer
          listing={reviewListing}
          open={drawerOpen}
          onOpenChange={(open) => {
            if (!open) closeReview();
            else setDrawerOpen(true);
          }}
          rejectionCodes={REJECTION_CODES}
          approvePending={approveMutation.isPending}
          rejectPending={rejectMutation.isPending}
          returnForEditsPending={returnForEditsMutation.isPending}
          onApprove={(id) => approveMutation.mutate(id)}
          onReject={(id, code, note) => rejectMutation.mutate({ id, code, note })}
          onReturnForEdits={(id, note) => returnForEditsMutation.mutate({ id, note })}
        />
      </div>
    </AppLayout>
  );
}
