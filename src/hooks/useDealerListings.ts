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
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetches the current dealer's own listings from the paginated endpoint
 * GET /api/listings/mine — returns Page<ListingResponse>.
 *
 * @param page  - zero-based page number (default 0)
 * @param size  - page size (default 20, matches backend default)
 */
export function useDealerMyListings(page = 0, size = 20) {
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

/**
 * Infinite-query variant of useDealerMyListings.
 * Pages are appended on each "load more" call.
 * Use `data.pages.flatMap(p => p.listings)` to get all loaded listings.
 */
export function useDealerMyListingsInfinite(size = 20) {
  return useInfiniteQuery({
    queryKey: ['dealer-listings-infinite', size],
    staleTime: 60_000,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const response = await api.get<PageResponse<ListingResponse>>(
        `/api/listings/mine?page=${pageParam}&size=${size}`,
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

export function useCreateListing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: CreateListingRequest) =>
      api.post<ListingResponse>('/api/listings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
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
    queryKey: ['listing', id],
    queryFn: () => api.get<ListingResponse>(`/api/listings/${id}`),
    enabled: !!id,
  });
}

/**
 * Updates a listing via PUT /api/listings/{id}.
 * Invalidates the dealer-listings and single listing query on success.
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
      queryClient.invalidateQueries({ queryKey: ['listing', id] });
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
 * Invalidates the dealer-listings query on success.
 */
export function useDeleteListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listingId: string) =>
      api.delete<void>(`/api/listings/${listingId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
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
      queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
    },
  });
}
