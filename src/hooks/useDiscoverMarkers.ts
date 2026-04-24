import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

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

/** Snap bbox to a 0.02° grid (≈2.2 km) to maximise cache hits across adjacent viewports. */
function snapBbox(
  bbox: [number, number, number, number],
): [number, number, number, number] {
  const STEP = 0.02;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return [
    r2(Math.floor(bbox[0] / STEP) * STEP), // south — expand outward
    r2(Math.floor(bbox[1] / STEP) * STEP), // west  — expand outward
    r2(Math.ceil(bbox[2] / STEP) * STEP),  // north — expand outward
    r2(Math.ceil(bbox[3] / STEP) * STEP),  // east  — expand outward
  ];
}

export function useDiscoverMarkers(
  city: string,
  bbox?: [number, number, number, number] | null,
) {
  const snapped = bbox ? snapBbox(bbox) : null;

  return useQuery<DiscoverMarkersResponse>({
    queryKey: ['discover-markers', city, snapped],
    queryFn: ({ signal }) => {
      let url = `/api/listings/markers?city=${encodeURIComponent(city)}`;
      if (snapped) {
        const [s, w, n, e] = snapped;
        url += `&bbox=${s},${w},${n},${e}`;
      }
      return api.get<DiscoverMarkersResponse>(url, { skipAuth: true, signal });
    },
    enabled: city.length > 0,
    staleTime: 300_000,
  });
}
