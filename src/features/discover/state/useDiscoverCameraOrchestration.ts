import { useEffect, useMemo, useRef, useState } from 'react';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { AgriMapListingsResponse } from '@/hooks/useAgriMapListings';
import type { DiscoverSummaryRegion } from '@/hooks/useDiscoverSummary';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { computeGroupBounds } from '@/utils/discoverGroupBounds';
import { getSectorBounds } from '@/lib/geo';
import { matchesMacroRegion, labelToSlug } from '@/utils/macroRegionResolver';

/**
 * Issue #1824 Slice S7 — camera panner/tick orchestration (R9) extracted
 * VERBATIM out of MapDiscovery: the two camera ticks (schoolFocusTick,
 * schoolMarkerFocusTick) + their one-shot writer effects, and the three
 * fitBounds effects (group / macro-region scope / agri-group).
 *
 * See docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s7-design.md
 * for the full camera-owner invariant table (#1801/#1806/#1118/#1547/#1815/#1821).
 *
 * The hook does NOT import useDiscoverUrlState, useDiscoverPageState, or
 * useDiscoverJourneyTransitions — every value it needs from those hooks is
 * injected via params (inject-not-import, S5/S6/S7 rule). FLAT return (no
 * atomic multi-field transition exists here — reject ControllerResult, per
 * S2a/S4 precedent).
 *
 * DEVIATION (discovered during implementation, mirrors S6's Deviation 2 for
 * boundedSearchTriggered — see useDiscoverJourneyTransitions.ts's file
 * header): the plan's move-list also named `mapBbox` + `bboxTimerRef` +
 * `handleBoundsChange` + their cleanup effect + the city-change bbox-reset
 * effect. Moving those into THIS hook creates an unresolvable circular
 * dependency: `mapBbox` is read as a plain in-scope JS variable by
 * `useDiscoverMapData({ bbox: mapBbox, ... })` in the page, which must be
 * called BEFORE this hook (this hook needs useDiscoverMapData's OUTPUTS —
 * discoverAreas/areasLoading/isLoadingAreaGroups/isLoadingAreaListings — and
 * the page-derived schoolListings/focusedGroup that are only computable
 * after that call). A JS variable cannot be read before the function call
 * that produces it, so `mapBbox` cannot live inside a hook that is itself
 * called after `useDiscoverMapData`. Resolving this by duplicating
 * useDiscoverMapData's internal `useDiscoverAreas` fetch+mapping earlier in
 * the page (to unblock calling this hook first) would be a genuine new
 * behaviour, not a verbatim move — out of scope per the plan's
 * OUT_OF_SCOPE_FUNCTIONAL_FIX stop condition. `mapBbox`/`bboxTimerRef`/
 * `handleBoundsChange`/the cleanup effect/the city-change reset effect
 * therefore stay declared in MapDiscovery.tsx, UNCHANGED, at their original
 * position (before useDiscoverPageState/useDiscoverMapData) — zero
 * behavioural change, same state, same setter identity, same call sites.
 * Every OTHER camera effect (schoolFocusTick, the #1547 schoolMarkerFocusTick
 * fit-once, group/scope/agri fitBounds) has no such ordering constraint and
 * moves into this hook exactly as planned.
 *
 * Every moved effect/guard/dep-array/ref-advance below is preserved
 * BYTE-FOR-BYTE relative to MapDiscovery.tsx @c4d6ee2d — this is the
 * camera-owner surface; a statement-order or dep-array drift here can
 * reintroduce a camera snap-back/jitter/loop regression (#1547/#1815).
 */

