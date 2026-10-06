/**
 * Issue #1793 SR-024 (PR-A R1) — "error is not empty" for COUNTS, not just the body.
 *
 * While the anonymous school-radius request is loading (pending or retrying) or has failed with
 * nothing retained, `listings.length` is 0 only because there is no data yet — it is not a result.
 * Every surrounding count (summary-band stat, active radius chip) must be omitted rather than
 * claim "0 homes". A settled 200 with no listings is a genuine zero and keeps its counts, and
 * signed-in viewers are unchanged (the signals are the anon school-radius query's own).
 */
export function isSchoolRadiusCountPending({
  isAuthenticated,
  isLoading,
  isError,
  listingCount,
}: {
  isAuthenticated: boolean;
  isLoading: boolean;
  isError: boolean;
  listingCount: number;
}): boolean {
  return !isAuthenticated && (isLoading || (isError && listingCount === 0));
}
