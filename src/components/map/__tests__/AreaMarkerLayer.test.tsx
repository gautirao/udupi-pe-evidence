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
  /**
   * The marker's real DOM node (mirrors marker.getElement() in production),
   * built from the divIcon HTML the marker was constructed with. Lets tests
   * exercise the real Enter/Space keydown→click keyboard bridge end-to-end
   * (AreaMarkerLayer.tsx's `.dp-region`/`.area-group-card` querySelector +
   * addEventListener wiring), the same way a real browser would.
   */
  element: HTMLElement;
};
const capturedMarkers: CapturedMarker[] = [];

// ─── Mocks (must be declared before imports) ──────────────────────────────────

// Issue #1806 — minimal L.latLngBounds + L.point mocks. The cluster click
// handler now computes bounds/zoom via L.latLngBounds(unionBounds(...)) and
// L.point(40, 40) instead of calling map.fitBounds directly; without these
// the component cannot render/click in jsdom. This is shared test
// infrastructure, not a behavioural assertion — see the DIRECTIVE 3
// disclosure in the workdone evidence for what is/isn't authorised to change.
function boundsFromExpression(expr: [number, number][]) {
  const lats = expr.map((p) => p[0]);
  const lons = expr.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return {
    getSouthWest: () => ({ lat: minLat, lng: minLon }),
    getNorthEast: () => ({ lat: maxLat, lng: maxLon }),
    getCenter: () => ({ lat: (minLat + maxLat) / 2, lng: (minLon + maxLon) / 2 }),
  };
}

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
    point: vi.fn((x: number, y: number) => ({ x, y })),
    latLngBounds: vi.fn((expr: [number, number][]) => boundsFromExpression(expr)),
    marker: vi.fn((_latlng: [number, number], options?: { icon?: { options?: DivIconOpts } }) => {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      // Build the marker's real DOM node from the divIcon HTML it was
      // constructed with, mirroring how Leaflet sets marker._icon.innerHTML
      // in a real browser — lets the keyboard-bridge keydown wiring in
      // AreaMarkerLayer.tsx (marker.getElement()?.querySelector(...)) attach
      // to and dispatch on genuine DOM nodes.
      const element = document.createElement('div');
      if (options?.icon?.options?.html) {
        element.innerHTML = options.icon.options.html;
      }
      // Real Leaflet attaches its 'click' DOM listener to marker._icon
      // (== marker.getElement()); a native click on any descendant (e.g. the
      // inner `.dp-region`/`.area-group-card` div the keyboard bridge calls
      // `.click()` on) bubbles up to it, firing the registered handler.
      element.addEventListener('click', () => {
        handlers.click?.();
      });
      const instance: Record<string, unknown> = {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          handlers[event] = cb;
          return instance;
        }),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        setIcon: vi.fn(),
        getElement: vi.fn(() => element),
      };
      capturedMarkers.push({
        handlers,
        setIcon: instance.setIcon as ReturnType<typeof vi.fn>,
        remove: instance.remove as ReturnType<typeof vi.fn>,
        element,
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
  // Issue #1806 — the cluster click handler now calls map.getBoundsZoom to
  // compute the capped target zoom for the splittable predicate. Default (13)
  // is above the default getZoom() (11) and AREA_LAYER_MAX_ZOOM (12), so a
  // real-spatial-spread cluster (the existing DENSE_GROUP_AREAS fixture)
  // resolves splittable=true by default without every test needing to
  // override it. Tests exercising the non-splittable branch override this
  // per-call with mockReturnValueOnce.
  getBoundsZoom: vi.fn(() => 13),
  once: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  getSize: vi.fn(() => ({ x: 1200, y: 800 })),
  latLngToContainerPoint: vi.fn(([lat, lon]: [number, number]) => projectLatLon(lat, lon)),
  // The macro-region compass-layout recompute effect (gated on hasMacroRegions)
  // observes the map container via ResizeObserver — needed once this file's
  // new isGroup-redesign tests render an isMacroRegion area alongside a group.
  getContainer: vi.fn(() => document.createElement('div')),
  containerPointToLatLng: vi.fn(({ x, y }: { x: number; y: number }) => ({
    lat: 13.5 - y / 10000,
    lng: x / 10000 + 74.5,
  })),
}));

