import { describe, it, expect } from 'vitest';
import { deriveDiscoverBadge, formatDiscoverBadgeCopy } from './badgeCopy';
import * as canonical from '@/features/discover/presentation/discoverBadge';

describe('selectors/badgeCopy (#2142 Commit 2 — thin re-export, not a physical move)', () => {
  it('re-exports the SAME function references as the canonical module (no divergent copy)', () => {
    expect(deriveDiscoverBadge).toBe(canonical.deriveDiscoverBadge);
    expect(formatDiscoverBadgeCopy).toBe(canonical.formatDiscoverBadgeCopy);
  });

  it('forwards a real call through correctly (city-total baseline case)', () => {
    const badge = deriveDiscoverBadge({
      selectedArea: null,
      filters: {},
      isLoadingAreaListings: false,
      cityTotal: 1737,
      areaListings: [],
    });
    expect(badge.count).toBe(1737);
    expect(badge.state).toBe('ok');
  });
});
