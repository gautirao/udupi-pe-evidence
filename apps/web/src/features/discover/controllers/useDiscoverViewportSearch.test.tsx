import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  isViewportDirty,
  useDiscoverViewportSearch,
  type UseDiscoverViewportSearchParams,
} from './useDiscoverViewportSearch';
import type { CommittedResultScope, ResultScope } from '@/features/discover/state/resultScope';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';

// [s, w, n, e] — matches useDiscoverViewportTracker's mapBbox convention.
const BASE_BBOX: [number, number, number, number] = [12.9, 77.5, 13.0, 77.6];

// MUST-HAVE #2 (PR review 5085561270) — an AREA_SET scope is the eligible
// baseline for these tests: most of this suite exercises dirty-detection and
// activation mechanics that are orthogonal to eligibility, so the default
// param set is eligible and the dedicated 'eligibility gating' block below
// covers the ineligible (City root/Direction/top-of-journey) states.
const ELIGIBLE_SCOPE: ResultScope = { kind: 'AREA_SET', areaKeys: ['test-area'] };

// The hook only ever reads `.seq` off a CameraIntent — the rest of the
// fields are irrelevant to this suite, but a full literal keeps this a real
// CameraIntent rather than a cast.
function makeCameraIntent(seq: number): CameraIntent {
  return { seq, bounds: null, center: [12.95, 77.55], framing: 'leaf' };
}

// The hook only ever reads `.active` off a CommittedResultScope — `previous`
// is irrelevant to this suite and always null here.
function makeResultScope(active: ResultScope): CommittedResultScope {
  return { active, previous: null };
}

function makeParams(
  overrides: Partial<UseDiscoverViewportSearchParams> = {},
): UseDiscoverViewportSearchParams {
  return {
    mapBbox: BASE_BBOX,
    cameraIntent: null,
    resultScope: makeResultScope(ELIGIBLE_SCOPE),
    commitResultScope: vi.fn(),
    ...overrides,
  };
}

describe('isViewportDirty', () => {
  it('is false for an identical bbox', () => {
    expect(isViewportDirty(BASE_BBOX, BASE_BBOX)).toBe(false);
  });

  it('is false for a small drift within tolerance', () => {
    const current: [number, number, number, number] = [12.901, 77.501, 13.001, 77.601];
    expect(isViewportDirty(BASE_BBOX, current)).toBe(false);
  });

  it('is true once the center drifts past the tolerance ratio', () => {
    // Shift the whole bbox north by ~half its height — a real pan, not noise.
    const current: [number, number, number, number] = [12.95, 77.5, 13.05, 77.6];
    expect(isViewportDirty(BASE_BBOX, current)).toBe(true);
  });

  it('is true once the area changes past the tolerance ratio (zoom)', () => {
    // Same center, area roughly doubled.
    const current: [number, number, number, number] = [12.85, 77.45, 13.05, 77.65];
    expect(isViewportDirty(BASE_BBOX, current)).toBe(true);
  });

  it('is false for a degenerate (zero-area) reference bbox', () => {
    const zeroRef: [number, number, number, number] = [12.9, 77.5, 12.9, 77.5];
    expect(isViewportDirty(zeroRef, BASE_BBOX)).toBe(false);
  });
});

