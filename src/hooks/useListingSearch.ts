import { useQuery } from '@tanstack/react-query';
import { api, PageResponse } from '@/lib/api';
import { PropertyListing } from '@/hooks/usePropertyListings';

interface SearchListingResponse {
  id: string;
  title: string | null;
  locality: string | null;
  propertyType: string;
  bedrooms: number | null;
  priceRupees: number | null;
  areaKey: string | null;
  areaLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

function toPropertyListing(r: SearchListingResponse): PropertyListing & { images: [] } {
  return {
    id: r.id,
    property_type: r.propertyType as PropertyListing['property_type'],
    title: r.title,
    locality: r.locality,
    price: r.priceRupees !== null ? Number(r.priceRupees) : null,
    price_unit: 'INR',
    land_area: null,
    land_area_unit: null,
    built_area: null,
    built_area_unit: null,
    bedrooms: r.bedrooms,
    bathrooms: null,
    contact_info: null,
    contact_phone: null,
    description: null,
    latitude: r.latitude,
    longitude: r.longitude,
    confidence_score: null,
    language_detected: null,
    price_per_cent_paise: null,
    is_valid: true,
    is_duplicate: false,
    status: 'LIVE',
    created_at: r.createdAt,
    updated_at: r.createdAt,
    raw_post_id: null,
    images: [],
  };
}

export interface ListingSearchParams {
  q: string;
  locality?: string;
  propertyType?: string;
  bedrooms?: number;
}

export function useListingSearch({ q, locality, propertyType, bedrooms }: ListingSearchParams) {
  return useQuery({
    queryKey: ['listing-search', q, locality, propertyType, bedrooms],
    queryFn: async () => {
      const params = new URLSearchParams({ size: '200' });
      if (q) params.set('q', q);
      if (locality) params.set('locality', locality);
      if (propertyType) params.set('propertyType', propertyType);
      if (bedrooms !== undefined) params.set('bedrooms', String(bedrooms));

      const page = await api.get<PageResponse<SearchListingResponse>>(
        `/api/dashboard/listings/search?${params.toString()}`
      );
      return page.content.map(toPropertyListing);
    },
    enabled: q.trim().length > 0,
  });
}
