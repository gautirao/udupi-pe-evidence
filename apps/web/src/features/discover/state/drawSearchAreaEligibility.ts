/**
 * "Draw search area" entry-point eligibility — Issue #2419 (PR-1).
 *
 * #2419's journey matrix is binding: the entry is supported for residential
 * listing results, permitted for school -> residential homes (school radius
 * stays a FILTER, never a second ResultScope), and NOT supported for the
 * Agricultural journey or for hierarchy-only navigation states. A control the
 * shopper cannot use should not be offered as if they could.
 *
 * Three outcomes, not two, because "hide it" and "show it greyed out" answer
 * different questions. Agricultural has no POLYGON query contract at all, so
 * a greyed-out button there would advertise a feature that is never coming to
 * that journey — it is HIDDEN. A residential shopper in a city whose boundary
 * has not been imported yet is looking at a real feature that genuinely
 * cannot run for them right now — that is UNAVAILABLE, and it says why.
 *
 * Pure and input-driven so both the panel entry (this PR) and the map-side
 * draw chrome (PR-2) can share one rule rather than re-deriving it.
 */

export type DrawSearchAreaHiddenReason =
  | 'agricultural_journey'
  | 'hierarchy_only'
  /**
   * Issue #2419 (PR-2, owner ruling) — anonymous shoppers. Moved here from
   * UNAVAILABLE once the entry became a working control; see the branch in
   * `resolveDrawSearchAreaEligibility` for why a disabled control is worse
   * than an absent one now.
   */
  | 'signed_in_required';

export type DrawSearchAreaUnavailableReason =
  /**
   * Journey-eligible, but nothing in the app can enter draw mode yet:
   * `shared/map/DrawControl.tsx` mounts `L.Control.Draw` with no external
   * start handle, and wiring one requires the map canvas, owned by the #2426
   * lane. Removed by #2419 PR-2.
   */
  | 'draw_not_wired_yet'
  /**
   * The selected city has no VALID canonical CITY boundary, so #2420's
   * containment check fails closed (PolygonGeographicSafetyPolicy) and EVERY
   * polygon in that city is rejected. Not yet reachable: no API exposes
   * `canonical_boundary_geometry` status to the client (see PR #2441,
   * Blocker C). Modelled now so PR-2 only has to supply the flag.
   */
  | 'city_boundary_missing';

export type DrawSearchAreaEligibility =
  | { status: 'ELIGIBLE' }
  | { status: 'UNAVAILABLE'; reason: DrawSearchAreaUnavailableReason }
  | { status: 'HIDDEN'; reason: DrawSearchAreaHiddenReason };

export interface DrawSearchAreaEligibilityInput {
  /** `urlState.journey` — 'area-first' | 'school-first' | 'agri-first' | null. */
  journey: string | null | undefined;
  /**
   * True when the current state actually produces a residential listing
   * result set (a committed AREA_SET, or a city-wide listing state) rather
   * than being pure hierarchy navigation (City / Direction / Local
   * destination browsing with nothing selected to search).
   */
  hasResidentialListingScope: boolean;
  /**
   * Whether the selected city has an authoritative CITY boundary #2420 can
   * validate against. `undefined` means "not known to the client", which is
   * the only value available today — see `city_boundary_missing` above. Only
   * an explicit `false` suppresses the entry, so an unknown value can never
   * hide a working feature.
   */
  cityBoundaryAvailable?: boolean;
  /**
   * Whether the app can actually enter draw mode. Defaults to `false` for
   * the whole of PR-1, which is what makes the disabled entry honest rather
   * than decorative. PR-2 passes `true` once draw-mode entry exists.
   */
  isDrawModeWired?: boolean;
  /**
   * Whether the shopper is signed in. `undefined` means the caller has no auth
   * signal, and only an explicit `false` suppresses the entry — the same
   * unknown-is-permissive rule as `cityBoundaryAvailable`, so a caller that
   * has not been wired up yet can never wrongly tell a signed-in shopper to
   * sign in.
   */
  isAuthenticated?: boolean;
}

export function resolveDrawSearchAreaEligibility({
  journey,
  hasResidentialListingScope,
  cityBoundaryAvailable,
  isDrawModeWired = false,
  isAuthenticated,
}: DrawSearchAreaEligibilityInput): DrawSearchAreaEligibility {
  // Agricultural is checked FIRST and unconditionally. The Agricultural query
  // path does not consume residential POLYGON scope at all, so no other input
  // can make the entry appropriate there.
  if (journey === 'agri-first') {
    return { status: 'HIDDEN', reason: 'agricultural_journey' };
  }
  if (!hasResidentialListingScope) {
    return { status: 'HIDDEN', reason: 'hierarchy_only' };
  }
  // Issue #2419 (PR-2, owner ruling) — an anonymous shopper gets NOTHING, not
  // a disabled control.
  //
  // PR-1 returned UNAVAILABLE here, and that was right at the time: the entry
  // was disabled for everyone, so its title was the only place to say anything
  // true. PR-2 makes the control real, and the ruling's own constraint is not
  // to "expose a control that lets them complete a draw only to hit an auth
  // failure". An entry that works for one shopper and is decorative for
  // another is worse than an absent one, and the approved surface has no
  // precedent for a sign-in-gated map tool — `ExpPanel.jsx:121` renders this
  // entry unconditionally inside an eligible scope, and the kit's only
  // sign-in affordances are per-listing price and contact reveals.
  //
  // Checked BEFORE the city-boundary and wiring reasons because it is the
  // strongest statement available: those two describe a feature this shopper
  // could otherwise use, and this one says they cannot use it at all yet.
  if (isAuthenticated === false) {
    return { status: 'HIDDEN', reason: 'signed_in_required' };
  }
  if (cityBoundaryAvailable === false) {
    return { status: 'UNAVAILABLE', reason: 'city_boundary_missing' };
  }
  if (!isDrawModeWired) {
    return { status: 'UNAVAILABLE', reason: 'draw_not_wired_yet' };
  }
  return { status: 'ELIGIBLE' };
}

/**
 * Shopper-facing `title` for a disabled entry. Says what is actually true
 * rather than the previous placeholder ("Draw search area is not available
 * yet"), which gave the same non-answer in every situation.
 */
export const DRAW_SEARCH_AREA_UNAVAILABLE_TITLE: Readonly<
  Record<DrawSearchAreaUnavailableReason, string>
> = {
  draw_not_wired_yet: 'Drawing a search area is coming soon',
  city_boundary_missing: 'Drawing a search area is not available in this city yet',
};

/** Title for the ELIGIBLE (live) entry — says what the control will do. */
export const DRAW_SEARCH_AREA_ELIGIBLE_TITLE = 'Draw a boundary on the map to search inside it';
