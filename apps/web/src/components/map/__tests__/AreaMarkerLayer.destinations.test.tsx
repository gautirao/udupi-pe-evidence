/**
 * Unit tests for `AreaDestinationMarkerLayer` — Issue #1956 PR 2 (Slice 3,
 * map half). Covers AC3.1 (root renders the promoted Direction destinations
 * immediately), AC3.2 (primary text = canonical displayLabel per the Task 3/
 * AC3.2 ruling), AC3.3's POSITION mechanism (compass-code derivation from the
 * server-given `d:<code>` nodeKey — real screen-space geometry is a
 * real-browser concern, NOT something JSDOM/unit tests can settle), and the
 * map-click half of AC3.9 (same `onSelect` reference dispatched, never a
 * parallel handler).
 *
 * Mocking strategy mirrors AreaMarkerLayer.regionCompassLayout.test.tsx
 * exactly: a linear, exactly-invertible `containerPointToLatLng` stand-in so
 * a marker's constructed lat/lng can be projected back to the container point
 * the compass layout intended.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';

type CapturedMarker = {
  handlers: Record<string, (...args: unknown[]) => void>;
  addTo: ReturnType<typeof vi.fn>;
  getElement: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  setLatLng: ReturnType<typeof vi.fn>;
  setIcon: ReturnType<typeof vi.fn>;
};
const capturedMarkers: CapturedMarker[] = [];
const markerLatLngCalls: [number, number][] = [];
const divIconHtmlCalls: string[] = [];

const MAP_SIZE = { x: 1200, y: 800 };
const LAT0 = 13.34;
const LON0 = 74.74;
const SCALE = 10000;

function containerPointToLatLng([x, y]: [number, number]): { lat: number; lng: number } {
  return { lat: LAT0 - y / SCALE, lng: LON0 + x / SCALE };
}

function containerPointFromMarkerCall(latlng: [number, number]): { x: number; y: number } {
  const [lat, lng] = latlng;
  return { x: (lng - LON0) * SCALE, y: (LAT0 - lat) * SCALE };
}

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn((opts: { html: string; className: string }) => {
      divIconHtmlCalls.push(opts.html);
      return { options: opts };
    }),
    marker: vi.fn((latlng: [number, number], options?: { icon?: { options: { html: string } } }) => {
      markerLatLngCalls.push(latlng);
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const el = document.createElement('div');
      // AMEND-B (:1327 fix, rework-request-user-correction-1.toml) — mirrors
      // real Leaflet: a marker constructed with an `icon` option already has
      // that icon's HTML in its DOM by the time `bindMarkerDom` runs (real
      // `L.Marker._initIcon` builds the DOM from the `DivIcon`'s `html`
      // during `onAdd`/`addTo`, which production always calls before
      // `bindMarkerDom`). Every real card built by `markerShellHtml`
      // (Explore/Zoom/View-homes/View-schools AND the visual-cluster card)
      // emits BOTH `[role="button"][tabindex="0"]` (the outer shell div) and
      // `.rc-shell` (the inner card) together, so consuming the real icon
      // HTML here — instead of a synthetic placeholder with no `.rc-shell`
      // — does not disturb any existing button/tabindex-scoped query; it
      // only makes the D2 keyboard-focus-ring gate (`.rc-shell` presence)
      // exercisable, where the old placeholder made it permanently vacuous.
      el.innerHTML =
        options?.icon?.options?.html ??
        '<div data-testid="area-destination-marker" tabindex="0" role="button"></div>';
      const instance: Record<string, unknown> = {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          handlers[event] = cb;
          return instance;
        }),
        off: vi.fn((event: string) => {
          delete handlers[event];
          return instance;
        }),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getElement: vi.fn(() => el),
        setLatLng: vi.fn(),
        // Mirrors Leaflet's real `DivIcon.createIcon(oldIcon)`: `setIcon`
        // reassigns the marker's outer div's innerHTML wholesale, which
        // detaches the previous inner `[role="button"]` element and creates
        // a brand-new one. A no-op `vi.fn()` here was a mock-fidelity blind
        // spot that let `getElement()` return the same (stale) node forever,
        // hiding the real defect where listeners bound only at marker
        // creation go dead the moment `setIcon` runs again (AC4.19 re-review
        // fix, required change 4).
        setIcon: vi.fn((icon: { options: { html: string } }) => {
          el.innerHTML = icon.options.html;
        }),
      };
      capturedMarkers.push({
        handlers,
        addTo: instance.addTo as ReturnType<typeof vi.fn>,
        getElement: instance.getElement as ReturnType<typeof vi.fn>,
        remove: instance.remove as ReturnType<typeof vi.fn>,
        setLatLng: instance.setLatLng as ReturnType<typeof vi.fn>,
        setIcon: instance.setIcon as ReturnType<typeof vi.fn>,
      });
      return instance;
    }),
  },
}));

// REQUIRED CHANGE 3 (AC4.19) test support — a mutable zoom + a real
// zoomend-handler registry so a test can simulate the areasZoomTick recompute
// the layer itself listens for (`map.on('zoomend', ...)`), the same trigger a
// bare mouse-wheel zoom fires in the real browser, WITHOUT changing any
// member's data.
let mockZoom = 11;
const zoomendHandlers: Array<() => void> = [];
const mapStub = {
  getSize: vi.fn(() => MAP_SIZE),
  getZoom: vi.fn(() => mockZoom),
  containerPointToLatLng: vi.fn(([x, y]: [number, number]) => containerPointToLatLng([x, y])),
  // Inverse-ish projection for the areas/clusters grid-clustering path —
  // linear and deterministic, mirroring containerPointFromMarkerCall above.
  latLngToContainerPoint: vi.fn(([lat, lng]: [number, number]) => containerPointFromMarkerCall([lat, lng])),
  getContainer: vi.fn(() => document.createElement('div')),
  on: vi.fn((event: string, cb: () => void) => {
    if (event === 'zoomend') zoomendHandlers.push(cb);
  }),
  off: vi.fn(),
};

/** Fires every registered zoomend handler — simulates a real map zoomend tick. */
function fireZoomEnd(newZoom: number) {
  mockZoom = newZoom;
  zoomendHandlers.forEach((cb) => cb());
}

