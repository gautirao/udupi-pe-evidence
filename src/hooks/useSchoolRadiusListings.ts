import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

/**
 * Issue #1261 — anonymous school-radius listings.
 *
 * The merged public endpoint
 *   GET /api/discover/cities/{city}/school-radius-listings
 * returns LIVE listings within a radius of a school's coordinates that can span
 * MULTIPLE area boundaries (server-side ST_DWithin), giving anonymous users the
 * cross-area result the auth path already gets — without exposing auth-only fields.
 *
 * The response carries exactly 20 anon-safe fields (see PublicSchoolRadiusListingCard).
 * Fields excluded server-side (trustTier, reraNumber, reraValid, sellerType, status,
 * updatedAt, lastUpdatedAt, firstPublishedAt) are NEVER serialized — the UI must not
 * render or rely on them.
 *
 * Issue #1616: the `pricePaise` field on this endpoint was RENAMED to `priceBand` (a
 * coarse band string, e.g. "₹50L–1Cr"). This endpoint is anon-only; there is no authed
 * variant. `priceBand` is absent when the DB price is null.
 */
export interface PublicSchoolRadiusListingCard {
  id: string;
  listingNumber?: number | null;
  propertyType?: string | null;
  title?: string | null;
  locality?: string | null;
  areaKey?: string | null;
  /** Issue #1616: renamed from pricePaise — this endpoint is anon-only and returns a coarse band. */
  priceBand?: string | null;
  landArea?: number | null;
  landAreaUnit?: string | null;
  builtArea?: number | null;
  builtAreaUnit?: string | null;
  bedrooms?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  heroImageUrl?: string | null;
  listingPurpose?: string | null;
  possessionStatus?: string | null;
  daysOnMarket?: number | null;
  backOnMarket?: boolean | null;
  createdAt?: string | null;
}

/**
 * size+1 probe page — there is intentionally NO total count. `hasMore` signals that
 * additional listings exist beyond the requested page (used for a non-blocking
 * "showing first N" hint; no load-more UI in this slice — Issue #1261 DECISION-2).
 */
export interface PublicSchoolRadiusListingsPage {
  content: PublicSchoolRadiusListingCard[];
  page: number;
  size: number;
  hasMore: boolean;
}

export interface UseSchoolRadiusListingsParams {
  city: string;
  /** School latitude. Hook is disabled when null/undefined (AC4). */
  schoolLat: number | null | undefined;
  /** School longitude. Hook is disabled when null/undefined (AC4). */
  schoolLon: number | null | undefined;
  /** Radius in km. Server clamps to [0, 10]; we pass the already-clamped value. */
  schoolRadiusKm?: number | null;
  /** 0-indexed page. Defaults to 0 (single page — DECISION-2). */
  page?: number;
  /** Page size. Defaults to 50; server clamps to [1, 50]. */
  size?: number;
  /** Extra disable switch (e.g. only run on the anon path). */
  enabled?: boolean;
  /** Issue #1494 — buy/rent intent mapped to listingPurpose for the backend. */
  listingPurpose?: string;
}

/**
 * DiscoverCityListingItem plus the three anon-contract fields that drive the
 * client-side boolean PropertyFilters (DECISION-1) but are not part of the base
 * DiscoverCityListingItem shape. Kept as a superset so consumers that expect a
 * DiscoverCityListingItem (right panel, map) are unaffected.
 */
export type SchoolRadiusListingItem = DiscoverCityListingItem & {
  daysOnMarket?: number | null;
  backOnMarket?: boolean | null;
  possessionStatus?: string | null;
  areaKey?: string | null;
};

/**
 * Map a PublicSchoolRadiusListingCard into the DiscoverCityListingItem shape the
 * school-first right panel + map already consume (AC5).
 *
 *   heroImageUrl → primaryImageUrl
 *   latitude     → lat AND latitude (both populated for downstream consumers)
 *   longitude    → lon AND longitude
 *   priceBand    → priceBand (carried as-is; pricePaise is not present on this endpoint)
 *
 * Optional fields not present in the 20-field contract (bathrooms, totalFloors,
 * parkingCount, furnishingStatus, trustTier) are left undefined — PropertyCard
 * tolerates their absence, and trustTier undefined means the trust badge simply
 * does not render (AC6). daysOnMarket/backOnMarket/possessionStatus ARE in the
 * contract and are carried for client-side filter parity.
 *
 * Issue #1616: pricePaise was renamed to priceBand on this endpoint. The mapping now
 * carries priceBand into DiscoverCityListingItem.priceBand (no pricePaise mapping).
 */
export function mapSchoolRadiusCard(
  c: PublicSchoolRadiusListingCard,
): SchoolRadiusListingItem {
  return {
    id: c.id,
    propertyType: c.propertyType ?? undefined,
    title: c.title ?? null,
    locality: c.locality ?? undefined,
    priceBand: c.priceBand ?? undefined,
    primaryImageUrl: c.heroImageUrl ?? null,
    listingPurpose: c.listingPurpose ?? undefined,
    bedrooms: c.bedrooms ?? null,
    builtArea: c.builtArea ?? null,
    builtAreaUnit: c.builtAreaUnit ?? null,
    landArea: c.landArea ?? null,
    landAreaUnit: c.landAreaUnit ?? null,
    createdAt: c.createdAt ?? null,
    lat: c.latitude ?? null,
    lon: c.longitude ?? null,
    latitude: c.latitude ?? null,
    longitude: c.longitude ?? null,
    // Anon-contract fields used only for client-side filter parity.
    daysOnMarket: c.daysOnMarket ?? null,
    backOnMarket: c.backOnMarket ?? null,
    possessionStatus: c.possessionStatus ?? null,
    areaKey: c.areaKey ?? null,
  };
}

const QUERY_KEY_BASE = ['discover', 'school-radius-listings'] as const;

/**
 * Fetch anon-safe listings within a school radius (cross-area). Calls the PUBLIC
 * endpoint with `skipAuth: true` (no Authorization header — AC4), mirroring
 * useDiscoverCityListings. Disabled when coordinates are null (AC4) or when the
 * caller passes `enabled: false` (e.g. authenticated users use the existing path).
 */
export function useSchoolRadiusListings({
  city,
  schoolLat,
  schoolLon,
  schoolRadiusKm,
  page = 0,
  size = 50,
  enabled = true,
  listingPurpose,
}: UseSchoolRadiusListingsParams) {
  const hasCoords = schoolLat != null && schoolLon != null;

  return useQuery<PublicSchoolRadiusListingsPage>({
    queryKey: [
      ...QUERY_KEY_BASE,
      city,
      schoolLat ?? null,
      schoolLon ?? null,
      schoolRadiusKm ?? null,
      page,
      size,
      listingPurpose ?? null,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('schoolLat', String(schoolLat));
      params.set('schoolLon', String(schoolLon));
      if (schoolRadiusKm != null) params.set('schoolRadiusKm', String(schoolRadiusKm));
      params.set('page', String(page));
      params.set('size', String(size));
      if (listingPurpose != null) params.set('listingPurpose', listingPurpose);
      return api.get<PublicSchoolRadiusListingsPage>(
        `/api/discover/cities/${encodeURIComponent(city)}/school-radius-listings?${params.toString()}`,
        { skipAuth: true },
      );
    },
    enabled: enabled && city.length > 0 && hasCoords,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
