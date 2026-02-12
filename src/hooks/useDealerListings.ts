import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
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
