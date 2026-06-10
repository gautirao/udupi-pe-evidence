import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Frontend Types (cumulative corridor model, Issue #1429) ──────────────────

export interface CumulativeDistanceTier {
  maxKm: 10 | 25 | 50 | 100;
  distanceLabel: string;
  includedBandCodes: string[];
  listingCount: number;
  /** Undefined when absent from JSON (backend @JsonInclude NON_NULL). NOT null. */
  agriAcreage?: number;
  areaKeys: string[];
}

export interface CorridorGroupData {
  directionCode: string;
  groupName: string;
  availableMaxDistances: CumulativeDistanceTier[];
}

export interface RegionalAreaGroupsData {
  groups: CorridorGroupData[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * @deprecated The discrete distance-band model (directionKey + distanceBandKey) has been
 * replaced by the cumulative corridor model (CorridorGroupData + CumulativeDistanceTier).
 * This type is retained for backward compatibility with AgriRegionalGroupsPanel and its tests.
 * Will be removed once those consumers are migrated.
 */
export interface RegionalAreaGroup {
  /** Human-readable label, e.g. "North — 10–25 km" */
  label: string;
  /** Direction code, e.g. "N", "NW" */
  directionKey: string;
  /** Distance band code, e.g. "10_25", "50_up" */
  distanceBandKey: string;
  listingCount: number;
  /** Null when absent from API response */
  agriAcreage?: number | null;
  areaKeys: string[];
}

// ─── Backend DTO Types ────────────────────────────────────────────────────────

interface AvailableMaxDistanceDTO {
  maxKm?: unknown;
  distanceLabel?: string;
  includedBandCodes?: string[] | null;
  listingCount?: number;
  agriAcreage?: number | null;
  areaKeys?: string[] | null;
}

interface CorridorGroupDTO {
  directionCode?: string;
  groupName?: string;
  availableMaxDistances?: AvailableMaxDistanceDTO[] | null;
}

interface CorridorGroupsDTOResponse {
  city?: string;
  groups?: CorridorGroupDTO[] | null;
}

// ─── Query key ────────────────────────────────────────────────────────────────

export const REGIONAL_AREA_GROUPS_QUERY_KEY_BASE = ['regional-area-groups'] as const;

const VALID_MAX_KM = new Set([10, 25, 50, 100]);

// ─── Mapper: Backend DTO → Frontend Type ────────────────────────────────────────

/**
 * Normalize backend API CorridorGroup DTO response to frontend CorridorGroupData shape.
 * Tiers with unknown maxKm values are skipped.
 * agriAcreage is mapped to undefined (not null) when absent from JSON.
 */
export function normalizeRegionalAreaGroupsResponse(
  dto: CorridorGroupsDTOResponse,
  _city: string,
): Pick<RegionalAreaGroupsData, 'groups'> {
  if (!dto?.groups || !Array.isArray(dto.groups)) {
    return { groups: [] };
  }

  const groups: CorridorGroupData[] = dto.groups
    .map((item): CorridorGroupData | null => {
      const directionCode = typeof item.directionCode === 'string' ? item.directionCode : '';
      const groupName = typeof item.groupName === 'string' ? item.groupName : '';
      // Skip corridors with no usable identity
      if (!directionCode && !groupName) return null;

      const rawTiers = Array.isArray(item.availableMaxDistances) ? item.availableMaxDistances : [];
      const availableMaxDistances: CumulativeDistanceTier[] = rawTiers
        .map((tier): CumulativeDistanceTier | null => {
          const maxKm = typeof tier.maxKm === 'number' ? tier.maxKm : null;
          // Skip tiers with unknown maxKm
          if (maxKm === null || !VALID_MAX_KM.has(maxKm)) return null;

          const distanceLabel = typeof tier.distanceLabel === 'string' ? tier.distanceLabel : '';
          const includedBandCodes = Array.isArray(tier.includedBandCodes) ? tier.includedBandCodes : [];
          const listingCount = typeof tier.listingCount === 'number' ? tier.listingCount : 0;
          // agriAcreage: undefined if absent or null (NOT null — spec requires undefined)
          const agriAcreage = typeof tier.agriAcreage === 'number' ? tier.agriAcreage : undefined;
          const areaKeys = Array.isArray(tier.areaKeys) ? tier.areaKeys : [];

          return {
            maxKm: maxKm as 10 | 25 | 50 | 100,
            distanceLabel,
            includedBandCodes,
            listingCount,
            agriAcreage,
            areaKeys,
          };
        })
        .filter((t): t is CumulativeDistanceTier => t !== null);

      return { directionCode, groupName, availableMaxDistances };
    })
    .filter((g): g is CorridorGroupData => g !== null);

  return { groups };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetch corridor groups for a city + agricultural_land property type
 * from GET /api/discover/regional-area-groups?city=...&propertyType=agricultural_land
 *
 * Returns cumulative corridor data — each corridor has availableMaxDistances[]
 * ordered by maxKm ascending. Returns { groups: [], isLoading, error } structure.
 */
export function useRegionalAreaGroups(city: string): RegionalAreaGroupsData {
  const { data, isLoading, error } = useQuery<Pick<RegionalAreaGroupsData, 'groups'>>({
    queryKey: [...REGIONAL_AREA_GROUPS_QUERY_KEY_BASE, city, 'agricultural_land'],
    queryFn: async () => {
      try {
        const rawResponse = await api.get<CorridorGroupsDTOResponse>(
          `/api/discover/regional-area-groups?city=${encodeURIComponent(city)}&propertyType=agricultural_land`,
          { skipAuth: true },
        );
        return normalizeRegionalAreaGroupsResponse(rawResponse, city);
      } catch {
        // On any network/API error return empty groups so the panel degrades gracefully.
        return { groups: [] };
      }
    },
    enabled: city.length > 0,
    staleTime: 60_000,
  });

  return {
    groups: data?.groups ?? [],
    isLoading,
    error: error as Error | null,
  };
}
