import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PageResponse } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// Mirrors backend CreateRequest DTO
interface CreateListingRequest {
  propertyType: string;
  title?: string;
  locality?: string;
  price?: number;
  description?: string;
  landArea?: number;
  landAreaUnit?: string;
  bedrooms?: number;
  builtArea?: number;
  builtAreaUnit?: string;
  // Commercial & rent fields
  listingPurpose?: string;
  carpetArea?: number;
  carpetAreaUnit?: string;
  floorNumber?: number;
  totalFloors?: number;
  furnishingStatus?: string;
  washrooms?: number;
  parkingCount?: number;
  roadFrontageFt?: number;
  commercialUsage?: string;
  numberOfUnits?: number;
  monthlyRent?: number;
  securityDepositMonths?: number;
  lockInMonths?: number;
}

// Mirrors backend UpdateRequest DTO
export interface UpdateListingRequest {
  title?: string;
  description?: string;
  price?: number;
  propertyType?: string;
  locality?: string;
  landArea?: number;
  landAreaUnit?: string;
  bedrooms?: number;
  builtArea?: number;
  builtAreaUnit?: string;
  latitude?: number;
  longitude?: number;
  addressConfirmed?: boolean;
  videoUrl?: string | null;
  applyVideoUrl?: boolean;
  reraNumber?: string | null;
  // Commercial & rent fields
  listingPurpose?: string;
  carpetArea?: number;
  carpetAreaUnit?: string;
  floorNumber?: number;
  totalFloors?: number;
  furnishingStatus?: string;
  washrooms?: number;
  parkingCount?: number;
  roadFrontageFt?: number;
  commercialUsage?: string;
  numberOfUnits?: number;
  monthlyRent?: number;
  securityDepositMonths?: number;
  lockInMonths?: number;
}

// Mirrors backend ListingResponse DTO
export interface ListingResponse {
  id: string;
  status: string;
  propertyType: string;
  title: string | null;
  locality: string | null;
  price: number | null;
  description: string | null;
  landArea: number | null;
  landAreaUnit: string | null;
  bedrooms: number | null;
  builtArea: number | null;
  builtAreaUnit: string | null;
  latitude: number | null;
  longitude: number | null;
  addressConfirmed: boolean;
  imageCount: number;
  firstImageUrl: string | null;
  rejectionReason: string | null;
  videoUrl: string | null;
  reraNumber: string | null;
  listingNumber?: number;
  displayId?: string;
  createdAt: string;
  updatedAt: string;
  // Commercial & rent fields
  listingPurpose: string | null;
  carpetArea: number | null;
  carpetAreaUnit: string | null;
  floorNumber: number | null;
  totalFloors: number | null;
  furnishingStatus: string | null;
  washrooms: number | null;
  parkingCount: number | null;
  roadFrontageFt: number | null;
  commercialUsage: string | null;
  numberOfUnits: number | null;
  monthlyRent: number | null;
  securityDepositMonths: number | null;
  lockInMonths: number | null;
  sellerType: string | null;
}

/**
 * Fetches the current broker's own listings from the paginated endpoint
 * GET /api/listings/mine — returns Page<ListingResponse>.
 *
 * @param page  - zero-based page number (default 0)
 * @param size  - page size (default 20, matches backend default)
 */
export function useBrokerMyListings(page = 0, size = 20) {
  return useQuery({
    queryKey: ['dealer-listings', page, size],
    queryFn: async () => {
      const response = await api.get<PageResponse<ListingResponse>>(
        `/api/listings/mine?page=${page}&size=${size}`,
      );
      return {
        listings: response.content,
        totalPages: response.page.totalPages,
        totalElements: response.page.totalElements,
        currentPage: response.page.number,
        pageSize: response.page.size,
        isFirst: response.page.number === 0,
        isLast: response.page.number + 1 >= response.page.totalPages,
      };
    },
  });
}

interface BrokerListingsParams {
  status?: string;
  sort?: string;
  size?: number;
}

/**
 * Infinite-query variant of useBrokerMyListings.
 * Pages are appended on each "load more" call.
 * Use `data.pages.flatMap(p => p.listings)` to get all loaded listings.
 *
 * Accepts optional filter/sort params that are forwarded to the backend.
 */
export function useBrokerMyListingsInfinite(params: BrokerListingsParams = {}) {
  const { status, sort = 'createdAt,desc', size = 20 } = params;

  return useInfiniteQuery({
    queryKey: ['dealer-listings-infinite', size, status, sort],
    staleTime: 60_000,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const searchParams = new URLSearchParams();
      searchParams.set('page', String(pageParam));
      searchParams.set('size', String(size));
      searchParams.set('sort', sort);
      if (status) {
        searchParams.set('status', status);
      }
      const response = await api.get<PageResponse<ListingResponse>>(
        `/api/listings/mine?${searchParams.toString()}`,
      );
      return {
        listings: response.content,
        totalElements: response.page.totalElements,
        isLast: response.page.number + 1 >= response.page.totalPages,
        nextPage: response.page.number + 1,
      };
    },
    getNextPageParam: (lastPage) => (lastPage.isLast ? undefined : lastPage.nextPage),
  });
}

