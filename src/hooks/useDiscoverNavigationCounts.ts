/**
 * Navigation destination counts — Issue #1956 PR 1 (FE-3, item 1).
 *
 * `GET /api/discover/cities/{city}/navigation/{nodeKey}/counts` — ONE request
 * returns the node's own rolled-up listing + school totals, EVERY direct child's
 * totals, and the whole-city `area_key -> listing count` and
 * `area_key -> school count` maps. Field names and
 * query params mirror the committed `NavigationController#getCounts` /
 * `NavigationCountsResponse`; the wire types are reused verbatim from
 * `@/features/discover/navigation/types` and are NOT redeclared here.
 *
 * ── AC1.11 — ONE HTTP REQUEST PER VIEW ──
 * A level render costs exactly one call regardless of how many children the
 * level has, because the server already batched the per-child and per-area
 * numbers into this response. Server-internal deterministic batching is fine;
 * a client-side fan-out is not. If a future change ever needs a count this hook
 * does not already carry, extend the RESPONSE — never loop this hook per node.
 * `useDiscoverNavigationCounts.test.ts` asserts this by REQUEST COUNT.
 *
 * ── AC1.13 / §2.7 — STALE-RESPONSE PROTECTION ──
 * Every request carries a FINGERPRINT over `(city, nodeKey, filters)` — which is
 * literally the request's own identity, since {@link buildNavigationCountsFingerprint}
 * is derived from the same normalised parameter list that builds the URL, so the
 * two cannot drift. Three defences, in order:
 *   1. The fingerprint IS the TanStack query key, so a response for filter A
 *      lands in filter A's cache entry and can never become filter B's `data`.
 *   2. `queryFn` receives TanStack's `AbortSignal` and forwards it to `fetch`,
 *      so a superseded in-flight request is CANCELLED rather than merely ignored.
 *   3. The resolved snapshot is STAMPED with the fingerprint that requested it,
 *      and this hook returns `null` unless that stamp equals the CURRENT
 *      fingerprint. Belt and braces: even a cache entry served from somewhere
 *      unexpected cannot be presented as the current view's counts.
 * `placeholderData: keepPreviousData` is deliberately NOT used — it is precisely
 * the mechanism that would surface the previous fingerprint's numbers while the
 * new ones are in flight, which is the bug this AC exists to prevent.
 *
 * ── AC1.12 — ONE IDENTITY OWNS BOTH MAP AND PANEL COUNTS ──
 * There is ONE snapshot object. `mapDestinationCounts` and
 * `panelDestinationCounts` are the SAME REFERENCE, not two projections, so map
 * and panel update atomically or not at all. `readDestinationCounts` then derives
 * `visibleMemberCount` and `displayedRepresentativeCount` from that single
 * snapshot in one pass, which is what makes
 * `computeNearbyAreaCount`'s `NEGATIVE_HIDDEN_COUNT` UNREACHABLE rather than
 * merely clamped: the displayed set is intersected with the visible set computed
 * from the same numbers, so `displayed <= visible` holds by construction.
 *
 * This hook does NOT redesign the listing-results API and does NOT move counts
 * onto `?areaKeys=` transport — that is #2016.
 *
 * ── AC1.17 / §2.8 — COUNT FRESHNESS <= LISTING FRESHNESS ──
 * Counts must never be STALER than the listings they describe, or a shopper sees
 * "12 areas with matches" over a list that has already moved on.
 *   • Client: {@link NAVIGATION_COUNTS_STALE_TIME_MS} (30 s) must stay <=
 *     {@link DISCOVER_CITY_LISTINGS_STALE_TIME_MS} (60 s). The test asserts the
 *     inequality directionally, so a future edit that inverts it goes red.
 *   • Server: the counts endpoint sends `Cache-Control: max-age=30, public`
 *     (`discover.navigation.counts.cache.ttl-seconds`); the public city-listings
 *     endpoint sends `max-age=60, public`.
 *
 * ACCEPTED DISCREPANCY WINDOW — 90 s worst case. THREE caches are ADDITIVE, not
 * overlapping, and a count can age in each of them in turn:
 *   1. up to 30 s in the server-side application count cache
 *      (`AreaCountRollupService`'s Caffeine TTL);
 *   2. then up to a further 30 s in a shared HTTP cache under `max-age=30`;
 *   3. then up to a further 30 s in THIS hook's own TanStack cache entry, which
 *      {@link NAVIGATION_COUNTS_STALE_TIME_MS} keeps fresh (no refetch) for 30 s
 *      after it lands.
 * So a displayed count may lag the underlying listing data by up to 90 s. This is
 * accepted for PR 1: counts are an orientation aid, not a transactional number,
 * and all three TTLs are config-driven / constant-driven if the window ever needs
 * narrowing.
 */
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type {
  NavigationCountsResponse,
  NavigationNodeCount,
} from '@/features/discover/navigation/types';
import { DISCOVER_CITY_LISTINGS_STALE_TIME_MS } from '@/hooks/useDiscoverCityListings';

