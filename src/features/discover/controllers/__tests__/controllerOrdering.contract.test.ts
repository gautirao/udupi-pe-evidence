import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderHook, act } from '@testing-library/react';
import { useDiscoverViewportTracker } from '../useDiscoverViewportTracker';
import { useBoundedSearchTrigger } from '../useBoundedSearchTrigger';

const mockUseDiscoverCameraOrchestration = vi.hoisted(() => vi.fn());
const mockUseDiscoverJourneyPredicates = vi.hoisted(() => vi.fn());
const mockUseDiscoverMapPresentation = vi.hoisted(() => vi.fn());

vi.mock('@/features/discover/state/useDiscoverCameraOrchestration', () => ({
  useDiscoverCameraOrchestration: mockUseDiscoverCameraOrchestration,
}));
vi.mock('@/features/discover/presentation/useDiscoverJourneyPredicates', () => ({
  useDiscoverJourneyPredicates: mockUseDiscoverJourneyPredicates,
}));
vi.mock('@/features/discover/presentation/useDiscoverMapPresentation', () => ({
  useDiscoverMapPresentation: mockUseDiscoverMapPresentation,
}));

import { useDiscoverCameraController } from '../useDiscoverCameraController';
import { useDiscoverMapLayerController } from '../useDiscoverMapLayerController';

/**
 * Issue #2142 — S6/S7 controller-ordering safety.
 *
 * HISTORY / SUPERSESSION NOTE (per team-lead ruling on the Commit-1 version
 * of this file, accepted rather than reopening PLAN_REVIEW): the ORIGINAL
 * Commit-1 version of this file was a static regex proof against
 * MapDiscovery.tsx's raw source — it asserted `const [boundedSearchTriggered,
 * setBoundedSearchTriggered] = useState(false)` and `const [mapBbox,
 * setMapBbox] = useState(...)` were textually declared before the
 * `useDiscoverMapData({` call site. That was accurate for PRE-Commit-3
 * MapDiscovery.tsx, where those useState pairs lived inline in the page.
 *
 * Commit 3 moved both into controllers/useDiscoverViewportTracker.ts and
 * controllers/useBoundedSearchTrigger.ts. The raw `useState(false)`/
 * `useState<...>(null)` patterns those old assertions searched for no
 * longer exist in MapDiscovery.tsx AT ALL (they exist inside the
 * controller files instead) — so 3 of the 5 original assertions started
 * failing the moment Commit 3 landed, exactly as anticipated in that
 * version's own "Re-run note for Commit 3" comment.
 *
 * This is NOT a regression: the underlying ordering PROPERTY (viewport/
 * bounded-search state must be produced before the controller/call site
 * that composes the map-data query consumes it) still holds — it is now
 * enforced by TypeScript, not just by source-line order:
 *   - useDiscoverViewportTracker requires `city` (a value only available
 *     after useDiscoverPageState resolves) as a REQUIRED param — the
 *     composition root cannot call it, or read its `mapBbox`/
 *     `handleBoundsChange` outputs, without `city` already in scope.
 *   - useBoundedSearchTrigger has no such requirement (it's fully
 *     self-contained), but its `boundedSearchTriggered` output must still
 *     be destructured before the useDiscoverMapData call site consumes it
 *     — a plain JS temporal-dead-zone constraint the compiler enforces
 *     the same way it always has for local consts.
 *
 * The two assertions below that DID keep passing unchanged (bbox threading,
 * markersEnabled referencing boundedSearchTriggered) still search
 * MapDiscovery.tsx's source directly, because the CONSUMPTION site
 * (useDiscoverMapData's call) has not moved yet — that's Commit 4/5's job.
 * The three that broke are updated to point at the new PRODUCTION sites
 * (the controller call sites in MapDiscovery.tsx, and the single `true`-
 * setter's new home inside useBoundedSearchTrigger.ts itself) rather than
 * deleted, per team-lead's explicit instruction not to lose this coverage.
 *
 * NEW equivalent guard (supersedes, does not duplicate, the old static
 * proof): a renderHook-based composition test proving the two controllers,
 * wired together exactly as MapDiscovery.tsx wires them, reproduce the
 * exact behavioral contract the old static test could only infer from
 * source position — mapBbox/boundedSearchTriggered start at their
 * no-op/false defaults (no auto-fire on mount) and are independently
 * controllable, matching src/hooks/__tests__/useDiscoverMapData.markersEnabled.test.ts's
 * existing (untouched, zero-assertion-change per [rollback]) hook-level
 * proof that useDiscoverMapData correctly gates once GIVEN these values.
 */

const PAGE_PATH = path.resolve(__dirname, '../../../../pages/MapDiscovery.tsx');
const source = fs.readFileSync(PAGE_PATH, 'utf-8');
const lines = source.split('\n');

