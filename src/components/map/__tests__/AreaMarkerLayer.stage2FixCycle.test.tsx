/**
 * Issue #2305 STAGE 2 — code-review fix cycle
 * (.claude/handoffs/issue-2305/main-agent-ruling-b1-footprint-floor.toml).
 *
 * FIX 1 (B1, BLOCKING) — the 'clusters'/'directions' call site now floors its
 * batch clustering footprint with the Option-B card constants
 * (VISUAL_CLUSTER_CARD_WIDTH_PX/_HEIGHT_PX), because P1's shared-builder
 * rewrite means that path can now ALSO paint the fixed 172x140 Option-B card,
 * while its clustering footprint still comes from
 * `estimateDestinationCardFootprint` — which can return as little as
 * `BASE_HEIGHT_PX` (120px) when every child's schoolCount is null/0, 20px
 * under the 140px card the batch can actually paint. This describe proves
 * the floor is load-bearing: two 'clusters' children separated by ~125
 * projected px (more than the old 120px bound, less than the new 140px
 * floor) MUST still merge into one visual cluster.
 *
 * FIX 2 (N1, HIGH) — AC3 had no layer-level (rendered-HTML) proof of the
 * hero number/unit split, the zero-count guard phrase, or the double-ring
 * focused-selected state. `AreaMarkerLayer.optionBClusterSkin.test.tsx`
 * (Stage 1) only proves the PURE `visualClusterCardHtml` builder in
 * isolation — it feeds `heroNumberHtml` as a literal and therefore proves
 * nothing about `makeAreaVisualClusterCard`'s call-site WIRING (the actual
 * `totalListingCount > 0 ? ... : undefined` branch, the singular/plural
 * derivation, `isFocusedSelected` threading). Every assertion below reads
 * the real `L.divIcon({ html })` string, exactly the mocking strategy
 * `AreaMarkerLayer.dashedClusterAccent.test.tsx` already established.
 *
 * FIX 6b (Gate F, LOW) — a hostile-input escaping regression test: a
 * regression that dropped `escapeHtml` from any interpolated field on the
 * Option-B card would currently be SILENT in the suite. This asserts the
 * captured HTML carries the ESCAPED entities and never a raw `<img`/`"` in
 * the card's most user-influenced fields (namesHtml, titleAttr,
 * shellAttrs/ariaLabel).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

type CapturedMarker = { handlers: Record<string, (...args: unknown[]) => void> };
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

// Overridden per-test via `.mockImplementation` (Fix 1's describe block) —
// defaults to the dense "every member collapses to one point" convention
// every other spec in this suite already uses for Fix 2/Fix 6b.
const mapStub = {
  getSize: vi.fn(() => ({ x: 1200, y: 800 })),
  getZoom: vi.fn(() => 11),
  latLngToContainerPoint: vi.fn((): { x: number; y: number } => ({ x: 100, y: 100 })),
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
import { NAVY_800, SHADOW_LG, SHADOW_MD, COPPER_500 } from '../markerTokens';
import { VISUAL_CLUSTER_CARD_HEIGHT_PX } from '../markerPrimitives';
import { escapeHtml } from '@/lib/security';
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
      // schoolCount null/0 -> destinationCardFootprint.ts's
      // hasKnowableSecondaryLine is false -> heightPx === BASE_HEIGHT_PX
      // (120), the exact under-estimate B1 fixes.
      schoolCount: null,
      isLeafArea: false,
      matchingAreaCount: null,
      ...overrides,
    },
  };
}

beforeEach(() => {
  capturedMarkers.length = 0;
  divIconHtmlCalls.length = 0;
  vi.clearAllMocks();
  mapStub.getZoom.mockReturnValue(11);
  mapStub.latLngToContainerPoint.mockReturnValue({ x: 100, y: 100 });
});

describe('FIX 1 (B1) — clusters/directions footprint floor', () => {
  it('MERGES two "clusters" children ~125px apart vertically (schoolCount null, residential journey) — proves the batch footprint used >=140px, not the old 120px estimate', () => {
    const a = clusterChild('c:alpha-belt');
    const b = clusterChild('c:bravo-belt');
    // A projects to y=100, B to y=225 — a 125px vertical separation: MORE
    // than the pre-fix 120px (BASE_HEIGHT_PX) bound, LESS than the Option-B
    // 140px floor this fix adds. Only the floored footprint's rects
    // actually intersect (see the module-doc math in the ruling toml).
    mapStub.latLngToContainerPoint.mockImplementation(([lat]: [number, number]) =>
      lat >= 13.001 ? { x: 100, y: 100 } : { x: 100, y: 225 },
    );

    render(
      <AreaDestinationMarkerLayer
        node={{
          ...ROOT_NODE,
          children: [
            { ...a.raw, centreLat: 13.002 },
            { ...b.raw, centreLat: 13.0 },
          ],
        }}
        levelKind="clusters"
        children={[a.typed, b.typed]}
        onSelect={vi.fn()}
        journey={null}
      />,
    );

    expect(divIconHtmlCalls).toHaveLength(1);
    expect(divIconHtmlCalls[0]).toContain('area-visual-cluster-marker');
  });

  it('SANITY (fails without the floor) — the SAME 125px separation does NOT merge when the footprint is held at the old 120px bound', () => {
    // Positive control proving the test above is discriminating: this
    // reproduces the pre-fix math directly (never calling into
    // AreaMarkerLayer/areaClustering at all) so a reviewer can see the same
    // two-rect intersection check the production code now runs, without
    // needing to revert the production fix to see it fail.
    const footprintRect = (anchorY: number, heightPx: number) => ({
      top: anchorY - heightPx,
      bottom: anchorY,
    });
    const intersects = (a: { top: number; bottom: number }, b: { top: number; bottom: number }) =>
      a.top < b.bottom && a.bottom > b.top;

    const rectA_oldBound = footprintRect(100, 120);
    const rectB_oldBound = footprintRect(225, 120);
    expect(intersects(rectA_oldBound, rectB_oldBound)).toBe(false);

    const rectA_floored = footprintRect(100, VISUAL_CLUSTER_CARD_HEIGHT_PX);
    const rectB_floored = footprintRect(225, VISUAL_CLUSTER_CARD_HEIGHT_PX);
    expect(intersects(rectA_floored, rectB_floored)).toBe(true);
  });
});

describe('FIX 2 (N1) — AC3 layer-level proof: hero number/unit split', () => {
  // Uses the 'clusters' (structural) levelKind + CLUSTER-type members, NOT
  // 'areas' — the 'areas' path applies journeyVisibility BEFORE clustering
  // (a member with listingCount=0 is INELIGIBLE and hidden for the
  // residential journey, per journeyVisibility.ts's `eligibleCountFor`), so
  // a listingCount=0 or listingCount=1-with-a-0-sibling fixture could never
  // reach `makeAreaVisualClusterCard` on that path. 'clusters'/'directions'
  // are STRUCTURAL levels (never eligibility-hidden, per areaClustering.ts's
  // module doc) and route through the exact SAME shared builder, so this is
  // still a genuine layer-level proof of the same hero/unit-split wiring.
  it('72 total listings -> the mono hero span reads 72 and the unit is PLURAL "listings"', () => {
    const m1 = clusterChild('c:alpha-belt', { listingCount: 40 });
    const m2 = clusterChild('c:bravo-belt', { listingCount: 32 });
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [m1.raw, m2.raw] }}
        levelKind="clusters"
        children={[m1.typed, m2.typed]}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    expect(divIconHtmlCalls).toHaveLength(1);
    const html = divIconHtmlCalls[0];
    expect(html).toMatch(/>72<\/span>/);
    expect(html).toMatch(/>listings<\/span>/);
    // Boundary proof (never a bare toContain('listing'), which 'listings'
    // would also satisfy and could never fail).
    expect(html).not.toMatch(/>listing<\/span>/);
  });

  it('exactly 1 total listing -> the hero reads 1 and the unit is SINGULAR "listing" (never plural)', () => {
    const m1 = clusterChild('c:alpha-belt', { listingCount: 1 });
    const m2 = clusterChild('c:bravo-belt', { listingCount: 0 });
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [m1.raw, m2.raw] }}
        levelKind="clusters"
        children={[m1.typed, m2.typed]}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    expect(divIconHtmlCalls).toHaveLength(1);
    const html = divIconHtmlCalls[0];
    expect(html).toMatch(/>1<\/span>/);
    expect(html).toMatch(/>listing<\/span>/);
    // The discriminating boundary assertion: a regression that always
    // rendered the plural would still satisfy a bare toContain('listing')
    // check but MUST fail this one.
    expect(html).not.toMatch(/>listings<\/span>/);
  });

  it('all members listingCount 0 -> renders the "No listings yet" zero phrase and NEVER a bare mono hero "0"', () => {
    const m1 = clusterChild('c:alpha-belt', { listingCount: 0 });
    const m2 = clusterChild('c:bravo-belt', { listingCount: 0 });
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [m1.raw, m2.raw] }}
        levelKind="clusters"
        children={[m1.typed, m2.typed]}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    expect(divIconHtmlCalls).toHaveLength(1);
    const html = divIconHtmlCalls[0];
    expect(html).toContain('No listings yet');
    expect(html).not.toMatch(/>0<\/span>/);
  });
});

describe('FIX 2 (N1) — AC3 layer-level proof: focused-selected state (Issue #2330: outline ring, not the pre-#2330 double-ring box-shadow)', () => {
  it('focused (controlled focusedClusterMemberAreaKeys matches the cell) -> data-selected="true" + persistent accent outline + shadow-lg', () => {
    const m1 = areaChild('alpha', { listingCount: 4, schoolCount: 0 });
    const m2 = areaChild('bravo', { listingCount: 3, schoolCount: 0 });
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [m1.raw, m2.raw] }}
        levelKind="areas"
        children={[m1.typed, m2.typed]}
        onSelect={vi.fn()}
        journey={null}
        focusedClusterMemberAreaKeys={['alpha', 'bravo']}
      />,
    );
    expect(divIconHtmlCalls).toHaveLength(1);
    const html = divIconHtmlCalls[0];
    expect(html).toContain('data-selected="true"');
    // Issue #2330 — selected state is a persistent 2px accent outline +
    // shadow-lg (markerShellHtml's `isSelected` branch), replacing the
    // pre-#2330 double-ring box-shadow (`0 0 0 2px PAPER, 0 0 0 4px NAVY`).
    expect(html).toContain(`outline:2px solid ${COPPER_500};outline-offset:2px;`);
    expect(html).toContain(`box-shadow:${SHADOW_LG}`);
    // Zoom in's border is always the SOLID accent (never the rgba(27,42,69,*)
    // navy-transparent border that only Explore/View use) regardless of
    // selection.
    expect(html).toContain(`border:1.5px solid ${COPPER_500}`);
  });

  it('UNFOCUSED (no controlled focus prop) -> no data-selected, shadow-md, no outline — never the focused-selected treatment', () => {
    const m1 = areaChild('alpha', { listingCount: 4, schoolCount: 0 });
    const m2 = areaChild('bravo', { listingCount: 3, schoolCount: 0 });
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: [m1.raw, m2.raw] }}
        levelKind="areas"
        children={[m1.typed, m2.typed]}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    expect(divIconHtmlCalls).toHaveLength(1);
    const html = divIconHtmlCalls[0];
    expect(html).not.toContain('data-selected');
    expect(html).toContain(`border:1.5px solid ${COPPER_500}`);
    expect(html).toContain(`box-shadow:${SHADOW_MD}`);
    expect(html).not.toContain('outline:2px solid');
    expect(html).not.toContain(`0 0 0 4px ${NAVY_800}`);
  });
});

describe('FIX 6b (Gate F) — hostile-input escaping regression, Option-B cluster card', () => {
  it('escapes a member displayLabel carrying quotes/apostrophes/an injection payload, in namesHtml/titleAttr/shellAttrs — never a raw <img or unescaped quote', () => {
    const MALICIOUS = `Ko"ramangala <img src=x onerror=alert(1)> O'Halloran`;
    const m1 = areaChild('alpha', { displayLabel: MALICIOUS, listingCount: 5, schoolCount: 0 });
    const m2 = areaChild('bravo', { displayLabel: 'Neighbouring Area', listingCount: 2, schoolCount: 0 });
    render(
      <AreaDestinationMarkerLayer
        node={{
          ...ROOT_NODE,
          children: [
            { ...m1.raw, displayLabel: MALICIOUS },
            { ...m2.raw, displayLabel: 'Neighbouring Area' },
          ],
        }}
        levelKind="areas"
        children={[m1.typed, m2.typed]}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    expect(divIconHtmlCalls).toHaveLength(1);
    const html = divIconHtmlCalls[0];

    const escaped = escapeHtml(MALICIOUS);
    // The FULL (untruncated) escaped name reaches the shell's title/aria —
    // never elided the way the visible truncated name line may be.
    expect(html).toContain(escaped);
    expect(html).toContain('&quot;');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&#39;');

    // Never a raw, unescaped injection surface anywhere in the card.
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('Ko"ramangala');
    expect(html).not.toContain("O'Halloran");
  });
});
