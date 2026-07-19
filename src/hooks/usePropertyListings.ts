import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { haversineKm } from '@/lib/geo';

/**
 * Minimum supported school-proximity radius (km). Matches the smallest value in
 * the RADIUS_OPTIONS control. A 0 km radius is not meaningful — haversine returns
 * > 0 for any listing not exactly collocated with the school — so it would filter
 * out essentially everything and present an unexplained empty state (issue #1210).
 */
export const MIN_SCHOOL_RADIUS_KM = 1;

/**
 * Normalise a school-radius value to a usable radius. Non-finite (NaN), zero, and
 * sub-minimum values are clamped up to MIN_SCHOOL_RADIUS_KM; valid radii (>= 1 km,
 * including 1/2/3/5) pass through unchanged. Used by every radius consumption point
 * (data filter, radius control, map circle) so they all reflect the same effective
 * radius. Does not impose an upper bound — larger radii remain valid.
 */
export function clampSchoolRadiusKm(radiusKm: number): number {
  return Number.isFinite(radiusKm) && radiusKm >= MIN_SCHOOL_RADIUS_KM
    ? radiusKm
    : MIN_SCHOOL_RADIUS_KM;
}

import type { PropertyType } from '@/lib/listing-constants';
export type { PropertyType };

export interface PropertyImage {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface PropertyListing {
  id: string;
  property_type: PropertyType;
  title: string | null;
  locality: string | null;
  price: number | null;
  price_unit: string | null;
  land_area: number | null;
  land_area_unit: string | null;
  built_area: number | null;
  built_area_unit: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  contact_info: string | null;
  contact_phone: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  confidence_score: number | null;
  language_detected: string | null;
  price_per_cent_paise: number | null;
  is_valid: boolean;
  is_duplicate: boolean;
  status: string | null;
  listing_number?: number;
  created_at: string;
  updated_at: string;
  rera_number?: string | null;
  raw_post_id: string | null;
  // Commercial & rent fields
  listing_purpose: string;
  carpet_area: number | null;
  carpet_area_unit: string | null;
  floor_number: number | null;
  total_floors: number | null;
  furnishing_status: string | null;
  washrooms: number | null;
  parking_count: number | null;
  road_frontage_ft: number | null;
  commercial_usage: string | null;
  number_of_units: number | null;
  monthly_rent: number | null;
  security_deposit_months: number | null;
  lock_in_months: number | null;
  seller_type: 'owner' | 'dealer' | 'broker' | 'builder' | null;
  // Fields added by Spring Boot ListingResponse (RE-104)
  firstPublishedAt?: string | null;
  lastUpdatedAt?: string | null;
  daysOnMarket?: number;
  backOnMarket?: boolean;
  isSuspectedDuplicate?: boolean;
  // Fields added by Spring Boot ListingResponse (RE-99)
  possessionStatus?: string | null;
  expectedPossessionDate?: string | null;
  /** Raw JSON string: {"building_plan":bool,"occupancy_certificate":bool,"local_authority_approval":bool} */
  approvalsDeclared?: string | null;
  /** Computed by backend: true when reraNumber is present and matches the expected format */
  reraValid?: boolean;
  /** Trust tier computed by backend: A, B, C, or D. Null for legacy rows pre-V46. */
  trustTier?: string | null;
  /** Composite area key e.g. "IN|KA|Udupi|Manipal". Added in PR #745. */
  areaKey?: string | null;
  /**
   * Issue #1941 — coarse price band string (e.g. "₹1–2Cr") returned for ANONYMOUS
   * residential callers in place of the exact price. Null/absent for authed callers
   * (who get exact `price`) and for listings with no price. Never fabricated —
   * mirrors the backend's priceBand contract (see DiscoverCityListingItem #1616).
   */
  priceBand?: string | null;
}

export interface PropertyFilters {
  propertyTypes?: PropertyType[];
  localities?: string[];
  /**
   * City filter — lowercase slug (e.g. 'udupi', 'bangalore', 'kundapur').
   * When set, listings whose areaKey is null OR whose city segment
   * (areaKey.split('|')[2]) does not match are excluded. This is intentional:
   * listings without a populated areaKey have no city attribution and must not
   * appear in per-city UI (e.g. Discover locality chips).
   * Do NOT add a sparse-coverage fallback — cross-city data is worse than empty.
   * Requires areaKey to be populated for all LIVE listings in the target city.
   */
  city?: string;
  priceMin?: number;
  priceMax?: number;
  dateFrom?: Date;
  dateTo?: Date;
  /** BHK values: 1, 2, 3, or 4 (meaning 4+) */
  bedrooms?: number[];
  /** Filter by seller type: 'owner', 'broker', 'builder' */
  sellerTypes?: string[];
  /**
   * @deprecated No-op. The list endpoint does not include price history data, so this filter
   * cannot be evaluated client-side. Do not expose in the UI until price history is added to
   * the list response. The no-op branch in usePropertyListings is intentional.
   */
  priceReduced?: boolean;
  /** Client-side: show only listings where backOnMarket === true */
  backOnMarket?: boolean;
  /** Client-side: show only listings where daysOnMarket <= 7 */
  newToMarket?: boolean;
  /** Client-side: show only listings where reraNumber is non-null and non-empty */
  reraRegistered?: boolean;
  /** Client-side: show only listings where possessionStatus === 'ready_to_move' */
  readyToMove?: boolean;
  /** Draw-on-map polygon: array of [lat, lng] pairs. When set, queries the backend PostGIS endpoint. */
  polygon?: [number, number][];
  /** School proximity filter: center latitude of the selected school */
  schoolLat?: number;
  /** School proximity filter: center longitude of the selected school */
  schoolLon?: number;
  /** School proximity filter: radius in km (default 2) */
  schoolRadiusKm?: number;
  /**
   * School board filters for the school journey — comma-serialized in URL as `board`.
   * Passed through to useDiscoverUrlState.setFiltersLive; not evaluated by usePropertyListings.
   * Examples: ['cbse', 'icse']
   */
  boardFilters?: string[];
  /**
   * School category filters for the school journey — comma-serialized in URL as `category`.
   * Passed through to useDiscoverUrlState.setFiltersLive; not evaluated by usePropertyListings.
   * Examples: ['primary', 'secondary']
   */
  categoryFilters?: string[];
}

export interface PropertyListingWithImages extends PropertyListing {
  raw_posts?: {
    images: PropertyImage[] | null;
  } | null;
}

// ---- Polygon search (Spring Boot backend) ----

/** Shape returned by GET /api/public/listings/within-polygon */
interface PolygonListingResponse {
  id: string;
  listingNumber: number | null;
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
  firstImageUrl: string | null;
  imageCount: number;
  createdAt: string;
  updatedAt: string;
  sellerType: string | null;
  listingPurpose: string | null;
  reraNumber: string | null;
  daysOnMarket: number;
  backOnMarket: boolean;
  lastUpdatedAt: string | null;
  firstPublishedAt: string | null;
  possessionStatus: string | null;
  reraValid: boolean;
  trustTier: string | null;
  areaKey?: string | null;
}

interface PolygonPageResponse {
  items: PolygonListingResponse[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

/** Maps backend camelCase ListingResponse to frontend snake_case PropertyListing. */
function polygonResponseToListing(r: PolygonListingResponse): PropertyListing & { images: PropertyImage[] } {
  const images: PropertyImage[] = r.firstImageUrl ? [{ url: r.firstImageUrl }] : [];
  return {
    id: r.id,
    property_type: r.propertyType as PropertyType,
    title: r.title,
    locality: r.locality,
    price: r.price !== null ? Number(r.price) : null,
    price_unit: 'INR',
    land_area: r.landArea !== null ? Number(r.landArea) : null,
    land_area_unit: r.landAreaUnit,
    built_area: r.builtArea !== null ? Number(r.builtArea) : null,
    built_area_unit: r.builtAreaUnit,
    bedrooms: r.bedrooms,
    bathrooms: null,
    contact_info: null,
    contact_phone: null,
    description: r.description,
    latitude: r.latitude,
    longitude: r.longitude,
    confidence_score: null,
    language_detected: null,
    price_per_cent_paise: null,
    is_valid: true,
    is_duplicate: false,
    status: r.status,
    listing_number: r.listingNumber ?? undefined,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    rera_number: r.reraNumber,
    raw_post_id: null,
    listing_purpose: r.listingPurpose ?? 'sale',
    carpet_area: null,
    carpet_area_unit: null,
    floor_number: null,
    total_floors: null,
    furnishing_status: null,
    washrooms: null,
    parking_count: null,
    road_frontage_ft: null,
    commercial_usage: null,
    number_of_units: null,
    monthly_rent: null,
    security_deposit_months: null,
    lock_in_months: null,
    seller_type: r.sellerType as PropertyListing['seller_type'],
    firstPublishedAt: r.firstPublishedAt,
    lastUpdatedAt: r.lastUpdatedAt,
    daysOnMarket: r.daysOnMarket,
    backOnMarket: r.backOnMarket,
    possessionStatus: r.possessionStatus,
    reraValid: r.reraValid,
    trustTier: r.trustTier,
    areaKey: r.areaKey ?? null,
    images,
  };
}

export async function fetchPolygonListings(polygon: [number, number][]): Promise<(PropertyListing & { images: PropertyImage[] })[]> {
  const polygonParam = JSON.stringify(polygon);
  // Fetch up to 200 results (backend max page size) — polygon search is spatial, no further pagination in the UI for now
  const data = await api.get<PolygonPageResponse>(
    `/api/public/listings/within-polygon?polygon=${encodeURIComponent(polygonParam)}&size=200`,
    { skipAuth: true },
  );
  return data.items.map(polygonResponseToListing);
}

export function usePropertyListings(filters?: PropertyFilters) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['property-listings', user?.id ?? null, filters],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      // When a polygon is drawn, use the backend PostGIS endpoint
      if (filters?.polygon && filters.polygon.length >= 3) {
        return fetchPolygonListings(filters.polygon);
      }

      let query = supabase
        .from('property_listings')
        .select('*, raw_posts(images)')
        .eq('is_valid', true)
        .eq('is_duplicate', false)
        .order('created_at', { ascending: false });

      if (filters?.propertyTypes && filters.propertyTypes.length > 0) {
        query = query.in('property_type', filters.propertyTypes);
      }

      if (filters?.localities && filters.localities.length > 0) {
        query = query.in('locality', filters.localities);
      }

      if (filters?.priceMin !== undefined) {
        query = query.gte('price', filters.priceMin);
      }

      if (filters?.priceMax !== undefined) {
        query = query.lte('price', filters.priceMax);
      }

      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom.toISOString());
      }

      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo.toISOString());
      }

      if (filters?.sellerTypes && filters.sellerTypes.length > 0) {
        query = query.in('seller_type', filters.sellerTypes);
      }

      if (filters?.bedrooms && filters.bedrooms.length > 0) {
        const has4Plus = filters.bedrooms.includes(4);
        const exactValues = filters.bedrooms.filter((b) => b < 4);
        if (has4Plus && exactValues.length > 0) {
          query = query.or(`bedrooms.in.(${exactValues.join(',')}),bedrooms.gte.4`);
        } else if (has4Plus) {
          query = query.gte('bedrooms', 4);
        } else {
          query = query.in('bedrooms', exactValues);
        }
      }

      const { data, error } = await query.limit(2000);

      if (error) throw error;

      // Transform to include images at the listing level
      let results = (data as unknown as PropertyListingWithImages[]).map(listing => {
        const rawImages = listing.raw_posts?.images;
        const images: PropertyImage[] = Array.isArray(rawImages) ? rawImages : [];
        return {
          ...listing,
          images,
        };
      }) as (PropertyListing & { images: PropertyImage[] })[];

      // Client-side filters for fields sourced from Spring Boot API
      if (filters?.backOnMarket) {
        results = results.filter((l) => l.backOnMarket === true);
      }
      if (filters?.newToMarket) {
        results = results.filter((l) => typeof l.daysOnMarket === 'number' && l.daysOnMarket > 0 && l.daysOnMarket <= 7);
      }
      if (filters?.priceReduced) {
        // No price history data on the list response; skip silently (filter is a no-op here)
        // The ListingDetail page shows actual price history per-listing.
      }
      if (filters?.reraRegistered) {
        results = results.filter((l) => l.rera_number != null && l.rera_number !== '');
      }
      if (filters?.readyToMove) {
        results = results.filter((l) => l.possessionStatus === 'ready_to_move');
      }

      // School proximity filter: haversine distance from school center.
      // Issue #1210: use `!= null` (not truthiness) so radiusKm=0 is not silently
      // skipped, and clamp sub-minimum/non-finite radii to MIN_SCHOOL_RADIUS_KM so a
      // 0 km value yields normal min-radius results instead of an unexplained empty set.
      if (filters?.schoolLat != null && filters?.schoolLon != null && filters?.schoolRadiusKm != null) {
        const schoolLat = filters.schoolLat;
        const schoolLon = filters.schoolLon;
        const radiusKm = clampSchoolRadiusKm(filters.schoolRadiusKm);
        results = results.filter((l) => {
          if (l.latitude == null || l.longitude == null) return false;
          return haversineKm(schoolLat, schoolLon, l.latitude, l.longitude) <= radiusKm;
        });
      }

      // City filter: scope listings to the selected city using the area_key format.
      // area_key format: country|region|city|locality (e.g. IN|KA|Udupi|Manipal).
      // Listings with null areaKey are intentionally excluded — they have no city
      // attribution and including them would re-introduce cross-city UI leakage.
      // Do NOT copy the sparse-coverage fallback from useLocalities here: for Discover
      // chips, returning nothing is correct; returning wrong-city data is not.
      if (filters?.city) {
        const targetCity = filters.city.toLowerCase();
        results = results.filter((l) => {
          if (!l.areaKey) return false;
          const parts = l.areaKey.split('|');
          return (parts[2] ?? '').toLowerCase() === targetCity;
        });
      }

      return results;
    },
  });
}

