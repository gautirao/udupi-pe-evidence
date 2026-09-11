import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDiscoverUrlState, type DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useDiscoverSource } from '@/features/discover/state/DiscoverDataSourceContext';
import type {
  AreaSetCameraActions,
  AreaSetCameraRestoreRequest,
  DiscoverActionsContextValue,
  DiscoverNavContextValue,
  DiscoverShellContextValue,
  DiscoverViewportContextValue,
  MobileView,
} from './types';

/**
 * Discover context facade — issue #1953 build step 1.
 *
 * FOUR separate contexts, not one. Both halves of useDiscoverUrlState's
 * return value are bare object literals recreated every render (see
 * useDiscoverUrlState.ts ~:759 `state` and ~:1660 `actions`), and the
 * viewport is written on every 300ms-debounced map pan. A single context
 * would re-render the entire Discover tree — including the right panel — on
 * every pan. Splitting viewport out, and giving actions a stable identity,
 * is the entire point of this facade.
 *
 * STEP 2 (current): this provider is now the SOLE production caller of
 * useDiscoverUrlState(). MapDiscovery.tsx and every journey panel that used
 * to call the hook directly (GuidedEntryPanel, SchoolJourneyPanels,
 * SchoolsInAreaPanel) now consume the facade via useDiscoverNav /
 * useDiscoverViewport / useDiscoverActions / useDiscoverShell instead (see
 * team-lead-plan.toml decisions.D1_facade.sole_caller).
 */

const DiscoverActionsContext = createContext<DiscoverActionsContextValue | null>(null);
const DiscoverNavContext = createContext<DiscoverNavContextValue | null>(null);
const DiscoverViewportContext = createContext<DiscoverViewportContextValue | null>(null);
const DiscoverShellContext = createContext<DiscoverShellContextValue | null>(null);

// Only DiscoverContext.tsx and useDiscoverContext.ts (the sibling module)
// should ever import these; consumers use the four exported hooks.
export {
  DiscoverActionsContext,
  DiscoverNavContext,
  DiscoverViewportContext,
  DiscoverShellContext,
};

/**
 * Exhaustive list of every DiscoverUrlActions member, used to build the
 * stable-actions proxy below. `satisfies` pins this literal array against
 * the interface at the value level; the type-level assert immediately below
 * additionally fails the BUILD (not just this array's own typing) if a key
 * is ever added to DiscoverUrlActions without being added here (AC3).
 */
const ACTION_KEYS = [
  'changeCity',
  'setCity',
  'selectArea',
  'deselectArea',
  'reportViewport',
  'setFiltersLive',
  'setFiltersCommitted',
  'setSchoolParams',
  'clearSchoolSelection',
  'clearAreaSelection',
  'setSearchQuery',
  'clearAllFiltersAndSearch',
  'setJourney',
  'selectGroup',
  'setBoardFilters',
  'setCategoryFilters',
  'clearAreaContext',
  'clearSchoolContext',
  'startOver',
  'enterSchoolPicking',
  'clearSchoolPicking',
  'backToSchoolPicking',
  'enterGroupResults',
  'clearGroupResults',
  'selectRegionalGroup',
  'setRegion',
  'setScope',
  'setRegionWithMaxKm',
  'setMaxKm',
  'clearRegionAndMaxKm',
  'setSelectedListing',
  'clearSelectedListing',
  'setLocality',
  'clearLocality',
  'clearAgriFilters',
  'setIntent',
  'setSchoolJourney',
  'goToNode',
  // #1943 pre-existing gap fix (discovered while root-causing #2017's
  // commitAreaSet ActionKeysExhaustive failure) — this key predates #2017
  // entirely and is unrelated to this PR's scope. It was already missing
  // from the exhaustive list before this PR touched the file; the build-time
  // guard just never caught it because `tsc -p tsconfig.app.json --noEmit`
  // (the actual project typecheck script) wasn't the command being run to
  // verify prior fixes to this same array. Same class of gap as the #2203
  // `enterSchoolsJourneyAtArea` entry below.
  'goToNodeReplacingCurrent',
  'goToAncestorNode',
  'clearNode',
  'enterAreasJourney',
  'enterSchoolsJourney',
  // #2203 pre-existing gap fix — this key was missing from the exhaustive
  // list (build-breaking: the `ActionKeysExhaustive` assert below resolved
  // to `never`), touched here anyway since this array is already being
  // extended for #2203's two new actions.
  'enterSchoolsJourneyAtArea',
  'buildNodeHref',
  'enterNodeListings',
  'clearNodeListings',
  // #2203 — Option A' journey-preserving node selection (School-first/Agri-first).
  'goToNodeAndClearSchoolSelection',
  'goToNodeAndClearAgriculturalLocality',
  // Issue #2016 — result-scope commit. Required here: without it,
  // `ActionKeysExhaustive` below fails the build, AND `actions.commitResultScope`
  // (the STABLE action every production caller of useDiscoverPageState actually
  // receives) would silently be undefined at runtime even though TypeScript
  // reports it as present — buildStableActions only forwards keys listed here.
  'commitResultScope',
  // Issue #2017 — multi-area AREA_SET commit. Same requirement as
  // commitResultScope above: omitting it here fails ActionKeysExhaustive AND
  // leaves `actions.commitAreaSet` silently undefined at runtime.
  'commitAreaSet',
] as const satisfies readonly (keyof DiscoverUrlActions)[];

