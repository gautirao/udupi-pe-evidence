import { describe, it, expect } from 'vitest';
import { computeDiscoverLayer, toLayerInput, selectDiscoverMapLayer } from './mapLayerCategory';
import * as canonical from '@/features/discover/utils/discoverLayerRegistry';

describe('selectors/mapLayerCategory (#2142 Commit 2 — thin re-export, not a physical move)', () => {
  it('re-exports the SAME function references as the canonical module (no divergent copy)', () => {
    expect(computeDiscoverLayer).toBe(canonical.computeDiscoverLayer);
    expect(toLayerInput).toBe(canonical.toLayerInput);
    expect(selectDiscoverMapLayer).toBe(canonical.selectDiscoverMapLayer);
  });
});
