/**
 * Issue #2660 — the AREA-leaf result-source model and its pure resolver.
 *
 * C2 extracted the resolution out of `AreaLeafListingsSurface`; C4 replaces the
 * four parallel prop families that used to reach the leaf (map AREA_SET /
 * anon VIEWPORT / auth VIEWPORT / POLYGON — ~16 loose booleans, arrays and
 * callbacks) with ONE explicit contract, `AreaLeafResultSourceView`:
 *
 *   - `areaBase`: the map's already-fetched AREA_SET listings for the leaf
 *     (`useDiscoverMapData`'s `areaListings` query). Present in EVERY scope,
 *     because it is not only the AREA-scope data: it is also where a VIEWPORT
 *     scope's error/retry and every scope's `fetching` come from (T1/T5 —
 *     pinned quirks, see below). Omitted entirely by a standalone caller, in
 *     which case the leaf falls back to its own query.
 *   - `scope`: the committed result scope, a discriminated union mirroring
 *     `useDiscoverMapData`'s own `resultScope.kind`. Each non-area kind
 *     carries exactly the data that scope really has — the AUTH viewport has no
 *     error/retry of its own (none exists upstream); the ANON viewport (#1793)
 *     and POLYGON do. The shapes are kept honest rather than padded into a
 *     common type.
 */
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

/** The committed-scope kind only (no data) — the memoised discriminant. */
export type CommittedAreaResultScope =
  | { kind: 'area' }
  | { kind: 'viewport'; audience: 'anon' | 'auth' }
  | { kind: 'polygon' };

/** The committed result scope WITH the data that scope actually carries. */
export type AreaLeafScopeSource =
  | { kind: 'area' }
  | {
      kind: 'viewport';
      audience: 'anon' | 'auth';
      listings: DiscoverCityListingItem[] | undefined;
      loading: boolean | undefined;
      /**
       * Issue #1793 SR-024 — ANON viewport only: the viewport query's own error/retry. The auth
       * viewport has none of its own and keeps the pinned T1 behaviour (AREA base error/retry).
       */
      error?: boolean | undefined;
      retry?: (() => void) | undefined;
    }
  | {
      kind: 'polygon';
      listings: DiscoverCityListingItem[] | undefined;
      loading: boolean | undefined;
      error: boolean | undefined;
      retry: (() => void) | undefined;
    };

/** The map's already-fetched AREA_SET listings (a query result keyed to one areaKey). */
export interface AreaLeafAreaBase {
  listings: DiscoverCityListingItem[] | undefined;
  /**
   * The areaKey `listings` is keyed to. Trusted ONLY when it equals the
   * resolved leaf's own areaKey (#2353 code-review fix — a legacy `areaKey=`
   * URL param can make the map's selection diverge from the `node=` leaf).
   */
  areaKey: string | null;
  loading: boolean | undefined;
  /** keepPreviousData refresh-in-flight signal (#2353). */
  fetching: boolean | undefined;
  error: boolean | undefined;
  retry: (() => void) | undefined;
}

export interface AreaLeafResultSourceView {
  /** Omitted by standalone callers — the leaf then uses its own fallback query. */
  areaBase?: AreaLeafAreaBase;
  scope: AreaLeafScopeSource;
}

/**
 * The flat committed-scope signals `useDiscoverMapData` publishes (and the
 * page's panel `geography` view group carries verbatim). Every key is
 * REQUIRED-but-possibly-undefined on purpose: a caller passing its geography
 * object straight through gets a compile error if any of these names drifts,
 * instead of a silently-unset optional field.
 */
export interface AreaLeafScopeSignals {
  isAnonViewport: boolean | undefined;
  anonViewportListings: DiscoverCityListingItem[] | undefined;
  anonViewportListingsLoading: boolean | undefined;
  isAuthViewport: boolean | undefined;
  authViewportListings: DiscoverCityListingItem[] | undefined;
  authViewportListingsLoading: boolean | undefined;
  isPolygonScope: boolean | undefined;
  polygonListings: DiscoverCityListingItem[] | undefined;
  polygonListingsLoading: boolean | undefined;
  isErrorPolygonListings: boolean | undefined;
  refetchPolygonListings: (() => void) | undefined;
  /**
   * Issue #1793 SR-024 — the anon viewport query's own error + refetch. OPTIONAL (unlike the
   * rest) so every existing caller keeps compiling; production (`AreaFirstJourneyPanel`) always
   * supplies both, from `view.geography.isErrorAnonViewport` /
   * `commands.geography.refetchAnonViewport`.
   */
  isErrorAnonViewport?: boolean | undefined;
  refetchAnonViewport?: (() => void) | undefined;
}

