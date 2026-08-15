import { createContext, useContext, type ReactNode } from 'react';

/**
 * DiscoverDataSourceContext — Issue #1911 PR3 ("Complete Discover preview").
 *
 * Lets the SAME production Discover hooks + components (MapDiscovery,
 * PropertyCard, the 5 region-first data hooks) serve either the live
 * public/authenticated Discover surface or an admin city-launch revision's
 * sandbox preview — WITHOUT forking any component. CityLaunchPreview.tsx
 * wraps the unmodified <MapDiscovery/> in a DiscoverDataSourceProvider with
 * {mode:'preview', cityId, revisionId, citySlug}; every consumer that
 * doesn't sit under that provider (i.e. all of live Discover today) reads
 * the default context value {mode:'live'} and is byte-identical to pre-PR3
 * behaviour.
 *
 * `citySlug` (#2151 Track 1) is the revision's real owning-city slug,
 * resolved server-side via GET .../preview/identity BEFORE this provider is
 * mounted (see CityLaunchPreview.tsx) — it lets DiscoverContext substitute
 * the correct city identity for preview mode instead of every display/data
 * call site falling back to DEFAULT_CITY because a preview URL carries no
 * `city=` query param by design.
 */

export type DiscoverDataSource =
  | { mode: 'live' }
  | { mode: 'preview'; cityId: number; revisionId: number; citySlug: string };

const LIVE_SOURCE: DiscoverDataSource = { mode: 'live' };

const DiscoverDataSourceReactContext = createContext<DiscoverDataSource>(LIVE_SOURCE);

export interface DiscoverDataSourceProviderProps {
  value: DiscoverDataSource;
  children: ReactNode;
}

export function DiscoverDataSourceProvider({ value, children }: DiscoverDataSourceProviderProps) {
  return (
    <DiscoverDataSourceReactContext.Provider value={value}>
      {children}
    </DiscoverDataSourceReactContext.Provider>
  );
}

/** Reads the active data source. Defaults to {mode:'live'} outside any provider. */
export function useDiscoverSource(): DiscoverDataSource {
  return useContext(DiscoverDataSourceReactContext);
}

/**
 * Logical Discover endpoints mirrored 1:1 by the admin city-launch preview
 * contract (E1-E7 — see AdminCityLaunchPreviewController). One entry per
 * hook this PR threads (regions/regionGroups/areas/markers/listings/
 * areaGroups), plus 'listingDetail' (E6) for PropertyCard's inline
 * simulated-listing drawer.
 *
 * Issue #1955 (Areas PR A) — 'navigationTree' / 'navigationDiff' /
 * 'navigationOverrides' / 'navigationOverrideDelete' are admin-only, always
 * revision-scoped, and have NO live-mode counterpart (there is no public
 * "live navigation sandbox tree" — the promoted equivalent at
 * /api/discover/cities/{city}/navigation/{nodeKey} is a different shape and
 * out of scope here). They are added to this union so
 * CityLaunchPreview's new hierarchy/diff/overrides views can resolve their
 * cityId/revisionId via useDiscoverSource() like every other preview-aware
 * hook, instead of prop-drilling — callers MUST gate `enabled` on
 * `source.mode === 'preview'` since discoverPath's live branch has nothing
 * meaningful to return for these kinds (see useCityLaunchNavigation.ts).
 */
export type DiscoverEndpoint =
  | { kind: 'regions' }
  | { kind: 'regionGroups'; regionKey: string }
  | { kind: 'areas' }
  | { kind: 'markers' }
  | { kind: 'listings' }
  | { kind: 'listingDetail'; areaKey: string }
  | { kind: 'areaGroups' }
  | { kind: 'navigationTree' }
  | { kind: 'navigationDiff'; against: 'BASE' | 'PREVIOUS_REVISION' }
  | { kind: 'navigationOverrides' }
  | { kind: 'navigationOverrideDelete'; overrideId: number }
  | { kind: 'navigationResolve'; nodeKey: string }
  | { kind: 'navigationCounts'; nodeKey: string; search: string }
  | { kind: 'regionalAreaGroups'; listingPurpose: string | null }
  | { kind: 'agriDestinations'; direction: string | null; maxKm: number | null; listingPurpose: string | null }
  | { kind: 'agriMapListings'; areaKey: string; listingPurpose: string | null };

