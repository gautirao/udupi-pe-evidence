import { describe, it, expect } from 'vitest';
import { resolveAreaSelectedFallbackRoute, resolveRightPanelRoute } from './rightPanelRoute';

/** R7 differential — a byte-for-byte copy of the ORIGINAL inline expression
 * from DiscoverRightPanel.tsx's `case 'area-selected'` branch, kept here so
 * the selector's output can be diffed against it across a table of inputs. */
function originalInline(urlAreaKey: string | null | undefined, isLoadingAreas: boolean | undefined) {
  if (urlAreaKey) {
    return isLoadingAreas ? 'hydrating' : 'not-found';
  }
  return 'guided';
}

describe('resolveAreaSelectedFallbackRoute (#2657 C1)', () => {
  it('hydrating when urlAreaKey present and areas still loading', () => {
    expect(resolveAreaSelectedFallbackRoute({ urlAreaKey: 'IN|KA|Udupi|Manipal', isLoadingAreas: true })).toBe(
      'hydrating',
    );
  });

  it('not-found when urlAreaKey present and areas loaded', () => {
    expect(resolveAreaSelectedFallbackRoute({ urlAreaKey: 'IN|KA|Udupi|Manipal', isLoadingAreas: false })).toBe(
      'not-found',
    );
  });

  it('guided when urlAreaKey absent, regardless of isLoadingAreas', () => {
    expect(resolveAreaSelectedFallbackRoute({ urlAreaKey: null, isLoadingAreas: true })).toBe('guided');
    expect(resolveAreaSelectedFallbackRoute({ urlAreaKey: undefined, isLoadingAreas: false })).toBe('guided');
  });

  it('R7 differential: matches the original inline expression across a table of inputs', () => {
    const table: Array<{ urlAreaKey: string | null | undefined; isLoadingAreas: boolean | undefined }> = [
      { urlAreaKey: 'IN|KA|Udupi|Manipal', isLoadingAreas: true },
      { urlAreaKey: 'IN|KA|Udupi|Manipal', isLoadingAreas: false },
      { urlAreaKey: 'IN|KA|Udupi|Manipal', isLoadingAreas: undefined },
      { urlAreaKey: null, isLoadingAreas: true },
      { urlAreaKey: undefined, isLoadingAreas: false },
      { urlAreaKey: '', isLoadingAreas: true },
    ];
    for (const input of table) {
      expect(resolveAreaSelectedFallbackRoute(input)).toBe(originalInline(input.urlAreaKey, input.isLoadingAreas));
    }
  });
});

/**
 * Issue #2657 R1 (code-review Finding 1) — `resolveRightPanelRoute` must tag
 * `{kind: 'entry'}` with WHICH origin produced it, since the two origins were
 * rendered differently pre-refactor (see rightPanelRoute.ts's doc comment on
 * `RightPanelRoute` for the full history): the real 'guided-entry' state
 * (`origin: 'guided-entry'`) vs the 'area-selected'/'schools-in-area'
 * no-area/no-urlAreaKey fallback (`origin: 'hydration-fallback'`), which
 * pre-refactor rendered the bare GuidedEntryPanel unconditionally, never
 * reading the anon-viewport flag.
 */
describe('resolveRightPanelRoute — entry origin tagging (#2657 R1)', () => {
  it('tags the real guided-entry state as origin "guided-entry"', () => {
    const route = resolveRightPanelRoute('guided-entry', { hasArea: false, urlAreaKey: null, isLoadingAreas: false });
    expect(route).toEqual({ kind: 'entry', origin: 'guided-entry' });
  });

  it('tags the area-selected hydration fallback (no area, no urlAreaKey) as origin "hydration-fallback"', () => {
    const route = resolveRightPanelRoute('area-selected', { hasArea: false, urlAreaKey: null, isLoadingAreas: false });
    expect(route).toEqual({ kind: 'entry', origin: 'hydration-fallback' });
  });

  it('tags the schools-in-area hydration fallback (no area, no urlAreaKey) as origin "hydration-fallback"', () => {
    const route = resolveRightPanelRoute('schools-in-area', { hasArea: false, urlAreaKey: null, isLoadingAreas: false });
    expect(route).toEqual({ kind: 'entry', origin: 'hydration-fallback' });
  });

  it('area-selected with urlAreaKey set and areas loading still routes to area-hydrating, not entry', () => {
    const route = resolveRightPanelRoute('area-selected', {
      hasArea: false,
      urlAreaKey: 'IN|KA|Udupi|Manipal',
      isLoadingAreas: true,
    });
    expect(route).toEqual({ kind: 'area-hydrating' });
  });

  it('journey routes are unaffected by the origin tag', () => {
    expect(resolveRightPanelRoute('agri-landing', { hasArea: false, urlAreaKey: null, isLoadingAreas: false })).toEqual({
      kind: 'journey',
      journey: 'agri',
    });
    expect(resolveRightPanelRoute('area-selected', { hasArea: true, urlAreaKey: null, isLoadingAreas: false })).toEqual({
      kind: 'journey',
      journey: 'area',
    });
  });
});