export interface ResolvedAreaLeafResultSource {
  origin: 'map' | 'viewport' | 'polygon' | 'own-query';
  listings: DiscoverCityListingItem[];
  loading: boolean;
  fetching: boolean;
  error: boolean;
  retry: () => void;
  /** Mirrors the original `isViewportScope` prop threaded to `AreaSelectedPanel`. */
  isViewportScope: boolean;
}

/**
 * Maps the flat viewport/polygon flags onto the committed-scope kind,
 * preserving the pre-extraction precedence exactly: anon viewport, then auth
 * viewport, then polygon.
 *
 * Design decision (Issue #2660, referencing T10 —
 * `DiscoverAreasJourneyPanel.characterization2660.test.tsx`, "T10 —
 * isAuthViewport and isPolygonScope are structurally mutually exclusive"):
 * `isAuthViewport && isPolygonScope` is PROVEN unreachable — both flags are
 * computed from the SAME `resultScope.kind` discriminant in
 * `useDiscoverMapData.ts`, which can hold only one value at a time. Checking
 * viewport ahead of polygon therefore never discards a real, simultaneously-
 * true polygon selection; the ordering only agrees with the original inline
 * precedence for combinations that cannot occur on real data.
 */
export function deriveCommittedAreaResultScope(flags: {
  isAnonViewport?: boolean;
  isAuthViewport?: boolean;
  isPolygonScope?: boolean;
}): CommittedAreaResultScope {
  if (flags.isAnonViewport) return { kind: 'viewport', audience: 'anon' };
  if (flags.isAuthViewport) return { kind: 'viewport', audience: 'auth' };
  if (flags.isPolygonScope) return { kind: 'polygon' };
  return { kind: 'area' };
}

/**
 * The typed adapter from the flat committed-scope signals to the
 * discriminated `AreaLeafScopeSource`: picks the kind via
 * `deriveCommittedAreaResultScope` and attaches ONLY that kind's own data
 * (the anon listings for an anon viewport, never the auth ones, etc.).
 */
export function toAreaLeafScopeSource(signals: AreaLeafScopeSignals): AreaLeafScopeSource {
  const scope = deriveCommittedAreaResultScope(signals);
  switch (scope.kind) {
    case 'viewport':
      return scope.audience === 'anon'
        ? {
            kind: 'viewport',
            audience: 'anon',
            listings: signals.anonViewportListings,
            loading: signals.anonViewportListingsLoading,
            error: signals.isErrorAnonViewport,
            retry: signals.refetchAnonViewport,
          }
        : {
            kind: 'viewport',
            audience: 'auth',
            listings: signals.authViewportListings,
            loading: signals.authViewportListingsLoading,
          };
    case 'polygon':
      return {
        kind: 'polygon',
        listings: signals.polygonListings,
        loading: signals.polygonListingsLoading,
        error: signals.isErrorPolygonListings,
        retry: signals.refetchPolygonListings,
      };
    case 'area':
      return { kind: 'area' };
    default: {
      const exhaustive: never = scope;
      return exhaustive;
    }
  }
}

/**
 * True when the caller supplied the map's already-fetched listings AND they
 * are keyed to THIS resolved leaf (#2353). `undefined`-specific on purpose: an
 * empty array is a real, settled "0 listings" result and is trusted.
 */
export function isAreaBaseMatched(areaBase: AreaLeafAreaBase | undefined, leafAreaKey: string): boolean {
  return areaBase?.listings !== undefined && areaBase.areaKey === leafAreaKey;
}

/**
 * The resolver's inputs, normalised to one flat, primitive-per-field record
 * so the calling hook can memoise on individual values (H1 — never on a
 * freshly-constructed wrapper object).
 */
