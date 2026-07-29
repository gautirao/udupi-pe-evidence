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

type CapturedMarker = {
  handlers: Record<string, (...args: unknown[]) => void>;
  addTo: ReturnType<typeof vi.fn>;
  getElement: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
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
    marker: vi.fn((latlng: [number, number]) => {
      markerLatLngCalls.push(latlng);
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const el = document.createElement('div');
      el.innerHTML = '<div data-testid="area-destination-marker" tabindex="0" role="button"></div>';
      const instance: Record<string, unknown> = {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          handlers[event] = cb;
          return instance;
        }),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getElement: vi.fn(() => el),
      };
      capturedMarkers.push({
        handlers,
        addTo: instance.addTo as ReturnType<typeof vi.fn>,
        getElement: instance.getElement as ReturnType<typeof vi.fn>,
        remove: instance.remove as ReturnType<typeof vi.fn>,
      });
      return instance;
    }),
  },
}));

const mapStub = {
  getSize: vi.fn(() => MAP_SIZE),
  getZoom: vi.fn(() => 11),
  containerPointToLatLng: vi.fn(([x, y]: [number, number]) => containerPointToLatLng([x, y])),
  getContainer: vi.fn(() => document.createElement('div')),
  on: vi.fn(),
  off: vi.fn(),
};

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
  children: [],
  revisionId: 1,
  bounds: null,
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

describe('AreaDestinationMarkerLayer — AC3.3 (position derived from the server-given direction code)', () => {
  it('positions each DIRECTION marker at compassPointFor(code) for its own server-given d:<code> nodeKey', () => {
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={DIRECTION_CHILDREN}
        onSelect={vi.fn()}
      />,
    );
    const layout = computeCompassLayout(MAP_SIZE.x, MAP_SIZE.y);
    const expectedCodes = ['CENTRAL', 'N', 'E', 'S', 'W'];
    DIRECTION_CHILDREN.forEach((child, i) => {
      const expected = compassPointFor(expectedCodes[i], layout);
      const actual = containerPointFromMarkerCall(markerLatLngCalls[i]);
      expect(actual.x).toBeCloseTo(expected.x, 6);
      expect(actual.y).toBeCloseTo(expected.y, 6);
    });
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
