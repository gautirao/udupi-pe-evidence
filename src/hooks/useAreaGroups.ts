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
  /**
   * Optional map-label anchor surfaced from the backend DTO (focusLat/focusLon).
   * Already returned by /api/discover/area-groups — no API/contract change.
   * Null when the backend has no focus point; the school-first map then falls
   * back to a centroid derived from member-area coordinates. Optional so existing
   * AreaGroup literals (tests/fixtures) remain valid.
   */
  focus_lat?: number | null;
  focus_lon?: number | null;
  /**
   * Issue #1597 — optional long-form buyer-facing description surfaced from the
   * backend DTO (JsonInclude.NON_NULL: absent when null). Frontend falls back to
   * discoverGroupContent adapter when this is null/undefined.
   */
  description?: string | null;
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
  /** Issue #1597 — nullable long-form description (JsonInclude.NON_NULL: omitted when null). */
  description?: string | null;
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
      .map((item): AreaGroup | null => {
        // Safe fallbacks for each field
        const slug = typeof item.slug === 'string' ? item.slug : null;
        const name = typeof item.name === 'string' ? item.name : null;
        const subtitle = item.subtitle ?? null;
        const regionLabel = item.regionLabel ?? null;
        const areaKeysArray = Array.isArray(item.areaKeys) ? item.areaKeys : [];
        // Surface the (already-returned) focus point for map-label placement.
        const focusLat = typeof item.focusLat === 'number' ? item.focusLat : null;
        const focusLon = typeof item.focusLon === 'number' ? item.focusLon : null;

        // Require at least name or slug to be present
        if (!name && !slug) {
          return null;
        }

        // Issue #1597 — surface description from the backend DTO (null when absent).
        const description = typeof item.description === 'string' ? item.description : null;

        return {
          id: slug || name!,
          name: name || slug!,
          subtitle: subtitle,
          region_label: regionLabel,
          school_count: 0,
          area_keys: areaKeysArray,
          focus_lat: focusLat,
          focus_lon: focusLon,
          description,
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
