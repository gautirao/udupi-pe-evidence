/**
 * Issue #2305 STAGE 2 — code-review FIX 3 (N3, MEDIUM)
 * (.claude/handoffs/issue-2305/main-agent-ruling-b1-footprint-floor.toml).
 *
 * `markerPrimitives.ts`'s `visualClusterCardHtml` puts `shellAttrs` (which
 * carries `role="button" tabindex="0"`, via `markerInteractiveAttrs`) on the
 * OUTER wrapper `<div>`, while `.rc-shell` — the element that actually
 * carries the card's border-radius and its own static box-shadow — is the
 * INNER `<div>`. `AreaMarkerLayer.tsx`'s `bindMarkerDom` used to resolve its
 * keyboard-focus ring to the SAME element the `role="button"` listeners are
 * on (the outer wrapper), painting a rounded rectangle around `.rc-shell`
 * PLUS the 7px `.rc-tail` triangle below it — a visible gap around the tail.
 *
 * This file exercises the REAL card markup (not a placeholder), unlike
 * `AreaMarkerLayer.destinations.test.tsx`'s existing UD-2 focus-ring test,
 * whose marker mock always seeds a fixed
 * `<div data-testid="area-destination-marker" tabindex="0" role="button">`
 * placeholder regardless of the icon actually built — so it can only ever
 * exercise the FALLBACK branch (no `.rc-shell` present) and can never prove
 * which element the ring lands on for a real Option-B card. The mock below
 * instead seeds each marker's DOM from the REAL `L.divIcon({ html })` string
 * at creation time (mirroring what Leaflet's real `L.marker(latlng,
 * {icon}).addTo(map)` paints), so `.rc-shell` is genuinely present in the
 * queried subtree.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

type CapturedIcon = { options: { html: string } };
type CapturedMarker = { getElement: () => HTMLElement };
const divIconHtmlCalls: string[] = [];
const capturedMarkers: CapturedMarker[] = [];

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn((opts: { html: string; className: string }) => {
      divIconHtmlCalls.push(opts.html);
      return { options: opts };
    }),
    marker: vi.fn((_latlng: [number, number], options?: { icon?: CapturedIcon }) => {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const el = document.createElement('div');
      // Fidelity fix (this file only) — seed the marker's DOM from the REAL
      // icon HTML at CREATION time, exactly like the real
      // `L.marker(latlng, { icon }).addTo(map)` does, so `.rc-shell` is
      // actually present for a query — never the fixed cross-file
      // placeholder that hides this class of bug (see module doc above).
      if (options?.icon?.options?.html) {
        el.innerHTML = options.icon.options.html;
      }
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
      capturedMarkers.push({ getElement: instance.getElement as () => HTMLElement });
      return instance;
    }),
  },
}));

const mapStub = {
  getSize: vi.fn(() => ({ x: 1200, y: 800 })),
  getZoom: vi.fn(() => 11),
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
import { PAPER, NAVY_800, RADIUS_LG } from '../markerTokens';
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

beforeEach(() => {
  divIconHtmlCalls.length = 0;
  capturedMarkers.length = 0;
  vi.clearAllMocks();
  mapStub.getZoom.mockReturnValue(11);
  mapStub.latLngToContainerPoint.mockReturnValue({ x: 100, y: 100 });
});

describe('FIX 3 (N3) — keyboard focus ring targets .rc-shell, not the outer role=button wrapper', () => {
  it('paints the ring on .rc-shell (not the outer wrapper) on focus, and restores .rc-shell to its ORIGINAL box-shadow (never blank) on blur', () => {
    const m1 = areaChild('alpha');
    const m2 = areaChild('bravo');
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

    // Locate the real DOM the mock seeded from the real card HTML.
    expect(capturedMarkers).toHaveLength(1);
    const markerEl = capturedMarkers[0].getElement();
    const outerRoleButtonEl = markerEl.querySelector<HTMLElement>(
      '[role="button"][tabindex="0"][data-testid="area-visual-cluster-marker"]',
    );
    const shellEl = markerEl.querySelector<HTMLElement>('.rc-shell');
    expect(outerRoleButtonEl).not.toBeNull();
    expect(shellEl).not.toBeNull();
    // Sanity — these must be genuinely different elements (never the same
    // node under two selectors), or this test would prove nothing.
    expect(outerRoleButtonEl).not.toBe(shellEl);

    const shellOriginalBoxShadow = shellEl!.style.boxShadow;
    // The un-focused, un-selected shell already carries a real (non-empty)
    // box-shadow from its own HTML (`SHADOW_LG`) — proves the "restore",
    // not "blank", claim actually has something real to restore. Compared
    // by CONTENT (never `.toBe(SHADOW_LG)`) — jsdom's CSSOM may reserialize
    // a multi-value `box-shadow` string (spacing/rgba formatting), so the
    // only assertion that can't produce a false failure from that
    // reserialization is "non-empty and not the ring colors".
    expect(shellOriginalBoxShadow).not.toBe('');
    expect(shellOriginalBoxShadow).not.toContain(NAVY_800);
    expect(outerRoleButtonEl!.style.boxShadow).toBe('');

    outerRoleButtonEl!.dispatchEvent(new FocusEvent('focus'));

    // The ring painted on .rc-shell...
    expect(shellEl!.style.boxShadow).toContain(PAPER);
    expect(shellEl!.style.boxShadow).toContain(NAVY_800);
    expect(shellEl!.style.borderRadius).toBe(RADIUS_LG);
    // ...and NEVER on the outer role=button wrapper (the old, buggy target
    // — painting there left a visible gap around the 7px .rc-tail).
    expect(outerRoleButtonEl!.style.boxShadow).toBe('');

    outerRoleButtonEl!.dispatchEvent(new FocusEvent('blur'));

    // Restored to the shell's ORIGINAL box-shadow — never cleared to blank
    // (which would strip the card's legitimate SHADOW_LG drop shadow).
    expect(shellEl!.style.boxShadow).toBe(shellOriginalBoxShadow);
    expect(shellEl!.style.boxShadow).not.toBe('');
  });

  it('a focused+selected cluster never stacks two rings on two boxes: the JS focus ring REPLACES (never adds to) .rc-shell\'s own static box-shadow, and blur restores that same static value exactly — the persistent selected OUTLINE (Issue #2330) is untouched by either', () => {
    const m1 = areaChild('alpha');
    const m2 = areaChild('bravo');
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

    expect(capturedMarkers).toHaveLength(1);
    const markerEl = capturedMarkers[0].getElement();
    const outerRoleButtonEl = markerEl.querySelector<HTMLElement>(
      '[role="button"][tabindex="0"][data-testid="area-visual-cluster-marker"]',
    );
    const shellEl = markerEl.querySelector<HTMLElement>('.rc-shell');
    expect(outerRoleButtonEl).not.toBeNull();
    expect(shellEl).not.toBeNull();

    // Issue #2330 — a selected marker's persistent indicator is now a 2px
    // outline (`markerShellHtml`'s `isSelected` branch), never the pre-#2330
    // double-ring box-shadow. The static box-shadow itself is just the
    // (deeper, selected) SHADOW_LG drop shadow — no PAPER/NAVY ring colours
    // baked into it until keyboard focus actually happens.
    const staticSelectedShadow = shellEl!.style.boxShadow;
    expect(staticSelectedShadow).not.toBe('');
    expect(staticSelectedShadow).not.toContain(PAPER);
    expect(staticSelectedShadow).not.toContain(NAVY_800);
    const staticOutline = shellEl!.style.outline;
    expect(staticOutline).toContain('2px solid');

    outerRoleButtonEl!.dispatchEvent(new FocusEvent('focus'));
    // The keyboard-focus ring REPLACES the shell's static box-shadow
    // declaration on the SAME element — never a second ring on a second box.
    expect(shellEl!.style.boxShadow).not.toBe(staticSelectedShadow);
    expect(shellEl!.style.boxShadow).toContain(PAPER);
    expect(shellEl!.style.boxShadow).toContain(NAVY_800);
    // The persistent selected outline is a DIFFERENT CSS property from
    // box-shadow — the focus ring never touches it, so it survives
    // untouched alongside the new ring.
    expect(shellEl!.style.outline).toBe(staticOutline);

    outerRoleButtonEl!.dispatchEvent(new FocusEvent('blur'));
    // Blur reveals the card's own static box-shadow again — exactly, never a
    // blanked-out box-shadow — and the outline is still untouched.
    expect(shellEl!.style.boxShadow).toBe(staticSelectedShadow);
    expect(shellEl!.style.outline).toBe(staticOutline);
  });
});