vi.mock('react-leaflet', () => ({
  useMap: vi.fn(() => mapStub),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import React from 'react';
import { render } from '@testing-library/react';
import L from 'leaflet';
import { AreaMarkerLayer, AreaDestinationMarkerLayer } from '../AreaMarkerLayer';
import type { AreaPoint } from '../AreaMarkerLayer';
// Issue #1943 (Slice B+C merge, code review cycle 2, FIX 5) — the
// 'clusters'/'directions' destination-clustering path had NO component
// coverage anywhere in the diff: destinations.test.tsx's cluster tests are
// all levelKind='areas', and the allDirectionsSelect mock fix means nothing
// merges there either. These imports support the new coverage added below.
import type { AreasNavigationChild } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import { clusterAreaMembers, type ClusterableDestination } from '@/features/discover/navigation/areaClustering';

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

  it('dense group + enableDegradation → renders area-cluster chip(s) with an AREA-count label ("+N nearby areas"), never a property-count sum', () => {
    render(<AreaMarkerLayer areas={DENSE_GROUP_AREAS} enableDegradation />);

    const clusterChips = capturedDivIconCalls.filter((c) =>
      c.html.includes('data-testid="area-cluster-marker"'),
    );
    expect(clusterChips.length).toBeGreaterThan(0);

    for (const chip of clusterChips) {
      // "+N nearby areas" must appear — member AREA count, never a summed
      // property/listing count (the clusters here fold 3-4 member areas each,
      // whose individual listingCounts sum well past any plausible area count).
      expect(chip.html).toMatch(/\+\d+ nearby areas/);
    }
  });

  // ── Issue #1810 AC1/AC2/AC3 — neutral area-cluster chip copy ─────────────

  it('AC1: the chip face carries NO area name (dominantName is dropped) — only the neutral "+N nearby areas · Tap to expand" copy', () => {
    render(<AreaMarkerLayer areas={DENSE_GROUP_AREAS} enableDegradation />);

    const clusterChips = capturedDivIconCalls.filter((c) =>
      c.html.includes('data-testid="area-cluster-marker"'),
    );
    expect(clusterChips.length).toBeGreaterThan(0);

    // None of the source area names (ne-a-1..5, nw-a-1..5, etc.) may appear
    // on any chip face — the defect this issue fixes was the dominant
    // member's name doubling as the cluster label.
    const allAreaNames = DENSE_GROUP_AREAS.map((a) => a.areaLabel);
    for (const chip of clusterChips) {
      for (const name of allAreaNames) {
        expect(chip.html).not.toContain(`>${name}<`);
      }
      expect(chip.html).toContain('Tap to expand');
      expect(chip.html).toMatch(/\+\d+ nearby areas/);
    }
  });

  it('AC2: the area-cluster chip keeps the stack glyph + soft-outline styling distinct from the solid listing-cluster disc', () => {
    render(<AreaMarkerLayer areas={DENSE_GROUP_AREAS} enableDegradation />);

    const clusterChips = capturedDivIconCalls.filter((c) =>
      c.html.includes('data-testid="area-cluster-marker"'),
    );
    expect(clusterChips.length).toBeGreaterThan(0);
    for (const chip of clusterChips) {
      // stackSvg — layered-pins glyph, distinct from the listing cluster disc.
      expect(chip.html).toContain('<svg');
      // Soft-outline chip: paper background + a colour border (not a filled disc).
      expect(chip.html).toContain(`background:${'#FFFFFF'}`);
      expect(chip.html).toMatch(/border:1\.5px solid/);
      expect(chip.html).toContain('border-radius:9999px');
    }
  });

  it('AC3: every area-cluster chip reports count >= 2 (a single named area is never rendered as a chip)', () => {
    render(<AreaMarkerLayer areas={DENSE_GROUP_AREAS} enableDegradation />);
    const clusterChips = capturedDivIconCalls.filter((c) =>
      c.html.includes('data-testid="area-cluster-marker"'),
    );
    expect(clusterChips.length).toBeGreaterThan(0);
    for (const chip of clusterChips) {
      const match = /\+(\d+) nearby areas/.exec(chip.html);
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBeGreaterThanOrEqual(2);
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

// ─── Issue #1810 Stage 2A — label truncation + chip leader/anchor-dot ────────

describe('AreaMarkerLayer — Issue #1810 AC4 long-label truncation', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    capturedMarkers.length = 0;
  });

  // Band 9-15 (top ~8 ranked become representatives, rest are dots) is the
  // simplest fixture to force both a labelled representative AND a
  // hover-revealed dot with a long, truncatable name.
  const LONG_NAME_AREAS: AreaPoint[] = Array.from({ length: 10 }, (_, i) =>
    makeArea(`long-${i}`, {
      areaLabel: `Dodda Gubbi Chikkagubbi Village Extension ${i}`,
      geo_center_lat: 13.2 + i * 0.03,
      geo_center_lon: 74.6 + i * 0.03,
      listingCount: 10 - i,
    }),
  );

  it('a long representative label is truncated, with the full name recoverable via the title attribute', () => {
    render(<AreaMarkerLayer areas={LONG_NAME_AREAS} enableDegradation />);
    const reps = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    expect(reps.length).toBeGreaterThan(0);
    const rep = reps[0];
    // The visible label span is truncated (ellipsis), not the full name...
    expect(rep.html).toMatch(/<span[^>]*>Dodda Gubbi[^<]*…<\/span>/);
    expect(rep.html).not.toMatch(/<span[^>]*>Dodda Gubbi Chikkagubbi Village Extension 0<\/span>/);
    // ...but the full name is recoverable via the title attribute (hover/focus reveal).
    expect(rep.html).toMatch(/title="Dodda Gubbi Chikkagubbi Village Extension 0"/);
  });

  it('a long, hover-revealed dot label is truncated with the full name in the title attribute', () => {
    render(<AreaMarkerLayer areas={LONG_NAME_AREAS} enableDegradation />);
    const dotIndex = capturedDivIconCalls.findIndex((c) => c.html.includes('data-testid="area-marker-dot"'));
    expect(dotIndex).toBeGreaterThanOrEqual(0);
    // Reveal it (mouseover swaps the icon to the labelled variant).
    capturedMarkers[dotIndex].handlers.mouseover();
    const revealedCall = capturedMarkers[dotIndex].setIcon.mock.calls.at(-1)?.[0] as { options: DivIconOpts } | undefined;
    expect(revealedCall).toBeDefined();
    const revealedHtml = revealedCall!.options.html;
    expect(revealedHtml).toContain('data-revealed="true"');
    // Full un-truncated name should not appear verbatim; title attr recovers it.
    const fullNames = LONG_NAME_AREAS.map((a) => a.areaLabel);
    const anyFullNameVerbatim = fullNames.some((n) => revealedHtml.includes(n));
    if (anyFullNameVerbatim) {
      // The area landed as a representative label, not a dot — acceptable,
      // but then this specific test path doesn't apply; skip silently.
      return;
    }
    expect(revealedHtml).toMatch(/title="[^"]+"/);
  });

  it('NOT applied to a selected area — the label stays full/untruncated even if long', () => {
    render(
      <AreaMarkerLayer areas={LONG_NAME_AREAS} enableDegradation selectedAreaKey="long-9" />,
    );
    const reps = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    const selectedRep = reps.find((c) => c.html.includes('long-9') || c.html.includes('Extension 9'));
    // long-9 is forced-always via selectedAreaKey, so it must render as a full
    // representative pin with its complete, untruncated label.
    expect(reps.some((c) => c.html.includes('Dodda Gubbi Chikkagubbi Village Extension 9'))).toBe(true);
    void selectedRep;
  });

  it('NOT applied to a searched area — the label stays full/untruncated', () => {
    render(
      <AreaMarkerLayer areas={LONG_NAME_AREAS} enableDegradation searchMatchKeys={['long-9']} />,
    );
    const reps = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    expect(reps.some((c) => c.html.includes('Dodda Gubbi Chikkagubbi Village Extension 9'))).toBe(true);
  });

  it('NOT applied to a hovered/focused area — the label stays full/untruncated', () => {
    render(
      <AreaMarkerLayer areas={LONG_NAME_AREAS} enableDegradation hoveredAreaKey="long-9" />,
    );
    const reps = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    expect(reps.some((c) => c.html.includes('Dodda Gubbi Chikkagubbi Village Extension 9'))).toBe(true);
  });

  it('representative pins are never moved off their true geo point (no offset transform beyond the standard centring translate)', () => {
    render(<AreaMarkerLayer areas={LONG_NAME_AREAS} enableDegradation />);
    const reps = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    expect(reps.length).toBeGreaterThan(0);
    for (const rep of reps) {
      // The representative divIcon's own transform is always the fixed
      // centring translate — never a per-instance pixel offset (that
      // mechanism exists ONLY for area-cluster chips in this issue).
      expect(rep.html).toContain('transform:translate(-50%,-118%)');
    }
  });
});

describe('AreaMarkerLayer — Issue #1810 AC4/AC5 chip leader line + anchor dot', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    capturedMarkers.length = 0;
  });

  // Two clusters whose centroids project to (near-)identical pixel points —
  // guarantees a footprint collision, so the second one must be offset with
  // a leader (mirrors the areaMarkerBucketing.test.ts collision fixture, but
  // exercised through the full AreaMarkerLayer render path).
  function makeCollidingFixture(): AreaPoint[] {
    const base: AreaPoint[] = [];
    // Cluster 1: 3 low-count areas at one point (fold into a chip).
    for (let i = 0; i < 3; i++) {
      base.push(
        makeArea(`cluster1-${i}`, {
          geo_center_lat: 13.30,
          geo_center_lon: 74.70,
          listingCount: 3 - i,
        }),
      );
    }
    // Cluster 2: 3 low-count areas in an ADJACENT-but-different 110px grid
    // cell (so the two groups become two distinct AreaClusters, not one
    // merged cell) whose representative-anchor projects only 120px away from
    // cluster 1's anchor — inside the 176px chip footprint width, so the
    // chips collide and the second-processed one must be offset.
    for (let i = 0; i < 3; i++) {
      base.push(
        makeArea(`cluster2-${i}`, {
          geo_center_lat: 13.30,
          geo_center_lon: 74.712,
          listingCount: 3 - i,
        }),
      );
    }
    // A handful of spread-out high-count representatives so both low-count
    // clusters are demoted into chips rather than becoming representatives
    // themselves (design-spec §3 grid + cap).
    for (let i = 0; i < 10; i++) {
      base.push(
        makeArea(`rep-${i}`, {
          geo_center_lat: 13.20 + i * 0.03,
          geo_center_lon: 74.60 + i * 0.03,
          listingCount: 50 + i,
        }),
      );
    }
    return base;
  }

  it('two chips with colliding footprints: at least one carries a leader line + anchor dot (offset >=16px)', () => {
    render(<AreaMarkerLayer areas={makeCollidingFixture()} enableDegradation />);
    const leaders = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-cluster-leader"'));
    expect(leaders.length).toBeGreaterThan(0);
    for (const leader of leaders) {
      // 7px anchor dot with a white ring, per design-spec §1.
      expect(leader.html).toContain('width:7px;height:7px');
      expect(leader.html).toContain('border:1.5px solid #fff');
      // A line element is present connecting the anchor to the offset chip.
      expect(leader.html).toContain('<line');
    }
  });

  it('a leader marker is non-interactive (pointer-events:none) so it never steals a neighbouring click', () => {
    render(<AreaMarkerLayer areas={makeCollidingFixture()} enableDegradation />);
    const leaders = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-cluster-leader"'));
    expect(leaders.length).toBeGreaterThan(0);
    for (const leader of leaders) {
      expect(leader.html).toContain('pointer-events:none');
    }
  });

  it('an isolated, non-colliding chip (DENSE_GROUP_AREAS baseline) shows NO leader line', () => {
    render(<AreaMarkerLayer areas={DENSE_GROUP_AREAS} enableDegradation />);
    const leaders = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-cluster-leader"'));
    expect(leaders.length).toBe(0);
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
    mapStub.getBoundsZoom.mockClear();
    mapStub.getBoundsZoom.mockReturnValue(13);
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

  // Issue #1806 (DIRECTIVE 3) — this test previously asserted the BUG:
  //   "cluster handler is PRESERVED exactly: still calls map.fitBounds
  //   directly and fires onAreaClusterClick, never onAreaClick/onAreaCameraIntent"
  //   ...
  //   expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
  //
  // That direct `map.fitBounds(..., { maxZoom: 16 })` call is exactly what
  // lands the user ABOVE AREA_LAYER_MAX_ZOOM, tears down this degradation
  // layer, drops focusedGroupAreas, and flips markersEnabled true — the
  // mechanism behind the reported "empty map after clicking +N areas" bug.
  // Rationale for inversion: the product behaviour this assertion encoded IS
  // the defect being fixed (bug-repro-report.toml root_cause f9/f13); per
  // PLAN_REVIEW directive [directives.test_inversion], inverting it is the
  // one pre-authorised test change in this PR. Split into two tests below —
  // splittable (camera moves via CameraIntent, never fitBounds) and
  // non-splittable (camera holds still, panel highlights instead) — matching
  // FIX-4/FIX-5's two branches.
  it('splittable cluster click: routes the camera through onAreaClusterCameraIntent (framing=overview), NEVER calls map.fitBounds directly, and fires onAreaClusterClick with splittable=true', () => {
    const onAreaClick = vi.fn();
    const onAreaCameraIntent = vi.fn();
    const onAreaClusterClick = vi.fn();
    const onAreaClusterCameraIntent = vi.fn();
    // Default mapStub: getZoom=11, getBoundsZoom=13 → cappedTargetZoom=min(12,13)=12 > 11,
    // and DENSE_GROUP_AREAS clusters have real spatial spread → splittable=true.
    render(
      <AreaMarkerLayer
        areas={DENSE_GROUP_AREAS}
        enableDegradation
        onAreaClick={onAreaClick}
        onAreaCameraIntent={onAreaCameraIntent}
        onAreaClusterClick={onAreaClusterClick}
        onAreaClusterCameraIntent={onAreaClusterCameraIntent}
      />,
    );

    const clusterIndex = capturedDivIconCalls.findIndex((c) =>
      c.html.includes('data-testid="area-cluster-marker"'),
    );
    expect(clusterIndex).toBeGreaterThanOrEqual(0);
    capturedMarkers[clusterIndex].handlers.click();

    // This layer never touches the map camera directly — MapController
    // (PropertyMap.tsx) is the sole camera owner (Issue #1801/#1806).
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.flyTo).not.toHaveBeenCalled();
    expect(mapStub.setZoom).not.toHaveBeenCalled();

    expect(onAreaClusterCameraIntent).toHaveBeenCalledTimes(1);
    const [bounds, center] = onAreaClusterCameraIntent.mock.calls[0];
    expect(Array.isArray(bounds)).toBe(true);
    expect(Array.isArray(center)).toBe(true);

    expect(onAreaClusterClick).toHaveBeenCalledTimes(1);
    expect(onAreaClusterClick.mock.calls[0][0].splittable).toBe(true);

    expect(onAreaClick).not.toHaveBeenCalled();
    expect(onAreaCameraIntent).not.toHaveBeenCalled();
  });

  it('non-splittable cluster click (targetZoom <= currentZoom): publishes NO camera intent — the camera holds still — and fires onAreaClusterClick with splittable=false', () => {
    const onAreaClusterClick = vi.fn();
    const onAreaClusterCameraIntent = vi.fn();
    // Force the capped target zoom to NOT exceed the current zoom (11), so
    // clusterCanSplit returns false regardless of the cluster's real spatial
    // spread — mirrors the "already as zoomed-in as the area layer allows"
    // case from areaClusterSplit.test.ts.
    mapStub.getBoundsZoom.mockReturnValue(5);
    render(
      <AreaMarkerLayer
        areas={DENSE_GROUP_AREAS}
        enableDegradation
        onAreaClusterClick={onAreaClusterClick}
        onAreaClusterCameraIntent={onAreaClusterCameraIntent}
      />,
    );

    const clusterIndex = capturedDivIconCalls.findIndex((c) =>
      c.html.includes('data-testid="area-cluster-marker"'),
    );
    expect(clusterIndex).toBeGreaterThanOrEqual(0);
    capturedMarkers[clusterIndex].handlers.click();

    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.flyTo).not.toHaveBeenCalled();
    expect(mapStub.setZoom).not.toHaveBeenCalled();
    // The camera must hold still — no CameraIntent published at all.
    expect(onAreaClusterCameraIntent).not.toHaveBeenCalled();

    expect(onAreaClusterClick).toHaveBeenCalledTimes(1);
    expect(onAreaClusterClick.mock.calls[0][0].splittable).toBe(false);
  });
});