// A deliberately-omitted (or renamed/added) DiscoverUrlActions key makes this
// type resolve to `never`, which is not assignable to `true` below — the
// build fails (AC3). Do not widen this to `boolean`.
type ActionKeysExhaustive =
  Exclude<keyof DiscoverUrlActions, (typeof ACTION_KEYS)[number]> extends never ? true : never;
const _actionKeysExhaustive: ActionKeysExhaustive = true;

/**
 * Builds the stable-actions object ONCE (see useMemo(..., []) at the call
 * site). Each exported member is a thin wrapper that always delegates to
 * whatever is currently in `actionsRef` — so the returned object's identity
 * never changes across renders even though the underlying `urlActions`
 * object passed in is a fresh literal every render.
 *
 * Unavoidable cast: Object.fromEntries necessarily loses the correlation
 * between each individual key and its specific parameter/return signature
 * (TypeScript cannot verify a heterogeneous key->function map built this
 * way). Safety is guaranteed at runtime instead: ACTION_KEYS is exhaustive
 * (enforced above) and every wrapper forwards its call, untouched, to
 * `actionsRef.current[key]`.
 */
function buildStableActions(actionsRef: { current: DiscoverUrlActions }): DiscoverUrlActions {
  const entries = ACTION_KEYS.map((key) => {
    const wrapped = (...args: unknown[]) =>
      (actionsRef.current[key] as (...a: unknown[]) => unknown)(...args);
    return [key, wrapped] as const;
  });
  return Object.fromEntries(entries) as unknown as DiscoverUrlActions;
}

export interface DiscoverProviderProps {
  children: ReactNode;
}

