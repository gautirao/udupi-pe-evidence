/**
 * Issue #2305 STAGE 2 — visual-cluster accent regression test (Option B).
 *
 * FULL REWRITE, not a find-replace. The card this test targets used to be a
 * `1.5px dashed <accent>`-bordered chip (Issue #2088 delta-3, AC8); Issue
 * #2305 replaces that markup entirely with the "Option B" card
 * (`markerPrimitives.ts`'s `visualClusterCardHtml`): a connected navy
 * `.rc-shell` + white `.rc-footer` + accent-coloured `.rc-tail` triangle,
 * where `<accent>` colours the footer icon/text/chevron and the tail — never
 * the shell's own border, which stays a fixed navy rgba regardless of
 * journey. Every assertion below targets those Option B surfaces.
 *
 * ── ACCENT RULING (main-agent-ruling-accent-scope.toml) ──
 * `makeAreaVisualClusterCard` has TWO call sites in AreaMarkerLayer.tsx — the
 * 'areas' path (`levelKind="areas"`) and the 'clusters'/'directions' path
 * (`levelKind="clusters"` / `"directions"`). Because Issue #2305's P1 rewrote
 * the SHARED builder both sites call, the user ruled that BOTH must flip
 * their residential accent from navy to `COPPER_500` together — leaving only
 * one flipped would ship a copper-vs-navy divergence between levels that
 * does not exist on main today. School-first stays `PLUM_600` at both sites.
 * This file asserts both call sites explicitly, per that ruling.
 *
 * ── WHY THIS TEST ASSERTS THE RENDERED HTML, NEVER markerTokens.ts's SOURCE ──
 * A test that only imported and asserted `COPPER_500 !== PLUM_600` would stay
 * green through a call-site wiring bug that passed the wrong constant into an
 * otherwise-correct `makeAreaVisualClusterCard`/`visualClusterCardHtml` — the
 * exact class of defect Issue #2088's original version of this file existed
 * to catch. Every assertion below reads the actual `L.divIcon({ html })`
 * string handed to Leaflet — the same string a real browser paints — never
 * the token module's own exports. (The OLD version of this file's final test,
 * `expect(NAVY_800).not.toBe(PLUM_600)`, was exactly that tautology: it
 * compared two constants and could never fail from a real code regression.
 * It is not preserved here — see "sanity" test below, which asserts the
 * SAME member set renders genuinely different HTML across journeys.)
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

// Real lat/lon -> pixel projection (same convention as AreaMarkerLayer.test.tsx's
// `projectLatLon`) — members at the IDENTICAL coordinate still land on the
// identical point (preserving every existing "spatially identical -> one
// dense cluster cell" fixture's premise byte-for-byte), while a genuinely
// distant decoy member (added below for the 'clusters' call site, Issue
// #1943 no-redundant-singleton amendment) now correctly lands elsewhere.
function projectLatLon(lat: number, lon: number): { x: number; y: number } {
  return { x: (lon - 74.5) * 10000, y: (13.5 - lat) * 10000 };
}

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
};

vi.mock('react-leaflet', () => ({
  useMap: vi.fn(() => mapStub),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

import { AreaDestinationMarkerLayer } from '../AreaMarkerLayer';
import { COPPER_500, COPPER_600, PLUM_600 } from '../markerTokens';
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

// 4 spatially-identical AREA members -> one visual cluster ("+2 areas with
// matches" per the existing dense-AREA fixture convention in
// AreaMarkerLayer.destinations.test.tsx). Every member carries a non-zero
// schoolCount so the cluster is eligible identically under both the
// residential ('areas') and school-first ('schools') eligibility dimensions
// — the accent branch is the only thing this test varies.
const AREA_MEMBERS = [
  areaChild('alpha', { listingCount: 10, schoolCount: 5 }),
  areaChild('bravo', { listingCount: 8, schoolCount: 4 }),
  areaChild('charlie', { listingCount: 3, schoolCount: 1 }),
  areaChild('delta', { listingCount: 1, schoolCount: 1 }),
];

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

// 2 spatially-identical CLUSTER ("Local Destination") members -> one
// structural visual cluster on the 'clusters'/'directions' path.
//
// Issue #1943 (no-redundant-singleton amendment, PLAN_REVIEW packet 010
// APPROVED) — a cluster of ALL of a node's children can no longer render as
// a single synthetic catch-all (see AreaMarkerLayer.test.tsx's owner-amendment
// tests). A THIRD, geographically-distant decoy member is added so the two
// spatially-identical members above form a genuine PARTIAL overlap (2 of 3
// children), not a spans-all-children singleton — preserving this file's
// actual test intent (visual-cluster-card accent rendering) without
// triggering the new no-singleton escalation path at all.
const CLUSTER_MEMBERS = [
  clusterChild('c:whitefield-belt', { listingCount: 40, schoolCount: 6 }),
  clusterChild('c:marathahalli-belt', { listingCount: 25, schoolCount: 3 }),
];
const CLUSTER_DECOY = clusterChild('c:far-away-decoy', { listingCount: 5, schoolCount: 1 });
CLUSTER_DECOY.raw.centreLat = 13.5;
CLUSTER_DECOY.raw.centreLon = 78.2;
const CLUSTER_MEMBERS_WITH_DECOY = [...CLUSTER_MEMBERS, CLUSTER_DECOY];

/** Locate the ONE visual-cluster-card html among possibly-several captured calls. */
function findClusterCardHtml(): string {
  const html = divIconHtmlCalls.find((h) => h.includes('area-visual-cluster-marker'));
  if (!html) throw new Error('no area-visual-cluster-marker divIcon call captured');
  return html;
}

beforeEach(() => {
  capturedMarkers.length = 0;
  divIconHtmlCalls.length = 0;
  vi.clearAllMocks();
});