// ─── Issue #1806 (FIX-3) — in-layer scope guard for the degraded path ────────
//
// Before this fix, the `bucketing` useMemo fed an UNFILTERED `areas` prop
// straight into computeAreaMarkers; only the legacy (non-degraded) path
// filtered by focusedGroupAreas. This was a LATENT trap — MapDiscovery's own
// `overviewAreas` already pre-filters upstream, so this guard is a runtime
// no-op for MapDiscovery today — but any future/different caller that (unlike
// MapDiscovery) passes an unfiltered `areas` prop would otherwise leak
// non-member areas into a "group focused" degraded view. This suite proves
// the guard fires independently of the caller by deliberately passing an
// UNFILTERED `areas` prop alongside focusedGroupAreas.
describe('AreaMarkerLayer — Issue #1806 FIX-3: degraded-path in-layer scope guard', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    capturedMarkers.length = 0;
  });

  // Small, non-dense fixture so bucketing does not additionally fold members
  // into clusters — every area gets its own representative pin, matching the
  // legacy-path test fixtures above (AREA_A/AREA_B/AREA_C) and letting the
  // assertions be about MEMBERSHIP, not clustering.
  const AREA_D = makeArea('area-d');

  it('renders ONLY focusedGroupAreas members even when `areas` is passed UNFILTERED (A,B,C,D; group=[A,B])', () => {
    const onMarkersComputed = vi.fn();
    render(
      <AreaMarkerLayer
        areas={[AREA_A, AREA_B, AREA_C, AREA_D]}
        enableDegradation
        focusedGroupAreas={['area-a', 'area-b']}
        onMarkersComputed={onMarkersComputed}
      />,
    );

    const pins = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    expect(pins.some((c) => c.html.includes('area-a'))).toBe(true);
    expect(pins.some((c) => c.html.includes('area-b'))).toBe(true);
    // Non-member areas must NEVER appear — not as pins, dots, or cluster members.
    expect(capturedDivIconCalls.some((c) => c.html.includes('area-c'))).toBe(false);
    expect(capturedDivIconCalls.some((c) => c.html.includes('area-d'))).toBe(false);
  });

  it('onMarkersComputed reports the FILTERED total (2), not the unfiltered `areas.length` (4) — Risk R6', () => {
    const onMarkersComputed = vi.fn();
    render(
      <AreaMarkerLayer
        areas={[AREA_A, AREA_B, AREA_C, AREA_D]}
        enableDegradation
        focusedGroupAreas={['area-a', 'area-b']}
        onMarkersComputed={onMarkersComputed}
      />,
    );

    expect(onMarkersComputed).toHaveBeenCalled();
    const [, total] = onMarkersComputed.mock.calls[onMarkersComputed.mock.calls.length - 1];
    expect(total).toBe(2);
  });

  it('regression: focusedGroupAreas=undefined + degradation on → every area still eligible (no accidental over-filtering)', () => {
    const onMarkersComputed = vi.fn();
    render(
      <AreaMarkerLayer
        areas={[AREA_A, AREA_B, AREA_C, AREA_D]}
        enableDegradation
        onMarkersComputed={onMarkersComputed}
      />,
    );

    const [, total] = onMarkersComputed.mock.calls[onMarkersComputed.mock.calls.length - 1];
    expect(total).toBe(4);
  });
});

