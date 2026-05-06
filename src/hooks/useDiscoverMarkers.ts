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
) {
  const snapped = bbox != null && bbox.every(Number.isFinite) ? snapBbox(bbox) : null;

  return useQuery<DiscoverMarkersResponse>({
    queryKey: ['discover-markers', city, snapped],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      params.set('city', city);
      if (snapped) {
        const [s, w, n, e] = snapped;
        params.set('bbox', `${s},${w},${n},${e}`);
      }
      return api.get<DiscoverMarkersResponse>(`/api/listings/markers?${params.toString()}`, { skipAuth: true, signal });
    },
    enabled: enabled && city.length > 0,
    staleTime: 300_000,
  });
}
