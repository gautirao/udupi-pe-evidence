import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useDiscoverSource, discoverPath, discoverKey } from '@/features/discover/state/DiscoverDataSourceContext';

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
  isError: boolean;
  error: Error | null;
  refetch: () => void;
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
/**
 * Issue #2151 PR C (C-F3) — `listingPurpose` is OPTIONAL and additive (shipped server-side by
 * PR B). Forwarded only when present so omitting it preserves today's behaviour exactly (no
 * query-string change, no query-key change for existing callers that don't pass it).
 */
export function useRegionalAreaGroups(city: string, listingPurpose?: string): RegionalAreaGroupsData {
  const source = useDiscoverSource();

  const { data, isLoading, isError, error, refetch } = useQuery<Pick<RegionalAreaGroupsData, 'groups'>>({
    queryKey: discoverKey(
      source,
      ...REGIONAL_AREA_GROUPS_QUERY_KEY_BASE,
      city,
      'agricultural_land',
      listingPurpose ?? null,
    ),
    queryFn: async () => {
      const params = new URLSearchParams({ city, propertyType: 'agricultural_land' });
      if (listingPurpose) params.set('listingPurpose', listingPurpose);
      const livePath = `/api/discover/regional-area-groups?${params.toString()}`;
      const path = discoverPath(source, livePath, {
        kind: 'regionalAreaGroups',
        listingPurpose: listingPurpose ?? null,
      });
      // Preview endpoints are admin-authed — skipAuth must be false so the
      // admin JWT is attached. Live mode keeps skipAuth:true (unchanged).
      const rawResponse = await api.get<CorridorGroupsDTOResponse>(path, {
        skipAuth: source.mode === 'live',
      });
      return normalizeRegionalAreaGroupsResponse(rawResponse, city);
    },
    enabled: city.length > 0,
    staleTime: 120_000,
    retry: false,
  });

  return {
    groups: data?.groups ?? [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

// ─── Agri destinations (Issue #2151 PR C, C-F4) ────────────────────────────────
//
// GET /api/discover/agri-destinations?city=&direction=&maxKm=&listingPurpose= — server-computed
// destination (town/locality) buckets for the agri-first corridor drill-down. Replaces the
// client-side `item.locality ?? item.areaKey` grouping that used to be computed in
// AgriGroupSelectedPanel.tsx from raw parcel listings (deleted — see that file). `areaKey` is the
// STABLE canonical identity for a destination (areas.area_key) — see
// src/features/discover/state/url/agricultural.ts (C-F1) for how it becomes the URL identity.

export interface AgriDestinationBucket {
  /** Stable canonical identity — areas.area_key. Never display text. */
  areaKey: string;
  /** Human-readable label, e.g. "N towards Brahmavar" or a town name. */
  displayName: string;
  distanceKm: number;
  bearingDeg: number;
  direction: string;
  parcelCount: number;
  /** Undefined when absent from JSON (backend @JsonInclude NON_NULL). NOT null. */
  parcelAcreage?: number;
}

export const AGRI_DESTINATIONS_QUERY_KEY_BASE = ['agri-destinations'] as const;

/**
 * Backend fail-closed code (503) for a city that is ACTIVE but has never been promoted through
 * Agri City Launch. NOT a transient/network error and NOT shopper-retryable — remediation is an
 * operator re-promotion. Must be rendered as its own distinct state, never folded into the
 * generic retryable-error state and never presented as an empty result (C-F6 state 5).
 */
export const AGRI_DESTINATIONS_NOT_YET_PROMOTED_CODE = 'AGRI_DESTINATIONS_NOT_YET_PROMOTED';

/**
 * Backend fail-closed code (503) for a PREVIEW revision that has zero sandbox Agri rows —
 * i.e. the revision needs city preparation re-run, not (like the live 503 above) a
 * never-promoted city. Distinct remediation from AGRI_DESTINATIONS_NOT_YET_PROMOTED_CODE, so
 * it must render as its own distinct state too (see `isNotGeneratedForRevision` below) — never
 * folded into the generic retryable-error state, and never conflated with the live-mode
 * not-yet-promoted carve-out (#2151 Track 3).
 */
export const AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION_CODE = 'AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION';

interface AgriDestinationBucketDTO {
  areaKey?: string;
  displayName?: string;
  distanceKm?: number;
  bearingDeg?: number;
  direction?: string;
  parcelCount?: number;
  parcelAcreage?: number | null;
}

interface AgriDestinationsDTOResponse {
  city?: string;
  destinations?: AgriDestinationBucketDTO[] | null;
}

/** Type guard for the shape GlobalExceptionHandler puts on a ResponseStatusException body. */
function isErrorCodeBody(body: unknown): body is { error: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error: unknown }).error === 'string'
  );
}

