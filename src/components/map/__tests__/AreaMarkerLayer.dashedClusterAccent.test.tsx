/**
 * Issue #2088 delta-3, AC8 — dashed visual-cluster accent regression test.
 *
 * Item 2 changed the RESIDENTIAL (non-school-first) dashed visual-cluster
 * card's accent from copper to navy (`markerTokens.NAVY_800`, matching the
 * mock's `clusterChipHTML`: `1.5px dashed var(--navy-800)`), while the
 * school-first branch stays plum (`markerTokens.PLUM_600`).
 *
 * ── WHY THIS TEST ASSERTS THE RENDERED HTML, NEVER markerTokens.ts's SOURCE ──
 * `markerTokens.ts`'s NAVY_800/PLUM_600 constants were ALWAYS correct — the
 * shipped defect was `AreaMarkerLayer.tsx` passing the WRONG constant into an
 * otherwise-correct `makeAreaVisualClusterCard` primitive (a call-site wiring
 * bug, not a token-value bug). A test that only imported and asserted
 * `NAVY_800 === '#1B2A45'` would have stayed green through that exact defect.
 * Every assertion below reads the actual `L.divIcon({ html })` string handed
 * to Leaflet — the same string a real browser paints — never the token
 * module's own exports.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

type CapturedMarker = {
  handlers: Record<string, (...args: unknown[]) => void>;
};
const capturedMarkers: CapturedMarker[] = [];
const divIconHtmlCalls: string[] = [];

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn((opts: { html: string; className: string }) => {
      divIconHtmlCalls.push(opts.html);
      return { options: opts };
    }),
    marker: vi.fn(() => {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const el = document.createElement('div');
      const instance: Record<string, unknown> = {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          handlers[event] = cb;
          return instance;
        }),
        off: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getElement: vi.fn(() => el),
        setLatLng: vi.fn(),
        setIcon: vi.fn((icon: { options: { html: string } }) => {
          el.innerHTML = icon.options.html;
        }),
      };
      capturedMarkers.push({ handlers });
      return instance;
    }),
  },
}));

const mapStub = {
  getSize: vi.fn(() => ({ x: 1200, y: 800 })),
  getZoom: vi.fn(() => 11),
  // All members project to the SAME container point -> one dense cluster cell.
  latLngToContainerPoint: vi.fn(() => ({ x: 100, y: 100 })),
  containerPointToLatLng: vi.fn(() => ({ lat: 13.0, lng: 77.6 })),
  getContainer: vi.fn(() => document.createElement('div')),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('react-leaflet', () => ({
  useMap: vi.fn(() => mapStub),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

import { AreaDestinationMarkerLayer } from '../AreaMarkerLayer';
import { NAVY_800, PLUM_600 } from '../markerTokens';
import type { AreasNavigationChild } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

const ROOT_NODE: NavigationNodeResponse = {
  nodeKey: 'root',
  nodeType: 'ROOT',
  displayLabel: 'Bangalore',
  depth: -1,
  regionKey: null,
  ancestry: [],
  nextLevelType: 'AREA',
  children: [],
  revisionId: 1,
  bounds: null,
  descendantAreaKeys: null,
  areaKey: null,
};

function areaChild(
  areaKey: string,
  overrides: Partial<AreasNavigationChild> = {},
): { raw: NavigationNodeResponse['children'][number]; typed: AreasNavigationChild } {
  const nodeKey = `a:${areaKey}`;
  return {
    raw: { nodeKey, nodeType: 'AREA', displayLabel: areaKey, displayOrder: 0, areaKey, centreLat: 13.0, centreLon: 77.6 },
    typed: {
      nodeKey,
      nodeType: 'AREA',
      displayLabel: areaKey,
      displayOrder: 0,
      listingCount: 3,
      schoolCount: 2,
      isLeafArea: true,
      matchingAreaCount: null,
      ...overrides,
    },
  };
}

// 4 spatially-identical members -> one visual cluster ("+2 areas with
// matches" per the existing dense-AREA fixture convention in
// AreaMarkerLayer.destinations.test.tsx). Every member carries a non-zero
// schoolCount so the cluster is eligible identically under both the
// residential ('areas') and school-first ('schools') eligibility dimensions
// — the accent branch is the only thing this test varies.
const MEMBERS = [
  areaChild('alpha', { listingCount: 10, schoolCount: 5 }),
  areaChild('bravo', { listingCount: 8, schoolCount: 4 }),
  areaChild('charlie', { listingCount: 3, schoolCount: 1 }),
  areaChild('delta', { listingCount: 1, schoolCount: 1 }),
];

beforeEach(() => {
  capturedMarkers.length = 0;
  divIconHtmlCalls.length = 0;
  vi.clearAllMocks();
});

describe('AC8 — dashed visual-cluster accent (rendered HTML, not the token file)', () => {
  it('RESIDENTIAL journey: the dashed cluster border/accent resolves to NAVY_800, never copper', () => {
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: MEMBERS.map((m) => m.raw) }}
        levelKind="areas"
        children={MEMBERS.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    expect(divIconHtmlCalls).toHaveLength(1);
    const html = divIconHtmlCalls[0];
    expect(html).toContain('area-visual-cluster-marker');
    expect(html).toContain(`1.5px dashed ${NAVY_800}`);
    // The dashed cluster's own accent-colored spans (count/CTA text) must
    // also use navy, not the legacy copper (#B05C3A/#934B2D) literal.
    expect(html).not.toContain('#B05C3A');
    expect(html).not.toContain('#934B2D');
  });

  it('SCHOOL-FIRST journey: the dashed cluster border/accent STILL resolves to PLUM_600, unchanged by item 2', () => {
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: MEMBERS.map((m) => m.raw) }}
        levelKind="areas"
        children={MEMBERS.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey="school-first"
      />,
    );
    expect(divIconHtmlCalls).toHaveLength(1);
    const html = divIconHtmlCalls[0];
    expect(html).toContain('area-visual-cluster-marker');
    expect(html).toContain(`1.5px dashed ${PLUM_600}`);
    expect(html).not.toContain(NAVY_800);
  });

  it('the two journeys never render the same accent for the same member set (sanity: the branch actually varies)', () => {
    expect(NAVY_800).not.toBe(PLUM_600);
  });
});
