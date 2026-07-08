/**
 * Unit tests for AreaMarkerLayer — focusedGroupAreas opacity behaviour
 *
 * Strategy: AreaMarkerLayer uses L.divIcon to build HTML and L.marker to place it.
 * We capture the HTML string passed to L.divIcon and assert on inline style values,
 * matching the pattern established in PropertyMap.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Capture divIcon calls ────────────────────────────────────────────────────

type DivIconOpts = { html: string; className?: string; iconSize?: unknown; iconAnchor?: unknown };
const capturedDivIconCalls: DivIconOpts[] = [];

// ─── Capture marker() calls + their registered event handlers ────────────────
// Issue #1798 PR-B degradation tests need to simulate a click on a specific
// rendered marker (e.g. an area-cluster chip) and assert on the handlers that
// AreaMarkerLayer registered via marker.on('click', ...), without depending on
// real Leaflet/DOM event dispatch.

type CapturedMarker = {
  handlers: Record<string, (...args: unknown[]) => void>;
  setIcon: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};
const capturedMarkers: CapturedMarker[] = [];

// ─── Mocks (must be declared before imports) ──────────────────────────────────

vi.mock('leaflet', () => ({
  default: {
    Icon: {
      Default: {
        prototype: {},
        mergeOptions: vi.fn(),
      },
    },
    divIcon: vi.fn((opts: DivIconOpts) => {
      capturedDivIconCalls.push(opts);
      return { options: opts };
    }),
    marker: vi.fn(() => {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const instance: Record<string, unknown> = {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          handlers[event] = cb;
          return instance;
        }),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        setIcon: vi.fn(),
      };
      capturedMarkers.push({
        handlers,
        setIcon: instance.setIcon as ReturnType<typeof vi.fn>,
        remove: instance.remove as ReturnType<typeof vi.fn>,
      });
      return instance;
    }),
  },
}));

// Deterministic lat/lon → pixel projection standing in for Leaflet's real
// map.latLngToContainerPoint. Linear + large scale so small real-world lat/lon
// deltas (a few hundred metres) map to pixel deltas well inside the 110px
// default grid cell, and deltas of ~0.02+ degrees land in different cells —
// mirrors how areas cluster/spread on a real zoomed-in map.
function projectLatLon(lat: number, lon: number): { x: number; y: number } {
  return { x: (lon - 74.5) * 10000, y: (13.5 - lat) * 10000 };
}

// Issue #1801 — a single STABLE map stub (not a fresh object per useMap()
// call) so tests can assert "no camera call happened" across the click.
// AreaMarkerLayer must no longer call fitBounds/flyTo/setZoom/once itself —
// MapController (PropertyMap.tsx) is now the sole camera owner.
const mapStub = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  setZoom: vi.fn(),
  getZoom: vi.fn(() => 11),
  once: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  getSize: vi.fn(() => ({ x: 1200, y: 800 })),
  latLngToContainerPoint: vi.fn(([lat, lon]: [number, number]) => projectLatLon(lat, lon)),
}));

vi.mock('react-leaflet', () => ({
  useMap: vi.fn(() => mapStub),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import React from 'react';
import { render } from '@testing-library/react';
import { AreaMarkerLayer } from '../AreaMarkerLayer';
import type { AreaPoint } from '../AreaMarkerLayer';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeArea(areaKey: string, overrides: Partial<AreaPoint> = {}): AreaPoint {
  return {
    areaKey,
    areaLabel: areaKey,
    geo_center_lat: 13.34,
    geo_center_lon: 74.74,
    bbox: [[13.3, 74.7], [13.4, 74.8]],
    listingCount: 5,
    ...overrides,
  };
}

const AREA_A = makeArea('area-a');
const AREA_B = makeArea('area-b');
const AREA_C = makeArea('area-c');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract the inline opacity value from a captured divIcon html string. */
function extractOpacity(html: string): string | null {
  const match = /opacity:([\d.]+)/.exec(html);
  return match ? match[1] : null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AreaMarkerLayer — focusedGroupAreas prop', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
  });

  it('renders all markers at opacity 1.0 when focusedGroupAreas is undefined', () => {
    render(
      <AreaMarkerLayer
        areas={[AREA_A, AREA_B, AREA_C]}
        focusedGroupAreas={undefined}
      />,
    );

    expect(capturedDivIconCalls).toHaveLength(3);
    for (const call of capturedDivIconCalls) {
      expect(extractOpacity(call.html)).toBe('1');
    }
  });

  it('renders group-member markers at opacity 1.0', () => {
    render(
      <AreaMarkerLayer
        areas={[AREA_A, AREA_B]}
        focusedGroupAreas={['area-a', 'area-b']}
      />,
    );

    expect(capturedDivIconCalls).toHaveLength(2);
    for (const call of capturedDivIconCalls) {
      expect(extractOpacity(call.html)).toBe('1');
    }
  });

  // Issue #1595 — when a group is focused, non-member areas are HIDDEN entirely
  // (no ghost/shadow markers), so only the group's member markers render.
  it('hides non-member markers when focusedGroupAreas is provided', () => {
    render(
      <AreaMarkerLayer
        areas={[AREA_A, AREA_B, AREA_C]}
        focusedGroupAreas={['area-a']}
      />,
    );

    // Only the single member area renders; area-b and area-c are not drawn at all.
    expect(capturedDivIconCalls).toHaveLength(1);
    const aHtml = capturedDivIconCalls[0].html;
    expect(aHtml).toContain('area-a');
    expect(extractOpacity(aHtml)).toBe('1');
    expect(capturedDivIconCalls.some((c) => c.html.includes('area-b'))).toBe(false);
    expect(capturedDivIconCalls.some((c) => c.html.includes('area-c'))).toBe(false);
  });

  it('renders no markers when focusedGroupAreas is an empty array', () => {
    render(
      <AreaMarkerLayer
        areas={[AREA_A, AREA_B]}
        focusedGroupAreas={[]}
      />,
    );

    // No member areas → nothing to focus on → no markers at all.
    expect(capturedDivIconCalls).toHaveLength(0);
  });

  it('does not render a non-member marker at all (no ghost marker)', () => {
    render(
      <AreaMarkerLayer
        areas={[AREA_B]}
        focusedGroupAreas={['area-a']} // area-b is not in group
      />,
    );

    expect(capturedDivIconCalls).toHaveLength(0);
  });

  it('full-opacity markers also have pointer-events:auto', () => {
    render(
      <AreaMarkerLayer
        areas={[AREA_A]}
        focusedGroupAreas={['area-a']}
      />,
    );

    expect(capturedDivIconCalls).toHaveLength(1);
    const html = capturedDivIconCalls[0].html;
    expect(html).toContain('pointer-events:auto');
    expect(extractOpacity(html)).toBe('1');
  });

  it('regression: focusedGroupAreas=undefined → all 3 markers at opacity 1', () => {
    render(
      <AreaMarkerLayer
        areas={[AREA_A, AREA_B, AREA_C]}
      />,
    );

    expect(capturedDivIconCalls).toHaveLength(3);
    for (const call of capturedDivIconCalls) {
      const opacity = extractOpacity(call.html);
      expect(opacity).toBe('1');
    }
  });
});

