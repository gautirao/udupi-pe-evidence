/**
 * Issue #2459 review fixes 3 & 4 — the two client-side guards on a square-foot bound.
 *
 * Both defects had the same shape: the server's designed validator produced a 400 where the buyer
 * deserved "no results", and nothing on this side ever looked at the right thing to prevent it.
 *
 *   FIX 3 — INVERTED RANGE. `AreaRangeFilter.commit()` wrote one key at a time, and the URL
 *   parse/serialize halves each validated a single value in isolation, so NO client code ever saw
 *   the PAIR. `min=2000&max=1000` is two individually valid numbers; only together are they
 *   unsatisfiable. `AreaBoundsParam:48-51` 400s it BY DESIGN.
 *
 *   FIX 4 — NON-INTEGER. Both controllers bind `Integer`, so `800.5` 400s on Spring's REQUEST
 *   BINDING *before* `AreaBoundsParam.validate()` runs — the designed error never fires. And
 *   `state/url/filters.ts` documents that a hand-edited link "degrades to no area filter rather
 *   than to a bad request", which a forwarded decimal made false.
 *
 * These are unit assertions on the owner module. The boundaries that CONSUME it are asserted where
 * they live — `AreaRangeFilter.test.tsx` for the control, `state/url/__tests__/areaBoundsSqft.test.ts`
 * for the URL — because a correct helper wired to nothing is still a broken feature.
 */
import { describe, it, expect } from 'vitest';
import {
  applyAreaBound,
  classifyAreaBoundInput,
  isAcceptableAreaBound,
  isInvertedAreaRange,
  MAX_AREA_SQFT,
  normalizeAreaBoundInput,
  parseAreaBoundParam,
  readAreaBoundsFromParams,
} from '../areaBounds';

/**
 * Narrows `AreaBoundInput` before reading `reason`, which only the `rejected` arm carries.
 * Asserting the arm first is what makes the read type-safe AND keeps a wrong arm a clear failure
 * rather than an `undefined` compared against an expected string.
 */
function rejectionReason(raw: string) {
  const input = classifyAreaBoundInput(raw);
  expect(input.kind).toBe('rejected');
  return input.kind === 'rejected' ? input.reason : undefined;
}

describe('isInvertedAreaRange', () => {
  it('is true only when both bounds are present and min exceeds max', () => {
    expect(isInvertedAreaRange({ areaMinSqft: 2000, areaMaxSqft: 1000 })).toBe(true);
    expect(isInvertedAreaRange({ areaMinSqft: 1000, areaMaxSqft: 2000 })).toBe(false);
  });

  it('treats min === max as VALID — an exact-size search, which the server accepts', () => {
    expect(isInvertedAreaRange({ areaMinSqft: 1200, areaMaxSqft: 1200 })).toBe(false);
  });

  it('is false for an open-ended range — one bound cannot invert', () => {
    expect(isInvertedAreaRange({ areaMinSqft: 2000 })).toBe(false);
    expect(isInvertedAreaRange({ areaMaxSqft: 1000 })).toBe(false);
    expect(isInvertedAreaRange({})).toBe(false);
  });

  it('does not mistake a 0 bound for an absent one', () => {
    // 0 is a REAL request (#2459 AC5): it excludes rows with no resolvable primary area.
    expect(isInvertedAreaRange({ areaMinSqft: 0, areaMaxSqft: 0 })).toBe(false);
    expect(isInvertedAreaRange({ areaMinSqft: 1, areaMaxSqft: 0 })).toBe(true);
  });
});