export interface UseDiscoverCameraOrchestrationParams {
  /**
   * DiscoverUrlState fields the camera effects actually read. Injected
   * read-only — the hook never calls a urlActions writer.
   */
  urlState: Pick<
    DiscoverUrlState,
    'journey' | 'radiusKm' | 'groupId' | 'areaKey' | 'scope' | 'selectedLocality'
  >;
  /** useDiscoverPageState — injected values/setters (SCOPE-LOCKED hook, never moved). */
  selectedSchool: SchoolResult | null;
  setPanToArea: React.Dispatch<React.SetStateAction<AreaPoint | null>>;
  /** useDiscoverMapData outputs — injected. */
  isLoadingAreaListings: boolean;
  discoverAreas: AreaPoint[];
  areasLoading: boolean;
  areaGroupsData: { groups: AreaGroup[] } | undefined;
  isLoadingAreaGroups: boolean;
  agriMapListingsData: AgriMapListingsResponse | undefined;
  cityCenter: [number, number] | undefined;
  /**
   * Issue #1824 S7 OQ2 — the page's OWN focusedGroup/summaryRegions useMemo
   * references, injected as-is (NOT recomputed here). The group-fit and
   * scope-fit dep arrays below rely on these being the SAME stable
   * reference across renders that don't actually change the resolved
   * group/regions — recomputing a fresh object here would give the
   * one-shot effects a new identity every render and re-fire spuriously.
   */
  focusedGroup: AreaGroup | null;
  summaryRegions: DiscoverSummaryRegion[];
  /** Page-derived scalars (urlState.selectedRegion/selectedMaxKm ?? null). */
  selectedRegion: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | null;
  selectedMaxKm: 10 | 25 | 50 | 100 | null;
  /** Page-derived — #1547 fit-once keys off selectedSchoolId + this array's length. */
  schoolListings: DiscoverCityListingItem[];
}

export interface UseDiscoverCameraOrchestrationResult {
  schoolFocusTick: number;
  schoolMarkerFocusTick: number;
  schoolFocusLat: number | undefined;
  schoolFocusLon: number | undefined;
  agriGroupFocusBounds: [[number, number], [number, number]] | null;
}

