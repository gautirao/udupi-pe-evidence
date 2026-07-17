import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDiscoverSource, discoverPath, discoverKey } from '@/features/discover/state/DiscoverDataSourceContext';

/**
 * Issue #1910 (PR2) — frontend consumer of the new additive endpoint
 * `GET /api/discover/cities/{citySlug}/regions/{regionKey}/groups`
 * (PR1, already merged). Unlike `useAreaGroups`, this returns each group's
 * member `areaKeys` and `listingCount` STRICTLY scoped to one requested
 * macro region, fixing "Resolution A" — a group that legitimately spans
 * multiple regions no longer silently vanishes from a non-plurality
 * region's list.
 *
 * See backend/src/main/java/com/example/realestate/discover/RegionScopedAreaGroup.java
 * for the full field-by-field contract this type mirrors.
 */

// ─── Frontend/Backend DTO type (Jackson serializes a Java record's accessors
// as camelCase JSON field names 1:1 — no remapping needed, unlike AreaGroup's
// snake_case normalization in useAreaGroups.ts) ─────────────────────────────

export interface RegionScopedAreaGroup {
  groupSlug: string;
  name: string;
  subtitle: string | null;
  scopingRegionKey: string;
  regionDisplayOrder: number;
  /** ONLY the group's member area_keys classified into scopingRegionKey. */
  areaKeys: string[];
  /**
   * COUNT(DISTINCT pl.id) across exactly this subset's area_keys — already
   * de-duplicated server-side (safe against double-counting when an area
   * belongs to multiple groups). Never re-sum this from another source.
   */
  listingCount: number;
  /** Bounds-union midpoint of the subset's valid-bbox members, or null when boundsStatus === 'UNAVAILABLE'. */
  focusLat: number | null;
  focusLon: number | null;
  minLat: number | null;
  minLon: number | null;
  maxLat: number | null;
  maxLon: number | null;
  /**
   * 'COMPLETE' — every subset member has a complete, valid bbox.
   * 'APPROXIMATE' — some (but not all) do; bounds/focus come from that valid subset — real data, safe to render directly.
   * 'UNAVAILABLE' — zero do; ALL SIX coordinate fields above are null. Never fabricate a marker position for this case.
   */
  boundsStatus: 'COMPLETE' | 'APPROXIMATE' | 'UNAVAILABLE';
}

export interface RegionScopedAreaGroupsResponse {
  citySlug: string;
  regionKey: string;
  groups: RegionScopedAreaGroup[];
}

interface RegionScopedAreaGroupsDTOResponse {
  citySlug?: string;
  regionKey?: string;
  groups?: RegionScopedAreaGroup[] | null;
}

export const REGION_SCOPED_AREA_GROUPS_QUERY_KEY_BASE = ['region-scoped-area-groups'] as const;

/**
 * Fetches the region-scoped area-group projection for one city + region.
 *
 * Disabled (issues zero network requests) whenever `regionKey` is null/empty
 * — this is the critical guard so Udupi and all non-region-scoped Discover
 * views never issue this extra request.
 *
 * Issue #1910 (PR2 review fix, Finding 3) — a genuine backend failure
 * (500/network error/timeout) now surfaces as a real `isError`/`error` on
 * the returned query result instead of being swallowed into a fake-success
 * `{ groups: [] }`. Swallowing made a real failure visually IDENTICAL to
 * "this region legitimately has zero groups" — callers (AreaGroupsLandingPanel)
 * need to tell the two apart to show an honest error+retry state instead of a
 * misleading empty state. `retry: false` mirrors `useRegionalAreaGroups`'s
 * established error-surfacing convention (see src/hooks/useRegionalAreaGroups.ts)
 * so a failure resolves to `isError: true` promptly rather than after React
 * Query's default retry backoff.
 */
export function useRegionScopedAreaGroups(
  citySlug: string,
  regionKey: string | null | undefined,
  listingPurpose?: string | null,
) {
  // Issue #1911 PR3 — see useDiscoverRegionSummary.ts for the default-context
  // ({mode:'live'}) byte-identical-live-behaviour rationale.
  const source = useDiscoverSource();
  const normalizedRegionKey = regionKey ?? '';
  return useQuery<RegionScopedAreaGroupsResponse>({
    queryKey: discoverKey(
      source,
      ...REGION_SCOPED_AREA_GROUPS_QUERY_KEY_BASE,
      citySlug,
      normalizedRegionKey,
      listingPurpose ?? null,
    ),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (listingPurpose) params.set('listingPurpose', listingPurpose);
      const qs = params.toString();
      const livePath = `/api/discover/cities/${encodeURIComponent(citySlug)}/regions/${encodeURIComponent(normalizedRegionKey)}/groups${qs ? `?${qs}` : ''}`;
      const path = discoverPath(source, livePath, { kind: 'regionGroups', regionKey: normalizedRegionKey });
      const rawResponse = await api.get<RegionScopedAreaGroupsDTOResponse>(
        path,
        { skipAuth: source.mode === 'live' },
      );
      return {
        citySlug: rawResponse.citySlug ?? citySlug,
        regionKey: rawResponse.regionKey ?? normalizedRegionKey,
        groups: Array.isArray(rawResponse.groups) ? rawResponse.groups : [],
      };
    },
    enabled: citySlug.length > 0 && normalizedRegionKey.length > 0,
    staleTime: 60_000,
    retry: false,
  });
}
