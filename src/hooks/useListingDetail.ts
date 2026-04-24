import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ListingResponse } from '@/hooks/useBrokerListings';
import { PropertyImage } from '@/hooks/usePropertyListings';

export interface PublicListingDetail extends ListingResponse {
  images: PropertyImage[];
  areaKey?: string | null;
}

export function useListingDetail(id: string | undefined) {
  return useQuery<PublicListingDetail>({
    queryKey: ['listing-public', id],
    queryFn: () => api.get<PublicListingDetail>(`/api/public/listings/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}
