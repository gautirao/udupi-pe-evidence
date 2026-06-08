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
 *   area-groups-landing   — area-first journey, no areaKey yet (always; groupId optional)
 *   area-selected         — area-first journey, area selected (areaKey present)
 *   school-browse         — school-first journey, no school selected
 *   schools-in-area       — school-first journey, area selected (schoolId absent)
 *   school-selected       — school-first journey, schoolId present
 *   area-school-combined  — area selected AND school selected (both present)
 */

import type { DiscoverUrlState } from '../hooks/useDiscoverUrlState';

export type DiscoverPanelContent =
  | 'guided-entry'
  | 'agri-landing'
  | 'agri-selected'
  | 'area-groups-landing'
  | 'area-selection'
  | 'area-selected'
  | 'school-browse'
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
  const { journey, areaKey, schoolId, groupId, schoolPicking } = urlState;

  // MVP2 — agri-first is checked FIRST (before every other branch, including the
  // area/school cold-load inferences below) so a stray schoolId / groupId / schoolPicking
  // in the URL can never make agri fall through to another panel.
  //
  // Issue #1371: when an areaKey is also present the user has selected an area on the
  // map → route to the agri-selected detail panel. Otherwise (no areaKey) keep the
  // static landing prompt.
  if (journey === 'agri-first') {
    if (areaKey) {
      return 'agri-selected';
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
