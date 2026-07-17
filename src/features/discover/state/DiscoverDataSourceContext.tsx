import { createContext, useContext, type ReactNode } from 'react';

/**
 * DiscoverDataSourceContext — Issue #1911 PR3 ("Complete Discover preview").
 *
 * Lets the SAME production Discover hooks + components (MapDiscovery,
 * PropertyCard, the 5 region-first data hooks) serve either the live
 * public/authenticated Discover surface or an admin city-launch revision's
 * sandbox preview — WITHOUT forking any component. CityLaunchPreview.tsx
 * wraps the unmodified <MapDiscovery/> in a DiscoverDataSourceProvider with
 * {mode:'preview', cityId, revisionId}; every consumer that doesn't sit
 * under that provider (i.e. all of live Discover today) reads the default
 * context value {mode:'live'} and is byte-identical to pre-PR3 behaviour.
 */

export type DiscoverDataSource =
  | { mode: 'live' }
  | { mode: 'preview'; cityId: number; revisionId: number };

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
 */
export type DiscoverEndpoint =
  | { kind: 'regions' }
  | { kind: 'regionGroups'; regionKey: string }
  | { kind: 'areas' }
  | { kind: 'markers' }
  | { kind: 'listings' }
  | { kind: 'listingDetail'; areaKey: string }
  | { kind: 'areaGroups' };

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
 * base path (no query string — the preview endpoints accept none today;
 * callers must not append a live-only query param, e.g. listingPurpose, in
 * preview mode).
 */
export function discoverPath(
  source: DiscoverDataSource,
  livePath: string,
  endpoint: DiscoverEndpoint,
): string {
  if (source.mode === 'live') return livePath;

  const base = `/api/admin/city-launch/cities/${source.cityId}/revisions/${source.revisionId}/preview`;
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
