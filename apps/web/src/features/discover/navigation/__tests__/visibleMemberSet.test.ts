/**
 * Issue #1956 PR 1 (FE-3, item 2) — the ONE shared visible-member set.
 *
 * Two things are proven here:
 *   1. the pure derivation's contract (dedup, sort, the three scope states,
 *      fingerprint stability), and
 *   2. that `useDiscoverMapPresentation` re-exposes a SUPPLIED set BY REFERENCE
 *      rather than deriving its own — which is the entire mechanism by which
 *      map and panel cannot disagree (AC1.12). A value-equality assertion would
 *      pass even against two independent derivations, so this asserts `toBe`.
 *
 * The inertness of item 2 is proven separately and more strongly: by the
 * UNMODIFIED existing suites of both hooks still passing.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  deriveVisibleMemberSet,
  EMPTY_VISIBLE_MEMBER_SET,
} from '../visibleMemberSet';
import {
  useDiscoverMapPresentation,
  type UseDiscoverMapPresentationParams,
} from '@/features/discover/presentation/useDiscoverMapPresentation';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

describe('deriveVisibleMemberSet — unscoped', () => {
  it('returns every candidate, de-duplicated and code-point sorted', () => {
    const set = deriveVisibleMemberSet({ candidateAreaKeys: ['b', 'a', 'b', 'c'] });
    expect(set.areaKeys).toEqual(['a', 'b', 'c']);
    expect(set.size).toBe(3);
  });

  it('returns the shared EMPTY set for no candidates', () => {
    expect(deriveVisibleMemberSet({ candidateAreaKeys: [] })).toBe(EMPTY_VISIBLE_MEMBER_SET);
  });

  it('has() answers membership', () => {
    const set = deriveVisibleMemberSet({ candidateAreaKeys: ['a', 'b'] });
    expect(set.has('a')).toBe(true);
    expect(set.has('z')).toBe(false);
  });
});

describe('deriveVisibleMemberSet — scoped (the three groupAreaKeys states)', () => {
  it('undefined scope means "no destination scope": every candidate is a member', () => {
    const set = deriveVisibleMemberSet({
      candidateAreaKeys: ['a', 'b'],
      scopedAreaKeys: undefined,
    });
    expect(set.areaKeys).toEqual(['a', 'b']);
  });

  it('null scope behaves the same as undefined', () => {
    const set = deriveVisibleMemberSet({ candidateAreaKeys: ['a', 'b'], scopedAreaKeys: null });
    expect(set.areaKeys).toEqual(['a', 'b']);
  });

  it('an EMPTY scope array means "destination active but unresolved" — empty, never the full list', () => {
    const set = deriveVisibleMemberSet({ candidateAreaKeys: ['a', 'b'], scopedAreaKeys: [] });
    expect(set).toBe(EMPTY_VISIBLE_MEMBER_SET);
    expect(set.size).toBe(0);
  });

  it('a resolved scope intersects candidates with scope', () => {
    const set = deriveVisibleMemberSet({
      candidateAreaKeys: ['a', 'b', 'c'],
      scopedAreaKeys: ['c', 'b', 'z'],
    });
    expect(set.areaKeys).toEqual(['b', 'c']);
  });

  it('a scope disjoint from the candidates yields the EMPTY set', () => {
    expect(
      deriveVisibleMemberSet({ candidateAreaKeys: ['a'], scopedAreaKeys: ['z'] }),
    ).toBe(EMPTY_VISIBLE_MEMBER_SET);
  });
});

describe('deriveVisibleMemberSet — fingerprint', () => {
  it('is equal for the same members regardless of input order or duplication', () => {
    const a = deriveVisibleMemberSet({ candidateAreaKeys: ['x', 'y'] });
    const b = deriveVisibleMemberSet({ candidateAreaKeys: ['y', 'x', 'y'] });
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('differs when the members differ', () => {
    const a = deriveVisibleMemberSet({ candidateAreaKeys: ['x', 'y'] });
    const b = deriveVisibleMemberSet({ candidateAreaKeys: ['x'] });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

/* ── the sharing seam ─────────────────────────────────────────────────────── */

const AREA_1: AreaPoint = {
  areaKey: 'area-1',
  areaLabel: 'Area One',
  geo_center_lat: 13.35,
  geo_center_lon: 74.75,
  bbox: null,
  listingCount: 4,
};
const AREA_2: AreaPoint = {
  areaKey: 'area-2',
  areaLabel: 'Area Two',
  geo_center_lat: 13.36,
  geo_center_lon: 74.76,
  bbox: null,
  listingCount: 2,
};

const BASE_URL_STATE: DiscoverUrlState = {
  city: 'udupi',
  areaKey: null,
  viewport: null,
  filters: {},
  schoolId: null,
  radiusKm: null,
  q: '',
  journey: null,
  groupId: null,
  selectedGroup: null,
  intent: 'buy',
  scope: null,
};

function baseProps(
  overrides: Partial<UseDiscoverMapPresentationParams> = {},
): UseDiscoverMapPresentationParams {
  return {
    mapLayerKind: 'all-areas',
    isLoadingAreaGroups: false,
    isLoadingRegionalAreaGroups: false,
    isLandingState: false,
    isAreaFirstCityLanding: false,
    areaGroupsData: undefined,
    discoverAreas: [AREA_1, AREA_2],
    corridorGroups: [],
    agriAreasData: undefined,
    liveAreas: [AREA_1, AREA_2],
    urlState: BASE_URL_STATE,
    summaryRegions: [],
    cityCenter: [13.34, 74.74],
    focusedGroup: null,
    debouncedAreaSearchQuery: '',
    ...overrides,
  };
}

describe('useDiscoverMapPresentation — visibleMemberSet is SHARED, not re-derived', () => {
  it('re-exposes a supplied set by REFERENCE (AC1.12: one set, one identity)', () => {
    const shared = deriveVisibleMemberSet({ candidateAreaKeys: ['area-1'] });
    const { result } = renderHook(
      (p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p),
      { initialProps: baseProps({ visibleMemberSet: shared }) },
    );
    expect(result.current.visibleMemberSet).toBe(shared);
  });

  it('falls back to the SAME pure derivation when none is supplied', () => {
    const { result } = renderHook(
      (p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p),
      { initialProps: baseProps() },
    );
    expect(result.current.visibleMemberSet.areaKeys).toEqual(['area-1', 'area-2']);
    expect(result.current.visibleMemberSet.fingerprint).toBe(
      deriveVisibleMemberSet({ candidateAreaKeys: ['area-1', 'area-2'] }).fingerprint,
    );
  });

  it('does not disturb the pre-existing outputs (inertness spot-check)', () => {
    const shared = deriveVisibleMemberSet({ candidateAreaKeys: ['area-1'] });
    const withSet = renderHook(
      (p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p),
      { initialProps: baseProps({ visibleMemberSet: shared }) },
    );
    const withoutSet = renderHook(
      (p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p),
      { initialProps: baseProps() },
    );
    expect(withSet.result.current.overviewAreas).toEqual(
      withoutSet.result.current.overviewAreas,
    );
    expect(withSet.result.current.areaJourneySegments).toEqual(
      withoutSet.result.current.areaJourneySegments,
    );
    expect(withSet.result.current.schoolJourneySegments).toEqual(
      withoutSet.result.current.schoolJourneySegments,
    );
  });
});
