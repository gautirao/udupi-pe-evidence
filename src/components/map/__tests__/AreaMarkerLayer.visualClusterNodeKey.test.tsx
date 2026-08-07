/**
 * Issue #2088 (commit 3/7) — V-c verification.
 *
 * Commit 3 added a `data-node-key` attribute to `area-visual-cluster-marker`
 * (the dashed, presentation-only client-side AREA cluster card) so it is no
 * longer the one marker type on the map with no stable DOM identity — see
 * `makeAreaVisualClusterCard`'s parameter doc in `AreaMarkerLayer.tsx`. This
 * file proves that attribute is actually present on the rendered markup
 * (never asserted directly by any existing spec — the closest coverage,
 * `AreaMarkerLayer.destinations.test.tsx`, checks `data-node-key` on the
 * DIRECTION marker only), and pins the deliberate `visual-cluster:` prefix
 * that keeps it structurally distinct from a real `a:`/`c:`/`d:` hierarchy
 * node key.
 *
 * DOCUMENTED DEVIATION (orchestrator-flagged, not treated as a defect): the
 * engineer deliberately did NOT route this marker's focus/blur through
 * `onHoverChange` — a presentation-only visual cluster is not a canonical
 * node, so it has no hover-highlight identity to report (see
 * `AreaMarkerLayer.tsx`'s `bindMarkerDom`'s `hoverKey: null` branch, which
 * instead applies an inline focus box-shadow — already covered by the
 * existing "UD-2 — visible keyboard focus" describe block in
 * `AreaMarkerLayer.destinations.test.tsx`). This file tests the DOM identity
 * attribute the way it actually exists, not a hover-wiring contract that was
 * never intended.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const divIconHtmlCalls: string[] = [];

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn((opts: { html: string; className: string }) => {
      divIconHtmlCalls.push(opts.html);
      return { options: opts };
    }),
    marker: vi.fn(() => {
      const el = document.createElement('div');
      const instance: Record<string, unknown> = {
        on: vi.fn(() => instance),
        off: vi.fn(() => instance),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getElement: vi.fn(() => el),
        setLatLng: vi.fn(),
        setIcon: vi.fn((icon: { options: { html: string } }) => {
          el.innerHTML = icon.options.html;
        }),
      };
      return instance;
    }),
  },
}));

const mapStub = {
  getSize: vi.fn(() => ({ x: 1200, y: 800 })),
  getZoom: vi.fn(() => 11),
  containerPointToLatLng: vi.fn(([x, y]: [number, number]) => ({ lat: 13 - y / 10000, lng: 77 + x / 10000 })),
  latLngToContainerPoint: vi.fn(([lat, lng]: [number, number]) => ({ x: (lng - 77) * 10000, y: (13 - lat) * 10000 })),
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
import { AreaDestinationMarkerLayer } from '../AreaMarkerLayer';
import type { AreasNavigationChild } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

function makeChild(overrides: Partial<AreasNavigationChild> = {}): AreasNavigationChild {
  return {
    nodeKey: 'a:x',
    nodeType: 'AREA',
    displayLabel: 'X',
    displayOrder: 0,
    listingCount: 1,
    schoolCount: null,
    isLeafArea: true,
    matchingAreaCount: null,
    ...overrides,
  };
}

const ROOT_NODE: NavigationNodeResponse = {
  nodeKey: 'd:n',
  nodeType: 'DIRECTION',
  displayLabel: 'North',
  depth: 0,
  regionKey: 'NORTH',
  ancestry: [],
  nextLevelType: 'AREA',
  children: [],
  revisionId: 1,
  bounds: null,
  descendantAreaKeys: null,
  areaKey: null,
};

beforeEach(() => {
  divIconHtmlCalls.length = 0;
  vi.clearAllMocks();
});

describe('area-visual-cluster-marker carries a stable data-node-key identity (issue #2088 commit 3, V-c)', () => {
  it('a spatially-grouped visual cluster renders data-node-key="visual-cluster:<member areaKeys joined>"', () => {
    const rawChildren: NavigationNodeResponse['children'] = [
      { nodeKey: 'a:alpha', nodeType: 'AREA', displayLabel: 'Alpha', displayOrder: 0, areaKey: 'alpha', centreLat: 13.0, centreLon: 77.6 },
      { nodeKey: 'a:bravo', nodeType: 'AREA', displayLabel: 'Bravo', displayOrder: 1, areaKey: 'bravo', centreLat: 13.0, centreLon: 77.6 },
    ];
    const typedChildren: AreasNavigationChild[] = [
      makeChild({ nodeKey: 'a:alpha', displayLabel: 'Alpha' }),
      makeChild({ nodeKey: 'a:bravo', displayLabel: 'Bravo' }),
    ];
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: rawChildren }}
        levelKind="areas"
        children={typedChildren}
        onSelect={vi.fn()}
      />,
    );
    const html = divIconHtmlCalls.join('\n');
    expect(html).toContain('area-visual-cluster-marker');
    expect(html).toMatch(/data-node-key="visual-cluster:alpha\|bravo"/);
  });

  it('the visual-cluster: prefix is structurally distinct from every real a:/c:/d: hierarchy node key — never accepted as a hierarchy identity', () => {
    const rawChildren: NavigationNodeResponse['children'] = [
      { nodeKey: 'a:alpha', nodeType: 'AREA', displayLabel: 'Alpha', displayOrder: 0, areaKey: 'alpha', centreLat: 13.0, centreLon: 77.6 },
      { nodeKey: 'a:bravo', nodeType: 'AREA', displayLabel: 'Bravo', displayOrder: 1, areaKey: 'bravo', centreLat: 13.0, centreLon: 77.6 },
    ];
    const typedChildren: AreasNavigationChild[] = [
      makeChild({ nodeKey: 'a:alpha', displayLabel: 'Alpha' }),
      makeChild({ nodeKey: 'a:bravo', displayLabel: 'Bravo' }),
    ];
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: rawChildren }}
        levelKind="areas"
        children={typedChildren}
        onSelect={vi.fn()}
      />,
    );
    const html = divIconHtmlCalls.join('\n');
    const match = html.match(/data-node-key="(visual-cluster:[^"]*)"/);
    expect(match).not.toBeNull();
    const value = match![1];
    // Never a bare `a:`/`c:`/`d:`-prefixed value or `root` — the
    // `visual-cluster:` prefix keeps it unmistakable even by a naive check.
    expect(value.startsWith('visual-cluster:')).toBe(true);
    expect(/^(a|c|d):/.test(value)).toBe(false);
    expect(value).not.toBe('root');
  });

  it('a single-AREA (non-clustered) marker still gets its OWN real a: node key — unaffected by the cluster prefix', () => {
    const rawChildren: NavigationNodeResponse['children'] = [
      { nodeKey: 'a:solo', nodeType: 'AREA', displayLabel: 'Solo', displayOrder: 0, areaKey: 'solo', centreLat: 13.0, centreLon: 77.6 },
    ];
    const typedChildren: AreasNavigationChild[] = [makeChild({ nodeKey: 'a:solo', displayLabel: 'Solo' })];
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: rawChildren }}
        levelKind="areas"
        children={typedChildren}
        onSelect={vi.fn()}
      />,
    );
    const html = divIconHtmlCalls.join('\n');
    expect(html).toContain('data-node-key="a:solo"');
    expect(html).not.toContain('visual-cluster:');
  });
});