/** Response shape for GET /api/listings/mine/stats */
export interface BrokerListingStats {
  draftCount: number;
  pendingReviewCount: number;
  liveCount: number;
  rejectedCount: number;
  totalCount: number;
}

/**
 * Fetches listing count stats by status for the current broker.
 * Used by filter chips and dashboard cards.
 */
export function useBrokerListingStats() {
  return useQuery({
    queryKey: ['dealer-listing-stats'],
    queryFn: () => api.get<BrokerListingStats>('/api/listings/mine/stats'),
  });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: CreateListingRequest) =>
      api.post<ListingResponse>('/api/listings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create listing',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Fetches a single listing by ID from GET /api/listings/{id}.
 */
export function useGetListing(id: string) {
  return useQuery({
    queryKey: ['listing-broker', id],
    queryFn: () => api.get<ListingResponse>(`/api/listings/${id}`),
    enabled: !!id,
  });
}

/**
 * Updates a listing via PUT /api/listings/{id}.
 * Invalidates the broker-listings and single listing query on success.
 */
export function useUpdateListing(id: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: UpdateListingRequest) =>
      api.put<ListingResponse>(`/api/listings/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
      queryClient.invalidateQueries({ queryKey: ['listing-broker', id] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update listing',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Deletes a DRAFT listing via DELETE /api/listings/{id}.
 * Invalidates the broker-listings query on success.
 */
export function useDeleteListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listingId: string) =>
      api.delete<void>(`/api/listings/${listingId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
    },
  });
}

/**
 * Duplicates an existing listing by fetching it and creating a new DRAFT
 * with the same core fields (type, title, locality, price, description, areas).
 * Images, address, and video are NOT copied — the broker adds those fresh.
 */
export function useDuplicateListing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (sourceId: string) => {
      const source = await api.get<ListingResponse>(`/api/listings/${sourceId}`);
      return api.post<ListingResponse>('/api/listings', {
        propertyType: source.propertyType,
        title: source.title ? `Copy of ${source.title}` : undefined,
        locality: source.locality ?? undefined,
        price: source.price ?? undefined,
        description: source.description ?? undefined,
        landArea: source.landArea ?? undefined,
        landAreaUnit: source.landAreaUnit ?? undefined,
        bedrooms: source.bedrooms ?? undefined,
        builtArea: source.builtArea ?? undefined,
        builtAreaUnit: source.builtAreaUnit ?? undefined,
        listingPurpose: source.listingPurpose ?? undefined,
        carpetArea: source.carpetArea ?? undefined,
        carpetAreaUnit: source.carpetAreaUnit ?? undefined,
        floorNumber: source.floorNumber ?? undefined,
        totalFloors: source.totalFloors ?? undefined,
        furnishingStatus: source.furnishingStatus ?? undefined,
        washrooms: source.washrooms ?? undefined,
        parkingCount: source.parkingCount ?? undefined,
        roadFrontageFt: source.roadFrontageFt ?? undefined,
        commercialUsage: source.commercialUsage ?? undefined,
        numberOfUnits: source.numberOfUnits ?? undefined,
        monthlyRent: source.monthlyRent ?? undefined,
        securityDepositMonths: source.securityDepositMonths ?? undefined,
        lockInMonths: source.lockInMonths ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
      toast({ title: 'Listing duplicated', description: 'Edit your new draft to customize it.' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to duplicate listing',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Bulk-deletes listings via POST /api/listings/bulk-delete.
 * Only DRAFT and REJECTED listings can be deleted.
 */
export function useBulkDeleteListings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ deleted: number; skipped: number; errors: string[] }>(
        '/api/listings/bulk-delete',
        { ids },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
    },
  });
}

/**
 * Submits a listing for review via POST /api/listings/{id}/submit.
 * Backend validates address_confirmed=true, imageCount>=3, and required fields.
 * Throws an error with `.status` and `.body` attached for 422 responses.
 */
export function useSubmitListing(listingId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!listingId) throw new Error('No listing ID');
      return api.post<ListingResponse>(`/api/listings/${listingId}/submit`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
      if (listingId) {
        queryClient.invalidateQueries({ queryKey: ['listing-broker', listingId] });
      }
    },
  });
}

// Legacy aliases — kept for backward compatibility with old useDealerListings imports
/** @deprecated Use useBrokerMyListings */
export { useBrokerMyListings as useDealerMyListings };
/** @deprecated Use useBrokerMyListingsInfinite */
export { useBrokerMyListingsInfinite as useDealerMyListingsInfinite };
/** @deprecated Use useBrokerListingStats */
export { useBrokerListingStats as useDealerListingStats };