function rcFooterColor(html: string): string | null {
  const match = html.match(/color:([^;]+);">Zoom in/);
  return match ? match[1] : null;
}

describe('AC8/#2305 — visual-cluster accent (rendered Option B HTML, not the token file) — "areas" call site', () => {
  it('RESIDENTIAL journey: renders the Option B card with COPPER_600 footer text and COPPER_500 border/tail, never navy or plum', () => {
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
    const html = divIconHtmlCalls[0];
    expect(html).toContain('area-visual-cluster-marker');
    expect(html).toContain('class="rc-shell"');
    expect(html).toContain('class="rc-footer"');
    expect(html).toContain('class="rc-tail"');
    // AC4 two-tone residential accent: the footer icon/text/chevron render
    // COPPER_600 (one shade darker), while the border and `.rc-tail` triangle
    // stay COPPER_500 — this rebaselines the footer-TEXT hex from the old
    // single-shade COPPER_500 stand-in to the real two-tone split. The
    // border/tail assertion below is intentionally untouched.
    expect(rcFooterColor(html)).toBe(COPPER_600);
    expect(html).toContain(`border-top:7px solid ${COPPER_500}`);
    expect(html).not.toContain(PLUM_600);
    // Never the retired dashed-card markup this replaces.
    expect(html).not.toMatch(/dashed/);
  });

  it('SCHOOL-FIRST journey: renders the Option B card with PLUM_600 in the footer/tail, unchanged by the copper flip', () => {
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: AREA_MEMBERS.map((m) => m.raw) }}
        levelKind="areas"
        children={AREA_MEMBERS.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey="school-first"
      />,
    );
    expect(divIconHtmlCalls).toHaveLength(1);
    const html = divIconHtmlCalls[0];
    expect(html).toContain('area-visual-cluster-marker');
    expect(rcFooterColor(html)).toBe(PLUM_600);
    expect(html).toContain(`border-top:7px solid ${PLUM_600}`);
    expect(html).not.toContain(COPPER_500);
    expect(html).toContain('data-journey="schools"');
  });

  it('sanity: the SAME member set renders a genuinely different accent across journeys (never the same rendered color)', () => {
    const { unmount } = render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: AREA_MEMBERS.map((m) => m.raw) }}
        levelKind="areas"
        children={AREA_MEMBERS.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    const residentialColor = rcFooterColor(divIconHtmlCalls[divIconHtmlCalls.length - 1]);
    unmount();

    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: AREA_MEMBERS.map((m) => m.raw) }}
        levelKind="areas"
        children={AREA_MEMBERS.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey="school-first"
      />,
    );
    const schoolFirstColor = rcFooterColor(divIconHtmlCalls[divIconHtmlCalls.length - 1]);

    expect(residentialColor).not.toBeNull();
    expect(schoolFirstColor).not.toBeNull();
    expect(residentialColor).not.toBe(schoolFirstColor);
  });
});

describe('#2305 accent ruling — "clusters"/"directions" call site (main-agent-ruling-accent-scope.toml)', () => {
  it('RESIDENTIAL journey: the structural CLUSTER visual-cluster card also renders COPPER_600 footer text, matching the "areas" site', () => {
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.raw) }}
        levelKind="clusters"
        children={CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    const html = findClusterCardHtml();
    expect(html).toContain('area-visual-cluster-marker');
    // AC4 two-tone residential accent — see the matching comment on the
    // "areas" site's equivalent test above.
    expect(rcFooterColor(html)).toBe(COPPER_600);
    expect(html).toContain(`border-top:7px solid ${COPPER_500}`);
    expect(html).not.toContain(PLUM_600);
  });

  it('SCHOOL-FIRST journey: the structural CLUSTER visual-cluster card renders PLUM_600, matching the "areas" site', () => {
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.raw) }}
        levelKind="clusters"
        children={CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey="school-first"
      />,
    );
    const html = findClusterCardHtml();
    expect(rcFooterColor(html)).toBe(PLUM_600);
    expect(html).toContain(`border-top:7px solid ${PLUM_600}`);
    expect(html).not.toContain(COPPER_500);
  });

  it('both call sites agree: residential renders IDENTICAL accent hex at both the "areas" and "clusters" levels', () => {
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: AREA_MEMBERS.map((m) => m.raw) }}
        levelKind="areas"
        children={AREA_MEMBERS.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    const areasColor = rcFooterColor(divIconHtmlCalls[divIconHtmlCalls.length - 1]);

    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.raw) }}
        levelKind="clusters"
        children={CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    const clustersColor = rcFooterColor(findClusterCardHtml());

    // AC4: both sites now render COPPER_600 footer text (not COPPER_500) —
    // the cross-call-site equality invariant itself (areasColor === clustersColor)
    // is preserved unchanged, per the prior main-agent ruling.
    expect(areasColor).toBe(COPPER_600);
    expect(clustersColor).toBe(COPPER_600);
    expect(areasColor).toBe(clustersColor);
  });

  it('both call sites agree: school-first renders IDENTICAL accent hex at both the "areas" and "clusters" levels', () => {
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: AREA_MEMBERS.map((m) => m.raw) }}
        levelKind="areas"
        children={AREA_MEMBERS.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey="school-first"
      />,
    );
    const areasColor = rcFooterColor(divIconHtmlCalls[divIconHtmlCalls.length - 1]);

    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.raw) }}
        levelKind="clusters"
        children={CLUSTER_MEMBERS_WITH_DECOY.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey="school-first"
      />,
    );
    const clustersColor = rcFooterColor(findClusterCardHtml());

    expect(areasColor).toBe(PLUM_600);
    expect(clustersColor).toBe(PLUM_600);
    expect(areasColor).toBe(clustersColor);
  });
});
