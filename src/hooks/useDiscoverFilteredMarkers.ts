import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { snapBbox } from '@/lib/bboxUtils';
import { buildDiscoverSearchParams } from '@/lib/discoverSearchParams';
import { useDiscoverSource, discoverPath, discoverKey } from '@/features/discover/state/DiscoverDataSourceContext';

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
   * Issue #1597 — optional area key filter for group-results markers.
   * When non-empty, /api/discover/markers returns ONLY markers whose area_key is in this set.
   * Sorted before use for stable cache keys. An empty array disables the fetch
   * (empty-areaKeys guard) to prevent a whole-city leak or backend 400.
   * When undefined, no area filter is applied (preserves existing call-site behaviour).
   */
  areaKeys?: string[],
) {
  // Issue #1911 PR3 — see useDiscoverRegionSummary.ts for the default-context
  // ({mode:'live'}) byte-identical-live-behaviour rationale.
  const source = useDiscoverSource();

  // Snap bbox to grid for cache efficiency; null when not provided or contains non-finite values.
  const snapped: [number, number, number, number] | null =
    bbox != null && bbox.every(Number.isFinite) ? snapBbox(bbox) : null;

  const trimmedQ = q?.trim() || undefined;

  // Issue #1597 — sort for stable cache keys; null when no area filter.
  const sortedAreaKeys = areaKeys != null ? [...areaKeys].sort() : null;
  // Empty-areaKeys guard: do NOT fire when the group has no member areas (backend returns 400 on []).
  const areaKeysEmpty = sortedAreaKeys !== null && sortedAreaKeys.length === 0;

  return useQuery<DiscoverFilteredMarkersResponse>({
    queryKey: discoverKey(
      source,
      'discover-filtered-markers', city, filters, snapped, trimmedQ, listingPurpose ?? null, excludePropertyType ?? null, sortedAreaKeys,
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
      });

      const livePath = `/api/discover/markers?${params.toString()}`;
      let path = discoverPath(source, livePath, { kind: 'markers' });
      // Preview's /markers endpoint (E4) only understands ?areaKeys= — city,
      // filters, listingPurpose etc. have no meaning against a revision's
      // sandbox graph, so they are intentionally NOT forwarded in preview
      // mode (discoverPath already dropped them by discarding livePath).
      if (source.mode === 'preview' && sortedAreaKeys && sortedAreaKeys.length > 0) {
        const previewParams = new URLSearchParams();
        sortedAreaKeys.forEach((k) => previewParams.append('areaKeys', k));
        path = `${path}?${previewParams.toString()}`;
      }
      // This endpoint is auth-gated in BOTH modes — no skipAuth override
      // (default false), unchanged from pre-PR3. Preview additionally
      // requires the admin JWT, which the default (no skipAuth) already sends.
      return api.get<DiscoverFilteredMarkersResponse>(path, { signal });
    },
    enabled: enabled && city.length > 0 && !areaKeysEmpty,
    staleTime: 60_000,
    // Keep previous markers visible while a new school-proximity refetch is in-flight.
    // Without this, TanStack Query v5 resets data to undefined on queryKey change,
    // causing a transient empty-markers flash (Issue #1109).
    placeholderData: (previousData) => previousData,
  });
}