export interface LocalityOption {
  locality: string;
  areaKey: string | null;
}

export function useLocalities(city?: string) {
  return useQuery({
    queryKey: ['localities', city],
    queryFn: async (): Promise<LocalityOption[]> => {
      const { data, error } = await supabase
        .from('property_listings')
        .select('locality, area_key')
        .eq('is_valid', true)
        .not('locality', 'is', null);

      if (error) throw error;

      // Filter by city if provided (area_key format: country|region|city|locality)
      let filtered = data;
      if (city) {
        filtered = data.filter((d) => {
          if (!d.area_key) return false;
          const parts = d.area_key.split('|');
          const areaCity = (parts[2] ?? '').toLowerCase();
          return areaCity === city.toLowerCase();
        });
        // Fallback: if area_key coverage is poor (< 10% of data), skip city filtering
        if (filtered.length < data.length * 0.1) {
          filtered = data;
        }
      }

      // Deduplicate by locality name, preserving first non-null area_key seen
      const seen = new Map<string, string | null>();
      for (const d of filtered) {
        if (!d.locality) continue;
        if (!seen.has(d.locality)) {
          seen.set(d.locality, d.area_key ?? null);
        } else if (seen.get(d.locality) === null && d.area_key) {
          seen.set(d.locality, d.area_key);
        }
      }

      return [...seen.entries()]
        .map(([locality, areaKey]) => ({ locality, areaKey }))
        .sort((a, b) => a.locality.localeCompare(b.locality));
    },
  });
}