// ─── Journey-aware badge logic ────────────────────────────────────────────────

describe('AreaMarkerLayer — journey-aware badge', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
  });

  // ── school-first, no school selected ──────────────────────────────────────

  it('school-first + no selectedSchool + schoolCount=5 → shows "5 schools"', () => {
    const area = makeArea('area-x', { schoolCount: 5, listingCount: 10 });
    render(<AreaMarkerLayer areas={[area]} journey="school-first" selectedSchool={null} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('5 schools');
    expect(capturedDivIconCalls[0].html).not.toContain('properties');
  });

  it('school-first + no selectedSchool + schoolCount=1 → shows "1 school" (singular)', () => {
    const area = makeArea('area-x', { schoolCount: 1, listingCount: 10 });
    render(<AreaMarkerLayer areas={[area]} journey="school-first" selectedSchool={null} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('1 school');
    expect(capturedDivIconCalls[0].html).not.toContain('1 schools');
    expect(capturedDivIconCalls[0].html).not.toContain('properties');
  });

  it('school-first + no selectedSchool + schoolCount=0 → shows "0 schools" (zero is NOT hidden)', () => {
    const area = makeArea('area-x', { schoolCount: 0, listingCount: 10 });
    render(<AreaMarkerLayer areas={[area]} journey="school-first" selectedSchool={null} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('0 schools');
    expect(capturedDivIconCalls[0].html).not.toContain('properties');
  });

  it('school-first + no selectedSchool + schoolCount=null → falls back to property count', () => {
    const area = makeArea('area-x', { schoolCount: null, listingCount: 7 });
    render(<AreaMarkerLayer areas={[area]} journey="school-first" selectedSchool={null} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('7 properties');
    expect(capturedDivIconCalls[0].html).not.toContain('schools');
  });

  it('school-first + no selectedSchool + schoolCount=undefined → falls back to property count', () => {
    const area = makeArea('area-x', { listingCount: 3 }); // schoolCount deliberately absent
    render(<AreaMarkerLayer areas={[area]} journey="school-first" selectedSchool={null} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('3 properties');
    expect(capturedDivIconCalls[0].html).not.toContain('schools');
  });

  // ── school selected — should revert to property count ─────────────────────

  it('school-first + selectedSchool set → falls back to property count badge', () => {
    const area = makeArea('area-x', { schoolCount: 5, listingCount: 10 });
    const fakeSchool = { id: 's1', name: 'Test School' };
    render(<AreaMarkerLayer areas={[area]} journey="school-first" selectedSchool={fakeSchool} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('10 properties');
    expect(capturedDivIconCalls[0].html).not.toContain('schools');
  });

  // ── area-first journey — regression ───────────────────────────────────────

  it('area-first journey → shows property count regardless of schoolCount', () => {
    const area = makeArea('area-x', { schoolCount: 8, listingCount: 12 });
    render(<AreaMarkerLayer areas={[area]} journey="area-first" selectedSchool={null} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('12 properties');
    expect(capturedDivIconCalls[0].html).not.toContain('schools');
  });

  it('no journey (undefined) → shows property count (existing default)', () => {
    const area = makeArea('area-x', { schoolCount: 4, listingCount: 6 });
    render(<AreaMarkerLayer areas={[area]} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('6 properties');
    expect(capturedDivIconCalls[0].html).not.toContain('schools');
  });

  // ── pluralization for property count ──────────────────────────────────────

  it('listingCount=1 → shows "1 property" (singular)', () => {
    const area = makeArea('area-x', { listingCount: 1 });
    render(<AreaMarkerLayer areas={[area]} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('1 property');
    expect(capturedDivIconCalls[0].html).not.toContain('1 properties');
  });

  it('listingCount=2 → shows "2 properties" (plural)', () => {
    const area = makeArea('area-x', { listingCount: 2 });
    render(<AreaMarkerLayer areas={[area]} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('2 properties');
  });
});

// ─── Issue #1798 PR-B — dense-group area-marker degradation ──────────────────
//
// Fixture models the Thanisandra-Hennur Belt stress case at a smaller, still
// dense scale (29 areas — the real regression scenario has 29 areas / 181
// properties). Areas are laid out as 6 tight spatial clusters spread across
// all four quadrants of the group's bounds so the grid-bucketing + quadrant
// guarantee logic in computeAreaMarkers (src/lib/map/areaMarkerBucketing.ts,
// already unit-tested in isolation) is exercised end-to-end through the real
// Leaflet-facing wrapper, using the projectLatLon mock above in place of
// map.latLngToContainerPoint.

/** Builds `count` areas jittered by whole-metre offsets around an anchor —
 * small enough that projectLatLon always maps them into the SAME 110px grid
 * cell, matching how a real tight cluster of neighbourhoods renders on a
 * zoomed-in map. */
function makeCluster(
  anchorLat: number,
  anchorLon: number,
  namePrefix: string,
  count: number,
  startCount: number,
): AreaPoint[] {
  return Array.from({ length: count }, (_, i) =>
    makeArea(`${namePrefix}-${i + 1}`, {
      areaLabel: `${namePrefix}-${i + 1}`,
      geo_center_lat: anchorLat + i * 0.0001,
      geo_center_lon: anchorLon + i * 0.0001,
      listingCount: startCount + i,
    }),
  );
}

// 6 clusters (5+5+5+5+5+4 = 29 areas) spread across NE/NW/SE/SW quadrants of
// the group bounds (lat 13.20–13.50, lon 74.60–74.90 → centroid ~13.35/74.75).
const DENSE_GROUP_AREAS: AreaPoint[] = [
  ...makeCluster(13.45, 74.85, 'ne-a', 5, 10), // NE
  ...makeCluster(13.45, 74.65, 'nw-a', 5, 8), // NW
  ...makeCluster(13.25, 74.85, 'se-a', 5, 6), // SE
  ...makeCluster(13.25, 74.65, 'sw-a', 5, 4), // SW
  ...makeCluster(13.40, 74.80, 'ne-b', 5, 20), // NE, far enough from ne-a to be a distinct cell
  ...makeCluster(13.22, 74.62, 'sw-b', 4, 2), // SW, far enough from sw-a to be a distinct cell
];

describe('AreaMarkerLayer — dense-group degradation (Issue #1798 PR-B, enableDegradation)', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    capturedMarkers.length = 0;
  });

  it('does NOT degrade when enableDegradation is false/undefined — every area still gets its own full pin (regression)', () => {
    render(<AreaMarkerLayer areas={DENSE_GROUP_AREAS} />);
    const pins = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    expect(pins).toHaveLength(DENSE_GROUP_AREAS.length);
  });

  it('dense group (29 areas) + enableDegradation → renders <=12 representative labelled pins, not all 29', () => {
    render(<AreaMarkerLayer areas={DENSE_GROUP_AREAS} enableDegradation />);

    const representativePins = capturedDivIconCalls.filter((c) =>
      c.html.includes('data-testid="area-marker"'),
    );
    expect(representativePins.length).toBeGreaterThan(0);
    expect(representativePins.length).toBeLessThanOrEqual(12);
    expect(representativePins.length).toBeLessThan(DENSE_GROUP_AREAS.length);
  });

  it('dense group + enableDegradation → renders area-cluster chip(s) with an AREA-count label ("+N areas"), never a property-count sum', () => {
    render(<AreaMarkerLayer areas={DENSE_GROUP_AREAS} enableDegradation />);

    const clusterChips = capturedDivIconCalls.filter((c) =>
      c.html.includes('data-testid="area-cluster-marker"'),
    );
    expect(clusterChips.length).toBeGreaterThan(0);

    for (const chip of clusterChips) {
      // "+N areas"/"+N area" must appear — member AREA count, never a summed
      // property/listing count (the clusters here fold 3-4 member areas each,
      // whose individual listingCounts sum well past any plausible area count).
      expect(chip.html).toMatch(/\+\d+ areas?/);
    }
  });

  it('clicking an area-cluster chip does NOT call onAreaClick (never drills straight to listings) — it flies to split + fires onAreaClusterClick', () => {
    const onAreaClick = vi.fn();
    const onAreaClusterClick = vi.fn();
    render(
      <AreaMarkerLayer
        areas={DENSE_GROUP_AREAS}
        enableDegradation
        onAreaClick={onAreaClick}
        onAreaClusterClick={onAreaClusterClick}
      />,
    );

    // Find the marker instance whose captured divIcon is an area-cluster-marker
    // (divIcon + marker calls are 1:1 and created in the same order).
    const clusterIndex = capturedDivIconCalls.findIndex((c) =>
      c.html.includes('data-testid="area-cluster-marker"'),
    );
    expect(clusterIndex).toBeGreaterThanOrEqual(0);
    const clusterMarker = capturedMarkers[clusterIndex];
    expect(clusterMarker).toBeDefined();
    expect(clusterMarker.handlers.click).toBeInstanceOf(Function);

    clusterMarker.handlers.click();

    expect(onAreaClick).not.toHaveBeenCalled();
    expect(onAreaClusterClick).toHaveBeenCalledTimes(1);
    const payload = onAreaClusterClick.mock.calls[0][0];
    expect(payload.count).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(payload.areas)).toBe(true);
    expect(payload.areas.length).toBe(payload.count);
  });

  it('clicking a representative pin in the degraded layer still calls onAreaClick (same click contract as the legacy full pin)', () => {
    const onAreaClick = vi.fn();
    render(<AreaMarkerLayer areas={DENSE_GROUP_AREAS} enableDegradation onAreaClick={onAreaClick} />);

    const repIndex = capturedDivIconCalls.findIndex((c) => c.html.includes('data-testid="area-marker"'));
    expect(repIndex).toBeGreaterThanOrEqual(0);
    capturedMarkers[repIndex].handlers.click();

    expect(onAreaClick).toHaveBeenCalledTimes(1);
  });

  // ── Forced-always promotion (design-spec §2 rule 1 / §5 / §7) ──────────────

  it('forced-always: selectedAreaKey promotes a clustered (non-representative) area to a full labelled pin', () => {
    // ne-a-1 is the LOWEST-ranked member of the ne-a cluster (listingCount 10,
    // vs 11-14 for ne-a-2..5), so under plain ranking ne-a-5 (highest count)
    // becomes the cell's representative and ne-a-1 folds into its cluster —
    // it would NOT get its own pin without forced-always promotion.
    const { rerender } = render(<AreaMarkerLayer areas={DENSE_GROUP_AREAS} enableDegradation />);
    const baselineReps = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    const baselineHadNeA1 = baselineReps.some((c) => c.html.includes('ne-a-1'));
    expect(baselineHadNeA1).toBe(false);

    capturedDivIconCalls.length = 0;
    capturedMarkers.length = 0;
    rerender(
      <AreaMarkerLayer areas={DENSE_GROUP_AREAS} enableDegradation selectedAreaKey="ne-a-1" />,
    );

    const reps = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    expect(reps.some((c) => c.html.includes('ne-a-1'))).toBe(true);
  });

  it('forced-always: searchMatchKeys promotes a matching clustered area to a full labelled pin', () => {
    // sw-b-1 is the LOWEST-ranked member of the sw-b cluster (listingCount 2,
    // vs 3-5 for sw-b-2..4) — sw-b-4 (highest count) is the cell's plain
    // representative, so sw-b-1 only gets a pin via forced search-match promotion.
    const { rerender } = render(<AreaMarkerLayer areas={DENSE_GROUP_AREAS} enableDegradation />);
    const baselineReps = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    expect(baselineReps.some((c) => c.html.includes('sw-b-1'))).toBe(false);

    capturedDivIconCalls.length = 0;
    capturedMarkers.length = 0;
    rerender(
      <AreaMarkerLayer
        areas={DENSE_GROUP_AREAS}
        enableDegradation
        searchMatchKeys={['sw-b-1']}
      />,
    );

    const reps = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    expect(reps.some((c) => c.html.includes('sw-b-1'))).toBe(true);
  });

  it('forced-always: hoveredAreaKey promotes the hovered clustered area to a full labelled pin', () => {
    // se-a-3 (listingCount 8) is a mid-ranked member of the se-a cluster —
    // se-a-5 (count 10) is the cell's plain representative, so se-a-3 only
    // gets a pin via forced hover promotion.
    const { rerender } = render(<AreaMarkerLayer areas={DENSE_GROUP_AREAS} enableDegradation />);
    const baselineReps = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    expect(baselineReps.some((c) => c.html.includes('se-a-3'))).toBe(false);

    capturedDivIconCalls.length = 0;
    capturedMarkers.length = 0;
    rerender(
      <AreaMarkerLayer
        areas={DENSE_GROUP_AREAS}
        enableDegradation
        hoveredAreaKey="se-a-3"
      />,
    );

    const reps = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    expect(reps.some((c) => c.html.includes('se-a-3'))).toBe(true);
  });

  // ── onMarkersComputed → "Showing X of N areas" wiring ──────────────────────

  it('onMarkersComputed fires with (shownRepresentativeCount, totalAreaCount) after bucketing', () => {
    const onMarkersComputed = vi.fn();
    render(
      <AreaMarkerLayer
        areas={DENSE_GROUP_AREAS}
        enableDegradation
        onMarkersComputed={onMarkersComputed}
      />,
    );

    expect(onMarkersComputed).toHaveBeenCalled();
    const [shown, total] = onMarkersComputed.mock.calls[onMarkersComputed.mock.calls.length - 1];
    expect(total).toBe(DENSE_GROUP_AREAS.length);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(total);
  });

  it('onMarkersComputed is NOT called when enableDegradation is false (legacy path has no bucketing)', () => {
    const onMarkersComputed = vi.fn();
    render(
      <AreaMarkerLayer areas={DENSE_GROUP_AREAS} onMarkersComputed={onMarkersComputed} />,
    );
    expect(onMarkersComputed).not.toHaveBeenCalled();
  });
});

// ─── Issue #1801 — camera consolidation: AreaMarkerLayer no longer touches
// the map camera directly. onAreaCameraIntent publishes the optimistic
// intent; MapController (PropertyMap.tsx) is the sole camera owner. ────────
describe('AreaMarkerLayer — Issue #1801 camera-intent click contract', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    capturedMarkers.length = 0;
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    mapStub.setZoom.mockClear();
    mapStub.once.mockClear();
  });

  it('legacy full-pin click: fires onAreaClick + onAreaCameraIntent, and makes NO direct map camera call', () => {
    const onAreaClick = vi.fn();
    const onAreaCameraIntent = vi.fn();
    render(
      <AreaMarkerLayer
        areas={[AREA_A]}
        onAreaClick={onAreaClick}
        onAreaCameraIntent={onAreaCameraIntent}
      />,
    );

    expect(capturedMarkers).toHaveLength(1);
    capturedMarkers[0].handlers.click();

    expect(onAreaClick).toHaveBeenCalledTimes(1);
    expect(onAreaClick).toHaveBeenCalledWith(AREA_A);
    expect(onAreaCameraIntent).toHaveBeenCalledTimes(1);
    expect(onAreaCameraIntent).toHaveBeenCalledWith(AREA_A);

    // The old imperative camera calls (fitBounds/flyTo/setZoom + the
    // zoomend→setZoom(13) correction) must be gone from this handler.
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.flyTo).not.toHaveBeenCalled();
    expect(mapStub.setZoom).not.toHaveBeenCalled();
    expect(mapStub.once).not.toHaveBeenCalled();
  });

  it('legacy full-pin click: onAreaCameraIntent is optional — a missing prop must not throw', () => {
    const onAreaClick = vi.fn();
    render(<AreaMarkerLayer areas={[AREA_A]} onAreaClick={onAreaClick} />);

    expect(() => capturedMarkers[0].handlers.click()).not.toThrow();
    expect(onAreaClick).toHaveBeenCalledTimes(1);
  });

  it('degraded-representatives click: fires onAreaClick + onAreaCameraIntent, same contract as the legacy handler, and makes NO direct map camera call', () => {
    const onAreaClick = vi.fn();
    const onAreaCameraIntent = vi.fn();
    render(
      <AreaMarkerLayer
        areas={DENSE_GROUP_AREAS}
        enableDegradation
        onAreaClick={onAreaClick}
        onAreaCameraIntent={onAreaCameraIntent}
      />,
    );

    const repIndex = capturedDivIconCalls.findIndex((c) => c.html.includes('data-testid="area-marker"'));
    expect(repIndex).toBeGreaterThanOrEqual(0);
    capturedMarkers[repIndex].handlers.click();

    expect(onAreaClick).toHaveBeenCalledTimes(1);
    expect(onAreaCameraIntent).toHaveBeenCalledTimes(1);
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.flyTo).not.toHaveBeenCalled();
    expect(mapStub.setZoom).not.toHaveBeenCalled();
    expect(mapStub.once).not.toHaveBeenCalled();
  });

  it('dots handler is UNCHANGED: fires onAreaClick only — never onAreaCameraIntent, never a camera call', () => {
    const onAreaClick = vi.fn();
    const onAreaCameraIntent = vi.fn();
    // Band 9-15 (design-spec §1): the bucketer slices the rank-sorted list
    // directly into top-8 representatives + the rest as dots, with NO
    // clustering — the simplest fixture that deterministically produces >=1
    // dot. DENSE_GROUP_AREAS (29 areas, band 16+) folds all demoted areas
    // into clusters of 4-5 members, so it never produces a lone dot.
    const MEDIUM_BAND_AREAS: AreaPoint[] = Array.from({ length: 10 }, (_, i) =>
      makeArea(`med-${i}`, {
        geo_center_lat: 13.2 + i * 0.03,
        geo_center_lon: 74.6 + i * 0.03,
        listingCount: 10 - i,
      }),
    );
    render(
      <AreaMarkerLayer
        areas={MEDIUM_BAND_AREAS}
        enableDegradation
        onAreaClick={onAreaClick}
        onAreaCameraIntent={onAreaCameraIntent}
      />,
    );

    const dotIndex = capturedDivIconCalls.findIndex((c) =>
      c.html.includes('data-testid="area-marker-dot"'),
    );
    expect(dotIndex).toBeGreaterThanOrEqual(0);
    capturedMarkers[dotIndex].handlers.click();

    expect(onAreaClick).toHaveBeenCalledTimes(1);
    expect(onAreaCameraIntent).not.toHaveBeenCalled();
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.flyTo).not.toHaveBeenCalled();
  });

  it('cluster handler is PRESERVED exactly: still calls map.fitBounds directly and fires onAreaClusterClick, never onAreaClick/onAreaCameraIntent', () => {
    const onAreaClick = vi.fn();
    const onAreaCameraIntent = vi.fn();
    const onAreaClusterClick = vi.fn();
    render(
      <AreaMarkerLayer
        areas={DENSE_GROUP_AREAS}
        enableDegradation
        onAreaClick={onAreaClick}
        onAreaCameraIntent={onAreaCameraIntent}
        onAreaClusterClick={onAreaClusterClick}
      />,
    );

    const clusterIndex = capturedDivIconCalls.findIndex((c) =>
      c.html.includes('data-testid="area-cluster-marker"'),
    );
    expect(clusterIndex).toBeGreaterThanOrEqual(0);
    capturedMarkers[clusterIndex].handlers.click();

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(onAreaClusterClick).toHaveBeenCalledTimes(1);
    expect(onAreaClick).not.toHaveBeenCalled();
    expect(onAreaCameraIntent).not.toHaveBeenCalled();
  });
});
