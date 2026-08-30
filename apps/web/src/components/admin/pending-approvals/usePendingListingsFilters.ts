import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AGE_BUCKETS,
  DEFAULT_FILTER_STATE,
  REVIEW_FLAGS,
  SORT_ORDERS,
  type AgeBucket,
  type PendingApprovalsFilterState,
  type ReviewFlag,
  type SortOrder,
} from './pendingApprovalsHelpers';

/**
 * Extracted from PendingListings.tsx (issue #2380) — URL-driven filter/sort
 * state for the pending-approvals queue. Behavior-preserving: same param
 * names (`q`, `type`, `loc`, `age`, `flags`, `sort`) and the same
 * `{ replace: true }` navigation semantics as before extraction.
 */
export function parseFiltersFromParams(params: URLSearchParams): PendingApprovalsFilterState {
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

export function filtersToParams(filters: PendingApprovalsFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.propertyTypes.length) params.set('type', filters.propertyTypes.join(','));
  if (filters.localities.length) params.set('loc', filters.localities.join(','));
  if (filters.ageBucket !== 'any') params.set('age', filters.ageBucket);
  if (filters.flags.length) params.set('flags', filters.flags.join(','));
  if (filters.sort !== 'oldest') params.set('sort', filters.sort);
  return params;
}

export interface UsePendingListingsFiltersResult {
  filters: PendingApprovalsFilterState;
  setFilters: (next: PendingApprovalsFilterState) => void;
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
}

/**
 * URL-state hook for the pending-approvals filter/sort bar. Also exposes the
 * raw `searchParams`/`setSearchParams` pair since `PendingListings.tsx` reuses
 * them for the unrelated `p` (table page) param — keeping a single
 * `useSearchParams()` subscription avoids two independent React Router state
 * sources fighting over the same URL.
 */
export function usePendingListingsFilters(): UsePendingListingsFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => parseFiltersFromParams(searchParams), [searchParams]);
  const setFilters = (next: PendingApprovalsFilterState) =>
    setSearchParams(filtersToParams(next), { replace: true });

  return { filters, setFilters, searchParams, setSearchParams };
}
