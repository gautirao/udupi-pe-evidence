import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Response type ────────────────────────────────────────────────────────────

/**
 * Mirrors the backend ResolveAreaResponse DTO.
 * matched=false means the slug had no corresponding area in the city (HTTP 200,
 * not an error). matched=true means areaKey and areaLabel are populated.
 */
export interface ResolveAreaResponse {
  citySlug: string;
  areaSlug: string;
  /** Null when matched=false. */
  areaKey: string | null;
  /** Null when matched=false. */
  areaLabel: string | null;
  matched: boolean;
}

// ─── Query key ────────────────────────────────────────────────────────────────

export const RESOLVE_AREA_QUERY_KEY_BASE = ['resolve-area'] as const;

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Resolve a city slug + area slug pair to a canonical areaKey via the backend.
 *
 * Uses GET /api/trends/resolve-area?city={citySlug}&slug={areaSlug}.
 * Params are passed AS-IS from useParams (React Router already decoded them).
 * Double-encoding must be avoided — encodeURIComponent is applied once here.
 *
 * matched=false (HTTP 200) is returned as data, not an error.
 */
export function useResolveArea(citySlug: string, areaSlug: string) {
  const enabled = citySlug.length > 0 && areaSlug.length > 0;
  return useQuery<ResolveAreaResponse>({
    queryKey: [...RESOLVE_AREA_QUERY_KEY_BASE, citySlug, areaSlug],
    queryFn: () =>
      api.get<ResolveAreaResponse>(
        `/api/trends/resolve-area?city=${encodeURIComponent(citySlug)}&slug=${encodeURIComponent(areaSlug)}`,
        { skipAuth: true },
      ),
    enabled,
    staleTime: 300_000,
  });
}
