import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Frontend Types ───────────────────────────────────────────────────────────

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

// ─── Backend DTO Types (from /api/discover/area-groups) ─────────────────────────

interface AreaGroupDTO {
  slug?: string;
  name?: string;
  subtitle?: string | null;
  regionLabel?: string | null;
  displayOrder?: number;
  areaKeys?: string[] | null;
  focusLat?: number | null;
  focusLon?: number | null;
  minLat?: number | null;
  minLon?: number | null;
  maxLat?: number | null;
  maxLon?: number | null;
}

interface AreaGroupsDTOResponse {
  city?: string;
  groups?: AreaGroupDTO[] | null;
}

// ─── Query key ────────────────────────────────────────────────────────────────

export const AREA_GROUPS_QUERY_KEY_BASE = ['area-groups'] as const;

// ─── Mapper: Backend DTO → Frontend Type ────────────────────────────────────────

/**
 * Normalize backend API response (camelCase, different field names) to frontend AreaGroup shape.
 * Tolerates missing/malformed data by providing safe defaults.
 *
 * Backend sends: { slug, name, subtitle, regionLabel, areaKeys, focus/bounds fields }
 * Frontend expects: { id, name, subtitle, region_label, school_count, area_keys }
 */
export function normalizeAreaGroupResponse(dto: AreaGroupsDTOResponse): AreaGroupsResponse {
  if (!dto?.groups || !Array.isArray(dto.groups)) {
    return { groups: [] };
  }

  return {
    groups: dto.groups
      .map((item) => {
        // Safe fallbacks for each field
        const slug = typeof item.slug === 'string' ? item.slug : null;
        const name = typeof item.name === 'string' ? item.name : null;
        const subtitle = item.subtitle ?? null;
        const regionLabel = item.regionLabel ?? null;
        const areaKeysArray = Array.isArray(item.areaKeys) ? item.areaKeys : [];

        // Require at least name or slug to be present
        if (!name && !slug) {
          return null;
        }

        return {
          id: slug || name!,
          name: name || slug!,
          subtitle: subtitle,
          region_label: regionLabel,
          school_count: 0,
          area_keys: areaKeysArray,
        };
      })
      .filter((group): group is AreaGroup => group !== null),
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetch area groups for a city from GET /api/discover/area-groups?city=...
 *
 * Groups are static per city — no filter params in the key.
 * Returns { groups: [] } on fetch failure so the panel can render the Browse-all fallback.
 *
 * Backend response is normalized to frontend AreaGroup shape (camelCase → snake_case mapping).
 */
export function useAreaGroups(city: string) {
  return useQuery<AreaGroupsResponse>({
    queryKey: [...AREA_GROUPS_QUERY_KEY_BASE, city],
    queryFn: async () => {
      try {
        const rawResponse = await api.get<AreaGroupsDTOResponse>(
          `/api/discover/area-groups?city=${encodeURIComponent(city)}`,
          { skipAuth: true },
        );
        return normalizeAreaGroupResponse(rawResponse);
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