export function DiscoverProvider({ children }: DiscoverProviderProps) {
  const [rawUrlState, urlActions] = useDiscoverUrlState();
  // #2151 Track 1 — the ONE place that corrects city identity for every downstream
  // `nav.city || DEFAULT_CITY` consumer. A city-launch admin preview route carries no
  // `city=` query param by design (only numeric cityId/revisionId path segments), so
  // without this every display/data call site reading nav.city falls back to
  // DEFAULT_CITY ('bangalore'). The preview route's structural identity (source.citySlug,
  // resolved server-side from cityId before this provider mounts — see
  // CityLaunchPreview.tsx) is authoritative and WINS over any incidental/stray `city=`
  // query param that might be present. In live mode this is a no-op: `urlState` stays
  // referentially IDENTICAL to `rawUrlState` (not a new object), so no extra re-render is
  // introduced on the live path.
  const source = useDiscoverSource();
  const urlState = source.mode === 'preview' ? { ...rawUrlState, city: source.citySlug } : rawUrlState;

  // ─── Stable actions ────────────────────────────────────────────────────
  const actionsRef = useRef<DiscoverUrlActions>(urlActions);
  // Assign in an effect, not during render, so this component stays a pure
  // function of its props/state. Safe to defer to an effect (rather than
  // needing the render-phase write) because all three conditions below hold:
  //  1. buildStableActions dereferences the ref at CALL time, not render
  //     time: each key is wrapped as (...args) => actionsRef.current[key](...args)
  //     at lines 125-126 above. Nothing reads the ref during render.
  //  2. useRef<DiscoverUrlActions>(urlActions) above seeds the correct value,
  //     so the first mount is covered before any effect runs.
  //  3. No consumer invokes a facade action from a useLayoutEffect. A child's
  //     layout effect runs BEFORE the parent's useEffect, which is the only
  //     case where the render-phase mutation would buy anything — and it has
  //     no instance here: the entire Discover subtree contains exactly one
  //     useLayoutEffect, in MarkerPopoverCard.tsx, which only measures
  //     container dimensions and calls setMapDims.
  useEffect(() => {
    actionsRef.current = urlActions;
  });
  // Built ONCE — see team-lead-plan.toml decisions.D1_facade.stable_actions.
  // Do NOT useMemo over the ~37 individual action deps; the ref indirection
  // is what keeps this a one-line dependency array.
  const stableActions = useMemo(() => buildStableActions(actionsRef), []);

  // ─── Nav (everything except viewport) ─────────────────────────────────
  // Memoized on urlParams.toString() — the single canonical scalar for all
  // URL state — per decisions.D1_facade.nav_memo_dep, NOT on
  // urlState.filters, whose identity stability across renders is unverified.
  //
  // lat/lon/zoom are excluded from that scalar: they are the viewport's OWN
  // URL params, so leaving them in would re-invalidate nav's memo on every
  // debounced pan commit — exactly the re-render this facade's four-way
  // split exists to prevent (AC2). This still derives the key from the one
  // canonical urlParams instance; it just nets out the three keys
  // DiscoverViewportContext already owns.
  const [urlParams] = useSearchParams();
  const navKeyParams = new URLSearchParams(urlParams);
  navKeyParams.delete('lat');
  navKeyParams.delete('lon');
  navKeyParams.delete('zoom');
  const searchParamsKey = navKeyParams.toString();
  // LOAD-BEARING: keyed EXCLUSIVELY on searchParamsKey (viewport-stripped URL params), not
  // on `urlState` itself. `urlState` is read inside the factory (to build `rest`), but is
  // deliberately excluded from the deps array — its identity is unverified/likely-unstable
  // across renders, and including it would re-invalidate this memo on every render, including
  // ones triggered by pan/zoom (debounced viewport commits), which is exactly what this
  // facade's four-way context split (nav vs viewport vs shell vs actions) exists to prevent.
  // Byte-for-byte memoisation identity: this recomputes if and only if searchParamsKey changes.
  const nav = useMemo<DiscoverNavContextValue>(() => {
    const { viewport: _viewport, ...rest } = urlState;
    return rest;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see load-bearing note above; searchParamsKey is the sole intended trigger
  }, [searchParamsKey]);

  // ─── Viewport ──────────────────────────────────────────────────────────
  const viewportValue = useMemo<DiscoverViewportContextValue>(
    () => ({ viewport: urlState.viewport }),
    [urlState.viewport],
  );

  // ─── Shell (mobileView + isMobileShell) ───────────────────────────────
  // 820px is INCLUSIVE of mobile (max-width: 820px) — see
  // decisions.D3_mobile_view_state.inclusive_boundary.
  const isMobileShell = useMediaQuery('(max-width: 820px)');
  const [mobileView, setMobileView] = useState<MobileView>('LIST');

  // Reset to LIST when crossing from desktop to mobile
  // (decisions.D3_mobile_view_state.crossing_desktop_to_mobile). The ref
  // guard prevents the initial mount (where wasMobileRef is seeded to the
  // same value as isMobileShell) from firing this as a spurious transition.
  const wasMobileShellRef = useRef(isMobileShell);
  useEffect(() => {
    const wasMobile = wasMobileShellRef.current;
    if (!wasMobile && isMobileShell) {
      setMobileView('LIST');
    }
    wasMobileShellRef.current = isMobileShell;
  }, [isMobileShell]);

  // Issue #2017 — see DiscoverShellContextValue.isAreaSetDraftOpen's doc.
  // Persistent (not one-shot) so both the mobile map-anchored popover
  // (AreaSetChips) and the desktop in-panel draft view (AreaSetDraftPanel,
  // owner-directed rework) can read the SAME open/closed level regardless of
  // mount order — a level-triggered boolean is naturally race-free for the
  // "caller opens before the consumer mounts" case the old one-shot
  // pending/consume pair existed to work around.
  const [isAreaSetDraftOpen, setIsAreaSetDraftOpen] = useState(false);
  const openAreaSetDraft = useCallback(() => {
    setIsAreaSetDraftOpen(true);
  }, []);
  const closeAreaSetDraft = useCallback(() => {
    setIsAreaSetDraftOpen(false);
  }, []);

  // Issue #2017 (Fit all / focus-one) — same ref-indirection idiom as
  // `actionsRef`/`buildStableActions` above: `useDiscoverMapDataController`
  // is a DESCENDANT of this provider (it needs `nav`, itself sourced from
  // here), so it cannot hand its camera actions to this provider via a
  // prop — it registers them into this ref instead, and every consumer of
  // `shell.fitAreaSet`/`focusAreaSetMember` gets a stable function whose
  // identity never changes across renders, delegating to whatever is
  // currently registered (or safely no-op-ing before registration/after
  // unmount).
  const cameraActionsRef = useRef<AreaSetCameraActions | null>(null);
  const fitAreaSet = useCallback(() => {
    cameraActionsRef.current?.fitAreaSet();
  }, []);
  const focusAreaSetMember = useCallback((areaKey: string) => {
    cameraActionsRef.current?.focusAreaSetMember(areaKey);
  }, []);
  // Issue #2419 (PR-2) — same indirection, one non-camera action: the panel
  // owns the "Draw search area" button, the page/map side owns entering draw
  // mode. No-ops safely before registration.
  const startDrawSearchArea = useCallback(() => {
    cameraActionsRef.current?.startDrawSearchArea();
  }, []);
  const registerAreaSetCameraActions = useCallback((actions: AreaSetCameraActions | null) => {
    cameraActionsRef.current = actions;
  }, []);

  // Issue #2480 — one-shot camera-restore request, ref-backed for the same
  // reason as `cameraActionsRef` above: it must be settable/readable without
  // forcing a re-render of this provider (a re-render here would defeat the
  // point of the four-way context split), and `shell.getAreaSetCameraRestoreRequest`
  // needs to see the LATEST value when it's called from inside an effect,
  // not a stale render-time snapshot. See the EDGE-vs-level doc on
  // `DiscoverShellContextValue.getAreaSetCameraRestoreRequest` in types.ts.
  const cameraRestoreRequestRef = useRef<AreaSetCameraRestoreRequest | null>(null);
  const getAreaSetCameraRestoreRequest = useCallback(
    () => cameraRestoreRequestRef.current,
    [],
  );
  const setAreaSetCameraRestoreRequest = useCallback(
    (request: AreaSetCameraRestoreRequest | null) => {
      cameraRestoreRequestRef.current = request;
    },
    [],
  );

  const shell = useMemo<DiscoverShellContextValue>(
    () => ({
      mobileView,
      setMobileView,
      isMobileShell,
      isAreaSetDraftOpen,
      openAreaSetDraft,
      closeAreaSetDraft,
      fitAreaSet,
      focusAreaSetMember,
      startDrawSearchArea,
      registerAreaSetCameraActions,
      getAreaSetCameraRestoreRequest,
      setAreaSetCameraRestoreRequest,
    }),
    [
      mobileView,
      isMobileShell,
      isAreaSetDraftOpen,
      openAreaSetDraft,
      closeAreaSetDraft,
      fitAreaSet,
      focusAreaSetMember,
      startDrawSearchArea,
      registerAreaSetCameraActions,
      getAreaSetCameraRestoreRequest,
      setAreaSetCameraRestoreRequest,
    ],
  );

  return (
    <DiscoverActionsContext.Provider value={stableActions}>
      <DiscoverNavContext.Provider value={nav}>
        <DiscoverViewportContext.Provider value={viewportValue}>
          <DiscoverShellContext.Provider value={shell}>{children}</DiscoverShellContext.Provider>
        </DiscoverViewportContext.Provider>
      </DiscoverNavContext.Provider>
    </DiscoverActionsContext.Provider>
  );
}

/** Internal helper shared by useDiscoverContext.ts's four exported hooks. */
export function useRequiredDiscoverContext<T>(context: Context<T | null>, hookName: string): T {
  const value = useContext(context);
  if (value === null) {
    throw new Error(`${hookName} must be used within a <DiscoverProvider>`);
  }
  return value;
}
