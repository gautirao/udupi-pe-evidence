import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { snapBbox } from '@/lib/bboxUtils';
import { buildDiscoverSearchParams } from '@/lib/discoverSearchParams';
import { useDiscoverSource, discoverPath, discoverKey } from '@/features/discover/state/DiscoverDataSourceContext';
import type { DiscoverMarkerScope } from '@/features/discover/selectors/markerScope';

export interface DiscoverFilteredMarker {
  id: string;
  lat: number;
  lon: number;
  pricePaise: number | null;
  locality: string | null;
  /** Issue #1372 — property type forwarded from the markers endpoint for agri cluster rendering. */
  propertyType?: string | null;
  /** Issue #1373 — GeoJSON Polygon string for agri listings with a saved boundary. Absent for non-agri + agri-no-boundary. */
  boundary?: string | null;
  /**
   * Issue #1941 — coarse price band string (e.g. "₹1–2Cr") for anonymous residential
   * callers, mutually exclusive with pricePaise. Currently this endpoint is auth-gated
   * in both live and preview modes (see useDiscoverFilteredMarkers below), so the
   * backend does not populate this today; declared for forward-compatibility and so
   * filteredMarkerToPropertyListing can thread it through without a cast.
   */
  priceBand?: string | null;
}

export interface DiscoverFilteredMarkersResponse {
  city: string;
  markers: DiscoverFilteredMarker[];
  /** True when the backend capped the result set (more markers matched than were returned). */
  truncated?: boolean;
  /** Number of markers returned in this response (= markers.length). */
  returnedElements?: number;
  /**
   * Viewport-scoped total: count of all markers matching the current filters + bbox.
   * Equals returnedElements when not truncated; exceeds returnedElements when truncated.
   */
  totalFilteredElements?: number;
  /** Active marker cap (server-side FETCH_LIMIT constant). */
  limit?: number;
  /** True only when a valid bbox was applied to this query. */
  boundsApplied?: boolean;
}