export function useDiscoverCameraOrchestration({
  urlState,
  selectedSchool,
  setPanToArea,
  isLoadingAreaListings,
  discoverAreas,
  areasLoading,
  areaGroupsData,
  isLoadingAreaGroups,
  agriMapListingsData,
  cityCenter,
  focusedGroup,
  summaryRegions,
  selectedRegion,
  selectedMaxKm,
  schoolListings,
}: UseDiscoverCameraOrchestrationParams): UseDiscoverCameraOrchestrationResult {
  // Issue #1160 — school-focus tick for SchoolFocusPanner in PropertyMap.
  // Incremented when the selected school changes (new school ID) or when radiusKm
  // changes while a school is selected in school-first journey. The tick pattern
  // mirrors resetMapTick/startOverTick so SchoolFocusPanner fires exactly once per
  // increment without creating a feedback loop with ViewportWatcher.
  const [schoolFocusTick, setSchoolFocusTick] = useState(0);

  // Issue #1160 GAP 1 — SchoolMarkerFocusPanner: fires fitBounds after listings settle.
  // schoolMarkerFocusTick is incremented when listings are ready (non-empty, query settled).
  // Feedback-loop safety: the tick is only incremented by the listingsReadyKey effect, which
  // gates on a primitive string (not array identity). schoolMarkerFocusTick itself is NOT in
  // the dep array. ViewportWatcher does not write to this tick.
  const [schoolMarkerFocusTick, setSchoolMarkerFocusTick] = useState(0);

  // Issue #1160 — increment schoolFocusTick when the selected school changes or when
  // radiusKm changes while a school is selected in the school-first journey.
  //
  // Guards:
  //   1. journey === 'school-first': area-first journey must not be affected.
  //   2. selectedSchool with lat/lon present: SchoolFocusPanner requires hydrated coords.
  //      This handles the hydration-race edge case — the tick is not incremented until
  //      the school object (with latitude/longitude) is actually available.
  //   3. Dependency array contains selectedSchool?.id and urlState.radiusKm so the
  //      effect fires once per school change and once per radius change — NOT on every
  //      map-move event. schoolFocusTick itself is NOT in the dep array (would loop).
  //
  // Feedback-loop safety: SchoolFocusPanner reads schoolFocusTick and uses a
  // handledTickRef guard to act at most once per increment. ViewportWatcher fires
  // reportViewport on moveend/zoomend, but that only updates URL viewport params —
  // it does NOT write to schoolFocusTick, so no loop can form.
  const selectedSchoolId = selectedSchool?.id;
  const selectedSchoolLat = selectedSchool?.latitude;
  const selectedSchoolLon = selectedSchool?.longitude;
  useEffect(() => {
    if (urlState.journey !== 'school-first') return;
    if (selectedSchoolLat == null || selectedSchoolLon == null) return;
    setSchoolFocusTick((t) => t + 1);
  }, [selectedSchoolId, urlState.radiusKm, urlState.journey, selectedSchoolLat, selectedSchoolLon]);

  // Issue #1160 GAP 1 — listingsReadyKey: a stable primitive string that changes only when
  // all three conditions are true simultaneously:
  //   1. a school is selected (selectedSchoolId non-null)
  //   2. the area listings query has settled (!isLoadingAreaListings — boolean, not array identity)
  //   3. at least one listing is within the school radius (schoolListings.length > 0 — a number)
  // When null, SchoolMarkerFocusPanner does not fire. schoolListings.length is a number
  // (primitive) so it does not cause spurious identity changes; only isLoadingAreaListings
  // is guarded to prevent the array-identity concern flagged in qa-fast risk (b).
  const listingsReadyKey = useMemo((): string | null => {
    if (selectedSchoolId == null) return null;
    if (isLoadingAreaListings) return null;
    if (schoolListings.length === 0) return null;
    return `${selectedSchoolId}_${urlState.radiusKm ?? 0}_ready`;
  }, [selectedSchoolId, isLoadingAreaListings, schoolListings.length, urlState.radiusKm]);

  // Increment schoolMarkerFocusTick when listingsReadyKey transitions to a NEW non-null value.
  // listingsReadyKey is null when listings are empty or query not settled → Phase-1 SchoolFocusPanner
  // still fires first (handles the school-center focus); this only fires when markers are present.
  //
  // Issue #1547 ITEM 6 FIX — bbox-refetch zoom-reset bug:
  // The original code incremented on every non-null dep-change. listingsReadyKey encodes
  // `${schoolId}_${radiusKm}_ready`, which is a CONSTANT for a given school+radius selection.
  // A user zoom-in triggers a bbox refetch → isLoadingAreaListings toggles true → false → the
  // listingsReadyKey transitions null→same-string again → the tick incremented → SchoolMarkerFocusPanner
  // re-fired fitBounds(maxZoom=13) and snapped the map back. Fix: track the last KEY that
  // caused an increment in a ref; only increment when the key is DIFFERENT from the last handled.
  // This means a new school selection (different schoolId or radiusKm → new key string) still
  // triggers a fresh fit, but a bbox-driven loading-toggle to the SAME key is a no-op.
  const lastFittedListingsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (listingsReadyKey == null) return;
    if (listingsReadyKey === lastFittedListingsKeyRef.current) return;
    lastFittedListingsKeyRef.current = listingsReadyKey;
    setSchoolMarkerFocusTick((t) => t + 1);
  }, [listingsReadyKey]);

  // ── Group-focused map behaviour (A3 #993) ────────────────────────────────────
  //
  // When a group is selected (groupId set), fitBounds to cover all member areas —
  // but ONLY when groupId changes and no areaKey is set. When areaKey is set, the
  // existing per-area fitBounds applies.
  //
  // fitBounds is triggered by calling setPanToArea with a synthetic AreaPoint whose
  // bbox is the union of all member areas' bboxes. This reuses PropertyMap's existing
  // AreaPanner effect (the F7 debounce) with zero new fitBounds machinery.
  const prevGroupIdRef = useRef<string | null>(null);
  const prevAreaKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Guard: wait for area data AND group-membership data before computing
    // bounds. This must run BEFORE updating refs — on cold load with
    // ?groupId= the effect fires while areasLoading=true, and if refs were
    // updated here the transition check would see groupChanged=false on the
    // second fire (when data has loaded) and skip fitBounds.
    //
    // Issue #1815 live-e2e follow-up: areasLoading alone is not sufficient.
    // `discoverAreas` (gated by areasLoading) and `areaGroupsData` (gated by
    // isLoadingAreaGroups, used the same way by the scope-fit effect below)
    // are two INDEPENDENT async fetches. Gating on isLoadingAreaGroups too
    // ensures focusedGroup.area_keys is actually resolved before the refs
    // (and thus the one-shot signal) ever advance — see the #1815 test for
    // the full bimodal pill-count race this prevents.
    if (!urlState.groupId) return;
    if (areasLoading) return;
    if (isLoadingAreaGroups) return;

    // Now that data is ready, compare against the previous stable values and advance refs.
    const groupChanged = urlState.groupId !== prevGroupIdRef.current;
    const areaKeyCleared =
      prevAreaKeyRef.current !== null && urlState.areaKey === null;

    prevGroupIdRef.current = urlState.groupId;
    prevAreaKeyRef.current = urlState.areaKey;

    // Only act when no area is selected
    if (urlState.areaKey !== null) return;
    // Act on group change OR when areaKey was just cleared (back navigation)
    if (!groupChanged && !areaKeyCleared) return;

    // Resolve member areas — filter discoverAreas to the group's area_keys.
    // Areas not in discoverAreas (partial membership) are silently dropped.
    const groupAreaKeys = focusedGroup?.area_keys ?? [];
    const memberAreas = discoverAreas.filter((a) => groupAreaKeys.includes(a.areaKey));
    const bounds = computeGroupBounds(memberAreas);
    if (bounds) {
      setPanToArea(bounds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.groupId, urlState.areaKey, areasLoading, isLoadingAreaGroups, discoverAreas, areaGroupsData]);

  // Issue #1745 Bug 2 — fitBounds to member areas when a macro-region scope is selected
  // so the user does not need to manually zoom out to see corridors in that macro region.
  const prevScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!urlState.scope) return;
    if (areasLoading || isLoadingAreaGroups) return;

    const scopeChanged = urlState.scope !== prevScopeRef.current;
    prevScopeRef.current = urlState.scope;

    if (urlState.groupId !== null || urlState.areaKey !== null) return;
    if (!scopeChanged) return;

    const groups = areaGroupsData?.groups ?? [];
    const targetGroups = groups.filter(
      (g) =>
        g.id === urlState.scope ||
        g.name.toLowerCase() === urlState.scope?.toLowerCase() ||
        labelToSlug(g.name) === urlState.scope ||
        matchesMacroRegion(g.region_label, urlState.scope, summaryRegions)
    );

    let memberAreas: typeof discoverAreas = [];
    if (targetGroups.length > 0) {
      const groupAreaKeys = targetGroups.flatMap((g) => g.area_keys ?? []);
      memberAreas = discoverAreas.filter((a) => groupAreaKeys.includes(a.areaKey));
    } else if (urlState.scope === 'other' || urlState.scope === 'unmapped') {
      const allGroupAreaKeys = new Set(groups.flatMap((g) => g.area_keys ?? []));
      memberAreas = discoverAreas.filter((a) => !allGroupAreaKeys.has(a.areaKey));
    }

    const bounds = computeGroupBounds(memberAreas);
    if (bounds) {
      setPanToArea(bounds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.scope, urlState.groupId, urlState.areaKey, areasLoading, isLoadingAreaGroups, discoverAreas, areaGroupsData, summaryRegions]);

  // Issue #1410 (B3) — viewport-fit when agri group listings arrive.
  // Uses a state variable fed into PropertyMap's focusBounds so it's consistent with how
  // all other fitBounds effects work in this page (no direct mapRef access).
  const [agriGroupFocusBounds, setAgriGroupFocusBounds] = useState<[[number, number], [number, number]] | null>(null);

  useEffect(() => {
    // Issue #1429/#1447 — use selectedRegion + selectedMaxKm (corridor-first cumulative model)
    if (!selectedRegion || selectedMaxKm == null) {
      setAgriGroupFocusBounds(null);
      return;
    }

    // Issue #1480 — when a locality/town is selected, frame only that town's listings.
    // Locality branch takes priority over corridor framing; early-return prevents overwrite.
    const selectedLocality = urlState.selectedLocality ?? null;
    if (selectedLocality) {
      const localityListings = (agriMapListingsData?.listings ?? []).filter(
        (l) =>
          l.latitude != null &&
          l.longitude != null &&
          (l.locality ?? l.areaKey) === selectedLocality,
      );
      if (localityListings.length > 0) {
        const lats = localityListings.map((l) => l.latitude as number);
        const lons = localityListings.map((l) => l.longitude as number);
        setAgriGroupFocusBounds([
          [Math.min(...lats), Math.min(...lons)],
          [Math.max(...lats), Math.max(...lons)],
        ]);
      } else {
        // Locality matched no listings with valid coords — fall back to sector framing.
        const sectorBounds = cityCenter
          ? getSectorBounds(cityCenter[0], cityCenter[1], selectedRegion, selectedMaxKm)
          : null;
        setAgriGroupFocusBounds(sectorBounds);
      }
      return;
    }

    // Issue #1447 — include sector geometry in map fit so the directional cone is
    // always fully framed, even when listings are sparse or clustered near the centroid.
    const sectorBounds = cityCenter
      ? getSectorBounds(cityCenter[0], cityCenter[1], selectedRegion, selectedMaxKm)
      : null;

    // Filter out listings with null/undefined lat/lon before spreading into Math.min/max.
    // AgriMapListingItem declares latitude/longitude as number, but the server can return null
    // when the DB column is null; Math.min/max(undefined) = NaN which corrupts Leaflet fitBounds.
    const validListings = (agriMapListingsData?.listings ?? []).filter(
      l => l.latitude != null && l.longitude != null
    );

    let listingBounds: [[number, number], [number, number]] | null = null;
    if (validListings.length) {
      const lats = validListings.map(l => l.latitude as number);
      const lons = validListings.map(l => l.longitude as number);
      listingBounds = [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ];
    }

    if (!sectorBounds && !listingBounds) {
      setAgriGroupFocusBounds(null);
      return;
    }

    if (!sectorBounds) {
      // cityCenter unavailable (unknown city slug) — fall back to listing-only bounds
      setAgriGroupFocusBounds(listingBounds);
      return;
    }

    if (!listingBounds) {
      // No valid listings — frame the sector cone alone
      setAgriGroupFocusBounds(sectorBounds);
      return;
    }

    // Union: expand to contain both the sector geometry and visible listings
    setAgriGroupFocusBounds([
      [Math.min(sectorBounds[0][0], listingBounds[0][0]), Math.min(sectorBounds[0][1], listingBounds[0][1])],
      [Math.max(sectorBounds[1][0], listingBounds[1][0]), Math.max(sectorBounds[1][1], listingBounds[1][1])],
    ]);
  }, [selectedRegion, selectedMaxKm, agriMapListingsData, cityCenter, urlState.selectedLocality]);

  return {
    schoolFocusTick,
    schoolMarkerFocusTick,
    schoolFocusLat: selectedSchoolLat,
    schoolFocusLon: selectedSchoolLon,
    agriGroupFocusBounds,
  };
}
