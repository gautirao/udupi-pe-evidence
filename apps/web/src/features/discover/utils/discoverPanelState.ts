/**
 * discoverPanelState
 *
 * Pure helper — no hooks, no side effects. Derives the right-panel content
 * state from the current URL state. This is the single source of truth for
 * what the DiscoverRightPanel should render.
 *
 * Panel states (audit-aligned with issue #990):
 *
 *   guided-entry          — no journey selected (landing state)
 *   agri-landing          — agri-first journey, no areaKey yet (always; stray keys ignored)
 *   agri-selected         — agri-first journey, areaKey present (Issue #1371)
 *   agri-group-selected   — agri-first journey, regional group selected, no areaKey (Issue #1425)
 *   agri-group-peek       — agri-first journey, regional group selected + specific listing chosen (Issue #1430)
 *   agri-group-locality   — agri-first journey, regional group selected + locality drill-down (Issue #1464)
 *   area-groups-landing   — area-first journey, no areaKey yet (always; groupId optional)
 *   area-selected         — area-first journey, area selected (areaKey present)
 *   school-browse         — school-first journey, no group/school selected (Level 1 zones)
 *   school-group-areas    — school-first journey, groupId selected but no areaKey/schoolId (Level 2 areas)
 *   schools-in-area       — school-first journey, area selected (schoolId absent)
 *   school-selected       — school-first journey, schoolId present
 *   area-school-combined  — area selected AND school selected (both present)
 */

