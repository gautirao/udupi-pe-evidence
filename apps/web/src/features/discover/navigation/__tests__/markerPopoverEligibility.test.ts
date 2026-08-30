/**
 * Issue #1956 PR-4 (scope amendment n=1) — unit coverage for the extracted,
 * canonical marker-popover eligibility predicate. Covers every pre-existing
 * #1738/#1973 case (unchanged) PLUS the new AREA-leaf arm and its null cases.
 */
import { describe, it, expect } from 'vitest';
import { hasMarkerAreaContext, isMarkerPopoverEligible } from '../markerPopoverEligibility';

const AREA_KEY = 'IN|KA|Bangalore|Manipal';
const SCHOOL_ID = '8c279ab2-5770-44dd-a15e-57526b0b4a91';

describe('isMarkerPopoverEligible — pre-existing #1738/#1973 formula (unchanged)', () => {
  it('area-first + areaKey only -> eligible', () => {
    expect(isMarkerPopoverEligible({ journey: 'area-first', areaKey: AREA_KEY, schoolId: null })).toBe(true);
  });

  it('area-first + areaKey + schoolId (combined) -> eligible', () => {
    expect(
      isMarkerPopoverEligible({ journey: 'area-first', areaKey: AREA_KEY, schoolId: SCHOOL_ID }),
    ).toBe(true);
  });

  it('school-first + schoolId, areaKey null (pure radius search) -> eligible (#1973)', () => {
    expect(isMarkerPopoverEligible({ journey: 'school-first', areaKey: null, schoolId: SCHOOL_ID })).toBe(
      true,
    );
  });

  it('school-first + schoolId + areaKey set (combined) -> eligible', () => {
    expect(
      isMarkerPopoverEligible({ journey: 'school-first', areaKey: AREA_KEY, schoolId: SCHOOL_ID }),
    ).toBe(true);
  });

  it('agri-first -> excluded, even with areaKey set', () => {
    expect(isMarkerPopoverEligible({ journey: 'agri-first', areaKey: AREA_KEY, schoolId: null })).toBe(
      false,
    );
  });

  it('no journey / no context -> excluded', () => {
    expect(isMarkerPopoverEligible({ journey: null, areaKey: null, schoolId: null })).toBe(false);
  });

  it('area-first with NO area selected -> never eligible', () => {
    expect(isMarkerPopoverEligible({ journey: 'area-first', areaKey: null, schoolId: null })).toBe(false);
  });

  it('isNodeAreaLeaf omitted defaults to false — behaviour identical to pre-widening formula', () => {
    expect(isMarkerPopoverEligible({ journey: 'area-first', areaKey: null, schoolId: null })).toBe(false);
  });
});

describe('isMarkerPopoverEligible — Issue #1956 PR-4 new AREA-leaf arm', () => {
  it('area-first + isNodeAreaLeaf=true, legacy areaKey null -> eligible (THE FIX)', () => {
    expect(
      isMarkerPopoverEligible({
        journey: 'area-first',
        areaKey: null,
        schoolId: null,
        isNodeAreaLeaf: true,
      }),
    ).toBe(true);
  });

  it('area-first + isNodeAreaLeaf=true + schoolId set -> still eligible (schoolId does not exclude area-first)', () => {
    expect(
      isMarkerPopoverEligible({
        journey: 'area-first',
        areaKey: null,
        schoolId: SCHOOL_ID,
        isNodeAreaLeaf: true,
      }),
    ).toBe(true);
  });

  it('isNodeAreaLeaf=true but journey is school-first -> NOT admitted by the new arm (never broadened past area-first)', () => {
    expect(
      isMarkerPopoverEligible({
        journey: 'school-first',
        areaKey: null,
        schoolId: null,
        isNodeAreaLeaf: true,
      }),
    ).toBe(false);
  });

  it('isNodeAreaLeaf=true but journey is agri-first -> excluded (agri-first short-circuits first)', () => {
    expect(
      isMarkerPopoverEligible({
        journey: 'agri-first',
        areaKey: null,
        schoolId: null,
        isNodeAreaLeaf: true,
      }),
    ).toBe(false);
  });

  it('isNodeAreaLeaf=true but journey is null -> NOT admitted (the flag alone is never sufficient)', () => {
    expect(
      isMarkerPopoverEligible({ journey: null, areaKey: null, schoolId: null, isNodeAreaLeaf: true }),
    ).toBe(false);
  });

  it('isNodeAreaLeaf=false, area-first, areaKey null -> NOT eligible (a node whose areaKey is null must never be admitted)', () => {
    expect(
      isMarkerPopoverEligible({
        journey: 'area-first',
        areaKey: null,
        schoolId: null,
        isNodeAreaLeaf: false,
      }),
    ).toBe(false);
  });
});

// FIX CYCLE 2 (opus review, Finding 6) — `hasMarkerAreaContext` is the
// extracted sub-predicate `useMarkerSelection.ts`'s URL-write gate now
// composes with, instead of re-deriving inline. Covers the same area-context
// truth table `isMarkerPopoverEligible` relies on above, in isolation.
describe('hasMarkerAreaContext (Issue #1956 PR-4, FIX CYCLE 2 extraction)', () => {
  it('areaKey set, journey/isNodeAreaLeaf irrelevant -> true', () => {
    expect(hasMarkerAreaContext({ journey: null, areaKey: AREA_KEY })).toBe(true);
    expect(hasMarkerAreaContext({ journey: 'school-first', areaKey: AREA_KEY, isNodeAreaLeaf: false })).toBe(
      true,
    );
  });

  it('areaKey null, isNodeAreaLeaf=true, journey=area-first -> true (the additive OR)', () => {
    expect(
      hasMarkerAreaContext({ journey: 'area-first', areaKey: null, isNodeAreaLeaf: true }),
    ).toBe(true);
  });

  it('areaKey null, isNodeAreaLeaf=true, journey=school-first -> false (never broadened past area-first)', () => {
    expect(
      hasMarkerAreaContext({ journey: 'school-first', areaKey: null, isNodeAreaLeaf: true }),
    ).toBe(false);
  });

  it('areaKey null, isNodeAreaLeaf omitted -> false (defaults to false, matching isMarkerPopoverEligible)', () => {
    expect(hasMarkerAreaContext({ journey: 'area-first', areaKey: null })).toBe(false);
  });

  it('areaKey null, isNodeAreaLeaf=false -> false', () => {
    expect(
      hasMarkerAreaContext({ journey: 'area-first', areaKey: null, isNodeAreaLeaf: false }),
    ).toBe(false);
  });
});