/** Query-key base. Never an inline string at the call site. */
export const NAVIGATION_COUNTS_QUERY_KEY_BASE = ['discover', 'navigation', 'counts'] as const;

/**
 * Client freshness for counts. MUST stay <= {@link DISCOVER_CITY_LISTINGS_STALE_TIME_MS}
 * (AC1.17). Mirrors the server's 30 s counts TTL.
 */
export const NAVIGATION_COUNTS_STALE_TIME_MS = 30_000;

/** Re-exported so a consumer can assert the AC1.17 inequality without a second import. */
export { DISCOVER_CITY_LISTINGS_STALE_TIME_MS };

/**
 * The filter context counts are computed under — one field per OPTIONAL query
 * param on `NavigationController#getCounts`. Omitting all of them reproduces the
 * server's blended default exactly.
 *
 * ── NO `priceMin`/`priceMax` HERE, DELIBERATELY ──
 * The endpoint does NOT accept a price band. Price is continuous and unbounded,
 * so the only way to bound this endpoint's cache-key cardinality was to SNAP the
 * band — which silently answers a question the shopper did not ask. Rather than
 * ship that, price was removed from the endpoint (there was no production
 * writer), and it is absent here for the same reason: a field this hook accepts,
 * serialises and fingerprints, but the server ignores, is a surface promising
 * something the backend does not deliver.
 *
 * Price returns to BOTH ENDS TOGETHER in the PR that first renders these counts,
 * with a deliberate cardinality answer. Do not reintroduce it on one side alone —
 * `useDiscoverNavigationCounts.test.ts` asserts its absence from both the request
 * params and the fingerprint precisely so that a one-sided reintroduction goes
 * red instead of silently diverging.
 */
export interface DiscoverNavigationCountsFilters {
  purpose?: string | null;
  /** Plural form, preferred by the endpoint when both are supplied. */
  propertyTypes?: readonly string[] | null;
  bedrooms?: readonly number[] | null;
  sellerTypes?: readonly string[] | null;
  readyToMove?: boolean | null;
  reraRegistered?: boolean | null;
  newToMarket?: boolean | null;
  backOnMarket?: boolean | null;
}

const EMPTY_FILTERS: DiscoverNavigationCountsFilters = Object.freeze({});

function appendList(
  params: URLSearchParams,
  name: string,
  values: readonly (string | number)[] | null | undefined,
): void {
  if (!values || values.length === 0) return;
  // Sorted so two logically-identical filter states produce ONE fingerprint and
  // ONE cache entry, rather than one per selection order.
  const sorted = values.map((v) => String(v)).slice().sort();
  for (const value of sorted) params.append(name, value);
}

function appendFlag(params: URLSearchParams, name: string, value: boolean | null | undefined): void {
  if (value == null) return;
  params.set(name, String(value));
}

/**
 * Builds the endpoint's query params in a FIXED order with sorted multi-values,
 * so the serialisation is deterministic. This function is the single source of
 * both the request URL and the fingerprint — they cannot disagree.
 */
export function buildNavigationCountsRequestParams(
  filters: DiscoverNavigationCountsFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.purpose) params.set('purpose', filters.purpose);
  appendList(params, 'propertyTypes', filters.propertyTypes);
  // No priceMin/priceMax — the endpoint does not accept them. See
  // `DiscoverNavigationCountsFilters`. This function is also the fingerprint's
  // only input, so their absence here is their absence from the query key too.
  appendList(params, 'bedrooms', filters.bedrooms);
  appendList(params, 'sellerTypes', filters.sellerTypes);
  appendFlag(params, 'readyToMove', filters.readyToMove);
  appendFlag(params, 'reraRegistered', filters.reraRegistered);
  appendFlag(params, 'newToMarket', filters.newToMarket);
  appendFlag(params, 'backOnMarket', filters.backOnMarket);
  return params;
}