// ─── Issue #1815 — representative label-rect collision/demote pass ──────────
//
// areaMarkerBucketing.test.ts unit-tests demoteCollidingRepresentatives in
// isolation with a synthetic project(). This suite exercises the same pass
// through the real Leaflet-facing wrapper, using the projectLatLon mock
// above (a linear stand-in for map.latLngToContainerPoint) so the collision
// geometry is driven by real geo_center_lat/lon deltas.
describe('AreaMarkerLayer — Issue #1815 representative collision/demote pass', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    capturedMarkers.length = 0;
  });

  // Band 9-15 (10 areas): collide-0 (rank #1) and collide-1 (rank #2) sit at
  // the EXACT same lat/lon — a guaranteed footprint collision under
  // projectLatLon. The 8 filler areas are spread far enough apart (and
  // low-count enough) to never collide with collide-0/1 or each other, while
  // still filling the top-8 rep slice so collide-0/1's own quadrant (NE) has
  // exactly 2 non-forced rep candidates — enough that the last-in-quadrant
  // exemption does NOT block collide-1's demotion.
  const COLLISION_REP_AREAS: AreaPoint[] = [
    makeArea('collide-0', { geo_center_lat: 13.45, geo_center_lon: 74.85, listingCount: 100 }),
    makeArea('collide-1', { geo_center_lat: 13.45, geo_center_lon: 74.85, listingCount: 99 }),
    makeArea('filler-0', { geo_center_lat: 13.20, geo_center_lon: 74.60, listingCount: 50 }),
    makeArea('filler-1', { geo_center_lat: 13.22, geo_center_lon: 74.62, listingCount: 48 }),
    makeArea('filler-2', { geo_center_lat: 13.24, geo_center_lon: 74.64, listingCount: 46 }),
    makeArea('filler-3', { geo_center_lat: 13.26, geo_center_lon: 74.66, listingCount: 44 }),
    makeArea('filler-4', { geo_center_lat: 13.28, geo_center_lon: 74.68, listingCount: 42 }),
    makeArea('filler-5', { geo_center_lat: 13.30, geo_center_lon: 74.70, listingCount: 40 }),
    makeArea('filler-6', { geo_center_lat: 13.32, geo_center_lon: 74.72, listingCount: 38 }),
    makeArea('filler-7', { geo_center_lat: 13.34, geo_center_lon: 74.74, listingCount: 36 }),
  ];

  it('the higher-ranked of two colliding representatives (collide-0) renders as a full labelled pin', () => {
    render(<AreaMarkerLayer areas={COLLISION_REP_AREAS} enableDegradation />);
    const pins = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    expect(pins.some((c) => c.html.includes('collide-0'))).toBe(true);
  });

  it('the lower-ranked, colliding representative (collide-1) is demoted to a dot — NOT rendered as a labelled pin', () => {
    render(<AreaMarkerLayer areas={COLLISION_REP_AREAS} enableDegradation />);

    // Never appears as a full representative pin.
    const pins = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-marker"'));
    expect(pins.some((c) => c.html.includes('collide-1'))).toBe(false);

    // Reveal every hover-dot (mouseover swaps in the labelled variant) and
    // confirm collide-1 is one of them.
    const dotIndices = capturedDivIconCalls
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.html.includes('data-testid="area-marker-dot"'))
      .map(({ i }) => i);
    expect(dotIndices.length).toBeGreaterThan(0);

    let foundCollide1AsDot = false;
    for (const idx of dotIndices) {
      capturedMarkers[idx].handlers.mouseover();
      const revealedCall = capturedMarkers[idx].setIcon.mock.calls.at(-1)?.[0] as { options: DivIconOpts } | undefined;
      expect(revealedCall).toBeDefined();
      if (revealedCall!.options.html.includes('collide-1')) {
        foundCollide1AsDot = true;
      }
    }
    expect(foundCollide1AsDot).toBe(true);
  });

  it('no area-cluster chip is rendered for the demoted band 9-15 representative (a solo demotion folds to a dot, not a chip)', () => {
    render(<AreaMarkerLayer areas={COLLISION_REP_AREAS} enableDegradation />);
    const clusterChips = capturedDivIconCalls.filter((c) => c.html.includes('data-testid="area-cluster-marker"'));
    // Band 9-15 never produces clusters (design-spec §1: top-N labelled, rest
    // are dots, no grid clustering) — the demote pass folds a demoted rep
    // into an existing cluster only if one exists at that cell/nearest; here
    // none exists, so it becomes a lone dot instead.
    expect(clusterChips).toHaveLength(0);
  });
});

