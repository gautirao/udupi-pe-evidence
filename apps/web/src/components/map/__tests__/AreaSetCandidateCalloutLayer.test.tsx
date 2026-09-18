/**
 * Issue #2456 — AreaSetCandidateCalloutLayer unit tests.
 *
 * The layer renders Leaflet markers imperatively (L.marker(...).addTo(map))
 * inside a useEffect, mirroring SchoolMarkerLayer / AreaMarkerLayer. We mock
 * `leaflet` so each L.marker / L.divIcon call is captured, then assert:
 *
 *   1. one marker per candidate, positioned from the candidate's OWN geo
 *      centre (nearby contract), never from any area/bucketing input;
 *   2. every marker is `interactive: false` + `keyboard: false` and NO
 *      event handler of any kind is registered (`marker.on` never called) —
 *      there is structurally no click / hover / keyboard path to mutate scope;
 *   3. the divIcon is a non-interactive dashed label (no role="button", no
 *      tabindex, pointer-events:none, dashed border) carrying the panel's
 *      filter-aware count verbatim;
 *   4. an empty candidate list renders nothing, and unmount / re-render
 *      removes every previously-placed marker (draft close tears down).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Capture L.marker / L.divIcon calls ───────────────────────────────────────

type MarkerHandle = {
  on: ReturnType<typeof vi.fn>;
  addTo: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  getElement: ReturnType<typeof vi.fn>;
};
type MarkerCall = { latlng: [number, number]; opts?: Record<string, unknown>; handle: MarkerHandle };
const capturedMarkerCalls: MarkerCall[] = [];
const capturedDivIconOpts: Array<Record<string, unknown>> = [];

// ─── Mocks (must be declared before imports) ──────────────────────────────────

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn((opts: Record<string, unknown>) => {
      capturedDivIconOpts.push(opts);
      return { options: opts };
    }),
    marker: vi.fn((latlng: [number, number], opts?: Record<string, unknown>) => {
      const handle: MarkerHandle = {
        on: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getElement: vi.fn(() => undefined),
      };
      capturedMarkerCalls.push({ latlng, opts, handle });
      return handle;
    }),
  },
}));

vi.mock('react-leaflet', () => ({
  useMap: vi.fn(() => ({
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
  })),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { render } from '@testing-library/react';
import {
  AreaSetCandidateCalloutLayer,
  makeAreaSetCandidateCalloutIcon,
  makeAreaSetDraftMemberIcon,
  type AreaSetCandidateCallout,
  type AreaSetDraftMemberMarker,
} from '../AreaSetCandidateCalloutLayer';
import { NAVY_800, GREY_700, GREY_500, PAPER } from '@/components/map/markerTokens';

const RR_NAGAR_MEMBER: AreaSetDraftMemberMarker = {
  areaKey: 'IN|KA|Bengaluru|RR Nagar',
  label: 'RR Nagar',
  lat: 12.93,
  lon: 77.52,
};

// ─── Fixtures ────────────────────────────────────────────────────────────────
// Shaped exactly like DiscoverMapCanvas's 1:1 mapping of the nearby contract
// (`NearbyAreaCandidate` → { areaKey, label, lat, lon, count }). Counts are
// deliberately NOT round numbers so a fallback to some other total is loud.

const HENNUR: AreaSetCandidateCallout = {
  areaKey: 'IN|KA|Bengaluru|Hennur',
  label: 'Hennur',
  lat: 13.04,
  lon: 77.63,
  count: 3,
};
const KEMPAPURA: AreaSetCandidateCallout = {
  areaKey: 'IN|KA|Bengaluru|Kempapura',
  label: 'Kempapura',
  lat: 13.06,
  lon: 77.61,
  count: 1287,
};

function iconHtml(index: number): string {
  const html = capturedDivIconOpts[index]?.html;
  return typeof html === 'string' ? html : '';
}

beforeEach(() => {
  capturedMarkerCalls.length = 0;
  capturedDivIconOpts.length = 0;
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('AreaSetCandidateCalloutLayer — Issue #2456: 1:1 non-interactive callouts', () => {
  it('places exactly one marker per candidate, at the candidate\'s own geo centre, in panel order', () => {
    render(<AreaSetCandidateCalloutLayer candidates={[HENNUR, KEMPAPURA]} />);

    expect(capturedMarkerCalls).toHaveLength(2);
    expect(capturedMarkerCalls[0].latlng).toEqual([13.04, 77.63]);
    expect(capturedMarkerCalls[1].latlng).toEqual([13.06, 77.61]);
    expect(capturedMarkerCalls.every((c) => c.handle.addTo.mock.calls.length === 1)).toBe(true);
  });

  it('renders NOTHING when the candidate list is empty (draft closed / no suggestions)', () => {
    render(<AreaSetCandidateCalloutLayer candidates={[]} />);
    expect(capturedMarkerCalls).toHaveLength(0);
    expect(capturedDivIconOpts).toHaveLength(0);
  });

  it('every marker is interactive:false + keyboard:false and registers NO event handler at all (no click / hover / keyboard path exists)', () => {
    render(<AreaSetCandidateCalloutLayer candidates={[HENNUR, KEMPAPURA]} />);

    for (const call of capturedMarkerCalls) {
      expect(call.opts).toMatchObject({ interactive: false, keyboard: false });
      // Owner ruling: the map never mutates scope. The strongest proof is
      // structural — the layer never subscribes to ANY Leaflet event, so
      // there is no handler for a click, mouseover, or keydown to reach.
      expect(call.handle.on).not.toHaveBeenCalled();
      // Nor does it reach into the DOM element to attach listeners.
      expect(call.handle.getElement).not.toHaveBeenCalled();
    }
  });

  it('icon HTML is a non-interactive dashed label carrying the panel\'s count verbatim', () => {
    render(<AreaSetCandidateCalloutLayer candidates={[HENNUR, KEMPAPURA]} />);

    expect(capturedDivIconOpts).toHaveLength(2);
    const hennur = iconHtml(0);
    const kempapura = iconHtml(1);

    // Identity + filter-aware count, 1:1 with the panel row.
    expect(hennur).toContain('data-area-key="IN|KA|Bengaluru|Hennur"');
    expect(hennur).toContain('Hennur');
    expect(hennur).toContain('>3<');
    expect(kempapura).toContain('Kempapura');
    // toLocaleString — the panel's number, formatted, not a different total.
    expect(kempapura).toContain(`>${(1287).toLocaleString()}<`);

    for (const html of [hennur, kempapura]) {
      // Frozen mock: dashed subtle label that "must never read as a
      // committed search area".
      expect(html).toContain('data-design-component="area-candidate-label"');
      expect(html).toContain('1px dashed');
      expect(html).toContain('data-testid="area-set-candidate-callout"');
      // Non-interactive: no button semantics, no focus stop, no pointer target.
      expect(html).toContain('pointer-events:none');
      expect(html).toContain('aria-hidden="true"');
      expect(html).not.toMatch(/role="button"/);
      expect(html).not.toMatch(/tabindex/i);
      // Must NOT be the interactive candidate card AreaMarkerLayer renders
      // for draft members ("View homes ›" footer, role=button).
      expect(html).not.toContain('View homes');
      expect(html).not.toContain('area-set-candidate-marker');
    }
  });

  it('escapes candidate label + areaKey before interpolating into divIcon HTML', () => {
    const icon = makeAreaSetCandidateCalloutIcon({
      areaKey: 'IN|KA|X|<img src=x onerror=alert(1)>',
      label: '<script>alert("x")</script>',
      lat: 0,
      lon: 0,
      count: 0,
    });
    const html = String((icon as unknown as { options: { html: string } }).options.html);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('unmount removes every placed marker (draft close tears the callouts down)', () => {
    const { unmount } = render(<AreaSetCandidateCalloutLayer candidates={[HENNUR, KEMPAPURA]} />);
    expect(capturedMarkerCalls).toHaveLength(2);
    unmount();
    for (const call of capturedMarkerCalls) {
      expect(call.handle.remove).toHaveBeenCalledTimes(1);
    }
  });

  it('re-render with a new candidate array replaces the old markers rather than stacking them', () => {
    const { rerender } = render(<AreaSetCandidateCalloutLayer candidates={[HENNUR, KEMPAPURA]} />);
    const firstBatch = [...capturedMarkerCalls];
    expect(firstBatch).toHaveLength(2);

    // Panel Add removed Hennur from the nearby list (backend excludes
    // selected areas) — the map follows the SAME array 1:1.
    rerender(<AreaSetCandidateCalloutLayer candidates={[KEMPAPURA]} />);

    for (const call of firstBatch) {
      expect(call.handle.remove).toHaveBeenCalledTimes(1);
    }
    const live = capturedMarkerCalls.slice(firstBatch.length);
    expect(live).toHaveLength(1);
    expect(live[0].latlng).toEqual([13.06, 77.61]);
    expect(live[0].handle.remove).not.toHaveBeenCalled();
  });
});

// ─── Issue #2456 (owner ruling C2) — draft MEMBERS as the white selected card ──

describe('AreaSetCandidateCalloutLayer — draft members (owner ruling C2): canonical white selected card, non-interactive', () => {
  it('renders one marker per member AFTER the candidates, at the member geo centre, interactive:false + keyboard:false, no handler', () => {
    render(<AreaSetCandidateCalloutLayer candidates={[HENNUR]} members={[RR_NAGAR_MEMBER]} />);

    expect(capturedMarkerCalls).toHaveLength(2);
    const member = capturedMarkerCalls[1];
    expect(member.latlng).toEqual([12.93, 77.52]);
    expect(member.opts).toMatchObject({ interactive: false, keyboard: false });
    expect(member.handle.on).not.toHaveBeenCalled();
    expect(member.handle.getElement).not.toHaveBeenCalled();
    expect(member.handle.addTo).toHaveBeenCalledTimes(1);
  });

  it('member icon IS the canonical white selected "View homes" shell (markerShellHtml reuse), non-interactive, with NO numeric count', () => {
    render(<AreaSetCandidateCalloutLayer candidates={[]} members={[RR_NAGAR_MEMBER]} />);

    expect(capturedDivIconOpts).toHaveLength(1);
    expect(capturedDivIconOpts[0].className).toBe('area-set-draft-member-marker-icon');
    const html = iconHtml(0);
    // Reuse markers: the canonical shell + selected outline + "View homes" footer.
    expect(html).toContain('data-testid="area-set-draft-member-marker"');
    expect(html).toContain('data-marker-shell="true"');
    expect(html).toContain('data-action-kind="view-homes"');
    expect(html).toContain('data-selected="true"');
    expect(html).toContain('outline:2px solid');
    expect(html).toContain('RR Nagar');
    expect(html).toContain('View homes');
    // Owner ruling (count truthfulness): non-numeric wording, no digits in the identity section.
    const body = html.match(/<div class="rc-body"[^>]*>([\s\S]*?)<\/div><div class="rc-footer"/)?.[1] ?? '';
    expect(body.replace(/<[^>]+>/g, '')).not.toMatch(/\d/);
    expect(body).toContain('Selected · in your draft');
    expect(html).not.toContain('LISTING');
    // Non-interactive: no button semantics, no focus stop, no pointer target, no cursor.
    expect(html).not.toMatch(/role="button"/);
    expect(html).not.toMatch(/tabindex/i);
    expect(html).not.toMatch(/aria-label=/);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-interactive="false"');
    expect(html).toContain('pointer-events:none');
    expect(html).not.toContain('pointer-events:auto');
    expect(html).not.toContain('cursor:pointer');
    // NOT the dashed candidate callout and NOT the #2424 copper card.
    expect(html).not.toContain('area-set-candidate-callout');
    expect(html).not.toContain('area-set-candidate-marker');
  });

  it('members prop omitted → callout-only behaviour unchanged', () => {
    render(<AreaSetCandidateCalloutLayer candidates={[HENNUR, KEMPAPURA]} />);
    expect(capturedMarkerCalls).toHaveLength(2);
    expect(capturedDivIconOpts.every((o) => o.className === 'area-set-candidate-callout')).toBe(true);
  });

  it('panel Add transition: candidate leaves `candidates`, joins `members` — old callout removed, selected card placed', () => {
    const hennurMember: AreaSetDraftMemberMarker = {
      areaKey: HENNUR.areaKey,
      label: HENNUR.label,
      lat: HENNUR.lat,
      lon: HENNUR.lon,
    };
    const { rerender } = render(<AreaSetCandidateCalloutLayer candidates={[HENNUR, KEMPAPURA]} members={[]} />);
    const before = [...capturedMarkerCalls];
    expect(before).toHaveLength(2);

    rerender(<AreaSetCandidateCalloutLayer candidates={[KEMPAPURA]} members={[hennurMember]} />);

    for (const call of before) expect(call.handle.remove).toHaveBeenCalledTimes(1);
    const live = capturedMarkerCalls.slice(before.length);
    expect(live).toHaveLength(2);
    expect(live[0].latlng).toEqual([KEMPAPURA.lat, KEMPAPURA.lon]);
    expect(live[1].latlng).toEqual([HENNUR.lat, HENNUR.lon]);
    const liveIcons = capturedDivIconOpts.slice(-2);
    expect(liveIcons[0].className).toBe('area-set-candidate-callout');
    expect(liveIcons[1].className).toBe('area-set-draft-member-marker-icon');
    expect(String(liveIcons[1].html)).toContain('data-selected="true"');
    for (const call of live) expect(call.handle.on).not.toHaveBeenCalled();
  });

  it('unmount removes member markers too (draft close tears everything down)', () => {
    const { unmount } = render(<AreaSetCandidateCalloutLayer candidates={[HENNUR]} members={[RR_NAGAR_MEMBER]} />);
    unmount();
    for (const call of capturedMarkerCalls) expect(call.handle.remove).toHaveBeenCalledTimes(1);
  });

  it('makeAreaSetDraftMemberIcon renders candidate snapshot count (9 LISTINGS) and schoolCount (0 schools) with dark legible text on white card body', () => {
    const kadugodiMember: AreaSetDraftMemberMarker = {
      areaKey: 'IN|KA|Bengaluru|Kadugodi',
      label: 'Kadugodi',
      lat: 12.99,
      lon: 77.76,
      count: 9,
      schoolCount: 0,
    };
    const icon = makeAreaSetDraftMemberIcon(kadugodiMember);
    const html = String((icon as unknown as { options: { html: string } }).options.html);

    expect(html).toContain('Kadugodi');
    expect(html).toContain('>9<');
    expect(html).toContain('LISTINGS');
    expect(html).toContain('0 schools');
    expect(html).not.toContain('126');
    expect(html).not.toContain('5 schools');

    // Visual-semantic assertions: text must be dark (NAVY_800 / GREY_500 / GREY_700) and NOT white (PAPER) on white card body
    expect(html).toContain(`color:${NAVY_800}`);
    expect(html).toContain(`color:${GREY_500}`);
    expect(html).toContain(`color:${GREY_700}`);
    expect(html).not.toContain(`color:${PAPER};">9<`);
    expect(html).not.toContain(`color:rgba(255,255,255`);
  });
});