/**
 * Resolves the request path for one logical Discover endpoint.
 *
 * LIVE mode: returns `livePath` UNCHANGED — `livePath` is the full
 * path+querystring the calling hook already builds today, so live behaviour
 * is byte-identical to pre-PR3 (no path is ever computed from `endpoint` in
 * this branch).
 *
 * PREVIEW mode: ignores `livePath` and returns the matching
 * `/api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/preview/...`
 * base path. Navigation/region/area/marker/listing endpoints carry no query
 * string in preview mode. The three Agri endpoints (`regionalAreaGroups`,
 * `agriDestinations`, `agriMapListings` — Issue #2151 Track 2) are the
 * exception: they build and append their own query string (e.g.
 * `listingPurpose`, `direction`, `maxKm`, `areaKey`) in both modes, matching
 * the backend preview contract.
 */
export function discoverPath(
  source: DiscoverDataSource,
  livePath: string,
  endpoint: DiscoverEndpoint,
): string {
  if (source.mode === 'live') return livePath;

  const base = `/api/admin/city-launch/cities/${source.cityId}/revisions/${source.revisionId}/preview`;
  // Sibling of `base` (no `/preview` segment) — the navigation tree/diff/
  // overrides contract lives directly under the revision, not under the
  // simulated-preview E1-E7 namespace.
  const revisionBase = `/api/admin/city-launch/cities/${source.cityId}/revisions/${source.revisionId}`;
  switch (endpoint.kind) {
    case 'regions':
      return `${base}/regions`;
    case 'regionGroups':
      return `${base}/regions/${encodeURIComponent(endpoint.regionKey)}/groups`;
    case 'areas':
      return `${base}/areas`;
    case 'markers':
      return `${base}/markers`;
    case 'listings':
      return `${base}/listings`;
    case 'listingDetail':
      return `${base}/listings/${encodeURIComponent(endpoint.areaKey)}`;
    case 'areaGroups':
      return `${base}/area-groups`;
    case 'navigationTree':
      return `${revisionBase}/navigation/tree`;
    case 'navigationDiff':
      return `${revisionBase}/navigation/diff?against=${encodeURIComponent(endpoint.against)}`;
    case 'navigationOverrides':
      return `${revisionBase}/navigation/overrides`;
    case 'navigationOverrideDelete':
      return `${revisionBase}/navigation/overrides/${encodeURIComponent(String(endpoint.overrideId))}`;
    case 'navigationResolve':
      return `${base}/navigation/resolve?node=${encodeURIComponent(endpoint.nodeKey)}`;
    case 'navigationCounts':
      return `${base}/navigation/${encodeURIComponent(endpoint.nodeKey)}/counts${endpoint.search ? `?${endpoint.search}` : ''}`;
    case 'regionalAreaGroups': {
      const params = new URLSearchParams();
      if (endpoint.listingPurpose) params.set('listingPurpose', endpoint.listingPurpose);
      const qs = params.toString();
      return `${base}/regional-area-groups${qs ? `?${qs}` : ''}`;
    }
    case 'agriDestinations': {
      const params = new URLSearchParams();
      if (endpoint.direction) params.set('direction', endpoint.direction);
      if (endpoint.maxKm != null) params.set('maxKm', String(endpoint.maxKm));
      if (endpoint.listingPurpose) params.set('listingPurpose', endpoint.listingPurpose);
      const qs = params.toString();
      return `${base}/agri-destinations${qs ? `?${qs}` : ''}`;
    }
    case 'agriMapListings': {
      const params = new URLSearchParams({ areaKey: endpoint.areaKey });
      if (endpoint.listingPurpose) params.set('listingPurpose', endpoint.listingPurpose);
      return `${base}/agri-map-listings?${params.toString()}`;
    }
    default: {
      // Exhaustiveness guard — a new DiscoverEndpoint variant must be
      // handled above or this fails to typecheck.
      const _exhaustive: never = endpoint;
      return _exhaustive;
    }
  }
}

/**
 * Builds the query key for a Discover query.
 *
 * LIVE mode: returns `liveKey` UNCHANGED (byte-identical to pre-PR3 — the
 * AC10 cache-isolation triple below is never present in the live cache
 * bucket).
 *
 * PREVIEW mode: prepends `['preview', cityId, revisionId]` so preview data
 * can never collide with (or be served stale from) the live cache entry for
 * the same logical query, and switching between two different revisions
 * never cross-serves each other's cached data.
 */
export function discoverKey(
  source: DiscoverDataSource,
  ...liveKey: readonly unknown[]
): readonly unknown[] {
  if (source.mode === 'live') return liveKey;
  return ['preview', source.cityId, source.revisionId, ...liveKey];
}

/**
 * The single mutation seam (per PR3 scope): listing actions (save/unsave,
 * and the View-details navigation to a real /listing/{id} page) are
 * disabled whenever the active source is a sandbox preview. Returns true
 * (unchanged) in live mode.
 */
export function useDiscoverActionsEnabled(): boolean {
  const source = useDiscoverSource();
  return source.mode !== 'preview';
}
