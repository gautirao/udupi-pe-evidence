import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { snapBbox } from '@/lib/bboxUtils';

export interface DiscoverListingItem {
  id: string;
  listingNumber: string | null;
  propertyType: string;
  title: string | null;
  locality: string | null;
  areaKey: string | null;
  pricePaise: number | null;
  landArea: number | null;
  landAreaUnit: string | null;
  builtArea: number | null;
  builtAreaUnit: string | null;
  bedrooms: number | null;
  latitude: number | null;
  longitude: number | null;
  heroImageUrl: string | null;
  createdAt: string;
  updatedAt: string | null;
  firstPublishedAt: string | null;
  lastUpdatedAt: string | null;
  daysOnMarket: number;
  backOnMarket: boolean;
  reraNumber: string | null;
  reraValid: boolean;
  trustTier: string | null;
  possessionStatus: string | null;
  sellerType: string | null;
  listingPurpose: string | null;
  status: string;
}

export interface DiscoverListingsPage {
  content: DiscoverListingItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  aggregates?: {
    topLocalities: { locality: string; count: number }[];
  } | null;
}

export interface UseDiscoverListingsParams {
  city: string;
  page: number;
  size?: number;
  filters: PropertyFilters;
  includeAggregates?: boolean;
  enabled?: boolean;
  /**
   * Optional viewport bounding box [south, west, north, east].
   * Snapped to 0.02° grid for cache efficiency before being sent to the API.
   * When omitted, the backend falls back to the full city query.
   */
  bbox?: [number, number, number, number] | null;
  /**
   * Optional keyword search term. Blank/whitespace-only values are ignored.
   * Server-side FTS (V18 search_vector). 500-char limit enforced server-side.
   */
  q?: string;
  /** Issue #1494 — buy/rent intent mapped to listingPurpose for the backend. */
  listingPurpose?: string;
}

export function useDiscoverListings({
  city,
  page,
  size = 50,
  filters,
  includeAggregates = false,
  enabled = true,
  bbox,
  q,
  listingPurpose,
}: UseDiscoverListingsParams) {
  // Snap bbox to grid for cache efficiency; null when not provided or contains non-finite values.
  const snapped: [number, number, number, number] | null =
    bbox != null && bbox.every(Number.isFinite) ? snapBbox(bbox) : null;

  const trimmedQ = q?.trim() || null;

  return useQuery<DiscoverListingsPage>({
    queryKey: ['discover-listings', city, page, size, filters, includeAggregates, snapped, trimmedQ, listingPurpose ?? null],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      params.set('city', city);
      params.set('page', String(page));
      params.set('size', String(size));
      if (includeAggregates) params.set('includeAggregates', 'true');
      if (snapped) {
        const [s, w, n, e] = snapped;
        params.set('bbox', `${s},${w},${n},${e}`);
      }

      filters.propertyTypes?.forEach((t) => params.append('propertyTypes', t));
      filters.localities?.forEach((l) => params.append('localities', l));
      if (filters.priceMin != null) params.set('priceMin', String(filters.priceMin));
      if (filters.priceMax != null) params.set('priceMax', String(filters.priceMax));
      // dateFrom/dateTo: PropertyFilters may hold Date objects — always serialise to ISO string
      if (filters.dateFrom != null) params.set('dateFrom', filters.dateFrom instanceof Date ? filters.dateFrom.toISOString() : String(filters.dateFrom));
      if (filters.dateTo != null) params.set('dateTo', filters.dateTo instanceof Date ? filters.dateTo.toISOString() : String(filters.dateTo));
      if (filters.bedrooms != null) {
        filters.bedrooms.forEach((b) => params.append('bedrooms', String(b)));
      }
      filters.sellerTypes?.forEach((st) => params.append('sellerTypes', st));
      if (filters.backOnMarket) params.set('backOnMarket', 'true');
      if (filters.newToMarket) params.set('newToMarket', 'true');
      if (filters.reraRegistered) params.set('reraRegistered', 'true');
      if (filters.readyToMove) params.set('readyToMove', 'true');
      if (filters.polygon) params.set('polygon', JSON.stringify(filters.polygon));
      if (filters.schoolLat != null) params.set('schoolLat', String(filters.schoolLat));
      if (filters.schoolLon != null) params.set('schoolLon', String(filters.schoolLon));
      if (filters.schoolRadiusKm != null) params.set('schoolRadiusKm', String(filters.schoolRadiusKm));
      if (trimmedQ) params.set('q', trimmedQ);
      if (listingPurpose) params.set('listingPurpose', listingPurpose);

      return api.get<DiscoverListingsPage>(`/api/discover/listings?${params.toString()}`, { signal });
    },
    enabled: enabled && city.length > 0,
    staleTime: 60_000,
  });
}