export function usePriceRange() {
  return useQuery({
    queryKey: ['price-range'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_listings')
        .select('price')
        .eq('is_valid', true)
        .not('price', 'is', null)
        .order('price', { ascending: true });

      if (error) throw error;

      const prices = data.map((d) => d.price).filter((p): p is number => p !== null);
      
      if (prices.length === 0) {
        return { min: 0, max: 10000000 };
      }

      return {
        min: prices[0],
        max: prices[prices.length - 1],
      };
    },
  });
}

export function useUpdateListing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PropertyListing> }) => {
      const { data, error } = await supabase
        .from('property_listings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-listings'] });
      toast({
        title: 'Listing Updated',
        description: 'The property listing has been updated successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function usePropertyImages(rawPostId: string | null) {
  return useQuery({
    queryKey: ['property-images', rawPostId],
    queryFn: async () => {
      if (!rawPostId) return [];

      const { data, error } = await supabase
        .from('raw_posts')
        .select('images')
        .eq('id', rawPostId)
        .single();

      if (error) throw error;

      // Parse images from JSONB - need to cast through unknown due to Json type
      const images = (data?.images as unknown) as PropertyImage[] | null;
      return Array.isArray(images) ? images : [];
    },
    enabled: !!rawPostId,
  });
}

// ---- Anonymous teaser discovery ----

/** Minimal listing shape returned by GET /api/public/listings/discovery.
 *  Deliberately omits sensitive fields (lat/lon, address, contact). */
export interface TeaserListing {
  id: string;
  primaryImageUrl: string | null;
  /** Total number of images, including those behind the auth gate. */
  imageCount: number;
  /** Price in rupees (backend serialises BigDecimal as number). */
  price: number | null;
  propertyType: string | null;
  locality: string | null;
  listingPurpose: string | null;
}

interface TeaserPageResponse {
  items: TeaserListing[];
}

async function fetchTeaserListings(page = 0, size = 50): Promise<TeaserListing[]> {
  try {
    const data = await api.get<TeaserPageResponse>(
      `/api/public/listings/discovery?page=${page}&size=${size}`,
      { skipAuth: true },
    );
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) {
      return [];
    }
    throw err;
  }
}

export function useTeaserListings() {
  return useQuery({
    queryKey: ['teaser-listings'] as const,
    queryFn: () => fetchTeaserListings(),
    staleTime: 60_000,
  });
}