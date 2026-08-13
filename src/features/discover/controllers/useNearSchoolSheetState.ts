import { useState } from 'react';

/**
 * Issue #2142 (correction pass) — the "Near a school" overlay sheet's open
 * state, moved off MapDiscovery.tsx.
 *
 * Deliberately a leaf hook rather than a member of a larger controller: it is
 * the ONLY piece of mutable UI state the overlay surface owns, it has no
 * inputs, and it is read by nothing else on the page. Folding it into any
 * neighbouring controller would give that controller an unrelated second
 * capability; giving it a `params` object it does not need would be worse.
 *
 * Never URL-backed — opening the sheet creates no history entry (the sheet's
 * own school SELECTION does, via actions.setSchoolJourney, which is owned by
 * the journey-transitions machinery, not by this hook).
 */
export function useNearSchoolSheetState() {
  const [nearSchoolOpen, setNearSchoolOpen] = useState(false);
  return { nearSchoolOpen, setNearSchoolOpen };
}
