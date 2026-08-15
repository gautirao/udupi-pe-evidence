import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDiscoverSource, discoverPath, discoverKey } from '@/features/discover/state/DiscoverDataSourceContext';

export interface DiscoverArea {
  areaKey: string;
  name: string;
  geoCenterLat: number;
  geoCenterLon: number;
  minLat?: number;
  minLon?: number;
  maxLat?: number;
  maxLon?: number;
  listingCount: number;
  schoolCount: number;
  medianPricePaise?: number;
  trendDirection?: string;
  confidenceTier?: string;
  /**
   * Issue #1371 — agri-only acreage summary. Present ONLY in filtered responses
   * (?propertyType=agricultural_land) where the backend can derive an aggregate
   * from parseable land-area data. Absent (undefined) in blended responses.
   */
  agriAcreage?: number;
}

export interface DiscoverAreasResponse {
  city: string;
  areas: DiscoverArea[];
}

/**
 * Fetch area summaries for a city.
 *
 * @param city - City identifier (e.g. 'udupi'). Empty string disables the query.
 * @param propertyType - Optional singular filter. When provided (e.g. 'agricultural_land'),
 *   appended as &propertyType=... AND included in the queryKey so React Query cannot
 *   cross-serve the blended and filtered caches (AC10 cache-key requirement).
 *   Omitting it preserves byte-identical behaviour + queryKey vs. the prior signature.
 * @param purpose - Issue #2083 RC_C — optional 'sale'/'rent' scope, independently
 *   optional from `propertyType`. Appended as &purpose=... AND included in the
 *   queryKey (same cache-key discipline as propertyType above) so the blended
 *   and purpose-filtered responses can never cross-serve. Omitting it preserves
 *   byte-identical behaviour + queryKey vs. every existing call site.
 */
export function useDiscoverAreas(city: string, propertyType?: string, purpose?: string) {
  // Issue #1911 PR3 — see useDiscoverRegionSummary.ts for the default-context
  // ({mode:'live'}) byte-identical-live-behaviour rationale.
  const source = useDiscoverSource();

  const keySuffix: string[] = ['discover-areas', city];
  if (propertyType) keySuffix.push(propertyType);
  if (purpose) keySuffix.push(purpose);

  return useQuery<DiscoverAreasResponse>({
    queryKey: discoverKey(source, ...keySuffix),
    queryFn: () => {
      const params = new URLSearchParams({ city });
      if (propertyType) params.set('propertyType', propertyType);
      if (purpose) params.set('purpose', purpose);
      const livePath = `/api/discover/areas?${params.toString()}`;
      const path = discoverPath(source, livePath, { kind: 'areas', propertyType, purpose });
      return api.get<DiscoverAreasResponse>(path, { skipAuth: source.mode === 'live' });
    },
    enabled: city.length > 0,
    staleTime: 300_000,
  });
}
