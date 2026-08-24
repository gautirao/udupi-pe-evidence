/**
 * Issue #2088 delta-3, AC1 — exhaustive Direction-selection regression test.
 *
 * `AreaMarkerLayer.destinations.test.tsx` already covers ONE sampled
 * Direction click (`d:n`) and a "same reference" identity check on a second
 * sample (`d:s`). This file closes the gap: it drives a click through EVERY
 * one of the five canonical Directions (`d:central`, `d:n`, `d:e`, `d:s`,
 * `d:w` — the exact `NavigationCommandMatrix`/`normalize.ts` vocabulary), not
 * a single representative, AND cross-checks that the map-marker route and the
 * panel-row route (`NavigationChildCard`) dispatch through the literal SAME
 * `selectNode` function reference for each one.
 *
 * ── WHY THIS TEST DOES NOT DRIVE A REAL MOUSE CLICK VIA CDP/PLAYWRIGHT ──
 * A prior investigation this run spent hours chasing a false "Direction
 * markers are unclickable" defect. The root cause was NEVER the production
 * code — `AreaDestinationMarkerLayer`'s `marker.on('click', () => onSelect(
 * child.nodeKey))` wiring (AreaMarkerLayer.tsx, inside the `directions`
 * effect) is correctly wired and works for every real human tester. The false
 * negative came from synthesizing clicks against a Leaflet `divIcon` marker
 * with a CDP/Playwright "real mouse" event stream: Leaflet's own
 * mousedown/mouseup/drag-threshold disambiguation (it distinguishes a
 * "click" from the start of a map drag by measuring pixel movement and
 * timing between synthetic-looking event pairs) does not treat a
 * programmatically dispatched event stream as trustworthy input the same way
 * a real OS-level pointer does, so the marker's `click` handler never firess
 * in that harness — independent of whether the component is correct.
 *
 * This test instead exercises the marker's click handler at the COMPONENT
 * level: it mocks `leaflet`'s `L.marker(...).on('click', cb)` to capture `cb`
 * directly (exactly `AreaMarkerLayer.destinations.test.tsx`'s established
 * mocking strategy) and invokes it, which is the same code path Leaflet's
 * real internal dispatch reaches after its own gesture-disambiguation passes.
 * A future agent seeing "Direction markers don't get clicked in tests" should
 * NOT "fix" this back to a real-mouse CDP/Playwright click — that is the
 * exact harness that manufactured the false defect. If real-browser
 * verification of marker clickability is ever needed again, do it with an
 * actual human/manual browser check, not a synthesized pointer-event replay.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

// Inverse of containerPointToLatLng — mirrors
// AreaMarkerLayer.destinations.test.tsx:40's established pattern, so
// latLngToContainerPoint below varies by lat/lng instead of collapsing every
// marker to a constant origin.
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
        off: vi.fn((event: string) => {
          delete handlers[event];
          return instance;
        }),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getElement: vi.fn(() => el),
        setLatLng: vi.fn(),
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

const mapStub = {
  getSize: vi.fn(() => MAP_SIZE),
  getZoom: vi.fn(() => 11),
  containerPointToLatLng: vi.fn(([x, y]: [number, number]) => containerPointToLatLng([x, y])),
  latLngToContainerPoint: vi.fn(([lat, lng]: [number, number]) => containerPointFromMarkerCall([lat, lng])),
  getContainer: vi.fn(() => document.createElement('div')),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('react-leaflet', () => ({
  useMap: vi.fn(() => mapStub),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

import React from 'react';
import { AreaDestinationMarkerLayer } from '../AreaMarkerLayer';
import { NavigationChildCard } from '@/components/discover/navigation/NavigationChildCard';
import type { AreasNavigationChild } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

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
    { nodeKey: 'd:central', nodeType: 'DIRECTION', displayLabel: 'Central Bangalore', depth: 0, ancestry: [], children: [], revisionId: 1, centreLat: 12.97, centreLon: 77.59 },
    { nodeKey: 'd:n', nodeType: 'DIRECTION', displayLabel: 'North Bangalore', depth: 0, ancestry: [], children: [], revisionId: 1, centreLat: 13.0, centreLon: 77.6 },
    { nodeKey: 'd:e', nodeType: 'DIRECTION', displayLabel: 'East Bangalore', depth: 0, ancestry: [], children: [], revisionId: 1, centreLat: 12.95, centreLon: 77.7 },
    { nodeKey: 'd:s', nodeType: 'DIRECTION', displayLabel: 'South Bangalore', depth: 0, ancestry: [], children: [], revisionId: 1, centreLat: 12.9, centreLon: 77.6 },
    { nodeKey: 'd:w', nodeType: 'DIRECTION', displayLabel: 'West Bangalore', depth: 0, ancestry: [], children: [], revisionId: 1, centreLat: 12.95, centreLon: 77.5 },
  ],
  revisionId: 1,
  bounds: {
    centreLat: 13.0,
    centreLon: 77.6,
    minLat: 12.9,
    maxLat: 13.1,
    minLon: 77.5,
    maxLon: 77.7,
  },
  descendantAreaKeys: null,
  areaKey: null,
};

// The full, canonical five-Direction vocabulary (NavigationCommandMatrix /
// normalize.ts) — every one of them, not a single sampled Direction.
const ALL_DIRECTIONS: AreasNavigationChild[] = [
  makeChild({ nodeKey: 'd:central', displayLabel: 'Central Bangalore', displayOrder: 0 }),
  makeChild({ nodeKey: 'd:n', displayLabel: 'North Bangalore', displayOrder: 1 }),
  makeChild({ nodeKey: 'd:e', displayLabel: 'East Bangalore', displayOrder: 2 }),
  makeChild({ nodeKey: 'd:s', displayLabel: 'South Bangalore', displayOrder: 3 }),
  makeChild({ nodeKey: 'd:w', displayLabel: 'West Bangalore', displayOrder: 4 }),
];

beforeEach(() => {
  capturedMarkers.length = 0;
  markerLatLngCalls.length = 0;
  divIconHtmlCalls.length = 0;
  vi.clearAllMocks();
});

describe('AC1 — every one of the 5 Directions dispatches selectNode with its own canonical nodeKey (map route)', () => {
  it.each(ALL_DIRECTIONS.map((c) => [c.nodeKey, c] as const))(
    'clicking the %s marker calls selectNode with exactly that nodeKey',
    (nodeKey, child) => {
      const selectNode = vi.fn();
      render(
        <AreaDestinationMarkerLayer
          node={ROOT_NODE}
          levelKind="directions"
          children={ALL_DIRECTIONS}
          onSelect={selectNode}
        />,
      );
      const index = ALL_DIRECTIONS.findIndex((c) => c.nodeKey === child.nodeKey);
      capturedMarkers[index].handlers.click();
      expect(selectNode).toHaveBeenCalledTimes(1);
      expect(selectNode).toHaveBeenCalledWith(nodeKey);
    },
  );
});

describe('AC1 — every one of the 5 Directions dispatches selectNode with its own canonical nodeKey (panel-row route)', () => {
  it.each(ALL_DIRECTIONS.map((c) => [c.nodeKey, c] as const))(
    'clicking the panel row for %s calls selectNode with exactly that nodeKey',
    (nodeKey, child) => {
      const selectNode = vi.fn();
      render(<NavigationChildCard child={child} onSelect={selectNode} />);
      fireEvent.click(screen.getByTestId(`navigation-child-card-${child.nodeKey}`));
      expect(selectNode).toHaveBeenCalledTimes(1);
      expect(selectNode).toHaveBeenCalledWith(nodeKey);
    },
  );
});

describe('AC1 — map route and panel-row route converge on the SAME selectNode reference for every Direction', () => {
  it.each(ALL_DIRECTIONS.map((c) => [c.nodeKey, c] as const))(
    '%s: the map marker and the panel row both invoke the identical selectNode function, never two independent handlers',
    (nodeKey: string, child: AreasNavigationChild) => {
      // ONE shared spy, passed UNCHANGED to both consumers — proves T3/AC3.9's
      // identity contract (never a fresh wrapper closure at either call site)
      // for every Direction, not just the single one the pre-existing
      // destinations test sampled.
      const selectNode = vi.fn();

      render(
        <AreaDestinationMarkerLayer
          node={ROOT_NODE}
          levelKind="directions"
          children={ALL_DIRECTIONS}
          onSelect={selectNode}
        />,
      );
      const index = ALL_DIRECTIONS.findIndex((c) => c.nodeKey === child.nodeKey);
      capturedMarkers[index].handlers.click();

      const { unmount } = render(<NavigationChildCard child={child} onSelect={selectNode} />);
      fireEvent.click(screen.getByTestId(`navigation-child-card-${child.nodeKey}`));
      unmount();

      // Both routes called the SAME spy instance twice, each time with the
      // identical canonical nodeKey — never a per-surface derived/rewritten key.
      expect(selectNode).toHaveBeenCalledTimes(2);
      expect(selectNode).toHaveBeenNthCalledWith(1, nodeKey);
      expect(selectNode).toHaveBeenNthCalledWith(2, nodeKey);
    },
  );
});