/**
 * The request fingerprint over `(node, filters, request parameters)` — AC1.13.
 * Two requests share a fingerprint iff they would hit the same URL.
 */
export function buildNavigationCountsFingerprint(
  city: string,
  nodeKey: string,
  filters: DiscoverNavigationCountsFilters,
): string {
  return `${city}\0${nodeKey}\0${buildNavigationCountsRequestParams(filters).toString()}`;
}

/**
 * ONE count-response identity (AC1.12). Everything a view needs — node totals,
 * per-child totals, per-area listing counts — comes from this ONE object, so a
 * consumer physically cannot half-update from two responses.
 */
export interface NavigationCountsSnapshot {
  /** The fingerprint of the request that produced it. */
  readonly fingerprint: string;
  readonly nodeKey: string;
  readonly revisionId: number;
  /** The node's own rolled-up LISTING total. Server-computed, never summed here. */
  readonly listingCount: number;
  /** The node's own rolled-up DISTINCT-SCHOOL total. Server-computed. */
  readonly schoolCount: number;
  /**
   * Whole-city `area_key -> listing count`. A LOOKUP, not an aggregation input —
   * summing it to re-derive a node total is the bug class this PR prevents.
   */
  readonly areaListingCounts: ReadonlyMap<string, number>;
  /**
   * Whole-city `area_key -> distinct-school count`. The school-dimension mirror
   * of {@link areaListingCounts}, and the wire field AC1.9's Schools-journey
   * visibility needs.
   *
   * NEVER SUM IT — it legitimately adds up to MORE than {@link schoolCount}. It
   * is a per-area LOOKUP; totals come from {@link schoolCount}. The rollup model
   * that makes this so is stated canonically on
   * `NavigationCountsResponse.areaSchoolCounts` in
   * `@/features/discover/navigation/types`.
   */
  readonly areaSchoolCounts: ReadonlyMap<string, number>;
  /** Each direct child's own rolled-up totals, keyed by node key. */
  readonly childCounts: ReadonlyMap<string, NavigationNodeCount>;
  /** Per-area listing count; 0 for an area the response does not mention. */
  listingCountForArea(areaKey: string): number;
  /** Per-area distinct-school count; 0 for an area the response does not mention. */
  schoolCountForArea(areaKey: string): number;
  /** A direct child's rolled-up totals, or undefined when it is not a direct child. */
  countsForChild(childNodeKey: string): NavigationNodeCount | undefined;
}

function toSnapshot(
  response: NavigationCountsResponse,
  fingerprint: string,
): NavigationCountsSnapshot {
  // Both per-area maps are built in ONE pass over the response and read back as
  // O(1) `Map.get` lookups. Deliberately symmetric: schools get a Map, not an
  // array `.find`, so the two journeys have the same cost profile.
  const areaListingCounts = new Map<string, number>(
    Object.entries(response.areaCounts ?? {}),
  );
  const areaSchoolCounts = new Map<string, number>(
    Object.entries(response.areaSchoolCounts ?? {}),
  );
  const childCounts = new Map<string, NavigationNodeCount>(
    (response.children ?? []).map((child) => [child.nodeKey, child]),
  );
  return Object.freeze({
    fingerprint,
    nodeKey: response.nodeKey,
    revisionId: response.revisionId,
    listingCount: response.count,
    schoolCount: response.schoolCount,
    areaListingCounts,
    areaSchoolCounts,
    childCounts,
    listingCountForArea: (areaKey: string) => areaListingCounts.get(areaKey) ?? 0,
    schoolCountForArea: (areaKey: string) => areaSchoolCounts.get(areaKey) ?? 0,
    countsForChild: (childNodeKey: string) => childCounts.get(childNodeKey),
  });
}

