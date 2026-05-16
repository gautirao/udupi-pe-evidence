import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface SchoolResult {
  id: string;
  name: string;
  /** Canonical board column added in V68; null for legacy rows. */
  board: string | null;
  /** Legacy column — kept for backward compatibility with older rows. Null for Kaggle-sourced rows. */
  boardType: string | null;
  latitude: number;
  longitude: number;
  address: string;
  distanceKm: number;
  /** Count of property listings within 1 km. Populated for /popular responses; null for other endpoints. */
  nearbyListingCount?: number | null;
}

export interface NearbySchoolsResponse {
  count: number;
  schools: SchoolResult[];
}

const SCHOOL_SEARCH_KEY = ['school-search'] as const;
const SCHOOL_BY_ID_KEY = ['school-by-id'] as const;
const NEARBY_SCHOOLS_KEY = ['nearby-schools'] as const;

/**
 * Debounced autocomplete search for schools.
 * Enabled only when query is at least 2 characters.
 */
export function useSchoolSearch(query: string) {
  return useQuery({
    queryKey: [...SCHOOL_SEARCH_KEY, query],
    queryFn: () =>
      api.get<SchoolResult[]>(
        `/api/public/schools/search?q=${encodeURIComponent(query)}&limit=10`,
        { skipAuth: true },
      ),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });
}

/**
 * Fetch a single school by ID for cold-load URL restoration.
 * Distinct query key from useSchoolSearch to avoid cache collision.
 * Uses the ID-based endpoint, not the substring search endpoint, so the lookup is exact.
 * retry: false — if the school is deleted (404), fail fast and let the caller clean up the URL param.
 */
export function useSchoolById(id: string | null) {
  return useQuery({
    queryKey: [...SCHOOL_BY_ID_KEY, id],
    queryFn: () =>
      api.get<SchoolResult>(
        `/api/public/schools/${id}`,
        { skipAuth: true },
      ),
    enabled: !!id && id.trim().length > 0,
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * Fetches schools near a specific listing.
 * Used on the ListingDetail page.
 */
export function useNearbySchools(listingId: string | undefined, radiusKm: number = 2) {
  return useQuery({
    queryKey: [...NEARBY_SCHOOLS_KEY, listingId, radiusKm],
    queryFn: () =>
      api.get<NearbySchoolsResponse>(
        `/api/public/listings/${listingId}/nearby-schools?radiusKm=${radiusKm}`,
        { skipAuth: true },
      ),
    enabled: !!listingId,
    staleTime: 60_000,
  });
}

/**
 * Fetches schools near a lat/lon point (used for map circle overlay when a school is selected).
 */
export function useSchoolsNearPoint(lat: number | undefined, lon: number | undefined, radiusKm: number = 2) {
  return useQuery({
    queryKey: ['schools-near-point', lat, lon, radiusKm],
    queryFn: () =>
      api.get<SchoolResult[]>(
        `/api/public/schools/nearby?lat=${lat}&lon=${lon}&radiusKm=${radiusKm}`,
        { skipAuth: true },
      ),
    enabled: lat != null && lon != null,
    staleTime: 60_000,
  });
}
