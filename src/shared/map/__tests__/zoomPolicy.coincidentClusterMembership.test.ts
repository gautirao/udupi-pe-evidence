/**
 * Issue #2139/#2140 code-review follow-up — real `leaflet.markercluster`
 * cluster-membership coverage for `computeCoincidentMarkerOffsets`'s fan cap.
 *
 * The reviewer's finding: `COINCIDENT_OFFSET_RADIUS_CAP_METERS` was compared
 * against the ~230m zoom-15 cluster-boundary danger radius as if it bounded
 * the fan RADIUS. It doesn't — `computeCoincidentMarkerOffsets` places each
 * member `radiusMeters` from a shared origin, so two members on OPPOSITE
 * sides of the fan can be up to `2 * radiusMeters` (the fan DIAMETER) apart.
 * A pure-arithmetic assertion on the formula's output can't catch this class
 * of bug (it would happily pass a formula that is "safe" by the wrong
 * metric) — this test instead runs offset positions through a REAL
 * `L.markerClusterGroup` at zoom `CLUSTER_DISABLE_AT_ZOOM - 1` (15, the
 * densest zoom leaflet.markercluster still actively clusters at) and asserts
 * every member of a large coincident group (n=40, above the ~32-member
 * threshold where the cap engages) resolves to the SAME visible cluster —
 * i.e. the fan's diameter never causes leaflet.markercluster's own internal
 * distance-grid grouping to split the group.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import L from 'leaflet';
import 'leaflet.markercluster';
import {
  computeCoincidentMarkerOffsets,
  CLUSTER_MAX_RADIUS_PX,
  CLUSTER_DISABLE_AT_ZOOM,
  type CoincidentOffsetListing,
} from '../zoomPolicy';

describe('Issue #2140 — coincident offset fan stays inside one real leaflet.markercluster cluster', () => {
  let container: HTMLDivElement;
  let map: L.Map;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // Zoom 15 = CLUSTER_DISABLE_AT_ZOOM - 1, the densest zoom
    // leaflet.markercluster still actively groups markers at (its own
    // `_maxZoom = disableClusteringAtZoom - 1` — see the module comment
    // above `computeCoincidentMarkerOffsets` in ../zoomPolicy.ts).
    map = L.map(container, {
      center: [13.3409, 74.7421],
      zoom: CLUSTER_DISABLE_AT_ZOOM - 1,
      // leaflet.markercluster reads `map.getMaxZoom()` while computing its
      // internal distance grid; without a tile layer (none is added here —
      // this test only needs clustering geometry, not tile rendering) the
      // map has no max zoom by default and leaflet.markercluster throws.
      maxZoom: CLUSTER_DISABLE_AT_ZOOM,
    });
  });

  afterEach(() => {
    map.remove();
    container.remove();
  });

  it('n=40 coincident listings (above the ~32-member cap-engagement threshold) all remain in one cluster at zoom 15', () => {
    const shared = { latitude: 13.3409, longitude: 74.7421 };
    const listings: CoincidentOffsetListing[] = Array.from({ length: 40 }, (_, i) => ({
      id: `listing-${String(i).padStart(3, '0')}`,
      ...shared,
    }));

    const offsets = computeCoincidentMarkerOffsets(listings);
    expect(offsets.size).toBe(40);

    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: CLUSTER_MAX_RADIUS_PX,
      disableClusteringAtZoom: CLUSTER_DISABLE_AT_ZOOM,
    });

    const markers = listings.map((listing) => {
      const position = offsets.get(listing.id)!;
      const marker = L.marker([position.latitude, position.longitude]);
      clusterGroup.addLayer(marker);
      return marker;
    });

    map.addLayer(clusterGroup);

    // `getVisibleParent` is leaflet.markercluster's own public API for "what
    // top-level, currently-rendered node does this marker belong to" — a
    // MarkerCluster if grouped, or the marker itself if standing alone. If
    // the fan diameter split the coincident group across leaflet.marker
    // cluster's internal distance grid, this set would contain more than
    // one distinct visible parent (multiple clusters, or a mix of clusters
        // and un-grouped individual markers).
    const visibleParents = new Set(markers.map((marker) => clusterGroup.getVisibleParent(marker)));

    expect(visibleParents.size).toBe(1);
    const [soleVisibleParent] = [...visibleParents];
    expect(soleVisibleParent).not.toBeNull();
    // The sole visible parent must be an actual MarkerCluster grouping all
    // 40 members, not a lone marker standing in for a group that failed to
    // cluster at all (which would also produce visibleParents.size === 1
    // vacuously if every member were somehow its own top-level node — ruled
    // out by asserting the parent is shared and reports the full count).
    const clusterParent = soleVisibleParent as unknown as { getChildCount?: () => number };
    expect(clusterParent.getChildCount?.()).toBe(40);
  });
});