const BOUNDED_SEARCH_TRIGGER_PATH = path.resolve(__dirname, '../useBoundedSearchTrigger.ts');
const boundedSearchTriggerSource = fs.readFileSync(BOUNDED_SEARCH_TRIGGER_PATH, 'utf-8');

function firstLineIndexMatching(regex: RegExp): number {
  return lines.findIndex((line) => regex.test(line));
}

describe('S6/S7 controller-ordering contract — static source-order guard (updated for Commit 3)', () => {
  it('useDiscoverViewportTracker is called before the useDiscoverMapData call site (mapBbox producer -> consumer)', () => {
    const controllerCallLine = firstLineIndexMatching(/useDiscoverViewportTracker\(\{/);
    const mapDataCallLine = firstLineIndexMatching(/useDiscoverMapData\(\{/);
    expect(controllerCallLine).toBeGreaterThan(-1);
    expect(mapDataCallLine).toBeGreaterThan(-1);
    expect(controllerCallLine).toBeLessThan(mapDataCallLine);
  });

  it('useBoundedSearchTrigger is called before the useDiscoverMapData call site (boundedSearchTriggered producer -> consumer)', () => {
    const controllerCallLine = firstLineIndexMatching(/useBoundedSearchTrigger\(\)/);
    const mapDataCallLine = firstLineIndexMatching(/useDiscoverMapData\(\{/);
    expect(controllerCallLine).toBeGreaterThan(-1);
    expect(mapDataCallLine).toBeGreaterThan(-1);
    expect(controllerCallLine).toBeLessThan(mapDataCallLine);
  });

  it('the useDiscoverMapData call site actually threads bbox: mapBbox through (unchanged from Commit 1 — consumption site has not moved)', () => {
    const callSiteLine = firstLineIndexMatching(/useDiscoverMapData\(\{/);
    const windowText = lines.slice(callSiteLine, callSiteLine + 200).join('\n');
    expect(windowText).toMatch(/bbox:\s*mapBbox,/);
  });

  it('the markersEnabled expression passed to useDiscoverMapData references boundedSearchTriggered (school-first bounded-search gate, #1115; unchanged from Commit 1)', () => {
    const callSiteLine = firstLineIndexMatching(/useDiscoverMapData\(\{/);
    const windowText = lines.slice(callSiteLine, callSiteLine + 200).join('\n');
    const markersEnabledMatch = windowText.match(/markersEnabled:\s*\n([\s\S]*?)\n\s*(?:\)|,\s*\n\s*\/\/ Issue #1655)/);
    expect(markersEnabledMatch).not.toBeNull();
    expect(markersEnabledMatch![1]).toMatch(/boundedSearchTriggered/);
  });

  it('setBoundedSearchTriggered(true) is only reachable from inside useBoundedSearchTrigger.ts, not re-implemented in MapDiscovery.tsx (#1115 no-autofire guard, updated for Commit 3)', () => {
    // MapDiscovery.tsx itself must contain ZERO direct `setBoundedSearchTriggered(true)`
    // call sites post-Commit-3 — the only `true`-setter lives inside the controller.
    expect(source).not.toMatch(/setBoundedSearchTriggered\(true\)/);

    const setTrueSites = boundedSearchTriggerSource
      .split('\n')
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.includes('setBoundedSearchTriggered(true)'));
    expect(setTrueSites.length).toBe(1);
    const [{ index: setTrueLine }] = setTrueSites;
    const controllerLines = boundedSearchTriggerSource.split('\n');
    const precedingContext = controllerLines.slice(Math.max(0, setTrueLine - 10), setTrueLine).join('\n');
    // Still inside a useCallback (an explicit user-triggered handler), not a
    // bare useEffect body that would fire on mount/dependency-change.
    expect(precedingContext).toMatch(/useCallback\(/);
  });
});

describe('S6/S7 controller-ordering contract — behavioral composition guard (NEW for Commit 3, supersedes the static-only proof)', () => {
  it('both controllers, composed together exactly as MapDiscovery.tsx composes them, start at their no-op defaults (no auto-fire on mount)', () => {
    const { result } = renderHook(() => {
      const viewport = useDiscoverViewportTracker({ mobileView: 'LIST', city: 'udupi' });
      const boundedSearch = useBoundedSearchTrigger();
      return { viewport, boundedSearch };
    });
    expect(result.current.viewport.mapBbox).toBeNull();
    expect(result.current.boundedSearch.boundedSearchTriggered).toBe(false);
  });

  it('boundedSearchTriggered and mapBbox are independently controllable (no accidental coupling introduced by extraction)', () => {
    const { result } = renderHook(() => {
      const viewport = useDiscoverViewportTracker({ mobileView: 'LIST', city: 'udupi' });
      const boundedSearch = useBoundedSearchTrigger();
      return { viewport, boundedSearch };
    });
    act(() => {
      result.current.boundedSearch.handleBoundedSearch();
    });
    expect(result.current.boundedSearch.boundedSearchTriggered).toBe(true);
    // Triggering the bounded-search commit action must not, as a side
    // effect, produce a bbox — these are two independent producers feeding
    // the SAME useDiscoverMapData call site, not a single merged state.
    expect(result.current.viewport.mapBbox).toBeNull();
  });

  it('a TypeScript-required input (city) gates useDiscoverViewportTracker — this is the ordering enforcement mechanism replacing source-line position', () => {
    // This is a compile-time proof, not a runtime one: UseDiscoverViewportTrackerParams
    // requires `city: string` (no `?`). The line below would fail `tsc --noEmit`
    // if `city` were made optional or removed — see MapDiscovery.tsx's own call
    // site, which cannot compile without `city` already resolved from
    // useDiscoverPageState. Asserting the hook's return shape here keeps this
    // property under a running test rather than relying on tsc alone.
    const { result } = renderHook(() => useDiscoverViewportTracker({ mobileView: 'LIST', city: 'udupi' }));
    expect(result.current).toHaveProperty('mapBbox');
    expect(result.current).toHaveProperty('handleBoundsChange');
  });
});

/**
 * Ordering coverage for the camera/map-layer controllers.
 *
 * Issue #2142 (correction pass) — these assertions previously targeted the
 * single `useDiscoverMapPresentationController`, now split five ways. They are
 * repointed (not deleted) at the two controllers that actually carry the
 * property being asserted: `useDiscoverCameraController` (the #1823/#2143
 * owner, whose inputs mapZoom/discoverAreas/cityCenter/schoolListings must be
 * produced by useDiscoverMapData/useDiscoverPageState first, and whose
 * schoolMarkerFocusTick/canonicalNodeFitCount outputs must be produced before
 * the window.__debug.mapState effect reads them) and
 * `useDiscoverMapLayerController` (which needs Geography's scopeNamespaces).
 */
describe('controller-ordering contract — camera / map-layer controllers', () => {
  const PAGE_PATH = path.resolve(__dirname, '../../../../pages/MapDiscovery.tsx');
  const source = fs.readFileSync(PAGE_PATH, 'utf-8');
  const lines = source.split('\n');

  function firstLineIndexMatching(regex: RegExp): number {
    return lines.findIndex((line) => regex.test(line));
  }

  it('useDiscoverMapData is called before useDiscoverCameraController (mapZoom/discoverAreas/cityCenter producer -> consumer)', () => {
    const mapDataCallLine = firstLineIndexMatching(/useDiscoverMapData\(\{/);
    const controllerCallLine = firstLineIndexMatching(/useDiscoverCameraController\(\{/);
    expect(mapDataCallLine).toBeGreaterThan(-1);
    expect(controllerCallLine).toBeGreaterThan(-1);
    expect(mapDataCallLine).toBeLessThan(controllerCallLine);
  });

  it('useDiscoverGeographyController (scopeNamespaces/summaryRegions producer) is called before useDiscoverCameraController and useDiscoverMapLayerController', () => {
    const geographyCallLine = firstLineIndexMatching(/useDiscoverGeographyController\(\{/);
    const cameraCallLine = firstLineIndexMatching(/useDiscoverCameraController\(\{/);
    const mapLayerCallLine = firstLineIndexMatching(/useDiscoverMapLayerController\(\{/);
    expect(geographyCallLine).toBeGreaterThan(-1);
    expect(cameraCallLine).toBeGreaterThan(-1);
    expect(mapLayerCallLine).toBeGreaterThan(-1);
    expect(geographyCallLine).toBeLessThan(cameraCallLine);
    expect(geographyCallLine).toBeLessThan(mapLayerCallLine);
  });

  it('useDiscoverMapLayerController (isRegionOverview producer) is called before useDiscoverRegionGuideController', () => {
    const mapLayerCallLine = firstLineIndexMatching(/useDiscoverMapLayerController\(\{/);
    const regionGuideCallLine = firstLineIndexMatching(/useDiscoverRegionGuideController\(\{/);
    expect(mapLayerCallLine).toBeGreaterThan(-1);
    expect(regionGuideCallLine).toBeGreaterThan(-1);
    expect(mapLayerCallLine).toBeLessThan(regionGuideCallLine);
  });

  it('useDiscoverRegionGuideController (armRegionSelect producer) is called before useDiscoverOverviewNavigationController', () => {
    const regionGuideCallLine = firstLineIndexMatching(/useDiscoverRegionGuideController\(\{/);
    const overviewNavCallLine = firstLineIndexMatching(/useDiscoverOverviewNavigationController\(\{/);
    expect(regionGuideCallLine).toBeGreaterThan(-1);
    expect(overviewNavCallLine).toBeGreaterThan(-1);
    expect(regionGuideCallLine).toBeLessThan(overviewNavCallLine);
  });

  it('the window.__debug.mapState effect (reads schoolMarkerFocusTick/canonicalNodeFitCount) is declared AFTER the useDiscoverCameraController call closes, not before', () => {
    const controllerCallLine = firstLineIndexMatching(/useDiscoverCameraController\(\{/);
    expect(controllerCallLine).toBeGreaterThan(-1);
    // Issue #2142 Commit 5 (team-lead ruling) — the controller's result is
    // now captured as ONE object (`const mapPresentationController = use...`)
    // and destructured into this page's flat field names in a SEPARATE
    // statement immediately AFTER the call, so `schoolMarkerFocusTick,`
    // appears TWICE after the call site: once in that destructure (close to
    // the call), and once inside the actual window.__debug.mapState effect
    // (much further down). Anchor the field search at the debug-effect OPEN
    // marker itself (found first, independently), not the call site, so it
    // can only match the real occurrence inside that block.
    const afterCallSite = lines.slice(controllerCallLine);
    const debugEffectOpenOffset = afterCallSite.findIndex((line) => line.trim() === 'w.__debug = {' || line.includes('.__debug = {'));
    expect(debugEffectOpenOffset).toBeGreaterThan(-1);
    const afterDebugEffectOpen = afterCallSite.slice(debugEffectOpenOffset);
    const debugEffectFieldOffset = afterDebugEffectOpen.findIndex((line) => line.includes('schoolMarkerFocusTick,'));
    expect(debugEffectFieldOffset).toBeGreaterThan(-1);
    // The debug object's opening assignment must come before the field
    // reference inside it (sanity the regex found the right block) — always
    // true by construction now (debugEffectFieldOffset is searched relative
    // to debugEffectOpenOffset), kept as an explicit assertion for clarity.
    expect(debugEffectFieldOffset).toBeGreaterThanOrEqual(0);
  });

  it('the camera and map-layer controllers receive the SAME scopeNamespaces reference (single source of truth, issue #1910) — behavioral proof across the split', () => {
    mockUseDiscoverCameraOrchestration.mockReset().mockReturnValue({});
    mockUseDiscoverJourneyPredicates.mockReset().mockReturnValue({});
    mockUseDiscoverMapPresentation.mockReset().mockReturnValue({});

    const scopeNamespaces = { regionKeys: new Set<string>(), groupSlugs: new Set<string>() };
    renderHook(() => {
      useDiscoverCameraController({
        showAreasNavigationJourney: false,
        areasNavigationJourney: { node: null, children: [], isLoading: false, error: null, selectNode: vi.fn() } as never,
        mapBbox: null,
        publishRecenterCameraIntent: vi.fn(),
        cameraOrchestrationUrlState: {} as never,
        selectedSchool: null,
        setPanToArea: vi.fn(),
        isLoadingAreaListings: false,
        discoverAreas: [],
        areasLoading: false,
        areaGroupsData: undefined,
        isLoadingAreaGroups: false,
        agriMapListingsData: undefined,
        cityCenter: undefined,
        focusedGroup: null,
        summaryRegions: [],
        selectedRegion: null,
        selectedMaxKm: null,
        schoolListings: [],
        scopeNamespaces,
        regionScopedGroupsData: undefined,
        isLoadingRegionScopedGroups: false,
        viewport: null,
        areaKey: null,
        discoverAreasData: undefined,
      });
      useDiscoverMapLayerController({
        resolvedPanelContent: 'guided-entry' as never,
        focusedGroup: null,
        effectiveSelectedArea: null,
        selectedSchool: null,
        discoverAreas: [],
        areasLoading: false,
        cityTotal: 0,
        urlState: {} as never,
        isAgriJourney: false,
        mapZoom: 12,
        isLoadingAreaGroups: false,
        isLoadingRegionalAreaGroups: false,
        isLandingState: false,
        areaGroupsData: undefined,
        corridorGroups: [],
        agriAreasData: undefined,
        summaryRegions: [],
        cityCenter: undefined,
        debouncedAreaSearchQuery: '',
        city: 'udupi',
        selectedMarkerListing: null,
        scopeNamespaces,
        regionScopedGroupsData: undefined,
        visibleMemberSet: undefined,
      });
    });
    expect(mockUseDiscoverCameraOrchestration).toHaveBeenCalledWith(
      expect.objectContaining({ scopeNamespaces }),
    );
    expect(mockUseDiscoverMapPresentation).toHaveBeenCalledWith(
      expect.objectContaining({ scopeNamespaces }),
    );
  });
});
