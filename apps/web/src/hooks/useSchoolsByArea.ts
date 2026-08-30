import { useInfiniteQuery, UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SchoolResult } from './useSchoolSearch';

export interface SchoolsByAreaResponse {
  schools: SchoolResult[];
  totalElements: number;
  isLast: boolean;
  nextPage: number;
}

/**
 * Fetch schools within an area, optionally filtered by board and category.
 * Uses infinite query pattern for pagination.
 */
export function useSchoolsByArea(
  areaKey: string | null | undefined,
  board: string[] = [],
  category: string[] = [],
  size: number = 20,
): UseInfiniteQueryResult<InfiniteData<SchoolsByAreaResponse>, Error> {
  return useInfiniteQuery({
    queryKey: ['schools-by-area', areaKey, board, category, size],
    staleTime: 60_000,
    initialPageParam: 0,
    enabled: !!areaKey,
    queryFn: async ({ pageParam: page }) => {
      const params = new URLSearchParams({
        areaKey: areaKey || '',
        page: String(page),
        size: String(size),
      });

      // Append board filters as repeated query params for Spring to parse as List<String>
      board.forEach((b) => params.append('board', b));
      // Append category filters as repeated query params for Spring to parse as List<String>
      category.forEach((c) => params.append('category', c));

      // Use api.get (which prefixes VITE_API_BASE_URL) instead of raw relative fetch —
      // on Cloudflare Pages the page origin does NOT serve /api/**, so relative fetch 404s
      // and the panel silently shows empty. { skipAuth: true } matches the public endpoint
      // contract — same convention as useDiscoverAreas.
      const schools = await api.get<SchoolResult[]>(
        `/api/public/schools/by-area?${params.toString()}`,
        { skipAuth: true },
      );
      const totalElements = schools.length + (page * size); // Estimate; API doesn't provide total
      const isLast = schools.length < size;

      return {
        schools,
        totalElements,
        isLast,
        nextPage: page + 1,
      };
    },
    getNextPageParam: (lastPage) => (lastPage.isLast ? undefined : lastPage.nextPage),
  });
}
