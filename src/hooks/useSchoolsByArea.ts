import { useInfiniteQuery, UseInfiniteQueryResult } from '@tanstack/react-query';
import { SchoolResult } from './useSchoolSearch';

interface SchoolsByAreaResponse {
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
): UseInfiniteQueryResult<SchoolsByAreaResponse, Error> {
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

      const res = await fetch(`/api/public/schools/by-area?${params}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch schools: ${res.status} ${res.statusText}`);
      }

      const schools: SchoolResult[] = await res.json();
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
