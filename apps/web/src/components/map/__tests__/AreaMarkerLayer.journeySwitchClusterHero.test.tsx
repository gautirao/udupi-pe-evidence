/**
 * Issue #2345 — visual-cluster stale hero-metric regression test.
 *
 * Repro (from the issue): with a visual AREA/CLUSTER card on screen,
 * switching journey from residential to school-first (no map interaction,
 * so lat/lon/zoom/membership are unchanged) leaves the card's "N LISTINGS"
 * hero metric (or "No listings yet" zero-phrase) showing stale residential
 * content — only the accent colour/`data-journey` attribute update.
 *
 * Root cause: `makeAreaVisualClusterCard`'s `heroRow` (in
 * `AreaMarkerLayer.tsx`) had NO journey branch at all — it always rendered
 * the residential listings hero regardless of `isSchools`. The marker's
 * `setIcon` DOES fire correctly on journey switch (journeyAttr/accent differ,
 * so the HTML string changes and `AreaDestinationMarkerLayer`'s
 * `existing.html !== spec.html` guard passes) — but the swapped-in HTML
 * still carried the stale metric.
 *
 * This file exercises the SAME "collapse every member into one visual
 * cluster cell" technique as `AreaMarkerLayer.dashedClusterAccent.test.tsx`
 * (identical `latLngToContainerPoint` for every member), at BOTH call sites
 * (`levelKind="areas"` and `levelKind="clusters"`), asserting on the
 * RENDERED HTML (never on internal state) that no residential listings hero
 * content survives a `journey={null}` -> `journey="school-first"` switch via
 * `rerender()` on the SAME mounted marker.
 *
 * The zero-listings ("No listings yet" zero-phrase) scenario is exercised
 * ONLY at the `levelKind="clusters"` call site: the `levelKind="areas"` call
 * site applies journey-aware visibility filtering BEFORE clustering
 * (`clusterVisibleAreaMembers`), which excludes zero-listing AREA members
 * entirely under the residential eligibility journey, so a zero-listing
 * multi-member AREA visual cluster cannot be constructed there at all. The
 * 'clusters'/'directions' call site is a STRUCTURAL level that applies no
 * such filtering, making the scenario constructible there.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

type CapturedMarker = {
  setIcon: ReturnType<typeof vi.fn>;
  getElement: ReturnType<typeof vi.fn>;
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
      const el = document.createElement('div');
      const instance: Record<string, unknown> = {
        on: vi.fn().mockReturnThis(),
        off: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getElement: vi.fn(() => el),
        setLatLng: vi.fn(),
        setIcon: vi.fn((icon: { options: { html: string } }) => {
          el.innerHTML = icon.options.html;
        }),
      };
      capturedMarkers.push({
        setIcon: instance.setIcon as ReturnType<typeof vi.fn>,
        getElement: instance.getElement as ReturnType<typeof vi.fn>,
      });
      return instance;
    }),
  },
}));

// Real lat/lon -> pixel projection (same convention as AreaMarkerLayer.test.tsx's
// `projectLatLon`) — members at the IDENTICAL coordinate still land on the
// identical point, preserving every existing "spatially identical -> one
// dense cluster cell" fixture's premise byte-for-byte.
function projectLatLon(lat: number, lon: number): { x: number; y: number } {
  return { x: (lon - 74.5) * 10000, y: (13.5 - lat) * 10000 };
}

const panes = new Map<string, HTMLElement>();
const mapStub = {
  getSize: vi.fn(() => ({ x: 1200, y: 800 })),
  getZoom: vi.fn(() => 11),
  latLngToContainerPoint: vi.fn(([lat, lon]: [number, number]) => projectLatLon(lat, lon)),
  containerPointToLatLng: vi.fn(() => ({ lat: 13.0, lng: 77.6 })),
  getContainer: vi.fn(() => document.createElement('div')),
  // Issue #1943 (no-redundant-singleton amendment) — the PARTITION-phase
  // escalation loop's synthetic-zoom projection + termination ceiling.
  getMaxZoom: vi.fn(() => 19),
  project: vi.fn(([lat, lon]: [number, number], zoom: number) => {
    const base = projectLatLon(lat, lon);
    const scale = 2 ** (zoom - 11); // 11 == this stub's getZoom()
    return { x: base.x * scale, y: base.y * scale };
  }),
  on: vi.fn(),
  off: vi.fn(),
  getPane: vi.fn((name: string) => panes.get(name)),
  createPane: vi.fn((name: string) => {
    const pane = document.createElement('div');
    panes.set(name, pane);
    return pane;
  }),
};

vi.mock('react-leaflet', () => ({
  useMap: vi.fn(() => mapStub),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

import L from 'leaflet';
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

function clusterChild(
  nodeKey: string,
  overrides: Partial<AreasNavigationChild> = {},
): { raw: NavigationNodeResponse['children'][number]; typed: AreasNavigationChild } {
  return {
    raw: {
      nodeKey,
      nodeType: 'CLUSTER',
      displayLabel: nodeKey,
      displayOrder: 0,
      areaKey: null,
      centreLat: 13.0,
      centreLon: 77.6,
    },
    typed: {
      nodeKey,
      nodeType: 'CLUSTER',
      displayLabel: nodeKey,
      displayOrder: 0,
      listingCount: 10,
      schoolCount: 4,
      isLeafArea: false,
      matchingAreaCount: null,
      ...overrides,
    },
  };
}

// Non-zero listing total: 10 + 8 + 3 + 1 = 22.
const AREA_MEMBERS = [
  areaChild('alpha', { listingCount: 10, schoolCount: 5 }),
  areaChild('bravo', { listingCount: 8, schoolCount: 4 }),
  areaChild('charlie', { listingCount: 3, schoolCount: 1 }),
  areaChild('delta', { listingCount: 1, schoolCount: 1 }),
];

// Non-zero listing total: 40 + 25 = 65.
const CLUSTER_MEMBERS = [
  clusterChild('c:whitefield-belt', { listingCount: 40, schoolCount: 6 }),
  clusterChild('c:marathahalli-belt', { listingCount: 25, schoolCount: 3 }),
];

// Zero listing total -> exercises the "No listings yet" zero-phrase branch.
// Unlike the 'areas' call site, 'clusters'/'directions' does NOT apply
// journey-aware visibility filtering (it is a STRUCTURAL level — see
// AreaDestinationMarkerLayer's own inline comment), so a zero-listing member
// still reaches the visual-cluster card here, where the equivalent AREA-level
// fixture would be filtered out before ever forming a cluster.
const ZERO_CLUSTER_MEMBERS = [
  clusterChild('c:zero-belt-one', { listingCount: 0, schoolCount: 3 }),
  clusterChild('c:zero-belt-two', { listingCount: 0, schoolCount: 2 }),
];

// Issue #1943 (no-redundant-singleton amendment, PLAN_REVIEW packet 010
// APPROVED) — a cluster of ALL of a node's children can no longer render as
// a single synthetic catch-all. A THIRD, geographically-distant decoy member
// is added to both 'clusters'-level fixtures above so the two spatially-
// identical members form a genuine PARTIAL overlap (2 of 3 children), not a
// spans-all-children singleton — preserving this file's actual test intent
// (hero-metric journey-switch rendering) without triggering the new
// no-singleton escalation path at all.
function farDecoy(nodeKey: string): { raw: NavigationNodeResponse['children'][number]; typed: AreasNavigationChild } {
  const decoy = clusterChild(nodeKey, { listingCount: 1, schoolCount: 1 });
  decoy.raw.centreLat = 13.5;
  decoy.raw.centreLon = 78.2;
  return decoy;
}
const CLUSTER_MEMBERS_WITH_DECOY = [...CLUSTER_MEMBERS, farDecoy('c:far-away-decoy')];
const ZERO_CLUSTER_MEMBERS_WITH_DECOY = [...ZERO_CLUSTER_MEMBERS, farDecoy('c:far-away-decoy-zero')];

/**
 * Locate the MOST RECENT visual-cluster-card html among possibly-several
 * captured calls (searched from the end — `divIconHtmlCalls` accumulates
 * across a `rerender()`, and these tests need the LATEST html, not the
 * first/stale one).
 */