/**
 * Both `+N` inputs read out of ONE snapshot in one pass — AC1.12 / AC1.7.
 *
 * `visibleMemberCount` counts members the supplied per-journey eligibility
 * accessor reports a non-zero count for — listings for the Areas journey, schools
 * for the Schools journey. It is NOT hardcoded to listings (AC1.9).
 * `displayedRepresentativeCount` counts only representatives
 * that are THEMSELVES in that visible set, which is what makes
 * `computeNearbyAreaCount`'s `NEGATIVE_HIDDEN_COUNT` unreachable rather than
 * clamped: a representative can never be counted as displayed unless it was
 * already counted as visible, from the same numbers, in the same call.
 */
export interface DestinationCountsReadout {
  /** Carried through so a caller can prove both numbers share one response. */
  readonly fingerprint: string;
  readonly visibleMemberCount: number;
  readonly displayedRepresentativeCount: number;
  readonly visibleAreaKeys: readonly string[];
  readonly displayedAreaKeys: readonly string[];
}

/**
 * How many eligible items a single area holds, FOR ONE JOURNEY. The seam that
 * keeps {@link readDestinationCounts} journey-agnostic (AC1.9).
 */
export type AreaEligibilityAccessor = (areaKey: string) => number;

/**
 * The Areas-journey accessor (`journey === 'areas'`): per-area ELIGIBLE LISTING
 * count, straight off the snapshot's `area_key -> listing count` map.
 */
export function listingEligibilityAccessor(
  snapshot: NavigationCountsSnapshot,
): AreaEligibilityAccessor {
  return (areaKey: string) => snapshot.listingCountForArea(areaKey);
}

/**
 * The Schools-journey accessor (`journey === 'schools'`): per-area DISTINCT-SCHOOL
 * count, straight off the snapshot's `area_key -> school count` map.
 *
 * This selects on a GENUINELY DIFFERENT dimension than
 * {@link listingEligibilityAccessor} — an area with schools but no listings is
 * visible here and hidden there, and vice versa. Tests assert both directions, so
 * an accidental re-aliasing back onto listings cannot pass.
 *
 * It reads the per-area map ONLY, and never sums it — see
 * {@link NavigationCountsSnapshot.areaSchoolCounts}.
 */
export function schoolEligibilityAccessor(
  snapshot: NavigationCountsSnapshot,
): AreaEligibilityAccessor {
  return (areaKey: string) => snapshot.schoolCountForArea(areaKey);
}

/**
 * ── `eligibleCountForArea` IS REQUIRED, AND STAYS REQUIRED ──
 *
 * AC1.9 makes visibility at final AREA presentation journey-dependent:
 * `eligibleListingCount > 0` for the Areas journey, `eligibleSchoolCount > 0` for
 * the Schools journey. Both accessors now exist
 * ({@link listingEligibilityAccessor}, {@link schoolEligibilityAccessor}) because
 * the counts response carries BOTH per-area maps.
 *
 * There is deliberately NO default. A caller must name the journey's accessor at
 * every call site, exactly as `journeyVisibility.ts` requires an explicit
 * `journey` argument. Do NOT add a default of {@link listingEligibilityAccessor}:
 * a `+N` computed over listing eligibility, sitting beside a schools cluster,
 * describes a different result set than the one it labels — the defect this
 * parameterisation exists to prevent. Making it required means a future Schools
 * surface cannot silently fall back to listings; it must choose.
 */
export function readDestinationCounts(
  snapshot: NavigationCountsSnapshot,
  memberAreaKeys: readonly string[],
  displayedRepresentativeAreaKeys: readonly string[],
  eligibleCountForArea: AreaEligibilityAccessor,
): DestinationCountsReadout {
  const visibleAreaKeys = memberAreaKeys.filter(
    (areaKey) => eligibleCountForArea(areaKey) > 0,
  );
  const visible = new Set(visibleAreaKeys);
  const displayedAreaKeys = displayedRepresentativeAreaKeys.filter((areaKey) =>
    visible.has(areaKey),
  );
  return {
    fingerprint: snapshot.fingerprint,
    visibleMemberCount: visibleAreaKeys.length,
    displayedRepresentativeCount: displayedAreaKeys.length,
    visibleAreaKeys,
    displayedAreaKeys,
  };
}

export interface UseDiscoverNavigationCountsParams {
  city: string;
  /**
   * The RESOLVED node key (or the synthetic `'root'`). Never the raw `node=` URL
   * value: an unresolved/stale key has no counts meaning, and the frontend never
   * CONSTRUCTS a node key — it comes from the server.
   */
  nodeKey: string | null;
  filters?: DiscoverNavigationCountsFilters;
  enabled?: boolean;
}

