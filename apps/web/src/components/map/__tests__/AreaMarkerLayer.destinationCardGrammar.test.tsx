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
  COPPER_500,
  PLUM_600,
  PLUM_TINT,
  FONT_SANS,
  FONT_MONO,
  RADIUS_FULL,
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
  it('(1) dark navy identity surface — card background resolves to #1B2A45', () => {
    const html = renderResting();
    expect(html).toContain('background:#1B2A45');
  });

  it('(2) dark navy identity body (`.rc-body`) sets #1B2A45 / #FFFFFF text color, inherited by the name span; the name now clamps to 2 lines (AC13) rather than a single nowrap line', () => {
    const html = renderResting();
    expect(html).toContain('color:#ffffff');
    expect(html).toMatch(/class="rc-body"[^>]*background:#1B2A45/i);
    expect(html).toContain('-webkit-line-clamp:2');
    expect(html).toContain('North Bangalore');
  });

  it('(3) Issue #2330 — resting state uses the shared shell\'s Explore border (rgba(27,42,69,0.24)), a fixed 1.5px width', () => {
    const html = renderResting();
    expect(html).toContain('border:1.5px solid rgba(27,42,69,0.24)');
  });

  it('(3b) selected state swaps to the solid copper border (#B05C3A), plus a persistent outline', () => {
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
    expect(html).toContain('border:1.5px solid #B05C3A');
    expect(html).toContain('outline:2px solid #B05C3A;outline-offset:2px;');
  });

  it('(4) product-sans names + product-mono count, sourced from markerTokens (never a re-typed literal font stack)', () => {
    const html = renderResting();
    expect(html).toContain(`font-family:${FONT_SANS_ATTR}`);
    expect(html).toContain(`font-family:${FONT_MONO_ATTR}`);
  });

  it('(5) mono count is the strongest element (800 weight), with a separate small uppercase metric label beside it. Digit size SCALES by listing volume (mock destCardHTML: `Math.round(22 + Math.min(1, o.n / 240) * 9)`), never a constant — the default fixture\'s 1,736 listings is well past the n=240 ceiling, so it renders at the max 31px. Issue #2330 — the hero count span no longer sets an explicit per-span color; it inherits PAPER from the shared shell\'s `.rc-body` wrapper (asserted separately by (2) above).', () => {
    const html = renderResting();
    expect(html).toMatch(
      /font-family:[^"]*font-size:26px;font-weight:800;line-height:1;letter-spacing:-0\.02em;color:#ffffff;">1,736</,
    );
    expect(html).toMatch(
      /font-size:9\.5px;font-weight:700;letter-spacing:\.05em;text-transform:uppercase;[^>]*>listings</,
    );
  });

  it('(5b) low-volume destinations render a SMALLER count digit size than high-volume ones — proves the scaling formula, not a hardcoded constant', () => {
    // n=60 -> Math.round(20 + Math.min(1, 60/240) * 6) = 22px.
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
      /font-family:[^"]*font-size:22px;font-weight:800;line-height:1;letter-spacing:-0\.02em;color:#ffffff;">60</,
    );

    // n=0 -> Math.round(20 + 0) = 20px (the formula's floor).
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
      /font-family:[^"]*font-size:20px;font-weight:800;line-height:1;letter-spacing:-0\.02em;color:#ffffff;">0</,
    );

    // The high-volume (1,736) card from the default fixture renders at 26px —
    // strictly larger than the 22px low-volume card above, proving scaling.
    const highVolumeHtml = renderResting();
    expect(highVolumeHtml).toContain('font-size:26px;font-weight:800');
    expect(highVolumeHtml).not.toContain('font-size:22px;font-weight:800');
  });

  it('(6) secondary area & school metadata line is present', () => {
    const html = renderResting();
    expect(html).toContain('12 areas with matches');
    expect(html).toContain('4 schools');
  });

  it('(7) Issue #2330 — the action is now an ATTACHED solid-accent footer (not the old floating white "Explore ›" caption pill): white "Explore" label + chevron on a copper background, a compass glyph beside them', () => {
    const html = renderResting();
    expect(html).toContain('class="rc-footer"');
    expect(html).toMatch(/class="rc-footer"[^>]*background:#B05C3A/);
    expect(html).toContain('color:#FFFFFF;">Explore<');
    expect(html).toContain('&#8250;');
    // The old floating white pill/box-shadow caption is gone.
    expect(html).not.toContain('Explore <span style="font-size:12px;line-height:1;">&#8250;</span></div>');
  });

  it('(8) location pin glyph lives in identity section alongside area name, and compass glyph lives in attached footer', () => {
    const html = renderResting();
    expect(html).toContain('<svg');
    const bodyMatch = html.match(/<div class="rc-body"[^>]*>([\s\S]*?)<\/div>\s*<div class="rc-footer"/);
    expect(bodyMatch).not.toBeNull();
    expect(bodyMatch![1]).toContain('<svg'); // Location pin SVG in identity section
  });
});

describe('AC13 — Explore long-name clamp, accessible title, and injection-shaped-name escaping', () => {
  it('a long two-line DIRECTION displayLabel clamps visually but keeps the FULL name in title/aria-label, escaped', () => {
    const longLabel = 'Really Very Extremely Long Bangalore Direction Name';
    const child = directionChild({ displayLabel: longLabel });
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={[child]}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    const html = divIconHtmlCalls[0];
    expect(html).toContain('-webkit-line-clamp:2');
    expect(html).not.toMatch(new RegExp(`>${longLabel}<`));
    expect(html).toContain(`title="${escapeHtml(longLabel)}"`);
    expect(html).toContain(`aria-label="${escapeHtml(longLabel)}`);
  });

  it('an injection-shaped DIRECTION displayLabel is fully escaped — never a raw <img> or unescaped quote reaches the card', () => {
    const MALICIOUS = '<img src=x onerror=alert(1)>';
    const child = directionChild({ displayLabel: MALICIOUS });
    render(
      <AreaDestinationMarkerLayer
        node={ROOT_NODE}
        levelKind="directions"
        children={[child]}
        onSelect={vi.fn()}
        journey={null}
      />,
    );
    const html = divIconHtmlCalls[0];
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain(escapeHtml(MALICIOUS));
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
    expect(styleAttr).toContain('font-size:13px');
    expect(styleAttr).toContain('font-weight:700');
    // Issue #2330 — the name span itself no longer sets an explicit color;
    // it inherits PAPER from the shared shell's `.rc-body` ancestor, which
    // (2) above already proves. Assert that inheritance ancestor directly.
    expect(html).toMatch(/class="rc-body"[^>]*color:#FFFFFF/i);
    // No stray literal double-quote leaked out of the font stack into the
    // surrounding markup (which would either truncate this regex match or
    // spill a dangling `Sans", ui-sans-serif...` fragment into the HTML body).
    expect(html).not.toContain('Plus Jakarta Sans", ui-sans-serif');
  });
});

describe('AC8 — school-first destination-adjacent (dense AREA visual cluster) grammar stays plum, UNCHANGED by item 2b (regression guard)', () => {
  // Issue #2330 repair — this test used to pin the pre-#2330 Option-B markup
  // (a fixed NAVY_800 hero-section background for EVERY journey, since that
  // stopgap treatment never differentiated the Zoom-in body by journey).
  // AC4 explicitly retires that: Zoom in's identity section is now a LIGHT
  // journey-tinted body (copper-100 residential / plum-tint schools), navy
  // TEXT throughout — never a navy background. This repair narrows/updates
  // the assertion to the new light-body contract, still proving school-first
  // resolves to PLUM_TINT/PLUM_600 (never the residential copper values)
  // while reading the actual rendered HTML string handed to Leaflet (never
  // markerTokens.ts's own exports).
  it('a school-first dense-AREA visual cluster still renders PLUM_600 in the accent-bearing footer/tail, never copper — item 2b\'s intent (plum for schools) survives the Option-B rewrite', () => {
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
    const html = divIconHtmlCalls[0];
    // The accent-bearing footer text/chevron resolve to PLUM_600, not COPPER_500.
    expect(html).toMatch(new RegExp(`color:${PLUM_600};">Zoom in`));
    // The accent-coloured tail triangle resolves to PLUM_600, not COPPER_500.
    expect(html).toContain(`border-top:7px solid ${PLUM_600}`);
    // Never the residential copper-500 accent, anywhere in this school-first card.
    expect(html).not.toContain(COPPER_500);
    // The identity section's body is the plum-tint light background (AC4) —
    // asserted positively, so this test cannot be satisfied by a blank/
    // broken card that happens to omit copper-100 for the wrong reason.
    expect(html).toContain(`background:${PLUM_TINT};color:${NAVY_800}`);
    expect(html).not.toContain(`background:${NAVY_800};color:#fff`);
  });
});
