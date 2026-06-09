import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Frontend Types ───────────────────────────────────────────────────────────

export interface RegionalAreaGroup {
  label: string;
  directionKey: string;
  /** One of: '0_10' | '10_25' | '25_50' | '50_up' */
  distanceBandKey: string;
  listingCount: number;
  /** Null when the backend omits the field (@JsonInclude NON_NULL). */
  agriAcreage: number | null;
  areaKeys: string[];
}

export interface RegionalAreaGroupsData {
  city: string;
  groups: RegionalAreaGroup[];
}

// ─── Backend DTO Types ────────────────────────────────────────────────────────

interface RegionalAreaGroupDTO {
  label?: string;
  directionKey?: string;
  distanceBandKey?: string;
  listingCount?: number;
  agriAcreage?: number | null;
  areaKeys?: string[] | null;
}

interface RegionalAreaGroupsDTOResponse {
  city?: string;
  groups?: RegionalAreaGroupDTO[] | null;
}

// ─── Query key ────────────────────────────────────────────────────────────────

export const REGIONAL_AREA_GROUPS_QUERY_KEY_BASE = ['regional-area-groups'] as const;

// ─── Mapper: Backend DTO → Frontend Type ────────────────────────────────────────

/**
 * Normalize backend API response to frontend RegionalAreaGroup shape.
 * Rows missing a label are skipped (label is the only display field).
 * agriAcreage defaults to null when absent (backend uses @JsonInclude NON_NULL).
 */
export function normalizeRegionalAreaGroupsResponse(
  dto: RegionalAreaGroupsDTOResponse,
  city: string,
): RegionalAreaGroupsData {
  if (!dto?.groups || !Array.isArray(dto.groups)) {
    return { city, groups: [] };
  }

  return {
    city: typeof dto.city === 'string' ? dto.city : city,
    groups: dto.groups
      .map((item): RegionalAreaGroup | null => {
        const label = typeof item.label === 'string' ? item.label : null;
        // label is the only user-visible display field — skip rows without it
        if (!label) return null;

        const directionKey = typeof item.directionKey === 'string' ? item.directionKey : '';
        const distanceBandKey =
          typeof item.distanceBandKey === 'string' ? item.distanceBandKey : '';
        const listingCount =
          typeof item.listingCount === 'number' ? item.listingCount : 0;
        // Backend omits agriAcreage when null; treat absence as null
        const agriAcreage =
          typeof item.agriAcreage === 'number' ? item.agriAcreage : null;
        const areaKeys = Array.isArray(item.areaKeys) ? item.areaKeys : [];

        return { label, directionKey, distanceBandKey, listingCount, agriAcreage, areaKeys };
      })
      .filter((g): g is RegionalAreaGroup => g !== null),
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetch regional area groups for a city + agricultural_land property type
 * from GET /api/discover/regional-area-groups?city=...&propertyType=agricultural_land
 *
 * Groups are precomputed direction×distance bands — static per city+type.
 * Returns { city, groups: [] } on any fetch failure so callers degrade gracefully.
 */
export function useRegionalAreaGroups(city: string) {
  return useQuery<RegionalAreaGroupsData>({
    queryKey: [...REGIONAL_AREA_GROUPS_QUERY_KEY_BASE, city, 'agricultural_land'],
    queryFn: async () => {
      try {
        const rawResponse = await api.get<RegionalAreaGroupsDTOResponse>(
          `/api/discover/regional-area-groups?city=${encodeURIComponent(city)}&propertyType=agricultural_land`,
          { skipAuth: true },
        );
        return normalizeRegionalAreaGroupsResponse(rawResponse, city);
      } catch {
        // On any network/API error return empty groups so the panel degrades gracefully.
        return { city, groups: [] };
      }
    },
    enabled: city.length > 0,
    staleTime: 60_000,
  });
}
