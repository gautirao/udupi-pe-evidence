import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { buildDiscoverSearchParams } from '@/lib/discoverSearchParams';
import { useDiscoverSource, discoverKey } from '@/features/discover/state/DiscoverDataSourceContext';

/** The fixed relaxation vocabulary, mirroring `RelaxationPreview.Kind` on the server. */
export type RelaxationKind = 'PRICE_MAX' | 'READY_TO_MOVE' | 'BEDROOMS' | 'PROPERTY_TYPES';

/**
 * One deterministic single-filter relaxation offer. Exactly one of the patch fields below is
 * present, selected by `kind`, and it carries the FULL resulting value for that filter — never a
 * delta — so applying it is an explicit assignment rather than an inferred edit.
 *
 * An EMPTY `bedrooms` / `propertyTypes` array means "clear that filter entirely", never
 * "match nothing" — see `applyRelaxationPreview`.
 */
export interface RelaxationPreview {
  kind: RelaxationKind;
  /** Real count of listings that match once this ONE change is applied. Always > 0. */
  resultingCount: number;
  /** PRICE_MAX only. The new maximum, in RUPEES (same unit as `PropertyFilters.priceMax`). */
  priceMax?: number;
  /** READY_TO_MOVE only. Always `false` — the constraint is dropped, never inverted. */
  readyToMove?: boolean;
  /** BEDROOMS only. The new bedroom set; `[]` clears the filter. */
  bedrooms?: number[];
  /** PROPERTY_TYPES only. The new property-type set; `[]` clears the filter. */
  propertyTypes?: string[];
}

export interface RelaxationPreviewsResponse {
  city: string;
  /** The scope keys the counts were computed over, echoed back by the server. */
  areaKeys: string[];
  /** Matches under the current, unrelaxed filters — normally 0 on this surface. */
  baselineCount: number;
  previews: RelaxationPreview[];
}

/**
 * Issue #2018 (slice 2) — deterministic filter-relaxation count previews for the zero-result
 * recovery panel, backed by `GET /api/discover/areas/relaxation-previews`
 * (`RelaxationPreviewsController`).
 *
 * Every count is computed server-side from the same predicate builder the listings and markers
 * endpoints use, so a previewed number cannot disagree with what the shopper sees after applying
 * it. Callers must NOT re-rank, re-filter or re-label the counts.
 *
 * ## Stale-response guard
 *
 * `filters` and the sorted `areaKeys` are both part of the query key. A response computed for an
 * older filter/scope state is therefore cached under a DIFFERENT key and can never be read back as
 * the current key's `data` — a late-arriving reply cannot overwrite a newer one. This is why the
 * guard is structural rather than a hand-rolled request-sequence counter: there is no code path in
 * which `data` belongs to a filter state other than the one currently being asked about, which is
 * also what makes it safe for `relaxationLabel` to diff a preview against the live `filters`.
 *
 * @param city - City slug. Empty string disables the query.
 * @param areaKeys - Committed AREA / AREA_SET canonical keys. Empty disables the query: a
 *   VIEWPORT or POLYGON scope has no area keys, and this endpoint must not answer for a scope the
 *   shopper did not select.
 * @param filters - Active discover filters, serialized exactly as the listings query serializes
 *   them (`buildDiscoverSearchParams`).
 * @param limit - Optional max previews; server default 4, clamped [1,6].
 *
 * LIVE MODE ONLY, for the same reason as `useNearbyAreaCandidates`: there is no admin
 * city-launch-preview counterpart for this endpoint, so an empty result is the correct behaviour
 * on the preview surface rather than a wrong-endpoint call.
 */
export function useRelaxationPreviews(
  city: string,
  areaKeys: string[],
  filters: PropertyFilters,
  limit?: number,
) {
  const source = useDiscoverSource();
  // Sorted so key REORDERING (removing then re-adding an area in a different order) does not
  // spuriously invalidate the cache — same rule as useNearbyAreaCandidates.
  const sortedAreaKeys = [...areaKeys].sort();

  return useQuery<RelaxationPreviewsResponse>({
    queryKey: discoverKey(
      source,
      'discover-relaxation-previews',
      city,
      sortedAreaKeys,
      filters,
      limit ?? null,
    ),
    queryFn: () => {
      const params = buildDiscoverSearchParams({ city, filters });
      sortedAreaKeys.forEach((areaKey) => params.append('areaKeys', areaKey));
      if (limit != null) {
        params.set('limit', String(limit));
      }
      const path = `/api/discover/areas/relaxation-previews?${params.toString()}`;
      return api.get<RelaxationPreviewsResponse>(path, { skipAuth: true });
    },
    enabled: city.length > 0 && sortedAreaKeys.length > 0 && source.mode === 'live',
    // Matches useNearbyAreaCandidates: short enough to react promptly to a filter change while the
    // recovery panel is open, rather than pinning a stale suggestion.
    staleTime: 30_000,
  });
}
