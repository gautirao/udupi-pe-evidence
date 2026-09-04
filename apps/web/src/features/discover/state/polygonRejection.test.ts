import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { parsePolygonRejection, POLYGON_REJECTION_COPY } from './polygonRejection';

/**
 * Issue #2419 (PR-1) — the client half of the #2420 rejection contract.
 *
 * The bodies below are the REAL shape `exception/GlobalExceptionHandler.java`
 * produces for a `ResponseStatusException(BAD_REQUEST, reason)`:
 * `{"error": "<reason>"}`. If that handler ever changes shape, these tests
 * fail rather than the UI silently degrading to a generic error.
 */
function badRequest(body: unknown): ApiError {
  return new ApiError('API request failed: 400 Bad Request', 400, body);
}

describe('parsePolygonRejection', () => {
  it('maps polygon_scope_too_broad onto the too_broad reason', () => {
    expect(parsePolygonRejection(badRequest({ error: 'polygon_scope_too_broad' }))).toEqual({
      reason: 'too_broad',
    });
  });

  it('maps polygon_outside_searchable_city onto the outside_searchable_city reason', () => {
    expect(
      parsePolygonRejection(badRequest({ error: 'polygon_outside_searchable_city' })),
    ).toEqual({ reason: 'outside_searchable_city' });
  });

  // #2016's exclusivity failure is a malformed request the client should never
  // have been able to build. Reporting it as a polygon problem would tell the
  // shopper to redraw a perfectly good shape.
  it('does NOT treat #2016 result_scope_must_be_exclusive as a polygon rejection', () => {
    expect(parsePolygonRejection(badRequest({ error: 'result_scope_must_be_exclusive' }))).toBeNull();
  });

  it('returns null for an unrecognised 400 reason', () => {
    expect(parsePolygonRejection(badRequest({ error: 'something_else' }))).toBeNull();
  });

  // The listings endpoint is authenticated, so an anonymous probe 401s. Every
  // one of these must stay null: treating them as rejections would blame the
  // shopper's drawing for an auth or infrastructure problem.
  it.each([
    ['401 unauthorised', new ApiError('unauthorised', 401, { error: 'polygon_scope_too_broad' })],
    ['500 server error', new ApiError('server error', 500, { error: 'polygon_scope_too_broad' })],
    ['a plain network Error', new Error('Failed to fetch')],
    ['a non-Error rejection value', 'boom'],
  ])('returns null for %s', (_label, error) => {
    expect(parsePolygonRejection(error)).toBeNull();
  });

  it.each([
    ['a string body', 'polygon_scope_too_broad'],
    ['a null body', null],
    ['a body whose error field is not a string', { error: 42 }],
    ['a body with no error field', { message: 'polygon_scope_too_broad' }],
  ])('returns null for a 400 with %s', (_label, body) => {
    expect(parsePolygonRejection(badRequest(body))).toBeNull();
  });

  // #2419: "do not expose backend error-code strings directly to shoppers".
  it('never leaks a raw backend reason code into shopper-facing copy', () => {
    for (const copy of Object.values(POLYGON_REJECTION_COPY)) {
      expect(`${copy.title} ${copy.body}`).not.toMatch(/polygon_|_scope_|_city\b/);
    }
  });
});