export interface UseDiscoverNavigationCountsResult {
  /** The current request's fingerprint (AC1.13). */
  fingerprint: string | null;
  /** The one count identity, or null while loading / on error / when stale. */
  snapshot: NavigationCountsSnapshot | null;
  /** AC1.12 — the SAME reference as {@link snapshot}, not a projection. */
  mapDestinationCounts: NavigationCountsSnapshot | null;
  /** AC1.12 — the SAME reference as {@link snapshot}, not a projection. */
  panelDestinationCounts: NavigationCountsSnapshot | null;
  /**
   * True when a settled response was discarded because its fingerprint did not
   * match the current one.
   *
   * NOT AN ACTIONABLE SIGNAL — treat it as a runtime ASSERTION that should always
   * read `false`. The fingerprint IS the query key and `queryFn` stamps that same
   * fingerprint onto the snapshot it returns, so along every real path the two
   * agree whenever `query.data` is non-null. It can only become `true` if the
   * cache is written from outside this hook (e.g. a test's `setQueryData`) or if
   * the key/stamp derivation is ever allowed to drift. Do not build UI on it; if
   * it is ever observed `true` in production, that is a defect to fix, not a state
   * to render.
   */
  isStaleResponseIgnored: boolean;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
}

export function useDiscoverNavigationCounts({
  city,
  nodeKey,
  filters = EMPTY_FILTERS,
  enabled = true,
}: UseDiscoverNavigationCountsParams): UseDiscoverNavigationCountsResult {
  // Deliberately NOT memoized. `filters` is an object literal at most call
  // sites, so a reference-keyed useMemo would recompute every render anyway,
  // while a deep-equality dep would need a second normaliser that could drift
  // from this one. Building the string IS the normalisation — a handful of
  // string appends, cheap enough to run every render.
  const fingerprint =
    city && nodeKey ? buildNavigationCountsFingerprint(city, nodeKey, filters) : null;

  const isEnabled = enabled && fingerprint != null;

  const query = useQuery<NavigationCountsSnapshot, ApiError>({
    queryKey: [...NAVIGATION_COUNTS_QUERY_KEY_BASE, fingerprint] as const,
    queryFn: async ({ signal }) => {
      // Non-null by `enabled` — TanStack never invokes queryFn while disabled.
      const requestFingerprint = fingerprint as string;
      const search = buildNavigationCountsRequestParams(filters).toString();
      const path =
        `/api/discover/cities/${encodeURIComponent(city)}` +
        `/navigation/${encodeURIComponent(nodeKey as string)}/counts` +
        (search ? `?${search}` : '');
      // `signal` is forwarded into fetch by `api.get` (ApiRequestOptions extends
      // RequestInit), so a superseded request is genuinely aborted, not just
      // ignored on arrival — AC1.13 defence 2.
      const response = await api.get<NavigationCountsResponse>(path, { signal });
      return toSnapshot(response, requestFingerprint);
    },
    enabled: isEnabled,
    staleTime: NAVIGATION_COUNTS_STALE_TIME_MS,
    // NO placeholderData/keepPreviousData — see the module doc (AC1.13).
  });

  const settled = query.data ?? null;
  // `isEnabled` gates the READOUT as well as the fetch. Without it, a caller that
  // flips `enabled` to false (left the Areas journey, capability gate closed,
  // preview exited) while `city`/`nodeKey` are unchanged would still be handed the
  // already-cached snapshot, because the fingerprint still matches and the cache
  // entry is still present. Disabling the hook must mean "no counts", not
  // "no refetch".
  const snapshot =
    isEnabled && settled != null && settled.fingerprint === fingerprint ? settled : null;

  return {
    fingerprint,
    snapshot,
    // One object, two names. Deliberately the same reference so map and panel
    // cannot be half-updated from two responses (AC1.12).
    mapDestinationCounts: snapshot,
    panelDestinationCounts: snapshot,
    // Deliberately fingerprint-based, NOT `snapshot == null`: a disabled hook
    // also has a null snapshot, and that is a caller decision, not a stale
    // response.
    isStaleResponseIgnored: settled != null && settled.fingerprint !== fingerprint,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
  };
}