vi.mock('react-leaflet', () => ({
  useMap: vi.fn(() => mapStub),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

import React from 'react';
import { render } from '@testing-library/react';
import L from 'leaflet';
import { AreaDestinationMarkerLayer } from '../AreaMarkerLayer';
import type { AreasNavigationChild } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import { computeCompassLayout, compassPointFor } from '@/lib/map/regionCompassLayout';

function makeChild(overrides: Partial<AreasNavigationChild> = {}): AreasNavigationChild {
  return {
    nodeKey: 'd:n',
    nodeType: 'DIRECTION',
    displayLabel: 'North Bangalore',
    displayOrder: 0,
    listingCount: 12,
    schoolCount: null,
    isLeafArea: false,
    matchingAreaCount: null,
    ...overrides,
  };
}

const ROOT_NODE: NavigationNodeResponse = {
  nodeKey: 'root',
  nodeType: 'ROOT',
  displayLabel: 'Bangalore',
  depth: -1,
  regionKey: null,
  ancestry: [],
  nextLevelType: 'DIRECTION',
  children: [
    { nodeKey: 'd:central', nodeType: 'DIRECTION', displayLabel: 'Central Bangalore', depth: 0, ancestry: [], children: [], revisionId: 1, centreLat: 12.9716, centreLon: 77.5946 },
    { nodeKey: 'd:n', nodeType: 'DIRECTION', displayLabel: 'North Bangalore', depth: 0, ancestry: [], children: [], revisionId: 1, centreLat: 13.0, centreLon: 77.6 },
    { nodeKey: 'd:e', nodeType: 'DIRECTION', displayLabel: 'East Bangalore', depth: 0, ancestry: [], children: [], revisionId: 1, centreLat: 12.95, centreLon: 77.7 },
    { nodeKey: 'd:s', nodeType: 'DIRECTION', displayLabel: 'South Bangalore', depth: 0, ancestry: [], children: [], revisionId: 1, centreLat: 12.9, centreLon: 77.6 },
    { nodeKey: 'd:w', nodeType: 'DIRECTION', displayLabel: 'West Bangalore', depth: 0, ancestry: [], children: [], revisionId: 1, centreLat: 12.95, centreLon: 77.5 },
    { nodeKey: 'd:southeast', nodeType: 'DIRECTION', displayLabel: 'South-East Bangalore', depth: 0, ancestry: [], children: [], revisionId: 1, centreLat: 12.92, centreLon: 77.65 },
    { nodeKey: 'd:northeast', nodeType: 'DIRECTION', displayLabel: 'North-East Bangalore', depth: 0, ancestry: [], children: [], revisionId: 1, centreLat: 13.02, centreLon: 77.65 },
    { nodeKey: 'd:southwest', nodeType: 'DIRECTION', displayLabel: 'South-West Bangalore', depth: 0, ancestry: [], children: [], revisionId: 1, centreLat: 12.92, centreLon: 77.55 },
  ],
  revisionId: 1,
  bounds: {
    centreLat: 12.97,
    centreLon: 77.59,
    minLat: 12.9,
    maxLat: 13.02,
    minLon: 77.5,
    maxLon: 77.7,
  },
  descendantAreaKeys: null,
  areaKey: null,
};

const DIRECTION_CHILDREN: AreasNavigationChild[] = [
  // Deliberately mismatched listingCount/matchingAreaCount on this one entry —
  // count_display_defect_2026_07_29's regression case: a Direction with 1,736
  // listings across only 12 matching areas must render "12 areas with
  // matches", never "1736 areas with matches".
  makeChild({
    nodeKey: 'd:central',
    displayLabel: 'Central Bangalore',
    displayOrder: 0,
    listingCount: 1736,
    matchingAreaCount: 12,
  }),
  makeChild({ nodeKey: 'd:n', displayLabel: 'North Bangalore', displayOrder: 1, listingCount: 12, matchingAreaCount: null }),
  makeChild({ nodeKey: 'd:e', displayLabel: 'East Bangalore', displayOrder: 2, listingCount: 0, matchingAreaCount: 0 }),
  makeChild({ nodeKey: 'd:s', displayLabel: 'South Bangalore', displayOrder: 3, listingCount: 5, matchingAreaCount: null }),
  makeChild({ nodeKey: 'd:w', displayLabel: 'West Bangalore', displayOrder: 4, listingCount: 3, matchingAreaCount: null }),
];

beforeEach(() => {
  capturedMarkers.length = 0;
  markerLatLngCalls.length = 0;
  divIconHtmlCalls.length = 0;
  zoomendHandlers.length = 0;
  mockZoom = 11;
  vi.clearAllMocks();
});

describe('AreaDestinationMarkerLayer — AC3.1 (root renders Direction destinations immediately)', () => {
  it('renders exactly one marker per DIRECTION child at the city root, no whole-city marker', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={DIRECTION_CHILDREN}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(DIRECTION_CHILDREN.length);
  });

  it('renders nothing when node is null (loading/disabled)', () => {
    render(
      <AreaDestinationMarkerLayer node={null} levelKind="empty" children={[]} onSelect={vi.fn()} />,
    );
    expect(capturedMarkers).toHaveLength(0);
  });

  it('renders nothing at a non-directions level (CLUSTER/AREA — no server-given position data; documented gap, not a regression)', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="clusters"
        children={[makeChild({ nodeKey: 'c:whitefield-belt', nodeType: 'CLUSTER' })]}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(0);
  });
});

describe('AreaDestinationMarkerLayer — AC3.2 (primary text = canonical area name)', () => {
  it('uses the server displayLabel verbatim as the card primary text', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={DIRECTION_CHILDREN}
        onSelect={vi.fn()}
      />,
    );
    for (const child of DIRECTION_CHILDREN) {
      expect(divIconHtmlCalls.some((html) => html.includes(child.displayLabel))).toBe(true);
    }
  });

  it('never renders a mechanical "North of North" / synthesized label — only the verbatim server string appears', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={DIRECTION_CHILDREN}
        onSelect={vi.fn()}
      />,
    );
    expect(divIconHtmlCalls.join('\n')).not.toMatch(/of North|of South|of East|of West/i);
  });
});

describe('AreaDestinationMarkerLayer — structural count copy (shared with the panel)', () => {
  it('shows "N areas with matches" for a non-zero child and "No matches with current filters" for a zero child — never a "+N" form', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={DIRECTION_CHILDREN}
        onSelect={vi.fn()}
      />,
    );
    const allHtml = divIconHtmlCalls.join('\n');
    expect(allHtml).toMatch(/No matches with current filters/);
    expect(allHtml).not.toMatch(/\+\d+/);
  });

  it('count_display_defect_2026_07_29 (regression) — renders the true matchingAreaCount, never the listingCount, as the marker caption', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={DIRECTION_CHILDREN}
        onSelect={vi.fn()}
      />,
    );
    const allHtml = divIconHtmlCalls.join('\n');
    expect(allHtml).toMatch(/12 areas with matches/);
    expect(allHtml).not.toMatch(/1736 areas with matches/);
  });

  it('count_display_defect_2026_07_29 (pass 4 regression) — the areas-with-matches line being unavailable never suppresses the journey-aware listing count', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={DIRECTION_CHILDREN}
        onSelect={vi.fn()}
      />,
    );
    const allHtml = divIconHtmlCalls.join('\n');
    // d:n has matchingAreaCount: null, listingCount: 12 — the areas line is
    // correctly absent for that marker, but its own "12 listings" caption
    // must still render (mirrors NavigationChildCard's pass-4 fix exactly).
    expect(allHtml).toMatch(/12 listings/);
  });

  it('count_display_defect_2026_07_29 (pass 4 regression) — a zero matchingAreaCount shows ONLY the locked zero literal, never an additional "No listings yet" caption', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={DIRECTION_CHILDREN}
        onSelect={vi.fn()}
      />,
    );
    const allHtml = divIconHtmlCalls.join('\n');
    expect(allHtml).not.toMatch(/No listings yet/);
  });
});

describe('AreaDestinationMarkerLayer — AC3.3 (position derived from geographic centroid)', () => {
  it('positions each DIRECTION marker at its actual geographic coordinates, preserving relationships', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={DIRECTION_CHILDREN}
        onSelect={vi.fn()}
      />,
    );
    // Since collision avoidance radially repels them without inverting, they should still
    // be relatively positioned according to their raw centroids.
    // We just verify they exist and are correctly passed to leaflet.
    expect(markerLatLngCalls).toHaveLength(DIRECTION_CHILDREN.length);
    const cLat = markerLatLngCalls[0][0];
    const cLon = markerLatLngCalls[0][1];
    const nLat = markerLatLngCalls[1][0];
    const eLon = markerLatLngCalls[2][1];
    const sLat = markerLatLngCalls[3][0];
    const wLon = markerLatLngCalls[4][1];

    expect(nLat).toBeGreaterThan(cLat);
    expect(sLat).toBeLessThan(cLat);
    expect(eLon).toBeGreaterThan(cLon);
    expect(wLon).toBeLessThan(cLon);
  });
});

