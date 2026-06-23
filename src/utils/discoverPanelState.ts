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

import type { DiscoverUrlState } from '../hooks/useDiscoverUrlState';

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
