import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { buildDiscoverSearchParams } from '@/lib/discoverSearchParams';
import { useDiscoverSource, discoverKey } from '@/features/discover/state/DiscoverDataSourceContext';
import { useAuth } from '@/contexts/AuthContext';
import type { ResultScope } from '@/features/discover/state/resultScope';

/** The fixed relaxation vocabulary, mirroring `RelaxationPreview.Kind` on the server. */
export type RelaxationKind = 'PRICE_MAX' | 'READY_TO_MOVE' | 'BEDROOMS' | 'PROPERTY_TYPES';

/** Mirrors `RelaxationScope.Kind` on the server. */
export type RelaxationScopeKind = 'AREA_SET' | 'POLYGON' | 'VIEWPORT';

/**
 * The committed result scope the counts are asked for (#2454). Structurally the #2016
 * `ResultScope` union, so a caller hands over `nav.resultScope.active` (or the single-area
 * equivalent) rather than re-encoding it. `null` disables the query.
 */
export type RelaxationPreviewScope = ResultScope;

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
  /**
   * Which scope kind the counts were computed over, echoed back by the server (#2454). The
   * server half of the stale-response guard: a POLYGON zero state must never render a reply
   * that says `AREA_SET`.
   */
  scopeKind: RelaxationScopeKind;
  /** The scope keys the counts were computed over, echoed back. Empty for POLYGON/VIEWPORT. */
  areaKeys: string[];
  /** Matches under the current, unrelaxed filters — normally 0 on this surface. */
  baselineCount: number;
  previews: RelaxationPreview[];
}

const AREAS_PATH = '/api/discover/areas/relaxation-previews';
/**
 * The authenticated POLYGON sibling (#2454). Deliberately under `/api/discover/listings/`, the
 * prefix of the AUTHENTICATED listings query: it has no permitAll entry, so an anonymous call is
 * a 401 by construction. This hook never issues that call while signed out (see `enabled`).
 */
const POLYGON_PATH = '/api/discover/listings/relaxation-previews';

/**
 * Order-independent key payload per scope kind, so an AREA_SET whose keys were removed and
 * re-added in a different order shares one cache entry (same rule as useNearbyAreaCandidates),
 * while the `kind` discriminant keeps the three scope kinds from ever colliding.
 */
function scopeKeyPayload(scope: RelaxationPreviewScope): unknown {
  if (!scope) return null;
  switch (scope.kind) {
    case 'AREA_SET':
      return { kind: 'AREA_SET', areaKeys: [...scope.areaKeys].sort() };
    case 'POLYGON':
      return { kind: 'POLYGON', coordinates: scope.coordinates };
    case 'VIEWPORT':
      return { kind: 'VIEWPORT', bounds: scope.bounds };
  }
}

