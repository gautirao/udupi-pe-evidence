import { useTeaserListings } from './usePropertyListings';

export interface PublicListing {
  id: string;
  primaryImageUrl: string | null;
  price: number | null;
  propertyType: string | null;
  locality: string | null;
  listingPurpose: string | null;
}

export function usePublicListings(size = 6) {
  const result = useTeaserListings();
  return {
    ...result,
    data: result.data?.slice(0, size) ?? [],
  };
}