describe('normalizeAreaBoundInput — what the buyer TYPED', () => {
  it('accepts a plain integer', () => {
    expect(normalizeAreaBoundInput('1200')).toBe(1200);
    expect(normalizeAreaBoundInput('  1200  ')).toBe(1200);
  });

  it('REFUSES a decimal — it is never rounded into a search the buyer did not state', () => {
    // Rounding was the previous behaviour and is the defect, not the fix: the server's
    // primary-area expression normalises NUMERIC values and unit conversions into sq ft, so the
    // row value compared is not guaranteed integral and `801` is a DIFFERENT query from `800.5`.
    expect(normalizeAreaBoundInput('800.5')).toBeUndefined();
    expect(normalizeAreaBoundInput('1200.4')).toBeUndefined();
    expect(classifyAreaBoundInput('800.5')).toEqual({
      kind: 'rejected',
      value: undefined,
      reason: 'not-integral',
    });
  });

  it('REFUSES an integral value too large for the server Integer binding', () => {
    // `Number.isInteger` is not a width check. Each of these is integral, reached the wire under
    // the previous guard, and 400s on the SAME Spring binding a decimal does.
    expect(normalizeAreaBoundInput('2147483648')).toBeUndefined();
    expect(normalizeAreaBoundInput('3000000000')).toBeUndefined();
    expect(classifyAreaBoundInput('3000000000').kind).toBe('rejected');
  });

  it('REFUSES a value that is integral but serialises as exponent notation', () => {
    // `String(1e21)` is the literal "1e+21" — not a decimal integer at all, and what the URL
    // would have carried.
    expect(String(Number('999999999999999999999'))).toBe('1e+21');
    expect(normalizeAreaBoundInput('999999999999999999999')).toBeUndefined();
    expect(rejectionReason('999999999999999999999')).toBe('too-large');
  });

  it('accepts the boundary itself — the control arm for the cap', () => {
    // Without this, a cap that refused everything would pass every assertion above.
    expect(normalizeAreaBoundInput(String(MAX_AREA_SQFT))).toBe(MAX_AREA_SQFT);
    expect(normalizeAreaBoundInput(String(MAX_AREA_SQFT - 1))).toBe(MAX_AREA_SQFT - 1);
  });

  it('treats cleared, blank and unparseable input as NO bound — never as 0', () => {
    // 0 reads identically to "no bound" on screen but is a different server request.
    expect(normalizeAreaBoundInput('')).toBeUndefined();
    expect(normalizeAreaBoundInput('   ')).toBeUndefined();
    expect(normalizeAreaBoundInput('abc')).toBeUndefined();
  });

  it('still accepts an explicit 0, which is a real bound', () => {
    expect(normalizeAreaBoundInput('0')).toBe(0);
  });

  it('drops a negative value — an area cannot be negative', () => {
    expect(normalizeAreaBoundInput('-500')).toBeUndefined();
  });

  it('drops non-finite input rather than serialising Infinity', () => {
    expect(normalizeAreaBoundInput('Infinity')).toBeUndefined();
  });
});

describe('parseAreaBoundParam — what a LINK carries (stricter than the control)', () => {
  it('accepts a plain integer', () => {
    expect(parseAreaBoundParam('1200')).toBe(1200);
  });

  it('DROPS a decimal rather than rounding it — a link is not a buyer mid-keystroke', () => {
    // Rounding here would silently run a search the link did not ask for. Dropping is the degrade
    // `state/url/filters.ts` already promises in writing.
    expect(parseAreaBoundParam('1200.5')).toBeUndefined();
    expect(parseAreaBoundParam('800.5')).toBeUndefined();
  });

  it('drops junk, negatives, non-finite values and absence', () => {
    expect(parseAreaBoundParam('abc')).toBeUndefined();
    expect(parseAreaBoundParam('-500')).toBeUndefined();
    expect(parseAreaBoundParam('Infinity')).toBeUndefined();
    expect(parseAreaBoundParam('')).toBeUndefined();
    expect(parseAreaBoundParam(null)).toBeUndefined();
  });

  it('DROPS an over-wide integer, which a link can carry as easily as a decimal', () => {
    expect(parseAreaBoundParam('2147483648')).toBeUndefined();
    expect(parseAreaBoundParam('3000000000')).toBeUndefined();
    expect(parseAreaBoundParam('999999999999999999999')).toBeUndefined();
    // The control arm: the boundary value itself still parses.
    expect(parseAreaBoundParam(String(MAX_AREA_SQFT))).toBe(MAX_AREA_SQFT);
  });
});

describe('the cap is ONE rule, shared by both boundaries', () => {
  it('is exactly the width of the Integer both controllers bind', () => {
    // 2^31 - 1. If the server ever widens to `long`, this constant is the single place to change.
    expect(MAX_AREA_SQFT).toBe(2 ** 31 - 1);
  });

  const table = [
    '0', '1', '1200', '2147483647',
    '2147483648', '3000000000', '999999999999999999999',
    '800.5', '-500', 'abc', 'Infinity',
  ];

  it('the control and the URL accept EXACTLY the same set of values', () => {
    // The two boundaries differ only in what they do with a refusal, never in what they refuse.
    // Asserted over a table rather than asserted once per boundary, so the two cannot drift.
    for (const raw of table) {
      const viaControl = normalizeAreaBoundInput(raw);
      const viaUrl = parseAreaBoundParam(raw);
      expect({ raw, viaControl }).toEqual({ raw, viaControl: viaUrl });
    }
  });

  it('classification agrees with the acceptance predicate on every case', () => {
    for (const raw of table) {
      const accepted = classifyAreaBoundInput(raw).kind === 'accepted';
      expect({ raw, accepted }).toEqual({ raw, accepted: isAcceptableAreaBound(Number(raw)) });
    }
  });

  it('names the reason, so the control can say something specific', () => {
    expect(rejectionReason('-500')).toBe('negative');
    expect(rejectionReason('abc')).toBe('not-a-number');
    expect(rejectionReason('Infinity')).toBe('too-large');
    expect(classifyAreaBoundInput('').kind).toBe('absent');
    expect(classifyAreaBoundInput('1200').kind).toBe('accepted');
  });
});