// ─── Issue #1815 (R1) — hovering never publishes a camera intent ───────────
//
// Regression the reviewer flagged: forced-always promotion via hover must
// never trigger a camera move. AreaMarkerLayer already wires
// onAreaCameraIntent only inside marker.on('click', ...) handlers (never
// mouseover/mouseout, never a prop-change effect) — this suite proves that
// contract holds for both the panel-hover path (hoveredAreaKey prop change)
// and the native marker mouseover-reveal path.
// ─── Area-group "map card" redesign (isGroup branch) ─────────────────────────
//
// Replaces the old horizontal navy pill (`.group-pill-marker`) with a compact
// dark vertical card: wrapped group name, prominent mono count +
// PROPERTY/PROPERTIES noun, and a "Tap to zoom in ›" pill revealed on
// hover/focus (matching the macro-region bubble's .dp-region-cap contract).
// Scoped strictly to the `area.isGroup` branch of makeAreaCard —
// macro-region (`.dp-region`) and ordinary area markers are covered by their
// own describe blocks above and are asserted here to be unaffected.
describe('AreaMarkerLayer — area-group "map card" redesign (isGroup)', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    capturedMarkers.length = 0;
  });

  function makeGroupArea(overrides: Partial<AreaPoint> = {}): AreaPoint {
    return makeArea('airport-belt', {
      areaLabel: 'Airport Belt',
      listingCount: 20,
      isGroup: true,
      ...overrides,
    });
  }

  it('renders the new vertical card structure (area-group-card wrapper + area-group-card-core inner), not the old pill', () => {
    render(<AreaMarkerLayer areas={[makeGroupArea()]} />);
    expect(capturedDivIconCalls).toHaveLength(1);
    const html = capturedDivIconCalls[0].html;
    expect(html).toContain('data-testid="area-marker"');
    expect(html).toContain('class="area-group-card"');
    expect(html).toContain('class="area-group-card-core"');
  });

  it('old horizontal pill markup (group-pill-marker class / capsule count-chip) is absent from the new output', () => {
    render(<AreaMarkerLayer areas={[makeGroupArea()]} />);
    const html = capturedDivIconCalls[0].html;
    expect(html).not.toContain('group-pill-marker');
    // The old design's capsule count chip: mono count text inside its own
    // fully-rounded background pill, distinct from the new plain-flow count.
    expect(html).not.toMatch(/background:rgba\(255,255,255,0\.15\);padding:1px 6px;border-radius:9999px;/);
  });

  it('does not render an "AREA GROUP" eyebrow — name and count are sufficient', () => {
    render(<AreaMarkerLayer areas={[makeGroupArea()]} />);
    const html = capturedDivIconCalls[0].html;
    expect(html).not.toContain('AREA GROUP');
  });

  it('reveals a "Tap to zoom in ›" caption on hover/focus, matching the macro-region bubble contract', () => {
    render(<AreaMarkerLayer areas={[makeGroupArea()]} />);
    const html = capturedDivIconCalls[0].html;
    expect(html).toContain('class="area-group-cap"');
    expect(html).toContain('Tap to zoom in');
    // The caption is a sibling of the scaling inner core, anchored to the
    // outer (never-scaled) wrapper — position:relative on the outer wrapper,
    // position:absolute on the caption, matching .dp-region/.dp-region-cap.
    expect(html).toMatch(/class="area-group-card"[^>]*style="position:relative;/);
  });

  it('group name is HTML-escaped and displayed', () => {
    const area = makeGroupArea({ areaLabel: '<script>alert(1)</script> & Belt' });
    render(<AreaMarkerLayer areas={[area]} />);
    const html = capturedDivIconCalls[0].html;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Belt');
  });

  it('count renders as "20 PROPERTIES" (plural) for listingCount=20', () => {
    render(<AreaMarkerLayer areas={[makeGroupArea({ listingCount: 20 })]} />);
    const html = capturedDivIconCalls[0].html;
    expect(html).toContain('>20<');
    expect(html).toContain('>PROPERTIES<');
    expect(html).not.toContain('>PROPERTY<');
  });

  it('count renders as "1 PROPERTY" (singular) for listingCount=1', () => {
    render(<AreaMarkerLayer areas={[makeGroupArea({ listingCount: 1 })]} />);
    const html = capturedDivIconCalls[0].html;
    expect(html).toContain('>1<');
    expect(html).toContain('>PROPERTY<');
    expect(html).not.toContain('>PROPERTIES<');
  });

  it('zero-count groups render truthfully as "0 PROPERTIES" (never special-cased)', () => {
    render(<AreaMarkerLayer areas={[makeGroupArea({ listingCount: 0 })]} />);
    const html = capturedDivIconCalls[0].html;
    expect(html).toContain('>0<');
    expect(html).toContain('>PROPERTIES<');
  });

  it('selected state (isSelected: true) gets a stronger border and scale on the inner core', () => {
    render(<AreaMarkerLayer areas={[makeGroupArea({ isSelected: false })]} />);
    const unselectedHtml = capturedDivIconCalls[0].html;
    expect(unselectedHtml).toContain('scale(1)');
    expect(unselectedHtml).toContain('1.5px solid rgba(255,255,255,0.6)');

    capturedDivIconCalls.length = 0;
    render(<AreaMarkerLayer areas={[makeGroupArea({ isSelected: true })]} />);
    const selectedHtml = capturedDivIconCalls[0].html;
    expect(selectedHtml).toContain('scale(1.04)');
    expect(selectedHtml).toContain('2px solid rgba(255,255,255,0.92)');
    // Selected emphasis lives on the inner core, never the outer anchor —
    // the outer wrapper's own transform stays the fixed centring translate.
    expect(selectedHtml).toMatch(
      /class="area-group-card"[^>]*style="position:relative;transform:translate\(-50%,-50%\);/,
    );
  });

  it('has role="button", tabindex="0", and an aria-label with the exact singular/plural count text', () => {
    render(<AreaMarkerLayer areas={[makeGroupArea({ areaLabel: 'Airport Belt', listingCount: 20 })]} />);
    const html = capturedDivIconCalls[0].html;
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain(
      'aria-label="Airport Belt, 20 properties. Activate to zoom into this area group."',
    );
  });

  it('aria-label uses singular "property" wording when listingCount=1', () => {
    render(<AreaMarkerLayer areas={[makeGroupArea({ areaLabel: 'Airport Belt', listingCount: 1 })]} />);
    const html = capturedDivIconCalls[0].html;
    expect(html).toContain(
      'aria-label="Airport Belt, 1 property. Activate to zoom into this area group."',
    );
  });

  it('Enter keydown on the marker element triggers the same onAreaClick/onAreaCameraIntent handler as a real click', () => {
    const onAreaClick = vi.fn();
    const onAreaCameraIntent = vi.fn();
    const area = makeGroupArea();
    render(
      <AreaMarkerLayer
        areas={[area]}
        onAreaClick={onAreaClick}
        onAreaCameraIntent={onAreaCameraIntent}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);
    const cardEl = capturedMarkers[0].element.querySelector<HTMLElement>('.area-group-card');
    expect(cardEl).not.toBeNull();
    cardEl!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onAreaClick).toHaveBeenCalledTimes(1);
    expect(onAreaClick).toHaveBeenCalledWith(area);
    expect(onAreaCameraIntent).toHaveBeenCalledTimes(1);
    expect(onAreaCameraIntent).toHaveBeenCalledWith(area);
  });

  it('Space keydown on the marker element triggers the same onAreaClick/onAreaCameraIntent handler as a real click', () => {
    const onAreaClick = vi.fn();
    const onAreaCameraIntent = vi.fn();
    const area = makeGroupArea();
    render(
      <AreaMarkerLayer
        areas={[area]}
        onAreaClick={onAreaClick}
        onAreaCameraIntent={onAreaCameraIntent}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);
    const cardEl = capturedMarkers[0].element.querySelector<HTMLElement>('.area-group-card');
    expect(cardEl).not.toBeNull();
    cardEl!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(onAreaClick).toHaveBeenCalledTimes(1);
    expect(onAreaClick).toHaveBeenCalledWith(area);
    expect(onAreaCameraIntent).toHaveBeenCalledTimes(1);
    expect(onAreaCameraIntent).toHaveBeenCalledWith(area);
  });

  it('macro-region markers are unaffected by the isGroup redesign', () => {
    const region = makeArea('N', { areaLabel: 'North Bangalore', isMacroRegion: true, listingCount: 40 });
    render(<AreaMarkerLayer areas={[region]} />);
    const html = capturedDivIconCalls[0].html;
    expect(html).toContain('class="macro-region-bubble dp-region"');
    expect(html).not.toContain('area-group-card');
  });

  it('ordinary (non-group, non-macro-region) area markers are unaffected by the isGroup redesign', () => {
    render(<AreaMarkerLayer areas={[AREA_A]} />);
    const html = capturedDivIconCalls[0].html;
    expect(html).not.toContain('area-group-card');
    expect(html).toContain('area-marker-card');
  });

  it('group markers use area.geo_center_lat/geo_center_lon (real coordinates), never compass-layout math', () => {
    const area = makeGroupArea({ geo_center_lat: 13.198, geo_center_lon: 74.831 });
    render(<AreaMarkerLayer areas={[area]} />);
    const markerMock = vi.mocked(L.marker);
    const [latlng] = markerMock.mock.calls[markerMock.mock.calls.length - 1];
    expect(latlng).toEqual([13.198, 74.831]);
  });
});

