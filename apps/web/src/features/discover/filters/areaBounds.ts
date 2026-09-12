/**
 * Issue #2459 — the ONE place that decides what a square-foot area bound may BE.
 *
 * The server's designed validator is `AreaBoundsParam.validate` (`AreaBoundsParam:48-51`), which
 * answers an inverted range with a 400. That 400 is correct as a SERVER contract and wrong as a
 * BUYER experience: the two ways a buyer reaches it are a deliberate min-above-max in the control
 * and a shared link carrying one, and for both of those "no results" is the honest answer, not an
 * error page. Nothing client-side stopped either, because `AreaRangeFilter.commit()` writes one
 * key at a time and the URL parse/serialize halves each validate a single value in isolation —
 * so no code on this side ever saw the PAIR.
 *
 * Two rules, both enforced here so the control and the URL cannot disagree about them:
 *
 * ## 1. Representable as the server's `Integer` — integral AND in range
 *
 * Both `DiscoverListingsController` and `DiscoverMarkersController` bind `Integer`. Anything that
 * binding cannot hold fails Spring's REQUEST BINDING and 400s BEFORE `AreaBoundsParam.validate()`
 * is ever called — the designed error never fires, and the response says nothing useful. There are
 * TWO ways to land there, and an earlier revision of this module closed only the first:
 *
 *  - NON-INTEGRAL. `1200.5` parsed clean as a finite non-negative number and was forwarded
 *    verbatim, falsifying `state/url/filters.ts`'s written promise that a hand-edited link
 *    "degrades to no area filter rather than to a bad request".
 *  - OUT OF RANGE. `Number.isInteger` is not a width check. `3000000000` and `2147483648` are
 *    both perfectly integral, both reach the wire, and both 400 on that same `Integer` binding —
 *    the identical "designed validator never runs" defect, one layer down. `999999999999999999999`
 *    is integral too, and `String()` serialises it as the literal `"1e+21"`, which is not a
 *    decimal integer at all. {@link MAX_AREA_SQFT} is therefore part of the contract rather than a
 *    nicety, and {@link isAcceptableAreaBound} decides BOTH properties in one place.
 *
 * ⚠️ `step={1}` and `max={MAX_AREA_SQFT}` on the input are UI AFFORDANCES, not the guard. They
 * steer the spinner and are bypassed by typing, pasting, or hand-editing the URL. The guard is
 * {@link classifyAreaBoundInput} and {@link parseAreaBoundParam}. The affordance reads the SAME
 * exported constant the guard does, so the number a buyer is invited to enter and the number the
 * contract will accept cannot drift apart.
 *
 * ⚠️ Do NOT "fix" either half by widening the API to accept fractional square feet. That is a
 * public contract change on two endpoints, and no buyer searches in half a square foot.
 *
 * ### An unacceptable value is REFUSED, never silently repaired
 *
 * An earlier revision ROUNDED a decimal at the control. That is this module's own defect class
 * wearing a friendlier face: `800.5` → `801` submits a filter the buyer never stated. It is not a
 * tidier spelling of the same search — the server's primary-area expression normalises stored
 * NUMERIC values and unit conversions into sq ft, so the row value actually compared is NOT
 * guaranteed integral, which makes `801` a genuinely DIFFERENT query. The control refuses to
 * commit instead, and the prior bound is left exactly as it was.
 *
 * A refusal the buyer cannot SEE would be that same defect a third time — a value the UI accepted
 * producing an outcome it cannot explain. So {@link classifyAreaBoundInput} reports WHY a value
 * was refused and `AreaRangeFilter` renders it; {@link describeAreaBoundRejection} owns that
 * sentence, so no call site assembles one.
 *
 * ## 2. Non-inverted (min ≤ max)
 *
 * Handled DIFFERENTLY at the two boundaries, on purpose:
 *
 *  - In the CONTROL ({@link applyAreaBound}) the counterpart bound is CLAMPED, so an inverted pair
 *    cannot be authored at all. The buyer is actively typing; discarding the number they just
 *    entered would be hostile, and the clamp is visible in the other field.
 *  - At the URL PARSE boundary ({@link readAreaBoundsFromParams}) an inverted pair is DROPPED to
 *    no area filter — the same degrade the file already documents for a junk value, applied to the
 *    other way a link can be unsatisfiable. Clamping a link would invent a range its author never
 *    wrote; dropping it is the behaviour already promised in writing.
 */

/** The bound keys this module owns. Declared so no caller can point the helpers at a third key. */
export type AreaBoundKey = 'areaMinSqft' | 'areaMaxSqft';

/**
 * The largest bound this contract can carry: Java's `Integer.MAX_VALUE`, which is the exact width
 * of the `Integer` both controllers bind. Not a product judgement about plausible floor areas — it
 * is the point past which the request stops being answerable at all.
 *
 * Exported because `AreaRangeFilter` feeds it straight into `max={…}` on both inputs. One constant
 * behind both the affordance and the guard is what stops the control from inviting a number the
 * contract would then refuse.
 */
export const MAX_AREA_SQFT = 2147483647;

/**
 * The ONE acceptance test, shared by the control and the URL so the two cannot disagree about what
 * a bound may be.
 *
 * `Number.isSafeInteger` rather than `Number.isInteger` on purpose: the latter is true of `1e21`,
 * which is integral, unrepresentable, and serialises as `"1e+21"`.
 */
export function isAcceptableAreaBound(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_AREA_SQFT;
}

