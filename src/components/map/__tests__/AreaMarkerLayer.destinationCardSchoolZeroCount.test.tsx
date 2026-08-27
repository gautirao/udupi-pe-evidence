/**
 * Issue #2346 — `makeDestinationCard` (the Explore/direction marker) must
 * never fabricate a "0 schools" hero metric when `schoolCount` is
 * unresolved (`null`). PR #2343 already fixed this exact defect class in
 * the sibling function `makeSingleAreaChildCard` (see
 * AreaMarkerLayer.schoolZeroCount.test.tsx) — this file mirrors that
 * pattern, scoped to `makeDestinationCard`, exercised via
 * `AreaDestinationMarkerLayer` since `makeDestinationCard` itself is not
 * exported.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

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
      return instance;
    }),
  },
}));

const mapStub = {
  getSize: vi.fn(() => ({ x: 1200, y: 800 })),
  getZoom: vi.fn(() => 11),
  latLngToContainerPoint: vi.fn(() => ({ x: 100, y: 100 })),
  containerPointToLatLng: vi.fn(() => ({ lat: 13.34, lng: 74.74 })),
  getContainer: vi.fn(() => document.createElement('div')),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('react-leaflet', () => ({
  useMap: vi.fn(() => mapStub),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

import { AreaDestinationMarkerLayer } from '../AreaMarkerLayer';
import type { AreasNavigationChild } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

const ROOT_NODE: NavigationNodeResponse = {
  nodeKey: 'root',
  nodeType: 'ROOT',
  displayLabel: 'Bangalore',
  depth: -1,
  regionKey: null,
  ancestry: [],
  nextLevelType: 'DIRECTION',
  children: [{
    nodeKey: 'd:n',
    nodeType: 'DIRECTION',
    displayLabel: 'North Bangalore',
    depth: 0,
    ancestry: [],
    children: [],
    revisionId: 1,
    centreLat: 13.0,
    centreLon: 77.6,
  }],
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

function directionChild(overrides: Partial<AreasNavigationChild> = {}): AreasNavigationChild {
  return {
    nodeKey: 'd:n',
    nodeType: 'DIRECTION',
    displayLabel: 'North Bangalore',
    displayOrder: 0,
    listingCount: 1736,
    schoolCount: 4,
    isLeafArea: false,
    matchingAreaCount: null,
    ...overrides,
  } as AreasNavigationChild;
}

beforeEach(() => {
  divIconHtmlCalls.length = 0;
  vi.clearAllMocks();
});

function renderDestinationCard(child: AreasNavigationChild): string {
  const before = divIconHtmlCalls.length;
  render(
    <AreaDestinationMarkerLayer
      node={ROOT_NODE}
      levelKind="directions"
      children={[child]}
      onSelect={vi.fn()}
      journey="school-first"
    />,
  );
  const produced = divIconHtmlCalls.slice(before);
  expect(produced).toHaveLength(1);
  return produced[0];
}

describe('Issue #2346 — makeDestinationCard: known-zero schoolCount still renders "0 schools"', () => {
  it('schoolCount: 0 in Schools journey renders the "0 schools" hero metric exactly once', () => {
    const html = renderDestinationCard(directionChild({ schoolCount: 0 }));

    const heroMatches = html.match(/>0<\/span>/g);
    expect(heroMatches).toHaveLength(1);
    expect(html).toMatch(/>0<\/span>[\s\S]{0,400}>schools</);
  });
});

describe('Issue #2346 — makeDestinationCard: unavailable schoolCount must not fabricate "0 schools"', () => {
  it('schoolCount: null in Schools journey — no hero digit/unit is rendered, and no "0 schools" leaks into the card', () => {
    const html = renderDestinationCard(directionChild({ schoolCount: null }));

    // No hero digit at all — an unavailable count must not render as a bare "0".
    expect(html).not.toMatch(/>0<\/span>/);
    expect(html).not.toContain('>schools<');
    expect(html).not.toContain('>school<');
    // No fabricated "0 schools" phrase anywhere in the rendered card.
    expect(html).not.toMatch(/0 schools?/i);

    // The listings count — real, known data — is still shown even though
    // the schools hero metric is unresolved (#2346: the null case must not
    // suppress OTHER known metrics either).
    expect(html).toContain('1736 listings');
  });

  it('schoolCount: undefined in Schools journey — same omission as null (unavailable, not zero)', () => {
    const html = renderDestinationCard(
      directionChild({ schoolCount: undefined as unknown as null }),
    );

    expect(html).not.toMatch(/>0<\/span>/);
    expect(html).not.toContain('>schools<');
    expect(html).not.toContain('>school<');
    expect(html).not.toMatch(/0 schools?/i);
  });
});
