/**
 * Issue #2088 delta-3, AC8 — `makeDestinationCard`'s rebuilt grammar, checked
 * attribute-by-attribute against the approved mock's `destCardHTML`
 * (docs/design/retrends-design-system/ui_kits/new_discover/src/ExpMap.jsx,
 * read-only — never edited by this test).
 *
 * Every assertion below reads the ACTUAL `L.divIcon({ html })` string handed
 * to Leaflet — never `markerTokens.ts`'s own exports — because the shipped
 * defect in item 2b's first pass was exactly a call site embedding the wrong
 * (unescaped) value into that HTML string while the token file itself was
 * correct the whole time (see the quote-escaping regression test at the
 * bottom of this file).
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
import {
  NAVY_800,
  PAPER,
  COPPER_600,
  PLUM_600,
  FONT_SANS,
  FONT_MONO,
  RADIUS_FULL,
  SHADOW_MD,
  DESTINATION_BORDER_REST,
  DESTINATION_BORDER_ACTIVE,
  DESTINATION_PILL_BG,
} from '../markerTokens';
import { escapeHtml } from '@/lib/security';
import type { AreasNavigationChild } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

// The same pre-escaping the production module applies (AreaMarkerLayer.tsx's
// FONT_SANS_ATTR/FONT_MONO_ATTR) — a `style="..."` HTML attribute can never
// literally contain the raw `"` characters FONT_SANS/FONT_MONO's font-stack
// values carry, so the rendered HTML is asserted against the ESCAPED form,
// never a re-typed duplicate of the source strings.
const FONT_SANS_ATTR = escapeHtml(FONT_SANS);
const FONT_MONO_ATTR = escapeHtml(FONT_MONO);

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
    matchingAreaCount: 12,
    ...overrides,
  };
}

beforeEach(() => {
  capturedMarkers.length = 0;
  divIconHtmlCalls.length = 0;
  vi.clearAllMocks();
});

/**
 * Renders the resting-state destination card and returns ONLY the HTML this
 * call produced. Uses a before/after slice rather than assuming
 * `divIconHtmlCalls` starts empty — some tests below (the pin/icon absence
 * check) deliberately render more than one layer instance in a single test
 * to establish a positive control before asserting the negative case.
 */
function renderResting(): string {
  const before = divIconHtmlCalls.length;
  const child = directionChild();
  render(
    <AreaDestinationMarkerLayer
      node={ROOT_NODE}
      levelKind="directions"
      children={[child]}
      onSelect={vi.fn()}
      journey={null}
    />,
  );
  const produced = divIconHtmlCalls.slice(before);
  expect(produced).toHaveLength(1);
  return produced[0];
}

