/**
 * discoverUrlNormalize
 *
 * Pure URL-normalization shim for the /discover page (Issue #1745 slice P0).
 *
 * Houses the read-time normalization rules that useDiscoverUrlState applies on
 * top of the raw URLSearchParams:
 *
 *  1. Legacy `group=DIRECTION:BAND` (OD-1 Option A) → `region=DIRECTION`.
 *     The band is always dropped; maxKm is NEVER inferred from it (Option B —
 *     band→maxKm inference — remains forbidden). Only the direction prefix
 *     (before the first ':') is checked against VALID_DIRECTIONS; the band
 *     itself is not validated — this matches the existing cold-load migration
 *     effect in useDiscoverUrlState so behaviour is preserved byte-for-byte.
 *     A band-less `group=DIR` (no colon) is treated the same way — the whole
 *     string is checked against VALID_DIRECTIONS. Malformed/unknown groups
 *     (empty, invalid direction, no valid direction prefix) are dropped
 *     silently — no region is set, and normalization never throws.
 *
 *  2. Journey short-name READ aliases: `journey=area` → `area-first`,
 *     `journey=school` → `school-first`, `journey=agri` → `agri-first`.
 *     Canonical long forms pass through unchanged. Any other value (unknown,
 *     invalid, empty, mis-cased) is left as-is for the hook's own validation,
 *     which falls back to no-journey (null) for anything it doesn't recognise.
 *     Aliases are matched lowercase-exact only — no case-folding.
 *
 * This module is intentionally framework-free (no React, no history side
 * effects) so it can be unit-tested in isolation and reused verbatim by
 * useDiscoverUrlState at its read boundary.
 */

// VALID_DIRECTIONS is the single source of truth for the 8 corridor direction
// codes. useDiscoverUrlState imports this constant rather than declaring its
// own copy, so the two can never drift.
export const VALID_DIRECTIONS = new Set(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);

const JOURNEY_READ_ALIASES: Record<string, string> = {
  area: 'area-first',
  school: 'school-first',
  agri: 'agri-first',
};

/**
 * Maps a journey short-name alias to its canonical long form. Values not in
 * the alias table (including already-canonical forms and unknown/invalid
 * values) are returned unchanged.
 */
export function mapJourneyAlias(journey: string): string {
  return JOURNEY_READ_ALIASES[journey] ?? journey;
}

/**
 * Extracts the direction code from a legacy `group=DIR:BAND` (or band-less
 * `DIR`) value. Only the prefix before the first ':' is checked against
 * VALID_DIRECTIONS — the band (if any) is never validated. Returns null when
 * the direction is missing/invalid, signalling that no migration should occur.
 *
 * This is the single source of truth for "which legacy group values migrate"
 * — shared by normalizeDiscoverSearchParams (read boundary) and the
 * useDiscoverUrlState cold-load history.replace effect (write boundary).
 */
export function extractLegacyGroupDirection(group: string): string | null {
  const directionCode = group.split(':')[0];
  return VALID_DIRECTIONS.has(directionCode) ? directionCode : null;
}

/**
 * Normalizes a URLSearchParams for reading — never mutates the input, always
 * returns a new URLSearchParams. Applies (a) the legacy group→region
 * migration and (b) journey short-name alias resolution. All other params
 * (including repeated params like `board`) are preserved unchanged, in order.
 *
 * Idempotent: normalizing already-canonical output is a no-op.
 */
export function normalizeDiscoverSearchParams(input: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();

  // Single pass, transforming each entry in place so param ORDER is stable across
  // repeated normalization (required for idempotency — a two-phase "copy everything
  // then append the resolved journey/region at the end" approach would reorder
  // params differently on a second pass, since `group` and `journey` would no
  // longer be present to skip over).
  for (const [key, value] of input.entries()) {
    if (key === 'journey') {
      next.append('journey', mapJourneyAlias(value));
      continue;
    }
    if (key === 'group') {
      const migratedDirection = extractLegacyGroupDirection(value);
      if (migratedDirection) {
        next.append('region', migratedDirection);
      }
      // Malformed/unknown group: silently dropped (no region set, group omitted).
      continue;
    }
    next.append(key, value);
  }

  return next;
}