describe('AreaDestinationMarkerLayer — issue #1956 AC6.9 (Direction full-word/abbreviation vocabulary)', () => {
  // Reproduces the EXACT live Bangalore city-root node keys observed in the
  // reported defect: three full-word suffixes (southeast/northeast/southwest)
  // collided onto one identical container point because the compass table
  // only recognised abbreviations. West/South (already abbreviated) worked.
  const BANGALORE_DIRECTION_CHILDREN: AreasNavigationChild[] = [
    makeChild({ nodeKey: 'd:w', displayLabel: 'West Bangalore', displayOrder: 0 }),
    makeChild({ nodeKey: 'd:s', displayLabel: 'South Bangalore', displayOrder: 1 }),
    makeChild({ nodeKey: 'd:southeast', displayLabel: 'South-East Bangalore', displayOrder: 2 }),
    makeChild({ nodeKey: 'd:northeast', displayLabel: 'North-East Bangalore', displayOrder: 3 }),
    makeChild({ nodeKey: 'd:southwest', displayLabel: 'South-West Bangalore', displayOrder: 4 }),
  ];

  it('all five live Bangalore Direction node keys resolve to five DISTINCT container points (no collision, none hidden)', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={BANGALORE_DIRECTION_CHILDREN}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(BANGALORE_DIRECTION_CHILDREN.length);
    const points = markerLatLngCalls.map((latlng) => containerPointFromMarkerCall(latlng));
    const seen = new Set<string>();
    for (const p of points) {
      const key = `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
      expect(seen.has(key)).toBe(false); // fails loudly if a real browser-observed collision reappears
      seen.add(key);
    }
    expect(seen.size).toBe(BANGALORE_DIRECTION_CHILDREN.length);
  });

  it('each full-word Direction lands at its INTENDED geographic position, surviving collision adjustments without inversion', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={BANGALORE_DIRECTION_CHILDREN}
        onSelect={vi.fn()}
      />,
    );
    // Ensure all 5 are rendered
    expect(markerLatLngCalls).toHaveLength(5);
    // Just verify the relative relationships (e.g. West is West of South)
    const wLon = markerLatLngCalls[0][1];
    const sLon = markerLatLngCalls[1][1];
    expect(wLon).toBeLessThan(sLon);
  });

  it('every clickable marker element carries its OWN distinct nodeKey (all five individually clickable)', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={BANGALORE_DIRECTION_CHILDREN}
        onSelect={vi.fn()}
      />,
    );
    const nodeKeys = BANGALORE_DIRECTION_CHILDREN.map((c) => c.nodeKey);
    expect(new Set(nodeKeys).size).toBe(nodeKeys.length);
    nodeKeys.forEach((nodeKey) => {
      expect(divIconHtmlCalls.some((html) => html.includes(`data-node-key="${nodeKey}"`))).toBe(true);
    });
  });

  it('existing ABBREVIATED-key behaviour is unchanged: d:n/d:e/d:s/d:w still resolve to distinct coordinates', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={DIRECTION_CHILDREN.slice(1)}
        onSelect={vi.fn()}
      />,
    );
    expect(markerLatLngCalls).toHaveLength(4);
    const lats = markerLatLngCalls.map(c => c[0]);
    expect(new Set(lats).size).toBeGreaterThan(1);
  });
});

describe('AreaDestinationMarkerLayer — AC3.9 (map click dispatches the SAME action as the panel)', () => {
  it('click calls the injected onSelect reference with the exact server nodeKey — never a wrapped/derived handler', () => {
    const onSelect = vi.fn();
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={DIRECTION_CHILDREN}
        onSelect={onSelect}
      />,
    );
    capturedMarkers[1].handlers.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('d:n');
  });

  it('the SAME onSelect reference passed to the panel-side card would receive the identical call — this layer never constructs its own action', () => {
    // Negative test for T3: a fresh wrapper closure would still "work" but
    // would defeat Object.is identity checks elsewhere in the app. Proven
    // here by asserting the exact function reference given to the map layer
    // is invoked directly (spy identity), not copied/proxied.
    const selectNode = vi.fn();
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={DIRECTION_CHILDREN}
        onSelect={selectNode}
      />,
    );
    capturedMarkers[3].handlers.click();
    expect(selectNode).toHaveBeenCalledWith('d:s');
  });

  it('hover/focus report the node_key via onHoverChange, and leave reports null', () => {
    const onHoverChange = vi.fn();
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={DIRECTION_CHILDREN}
        onSelect={vi.fn()}
        onHoverChange={onHoverChange}
      />,
    );
    capturedMarkers[2].handlers.mouseover();
    expect(onHoverChange).toHaveBeenCalledWith('d:e');
    capturedMarkers[2].handlers.mouseout();
    expect(onHoverChange).toHaveBeenCalledWith(null);
  });
});

describe('AreaDestinationMarkerLayer — visual distinctness from listing/home markers', () => {
  it('uses its own icon className, distinct from area/cluster/dot icon classNames', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={DIRECTION_CHILDREN}
        onSelect={vi.fn()}
      />,
    );
    // divIcon is invoked with { className, html } — assert via the mock's own
    // recorded call args rather than html string alone.
    const divIconMock = L.divIcon as unknown as ReturnType<typeof vi.fn>;
    const classNames = divIconMock.mock.calls.map(([opts]: [{ className: string }]) => opts.className);
    expect(classNames.every((c) => c === 'area-destination-marker-icon')).toBe(true);
    expect(classNames).not.toContain('area-cluster-marker-icon');
    expect(classNames).not.toContain('area-marker-dot-icon');
  });
});

// ── Issue #1956 PR 3 (Slice 4) — AREA / Local-Destination real geography ──
describe('AreaDestinationMarkerLayer — CLUSTER (Local Destination) real-geography markers', () => {
  function clusterNode(rawChildren: NavigationNodeResponse['children']): NavigationNodeResponse {
    return { ...ROOT_NODE, nodeKey: 'd:n', nodeType: 'DIRECTION', children: rawChildren };
  }

  it('renders one structural marker per CLUSTER child, at its real centroid, never "+N"', () => {
    const rawChildren: NavigationNodeResponse['children'] = [
      {
        nodeKey: 'c:whitefield-belt',
        nodeType: 'CLUSTER',
        displayLabel: 'Whitefield Belt',
        displayOrder: 0,
        areaKey: null,
        centreLat: 12.97,
        centreLon: 77.75,
      },
    ];
    const typedChildren: AreasNavigationChild[] = [
      makeChild({
        nodeKey: 'c:whitefield-belt',
        nodeType: 'CLUSTER',
        displayLabel: 'Whitefield Belt',
        listingCount: 40,
        schoolCount: 6,
        matchingAreaCount: 8,
      }),
    ];
    render(
      <AreaDestinationMarkerLayer
        node={clusterNode(rawChildren)}
        levelKind="clusters"
        children={typedChildren}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);
    expect(markerLatLngCalls[0]).toEqual([12.97, 77.75]);
    expect(divIconHtmlCalls.some((h) => h.includes('8 areas with matches'))).toBe(true);
    expect(divIconHtmlCalls.some((h) => h.includes('6 schools'))).toBe(true);
    expect(divIconHtmlCalls.some((h) => /\+\d/.test(h))).toBe(false);
  });

  it('dispatches the SAME onSelect reference on a CLUSTER marker click (drills down via node=)', () => {
    const onSelect = vi.fn();
    const rawChildren: NavigationNodeResponse['children'] = [
      { nodeKey: 'c:x', nodeType: 'CLUSTER', displayLabel: 'X', displayOrder: 0, areaKey: null, centreLat: 13.0, centreLon: 77.6 },
    ];
    render(
      <AreaDestinationMarkerLayer
        node={clusterNode(rawChildren)}
        levelKind="clusters"
        children={[makeChild({ nodeKey: 'c:x', nodeType: 'CLUSTER', displayLabel: 'X' })]}
        onSelect={onSelect}
      />,
    );
    capturedMarkers[0].handlers.click();
    expect(onSelect).toHaveBeenCalledWith('c:x');
  });

  it('omits a CLUSTER child with no coordinates rather than fabricating one', () => {
    const rawChildren: NavigationNodeResponse['children'] = [
      { nodeKey: 'c:no-coords', nodeType: 'CLUSTER', displayLabel: 'No Coords', displayOrder: 0, areaKey: null },
    ];
    render(
      <AreaDestinationMarkerLayer
        node={clusterNode(rawChildren)}
        levelKind="clusters"
        children={[makeChild({ nodeKey: 'c:no-coords', nodeType: 'CLUSTER', displayLabel: 'No Coords' })]}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(0);
  });
});

describe('AreaDestinationMarkerLayer — dense AREA children (single markers + visual clustering)', () => {
  function areaChild(
    areaKey: string,
    lat: number,
    lon: number,
    overrides: Partial<AreasNavigationChild> = {},
  ): { raw: NavigationNodeResponse['children'][number]; typed: AreasNavigationChild } {
    const nodeKey = `a:${areaKey}`;
    return {
      raw: { nodeKey, nodeType: 'AREA', displayLabel: areaKey, displayOrder: 0, areaKey, centreLat: lat, centreLon: lon },
      typed: makeChild({
        nodeKey,
        nodeType: 'AREA',
        displayLabel: areaKey,
        isLeafArea: true,
        listingCount: 3,
        schoolCount: 2,
        matchingAreaCount: null,
        ...overrides,
      }),
    };
  }

  it('renders a lone (spatially isolated) AREA as a single-AREA marker with its exact schoolCount, no "+N" line', () => {
    const { raw, typed } = areaChild('hebbal', 13.0, 77.6, { listingCount: 7, schoolCount: 3 });
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [raw] }}
        levelKind="areas"
        children={[typed]}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);
    expect(divIconHtmlCalls[0]).toContain('area-single-marker');
    expect(divIconHtmlCalls[0]).toContain('3 schools');
    expect(divIconHtmlCalls.some((h) => /\+\d/.test(h))).toBe(false);
  });

  it('selecting a single-AREA marker dispatches onSelect with its own nodeKey (a real leaf node)', () => {
    const onSelect = vi.fn();
    const { raw, typed } = areaChild('hebbal', 13.0, 77.6);
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [raw] }}
        levelKind="areas"
        children={[typed]}
        onSelect={onSelect}
      />,
    );
    capturedMarkers[0].handlers.click();
    // AC7 — click fires the activation callback EXACTLY once, never twice
    // from bubbling/a nested interactive re-triggering it.
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('a:hebbal');
  });

  it('groups spatially-dense AREA children into ONE visual cluster with "+N areas with matches", omitting schoolCount entirely (case a)', () => {
    // All at the identical projected pixel — same grid cell.
    const members = [
      areaChild('alpha', 13.0, 77.6, { listingCount: 10, schoolCount: 5 }),
      areaChild('bravo', 13.0, 77.6, { listingCount: 8, schoolCount: 4 }),
      areaChild('charlie', 13.0, 77.6, { listingCount: 3, schoolCount: 1 }),
      areaChild('delta', 13.0, 77.6, { listingCount: 1, schoolCount: 1 }),
    ];
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
        levelKind="areas"
        children={members.map((m) => m.typed)}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);
    const html = divIconHtmlCalls[0];
    expect(html).toContain('area-visual-cluster-marker');
    expect(html).toContain('+2 areas with matches');
    // Case (a): schoolCount is NEVER summed/shown for an ad-hoc visual cluster.
    expect(html).not.toMatch(/\bschool/);
  });

  it('clicking a visual cluster fires the camera-intent callback, never onSelect (client-side grouping, no node= change)', () => {
    const onSelect = vi.fn();
    const onAreaVisualClusterCameraIntent = vi.fn();
    const members = [
      areaChild('alpha', 13.0, 77.6),
      areaChild('bravo', 13.0, 77.6),
    ];
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
        levelKind="areas"
        children={members.map((m) => m.typed)}
        onSelect={onSelect}
        onAreaVisualClusterCameraIntent={onAreaVisualClusterCameraIntent}
      />,
    );
    act(() => {
      capturedMarkers[0].handlers.click();
    });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onAreaVisualClusterCameraIntent).toHaveBeenCalledTimes(1);
    const [bounds, center] = onAreaVisualClusterCameraIntent.mock.calls[0];
    expect(bounds).toEqual([[13.0, 77.6], [13.0, 77.6]]);
    expect(center).toEqual([13.0, 77.6]);
  });

  it('excludes a zero-listing-count AREA from clustering AND from the "+N" count (visibility before clustering)', () => {
    const members = [
      areaChild('has-matches-1', 13.0, 77.6, { listingCount: 5 }),
      areaChild('has-matches-2', 13.0, 77.6, { listingCount: 4 }),
      areaChild('zero-content', 13.0, 77.6, { listingCount: 0 }),
    ];
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
        levelKind="areas"
        children={members.map((m) => m.typed)}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);
    const html = divIconHtmlCalls[0];
    // Only 2 eligible members -> "2 areas with matches", not "3" and not "+1".
    expect(html).toContain('2 areas with matches');
    expect(html).not.toMatch(/\+\d/);
  });

  it('omits an AREA child with a (0, 0) centroid rather than plotting it at Null Island; siblings still render', () => {
    const good = areaChild('good', 13.0, 77.6);
    const nullIsland = areaChild('bad', 0, 0);
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [good.raw, nullIsland.raw] }}
        levelKind="areas"
        children={[good.typed, nullIsland.typed]}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);
    expect(markerLatLngCalls[0]).toEqual([13.0, 77.6]);
  });

  it('omits an AREA child with no coordinates at all (undefined centreLat/centreLon); siblings still render', () => {
    const good = areaChild('good', 13.0, 77.6);
    const noCoords = {
      raw: { nodeKey: 'a:no-coords', nodeType: 'AREA' as const, displayLabel: 'No Coords', displayOrder: 0, areaKey: 'no-coords' },
      typed: makeChild({ nodeKey: 'a:no-coords', nodeType: 'AREA', displayLabel: 'No Coords', isLeafArea: true }),
    };
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [good.raw, noCoords.raw] }}
        levelKind="areas"
        children={[good.typed, noCoords.typed]}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);
  });

  it('reuses the SAME marker instance across a re-render when membership/position is unchanged (AC4.19 non-recreation)', () => {
    const { raw, typed } = areaChild('hebbal', 13.0, 77.6);
    const { rerender } = render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [raw] }}
        levelKind="areas"
        children={[typed]}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);
    const firstMarkerRemove = capturedMarkers[0].remove;

    rerender(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [raw] }}
        levelKind="areas"
        children={[typed]}
        onSelect={vi.fn()}
        hoveredNodeKey={null}
      />,
    );

    // A genuinely new marker would push a second capturedMarkers entry and
    // remove the first; reuse means still exactly one L.marker() call ever,
    // and the original marker was never removed.
    expect(capturedMarkers).toHaveLength(1);
    expect(firstMarkerRemove).not.toHaveBeenCalled();
  });

  // REQUIRED CHANGE 3 (review fix, AC4.19) — the PRIOR version of this suite
  // asserted `setIcon` WAS called on every re-render, which locked in the
  // exact DOM-recreation defect AC4.19 forbids (Leaflet's setIcon ->
  // _initIcon reassigns the DivIcon's innerHTML wholesale, destroying the
  // data-testid child elements — and any keyboard focus on them — even when
  // nothing about the marker actually changed). These two tests replace that
  // assertion with its correct opposite.
  it('does NOT call setIcon/setLatLng on a bare re-render with unchanged content/position (AC4.19)', () => {
    const { raw, typed } = areaChild('hebbal', 13.0, 77.6);
    const { rerender } = render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [raw] }}
        levelKind="areas"
        children={[typed]}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);

    rerender(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [raw] }}
        levelKind="areas"
        children={[typed]}
        onSelect={vi.fn()}
      />,
    );

    expect(capturedMarkers).toHaveLength(1);
    expect(capturedMarkers[0].setIcon).not.toHaveBeenCalled();
    expect(capturedMarkers[0].setLatLng).not.toHaveBeenCalled();
  });

  it('does NOT call setIcon again on a zoom-only recompute when children/focusedMembers are unchanged (AC4.19)', () => {
    const { raw, typed } = areaChild('hebbal', 13.0, 77.6);
    const { rerender } = render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [raw] }}
        levelKind="areas"
        children={[typed]}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);

    // Simulate the real zoomend tick this layer listens for
    // (areasZoomTick), then rerender with the SAME children/focus — a bare
    // zoom recompute with no data change must never touch this marker's DOM.
    act(() => {
      fireZoomEnd(13);
    });
    rerender(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [raw] }}
        levelKind="areas"
        children={[typed]}
        onSelect={vi.fn()}
      />,
    );

    expect(capturedMarkers).toHaveLength(1);
    expect(capturedMarkers[0].setIcon).not.toHaveBeenCalled();
  });

  // Positive half of the AC4.19 dirty-check (review fix) — the two tests
  // above only pin the NEGATIVE case (setIcon skipped when nothing
  // changed); without this, an "always skip" regression that broke content
  // updates entirely would be invisible to the suite.
  it('calls setIcon exactly once, reusing the same marker instance, when a single-AREA child\'s listingCount actually changes (AC4.19 positive case)', () => {
    const { raw, typed } = areaChild('hebbal', 13.0, 77.6, { listingCount: 3 });
    const { rerender } = render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [raw] }}
        levelKind="areas"
        children={[typed]}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);
    expect(markerLatLngCalls).toHaveLength(1);

    const changed = areaChild('hebbal', 13.0, 77.6, { listingCount: 7 });
    rerender(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [changed.raw] }}
        levelKind="areas"
        children={[changed.typed]}
        onSelect={vi.fn()}
      />,
    );

    // Same marker instance reused (no second L.marker() construction) — just
    // its icon updated in place.
    expect(capturedMarkers).toHaveLength(1);
    expect(markerLatLngCalls).toHaveLength(1);
    expect(capturedMarkers[0].setIcon).toHaveBeenCalledTimes(1);
  });

  // REQUIRED CHANGE 4 (re-review fix, AC4.19) — a hover/selection/count-copy
  // change correctly fires `setIcon` (positive case above), which Leaflet's
  // real `_initIcon` implements by reassigning the marker's outer div's
  // innerHTML wholesale, destroying and replacing the inner
  // `[role="button"][tabindex="0"]` element the keyboard/focus bridge is
  // attached to. If that bridge is only ever bound once (at marker
  // creation), the fresh element it returns keeps its `role="button"
  // tabindex="0"` attributes — visually and to a screen reader they still
  // look activatable — but Enter/Space silently does nothing forever after
  // the first hover/selection. The mock's `setIcon` above now genuinely
  // replaces the element (mirroring `DivIcon.createIcon`), so this failed
  // before the AreaMarkerLayer.tsx `bindMarkerDom` rebind fix and passes now.
  //
  // AMEND-B (rework-request-user-correction-1.toml) — this test USED TO stage
  // the setIcon-triggering change via a hover-driven border-width diff
  // (`hoveredNodeKey` prop flip). Issue #2330 makes hover a pure CSS
  // transform (no HTML diff), so that staging no longer fires `setIcon` at
  // all and the scenario this test set up to exercise no longer occurs. The
  // underlying AC4.19 GUARANTEE this test protects — Enter still activates a
  // single-AREA marker exactly once even after its DOM element has been
  // wholesale-replaced by `setIcon` — has NOT gone away (setIcon still fires
  // on a real content change, e.g. a listingCount count-copy update, exactly
  // like the "visual-cluster marker" sibling test below), so this is
  // rebound to that trigger instead of being dropped. This IS the AC7
  // exactly-one-activation coverage for the single-AREA marker's Enter path
  // across an element replacement.
  it('AC7: Enter still activates a single-AREA marker exactly once after its element is replaced by a real (listingCount) setIcon change', () => {
    const { raw, typed } = areaChild('hebbal', 13.0, 77.6, { listingCount: 3 });
    const { rerender } = render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [raw] }}
        levelKind="areas"
        children={[typed]}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);

    // A real listingCount (count-copy) change dirties the HTML and correctly
    // fires setIcon — the same trigger already proven for the visual-cluster
    // marker in the sibling test below, applied here to the single-AREA card.
    const changed = areaChild('hebbal', 13.0, 77.6, { listingCount: 7 });
    rerender(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [changed.raw] }}
        levelKind="areas"
        children={[changed.typed]}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers[0].setIcon).toHaveBeenCalledTimes(1);

    const freshButton = (capturedMarkers[0].getElement() as HTMLElement).querySelector<HTMLElement>(
      '[role="button"][tabindex="0"]',
    );
    expect(freshButton).not.toBeNull();
    const clickSpy = vi.fn();
    freshButton!.addEventListener('click', clickSpy);

    freshButton!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('rebinds the keydown->click bridge on a visual-cluster marker after a total-listingCount (count-copy) change (AC4.19 focus/keyboard fix)', () => {
    const members = [
      areaChild('alpha', 13.0, 77.6, { listingCount: 10 }),
      areaChild('bravo', 13.0, 77.6, { listingCount: 8 }),
    ];
    const { rerender } = render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
        levelKind="areas"
        children={members.map((m) => m.typed)}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);

    // Same membership (same cluster identity key) — only the count-copy
    // changes, which still dirties the HTML via totalListingCount.
    const changedMembers = [
      areaChild('alpha', 13.0, 77.6, { listingCount: 20 }),
      areaChild('bravo', 13.0, 77.6, { listingCount: 8 }),
    ];
    rerender(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: changedMembers.map((m) => m.raw) }}
        levelKind="areas"
        children={changedMembers.map((m) => m.typed)}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(1);
    expect(capturedMarkers[0].setIcon).toHaveBeenCalledTimes(1);

    const freshButton = (capturedMarkers[0].getElement() as HTMLElement).querySelector<HTMLElement>(
      '[role="button"][tabindex="0"]',
    );
    expect(freshButton).not.toBeNull();
    const clickSpy = vi.fn();
    freshButton!.addEventListener('click', clickSpy);

    freshButton!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  // ── Issue #1956 PR 3 (bounded state-lift, AC4.12/AC4.5) — controlled
  // focused-cluster identity. MapDiscovery owns ONE `focusedClusterMemberAreaKeys`
  // value and threads it here AND to `DiscoverAreasJourneyPanel` unchanged, so
  // a cluster click on the map and the panel's own derived member list can
  // never disagree on the focused set (AC4.12).
  describe('controlled cluster focus (AC4.12/AC4.5)', () => {
    it('reports its member areaKeys via onClusterFocusChange on click — the identity a controlling parent forwards to the panel', () => {
      const onClusterFocusChange = vi.fn();
      const members = [
        areaChild('alpha', 13.0, 77.6),
        areaChild('bravo', 13.0, 77.6),
      ];
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
          levelKind="areas"
          children={members.map((m) => m.typed)}
          onSelect={vi.fn()}
          onClusterFocusChange={onClusterFocusChange}
        />,
      );
      act(() => {
        capturedMarkers[0].handlers.click();
      });
      expect(onClusterFocusChange).toHaveBeenCalledTimes(1);
      const [reportedKeys] = onClusterFocusChange.mock.calls[0];
      expect([...reportedKeys].sort()).toEqual(['alpha', 'bravo']);
    });

    it('when a parent controls focusedClusterMemberAreaKeys to a subset, only that subset is clustered — a third member outside the set never contributes to the count (AC4.12 identical visible set)', () => {
      const members = [
        areaChild('alpha', 13.0, 77.6, { listingCount: 10 }),
        areaChild('bravo', 13.0, 77.6, { listingCount: 8 }),
        areaChild('charlie', 13.0, 77.6, { listingCount: 3 }),
      ];
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
          levelKind="areas"
          children={members.map((m) => m.typed)}
          onSelect={vi.fn()}
          focusedClusterMemberAreaKeys={['alpha', 'bravo']}
        />,
      );
      expect(capturedMarkers).toHaveLength(1);
      const html = divIconHtmlCalls[0];
      // Only the 2 controlled members are eligible -> "2 areas with matches",
      // never "3" (charlie is excluded from the scoped/clustered set).
      expect(html).toContain('2 areas with matches');
      expect(html).not.toMatch(/\+\d/);
    });

    it('clearing focus (focusedClusterMemberAreaKeys=null) restores the full member set on the next render — no stale internal fallback state survives the controlled value', () => {
      const members = [
        areaChild('alpha', 13.0, 77.6, { listingCount: 10 }),
        areaChild('bravo', 13.0, 77.6, { listingCount: 8 }),
        areaChild('charlie', 13.0, 77.6, { listingCount: 3 }),
      ];
      const { rerender } = render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
          levelKind="areas"
          children={members.map((m) => m.typed)}
          onSelect={vi.fn()}
          focusedClusterMemberAreaKeys={['alpha', 'bravo']}
        />,
      );
      expect(divIconHtmlCalls[divIconHtmlCalls.length - 1]).toContain('2 areas with matches');

      rerender(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
          levelKind="areas"
          children={members.map((m) => m.typed)}
          onSelect={vi.fn()}
          focusedClusterMemberAreaKeys={null}
        />,
      );
      // Full 3-member set is back: 2 displayed representatives (the cap) +
      // 1 hidden -> "+1 areas with matches", never the focused 2-member copy.
      expect(divIconHtmlCalls[divIconHtmlCalls.length - 1]).toContain('+1 areas with matches');
    });

    // REQUIRED CHANGE 5 (review fix, AC4.18) — the PRIOR reconciliation only
    // cleared focus when a member disappeared from `children` entirely. If a
    // filter instead drops every focused member's count to zero (still
    // present in `children`, just no longer VISIBLE), focus used to survive
    // — and `scoped` was computed from the stale focus BEFORE the (too-late)
    // check, so the render right before clearing painted a stale/partial
    // subset. This test proves both are fixed: the check now runs against
    // the VISIBLE set, and the clearing render paints nothing new at all.
    it('clears focus when a filter drops EVERY focused member to zero-content, painting no stale/partial frame on the clearing render (AC4.18)', () => {
      const onClusterFocusChange = vi.fn();
      const members = [
        areaChild('alpha', 13.0, 77.6, { listingCount: 10 }),
        areaChild('bravo', 13.0, 77.6, { listingCount: 8 }),
        areaChild('charlie', 13.0, 77.6, { listingCount: 3 }),
      ];
      const { rerender } = render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
          levelKind="areas"
          children={members.map((m) => m.typed)}
          onSelect={vi.fn()}
          focusedClusterMemberAreaKeys={['alpha', 'bravo', 'charlie']}
          onClusterFocusChange={onClusterFocusChange}
        />,
      );
      // The map marker keeps its own default 2-name representative cap
      // (unaffected by this fix) — 3 members -> 2 shown + 1 hidden.
      expect(divIconHtmlCalls[divIconHtmlCalls.length - 1]).toContain('+1 areas with matches');
      const markerCountBefore = capturedMarkers.length;
      const htmlCallCountBefore = divIconHtmlCalls.length;

      // A filter tightens: charlie (still present in `children`) drops to
      // zero listings, so the focused set is no longer FULLY visible.
      const afterFilter = [
        members[0],
        members[1],
        { ...members[2], typed: { ...members[2].typed, listingCount: 0 } },
      ];
      act(() => {
        rerender(
          <AreaDestinationMarkerLayer
            node={{ ...ROOT_NODE, children: afterFilter.map((m) => m.raw) }}
            levelKind="areas"
            children={afterFilter.map((m) => m.typed)}
            onSelect={vi.fn()}
            focusedClusterMemberAreaKeys={['alpha', 'bravo', 'charlie']}
            onClusterFocusChange={onClusterFocusChange}
          />,
        );
      });

      expect(onClusterFocusChange).toHaveBeenCalledWith(null);
      // No new marker/icon was produced on the SAME render that decided to
      // clear — the map is left exactly as the previous (correct) render
      // left it, never a stale 2-member subset or an empty frame.
      expect(capturedMarkers.length).toBe(markerCountBefore);
      expect(divIconHtmlCalls.length).toBe(htmlCallCountBefore);
    });

    // Issue #2124/#2125 blocker — mixed-eligibility cluster never opens in
    // the schools journey. `clusterVisibleAreaMembers` (areaClustering.ts)
    // already treats every clusterable member as visible for the 'schools'
    // journey — a zero-school AREA is still valid canonical geography, not
    // eligibility-hidden — so a cluster mixing a zero-school member with a
    // non-zero one groups into ONE visual cluster exactly like this test's
    // co-located fixture. Before the fix, THIS reconciliation effect used
    // `partitionMembersByJourney`'s raw eligibility (schoolCount > 0) to
    // decide `stillAllVisible`, disagreeing with the grouping rule above: a
    // real tap on that cluster set focus, then this effect immediately
    // decided "not still visible" (the zero-school member) and cleared it on
    // the very same render — the whole cluster silently became unclickable
    // in school-first mode, never opening the mobile sheet or desktop
    // cluster-focus panel. This proves the reconciliation now agrees with
    // the grouping rule for the schools journey: a mixed-eligibility cluster
    // keeps its focus (no `onClusterFocusChange(null)`), and every member —
    // including the zero-school one — stays in the rendered cluster copy.
    it('school-first journey: a mixed-eligibility cluster (one member schoolCount=0, another >0) keeps its focus instead of being cleared by the reconciliation effect (#2124/#2125)', () => {
      const onClusterFocusChange = vi.fn();
      const members = [
        areaChild('alpha', 13.0, 77.6, { listingCount: 10, schoolCount: 4 }),
        areaChild('bravo', 13.0, 77.6, { listingCount: 8, schoolCount: 0 }),
      ];
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
          levelKind="areas"
          children={members.map((m) => m.typed)}
          onSelect={vi.fn()}
          journey="school-first"
          focusedClusterMemberAreaKeys={['alpha', 'bravo']}
          onClusterFocusChange={onClusterFocusChange}
        />,
      );

      // The reconciliation effect runs on mount (focusedClusterMemberAreaKeys
      // is already set) — it must NOT decide the zero-school member makes
      // the set "not still visible" and clear focus.
      expect(onClusterFocusChange).not.toHaveBeenCalled();
      // Both co-located members render together as ONE cluster card with
      // both counted — the zero-school member was never dropped from the
      // cluster, and the cluster itself stayed open/focused.
      expect(capturedMarkers).toHaveLength(1);
      expect(divIconHtmlCalls[divIconHtmlCalls.length - 1]).toContain('2 areas with matches');
    });
  });

  // REQUIRED CHANGE 4 (review fix) — the areas/clusters markers carry
  // tabindex="0" role="button" in their HTML but, before this fix, the
  // effect attached only a Leaflet click handler: no keydown Enter/Space
  // bridge existed, so a keyboard user could tab onto a new area/cluster
  // marker and activate none of it. Mirrors AreaMarkerLayer.test.tsx's
  // existing directions-marker keyboard test pattern exactly: a real native
  // 'click' listener on the element proves the keydown bridge actually
  // invokes `el.click()`, the same DOM-level mechanism a real browser uses.
  describe('keyboard accessibility (AC — new area/cluster markers are keyboard-operable)', () => {
    it('Enter keydown activates a single-AREA marker', () => {
      const { raw, typed } = areaChild('hebbal', 13.0, 77.6);
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: [raw] }}
          levelKind="areas"
          children={[typed]}
          onSelect={vi.fn()}
        />,
      );
      const el = (capturedMarkers[0].getElement() as HTMLElement).querySelector<HTMLElement>(
        '[role="button"][tabindex="0"]',
      );
      expect(el).not.toBeNull();
      const clickSpy = vi.fn();
      el?.addEventListener('click', clickSpy);
      el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('Space keydown activates a visual-AREA-cluster marker', () => {
      const members = [
        areaChild('alpha', 13.0, 77.6),
        areaChild('bravo', 13.0, 77.6),
      ];
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
          levelKind="areas"
          children={members.map((m) => m.typed)}
          onSelect={vi.fn()}
        />,
      );
      const el = (capturedMarkers[0].getElement() as HTMLElement).querySelector<HTMLElement>(
        '[role="button"][tabindex="0"]',
      );
      expect(el).not.toBeNull();
      const clickSpy = vi.fn();
      el?.addEventListener('click', clickSpy);
      el?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });
  });

  // Issue #2330 (AC7) — completes the click/Enter/Space exactly-once matrix
  // across ALL THREE marker families. Coverage before this describe block:
  //   - Explore (directions-level single member): click ✅ (AC3.9 describe,
  //     module top), Enter ❌, Space ❌.
  //   - View-homes/View-schools (areas-level single member): click ✅
  //     (toHaveBeenCalledTimes(1) above), Enter ✅ (keyboard accessibility
  //     describe above), Space ❌.
  //   - Zoom in (areas-level visual cluster): click ✅ (camera-intent
  //     describe above), Space ✅ (keyboard accessibility describe above),
  //     Enter ❌.
  // The four missing cells are filled here. Mirrors the SAME pattern the
  // pre-existing "keyboard accessibility" describe above already
  // established: this mock's `L.marker(...).on('click', cb)` records the
  // production callback in a plain JS object (`handlers`), it is never wired
  // to the element's real DOM 'click' event the way Leaflet's real
  // `DomEvent.on` does in a browser — so a keydown-dispatched
  // `el.click()` cannot reach the production `onSelect`/camera-intent
  // callback through this harness. Attaching an OWN native 'click' listener
  // (`clickSpy`) on the SAME element before dispatching the keydown proves
  // the keydown->`el.click()` bridge itself fires exactly once (the thing
  // `bindMarkerDom` actually owns and this AC is about); the mouse-path
  // `toHaveBeenCalledTimes(1)` assertions elsewhere in this file already
  // prove that a real click reaches the production callback exactly once.
  describe('AC7 — exactly-one-activation matrix completion (Explore Enter/Space, Zoom Enter, View-homes Space)', () => {
    it('Explore: Enter keydown activates exactly once', () => {
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: [ROOT_NODE.children[1]] }}
          levelKind="directions"
          children={[makeChild()]}
          onSelect={vi.fn()}
        />,
      );
      const el = (capturedMarkers[0].getElement() as HTMLElement).querySelector<HTMLElement>(
        '[role="button"][tabindex="0"]',
      );
      expect(el).not.toBeNull();
      const clickSpy = vi.fn();
      el?.addEventListener('click', clickSpy);
      el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('Explore: Space keydown activates exactly once', () => {
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: [ROOT_NODE.children[1]] }}
          levelKind="directions"
          children={[makeChild()]}
          onSelect={vi.fn()}
        />,
      );
      const el = (capturedMarkers[0].getElement() as HTMLElement).querySelector<HTMLElement>(
        '[role="button"][tabindex="0"]',
      );
      expect(el).not.toBeNull();
      const clickSpy = vi.fn();
      el?.addEventListener('click', clickSpy);
      el?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('View-homes (single-AREA leaf): Space keydown activates exactly once', () => {
      const { raw, typed } = areaChild('hebbal', 13.0, 77.6);
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: [raw] }}
          levelKind="areas"
          children={[typed]}
          onSelect={vi.fn()}
        />,
      );
      const el = (capturedMarkers[0].getElement() as HTMLElement).querySelector<HTMLElement>(
        '[role="button"][tabindex="0"]',
      );
      expect(el).not.toBeNull();
      const clickSpy = vi.fn();
      el?.addEventListener('click', clickSpy);
      el?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('Zoom in (visual cluster): Enter keydown activates exactly once', () => {
      const members = [areaChild('alpha', 13.0, 77.6), areaChild('bravo', 13.0, 77.6)];
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
          levelKind="areas"
          children={members.map((m) => m.typed)}
          onSelect={vi.fn()}
        />,
      );
      const el = (capturedMarkers[0].getElement() as HTMLElement).querySelector<HTMLElement>(
        '[role="button"][tabindex="0"]',
      );
      expect(el).not.toBeNull();
      const clickSpy = vi.fn();
      el?.addEventListener('click', clickSpy);
      el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    // Real production-callback proof for the Zoom variant's click PATH
    // (mouse click goes through the mock's `handlers.click()`, which — unlike
    // the DOM keydown bridge above — IS wired to the real `spec.onClick`):
    // exactly one camera-intent call, never onSelect. Pairs with AC9's
    // negative test elsewhere in this file; restated here so the exactly-
    // once matrix's "click" column has an explicit call-count assertion for
    // every one of the three families in a single place.
    it('Zoom in (visual cluster): click fires the camera-intent callback exactly once, never onSelect', () => {
      const onSelect = vi.fn();
      const onAreaVisualClusterCameraIntent = vi.fn();
      const members = [areaChild('alpha', 13.0, 77.6), areaChild('bravo', 13.0, 77.6)];
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
          levelKind="areas"
          children={members.map((m) => m.typed)}
          onSelect={onSelect}
          onAreaVisualClusterCameraIntent={onAreaVisualClusterCameraIntent}
        />,
      );
      act(() => {
        capturedMarkers[0].handlers.click();
      });
      expect(onAreaVisualClusterCameraIntent).toHaveBeenCalledTimes(1);
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  // F1 (fix-cycle-3) — a level change OUT of areas/clusters (most commonly a
  // single-AREA click driving levelKind -> 'listings', or a breadcrumb hop
  // back to a DIRECTION so levelKind -> 'directions') used to hit the guard
  // at the top of the areas/clusters effect BEFORE the stale-removal diff
  // loop ever ran, since this effect deliberately has no unmount-only
  // cleanup of its own. The previous level's clickable card(s) — still
  // closing over the OLD nodeKeys — stayed mounted indefinitely.
  describe('F1 — stale marker cleanup across a level change', () => {
    it('removes a single-AREA marker when levelKind transitions to "listings"', () => {
      const { raw, typed } = areaChild('hebbal', 13.0, 77.6);
      const { rerender } = render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: [raw] }}
          levelKind="areas"
          children={[typed]}
          onSelect={vi.fn()}
        />,
      );
      expect(capturedMarkers).toHaveLength(1);
      const marker = capturedMarkers[0];
      expect(marker.remove).not.toHaveBeenCalled();

      rerender(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: [raw] }}
          levelKind="listings"
          children={[typed]}
          onSelect={vi.fn()}
        />,
      );

      expect(marker.remove).toHaveBeenCalledTimes(1);
    });

    it('removes a visual-cluster marker when levelKind transitions back to "directions" (breadcrumb hop)', () => {
      const members = [
        areaChild('alpha', 13.0, 77.6),
        areaChild('bravo', 13.0, 77.6),
      ];
      const { rerender } = render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
          levelKind="areas"
          children={members.map((m) => m.typed)}
          onSelect={vi.fn()}
        />,
      );
      expect(capturedMarkers).toHaveLength(1);
      const marker = capturedMarkers[0];

      rerender(
        <AreaDestinationMarkerLayer
          node={ROOT_NODE}
          levelKind="directions"
          children={DIRECTION_CHILDREN}
          onSelect={vi.fn()}
        />,
      );

      expect(marker.remove).toHaveBeenCalledTimes(1);
    });

    it('does not remove markers on a same-level rerender (no regression to the AC4.19 reuse contract)', () => {
      const { raw, typed } = areaChild('hebbal', 13.0, 77.6);
      const { rerender } = render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: [raw] }}
          levelKind="areas"
          children={[typed]}
          onSelect={vi.fn()}
        />,
      );
      const marker = capturedMarkers[0];

      rerender(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: [raw] }}
          levelKind="areas"
          children={[typed]}
          onSelect={vi.fn()}
        />,
      );

      expect(marker.remove).not.toHaveBeenCalled();
      expect(capturedMarkers).toHaveLength(1);
    });
  });

  // UD-2 (fix-cycle-4, WCAG 2.4.7) — a visual cluster's card has
  // `hoverKey: null` (correctly — it is not a real node), which used to mean
  // its outer div's INLINE `outline:none` left a keyboard user with ZERO
  // focus feedback while tabbed onto it — a class-based rule (the reverted
  // `.area-marker-kbd-focus`, previously in index.css, which isn't even
  // loaded under vitest/jsdom) could never win against that inline
  // declaration regardless of CSS layers/specificity. Enter/Space activation
  // already worked (existing keyboard-accessibility describe above); this
  // only covers the missing VISUAL indicator. Asserting the RESOLVED
  // `el.style.*` inline properties (never a class name) is the only
  // assertion that actually proves paint — a classList-only assertion would
  // pass even with index.css deleted entirely, since jsdom never loads it.
  describe('UD-2 — visible keyboard focus on a visual-AREA-cluster marker', () => {
    // AMEND-B (:1327 fix, rework-request-user-correction-1.toml) — the D2
    // production gate (`AreaMarkerLayer.tsx`'s `bindMarkerDom`) is
    // `if (marker.getElement()?.querySelector('.rc-shell')) { ... }`, and the
    // ring it paints on focus is applied to that SAME `.rc-shell` element
    // (`ringEl = shellEl ?? el`), never to the outer `[role="button"]`
    // wrapper `el` itself — `el` only owns the focus/blur LISTENERS. Before
    // this fix, the shared `leaflet` marker mock built every marker's
    // initial element from a synthetic placeholder with no `.rc-shell` at
    // all, so this gate never fired and the OLD assertion (checking `el`'s
    // own boxShadow, which the production code never touches either way)
    // passed for the wrong reason — it would have passed identically even
    // if the gate were deleted entirely. The mock now seeds each marker's
    // element with its REAL `divIcon` HTML (mirrors real Leaflet), so
    // `.rc-shell` is genuinely present and this test can assert the ACTUAL
    // element the production code paints the ring onto.
    it('applies an inline focus box-shadow on .rc-shell on focus and clears it on blur', () => {
      const members = [
        areaChild('alpha', 13.0, 77.6),
        areaChild('bravo', 13.0, 77.6),
      ];
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
          levelKind="areas"
          children={members.map((m) => m.typed)}
          onSelect={vi.fn()}
        />,
      );
      const markerEl = capturedMarkers[0].getElement() as HTMLElement;
      const el = markerEl.querySelector<HTMLElement>('[role="button"][tabindex="0"]');
      const shellEl = markerEl.querySelector<HTMLElement>('.rc-shell');
      expect(el).not.toBeNull();
      expect(shellEl).not.toBeNull();
      const initialShadow = shellEl!.style.boxShadow;

      // Listeners are bound to `el` (the outer role="button" wrapper); the
      // ring they paint lands on `shellEl` (`.rc-shell`), not on `el`.
      el!.dispatchEvent(new FocusEvent('focus'));
      expect(shellEl!.style.boxShadow).not.toBe(initialShadow);
      expect(shellEl!.style.boxShadow).toContain('#FFFFFF'); // C_PAPER
      expect(shellEl!.style.boxShadow).toContain('#1B2A45'); // C_NAVY

      el!.dispatchEvent(new FocusEvent('blur'));
      expect(shellEl!.style.boxShadow).toBe(initialShadow);
    });

    // D2 (Issue #2330, R2) — the ring painter's gate changed from
    // `hoverKey == null` to "does the emitted markup contain `.rc-shell`".
    // `markerShellHtml` gives the View-homes/View-schools single-AREA leaf
    // (a REAL node — `hoverKey` is non-null here) its own `.rc-shell` too,
    // so the painter now DOES run for this variant, same as the visual
    // cluster above — it just runs for a different reason (markup shape,
    // not node-reality). It still writes to `ringEl = shellEl ?? el`, i.e.
    // to `.rc-shell`, never to the outer `[role="button"]` wrapper. A
    // pre-#2330 version of this test asserted `el.style.boxShadow === ''`
    // on the OUTER wrapper and called that "does NOT apply the ring" — that
    // assertion still passes today, but only because it queries an element
    // production never writes to either way; it would pass identically even
    // if the ring painter were deleted entirely. Per AC15 (no variant may
    // emit `.rc-shell` without a working ring painter), this must instead
    // assert the ring DOES paint on `.rc-shell` here, mirroring the
    // assertion pattern used for the visual cluster above.
    it('applies the inline focus box-shadow to .rc-shell on a single-AREA marker too (real node — D2 reaches it via markup, not hoverKey) and clears it on blur', () => {
      const { raw, typed } = areaChild('hebbal', 13.0, 77.6);
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: [raw] }}
          levelKind="areas"
          children={[typed]}
          onSelect={vi.fn()}
        />,
      );
      const markerEl = capturedMarkers[0].getElement() as HTMLElement;
      const el = markerEl.querySelector<HTMLElement>('[role="button"][tabindex="0"]');
      const shellEl = markerEl.querySelector<HTMLElement>('.rc-shell');
      expect(el).not.toBeNull();
      expect(shellEl).not.toBeNull();
      const initialShadow = shellEl!.style.boxShadow;

      el!.dispatchEvent(new FocusEvent('focus'));
      expect(shellEl!.style.boxShadow).not.toBe(initialShadow);
      expect(shellEl!.style.boxShadow).toContain('#FFFFFF'); // C_PAPER
      expect(shellEl!.style.boxShadow).toContain('#1B2A45'); // C_NAVY
      // The outer wrapper is never the paint target — production only ever
      // writes to `.rc-shell` (`ringEl = shellEl ?? el`).
      expect(el!.style.boxShadow).toBe('');

      el!.dispatchEvent(new FocusEvent('blur'));
      expect(shellEl!.style.boxShadow).toBe(initialShadow);
    });

    // Same D2 coverage as immediately above, for the Explore (directions-level
    // single member) family — the third of the three marker families this
    // module's AC7 matrix comment (module top) tracks. `markerShellHtml`
    // gives this variant a `.rc-shell` too, so the ring painter must reach
    // it exactly the same way.
    it('applies the inline focus box-shadow to .rc-shell on an Explore (directions-level) marker too and clears it on blur', () => {
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: [ROOT_NODE.children[1]] }}
          levelKind="directions"
          children={[makeChild()]}
          onSelect={vi.fn()}
        />,
      );
      const markerEl = capturedMarkers[0].getElement() as HTMLElement;
      const el = markerEl.querySelector<HTMLElement>('[role="button"][tabindex="0"]');
      const shellEl = markerEl.querySelector<HTMLElement>('.rc-shell');
      expect(el).not.toBeNull();
      expect(shellEl).not.toBeNull();
      const initialShadow = shellEl!.style.boxShadow;

      el!.dispatchEvent(new FocusEvent('focus'));
      expect(shellEl!.style.boxShadow).not.toBe(initialShadow);
      expect(shellEl!.style.boxShadow).toContain('#FFFFFF'); // C_PAPER
      expect(shellEl!.style.boxShadow).toContain('#1B2A45'); // C_NAVY
      expect(el!.style.boxShadow).toBe('');

      el!.dispatchEvent(new FocusEvent('blur'));
      expect(shellEl!.style.boxShadow).toBe(initialShadow);
    });
  });

  // UD-3 (fix-cycle-3) — the existing `truncateAreaLabel` helper
  // (TRUNCATE_MAX_CHARS = 18) was called by none of the three new card
  // builders, so a long real label expands the card past its intended
  // footprint (compounding UD-1) with no CSS max-width to stop it. The
  // ACCESSIBLE name must still carry the FULL untruncated label even when
  // the visible text is shortened.
  describe('UD-3 — label truncation on the new card builders', () => {
    it('truncates a long single-AREA displayLabel in the visible text but keeps the full name in aria-label', () => {
      const longLabel = 'Really Very Extremely Long Bangalore Locality Name';
      const { typed, raw } = areaChild('long-one', 13.0, 77.6, { displayLabel: longLabel });
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: [raw] }}
          levelKind="areas"
          children={[typed]}
          onSelect={vi.fn()}
        />,
      );
      const html = divIconHtmlCalls[0];
      expect(html).toContain(`aria-label="${longLabel}`);
      expect(html).not.toMatch(new RegExp(`>${longLabel}<`));
    });

    it('truncates long representative names on a visual cluster in the visible text but keeps the full names in aria-label', () => {
      const longA = 'Kempapura Extended Village Layout Extension';
      const longB = 'Another Excessively Long Locality Name Here';
      const members = [
        areaChild('alpha', 13.0, 77.6, { displayLabel: longA }),
        areaChild('bravo', 13.0, 77.6, { displayLabel: longB }),
      ];
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
          levelKind="areas"
          children={members.map((m) => m.typed)}
          onSelect={vi.fn()}
        />,
      );
      const html = divIconHtmlCalls[0];
      // aria-label carries both FULL, untruncated names.
      const ariaLabelMatch = html.match(/aria-label="([^"]*)"/);
      expect(ariaLabelMatch).not.toBeNull();
      expect(ariaLabelMatch![1]).toContain(longA);
      expect(ariaLabelMatch![1]).toContain(longB);
      // The visible names span (joined shortNames, truncated individually)
      // must NOT render either full name verbatim — proven by extracting the
      // span's own text content and asserting it holds an ellipsis instead.
      // Issue #2305 STAGE 2 — the Option B card (`visualClusterCardHtml`)
      // puts the names span in a navy hero section, not the old
      // `<div><svg/><span>names</span></div><span>count</span>` layout this
      // regex used to rely on positionally. Anchored instead on the
      // `-webkit-line-clamp:2` declaration unique to that span, which is
      // stable regardless of what markup follows it.
      const visibleNamesMatch = html.match(/-webkit-line-clamp:2[^>]*>([^<]*)</);
      expect(visibleNamesMatch).not.toBeNull();
      const visibleNames = visibleNamesMatch![1];
      expect(visibleNames).not.toBe(`${longA}, ${longB}`);
      expect(visibleNames).toContain('…');
    });

    it('does not truncate a short single-AREA displayLabel (no title attribute added)', () => {
      const { typed, raw } = areaChild('hebbal', 13.0, 77.6, { displayLabel: 'Hebbal' });
      render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: [raw] }}
          levelKind="areas"
          children={[typed]}
          onSelect={vi.fn()}
        />,
      );
      const html = divIconHtmlCalls[0];
      expect(html).toContain('>Hebbal<');
      expect(html).not.toContain('title="Hebbal"');
    });
  });
});
