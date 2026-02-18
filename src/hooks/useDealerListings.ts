import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PageResponse } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// Mirrors backend CreateRequest DTO
interface CreateListingRequest {
  propertyType: string;
  title?: string;
  locality?: string;
  price?: number;
  description?: string;
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
  latitude: number | null;
  longitude: number | null;
  addressConfirmed: boolean;
  rejectionReason: string | null;
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
        totalPages: response.totalPages,
        totalElements: response.totalElements,
        currentPage: response.number,
        pageSize: response.size,
        isFirst: response.first,
        isLast: response.last,
      };
    },
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