export function normalizeAgriDestinationsResponse(dto: AgriDestinationsDTOResponse): AgriDestinationBucket[] {
  if (!dto?.destinations || !Array.isArray(dto.destinations)) return [];
  return dto.destinations
    .map((d): AgriDestinationBucket | null => {
      const areaKey = typeof d.areaKey === 'string' ? d.areaKey : '';
      // Skip buckets with no usable identity.
      if (!areaKey) return null;
      return {
        areaKey,
        displayName: typeof d.displayName === 'string' && d.displayName.length > 0 ? d.displayName : areaKey,
        distanceKm: typeof d.distanceKm === 'number' ? d.distanceKm : 0,
        bearingDeg: typeof d.bearingDeg === 'number' ? d.bearingDeg : 0,
        direction: typeof d.direction === 'string' ? d.direction : '',
        parcelCount: typeof d.parcelCount === 'number' ? d.parcelCount : 0,
        // parcelAcreage: undefined if absent or null (NOT null — mirrors agriAcreage convention above).
        parcelAcreage: typeof d.parcelAcreage === 'number' ? d.parcelAcreage : undefined,
      };
    })
    .filter((d): d is AgriDestinationBucket => d !== null);
}

export interface AgriDestinationsData {
  destinations: AgriDestinationBucket[];
  isLoading: boolean;
  /**
   * True for any error EXCEPT the 503 not-yet-promoted case or the 503 preview
   * not-generated-for-revision case, both of which are surfaced separately via
   * `isNotYetPromoted`/`isNotGeneratedForRevision` (C-F6 / #2151 Track 3: these must render as
   * distinct states, never folded into one ambiguous flag).
   */
  isError: boolean;
  isNotYetPromoted: boolean;
  /**
   * #2151 Track 3 — true when the active source is a PREVIEW revision that has zero sandbox
   * Agri rows (backend 503 AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION). Distinct from
   * `isNotYetPromoted` (which is a LIVE-mode-only, never-promoted-city carve-out): the
   * remediation here is re-running city preparation for this revision, not promotion.
   */
  isNotGeneratedForRevision: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch server-computed destination buckets for a corridor (direction + maxKm) — Issue #2151 PR C.
 * `direction`/`maxKm`/`listingPurpose` are all optional and forwarded only when present, matching
 * the backend contract (GET .../agri-destinations?city=...[&direction=][&maxKm=][&listingPurpose=]).
 */
export function useAgriDestinations(
  city: string,
  direction?: string | null,
  maxKm?: number | null,
  listingPurpose?: string,
): AgriDestinationsData {
  const source = useDiscoverSource();

  const { data, isLoading, isError, error, refetch } = useQuery<AgriDestinationBucket[]>({
    queryKey: discoverKey(
      source,
      ...AGRI_DESTINATIONS_QUERY_KEY_BASE,
      city,
      direction ?? null,
      maxKm ?? null,
      listingPurpose ?? null,
    ),
    queryFn: async () => {
      const params = new URLSearchParams({ city });
      if (direction) params.set('direction', direction);
      if (maxKm != null) params.set('maxKm', String(maxKm));
      if (listingPurpose) params.set('listingPurpose', listingPurpose);
      const livePath = `/api/discover/agri-destinations?${params.toString()}`;
      const path = discoverPath(source, livePath, {
        kind: 'agriDestinations',
        direction: direction ?? null,
        maxKm: maxKm ?? null,
        listingPurpose: listingPurpose ?? null,
      });
      // Preview endpoints are admin-authed — skipAuth must be false so the
      // admin JWT is attached. Live mode keeps skipAuth:true (unchanged).
      const dto = await api.get<AgriDestinationsDTOResponse>(path, {
        skipAuth: source.mode === 'live',
      });
      return normalizeAgriDestinationsResponse(dto);
    },
    enabled: city.length > 0,
    staleTime: 120_000,
    retry: false,
  });

  const isNotYetPromoted =
    isError &&
    error instanceof ApiError &&
    error.status === 503 &&
    isErrorCodeBody(error.body) &&
    error.body.error === AGRI_DESTINATIONS_NOT_YET_PROMOTED_CODE;

  const isNotGeneratedForRevision =
    isError &&
    error instanceof ApiError &&
    error.status === 503 &&
    isErrorCodeBody(error.body) &&
    error.body.error === AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION_CODE;

  return {
    destinations: data ?? [],
    isLoading,
    // The 503 not-yet-promoted and 503 not-generated-for-revision cases are both carved out of
    // the generic error flag — neither may be presented as a generic retryable error.
    isError: isError && !isNotYetPromoted && !isNotGeneratedForRevision,
    isNotYetPromoted,
    isNotGeneratedForRevision,
    error: error as Error | null,
    refetch,
  };
}
