import { useQuery, type QueryKey } from '@tanstack/react-query';
import { api, type PageResponse } from '@/lib/api';
import type { ListingResponse } from '@/hooks/useBrokerListings';

// Backend hardcodes these codes in AdminListingController.VALID_REJECTION_CODES — keep in sync.
export const REJECTION_CODE_VALUES = [
  'INCOMPLETE_INFO',
  'DUPLICATE_LISTING',
  'INVALID_PHOTOS',
  'POLICY_VIOLATION',
  'OTHER',
] as const;

export const QUERY_KEY_BASE: QueryKey = ['pending-listings'];

// The backend's GET /api/admin/listings/pending is a real Spring Pageable
// endpoint but does NOT support server-side search/sort/filter — it always
// sorts by a fixed native-query order and strips any caller-supplied Sort
// (see AdminListingController.pending's doc comment). So we aggregate the
// full queue across pages client-side and do all filtering/sorting/stats
// over the complete array — 100-row single-page fetches silently dropped
// everything past row 100. MAX_PAGES is a safety cap against a pathological
// unbounded loop, not an expected limit. Note: the requested page size below
// is a request only — spring.data.web.pageable.max-page-size (application.yml)
// silently clamps it server-side (currently 100), so the true per-page count
// actually loaded can be smaller than PENDING_PAGE_FETCH_SIZE. Never assume
// PENDING_PAGE_FETCH_SIZE * MAX_PAGES as the loaded-row cap for display —
// use the real aggregated array length (see the truncated-queue banner below).
// Also: because filtering/sorting happens entirely over this already-truncated
// `listings` array (the endpoint has no server-side filter), the truncated-
// queue banner must never imply that narrowing the visible filters can reveal
// rows beyond what was already loaded — it cannot (#2378 review finding).
export const PENDING_PAGE_FETCH_SIZE = 200;
export const MAX_PAGES = 25;

export interface PendingListingsQueryResult {
  listings: ListingResponse[];
  totalElements: number;
  truncated: boolean;
}

async function fetchAllPendingListings(): Promise<PendingListingsQueryResult> {
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
}

export interface UsePendingListingsQueryOptions {
  enabled: boolean;
}

/**
 * Extracted from PendingListings.tsx (issue #2380) — client-side
 * pagination/aggregation across the non-server-filterable
 * `/api/admin/listings/pending` endpoint. Behavior-preserving: same query
 * key, same fetch loop/MAX_PAGES cap, same `enabled` gating.
 */
export function usePendingListingsQuery({ enabled }: UsePendingListingsQueryOptions) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEY_BASE,
    queryFn: fetchAllPendingListings,
    enabled,
  });

  const { listings = [], totalElements = 0, truncated = false } = data ?? {};

  return { listings, totalElements, truncated, isLoading, isError, refetch };
}
