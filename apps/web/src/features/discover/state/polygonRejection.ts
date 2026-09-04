/**
 * Typed #2420 polygon-rejection contract — Issue #2419 (PR-1).
 *
 * #2420 owns the geographic-safety policy for a committed POLYGON result
 * scope SERVER-SIDE (apps/api/.../discover/PolygonGeographicSafetyPolicy.java).
 * This module is the client's read-only ADAPTER for that policy's rejection —
 * it maps the machine-readable reason onto a typed value and a shopper-facing
 * message. It deliberately contains NO thresholds, NO geometry maths and NO
 * client-side policy: #2419's "Do NOT duplicate #2420's geographic policy
 * client-side as authority" guardrail. If the server's thresholds change,
 * nothing here needs to change.
 *
 * WIRE FORMAT (verified against the real classes, not assumed):
 * PolygonGeographicSafetyPolicy throws
 * `ResponseStatusException(BAD_REQUEST, "<reason>")`. `application.yml` sets
 * `server.error.include-message: never`, which WOULD strip the reason from a
 * default Spring error body — but that path is never reached, because
 * `exception/GlobalExceptionHandler.java` (`@ExceptionHandler(ResponseStatusException)`)
 * intercepts it first and returns `{"error": "<reason>"}` with the original
 * status. `lib/api.ts` puts that parsed object on `ApiError.body`. So the
 * reason IS available to the client, on `body.error`, and no backend change
 * was needed for this contract.
 */
import { ApiError } from '@/lib/api';

/**
 * The two #2420 rejections #2419 must explain to a shopper. Deliberately
 * NOT the raw server strings — the issue requires that backend error codes
 * are never exposed to shoppers, so the raw code stops at this boundary.
 */
export type PolygonRejectionReason = 'outside_searchable_city' | 'too_broad';

export interface PolygonRejection {
  reason: PolygonRejectionReason;
}

/**
 * Server reason -> typed reason. Only #2420's two geographic-safety reasons
 * appear here. `result_scope_must_be_exclusive` (#2016's exclusivity check,
 * ResultScopeExclusivity.java) is deliberately ABSENT: it signals a
 * malformed request the client should never have been able to build, not a
 * shopper-correctable drawing, and must not be presented as "your area is
 * too large". It falls through to `null` below and is handled as an ordinary
 * error by the caller.
 */
const TYPED_REASON_BY_SERVER_CODE: Readonly<Record<string, PolygonRejectionReason>> = {
  polygon_outside_searchable_city: 'outside_searchable_city',
  polygon_scope_too_broad: 'too_broad',
};

/** Narrowing helper — the error body is `unknown` on ApiError by design. */
function readErrorCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const code = (body as { error?: unknown }).error;
  return typeof code === 'string' ? code : null;
}

/**
 * Extracts a typed #2420 rejection from a failed request, or `null` when the
 * failure is anything else (network error, 401, 500, a 400 for an unrelated
 * reason).
 *
 * Returning `null` is load-bearing, not a fallback: the caller must NOT treat
 * an unrecognised failure as "the polygon is invalid". A 401 on the probe
 * (the listings endpoint is authenticated) or a transient network error would
 * otherwise be reported to the shopper as a drawing mistake they cannot fix.
 */
export function parsePolygonRejection(error: unknown): PolygonRejection | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const reason = TYPED_REASON_BY_SERVER_CODE[readErrorCode(error.body) ?? ''];
  return reason ? { reason } : null;
}

export interface PolygonRejectionCopy {
  title: string;
  body: string;
}

/**
 * Shopper-facing wording for each rejection.
 *
 * NO MOCK AUTHORITY — FUNCTIONAL_AUDIT gap M8 records that the Discover
 * design kit has no rejection state for a drawn area, so there is nothing to
 * match. This copy is the indicative wording from issue #2419 itself, used
 * verbatim, and is marked MISMATCH on the PR. Replace it if design later
 * publishes a real rejection state.
 *
 * NOT YET RENDERED, ON PURPOSE — not dead code. PR-1 owns the draft state
 * machine and this vocabulary; the surface that displays them is mounted in
 * the map canvas, which belongs to the #2426 lane, so it lands in #2419 PR-2
 * together with draw-mode entry. Until that ships no shopper can reach the
 * INVALID phase through product UI at all, because nothing can start a draw
 * except the legacy Leaflet toolbar PR-2 replaces. Tracked on PR #2441.
 */
export const POLYGON_REJECTION_COPY: Readonly<Record<PolygonRejectionReason, PolygonRejectionCopy>> = {
  too_broad: {
    title: 'This search area is too large',
    body: 'Draw a smaller area covering up to about 3 neighbourhoods.',
  },
  outside_searchable_city: {
    title: 'This search area is outside the city',
    body: 'Draw an area inside the city you are searching.',
  },
};

/**
 * Wording for a draft that could not be CHECKED, as distinct from one that was
 * rejected. It never says "too large" and never says "redraw": the shape may
 * be perfectly fine and the app simply does not know, so instructing the
 * shopper to change it would be a lie (PR review at head 9f061dcc).
 */
export const POLYGON_UNVERIFIED_COPY: Readonly<
  Record<'retryable' | 'signInRequired', PolygonRejectionCopy>
> = {
  retryable: {
    title: "We couldn't check this search area",
    body: 'Something went wrong on our side. Try again in a moment.',
  },
  signInRequired: {
    title: 'Sign in to search a drawn area',
    body: 'Drawing a search area needs an account. Your current results are unchanged.',
  },
};

/**
 * Wording for the `signed_in_required` block — an anonymous shopper who
 * finished a drawing. Deliberately the SAME strings as the unverified
 * sign-in case above rather than a second near-identical pair: both mean "this
 * needs an account", and two subtly different sentences for one situation is
 * how copy drifts. The distinction between them is in the block TYPE, which
 * decides whether a request was ever made, not in what the shopper reads.
 */
export const POLYGON_SIGNED_IN_REQUIRED_COPY: PolygonRejectionCopy =
  POLYGON_UNVERIFIED_COPY.signInRequired;
