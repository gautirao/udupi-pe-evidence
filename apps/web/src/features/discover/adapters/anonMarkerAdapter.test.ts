import { describe, it, expect } from 'vitest';
import { resolveNodeListingsAnonMarkers, resolveGroupResultsAnonMarkers } from './anonMarkerAdapter';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

const NOW = '2026-08-12T00:00:00.000Z';

// The exact shape the real public /api/discover/cities/{city}/listings
// endpoint sends: latitude/longitude populated, lat/lon absent (per issue
// #2089's finding, cited in anonMarkerAdapter.ts's header comment).
const LATITUDE_ONLY_ITEM: DiscoverCityListingItem = {
  id: 'listing-1',
  propertyType: 'house',
  latitude: 13.35,
  longitude: 74.79,
};

describe('anonMarkerAdapter R7 differential test (#2142 Commit 2)', () => {
  it('R7: the two implementations DIVERGE on latitude/longitude-only items — NOT byte-identical, so they stay separately named (plan stop condition)', () => {
    const nodeListingsResult = resolveNodeListingsAnonMarkers(
      { areas: [{ listings: [LATITUDE_ONLY_ITEM] }] },
      NOW,
    );
    const groupResultsResult = resolveGroupResultsAnonMarkers([LATITUDE_ONLY_ITEM], NOW);

    // resolveNodeListingsAnonMarkers falls back to latitude/longitude (issue
    // #2089 fix) — the marker survives.
    expect(nodeListingsResult).toHaveLength(1);
    expect(nodeListingsResult[0].latitude).toBe(13.35);
    expect(nodeListingsResult[0].longitude).toBe(74.79);

    // resolveGroupResultsAnonMarkers has NO such fallback — the item is
    // silently filtered out. This reproduces the SAME class of bug #2089
    // fixed on the node-listings path, still latent on the group-results
    // path (reported to team-lead; out of scope to fix in this commit).
    expect(groupResultsResult).toHaveLength(0);
  });

  it('both implementations agree when lat/lon ARE present (the common case both were designed for)', () => {
    const item: DiscoverCityListingItem = { ...LATITUDE_ONLY_ITEM, lat: 13.35, lon: 74.79 };
    const nodeListingsResult = resolveNodeListingsAnonMarkers({ areas: [{ listings: [item] }] }, NOW);
    const groupResultsResult = resolveGroupResultsAnonMarkers([item], NOW);
    expect(nodeListingsResult).toHaveLength(1);
    expect(groupResultsResult).toHaveLength(1);
    expect(nodeListingsResult[0].latitude).toBe(groupResultsResult[0].latitude);
    expect(nodeListingsResult[0].longitude).toBe(groupResultsResult[0].longitude);
  });
});

describe('resolveNodeListingsAnonMarkers (moved verbatim from MapDiscovery.tsx)', () => {
  it('returns [] for undefined/empty input', () => {
    expect(resolveNodeListingsAnonMarkers(undefined, NOW)).toEqual([]);
    expect(resolveNodeListingsAnonMarkers({ areas: [] }, NOW)).toEqual([]);
  });

  it('flattens listings across multiple areas', () => {
    const itemA: DiscoverCityListingItem = { id: 'a', lat: 1, lon: 1 };
    const itemB: DiscoverCityListingItem = { id: 'b', lat: 2, lon: 2 };
    const result = resolveNodeListingsAnonMarkers(
      { areas: [{ listings: [itemA] }, { listings: [itemB] }] },
      NOW,
    );
    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('filters out items with no coordinates at all', () => {
    const item: DiscoverCityListingItem = { id: 'no-coords' };
    expect(resolveNodeListingsAnonMarkers({ areas: [{ listings: [item] }] }, NOW)).toEqual([]);
  });
});

describe('resolveGroupResultsAnonMarkers (moved verbatim from useDiscoverGroupResults.ts)', () => {
  it('returns [] for empty input', () => {
    expect(resolveGroupResultsAnonMarkers([], NOW)).toEqual([]);
  });

  it('filters out items with no lat/lon', () => {
    const item: DiscoverCityListingItem = { id: 'no-coords' };
    expect(resolveGroupResultsAnonMarkers([item], NOW)).toEqual([]);
  });

  it('maps items with lat/lon present', () => {
    const item: DiscoverCityListingItem = { id: 'has-coords', lat: 5, lon: 6 };
    const result = resolveGroupResultsAnonMarkers([item], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].latitude).toBe(5);
    expect(result[0].longitude).toBe(6);
  });
});