describe('AC8 — makeDestinationCard grammar vs. mock destCardHTML (residential journey), 8 independently-failing sub-assertions', () => {
  it('(1) navy surface — card background resolves to NAVY_800 (var(--navy-800) in the mock)', () => {
    const html = renderResting();
    expect(html).toContain(`background:${NAVY_800}`);
  });

  it('(2) white primary text — the name span uses PAPER (#fff) as its text color', () => {
    const html = renderResting();
    expect(html).toContain(`color:${PAPER};white-space:nowrap`);
    expect(html).toContain('North Bangalore');
  });

  it('(3) translucent light border — resting state uses DESTINATION_BORDER_REST, a fixed 1.5px width (never the old 1px/2px copper swap)', () => {
    const html = renderResting();
    expect(html).toContain(`1.5px solid ${DESTINATION_BORDER_REST}`);
    expect(html).not.toContain('1.5px solid rgba(255, 255, 255, 0.9)'); // not the ACTIVE value while resting
  });

  it('(3b) selected/hovered state swaps to DESTINATION_BORDER_ACTIVE, still at the SAME constant 1.5px width', () => {
    const child = directionChild();
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={[child]}
        onSelect={vi.fn()}
        journey={null}
        selectedNodeKey={child.nodeKey}
      />,
    );
    const html = divIconHtmlCalls[0];
    expect(html).toContain(`1.5px solid ${DESTINATION_BORDER_ACTIVE}`);
    expect(html).not.toContain(`1.5px solid ${DESTINATION_BORDER_REST}`);
  });

  it('(4) product-sans names + product-mono count, sourced from markerTokens (never a re-typed literal font stack)', () => {
    const html = renderResting();
    expect(html).toContain(`font-family:${FONT_SANS_ATTR}`);
    expect(html).toContain(`font-family:${FONT_MONO_ATTR}`);
  });

  it('(5) mono count is the strongest element (800 weight), with a separate small uppercase metric label beside it. Digit size SCALES by listing volume (mock destCardHTML: `Math.round(22 + Math.min(1, o.n / 240) * 9)`), never a constant — the default fixture\'s 1,736 listings is well past the n=240 ceiling, so it renders at the max 31px.', () => {
    const html = renderResting();
    expect(html).toMatch(
      /font-family:[^"]*font-size:31px;font-weight:800;line-height:1;letter-spacing:-0\.02em;color:#FFFFFF;">1,736</,
    );
    expect(html).toMatch(
      /font-size:9\.5px;font-weight:700;letter-spacing:\.05em;text-transform:uppercase;[^>]*>listings</,
    );
  });

  it('(5b) low-volume destinations render a SMALLER count digit size than high-volume ones — proves the scaling formula, not a hardcoded constant', () => {
    // n=60 -> Math.round(22 + Math.min(1, 60/240) * 9) = Math.round(24.25) = 24px.
    const lowVolumeChild = directionChild({ listingCount: 60 });
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={[lowVolumeChild]}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    const lowVolumeHtml = divIconHtmlCalls[divIconHtmlCalls.length - 1];
    expect(lowVolumeHtml).toMatch(
      /font-family:[^"]*font-size:24px;font-weight:800;line-height:1;letter-spacing:-0\.02em;color:#FFFFFF;">60</,
    );

    // n=0 -> Math.round(22 + 0) = 22px (the formula's floor). showListingsLine
    // is driven by matchingAreaCount's zero-content check (not listingCount),
    // so this fixture's non-zero matchingAreaCount:12 keeps the listings line
    // (and its "0" count digit) rendered — exercising the formula's floor.
    const zeroVolumeChild = directionChild({ listingCount: 0 });
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={[zeroVolumeChild]}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    const zeroVolumeHtml = divIconHtmlCalls[divIconHtmlCalls.length - 1];
    expect(zeroVolumeHtml).toMatch(
      /font-family:[^"]*font-size:22px;font-weight:800;line-height:1;letter-spacing:-0\.02em;color:#FFFFFF;">0</,
    );

    // The high-volume (1,736) card from the default fixture renders at 31px —
    // strictly larger than the 24px low-volume card above, proving genuine
    // scaling rather than two branches that happen to both be constants.
    const highVolumeHtml = renderResting();
    expect(highVolumeHtml).toContain('font-size:31px;font-weight:800');
    expect(highVolumeHtml).not.toContain('font-size:24px;font-weight:800');
  });

  it('(6) translucent child-count pill is present (DESTINATION_PILL_BG background, RADIUS_FULL radius)', () => {
    const html = renderResting();
    expect(html).toContain(`background:${DESTINATION_PILL_BG}`);
    expect(html).toContain(`border-radius:${RADIUS_FULL}`);
    expect(html).toContain('12 areas with matches');
  });

  it('(7) caption is the mock\'s exact verbatim string — "Explore ›" (rendered as "Explore" + the literal &#8250; chevron entity, matching ExpMap.jsx destCardHTML byte-for-byte)', () => {
    const html = renderResting();
    // Verified against docs/design/retrends-design-system/ui_kits/new_discover/src/ExpMap.jsx
    // destCardHTML: `>Explore <span style="font-size:12px;line-height:1;">&#8250;</span></div>`
    expect(html).toContain('>Explore <span style="font-size:12px;line-height:1;">&#8250;</span></div>');
    expect(html).toContain(`color:${COPPER_600}`); // caption pill text color, unchanged from the mock
    expect(html).toContain(`box-shadow:${SHADOW_MD}`);
  });

  it('(8) no pin/icon accent — the mock\'s destCardHTML has NO svg/pin inside the card at all; the old copper pinSvg was removed, not recolored', () => {
    const html = renderResting();
    // Positive control FIRST — proves this absence assertion is not vacuous:
    // the single-AREA card (a sibling builder in this same file, deliberately
    // NOT touched by item 2b) DOES still render a pin svg, so the divIcon
    // pipeline as a whole is capable of emitting one.
    const areaChild: AreasNavigationChild = {
      nodeKey: 'a:hebbal',
      nodeType: 'AREA',
      displayLabel: 'Hebbal',
      displayOrder: 0,
      listingCount: 5,
      schoolCount: 1,
      isLeafArea: true,
      matchingAreaCount: null,
    };
    render(
      <AreaDestinationMarkerLayer
        node={{
          ...ROOT_NODE,
          children: [
            { nodeKey: 'a:hebbal', nodeType: 'AREA', displayLabel: 'Hebbal', displayOrder: 0, areaKey: 'hebbal', centreLat: 13.0, centreLon: 77.6 },
          ],
        }}
        levelKind="areas"
        children={[areaChild]}
        onSelect={vi.fn()}
      />,
    );
    const singleAreaHtml = divIconHtmlCalls[divIconHtmlCalls.length - 1];
    expect(singleAreaHtml).toContain('<svg'); // positive control: pins DO render elsewhere

    // Now the actual absence assertion on the destination (DIRECTION) card.
    const destinationHtml = renderResting();
    expect(destinationHtml).not.toContain('<svg');
    expect(destinationHtml).not.toContain('#B05C3A'); // legacy copper pin stroke, fully gone
  });
});

describe('AC8 — quote-escaping regression (Issue #2088 item 2b root cause)', () => {
  it("a serialized marker's style=\"...\" attribute is never truncated at font-family: — declarations AFTER font-family survive", () => {
    const html = renderResting();
    // Extract the name span's full style attribute and assert it is a single,
    // properly closed attribute containing MULTIPLE declarations after
    // font-family — the exact thing the unescaped FONT_SANS `"` used to break.
    const match = html.match(/<span style="([^"]*font-family:[^"]*)">North Bangalore<\/span>/);
    expect(match).not.toBeNull();
    const styleAttr = match![1];
    expect(styleAttr).toContain('font-family:');
    expect(styleAttr).toContain('font-size:12.5px');
    expect(styleAttr).toContain('font-weight:700');
    expect(styleAttr).toContain(`color:${PAPER}`);
    // No stray literal double-quote leaked out of the font stack into the
    // surrounding markup (which would either truncate this regex match or
    // spill a dangling `Sans", ui-sans-serif...` fragment into the HTML body).
    expect(html).not.toContain('Plus Jakarta Sans", ui-sans-serif');
  });
});

describe('AC8 — school-first destination-adjacent (dashed AREA cluster) grammar stays plum, UNCHANGED by item 2b (regression guard)', () => {
  it('a school-first dense-AREA visual cluster still renders PLUM_600, never navy — item 2b did not touch this branch', () => {
    const members = [1, 2, 3, 4].map((i) => ({
      raw: {
        nodeKey: `a:m${i}`,
        nodeType: 'AREA' as const,
        displayLabel: `Member ${i}`,
        displayOrder: 0,
        areaKey: `m${i}`,
        centreLat: 13.0,
        centreLon: 77.6,
      },
      typed: {
        nodeKey: `a:m${i}`,
        nodeType: 'AREA' as const,
        displayLabel: `Member ${i}`,
        displayOrder: 0,
        listingCount: i,
        schoolCount: i,
        isLeafArea: true,
        matchingAreaCount: null,
      } satisfies AreasNavigationChild,
    }));
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: members.map((m) => m.raw) }}
        levelKind="areas"
        children={members.map((m) => m.typed)}
        onSelect={vi.fn()}
        journey="school-first"
      />,
    );
    expect(divIconHtmlCalls).toHaveLength(1);
    expect(divIconHtmlCalls[0]).toContain(`1.5px dashed ${PLUM_600}`);
    expect(divIconHtmlCalls[0]).not.toContain(NAVY_800);
  });
});