import type { DiscoverJourney, DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

export type DiscoverPanelContent =
  | 'guided-entry'
  | 'agri-landing'
  | 'agri-selected'
  | 'agri-group-selected'
  | 'agri-group-peek'
  | 'agri-group-locality'
  | 'agri-detail'
  | 'area-groups-landing'
  | 'area-group-results'
  | 'area-selection'
  | 'area-selected'
  | 'school-browse'
  | 'school-group-areas'
  | 'schools-in-area'
  | 'school-selected'
  | 'area-school-combined';

/**
 * Derive the right-panel content state from the current URL state.
 *
 * Priority order (most specific first):
 * 1. Both area and school selected → area-school-combined
 * 2. School-first journey:
 *    a. schoolId present → school-selected
 *    b. areaKey present (no schoolId) → schools-in-area
 *    c. Neither → school-browse
 * 3. Area-first journey:
 *    a. areaKey present → area-selected
 *    b. no areaKey → area-groups-landing (groupId is optional; panel renders group cards or browse-all)
 * 4. No journey → guided-entry
 */
export function derivePanelContent(urlState: DiscoverUrlState): DiscoverPanelContent {
  const { journey, areaKey, schoolId, groupId, schoolPicking, groupResults, selectedGroup, selectedRegion, selectedMaxKm, selectedListing, selectedLocality } = urlState;

  // MVP2 — agri-first is checked FIRST (before every other branch, including the
  // area/school cold-load inferences below) so a stray schoolId / groupId / schoolPicking
  // in the URL can never make agri fall through to another panel.
  //
  // Issue #1371: when an areaKey is also present the user has selected an area on the
  // map → route to the agri-selected detail panel. Otherwise (no areaKey) keep the
  // static landing prompt.
  //
  // Issue #1429: when BOTH region AND maxKm are set (two-level corridor selection),
  // route to agri-group-selected (corridor + distance tier chosen).
  // When only region is set (corridor selected, no distance), stay on agri-landing
  // so the user can pick a distance tier.
  // Issue #1425 (legacy selectedGroup): also routes to agri-group-selected for backward compat.
  // areaKey always wins — user has selected a specific area.
  if (journey === 'agri-first') {
    if (areaKey) {
      return 'agri-selected';
    }
    // Issue #1430: region + maxKm + listing all set → agri-group-peek (Level-2 peek)
    // Must come BEFORE agri-group-locality and agri-group-selected so a listing
    // selection opens the peek panel even when a locality is also set.
    if (selectedRegion != null && selectedMaxKm != null && selectedListing != null) {
      return 'agri-group-peek';
    }
    // Issue #1464: region + maxKm + locality set (no listing) → agri-group-locality drill-down.
    // Placed AFTER peek check (listing wins) and BEFORE agri-group-selected.
    if (selectedRegion != null && selectedMaxKm != null && selectedLocality != null) {
      return 'agri-group-locality';
    }
    // Issue #1429: both region + maxKm set → agri-group-selected
    // (optional fields — undefined treated as null/not-set)
    if (selectedRegion != null && selectedMaxKm != null) {
      return 'agri-group-selected';
    }
    // Issue #1425 legacy: selectedGroup set → agri-group-selected
    if (selectedGroup) {
      return 'agri-group-selected';
    }
    return 'agri-landing';
  }

  if (journey === 'school-first') {
    if (areaKey && schoolId) {
      return 'area-school-combined';
    }
    if (schoolId) {
      return 'school-selected';
    }
    if (areaKey) {
      return 'schools-in-area';
    }
    // Issue #1485 — groupId set (no areaKey, no schoolId) → Level-2 area list for this zone.
    // Placed AFTER the schoolId/areaKey guards so those always take precedence.
    // MUST be inside the school-first branch so a stray groupId in area-first journey
    // (area-groups-landing) never routes here. Non-blank guard mirrors the area-first pattern.
    if (groupId?.trim()) {
      return 'school-group-areas';
    }
    return 'school-browse';
  }

  if (journey === 'area-first') {
    if (areaKey && schoolId) {
      return 'area-school-combined';
    }
    // Issue #1157 — area-first "add a school in this area" sub-step. The transient
    // schoolPicking marker shows the schools-in-area panel WITHOUT flipping journey.
    // Guarded by !schoolId and placed after the area-school-combined check so schoolId
    // always wins precedence (selecting a school routes to area-school-combined).
    if (areaKey && schoolPicking && !schoolId) {
      return 'schools-in-area';
    }
    if (areaKey) {
      return 'area-selected';
    }
    // Issue #1597 — group-results view: journey=area-first + groupId present +
    // groupResults flag + NO areaKey + NO schoolId.
    // areaKey is already checked above and is absent here.
    // schoolId guard: a stray schoolId (without areaKey) in the area-first
    // journey must NOT route to area-group-results (spec: NO schoolId).
    // groupId must be non-blank (mirrors school-group-areas trim guard).
    // A stray groupResults without groupId must NOT route to a phantom state.
    if (groupResults && groupId?.trim() && !schoolId) {
      return 'area-group-results';
    }
    return 'area-groups-landing';
  }

  // Combined: area + school are co-active (no explicit journey, or cross-journey state)
  if (areaKey && schoolId) {
    return 'area-school-combined';
  }

  // Cold-load restoration: schoolId present without explicit journey.
  // This handles direct URLs like /discover?city=udupi&schoolId=sch-1&radiusKm=2
  if (schoolId) {
    return 'school-selected';
  }

  // Infer area-first journey when areaKey is present without explicit journey.
  // This handles area-only cold-load URLs like /discover?city=udupi&areaKey=udupi-west
  if (areaKey && schoolPicking && !schoolId) {
    return 'schools-in-area';
  }
  if (areaKey) {
    return 'area-selected';
  }

  // Infer area-first journey when groupId is present without an explicit journey,
  // areaKey, or schoolId. Handles deep-links like /discover?city=udupi&groupId=coastal-homes
  // where the journey param was omitted. The panel renders group cards; groupId validity
  // is not checked here (pure function — panel handles unknown groups gracefully).
  if (groupId) {
    return 'area-groups-landing';
  }

  return 'guided-entry';
}

/**
 * Issue #1953 (density/aria-selected fix) — derives which journey tab (if
 * any) should read `aria-selected` when the URL's `journey` param itself is
 * absent but `derivePanelContent` has already inferred a journey from
 * `areaKey`/`schoolId`/`groupId` alone (the journey-less deep-link/cold-load
 * URLs constructed by LandingPage, AreaCtaBlock, AreaGuide, AreaGuideHero,
 * Trends, etc.).
 *
 * Callers should prefer the real `journey` URL param when present and only
 * fall back to this inference — see DiscoverRightPanel:
 *   `activeJourney={journey ?? inferJourneyFromPanelContent(panelContent)}`
 *
 * Product-owner ruling: a valid Discover state may never leave the
 * persistent mode selector with no active tab — every reachable state must
 * resolve to exactly one selected journey tab. `guided-entry` (the bare
 * landing, no journey chosen yet) is the sole, deliberate exception.
 *
 * `area-school-combined` — WHY this maps to 'school-first' below, and why
 * that is narrower than "this state is school-led":
 *
 * The underlying state is genuinely MIXED, not school-led. Two subsystems
 * already reach PAST panelContent to the real `journey` URL param for
 * exactly this reason, because behaviour genuinely differs by journey even
 * though panelContent collapses both into the same value:
 *   - useMarkerSelection.ts (~line 171, Issue #1738): "derivePanelContent
 *     routes BOTH area-first and school-first area+school selections to the
 *     same 'area-school-combined' panelContent, so schoolId/panelContent
 *     alone can't distinguish them" — it checks `journey === 'area-first'`
 *     explicitly to decide whether to keep writing the shared `listing`
 *     param (marker/card sync + popover). School-first does NOT get that
 *     write.
 *   - useDiscoverJourneyTransitions.ts (~line 376): treats this state as
 *     school-first Back level L3, but ONLY when `urlState.journey ===
 *     'school-first'` is true — it does not infer that from panelContent.
 *
 * This function is NEVER consulted when `journey` is present (the
 * `journey ?? …` fallback above short-circuits it). The ONLY reachable path
 * into this branch for 'area-school-combined' is the journey-less branch at
 * the bottom of derivePanelContent (a cold-load URL carrying `areaKey` AND
 * `schoolId` with NO `journey` param). On that specific path, every
 * observable behaviour THAT KEYS OFF panelContent ALONE already renders as
 * school-first, and NOTHING on the path behaves as area-first:
 *   - SchoolRadiusMapOverlay gates the school radius overlay on panelContent
 *     alone and renders it (isSchoolRadiusOverlayState).
 *   - MapDiscovery renders that radius legend overlay (`schoolRadiusOverlay`,
 *     MapDiscovery.tsx:1446) — a legend, not a "pill".
 *   - useMarkerSelection's own write condition,
 *     `(schoolId == null || journey === 'area-first')`, is FALSE when
 *     schoolId is set and journey is absent — so it does NOT write
 *     `listing` on this path, i.e. it already behaves as school-first.
 *
 * Stated precisely rather than conveniently: the journey-GATED affordances are
 * simply ABSENT here, not school-first. `schoolFirstOnBack`
 * (useDiscoverJourneyTransitions.ts:377) short-circuits on
 * `journey !== 'school-first'`, so the school-first Back control does not
 * render on a journey-less URL — that is neither journey's behaviour. It does
 * not change the direction of this mapping, since nothing on the path is
 * area-first, but "every observable behaviour matches school-first" would be
 * an overstatement and this comment is meant to be trusted.
 *
 * So this mapping resolves the JOURNEY-LESS COLD-LOAD CASE ONLY. It does
 * NOT mean the mixed area+school state is school-led in general, and it
 * must NOT be read as license to delete the `journey === 'area-first'` /
 * `journey === 'school-first'` checks in useMarkerSelection.ts or
 * useDiscoverJourneyTransitions.ts — those exist precisely because
 * panelContent alone can't distinguish the two journeys once both an area
 * and a school are selected. Deleting them would reintroduce the #1738 bug.
 */
export function inferJourneyFromPanelContent(
  panelContent: DiscoverPanelContent,
): DiscoverJourney | null {
  switch (panelContent) {
    case 'agri-landing':
    case 'agri-selected':
    case 'agri-group-selected':
    case 'agri-group-peek':
    case 'agri-group-locality':
    case 'agri-detail':
      return 'agri-first';
    case 'area-groups-landing':
    case 'area-group-results':
    case 'area-selection':
    case 'area-selected':
      return 'area-first';
    case 'school-browse':
    case 'school-group-areas':
    case 'schools-in-area':
    case 'school-selected':
      return 'school-first';
    case 'area-school-combined':
      // See the function-level doc comment above: this resolves the
      // journey-less cold-load case only (area+school, no `journey` param).
      // Do not generalize this to "school-led" — the state is mixed.
      return 'school-first';
    case 'guided-entry':
      return null;
    default: {
      const _exhaustive: never = panelContent;
      return _exhaustive;
    }
  }
}
