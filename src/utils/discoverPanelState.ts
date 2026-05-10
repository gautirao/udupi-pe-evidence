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
  const { journey, areaKey, schoolId } = urlState;

  // Combined: area + school are co-active regardless of journey
  if (areaKey && schoolId) {
    return 'area-school-combined';
  }

  if (journey === 'school-first') {
    if (schoolId) {
      return 'school-selected';
    }
    if (areaKey) {
      return 'schools-in-area';
    }
    return 'school-browse';
  }

  if (journey === 'area-first') {
    if (areaKey) {
      return 'area-selected';
    }
    return 'area-groups-landing';
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

  return 'guided-entry';
}