describe('useDiscoverViewportSearch', () => {
  it('is not dirty on first render (baseline seeds from the first mapBbox)', () => {
    const { result } = renderHook(() => useDiscoverViewportSearch(makeParams()));
    expect(result.current.isDirty).toBe(false);
  });

  it('is not dirty while mapBbox is still null', () => {
    const { result } = renderHook(() => useDiscoverViewportSearch(makeParams({ mapBbox: null })));
    expect(result.current.isDirty).toBe(false);
  });

  it('becomes dirty once the live mapBbox drifts past tolerance from the baseline (AC1)', () => {
    const { result, rerender } = renderHook(
      (props: UseDiscoverViewportSearchParams) => useDiscoverViewportSearch(props),
      { initialProps: makeParams() },
    );
    expect(result.current.isDirty).toBe(false);

    const driftedBbox: [number, number, number, number] = [12.95, 77.5, 13.05, 77.6];
    rerender(makeParams({ mapBbox: driftedBbox }));

    expect(result.current.isDirty).toBe(true);
  });

  it('does not mark dirty for a bbox change driven by a programmatic camera move (cameraSeq bump)', () => {
    const { result, rerender } = renderHook(
      (props: UseDiscoverViewportSearchParams) => useDiscoverViewportSearch(props),
      { initialProps: makeParams({ cameraIntent: makeCameraIntent(1) }) },
    );
    expect(result.current.isDirty).toBe(false);

    // A programmatic fit bumps cameraSeq AND settles mapBbox to the new
    // framed bounds in the same update — this must re-baseline, not mark dirty.
    const programmaticBbox: [number, number, number, number] = [12.5, 77.0, 13.5, 78.0];
    rerender(makeParams({ cameraIntent: makeCameraIntent(2), mapBbox: programmaticBbox }));

    expect(result.current.isDirty).toBe(false);
  });

  it('activate() does nothing when mapBbox is null', () => {
    const commitResultScope = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverViewportSearch(makeParams({ mapBbox: null, commitResultScope })),
    );

    result.current.activate();

    expect(commitResultScope).not.toHaveBeenCalled();
  });

  it('activate() commits a VIEWPORT scope from the live bbox with replace-style history (AC2/AC7)', () => {
    const commitResultScope = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverViewportSearch(makeParams({ mapBbox: BASE_BBOX, commitResultScope })),
    );

    result.current.activate();

    const expectedScope: ResultScope = {
      kind: 'VIEWPORT',
      bounds: { s: BASE_BBOX[0], w: BASE_BBOX[1], n: BASE_BBOX[2], e: BASE_BBOX[3] },
    };
    expect(commitResultScope).toHaveBeenCalledTimes(1);
    expect(commitResultScope).toHaveBeenCalledWith(expectedScope, { history: 'replace' });
  });

  it('re-baselines and clears isDirty once activeScope.kind changes (CTA hides right after activation)', () => {
    const { result, rerender } = renderHook(
      (props: UseDiscoverViewportSearchParams) => useDiscoverViewportSearch(props),
      { initialProps: makeParams() },
    );

    const driftedBbox: [number, number, number, number] = [12.95, 77.5, 13.05, 77.6];
    rerender(makeParams({ mapBbox: driftedBbox }));
    expect(result.current.isDirty).toBe(true);

    // Simulate the commit landing: activeScope flips to VIEWPORT with the
    // just-committed (drifted) bbox as the new live mapBbox.
    rerender(
      makeParams({
        mapBbox: driftedBbox,
        resultScope: makeResultScope({
          kind: 'VIEWPORT',
          bounds: { s: driftedBbox[0], w: driftedBbox[1], n: driftedBbox[2], e: driftedBbox[3] },
        }),
      }),
    );

    expect(result.current.isDirty).toBe(false);
  });

  it('supports a repeated VIEWPORT search: stays eligible, re-baselines, and re-commits fresh bounds on a second activation (Issue #2015 regression)', () => {
    const commitResultScope = vi.fn();
    const { result, rerender } = renderHook(
      (props: UseDiscoverViewportSearchParams) => useDiscoverViewportSearch(props),
      { initialProps: makeParams({ mapBbox: BASE_BBOX, commitResultScope }) },
    );

    // 1. Commit a VIEWPORT scope from an eligible AREA_SET baseline.
    result.current.activate();
    expect(commitResultScope).toHaveBeenCalledTimes(1);
    expect(commitResultScope).toHaveBeenNthCalledWith(
      1,
      {
        kind: 'VIEWPORT',
        bounds: { s: BASE_BBOX[0], w: BASE_BBOX[1], n: BASE_BBOX[2], e: BASE_BBOX[3] },
      },
      { history: 'replace' },
    );

    // The commit lands: activeScope flips to the just-committed VIEWPORT.
    rerender(
      makeParams({
        mapBbox: BASE_BBOX,
        commitResultScope,
        resultScope: makeResultScope({
          kind: 'VIEWPORT',
          bounds: { s: BASE_BBOX[0], w: BASE_BBOX[1], n: BASE_BBOX[2], e: BASE_BBOX[3] },
        }),
      }),
    );

    // 2. Clean re-baseline immediately at the committed bounds.
    expect(result.current.isDirty).toBe(false);
    expect(result.current.isEligible).toBe(true);

    // 3. The user pans further, drifting materially past tolerance from the
    // committed VIEWPORT bounds.
    const driftedBbox: [number, number, number, number] = [12.5, 77.0, 13.5, 78.0];
    rerender(
      makeParams({
        mapBbox: driftedBbox,
        commitResultScope,
        resultScope: makeResultScope({
          kind: 'VIEWPORT',
          bounds: { s: BASE_BBOX[0], w: BASE_BBOX[1], n: BASE_BBOX[2], e: BASE_BBOX[3] },
        }),
      }),
    );

    // 4. Regression guard: previously isEligible would have been false here
    // (VIEWPORT was excluded from eligibility), permanently hiding the CTA
    // after the first commit. isDirty must go true again and isEligible
    // must stay true.
    expect(result.current.isDirty).toBe(true);
    expect(result.current.isEligible).toBe(true);

    // 5. A second activation commits the NEW drifted bounds exactly once
    // more — not accumulated/duplicated on top of the first commit.
    result.current.activate();

    expect(commitResultScope).toHaveBeenCalledTimes(2);
    expect(commitResultScope).toHaveBeenNthCalledWith(
      2,
      {
        kind: 'VIEWPORT',
        bounds: { s: driftedBbox[0], w: driftedBbox[1], n: driftedBbox[2], e: driftedBbox[3] },
      },
      { history: 'replace' },
    );
  });
});

