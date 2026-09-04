/**
 * Pre-commit #2420 eligibility probe — Issue #2419 (PR-1).
 *
 * WHY THIS EXISTS. #2419 requires that a polygon rejected by #2420 "does not
 * become the active POLYGON scope" and "creates no committed result-scope
 * history entry". The live flow could not honour that: the polygon only
 * reaches the API AFTER it is committed. `useDiscoverPageState`'s derived
 * `filters.polygon` is populated FROM the already-committed `resultScope`,
 * and `lib/discoverSearchParams.ts` serialises it from there — so the order
 * was necessarily
 *
 *   draw -> confirm -> commitResultScope() [URL PUSH] -> filters.polygon -> query -> 400
 *
 * and by the time the rejection arrived the history entry already existed and
 * the outgoing scope had already been moved into `rprev`. Rolling the URL back
 * afterwards would leave history noise and flicker the results — and would
 * still have mutated history, which the issue forbids outright.
 *
 * This probe asks the SAME endpoint that runs the policy, with the DRAFT
 * polygon, BEFORE anything is committed. Nothing is written to the URL,
 * PropertyFilters or history unless it comes back clean.
 *
 * WHY THE REQUEST IS DELIBERATELY MINIMAL. `PolygonGeographicSafetyPolicy.validate`
 * takes only (citySlug, polygon) — no filter, purpose or pagination value can
 * change its verdict, so sending them would cost bytes and buy nothing. The
 * probe also sends NO `areaKeys`, `nodeKey` or `viewportScope`: `ResultScopeExclusivity`
 * rejects more than one active result scope per request with
 * `result_scope_must_be_exclusive`, so a probe carrying the committed AREA_SET
 * alongside the draft polygon would fail for the WRONG reason and be reported
 * to the shopper as a drawing problem. `size=1` keeps the response tiny; the
 * body is discarded either way.
 *
 * This is a validation probe, not a data fetch: its result is never rendered
 * and never cached, so it deliberately does not go through TanStack Query.
 * The committed scope's real listing query is unaffected and still owns the
 * results the shopper sees.
 */
import { ApiError, api } from '@/lib/api';
import { parsePolygonRejection, type PolygonRejection } from './polygonRejection';

export type PolygonScopeValidation =
  | { outcome: 'valid' }
  | { outcome: 'rejected'; rejection: PolygonRejection }
  /**
   * The verdict is unknown: the probe failed for a reason that is NOT a #2420
   * geographic-safety decision. `retryable` separates a transient failure
   * (network, 5xx — trying again may succeed) from an authorisation failure
   * (401/403 — trying again changes nothing until the shopper signs in).
   */
  | { outcome: 'unverified'; retryable: boolean; error: unknown };

/**
 * Probes whether `polygon` is an acceptable POLYGON result scope for `city`.
 *
 * FAILS CLOSED — the caller must not commit unless this returns `valid`.
 *
 * An earlier revision let an unknown verdict proceed to commit, reasoning that
 * the server would still reject a bad polygon on the real query. PR review at
 * head `9f061dcc` showed why that was wrong, and the reasoning is worth
 * keeping: this endpoint is AUTHENTICATED, so 401 is not a rare edge case, it
 * is the NORMAL outcome for every anonymous shopper. Allowing it through made
 * "unknown" the default anonymous path and put an unvalidated POLYGON into the
 * URL and history — precisely the ordering this probe exists to prevent.
 *
 * Failing closed also removes a state that never worked. The anonymous
 * listings path is `useDiscoverCityListings`, which calls
 * `/api/discover/cities/{city}/listings` and does not send `polygon` at all
 * (verified by reading it, not assumed). An anonymous POLYGON commit therefore
 * produced a "Drawn area" chip over results that were never scoped to the
 * drawn area — a claim the UI could not back up. Refusing is the honest
 * outcome, not a regression.
 *
 * The caller must never turn `unverified` into a #2420 rejection reason: the
 * drawing may be perfectly fine, and telling the shopper to redraw it would be
 * a lie. It is surfaced as its own state instead.
 */
export async function validatePolygonScope(
  city: string,
  polygon: [number, number][],
  signal?: AbortSignal,
): Promise<PolygonScopeValidation> {
  const params = new URLSearchParams();
  params.set('city', city);
  params.set('size', '1');
  params.set('polygon', JSON.stringify(polygon));

  try {
    await api.get(`/api/discover/listings?${params.toString()}`, { signal });
    return { outcome: 'valid' };
  } catch (error) {
    const rejection = parsePolygonRejection(error);
    if (rejection) return { outcome: 'rejected', rejection };

    // 401/403 will not change on a retry — only signing in changes it.
    // Everything else (network failure, 5xx, an unrelated 400) may.
    const status = error instanceof ApiError ? error.status : null;
    const retryable = status !== 401 && status !== 403;
    return { outcome: 'unverified', retryable, error };
  }
}
