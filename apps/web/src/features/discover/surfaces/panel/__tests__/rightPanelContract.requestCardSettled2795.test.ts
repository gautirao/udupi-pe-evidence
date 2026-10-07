/**
 * Issue #2795 (review F1) — pins the producer-to-resolver chain: the keepPreviousData placeholder
 * flags on `view.geography` must reach `resolveAreaSelectedResults`, so `view.results.settled` is
 * false while stale previous-key data is on screen. Delete either pass-through line in
 * rightPanelContract.ts and the matching case below fails.
 */
import { describe, it, expect } from 'vitest';
import { buildRightPanelView } from '../rightPanelContract';
import type { DiscoverPanelSurfaceView } from '../../buildPanelSurfaceModel';

// Test-boundary stand-in: buildRightPanelView reads ~100 unrelated surface fields that this spec does
// not exercise. Unspecified fields resolve to inert values; ONLY the fields under test are real.
function inert(): unknown {
  const fn = () => inert();
  return new Proxy(fn, {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'length' ? 0 : inert()),
    apply: () => inert(),
  });
}

function surfaceView(geography: Record<string, unknown>): DiscoverPanelSurfaceView {
  const real: Record<string, unknown> = {
    pageContext: { nav: { scope: null, areaKey: null, filters: {}, journey: 'area-first', intent: 'sale' } },
    geography: {
      areaGroupsData: undefined,
      summaryRegions: [],
      discoverAreas: [],
      isAnonViewport: false,
      isAuthViewport: false,
      isPolygonScope: false,
      areaListings: [],
      isLoadingAreaListings: false,
      isErrorAreaListings: false,
      isPlaceholderAreaListings: false,
      isPlaceholderAnonViewport: false,
      anonViewportListingsLoading: false,
      isErrorAnonViewport: false,
      ...geography,
    },
  };
  return new Proxy(real, {
    get: (t, key) => (key in t ? t[key as string] : inert()),
  }) as unknown as DiscoverPanelSurfaceView;
}

const build = (geography: Record<string, unknown>) =>
  buildRightPanelView(surfaceView(geography), { cityLabel: 'Udupi', footer: null });

describe('buildRightPanelView — results.settled follows the placeholder flags (#2795)', () => {
  it('area scope: loaded, not a placeholder => settled', () => {
    expect(build({}).area.results.settled).toBe(true);
  });

  it('area scope: isPlaceholderAreaListings reaches the resolver => NOT settled', () => {
    expect(build({ isPlaceholderAreaListings: true }).area.results.settled).toBe(false);
  });

  it('anon viewport: isPlaceholderAnonViewport reaches the resolver => NOT settled', () => {
    expect(build({ isAnonViewport: true, isPlaceholderAnonViewport: true }).area.results.settled).toBe(false);
  });

  it('anon viewport control: not a placeholder => settled', () => {
    expect(build({ isAnonViewport: true }).area.results.settled).toBe(true);
  });
});
