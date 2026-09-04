import { describe, expect, it } from 'vitest';
import { resolveDrawSearchAreaEligibility } from './drawSearchAreaEligibility';

/**
 * Issue #2419 (PR-1) — the binding journey matrix from the issue:
 * residential yes, school -> homes yes, Agricultural never, hierarchy-only no.
 */
describe('resolveDrawSearchAreaEligibility', () => {
  it('hides the entry in the Agricultural journey', () => {
    expect(
      resolveDrawSearchAreaEligibility({
        journey: 'agri-first',
        hasResidentialListingScope: true,
        cityBoundaryAvailable: true,
        isDrawModeWired: true,
      }),
    ).toEqual({ status: 'HIDDEN', reason: 'agricultural_journey' });
  });

  // The Agricultural query contract has no POLYGON support at all, so no
  // other input may override this — not even a fully wired, fully eligible
  // city. A greyed-out button there would advertise a feature that is never
  // coming to that journey.
  it('keeps the Agricultural journey hidden regardless of every other input', () => {
    for (const hasResidentialListingScope of [true, false]) {
      for (const cityBoundaryAvailable of [true, false, undefined]) {
        for (const isDrawModeWired of [true, false]) {
          expect(
            resolveDrawSearchAreaEligibility({
              journey: 'agri-first',
              hasResidentialListingScope,
              cityBoundaryAvailable,
              isDrawModeWired,
            }).status,
          ).toBe('HIDDEN');
        }
      }
    }
  });

  it('hides the entry in hierarchy-only navigation states', () => {
    expect(
      resolveDrawSearchAreaEligibility({
        journey: 'area-first',
        hasResidentialListingScope: false,
        isDrawModeWired: true,
      }),
    ).toEqual({ status: 'HIDDEN', reason: 'hierarchy_only' });
  });

  // The school journey keeps school radius as a FILTER, not a second
  // ResultScope, so a polygon combines with it rather than replacing it.
  it('allows the entry in the school -> residential homes journey', () => {
    expect(
      resolveDrawSearchAreaEligibility({
        journey: 'school-first',
        hasResidentialListingScope: true,
        cityBoundaryAvailable: true,
        isDrawModeWired: true,
      }),
    ).toEqual({ status: 'ELIGIBLE' });
  });

  it('reports the entry unavailable when the city has no canonical boundary', () => {
    expect(
      resolveDrawSearchAreaEligibility({
        journey: 'area-first',
        hasResidentialListingScope: true,
        cityBoundaryAvailable: false,
        isDrawModeWired: true,
      }),
    ).toEqual({ status: 'UNAVAILABLE', reason: 'city_boundary_missing' });
  });

  // Only an explicit false suppresses it. The client cannot learn the real
  // value yet (PR #2441 Blocker C), and an unknown value must never hide a
  // feature that in fact works.
  it('does not suppress the entry when boundary availability is unknown', () => {
    expect(
      resolveDrawSearchAreaEligibility({
        journey: 'area-first',
        hasResidentialListingScope: true,
        cityBoundaryAvailable: undefined,
        isDrawModeWired: true,
      }),
    ).toEqual({ status: 'ELIGIBLE' });
  });

  // This is what makes PR-1's disabled entry honest rather than decorative:
  // nothing in the app can enter draw mode yet.
  it('defaults to unavailable-because-not-wired, which is PR-1 behaviour', () => {
    expect(
      resolveDrawSearchAreaEligibility({
        journey: 'area-first',
        hasResidentialListingScope: true,
      }),
    ).toEqual({ status: 'UNAVAILABLE', reason: 'draw_not_wired_yet' });
  });

  it('prefers the city-boundary reason over the not-wired reason', () => {
    expect(
      resolveDrawSearchAreaEligibility({
        journey: 'area-first',
        hasResidentialListingScope: true,
        cityBoundaryAvailable: false,
        isDrawModeWired: false,
      }),
    ).toEqual({ status: 'UNAVAILABLE', reason: 'city_boundary_missing' });
  });

  // Main Agent ruling: polygon search is signed-in-only in PR-1. UNAVAILABLE
  // rather than HIDDEN, because unlike Agricultural this is a real feature for
  // this shopper, one sign-in away — so naming the requirement beats silently
  // removing the control.
  it('reports the entry unavailable, not hidden, for an anonymous shopper', () => {
    expect(
      resolveDrawSearchAreaEligibility({
        journey: 'area-first',
        hasResidentialListingScope: true,
        cityBoundaryAvailable: true,
        isDrawModeWired: true,
        isAuthenticated: false,
      }),
    ).toEqual({ status: 'UNAVAILABLE', reason: 'signed_in_required' });
  });

  // The composition passes `undefined` while auth resolves, because its own
  // `isAuthenticated` reads false during that window even for a signed-in
  // shopper. Blocking on unknown would flash a sign-in demand at them.
  it('does not suppress the entry when the auth state is unknown', () => {
    expect(
      resolveDrawSearchAreaEligibility({
        journey: 'area-first',
        hasResidentialListingScope: true,
        cityBoundaryAvailable: true,
        isDrawModeWired: true,
        isAuthenticated: undefined,
      }),
    ).toEqual({ status: 'ELIGIBLE' });
  });

  // Signing in would not help in Agricultural, so it stays hidden outright.
  it('keeps Agricultural hidden for an anonymous shopper too', () => {
    expect(
      resolveDrawSearchAreaEligibility({
        journey: 'agri-first',
        hasResidentialListingScope: true,
        isAuthenticated: false,
      }),
    ).toEqual({ status: 'HIDDEN', reason: 'agricultural_journey' });
  });

  // Signing in is the one thing this shopper can act on immediately, so it
  // outranks the other two unavailable reasons.
  it('prefers the sign-in reason over the city-boundary and not-wired reasons', () => {
    expect(
      resolveDrawSearchAreaEligibility({
        journey: 'area-first',
        hasResidentialListingScope: true,
        cityBoundaryAvailable: false,
        isDrawModeWired: false,
        isAuthenticated: false,
      }),
    ).toEqual({ status: 'UNAVAILABLE', reason: 'signed_in_required' });
  });
});
