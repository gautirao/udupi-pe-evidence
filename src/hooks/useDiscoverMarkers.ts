import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { snapBbox } from '@/lib/bboxUtils';

export interface DiscoverMarker {
  id: string;
  lat: number;
  lon: number;
  pricePaise?: number;
}

export interface DiscoverMarkersResponse {
  city: string;
  markers: DiscoverMarker[];
}

export function useDiscoverMarkers(
  city: string,
  bbox?: [number, number, number, number] | null,
  enabled = true,
  /**
   * Issue #1597 — optional area key filter for group-results markers.
   * When non-empty, the backend returns ONLY markers whose area_key is in this set.
   * Sorted before use for stable cache keys. An empty array disables the fetch
   * (empty-areaKeys guard) to prevent a whole-city leak or backend 400.
   */
  areaKeys?: string[],
) {
  const snapped = bbox != null && bbox.every(Number.isFinite) ? snapBbox(bbox) : null;

  // Issue #1597 — sort for stable cache keys; null when no area filter.
  const sortedAreaKeys = areaKeys != null ? [...areaKeys].sort() : null;
  // Empty-areaKeys guard: do NOT fire when the group has no member areas.
  const areaKeysEmpty = sortedAreaKeys !== null && sortedAreaKeys.length === 0;

  return useQuery<DiscoverMarkersResponse>({
    queryKey: ['discover-markers', city, snapped, sortedAreaKeys],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      params.set('city', city);
      if (snapped) {
        const [s, w, n, e] = snapped;
        params.set('bbox', `${s},${w},${n},${e}`);
      }
      // Issue #1597 — append areaKeys as repeated params when provided.
      if (sortedAreaKeys !== null) {
        sortedAreaKeys.forEach((k) => params.append('areaKeys', k));
      }
      return api.get<DiscoverMarkersResponse>(`/api/listings/markers?${params.toString()}`, { skipAuth: true, signal });
    },
    enabled: enabled && city.length > 0 && !areaKeysEmpty,
    staleTime: 300_000,
  });
}
