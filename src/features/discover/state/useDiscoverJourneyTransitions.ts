import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverUrlActions, DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { clampSchoolRadiusKm, type PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import { ApiError } from '@/lib/api';
import type { useToast } from '@/hooks/use-toast';
import type { ControllerResult } from '@/features/discover/state/useDiscoverInteractionState';

/**
 * Issue #1824 Slice S6 — journey-transition orchestration (R10) extracted
 * VERBATIM out of MapDiscovery: the journey ENTER/EXIT/SWITCH handlers +
 * effects for area-first / school-first / agri-first + journeyless<->journey,
 * plus the three restore/start-over ticks (startOverTick, areaRestoreTick,
 * cityRestoreTick) and boundedSearchTriggered, whose sole writers are these
 * handlers/effects.
 *
 * See docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s6-design.md
 * for the full cut-line rationale (R10 journey vs R9 camera — S7, NOT here).
 *
 * The hook does NOT import useDiscoverUrlState or useDiscoverPageState — URL
 * and page-state ownership stay single-owner in the page. Every value/setter
 * this hook needs from those hooks is injected via params (inject-not-import,
 * S5/S6 rule).
 *
 * Camera-ordering invariants (#1801/#1806/#1118) are preserved by moving each
 * handler/effect body INTACT — no statement reordering.
 *
 * Deviation 1 from the qa-fast pre-implementation injected-dep enumeration:
 * the schoolById restore/error effect (moved verbatim below) reads
 * `selectedSchool` and `filters.schoolLat`/`filters.schoolLon` in both its
 * guard and its dep array (pre-existing behaviour, unchanged). Those two
 * values were not listed in the qa-fast digest's injected-dep enumeration —
 * they are added here as injected params (`selectedSchool`, `filters`) so
 * the effect keeps its exact guard/dep-array semantics. This does not touch
 * any forbidden surface (useDiscoverPageState itself is still not imported;
 * its `selectedSchool`/`filters` VALUES are simply injected like every other
 * useDiscoverPageState output this hook already needs).
 *
 * Deviation 2 (boundedSearchTriggered — OQ1, flagged in approved-plan.toml
 * as "the widest S6<->page coupling point ... proposed, not decided"):
 * discovered during implementation that the plan's "boundedSearchTriggered
 * useState moves into the hook" instruction creates an UNRESOLVABLE circular
 * dependency, because useDiscoverMapData.ts (NOT in this slice's allowed
 * files — forbidden to touch) is called in the page with
 * `markersEnabled: ... && boundedSearchTriggered`, i.e. it needs
 * boundedSearchTriggered's CURRENT VALUE as a plain in-scope JS variable at
 * ITS call site — but this hook's own moved effects (schoolById restore,
 * deferred areaKey hydration) need `discoverAreas`/`areasLoading`/
 * `schoolById`/`schoolByIdError`, which are OUTPUTS of that same
 * useDiscoverMapData call. Hook-call-site ordering in a function component
 * is a strict top-to-bottom JS variable dependency graph (not just a React
 * hook-order rule), so the raw `[boundedSearchTriggered, setBoundedSearchTriggered]
 * = useState(false)` pair stays declared in the page at its original early
 * position (before useDiscoverMapData, as before this slice) and is INJECTED
 * into this hook (both the current value and the setter) rather than owned
 * internally. Every WRITE SITE for boundedSearchTriggered (the actual R10
 * journey-transition logic this slice exists to move) still lives
 * exclusively in this hook's commands, calling the injected setter — so the
 * "S6 handlers are boundedSearchTriggered's sole writers" invariant holds
 * exactly as designed; only the raw useState call itself remains one file up.
 * Zero behavioural change: same value, same setter identity (React
 * guarantees useState setter stability), same read/write call sites.
 */

export interface DiscoverJourneyTransitionsView {
  startOverTick: number;
  /** Issue #1064 AC2 — resetMapTick (injected, useDiscoverPageState-owned) + startOverTick. */
  composedResetMapTick: number;
  areaRestoreTick: number;
  cityRestoreTick: number;
  boundedSearchTriggered: boolean;
  schoolFirstOnBack: (() => void) | undefined;
}

export interface DiscoverJourneyTransitionsCommands {
  startOver(): void;
  selectSchoolById(schoolId: string): void;
  clearSchool(): void;
  clearArea(): void;
  changeRadius(newRadiusKm: number): void;
  backLevel2(): void;
  backLevel1(): void;
  backLevel0(): void;
  /**
   * Issue #1115 — sole external write path for boundedSearchTriggered outside
   * the moved handlers above (which all reset it to false internally).
   * Defaults to false ("reset"); the page's bounded-search CTA calls
   * resetBoundedSearch(true) to arm the gate.
   */
  resetBoundedSearch(triggered?: boolean): void;
  wrappedSchoolSelect(school: SchoolResult | null): void;
}

export interface UseDiscoverJourneyTransitionsParams {
  urlState: DiscoverUrlState;
  urlActions: DiscoverUrlActions;

  // useDiscoverPageState — injected setters/values (SCOPE-LOCKED hook, never moved).
  selectedSchool: SchoolResult | null;
  filters: PropertyFilters;
  setSelectedArea: React.Dispatch<React.SetStateAction<AreaPoint | null>>;
  setSelectedSchool: React.Dispatch<React.SetStateAction<SchoolResult | null>>;
  setFilters: React.Dispatch<React.SetStateAction<PropertyFilters>>;
  setSchoolBoardFilter: React.Dispatch<React.SetStateAction<string[]>>;
  setPanToArea: React.Dispatch<React.SetStateAction<AreaPoint | null>>;
  resetMapTick: number;
  pendingAreaKeyRef: React.MutableRefObject<string | null>;
  initialViewportRef: React.MutableRefObject<DiscoverUrlState['viewport']>;
  initialViewportWasBareAreaRef: React.MutableRefObject<boolean>;
  resolveSignal: number;
  handleSchoolSelect: (school: SchoolResult | null) => void;

  // useDiscoverMapData outputs.
  schools: SchoolResult[];
  queryClient: QueryClient;
  schoolById: SchoolResult | undefined;
  schoolByIdError: Error | null;
  discoverAreas: AreaPoint[];
  areasLoading: boolean;

  // Page-level.
  urlBoardFilters: string[];
  schoolBoardFilter: string[];
  panelContent: DiscoverPanelContent;
  city: string;
  toast: ReturnType<typeof useToast>['toast'];

  /**
   * Deviation 2 (see file header) — kept as page-local useState (declared
   * before useDiscoverMapData) and injected here, rather than owned
   * internally, to break a circular dependency with useDiscoverMapData's
   * markersEnabled param. Every write site still lives in this hook.
   */
  boundedSearchTriggered: boolean;
  setBoundedSearchTriggered: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useDiscoverJourneyTransitions({
  urlState,
  urlActions,
  selectedSchool,
  filters,
  setSelectedArea,
  setSelectedSchool,
  setFilters,
  setSchoolBoardFilter,
  setPanToArea,
  resetMapTick,
  pendingAreaKeyRef,
  initialViewportRef,
  initialViewportWasBareAreaRef,
  resolveSignal,
  handleSchoolSelect,
  schools,
  queryClient,
  schoolById,
  schoolByIdError,
  discoverAreas,
  areasLoading,
  urlBoardFilters,
  schoolBoardFilter,
  panelContent,
  city,
  toast,
  boundedSearchTriggered,
  setBoundedSearchTriggered,
}: UseDiscoverJourneyTransitionsParams): ControllerResult<
  DiscoverJourneyTransitionsView,
  DiscoverJourneyTransitionsCommands
> {
  // Issue #1115 — gate the school-first /api/discover/markers fetch behind an explicit
  // user action (bounded-search CTA). Default false so the query does not auto-fire on
  // school select. Reset to false on every path that changes or clears the selected school
  // or radius (see reset calls below) to ensure the CTA re-appears on each new selection.
  // Deviation 2 (see file header) — boundedSearchTriggered + its setter are injected
  // (page-owned useState) rather than a local useState here.

  // Issue #1064 AC2 — Start Over must reset the map viewport to city center/zoom.
  // useDiscoverPageState owns `resetMapTick` (incremented by handleAreaBack); we need a
  // second source of truth that increments on Start Over without modifying that hook
  // (out of scope per scope-lock). We compose both into a single number passed to
  // PropertyMap.resetMapTick; MapController's handledTickRef-based guard correctly
  // detects any net increase and triggers the flyTo(cityCenter, cityZoom).
  const [startOverTick, setStartOverTick] = useState(0);

  // Issue #1160 GAP 2 — Back restoration ticks.
  // areaRestoreTick: incremented when Back is pressed from school-selected (level 2 → 1),
  //   only when areaKey is set (so AreaRestorePanner has a valid area to fly to).
  // cityRestoreTick: incremented when Back is pressed from schools-in-area (level 1 → 0).
  // Neither is incremented from handleStartOver (Start Over uses composedResetMapTick).
  const [areaRestoreTick, setAreaRestoreTick] = useState(0);
  const [cityRestoreTick, setCityRestoreTick] = useState(0);

  // Issue #1064 AC2 — composed tick + Start Over handler (see startOverTick declaration above).
  const composedResetMapTick = resetMapTick + startOverTick;
  const handleStartOver = useCallback(() => {
    urlActions.startOver();
    setStartOverTick((t) => t + 1);
    // Issue #1142 — Start Over must also clear local state that mirrors URL
    // school/area context. Without these, a competing effect re-writes schoolId
    // and radiusKm via handleFiltersChange → setSchoolParams, leaving stale params
    // in the URL after Start Over.
    setSelectedSchool(null);
    setSelectedArea(null);
    setPanToArea(null);
    // Issue #1153 — clear ALL local filter state, not just school params.
    // The previous partial-delete left bedrooms/propertyTypes/etc in local state,
    // causing ActiveContextChips to keep rendering stale chips after Start Over.
    setFilters({});
    setSchoolBoardFilter([]);
    // Issue #1115 — reset bounded-search gate so the CTA reappears on next school select.
    setBoundedSearchTriggered(false);
  }, [urlActions, setSelectedSchool, setSelectedArea, setPanToArea, setFilters, setSchoolBoardFilter, setBoundedSearchTriggered]);

  // Handler: selecting a school by ID from either the map marker click (Path A) or the
  // right-panel school card click (Path B — SchoolsInAreaPanel).
  //
  // Issue #1109 root cause: previously both paths called only urlActions.setSchoolParams,
  // which set urlState.schoolId without touching filters.schoolLat/schoolLon/schoolRadiusKm.
  // That caused useDiscoverFilteredMarkers to immediately fire a refetch (markersEnabled
  // became true) with NO school coordinates, producing a settled-state response with
  // wrong/empty markers. The school coords were only applied later when useSchoolById
  // resolved asynchronously — too late to prevent the settled-state disappearance.
  //
  // Fix: look up the school in the already-loaded schools[] array and immediately set
  // selectedSchool + filters.schoolLat/Lon/RadiusKm in the same synchronous batch.
  // This ensures useDiscoverFilteredMarkers always fires with correct school params,
  // so both the intermediate and settled-state responses contain the proximity markers.
  const handleSelectSchoolById = useCallback(
    (schoolId: string) => {
      const radiusKm = DEFAULT_SCHOOL_RADIUS_KM;
      // Look up the school from the already-loaded schools[] (from useSchoolsByArea)
      // or from React Query cache (e.g. ScopedSearch click, another mount, or deep-link prefetch).
      const school =
        schools.find((s) => s.id === schoolId) ??
        queryClient.getQueryData<SchoolResult>(['school-by-id', schoolId]) ??
        null;

      if (urlState.journey !== 'school-first' && !urlState.areaKey) {
        // If no area is selected, selecting a school flips the journey to school-first
        // (e.g. searching for a school from the area-first landing page via ScopedSearch).
        urlActions.setSchoolJourney({
          schoolId,
          radiusKm,
          lat: school?.latitude ?? urlState.viewport?.lat ?? 12.9716,
          lon: school?.longitude ?? urlState.viewport?.lon ?? 77.5946,
          zoom: urlState.viewport?.zoom ?? 14,
          areaKey: school?.areaKey ?? null,
        });
      } else {
        urlActions.setSchoolParams({ schoolId, radiusKm });
      }

      if (school) {
        setSelectedSchool(school);
        setFilters((prev) => ({
          ...prev,
          schoolLat: school.latitude,
          schoolLon: school.longitude,
          schoolRadiusKm: radiusKm,
        }));
        // Issue #1115 — new school selected; reset so the CTA reappears.
        // Must come AFTER the coord-sync batch above (#1109 regression guard).
        setBoundedSearchTriggered(false);
        return;
      }

      // If neither path resolves, fall through to the existing useSchoolById async
      // restore effect which will set state once the fetch resolves. The placeholderData
      // in useDiscoverFilteredMarkers bridges the visual gap.
      // Issue #1115 — reset on fall-through too (coords will be set by the async effect).
      setBoundedSearchTriggered(false);
    },
    [
      urlActions,
      schools,
      setSelectedSchool,
      setFilters,
      queryClient,
      urlState.journey,
      urlState.areaKey,
      urlState.viewport,
      setBoundedSearchTriggered,
    ],
  );

  // Radius change handler for SchoolSelectedPanel — uses REPLACE (not PUSH) per AC1.
  const handleRadiusChange = useCallback(
    (newRadiusKm: number) => {
      if (!urlState.schoolId) return;
      // Issue #1210: clamp so a 0 km (or sub-minimum) request never reaches URL/state.
      const radiusKm = clampSchoolRadiusKm(newRadiusKm);
      urlActions.setSchoolParams({ schoolId: urlState.schoolId, radiusKm });
      setFilters((prev) => ({ ...prev, schoolRadiusKm: radiusKm }));
      // Issue #1115 — radius change re-gates the search; CTA must reappear so the user
      // explicitly triggers a new bounded search for the updated radius.
      setBoundedSearchTriggered(false);
    },
    [urlState.schoolId, urlActions, setFilters, setBoundedSearchTriggered],
  );

  // Issue #1143 — in-page Back for school-first journey levels.
  //
  // Level 2 (school-selected): clears schoolId + radiusKm, preserves areaKey.
  //   clearSchoolSelection is REPLACE — does not add a history entry.
  //   Local school state mirrors are cleared to keep filters consistent.
  //
  // Level 1 (schools-in-area): clears areaKey, preserves journey.
  //   clearAreaSelection is REPLACE.
  //   Local selectedArea is cleared so the map re-centres to city level.
  //
  // Level 0 (school-browse): no Back — onBack undefined, PanelHeader hides button.
  const handleSchoolFirstBackLevel2 = useCallback(() => {
    // Issue #1160 GAP 2: if areaKey is set, increment areaRestoreTick so AreaRestorePanner
    // re-fits the map to the area bounds after the school context is cleared.
    // Read urlState.areaKey at call-time (stable closure — urlState is re-derived each render).
    // Do NOT increment from handleStartOver (Start Over uses composedResetMapTick instead).
    //
    // Issue #1160 v3 Bug B: when areaKey is null (top-level school-selected deep-link with
    // no area context), there is no area to restore to — instead fly back to city center
    // via CityRestorePanner.
    if (urlState.areaKey != null) {
      setAreaRestoreTick((t) => t + 1);
    } else {
      setCityRestoreTick((t) => t + 1);
    }
    urlActions.clearSchoolSelection();
    setSelectedSchool(null);
    setFilters((prev) => {
      const next = { ...prev };
      delete next.schoolLat;
      delete next.schoolLon;
      delete next.schoolRadiusKm;
      return next;
    });
    // Issue #1115 — school cleared; reset so CTA reappears on next school select.
    setBoundedSearchTriggered(false);
  }, [urlState.areaKey, urlActions, setSelectedSchool, setFilters, setBoundedSearchTriggered]);

  const handleSchoolFirstBackLevel1 = useCallback(() => {
    // Issue #1160 GAP 2: increment cityRestoreTick so CityRestorePanner re-flies
    // the map to city center/zoom after the area context is cleared.
    // Only fires in school-first journey (this handler is only called from schoolFirstOnBack).
    // Do NOT increment from handleStartOver.
    //
    // Issue #1485 — when returning from schools-in-area (Level 3) to school-group-areas
    // (Level 2), we clear areaKey but KEEP groupId. The existing cityRestoreTick increment
    // is correct: after clearing areaKey the group fitBounds effect (L1360-1396) will
    // re-trigger on the still-set groupId and fit to the group bounds.
    setCityRestoreTick((t) => t + 1);
    urlActions.clearAreaSelection();
    setSelectedArea(null);
    setPanToArea(null);
  }, [urlActions, setSelectedArea, setPanToArea]);

  // Issue #1485 — Level 0 Back for school-group-areas → school-browse.
  // Clears groupId (PUSH from selectGroup(null)); areaKey and schoolId are already absent
  // at this level. The cityRestoreTick increment returns the map to city-center view.
  const handleSchoolFirstBackLevel0 = useCallback(() => {
    setCityRestoreTick((t) => t + 1);
    urlActions.selectGroup(null);
  }, [urlActions]);

  // schoolFirstOnBack: the correct in-page Back handler for the current school-first
  // panel level, or undefined when Back should be hidden (Level 0/browse or non-school journey).
  //
  // Issue #1485 — 4-level ladder (new levels L0 + L1 added):
  //   L3 school-selected / area-school-combined → handleSchoolFirstBackLevel2 (clear schoolId)
  //   L2 schools-in-area                        → handleSchoolFirstBackLevel1 (clear areaKey, keep groupId)
  //   L1 school-group-areas                     → handleSchoolFirstBackLevel0 (clear groupId)
  //   L0 school-browse                          → undefined (no Back)
  const schoolFirstOnBack: (() => void) | undefined =
    urlState.journey !== 'school-first'
      ? undefined
      : panelContent === 'school-selected' || panelContent === 'area-school-combined'
        ? handleSchoolFirstBackLevel2
        : panelContent === 'schools-in-area'
          ? handleSchoolFirstBackLevel1
          : panelContent === 'school-group-areas'
            ? handleSchoolFirstBackLevel0
            : undefined;

  // Clear handlers for AreaSchoolCombinedPanel — stable references so the panel does
  // not re-render on every map pan/zoom that re-runs the MapDiscovery render.
  const onClearSchool = useCallback(() => {
    // Single atomic URL mutation: removes schoolId + radiusKm. Preserves areaKey,
    // journey, board/category filters. Local selectedSchool state and proximity
    // fields in PropertyFilters are cleared separately (no URL mutation).
    urlActions.clearSchoolContext();
    setSelectedSchool(null);
    setFilters((prev) => {
      const next = { ...prev };
      delete next.schoolLat;
      delete next.schoolLon;
      delete next.schoolRadiusKm;
      return next;
    });
    // Issue #1115 — school cleared; reset so CTA reappears on next school select.
    setBoundedSearchTriggered(false);
  }, [urlActions, setSelectedSchool, setFilters, setBoundedSearchTriggered]);

  const onClearArea = useCallback(() => {
    // Removes areaKey from URL (REPLACE). Preserves schoolId, radiusKm,
    // board/category filters, property filters, and viewport.
    urlActions.clearAreaContext();
    setSelectedArea(null);
  }, [urlActions, setSelectedArea]);

  // Issue #1115 — sole external write path for boundedSearchTriggered outside the
  // moved handlers above. Defaults to false ("reset"); the page's bounded-search CTA
  // (handleBoundedSearch, page-owned — not moved) calls resetBoundedSearch(true) to
  // arm the gate. The page's handleAreaFirstBack (also not moved — area-first Back
  // wrapper) calls resetBoundedSearch() (false) when it clears a selected school.
  const resetBoundedSearch = useCallback((triggered = false) => {
    setBoundedSearchTriggered(triggered);
  }, [setBoundedSearchTriggered]);

  // Issue #1115 — wrap handleSchoolSelect (from useDiscoverPageState, forbidden to edit)
  // so that selecting a school via MapFilters or NearSchoolSheet also resets the
  // bounded-search gate. useDiscoverPageState.ts is not modified; reset is composed here
  // at the call-site where the handler is passed down.
  const wrappedSchoolSelect = useCallback<typeof handleSchoolSelect>((school) => {
    setBoundedSearchTriggered(false);
    handleSchoolSelect(school);
  }, [handleSchoolSelect, setBoundedSearchTriggered]);

  // Sync URL → local schoolBoardFilter (which drives the chip UI inside NearSchoolSheet).
  // The URL is the source of truth; local state mirrors it so chip-toggle UI reads the
  // active set without re-parsing the URL. Both arrays are compared via JSON to avoid an
  // infinite loop when the array identity changes but the contents are equal.
  const urlBoardKey = urlBoardFilters.join('|');
  useEffect(() => {
    if (schoolBoardFilter.join('|') !== urlBoardKey) {
      setSchoolBoardFilter(urlBoardFilters);
    }
    // urlBoardKey alone captures the contents; setSchoolBoardFilter is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlBoardKey]);

  // School restore on cold-load — runs once schoolById resolves (exact ID lookup, not substring search).
  const urlSchoolId = urlState.schoolId;
  const urlRadiusKm = urlState.radiusKm;

  // Keep urlActions in a ref so the cleanup effect below doesn't need it in its dep array,
  // avoiding a potential stale-closure/infinite-loop when the actions object identity changes.
  const urlActionsRef = useRef(urlActions);
  urlActionsRef.current = urlActions;

  useEffect(() => {
    // Issue #1160 v5 — outer guard change: fire when selectedSchool is missing OR when
    // filters.schoolLat is not yet set. The original `!selectedSchool` guard was too
    // strict: in the top-level cold-cache path, handleSelectSchoolById falls through
    // without setting selectedSchool or filters.schoolLat. If selectedSchool was
    // subsequently set by another path (e.g. a prior in-session selection that was not
    // fully cleared) while filters.schoolLat remained null, the !selectedSchool guard
    // would skip the entire effect body — markersEnabled stays false permanently because
    // markersEnabled requires filters.schoolLat != null.
    // Fix: also enter the body when filters.schoolLat is not yet synced, regardless of
    // selectedSchool state. The inner dedup guard below prevents redundant setFilters
    // calls when coords are already in sync.
    if (urlSchoolId && schoolById && (!selectedSchool || filters.schoolLat == null)) {
      // Dedup guard: when coords are already in sync (e.g. Bug A1 sync injection already
      // applied them), skip redundant setFilters to avoid an extra render. Still ensure
      // selectedSchool is set so downstream effects (SchoolFocusPanner, panel routing)
      // observe a non-null school.
      if (filters.schoolLat === schoolById.latitude && filters.schoolLon === schoolById.longitude) {
        if (!selectedSchool) setSelectedSchool(schoolById);
        return;
      }
      // Issue #1210: clamp on cold-load/restore so a `?radiusKm=0` deep-link (or a 0
      // reintroduced by browser Back) never lands in runtime state as 0.
      const radius = urlRadiusKm != null ? clampSchoolRadiusKm(urlRadiusKm) : DEFAULT_SCHOOL_RADIUS_KM;
      setSelectedSchool(schoolById);
      setFilters((prev) => ({ ...prev, schoolLat: schoolById.latitude, schoolLon: schoolById.longitude, schoolRadiusKm: radius }));
      // Issue #1146 — AC4: When radiusKm was absent from the URL (hand-crafted link,
      // old app version), backfill the default into the URL so it becomes honest.
      // Issue #1210: also rewrite when the URL carried a sub-minimum value (e.g. 0) so
      // the address bar reflects the clamped effective radius after restore.
      // Uses replace:true — this is housekeeping on cold-load mount, not a user
      // navigation event. A push here would create a phantom history entry that
      // breaks browser Back (Issue #1146 cycle-2 blocking fix / BN-4 contract).
      // Note: urlSchoolId is guaranteed non-null by the outer if-block; the
      // redundant `&& urlSchoolId` guard that was here has been removed.
      if (urlRadiusKm == null || urlRadiusKm !== radius) {
        urlActionsRef.current.setSchoolParams({ schoolId: urlSchoolId, radiusKm: radius }, { replace: true });
      }
    }
    // filters.schoolLat/schoolLon are read inside the guard above to detect prior sync injection,
    // so they belong in the dep array. selectedSchool is already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSchoolId, urlRadiusKm, schoolById, selectedSchool, filters.schoolLat, filters.schoolLon, setSelectedSchool, setFilters]);

  // Error cleanup — if the school lookup fails, clear the URL param and inform the user.
  // 404: silently drop (school no longer exists, no need to alarm the user).
  // Non-404 ApiError or network error (TypeError): clear param + show recoverable toast so the
  // user knows what happened and can search again.
  useEffect(() => {
    if (!urlSchoolId || !schoolByIdError) return;
    // Issue #1115 — school lookup failed; reset so CTA reappears on next school select.
    setBoundedSearchTriggered(false);
    if (schoolByIdError instanceof ApiError && schoolByIdError.status === 404) {
      urlActionsRef.current.setSchoolParams(null);
    } else {
      // Non-404 server errors and network failures (TypeError from fetch rejection).
      urlActionsRef.current.setSchoolParams(null);
      toast({
        title: 'School details unavailable',
        description: 'Could not load the selected school. Please search again.',
        variant: 'destructive',
      });
    }
  }, [urlSchoolId, schoolByIdError, toast, setBoundedSearchTriggered]);

  // Refs kept current every render so the deferred areaKey-hydration effect can read
  // them without adding unstable objects to its dep array (FLAG-1 — these refs are
  // used ONLY inside that effect, so they move into the hook with it).
  const cityRef = useRef(city);
  cityRef.current = city;
  const urlCityRef = useRef(urlState.city ?? city);
  urlCityRef.current = urlState.city ?? city;

  // Deferred areaKey hydration — resolve once area data loads (Rule 2).
  // Lives here because it references refs from useDiscoverPageState AND data from useDiscoverMapData.
  const { deselectArea } = urlActions;
  useEffect(() => {
    if (areasLoading) return;
    const pending = pendingAreaKeyRef.current;
    if (!pending) return;
    pendingAreaKeyRef.current = null;
    const match = discoverAreas.find((a) => a.areaKey === pending);
    if (match) {
      setSelectedArea(match);
      // Issue #1821 — only trust an inherited viewport (skip the area-specific fit)
      // when the mount-time URL was a bare area-only deep link (no groupId/scope).
      // When a group/region drill-down was present at mount, any inherited viewport
      // is presumptively the group's/region's own fit, not a genuinely restored
      // area-specific one, so always fit fresh to the resolved area's own bounds.
      if (!initialViewportRef.current || !initialViewportWasBareAreaRef.current) {
        setPanToArea(match);
      }
    } else if (cityRef.current !== urlCityRef.current) {
      // Local city (drives the areas query) hasn't synced with the URL city yet —
      // discoverAreas may be stale. Re-arm and wait for the re-fetch to complete.
      pendingAreaKeyRef.current = pending;
    } else {
      deselectArea();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areasLoading, discoverAreas, deselectArea, resolveSignal]);

  const commands = useMemo<DiscoverJourneyTransitionsCommands>(
    () => ({
      startOver: handleStartOver,
      selectSchoolById: handleSelectSchoolById,
      clearSchool: onClearSchool,
      clearArea: onClearArea,
      changeRadius: handleRadiusChange,
      backLevel2: handleSchoolFirstBackLevel2,
      backLevel1: handleSchoolFirstBackLevel1,
      backLevel0: handleSchoolFirstBackLevel0,
      resetBoundedSearch,
      wrappedSchoolSelect,
    }),
    [
      handleStartOver,
      handleSelectSchoolById,
      onClearSchool,
      onClearArea,
      handleRadiusChange,
      handleSchoolFirstBackLevel2,
      handleSchoolFirstBackLevel1,
      handleSchoolFirstBackLevel0,
      resetBoundedSearch,
      wrappedSchoolSelect,
    ],
  );

  return {
    view: {
      startOverTick,
      composedResetMapTick,
      areaRestoreTick,
      cityRestoreTick,
      boundedSearchTriggered,
      schoolFirstOnBack,
    },
    commands,
  };
}
