import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

const POPULAR_SCHOOLS_KEY = ['schools-popular'] as const;

/**
 * Fetches notable ("popular") schools for a city, optionally narrowed to an area centroid.
 *
 * Backend contract: `GET /api/public/schools/popular?city={city}&limit={limit}&areaKey={areaKey?}`
 * Response shape: plain `SchoolResult[]` (not paginated). Empty array when city has no
 * notable schools or when areaKey resolves to no schools within the proximity radius.
 *
 * The query is gated by a non-empty `city`: when `city` is `null`/empty, the query stays
 * idle so the backend never receives a 400. Callers should render a "select a city"
 * placeholder in that case.
 *
 * @param city    city slug (e.g. "udupi"). When null/empty the query is disabled.
 * @param areaKey optional pipe-separated area key to narrow results to ~2km of the centroid.
 *                Pass `undefined`/empty string to query the whole city.
 * @param limit   max results (default 6). Backend clamps to [1, 50].
 */
export function usePopularSchools(
  city: string | null | undefined,
  areaKey?: string | null,
  limit: number = 6,
) {
  const trimmedCity = city?.trim() ?? '';
  const trimmedAreaKey = areaKey?.trim() ?? '';

  return useQuery<SchoolResult[]>({
    // areaKey is part of the key so changing the dropdown re-queries instead of returning stale data.
    queryKey: [...POPULAR_SCHOOLS_KEY, trimmedCity, trimmedAreaKey, limit],
    queryFn: () => {
      const params = new URLSearchParams({
        city: trimmedCity,
        limit: String(limit),
      });
      if (trimmedAreaKey) params.set('areaKey', trimmedAreaKey);
      return api.get<SchoolResult[]>(
        `/api/public/schools/popular?${params.toString()}`,
        { skipAuth: true },
      );
    },
    enabled: trimmedCity.length > 0,
    staleTime: 60_000,
  });
}
