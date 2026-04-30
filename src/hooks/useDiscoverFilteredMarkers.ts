import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PropertyFilters } from '@/hooks/usePropertyListings';

export interface DiscoverFilteredMarker {
  id: string;
  latitude: number;
  longitude: number;
  pricePaise: number | null;
  locality: string | null;
}

export interface DiscoverFilteredMarkersResponse {
  city: string;
  markers: DiscoverFilteredMarker[];
  truncated?: boolean;
}

export function useDiscoverFilteredMarkers(
  city: string,
  filters: PropertyFilters,
  enabled = true,
) {
  return useQuery<DiscoverFilteredMarkersResponse>({
    queryKey: ['discover-filtered-markers', city, filters],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      params.set('city', city);

      filters.propertyTypes?.forEach((t) => params.append('propertyTypes', t));
      filters.localities?.forEach((l) => params.append('localities', l));
      if (filters.priceMin != null) params.set('priceMin', String(filters.priceMin));
      if (filters.priceMax != null) params.set('priceMax', String(filters.priceMax));
      if (filters.dateFrom != null) params.set('dateFrom', filters.dateFrom instanceof Date ? filters.dateFrom.toISOString() : String(filters.dateFrom));
      if (filters.dateTo != null) params.set('dateTo', filters.dateTo instanceof Date ? filters.dateTo.toISOString() : String(filters.dateTo));
      if (filters.bedrooms != null) {
        filters.bedrooms.forEach((b) => params.append('bedrooms', String(b)));
      }
      filters.sellerTypes?.forEach((s) => params.append('sellerTypes', s));
      if (filters.backOnMarket) params.set('backOnMarket', 'true');
      if (filters.newToMarket) params.set('newToMarket', 'true');
      if (filters.reraRegistered) params.set('reraRegistered', 'true');
      if (filters.readyToMove) params.set('readyToMove', 'true');
      if (filters.polygon) params.set('polygon', JSON.stringify(filters.polygon));
      if (filters.schoolLat != null) params.set('schoolLat', String(filters.schoolLat));
      if (filters.schoolLon != null) params.set('schoolLon', String(filters.schoolLon));
      if (filters.schoolRadiusKm != null) params.set('schoolRadiusKm', String(filters.schoolRadiusKm));

      return api.get<DiscoverFilteredMarkersResponse>(`/api/discover/markers?${params.toString()}`, { signal });
    },
    enabled: enabled && city.length > 0,
    staleTime: 60_000,
  });
}