/** Why a typed value could not become a bound. Drives the message the buyer actually sees. */
export type AreaBoundRejection = 'not-a-number' | 'negative' | 'not-integral' | 'too-large';

/**
 * What a raw input string means: no bound at all, a usable bound, or a refusal with its reason.
 *
 * The three-way split exists so the control can tell CLEARED apart from REFUSED. Both leave the
 * committed filters without that bound, but only one of them is something the buyer needs told.
 */
export type AreaBoundInput =
  | { kind: 'absent'; value: undefined }
  | { kind: 'accepted'; value: number }
  | { kind: 'rejected'; value: undefined; reason: AreaBoundRejection };

/**
 * Classifies what a buyer TYPED into the control.
 *
 * Cleared and blank are `absent` — "no bound" — and never 0. A 0 lower bound reads identically to
 * no bound on screen but is a DIFFERENT server request: it excludes every row whose primary area
 * is unresolvable or absent (#2459 AC5).
 *
 * Everything `isAcceptableAreaBound` refuses is `rejected`, carrying the reason so the control can
 * say what happened. Nothing is rounded, clamped or otherwise repaired — see the module header.
 */
export function classifyAreaBoundInput(raw: string): AreaBoundInput {
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'absent', value: undefined };

  const parsed = Number(trimmed);
  const reject = (reason: AreaBoundRejection): AreaBoundInput =>
    ({ kind: 'rejected', value: undefined, reason });

  if (Number.isNaN(parsed)) return reject('not-a-number');
  if (parsed < 0) return reject('negative');
  // `Infinity` is neither a typo nor a plausible area; it reads to a buyer as "too big", not as
  // "not a number", so it is reported as the former.
  if (!Number.isFinite(parsed)) return reject('too-large');
  if (!Number.isInteger(parsed)) return reject('not-integral');
  if (!isAcceptableAreaBound(parsed)) return reject('too-large');

  return { kind: 'accepted', value: parsed };
}

/**
 * The buyer-facing sentence for a refusal. Lives here, next to the rule it explains, so a call site
 * consumes the wording rather than inventing its own — the same reason the area LABEL vocabulary
 * lives in `primaryAreaLabels.ts` rather than in the control.
 */
export function describeAreaBoundRejection(reason: AreaBoundRejection): string {
  switch (reason) {
    case 'not-integral':
      return 'Enter a whole number of square feet — this bound was not applied.';
    case 'too-large':
      return `Enter a value up to ${MAX_AREA_SQFT.toLocaleString('en-IN')} sq ft — this bound was not applied.`;
    case 'negative':
      return 'Enter 0 or more — this bound was not applied.';
    case 'not-a-number':
      return 'Enter a number of square feet — this bound was not applied.';
  }
}

/** A bound pair. `undefined` is "no bound" — never 0, which is a different, real server request. */
export interface AreaBounds {
  areaMinSqft?: number;
  areaMaxSqft?: number;
}

/**
 * True when both bounds are present and the range is empty by construction. `min === max` is NOT
 * inverted: it is an exact-size search, and the server accepts it.
 */
export function isInvertedAreaRange(bounds: AreaBounds): boolean {
  const { areaMinSqft: min, areaMaxSqft: max } = bounds;
  return min != null && max != null && min > max;
}

/**
 * The bound {@link classifyAreaBoundInput} yields, for callers that do not need the reason.
 *
 * `undefined` covers BOTH "cleared" and "refused", which is why the control uses the classifier
 * directly: it has to tell those apart to know whether to say anything.
 */
export function normalizeAreaBoundInput(raw: string): number | undefined {
  return classifyAreaBoundInput(raw).value;
}

/**
 * Parses ONE bound out of the URL, against the SAME {@link isAcceptableAreaBound} test the control
 * applies — a value a link may carry and a value a buyer may type are deliberately the same set.
 *
 * The two boundaries differ only in what they do with a refusal: a link has no one to tell, so it
 * degrades silently to NO area filter, which is the behaviour `filters.ts` already promises in
 * writing. Repairing the value instead would run a search the link never asked for.
 */
export function parseAreaBoundParam(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return isAcceptableAreaBound(n) ? n : undefined;
}

/**
 * Applies one bound from the control, clamping the counterpart so the committed pair is never
 * inverted. Writing a min above the current max drags the max up with it, and vice versa, so the
 * request the control can produce is always one the server will answer.
 *
 * Clearing a bound never clamps: an open-ended range cannot be inverted.
 */
export function applyAreaBound(
  current: AreaBounds,
  key: AreaBoundKey,
  next: number | undefined,
): AreaBounds {
  const updated: AreaBounds = { ...current, [key]: next };
  if (next === undefined || !isInvertedAreaRange(updated)) return updated;
  // The bound the buyer did NOT touch is the one that moves.
  const counterpart: AreaBoundKey = key === 'areaMinSqft' ? 'areaMaxSqft' : 'areaMinSqft';
  return { ...updated, [counterpart]: next };
}

/**
 * Reads both bounds out of the URL as a PAIR, which is what makes the inversion visible at all —
 * each value on its own is perfectly valid. An unsatisfiable pair degrades to no area filter,
 * exactly as a junk value does.
 */
export function readAreaBoundsFromParams(
  rawMin: string | null,
  rawMax: string | null,
): AreaBounds {
  const bounds: AreaBounds = {
    areaMinSqft: parseAreaBoundParam(rawMin),
    areaMaxSqft: parseAreaBoundParam(rawMax),
  };
  return isInvertedAreaRange(bounds) ? {} : bounds;
}