describe('applyAreaBound — the control can never author an inverted pair', () => {
  it('CLAMPS the counterpart when a min is pushed above the current max', () => {
    expect(applyAreaBound({ areaMinSqft: 500, areaMaxSqft: 1000 }, 'areaMinSqft', 2000)).toEqual({
      areaMinSqft: 2000,
      areaMaxSqft: 2000,
    });
  });

  it('CLAMPS the counterpart when a max is pulled below the current min', () => {
    expect(applyAreaBound({ areaMinSqft: 1500, areaMaxSqft: 3000 }, 'areaMaxSqft', 900)).toEqual({
      areaMinSqft: 900,
      areaMaxSqft: 900,
    });
  });

  it('leaves a valid pair completely alone — the control arm', () => {
    // Without this, a guard that clamped unconditionally would pass every test above while
    // destroying ordinary use.
    expect(applyAreaBound({ areaMinSqft: 500, areaMaxSqft: 3000 }, 'areaMinSqft', 900)).toEqual({
      areaMinSqft: 900,
      areaMaxSqft: 3000,
    });
    expect(applyAreaBound({}, 'areaMinSqft', 900)).toEqual({ areaMinSqft: 900 });
  });

  it('never clamps on CLEAR — an open-ended range cannot be inverted', () => {
    expect(
      applyAreaBound({ areaMinSqft: 2000, areaMaxSqft: 3000 }, 'areaMaxSqft', undefined),
    ).toEqual({ areaMinSqft: 2000, areaMaxSqft: undefined });
  });

  it('preserves unrelated filter keys', () => {
    expect(
      applyAreaBound(
        { areaMinSqft: 500, areaMaxSqft: 1000, bedrooms: [3] } as never,
        'areaMinSqft',
        2000,
      ),
    ).toMatchObject({ areaMinSqft: 2000, areaMaxSqft: 2000, bedrooms: [3] });
  });

  it('whatever it returns is never inverted — the property, not just the cases above', () => {
    for (const min of [0, 500, 1200, 5000]) {
      for (const max of [0, 500, 1200, 5000]) {
        for (const next of [0, 300, 1200, 9000]) {
          expect(isInvertedAreaRange(applyAreaBound({ areaMinSqft: min, areaMaxSqft: max }, 'areaMinSqft', next))).toBe(false);
          expect(isInvertedAreaRange(applyAreaBound({ areaMinSqft: min, areaMaxSqft: max }, 'areaMaxSqft', next))).toBe(false);
        }
      }
    }
  });
});

describe('readAreaBoundsFromParams — a link that cannot be honoured degrades to NO filter', () => {
  it('drops BOTH bounds for an inverted pair rather than letting it 400', () => {
    expect(readAreaBoundsFromParams('2000', '1000')).toEqual({});
  });

  it('keeps a valid pair — the control arm', () => {
    expect(readAreaBoundsFromParams('800', '1600')).toEqual({
      areaMinSqft: 800,
      areaMaxSqft: 1600,
    });
  });

  it('keeps an exact-size pair, which is not inverted', () => {
    expect(readAreaBoundsFromParams('1200', '1200')).toEqual({
      areaMinSqft: 1200,
      areaMaxSqft: 1200,
    });
  });

  it('keeps the valid half when the other is junk, and cannot invert on one bound', () => {
    expect(readAreaBoundsFromParams('800', 'xyz')).toEqual({
      areaMinSqft: 800,
      areaMaxSqft: undefined,
    });
  });

  it('a decimal is dropped, and cannot then invert the pair it was half of', () => {
    expect(readAreaBoundsFromParams('2000.5', '1000')).toEqual({
      areaMinSqft: undefined,
      areaMaxSqft: 1000,
    });
  });
});