/**
 * Issue #2018 (slice 2) — deterministic filter-relaxation count previews for the zero-result
 * recovery panel. Issue #2454 (slice 4) made it scope-aware: it takes the committed
 * `ResultScope` instead of bare area keys.
 *
 * Every count is computed server-side from the same predicate builder the listings and markers
 * endpoints use, applied to the SAME scope clause the listings query applies, so a previewed
 * number cannot disagree with what the shopper sees after applying it. Callers must NOT
 * re-rank, re-filter or re-label the counts.
 *
 * ## Which endpoint
 *
 * - `AREA_SET` → `GET /api/discover/areas/relaxation-previews?areaKeys=…` (public, unchanged).
 * - `VIEWPORT` → the same public endpoint with `viewportScope=s,w,n,e` (#2015 encoding).
 * - `POLYGON`  → `GET /api/discover/listings/relaxation-previews?polygon=…` (authenticated).
 *   Polygon search is signed-in-only for MVP and there is no anonymous polygon path, so this
 *   query is DISABLED while signed out rather than issued and 401'd — a signed-out shopper under
 *   a drawn area gets no relaxation rows, which is the honest answer, not an error.
 *
 * ## Stale-response guard
 *
 * `filters` and the scope payload are both part of the query key. A response computed for an
 * older filter/scope state is therefore cached under a DIFFERENT key and can never be read back
 * as the current key's `data` — a late-arriving reply cannot overwrite a newer one. This is why
 * the guard is structural rather than a hand-rolled request-sequence counter: there is no code
 * path in which `data` belongs to a filter state other than the one currently being asked about,
 * which is also what makes it safe for `relaxationLabel` to diff a preview against the live
 * `filters`. The server echoes `scopeKind` so the component can additionally refuse a reply for a
 * different scope kind than the one it is rendering.
 *
 * @param city - City slug. Empty string disables the query.
 * @param scope - The committed result scope. `null` (or an AREA_SET with no keys) disables the
 *   query: this endpoint must not answer for a scope the shopper did not select.
 * @param filters - Active discover filters, serialized exactly as the listings query serializes
 *   them (`buildDiscoverSearchParams`). Any `polygon` left in the filter set is NOT forwarded —
 *   the scope is the single source of geography here.
 * @param options.listingPurpose - The buy/rent purpose the listings query sends (`'sale'` |
 *   `'rent'`). Part of the never-relaxed envelope on the server, so it MUST match the listings
 *   request or a rent listing can be counted for a buy search — which is exactly what the first
 *   real-browser run of #2454 showed (two ₹0 rent rows inflated a polygon preview) before this
 *   parameter existed.
 * @param options.limit - Optional max previews; server default 4, clamped [1,6].
 *
 * LIVE MODE ONLY, for the same reason as `useNearbyAreaCandidates`: there is no admin
 * city-launch-preview counterpart for this endpoint, so an empty result is the correct behaviour
 * on the preview surface rather than a wrong-endpoint call.
 */
export interface RelaxationPreviewsOptions {
  listingPurpose?: string;
  limit?: number;
}

export function useRelaxationPreviews(
  city: string,
  scope: RelaxationPreviewScope,
  filters: PropertyFilters,
  options: RelaxationPreviewsOptions = {},
) {
  const { listingPurpose, limit } = options;
  const source = useDiscoverSource();
  let user = null;
  try {
    const auth = useAuth();
    user = auth.user;
  } catch {
    // safe fallback when rendered outside AuthProvider
  }
  const isSignedIn = user != null;

  const hasScope =
    scope != null && (scope.kind !== 'AREA_SET' || scope.areaKeys.length > 0);
  // The anonymous-polygon guard. There is no anonymous polygon backend path; asking would
  // only produce a 401, and a row rendered from anything else would be a count of the wrong
  // geometry. Mutation-proven in useRelaxationPreviews.test.ts.
  const scopeIsAskable = hasScope && (scope.kind !== 'POLYGON' || isSignedIn);

  return useQuery<RelaxationPreviewsResponse>({
    queryKey: discoverKey(
      source,
      'discover-relaxation-previews',
      city,
      scopeKeyPayload(scope),
      filters,
      listingPurpose ?? null,
      limit ?? null,
    ),
    queryFn: () => {
      if (!scope) throw new Error('useRelaxationPreviews: query ran without a scope');
      const params = buildDiscoverSearchParams({
        city,
        filters,
        listingPurpose,
        viewportScope: scope.kind === 'VIEWPORT' ? scope.bounds : undefined,
      });
      // The scope, not a stray filter, owns geography. `useDiscoverPageState` mirrors a
      // committed polygon into `filters.polygon`; strip it so the public endpoint (which
      // rejects any polygon) never sees one, and so the polygon endpoint gets exactly the
      // committed scope below.
      params.delete('polygon');
      if (limit != null) {
        params.set('limit', String(limit));
      }
      if (scope.kind === 'POLYGON') {
        params.set('polygon', JSON.stringify(scope.coordinates));
        return api.get<RelaxationPreviewsResponse>(`${POLYGON_PATH}?${params.toString()}`);
      }
      if (scope.kind === 'AREA_SET') {
        [...scope.areaKeys].sort().forEach((areaKey) => params.append('areaKeys', areaKey));
      }
      return api.get<RelaxationPreviewsResponse>(`${AREAS_PATH}?${params.toString()}`, {
        skipAuth: true,
      });
    },
    enabled: city.length > 0 && scopeIsAskable && source.mode === 'live',
    // Matches useNearbyAreaCandidates: short enough to react promptly to a filter change while the
    // recovery panel is open, rather than pinning a stale suggestion.
    staleTime: 30_000,
  });
}
