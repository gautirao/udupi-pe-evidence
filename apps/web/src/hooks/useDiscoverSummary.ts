import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDiscoverSource } from '@/features/discover/state/DiscoverDataSourceContext';

export type DiscoverSummaryGroupBy = 'area_group' | 'corridor';

/** Issue #1745 P5-addendum — buy/rent filter values accepted by GET /api/discover/summary. */
export type DiscoverSummaryListingPurpose = 'sale' | 'rent';

export interface DiscoverSummaryParams {
  city: string;
  propertyType?: string;
  groupBy?: DiscoverSummaryGroupBy;
  hotspotLimit?: number;
  /**
   * Issue #1745 P5-addendum / P7 — buy ("sale") vs rent ("rent") filter.
   * Independent of `propertyType` (never conflated — see backend SummaryQuery):
   * `propertyType` filters on the kind of property (apartment/house/...), while
   * `listingPurpose` filters on whether the listing is for sale or for rent.
   * Included in the query key so toggling Buy/Rent triggers a real refetch.
   */
  listingPurpose?: DiscoverSummaryListingPurpose;
}

export interface DiscoverSummaryRegion {
  regionKey: string;
  regionLabel: string;
  listingCount: number;
}

export interface DiscoverSummaryHotspot {
  areaKey: string;
  name: string;
  listingCount: number;
  geoCenterLat: number;
  geoCenterLon: number;
}

export interface DiscoverSummaryResponse {
  city: string;
  propertyType: string | null;
  groupBy: string;
  totalActiveListings: number;
  regions: DiscoverSummaryRegion[];
  hotspots: DiscoverSummaryHotspot[];
  generatedAt: string;
  /**
   * Issue #2419 (PR-2) — whether this city has a VALID canonical CITY
   * boundary, so the "Draw search area" entry can be hidden where a drawn
   * polygon could never be accepted.
   *
   * `PolygonGeographicSafetyPolicy` fails closed when a city has no VALID
   * CITY row, so without this the shopper only finds out AFTER drawing.
   *
   * OPTIONAL on purpose. A cached response from before this field shipped, or
   * a preview/sandbox backend that predates it, deserialises with the key
   * absent — and `undefined` must NOT read as `false`, which would hide a
   * working feature. Consumers pass it straight to
   * `resolveDrawSearchAreaEligibility`, which suppresses the entry only on an
   * explicit `false`.
   */
  polygonSearchAvailable?: boolean;
}

const DEFAULT_HOTSPOT_LIMIT = 8;
const MIN_HOTSPOT_LIMIT = 1;
const MAX_HOTSPOT_LIMIT = 20;

function clampHotspotLimit(hotspotLimit?: number): number {
  if (hotspotLimit === undefined || Number.isNaN(hotspotLimit)) {
    return DEFAULT_HOTSPOT_LIMIT;
  }
  return Math.min(MAX_HOTSPOT_LIMIT, Math.max(MIN_HOTSPOT_LIMIT, Math.trunc(hotspotLimit)));
}

/**
 * Fetch the aggregate Discover summary (region counts + hotspots) for a city.
 *
 * Consumed by the Discover landing (GuidedEntryPanel, Issue #1745 P7) to render
 * backend-owned macro-region counts — no client-side aggregation of listings.
 */
export function useDiscoverSummary({
  city,
  propertyType,
  groupBy,
  hotspotLimit,
  listingPurpose,
}: DiscoverSummaryParams) {
  const trimmedPropertyType = propertyType?.trim();
  const trimmedListingPurpose = listingPurpose?.trim();
  const effectiveHotspotLimit = clampHotspotLimit(hotspotLimit);
  const source = useDiscoverSource();

  return useQuery<DiscoverSummaryResponse>({
    queryKey: [
      'discover-summary',
      source.mode,
      city,
      trimmedPropertyType ?? null,
      groupBy ?? 'area_group',
      effectiveHotspotLimit,
      trimmedListingPurpose ?? null,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('city', city);
      if (trimmedPropertyType) {
        params.set('propertyType', trimmedPropertyType);
      }
      if (groupBy) {
        params.set('groupBy', groupBy);
      }
      params.set('hotspotLimit', String(effectiveHotspotLimit));
      if (trimmedListingPurpose) {
        params.set('listingPurpose', trimmedListingPurpose);
      }

      return api.get<DiscoverSummaryResponse>(`/api/discover/summary?${params.toString()}`, {
        skipAuth: true,
      });
    },
    enabled: city.trim().length > 0 && source.mode !== 'preview',
    staleTime: 300_000,
  });
}
