import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AreaGroup {
  id: string;
  name: string;
  subtitle: string | null;
  region_label: string | null;
  school_count: number;
  area_keys: string[];
}

interface AreaGroupsResponse {
  groups: AreaGroup[];
}

// ─── Query key ────────────────────────────────────────────────────────────────

export const AREA_GROUPS_QUERY_KEY_BASE = ['area-groups'] as const;

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetch area groups for a city from GET /api/discover/area-groups?city=...
 *
 * Groups are static per city — no filter params in the key.
 * Returns { groups: [] } on fetch failure so the panel can render the Browse-all fallback.
 */
export function useAreaGroups(city: string) {
  return useQuery<AreaGroupsResponse>({
    queryKey: [...AREA_GROUPS_QUERY_KEY_BASE, city],
    queryFn: async () => {
      try {
        return await api.get<AreaGroupsResponse>(
          `/api/discover/area-groups?city=${encodeURIComponent(city)}`,
          { skipAuth: true },
        );
      } catch {
        // On any network/API error, return empty groups so the panel renders
        // the Browse-all fallback rather than a hard error state.
        return { groups: [] };
      }
    },
    enabled: city.length > 0,
    staleTime: 60_000,
  });
}