describe('useDiscoverViewportSearch — eligibility gating (MUST-HAVE #2, PR review 5085561270)', () => {
  it('is not eligible, not dirty, and never fires commitResultScope at City root (activeScope null) even past drift tolerance', () => {
    const commitResultScope = vi.fn();
    const { result, rerender } = renderHook(
      (props: UseDiscoverViewportSearchParams) => useDiscoverViewportSearch(props),
      { initialProps: makeParams({ resultScope: makeResultScope(null), commitResultScope }) },
    );
    expect(result.current.isEligible).toBe(false);
    expect(result.current.isDirty).toBe(false);

    const driftedBbox: [number, number, number, number] = [12.95, 77.5, 13.05, 77.6];
    rerender(
      makeParams({ resultScope: makeResultScope(null), mapBbox: driftedBbox, commitResultScope }),
    );
    expect(result.current.isDirty).toBe(false);

    result.current.activate();
    expect(commitResultScope).not.toHaveBeenCalled();
  });

  it('is ineligible at Direction/top-of-Schools/top-of-Agri (no committed scope)', () => {
    const { result } = renderHook(() =>
      useDiscoverViewportSearch(makeParams({ resultScope: makeResultScope(null) })),
    );
    expect(result.current.isEligible).toBe(false);
  });

  it('is eligible once a committed AREA_SET scope is active', () => {
    const { result } = renderHook(() =>
      useDiscoverViewportSearch(
        makeParams({ resultScope: makeResultScope({ kind: 'AREA_SET', areaKeys: ['a', 'b'] }) }),
      ),
    );
    expect(result.current.isEligible).toBe(true);
  });

  it('is eligible once a committed POLYGON scope is active', () => {
    const { result } = renderHook(() =>
      useDiscoverViewportSearch(
        makeParams({
          resultScope: makeResultScope({
            kind: 'POLYGON',
            coordinates: [
              [12.9, 77.5],
              [13.0, 77.6],
            ],
          }),
        }),
      ),
    );
    expect(result.current.isEligible).toBe(true);
  });

  it('is eligible once a committed VIEWPORT scope is active (Issue #2015 repeated-search fix — the regression this test guards)', () => {
    const { result } = renderHook(() =>
      useDiscoverViewportSearch(
        makeParams({
          resultScope: makeResultScope({
            kind: 'VIEWPORT',
            bounds: { s: 12.9, w: 77.5, n: 13.0, e: 77.6 },
          }),
        }),
      ),
    );
    expect(result.current.isEligible).toBe(true);
  });

  it('going back to an ineligible level while dirty does not crash and flips isDirty/isEligible to false', () => {
    const { result, rerender } = renderHook(
      (props: UseDiscoverViewportSearchParams) => useDiscoverViewportSearch(props),
      { initialProps: makeParams() },
    );

    const driftedBbox: [number, number, number, number] = [12.95, 77.5, 13.05, 77.6];
    rerender(makeParams({ mapBbox: driftedBbox }));
    expect(result.current.isEligible).toBe(true);
    expect(result.current.isDirty).toBe(true);

    // User navigates back up to City root — activeScope clears.
    expect(() =>
      rerender(makeParams({ mapBbox: driftedBbox, resultScope: makeResultScope(null) })),
    ).not.toThrow();
    expect(result.current.isEligible).toBe(false);
    expect(result.current.isDirty).toBe(false);
  });

  it('activate() no-ops when ineligible, even with a live mapBbox', () => {
    const commitResultScope = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverViewportSearch(makeParams({ resultScope: makeResultScope(null), commitResultScope })),
    );

    result.current.activate();

    expect(commitResultScope).not.toHaveBeenCalled();
  });
});
