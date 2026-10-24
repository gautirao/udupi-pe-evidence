/**
 * #2859 batch B5 (umbrella #2750) — L55 K.badge==cards, DERIVATION half only: with an area selected and a
 * keyword search active (no property filter), the badge's matched count M is the length of the SAME
 * `areaListings` array the area panel renders (discoverBadge.ts area branch), N stays the area's unfiltered
 * listingCount, and the shared copy reads `M of N match "q" in {area}`.
 *
 * NOT claimed here: that a mounted badge and a mounted card list read one array at runtime (no Radix-free
 * mount of both exists; that equality is RETAIN in the b5 map).
 */
import { describe, it, expect } from 'vitest';
import { deriveDiscoverBadge, formatDiscoverBadgeCopy } from '../discoverBadge';

const AREA = { listingCount: 3 };
const Q_RESPONSE_ROWS = [{ id: 'villa-1' }, { id: 'villa-2' }];

describe('deriveDiscoverBadge — area + keyword search (#2859 B5 L55 K.badge==cards derivation)', () => {
  it('area + q: M = areaListings.length (2), N = listingCount (3), copy "2 of 3 match \\"villa\\" in Manipal"; control without q: unfiltered N=M=3', () => {
    const badge = deriveDiscoverBadge({
      selectedArea: AREA,
      filters: {},
      isLoadingAreaListings: false,
      cityTotal: 100,
      areaListings: Q_RESPONSE_ROWS,
      searchQuery: 'villa',
    });
    expect(badge.hasActiveFilters).toBe(true);
    expect(badge.hasPropertyFilters).toBe(false);
    expect(badge.m).toBe(Q_RESPONSE_ROWS.length);
    expect(badge.count).toBe(2);
    expect(badge.n).toBe(3);
    expect(badge.state).toBe('ok');
    expect(formatDiscoverBadgeCopy(badge, { scopeLabel: 'Manipal', noun: 'verified properties', searchQuery: 'villa' })).toBe(
      '2 of 3 match "villa" in Manipal',
    );

    // Control (same it): the same inputs without q take the unfiltered branch — the number is the area's own.
    const unfiltered = deriveDiscoverBadge({
      selectedArea: AREA,
      filters: {},
      isLoadingAreaListings: false,
      cityTotal: 100,
      areaListings: Q_RESPONSE_ROWS,
      searchQuery: '',
    });
    expect(unfiltered.hasActiveFilters).toBe(false);
    expect(unfiltered.n).toBe(3);
    expect(unfiltered.m).toBe(3);
    expect(formatDiscoverBadgeCopy(unfiltered, { scopeLabel: 'Manipal', noun: 'verified properties' })).toBe(
      '3 verified properties in Manipal',
    );
  });
});
