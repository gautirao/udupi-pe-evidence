import { useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
import { computeQueueStats, filterAndSortListings, findNextListing } from '@/components/admin/pending-approvals/pendingApprovalsHelpers';
import { usePendingListingsQuery, REJECTION_CODE_VALUES } from '@/components/admin/pending-approvals/usePendingListingsQuery';
import { usePendingListingsFilters } from '@/components/admin/pending-approvals/usePendingListingsFilters';
import { usePendingListingsSelection } from '@/components/admin/pending-approvals/usePendingListingsSelection';
import { usePendingListingsMutations } from '@/components/admin/pending-approvals/usePendingListingsMutations';

const REJECTION_CODES: RejectionCode[] = REJECTION_CODE_VALUES.map((value) => ({
  value,
  label: humanizeEnumValue(value),
}));

const TABLE_PAGE_SIZE = 20;

export default function PendingListings() {
  const { isAdmin } = useAuth();

  const { filters, setFilters, searchParams, setSearchParams } = usePendingListingsFilters();

  const [reviewListing, setReviewListing] = useState<ListingResponse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [statusAnnouncement, setStatusAnnouncement] = useState('');
  const triggerElementRef = useRef<HTMLElement | null>(null);

  const { listings, totalElements, truncated, isLoading, isError, refetch } = usePendingListingsQuery({
    enabled: isAdmin,
  });

  const {
    selectedIds,
    setSelectedIds,
    bulkFailures,
    setBulkFailures,
    dismissBulkFailures,
    selectedListings,
    eligibleSelectedListings,
    toggleRowSelection,
    togglePageSelection,
    clearSelection,
  } = usePendingListingsSelection(listings);

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

  const { approveMutation, rejectMutation, returnForEditsMutation, bulkApproveMutation } =
    usePendingListingsMutations({
      advanceOrClose,
      closeReview,
      setStatusAnnouncement,
      setSelectedIds,
      setBulkFailures,
    });

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
                Only the first {listings.length} of {totalElements} pending listings are
                loaded — the remaining {totalElements - listings.length} are not shown here
                and cannot be revealed by filtering, since filters only narrow what's
                already loaded.
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
                    onClick={dismissBulkFailures}
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
