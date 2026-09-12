import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { snapBbox } from '@/lib/bboxUtils';
import { buildDiscoverSearchParams } from '@/lib/discoverSearchParams';
import { computeScopeFingerprint } from '@/features/discover/state/resultScope';
import type { ResultScope } from '@/features/discover/state/resultScope';

/**
 * Issue #2433 — the allowlisted Commercial fact set the backend projects onto
 * `DiscoverListingResponse`, mirrored field-for-field from Java's
 * `DiscoverCommercialFacts`.
 *
 * Every field is optional AND nullable: the record is `NON_NULL`-serialised, and
 * every underlying column is nullable with no backfill (V104) or lives on a typed
 * child table that may have no row (V102). Absence is the norm here, not the
 * exception — and it is HONEST absence, which is why the backend reads these with
 * `getObject(..., Class)` rather than `getInt`/`getDouble`: a SQL NULL must never
 * arrive as `0`, or "no seats recorded" becomes "0 seats".
 *
 * `floorChoice`/`floorMode` (V104 flat) and `floorNumber`/`totalFloors` (V102 typed
 * child) are the SAME logical fact in two storage locations; a listing authored
 * through one path reads null on the other. Both are carried deliberately — see
 * `resolveFloorFact` in `@/lib/commercialSummary`.
 */
export interface DiscoverCommercialFactsDto {
  floorChoice?: string | null;
  floorMode?: string | null;
  floorNumber?: number | null;
  totalFloors?: number | null;
  hubType?: string | null;
  officeSeats?: number | null;
  occupancyStatus?: string | null;
  warehouseClearHeightFt?: number | null;
  warehouseLoadingBays?: number | null;
  roadFrontageFt?: number | null;
  commercialZoning?: string | null;
}

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
  /**
   * Issue #1567 — public-safe trust badge word ("verified"/"trusted"/"listed"), or
   * null/absent when the listing has no badge (D tier, legacy rows, or unknown grade).
   * Never the raw internal letter grade — the backend never sends A/B/C/D on this field.
   */
  trustBadge?: 'verified' | 'trusted' | 'listed' | null;
  possessionStatus: string | null;
  sellerType: string | null;
  listingPurpose: string | null;
  status: string;
  /**
   * Issue #2431 — `SHOP` or `OFFICE` for a commercial listing whose subtype has been
   * declared; absent otherwise.
   *
   * Absence carries real information and must NOT be rendered as a subtype: it means
   * either "not a commercial listing" or "a legacy `property_type='commercial'` row
   * whose shop-vs-office distinction was never recorded". Callers separate the two
   * using `propertyType`, which is NOT NULL. Never guess between them.
   */
  commercialSubtype?: string | null;
  /**
   * Issue #2433 — the allowlisted Commercial facts a result card may summarise, or
   * absent when the listing carries none (which includes every non-Commercial one).
   */
  commercialFacts?: DiscoverCommercialFactsDto | null;
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
  /** Issue #2016 — the request's `scopeFingerprint` echoed back unchanged. */
  scopeFingerprint?: string | null;
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
  /**
   * Issue #1597 — optional area key filter for group-results state.
   * When non-empty, the backend returns ONLY listings whose area_key is in this set.
   * Sorted before use for stable cache keys. An empty array disables the fetch
   * (enabled guard) to prevent a whole-city leak or a backend 400 error.
   */
  areaKeys?: string[];
  /**
   * Issue #2087 — bounded local-scope Browse listings CTA.
   */
  nodeKey?: string | null;
  /**
   * Issue #2016 — the committed geography that owns this fetch's identity.
   * When VIEWPORT, its bounds are sent as the new `viewportScope` param
   * (distinct from `bbox`). A `scopeFingerprint` derived from
   * (resultScope, filters, listingPurpose) is always sent and included in
   * the query key, so a response answering a since-superseded scope lands
   * in its own (now-unread) cache entry instead of overwriting the current
   * one. Defaults to null — existing callers that predate this param keep
   * compiling and behaving identically.
   */
  resultScope?: ResultScope;
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
  areaKeys,
  nodeKey,
  resultScope = null,
}: UseDiscoverListingsParams) {
  // Snap bbox to grid for cache efficiency; null when not provided or contains non-finite values.
  const snapped: [number, number, number, number] | null =
    bbox != null && bbox.every(Number.isFinite) ? snapBbox(bbox) : null;

  const trimmedQ = q?.trim() || null;

  // Issue #2016 — see UseDiscoverListingsParams.resultScope's doc.
  const scopeFingerprint = computeScopeFingerprint(resultScope, filters, listingPurpose);
  const viewportScope = resultScope?.kind === 'VIEWPORT' ? resultScope.bounds : null;

  // Issue #1597 — sort areaKeys for stable cache keys; null when not in group-results mode.
  // Distinct key segment 'areaKeys' prevents collision with the existing ['discover-listings', ...]
  // key shape used when no areaKeys are provided.
  const sortedAreaKeys = areaKeys != null ? [...areaKeys].sort() : null;

  // Issue #1597 — empty-areaKeys guard: do NOT fire when the group has no member areas.
  // An empty areaKeys param sends HTTP 400 from the backend; omitting the param sends the
  // full city result set (whole-city leak). Both outcomes are wrong.
  const hasAreaKeysFilter = sortedAreaKeys !== null;
  const areaKeysEmpty = hasAreaKeysFilter && sortedAreaKeys.length === 0;
  const effectiveEnabled = enabled && city.length > 0 && !areaKeysEmpty;

  return useQuery<DiscoverListingsPage>({
    queryKey: [
      'discover-listings',
      city,
      page,
      size,
      filters,
      includeAggregates,
      snapped,
      trimmedQ,
      listingPurpose ?? null,
      // Issue #1597: include sorted areaKeys in query key for stable cache hits.
      // null when no areaKeys filter — distinct from [] (empty, fetch disabled).
      sortedAreaKeys,
      nodeKey,
      // Issue #2016 — part of the query key so a response for a
      // since-superseded scope can never land in the CURRENT scope's cache
      // entry (each distinct fingerprint gets its own entry).
      scopeFingerprint,
    ],
    queryFn: ({ signal }) => {
      const params = buildDiscoverSearchParams({
        city,
        filters,
        page,
        size,
        includeAggregates,
        snapped,
        sortedAreaKeys,
        trimmedQ,
        listingPurpose,
        nodeKey,
        scopeFingerprint,
        viewportScope,
      });

      return api.get<DiscoverListingsPage>(`/api/discover/listings?${params.toString()}`, { signal });
    },
    enabled: effectiveEnabled,
    staleTime: 60_000,
  });
}
