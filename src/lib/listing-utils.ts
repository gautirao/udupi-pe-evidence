/**
 * Parses a string as an integer. Returns the value whenever it parses to a
 * finite number — including a legitimate `0` (e.g. ground floor, zero
 * balconies, zero bathrooms) — and returns undefined for null/undefined/
 * blank/whitespace-only/non-numeric input.
 *
 * #2293: previously required `n > 0`, which silently dropped a real `0`
 * value and made it indistinguishable from "not specified". This helper is
 * intentionally permissive about negatives too — field-specific domain
 * rules (e.g. "monthly rent must be > 0 for rentals") are enforced by the
 * caller/backend, not here.
 */
export function intOrUndef(v: string): number | undefined {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parses a string as a float. Returns the value whenever it parses to a
 * finite number — including a legitimate `0` — and returns undefined for
 * null/undefined/blank/whitespace-only/non-numeric input.
 *
 * #2293: previously required `n > 0`, which silently dropped a real `0`
 * value. See intOrUndef's doc comment for the negative-number rationale.
 */
export function floatOrUndef(v: string): number | undefined {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}
