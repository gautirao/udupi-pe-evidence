/**
 * Issue #2139 — unit coverage for `computeCoincidentMarkerOffsets`.
 *
 * Root cause: leaflet.markercluster sets its own `_maxZoom` to
 * `disableClusteringAtZoom - 1` and only builds clustering/spiderfy grid
 * machinery up to that zoom (verified against
 * node_modules/leaflet.markercluster/dist/leaflet.markercluster-src.js).
 * Above that zoom, listings render as raw individual `L.marker` leaves with
 * zero coincident-point handling — listings whose geocoded coordinates are
 * (near-)identical (a known fallback-tier geocoding artifact) fully occlude
 * each other, live-reproduced via identical computed `translate3d`
 * transforms for distinct listing IDs. See the module comment above
 * `computeCoincidentMarkerOffsets` in `../zoomPolicy.ts` for the full
 * derivation.
 */
import { describe, it, expect } from 'vitest';
import { computeCoincidentMarkerOffsets, type CoincidentOffsetListing } from '../zoomPolicy';

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  // Small-angle flat-earth approximation is sufficient at this scale (tens
  // of metres) — matches the precision used by the offset implementation
  // itself.
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = 111_320 * Math.cos((a.latitude * Math.PI) / 180);
  const dLat = (a.latitude - b.latitude) * metersPerDegreeLat;
  const dLng = (a.longitude - b.longitude) * metersPerDegreeLng;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

describe('Issue #2139 — computeCoincidentMarkerOffsets', () => {
  it('AC1: 3 listings sharing identical coordinates all resolve to distinct, pairwise non-overlapping positions', () => {
    const shared = { latitude: 13.3409, longitude: 74.7421 };
    const listings: CoincidentOffsetListing[] = [
      { id: 'listing-a', ...shared },
      { id: 'listing-b', ...shared },
      { id: 'listing-c', ...shared },
    ];

    const offsets = computeCoincidentMarkerOffsets(listings);
    expect(offsets.size).toBe(3);

    const positions = listings.map((l) => offsets.get(l.id)!);
    expect(positions.every(Boolean)).toBe(true);

    // Every pair must be a non-zero, meaningfully-separated distance apart
    // — "non-overlapping bounding positions", not just float-inequality.
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const d = distanceMeters(positions[i], positions[j]);
        expect(d).toBeGreaterThan(1);
      }
    }
  });

  it('2-way coincidence also separates both members', () => {
    const shared = { latitude: 13.3, longitude: 74.7 };
    const listings: CoincidentOffsetListing[] = [
      { id: 'listing-a', ...shared },
      { id: 'listing-b', ...shared },
    ];

    const offsets = computeCoincidentMarkerOffsets(listings);
    const a = offsets.get('listing-a')!;
    const b = offsets.get('listing-b')!;
    expect(distanceMeters(a, b)).toBeGreaterThan(1);
  });

  it('AC2: a non-coincident, in-bounds listing renders unaffected — exact original coordinates preserved', () => {
    const listings: CoincidentOffsetListing[] = [
      { id: 'solo-listing', latitude: 13.35, longitude: 74.75 },
    ];

    const offsets = computeCoincidentMarkerOffsets(listings);
    const position = offsets.get('solo-listing');
    expect(position).toEqual({ latitude: 13.35, longitude: 74.75 });
  });

  it('mixed coincident + distinct listings in one viewport — the distinct listing is untouched while the coincident pair separates', () => {
    const shared = { latitude: 13.3409, longitude: 74.7421 };
    const listings: CoincidentOffsetListing[] = [
      { id: 'coincident-a', ...shared },
      { id: 'coincident-b', ...shared },
      { id: 'distinct-c', latitude: 13.5, longitude: 74.9 },
    ];

    const offsets = computeCoincidentMarkerOffsets(listings);

    expect(offsets.get('distinct-c')).toEqual({ latitude: 13.5, longitude: 74.9 });

    const a = offsets.get('coincident-a')!;
    const b = offsets.get('coincident-b')!;
    expect(distanceMeters(a, b)).toBeGreaterThan(1);
  });

  it('AC3 support: never adds or drops a listing — output id set is exactly the input id set (proves scope is not broadened or narrowed by this fix)', () => {
    const shared = { latitude: 13.3409, longitude: 74.7421 };
    const listings: CoincidentOffsetListing[] = [
      { id: 'a', ...shared },
      { id: 'b', ...shared },
      { id: 'c', latitude: 13.1, longitude: 74.6 },
      { id: 'd', latitude: 13.9, longitude: 74.2 },
    ];

    const offsets = computeCoincidentMarkerOffsets(listings);
    expect(new Set(offsets.keys())).toEqual(new Set(listings.map((l) => l.id)));
  });

  it('is deterministic — repeated calls with the same input produce identical output (a listing must not jump position on an unrelated rebuild)', () => {
    const shared = { latitude: 13.3409, longitude: 74.7421 };
    const listings: CoincidentOffsetListing[] = [
      { id: 'listing-a', ...shared },
      { id: 'listing-b', ...shared },
      { id: 'listing-c', ...shared },
    ];

    const first = computeCoincidentMarkerOffsets(listings);
    const second = computeCoincidentMarkerOffsets(listings);

    for (const listing of listings) {
      expect(second.get(listing.id)).toEqual(first.get(listing.id));
    }
  });

  it('near-duplicate (not byte-identical) fallback-tier coordinates within ~1m are still treated as coincident and separated', () => {
    const listings: CoincidentOffsetListing[] = [
      { id: 'listing-a', latitude: 13.340900, longitude: 74.742100 },
      { id: 'listing-b', latitude: 13.340901, longitude: 74.742099 },
    ];

    const offsets = computeCoincidentMarkerOffsets(listings);
    const a = offsets.get('listing-a')!;
    const b = offsets.get('listing-b')!;
    expect(distanceMeters(a, b)).toBeGreaterThan(1);
  });

  it('an empty listing set returns an empty map', () => {
    expect(computeCoincidentMarkerOffsets([]).size).toBe(0);
  });

  it('code-review follow-up: a large coincident group (n=200) stays capped well under the zoom-15 cluster-boundary danger threshold (~230m at this project\'s latitude band)', () => {
    const shared = { latitude: 13.3409, longitude: 74.7421 };
    const listings: CoincidentOffsetListing[] = Array.from({ length: 200 }, (_, i) => ({
      id: `listing-${String(i).padStart(3, '0')}`,
      ...shared,
    }));

    const offsets = computeCoincidentMarkerOffsets(listings);
    expect(offsets.size).toBe(200);

    // Uncapped, the pre-fix formula (30 * sqrt(200/2)) would put every
    // member ~300m from the shared origin — past the ~230m zoom-15
    // cluster-boundary danger threshold this project's code comment now
    // documents. The cap must keep every member's displacement from the
    // original coincident point comfortably below that threshold.
    for (const listing of listings) {
      const position = offsets.get(listing.id)!;
      const displacement = distanceMeters(shared, position);
      expect(displacement).toBeLessThan(130);
    }
  });
});