function findClusterCardHtml(): string {
  for (let i = divIconHtmlCalls.length - 1; i >= 0; i--) {
    if (divIconHtmlCalls[i].includes('area-visual-cluster-marker')) return divIconHtmlCalls[i];
  }
  throw new Error('no area-visual-cluster-marker divIcon call captured');
}

/**
 * Locate the marker created with the visual-cluster-card icon, by matching
 * `L.marker`'s own call arguments (icon.options.html) — robust regardless of
 * whether `setIcon` has fired yet for a brand-new marker (unlike reading
 * `getElement().innerHTML`, which only reflects a LATER `setIcon` call).
 */
function findClusterCardMarker(): CapturedMarker {
  const calls = vi.mocked(L.marker).mock.calls as unknown as [unknown, { icon?: { options?: { html?: string } } }][];
  const index = calls.findIndex((call) => call[1]?.icon?.options?.html?.includes('area-visual-cluster-marker'));
  if (index < 0) throw new Error('no area-visual-cluster-marker marker captured');
  return capturedMarkers[index];
}

beforeEach(() => {
  capturedMarkers.length = 0;
  divIconHtmlCalls.length = 0;
  vi.clearAllMocks();
});

// Matches the hero-number span markup makeAreaVisualClusterCard emits, e.g.
// `...font-weight:800;line-height:1;letter-spacing:-0.02em;">22</span>`.
function heroListingsNumber(html: string): string | null {
  const match = html.match(/font-weight:800;line-height:1;letter-spacing:-0\.02em;">([^<]+)</);
  return match ? match[1] : null;
}

function hasZeroListingsPhrase(html: string): boolean {
  return /No listings yet/.test(html);
}

describe('#2345 — visual-cluster hero metric must not leak stale residential content into schools journey', () => {
  it('"areas" call site, non-zero listings: schools-journey HTML carries NO residential listings hero after switching from residential', () => {
    const { rerender } = render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: AREA_MEMBERS.map((m) => m.raw) }}
        levelKind="areas"
        children={AREA_MEMBERS.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    expect(divIconHtmlCalls).toHaveLength(1);
    expect(heroListingsNumber(divIconHtmlCalls[0])).toBe('22');
    expect(capturedMarkers).toHaveLength(1);
    const marker = capturedMarkers[0];

    act(() => {
      rerender(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: AREA_MEMBERS.map((m) => m.raw) }}
          levelKind="areas"
          children={AREA_MEMBERS.map((m) => m.typed)}
          onSelect={vi.fn()}
          journey="school-first"
        />,
      );
    });

    // The SAME marker's setIcon must have fired again (journeyAttr/accent
    // differ), proving this is not merely a "setIcon never called" bug.
    expect(marker.setIcon).toHaveBeenCalled();
    const latestHtml = divIconHtmlCalls[divIconHtmlCalls.length - 1];
    expect(latestHtml).toContain('data-journey="schools"');
    // The bug: this residential "22" hero number must NOT survive into the
    // schools-journey HTML.
    expect(heroListingsNumber(latestHtml)).toBeNull();
    expect(latestHtml).not.toContain('>22<');
  });

  it('"clusters" call site, zero listings: schools-journey HTML carries NO "No listings yet" residential zero-phrase after switching from residential', () => {
    // The 'areas' call site applies journey-aware visibility BEFORE clustering
    // (clusterVisibleAreaMembers), which excludes zero-listing AREA members
    // entirely under the residential eligibility journey — a zero-listing
    // multi-member AREA cluster cannot be constructed there. The
    // 'clusters'/'directions' call site is a STRUCTURAL level that applies no
    // such filtering, so it is used here to exercise the zero-phrase branch.
    const { rerender } = render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: ZERO_CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.raw) }}
        levelKind="clusters"
        children={ZERO_CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    expect(hasZeroListingsPhrase(findClusterCardHtml())).toBe(true);

    act(() => {
      rerender(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: ZERO_CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.raw) }}
          levelKind="clusters"
          children={ZERO_CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.typed)}
          onSelect={vi.fn()}
          journey="school-first"
        />,
      );
    });

    const latestHtml = findClusterCardHtml();
    expect(latestHtml).toContain('data-journey="schools"');
    expect(hasZeroListingsPhrase(latestHtml)).toBe(false);
  });

  it('"clusters" call site, non-zero listings: schools-journey HTML carries NO residential listings hero after switching from residential', () => {
    const { rerender } = render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.raw) }}
        levelKind="clusters"
        children={CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    expect(heroListingsNumber(findClusterCardHtml())).toBe('65');
    const marker = findClusterCardMarker();

    act(() => {
      rerender(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.raw) }}
          levelKind="clusters"
          children={CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.typed)}
          onSelect={vi.fn()}
          journey="school-first"
        />,
      );
    });

    expect(marker.setIcon).toHaveBeenCalled();
    const latestHtml = findClusterCardHtml();
    expect(latestHtml).toContain('data-journey="schools"');
    expect(heroListingsNumber(latestHtml)).toBeNull();
    expect(latestHtml).not.toContain('>65<');
  });

  it('sanity: residential journey still renders its listings hero unchanged (this fix must not remove it for the residential journey)', () => {
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: AREA_MEMBERS.map((m) => m.raw) }}
        levelKind="areas"
        children={AREA_MEMBERS.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    expect(divIconHtmlCalls).toHaveLength(1);
    expect(heroListingsNumber(divIconHtmlCalls[0])).toBe('22');
    // Residential journey omits the data-journey attribute entirely (it is
    // never rendered as an empty-valued attribute) — assert its absence via
    // the schools-only value, matching the sibling accent test's convention.
    expect(divIconHtmlCalls[0]).not.toContain('data-journey="schools"');
  });
});
