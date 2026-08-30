import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAdminListingById,
  useAdminListingFilterOptions,
  useAdminListingsPage,
  useAdminListingsTabCounts,
  type AdminListingsQueryParams,
} from '@/hooks/useAdminData';
import type { InventorySortKey, InventoryTab, QualityBucket } from '@/lib/listingInventory';
import { useListingsSelection } from './useListingsSelection';

const PAGE_SIZE = 25;

const DEFAULT_TAB_COUNTS: Record<InventoryTab, number> = {
  all: 0,
  published: 0,
  pending: 0,
  'needs-attention': 0,
  archived: 0,
};

/**
 * Owns the admin Listings inventory page's URL-derived filter/sort/pagination
 * state, the server-side page/tab-count/filter-option queries, and deep-link
 * (`?edit=<id>`) resolution — kept together in one hook so the deep-link
 * resolving/not-found state machine and the page-reset-on-filter-change
 * behavior can't drift out of sync with each other. See #2370. Row selection
 * lives in the separate useListingsSelection hook (#2377).
 */
export function useAdminListingsInventory() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = (searchParams.get('tab') as InventoryTab) || 'all';
  const q = searchParams.get('q') || '';
  const sort = (searchParams.get('sort') as InventorySortKey) || 'updated-desc';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const propertyTypeFilter = searchParams.get('pt') || 'all';
  const localityFilter = searchParams.get('loc') || 'all';
  const sellerFilter = searchParams.get('seller') || 'all';
  const lifecycleFilter = searchParams.get('status') || 'all';
  const visibilityFilter = (searchParams.get('vis') as AdminListingsQueryParams['visibility']) || 'all';
  const qualityFilter = (searchParams.get('quality') as QualityBucket | 'all') || 'all';
  const editingId = searchParams.get('edit');
  const editingSection = (searchParams.get('editTab') as 'details' | 'activity') || 'details';

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  // Reset to page 1 whenever the scope of results changes.
  function updateFilters(patch: Record<string, string | null>) {
    updateParams({ ...patch, page: null });
  }

  // Server-side paginated/filtered/sorted inventory page — see #2370: this
  // replaces the old `useAdminListings(FETCH_LIMIT)` + client-side
  // filter/sort/slice, which silently lost any listing outside the first
  // 200 rows fetched.
  const queryParams: AdminListingsQueryParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      tab,
      q,
      sort,
      propertyType: propertyTypeFilter,
      locality: localityFilter,
      sellerType: sellerFilter,
      lifecycleStatus: lifecycleFilter,
      visibility: visibilityFilter,
      quality: qualityFilter,
    }),
    [page, tab, q, sort, propertyTypeFilter, localityFilter, sellerFilter, lifecycleFilter, visibilityFilter, qualityFilter],
  );

  const { data: pageData, isLoading, isError, refetch } = useAdminListingsPage(queryParams);
  const pageItems = useMemo(() => pageData?.items ?? [], [pageData]);
  const totalCount = pageData?.totalCount ?? 0;

  const { data: tabCounts = DEFAULT_TAB_COUNTS } = useAdminListingsTabCounts();

  const { data: filterOptions } = useAdminListingFilterOptions();
  const propertyTypeOptions = filterOptions?.propertyTypes ?? [];
  const localityOptions = filterOptions?.localities ?? [];
  const sellerTypeOptions = filterOptions?.sellerTypes ?? [];

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  // Deep-link resolution (#2370): if the requested id isn't on the current
  // page, fetch it directly by id rather than reporting "not found" for a
  // listing that's simply outside this page/window.
  const editingListingFromPage = editingId ? pageItems.find((l) => l.id === editingId) : undefined;
  const needsDirectLookup = !!editingId && !editingListingFromPage;
  const { data: editingListingById, isLoading: isLoadingEditingListingById } = useAdminListingById(
    needsDirectLookup ? editingId : null,
  );
  const editingListing = editingListingFromPage ?? (needsDirectLookup ? editingListingById : null);
  const isResolvingListing =
    !!editingId && (isLoading || (needsDirectLookup && isLoadingEditingListingById));

  const { selectedListings, setSelectedListings, allOnPageSelected, toggleSelect, toggleSelectAll } =
    useListingsSelection(pageItems, tab);

  function openEditor(id: string, section: 'details' | 'activity' = 'details') {
    updateParams({ edit: id, editTab: section === 'activity' ? 'activity' : null });
  }

  function closeEditor() {
    updateParams({ edit: null, editTab: null });
  }

  async function refreshInventory() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-listings-page'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-listings-tab-counts'] }),
    ]);
  }

  const hasActiveFilters =
    !!q ||
    lifecycleFilter !== 'all' ||
    propertyTypeFilter !== 'all' ||
    localityFilter !== 'all' ||
    sellerFilter !== 'all' ||
    visibilityFilter !== 'all' ||
    qualityFilter !== 'all';

  return {
    tab,
    q,
    sort,
    propertyTypeFilter,
    localityFilter,
    sellerFilter,
    lifecycleFilter,
    visibilityFilter,
    qualityFilter,
    editingId,
    editingSection,
    updateParams,
    updateFilters,

    pageItems,
    totalCount,
    isLoading,
    isError,
    refetch,

    tabCounts,
    propertyTypeOptions,
    localityOptions,
    sellerTypeOptions,

    totalPages,
    currentPage,
    pageSize: PAGE_SIZE,

    editingListing,
    isResolvingListing,
    openEditor,
    closeEditor,

    selectedListings,
    setSelectedListings,
    allOnPageSelected,
    toggleSelect,
    toggleSelectAll,

    refreshInventory,
    hasActiveFilters,
  };
}