export interface AreaLeafResultSourceInputs {
  /** `isAreaBaseMatched(...)` for the resolved leaf. */
  hasMapAreaListings: boolean;
  areaBase: {
    listings: DiscoverCityListingItem[] | undefined;
    loading: boolean | undefined;
    fetching: boolean | undefined;
    error: boolean | undefined;
    retry: (() => void) | undefined;
  };
  /** Data of the committed NON-area scope (unused for kind 'area'). */
  substituted: {
    listings: DiscoverCityListingItem[] | undefined;
    loading: boolean | undefined;
    /** POLYGON and ANON viewport (#1793) — the AUTH viewport has no error/retry of its own. */
    error: boolean | undefined;
    retry: (() => void) | undefined;
  };
  /** The ONE remaining fallback query's already-resolved snapshot (see `useAreaLeafResultSource.ts`). */
  ownQuery: {
    listings: DiscoverCityListingItem[];
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    refetch: () => void;
  };
}

export function resolveAreaLeafResultSource(
  scope: CommittedAreaResultScope,
  sources: AreaLeafResultSourceInputs,
): ResolvedAreaLeafResultSource {
  // T5 (commit 0, pinned quirk) — `fetching` NEVER branches on scope. It is
  // uniformly "the map's fetching signal when a matched map base is present,
  // else the fallback query's isFetching" across EVERY scope kind — no
  // viewport/polygon source carries a fetching signal of its own.
  const fetching = sources.hasMapAreaListings
    ? (sources.areaBase.fetching ?? false)
    : sources.ownQuery.isFetching;

  if (scope.kind === 'viewport') {
    // Issue #1793 SR-024 (approved AC A2) — AMENDS the T1 quirk below for the ANON viewport only:
    // its error/retry are the viewport query's OWN. Under T1 they came from the AREA base, but that
    // query is disabled during a viewport scope and can never error, so a failed "Search this
    // area" request was invisible and rendered as a zero-result state.
    if (scope.audience === 'anon') {
      return {
        origin: 'viewport',
        isViewportScope: true,
        listings: sources.substituted.listings ?? [],
        loading: sources.substituted.loading ?? false,
        fetching,
        error: sources.substituted.error ?? false,
        retry: sources.substituted.retry ?? (() => undefined),
      };
    }
    // T1 (commit 0, pinned quirk) — still true for the AUTH viewport: cards/loading come from the
    // viewport scope, but error/retry come from the AREA base (the matched map base, else the
    // fallback query) — the auth viewport carries no error/retry of its own.
    return {
      origin: 'viewport',
      isViewportScope: true,
      listings: sources.substituted.listings ?? [],
      loading: sources.substituted.loading ?? false,
      fetching,
      error: sources.hasMapAreaListings ? (sources.areaBase.error ?? false) : sources.ownQuery.isError,
      retry: sources.hasMapAreaListings ? (sources.areaBase.retry ?? (() => undefined)) : sources.ownQuery.refetch,
    };
  }

  if (scope.kind === 'polygon') {
    // Issue #2461 — under a committed POLYGON the error/retry pair belongs to
    // the polygon listings query actually being rendered, never to the
    // AREA-keyed query (which is disabled by the hook and can't error).
    return {
      origin: 'polygon',
      isViewportScope: false,
      listings: sources.substituted.listings ?? [],
      loading: sources.substituted.loading ?? false,
      fetching,
      error: sources.substituted.error ?? false,
      retry: sources.substituted.retry ?? (() => undefined),
    };
  }

  // scope.kind === 'area'
  if (sources.hasMapAreaListings) {
    return {
      origin: 'map',
      isViewportScope: false,
      listings: sources.areaBase.listings ?? [],
      loading: sources.areaBase.loading ?? false,
      fetching,
      error: sources.areaBase.error ?? false,
      retry: sources.areaBase.retry ?? (() => undefined),
    };
  }
  return {
    origin: 'own-query',
    isViewportScope: false,
    listings: sources.ownQuery.listings,
    loading: sources.ownQuery.isLoading,
    fetching,
    error: sources.ownQuery.isError,
    retry: sources.ownQuery.refetch,
  };
}