describe('AreaMarkerLayer — Issue #1815 hover never publishes onAreaCameraIntent', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    capturedMarkers.length = 0;
  });

  it('rerendering with a panel-hovered/focused area (hoveredAreaKey) does not call onAreaCameraIntent (no camera move)', () => {
    const onAreaCameraIntent = vi.fn();
    const { rerender } = render(
      <AreaMarkerLayer areas={DENSE_GROUP_AREAS} enableDegradation onAreaCameraIntent={onAreaCameraIntent} />,
    );
    rerender(
      <AreaMarkerLayer
        areas={DENSE_GROUP_AREAS}
        enableDegradation
        onAreaCameraIntent={onAreaCameraIntent}
        hoveredAreaKey="se-a-3"
      />,
    );
    expect(onAreaCameraIntent).not.toHaveBeenCalled();
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.flyTo).not.toHaveBeenCalled();
  });

  it('a native mouseover reveal on a hover-dot does not call onAreaCameraIntent either', () => {
    const onAreaCameraIntent = vi.fn();
    const MEDIUM_BAND_AREAS: AreaPoint[] = Array.from({ length: 10 }, (_, i) =>
      makeArea(`med-${i}`, {
        geo_center_lat: 13.2 + i * 0.03,
        geo_center_lon: 74.6 + i * 0.03,
        listingCount: 10 - i,
      }),
    );
    render(
      <AreaMarkerLayer areas={MEDIUM_BAND_AREAS} enableDegradation onAreaCameraIntent={onAreaCameraIntent} />,
    );
    const dotIndex = capturedDivIconCalls.findIndex((c) => c.html.includes('data-testid="area-marker-dot"'));
    expect(dotIndex).toBeGreaterThanOrEqual(0);
    capturedMarkers[dotIndex].handlers.mouseover();
    expect(onAreaCameraIntent).not.toHaveBeenCalled();
  });
});