export function useDiscoverFilteredMarkers(
  city: string,
  filters: PropertyFilters,
  enabled = true,
  /**
   * Optional viewport bounding box [south, west, north, east].
   * Snapped to 0.02° grid for cache efficiency before being sent to the API.
   * When omitted, the backend falls back to the full city query.
   */
  bbox?: [number, number, number, number] | null,
  /** Optional keyword search — forwarded as ?q= to the markers API. */
  q?: string,
  /** Issue #1496 — Buy/Rent intent mapped to 'sale'|'rent'. Absent param preserves existing all-intent marker behaviour. */
  listingPurpose?: string,
  /** Issue #1463 — Exclude markers of this property type (e.g. 'agricultural_land' in non-agri journeys). Absent = no exclusion. */
  excludePropertyType?: string,
  /**
   * Issue #2185 S2 — the single geography-scope decision for this fetch
   * (see `resolveDiscoverMarkerScope`/`DiscoverMarkerScope` for the
   * precedence and rationale). Defaults to `{kind:'city'}` — the pre-#2185
   * unscoped-city-wide baseline — so existing callers that predate this
   * param keep compiling and behaving identically.
   *   'city'       -> no area filter is applied (unscoped, unchanged).
   *   'node'       -> scoped to a single canonical discovery node (`nodeKey=`).
   *   'areas'      -> LEGACY #1597 group-scope; sorted `areaKeys=` (repeated).
   *                   An empty `areaKeys` array disables the fetch (below) to
   *                   prevent a whole-city leak or backend 400.
   *   'unresolved' -> disables the fetch entirely (below) — never fires with
   *                   a mid-resolution/undefined scope.
   */
  scope: DiscoverMarkerScope = { kind: 'city' },
) {
  // Issue #1911 PR3 — see useDiscoverRegionSummary.ts for the default-context
  // ({mode:'live'}) byte-identical-live-behaviour rationale.
  const source = useDiscoverSource();

  // Snap bbox to grid for cache efficiency; null when not provided or contains non-finite values.
  const snapped: [number, number, number, number] | null =
    bbox != null && bbox.every(Number.isFinite) ? snapBbox(bbox) : null;

  const trimmedQ = q?.trim() || undefined;

  // Issue #2185 S2 — derive the wire-level scope fields from `scope` ONCE,
  // here, so the queryFn and the queryKey below can never disagree on what
  // was actually requested (a stale-closure/key-mismatch bug class).
  // Issue #1597 — sort for stable cache keys; null when scope is not 'areas'.
  const sortedAreaKeys = scope.kind === 'areas' ? [...scope.areaKeys].sort() : null;
  const scopeNodeKey = scope.kind === 'node' ? scope.nodeKey : undefined;
  // Empty-areaKeys guard: do NOT fire when the group has no member areas (backend returns 400 on []).
  const areasEmpty = scope.kind === 'areas' && scope.areaKeys.length === 0;

  return useQuery<DiscoverFilteredMarkersResponse>({
    // Flattened into discrete fields (kind + nodeKey + sorted areaKeys)
    // rather than the `scope` object itself — TanStack Query keys rely on
    // structural equality via JSON serialization, and flattening guarantees
    // `{kind:'city'}` and a `{kind:'node', nodeKey}` scope can never collapse
    // to the same key (an object with an absent vs. present property could,
    // depending on serialization order, if compared loosely).
    queryKey: discoverKey(
      source,
      'discover-filtered-markers', city, filters, snapped, trimmedQ, listingPurpose ?? null, excludePropertyType ?? null,
      scope.kind, scopeNodeKey ?? null, sortedAreaKeys,
    ),
    queryFn: ({ signal }) => {
      const params = buildDiscoverSearchParams({
        city,
        filters,
        snapped,
        sortedAreaKeys,
        trimmedQ,
        listingPurpose,
        excludePropertyType,
        nodeKey: scopeNodeKey,
      });

      const livePath = `/api/discover/markers?${params.toString()}`;
      let path = discoverPath(source, livePath, { kind: 'markers' });
      // Preview's /markers endpoint (E4) only understands ?node= and
      // ?areaKeys= — city, filters, listingPurpose etc. have no meaning
      // against a revision's sandbox graph, so they are intentionally NOT
      // forwarded in preview mode (discoverPath already dropped them by
      // discarding livePath). node wins over areaKeys per the backend
      // contract (#2202/PR #2210) — but scope is a discriminated union, so
      // only one of these branches is ever active at once (#2215).
      if (source.mode === 'preview' && scope.kind === 'node') {
        const previewParams = new URLSearchParams();
        previewParams.set('node', scope.nodeKey);
        path = `${path}?${previewParams.toString()}`;
      } else if (source.mode === 'preview' && sortedAreaKeys && sortedAreaKeys.length > 0) {
        const previewParams = new URLSearchParams();
        sortedAreaKeys.forEach((k) => previewParams.append('areaKeys', k));
        path = `${path}?${previewParams.toString()}`;
      }
      // This endpoint is auth-gated in BOTH modes — no skipAuth override
      // (default false), unchanged from pre-PR3. Preview additionally
      // requires the admin JWT, which the default (no skipAuth) already sends.
      return api.get<DiscoverFilteredMarkersResponse>(path, { signal });
    },
    // Issue #2185 S2 — `scope.kind !== 'unresolved'` is the general form of
    // the #1597 empty-areaKeys guard: NEVER fire while the scope's own
    // producer hasn't settled yet (a `node=` mid-resolution, or a legacy
    // group cold-load), because "no scope yet" must never silently degrade
    // to "unscoped city-wide" (the exact bug this issue fixes).
    enabled: enabled && city.length > 0 && scope.kind !== 'unresolved' && !areasEmpty,
    staleTime: 60_000,
    // Keep previous markers visible while a new school-proximity refetch is in-flight.
    // Without this, TanStack Query v5 resets data to undefined on queryKey change,
    // causing a transient empty-markers flash (Issue #1109).
    placeholderData: (previousData) => previousData,
  });
}