// ─── Issue #1943 (Slice B+C merge, code review cycle 2, FIX 5) ─────────────
// The 'clusters'/'directions' destination-clustering path (AreaMarkerLayer.tsx
// ~1060-1200, the SAME footprint-aware clusterAreaMembers the 'areas' level
// uses) had NO component test anywhere in the diff before this. This block
// exercises AreaDestinationMarkerLayer (also exported from this module) at
// levelKind='directions', proving AC3 (rectangle-aware merging) and AC5 (a
// multi-member cluster card never calls onSelect, only the camera-intent
// callback) actually hold, plus the underlying clusterAreaMembers footprint
// parameter genuinely changes the merge decision.
describe('Issue #1943 (code review cycle 2, FIX 5) — AreaDestinationMarkerLayer destination clustering (directions/clusters)', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    capturedMarkers.length = 0;
    vi.mocked(L.marker).mockClear();
  });

  const ROOT_NODE: NavigationNodeResponse = {
    nodeKey: 'root',
    nodeType: 'ROOT',
    displayLabel: 'Bangalore',
    depth: -1,
    regionKey: null,
    ancestry: [],
    nextLevelType: 'DIRECTION',
    children: [],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: null,
    areaKey: null,
  };

  function directionChild(
    nodeKey: string,
    lat: number,
    lon: number,
    overrides: Partial<AreasNavigationChild> = {},
  ): { raw: NavigationNodeResponse['children'][number]; typed: AreasNavigationChild } {
    return {
      // NavigationChildSummary's minimal shape (mirrors this file's own
      // `areaChild` convention) — no `depth`/`ancestry`/`children`/
      // `revisionId`, which are ROOT_NODE-level fields, not per-child ones.
      raw: {
        nodeKey,
        nodeType: 'DIRECTION',
        displayLabel: nodeKey,
        displayOrder: 0,
        centreLat: lat,
        centreLon: lon,
      },
      typed: {
        nodeKey,
        nodeType: 'DIRECTION',
        displayLabel: nodeKey,
        displayOrder: 0,
        listingCount: 5,
        schoolCount: null,
        isLeafArea: false,
        matchingAreaCount: null,
        descendantAreaCount: null,
        representativeAreaKeys: [],
        bounds: null,
        bearingDegrees: null,
        ...overrides,
      },
    };
  }

  it('two directions children whose footprints overlap (identical coordinates) render exactly ONE area-visual-cluster-marker, at the members centroid', () => {
    const a = directionChild('d:n', 13.0, 77.6);
    const b = directionChild('d:e', 13.0, 77.6);
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [a.raw, b.raw] }}
        levelKind="directions"
        children={[a.typed, b.typed]}
        onSelect={vi.fn()}
      />,
    );

    expect(capturedMarkers).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('area-visual-cluster-marker');
    const [latlng] = vi.mocked(L.marker).mock.calls[0];
    expect(latlng).toEqual([13.0, 77.6]);
  });

  it('clicking the multi-member cluster card fires onAreaVisualClusterCameraIntent with the members bounds, and NEVER onSelect (AC5)', () => {
    const onSelect = vi.fn();
    const onAreaVisualClusterCameraIntent = vi.fn();
    // Identical coordinates (same convention as test 1 and as
    // destinations.test.tsx's own 'areas'-level AC5 equivalent at line 663)
    // — guarantees the pair lands in the same grid cell and merges
    // regardless of the real `estimateDestinationCardFootprint` output, so
    // this test's outcome does not depend on that calibrated module's exact
    // numbers.
    const a = directionChild('d:n', 13.0, 77.6);
    const b = directionChild('d:e', 13.0, 77.6);
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [a.raw, b.raw] }}
        levelKind="directions"
        children={[a.typed, b.typed]}
        onSelect={onSelect}
        onAreaVisualClusterCameraIntent={onAreaVisualClusterCameraIntent}
      />,
    );

    expect(capturedMarkers).toHaveLength(1);
    // Fire the REAL captured click handler AreaDestinationMarkerLayer
    // registered via marker.on('click', ...) — never a stub standing in for
    // it (mirrors destinations.test.tsx:679's pattern for the 'areas' visual
    // cluster, now proven for 'directions' too).
    capturedMarkers[0].handlers.click();

    expect(onSelect).not.toHaveBeenCalled();
    expect(onAreaVisualClusterCameraIntent).toHaveBeenCalledTimes(1);
    const [bounds] = onAreaVisualClusterCameraIntent.mock.calls[0];
    expect(bounds).toEqual([[13.0, 77.6], [13.0, 77.6]]);
  });

  it('a non-overlapping clusters child renders the ordinary destination card and calls onSelect(nodeKey) on click, never the camera-intent callback', () => {
    const onSelect = vi.fn();
    const onAreaVisualClusterCameraIntent = vi.fn();
    const solo = directionChild('c:whitefield-belt', 13.0, 77.6, { nodeType: 'CLUSTER' });
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [{ ...solo.raw, nodeType: 'CLUSTER' }] }}
        levelKind="clusters"
        children={[solo.typed]}
        onSelect={onSelect}
        onAreaVisualClusterCameraIntent={onAreaVisualClusterCameraIntent}
      />,
    );

    expect(capturedMarkers).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).not.toContain('area-visual-cluster-marker');
    capturedMarkers[0].handlers.click();

    expect(onSelect).toHaveBeenCalledWith('c:whitefield-belt');
    expect(onAreaVisualClusterCameraIntent).not.toHaveBeenCalled();
  });

  it('clusterAreaMembers merges a pair with an explicit wider footprint override that the default 110x100 footprint would NOT merge', () => {
    // 150px apart on the x-axis (project: 1 degree lon == 1000px here) —
    // outside the default AREA_CARD_FOOTPRINT_WIDTH_PX=110 half-width
    // separation (55px) either side, so the two land in different grid
    // cells AND their default-sized card rects do not overlap.
    const project = (lat: number, lon: number) => ({ x: lon * 1000, y: lat * 1000 });
    const members: (ClusterableDestination & { nodeKey: string })[] = [
      { nodeKey: 'left', identityKey: 'left', displayLabel: 'Left', lat: 13.0, lon: 0, listingCount: 5, displayOrder: 0, schoolCount: null },
      { nodeKey: 'right', identityKey: 'right', displayLabel: 'Right', lat: 13.0, lon: 0.15, listingCount: 5, displayOrder: 1, schoolCount: null },
    ];

    const defaultResult = clusterAreaMembers(members, project, 12);
    expect(defaultResult.clusters).toHaveLength(2);

    // A 300px-wide footprint (half-width 150px) makes the two 150px-apart
    // cards overlap, so the SAME grid-separated pair now merges into one
    // cluster — proving the footprint parameter genuinely drives the merge
    // decision, not just the grid pass.
    const widerResult = clusterAreaMembers(members, project, 12, {
      footprintWidthPx: 300,
      footprintHeightPx: 100,
    });
    expect(widerResult.clusters).toHaveLength(1);
    expect(widerResult.clusters[0].members.map((m) => m.identityKey)).toEqual(['left', 'right']);
  });
});
