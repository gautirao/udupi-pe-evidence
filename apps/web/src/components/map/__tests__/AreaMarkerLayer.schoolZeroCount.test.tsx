import { describe, it, expect, vi } from 'vitest';

const divIconHtmlCalls: string[] = [];

vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn((opts: { html: string; className: string }) => {
      divIconHtmlCalls.push(opts.html);
      return { options: opts };
    }),
  },
}));

import { makeSingleAreaChildCard } from '../AreaMarkerLayer';
import { escapeHtml } from '@/lib/security';
import type { AreasNavigationChild } from '@/features/discover/navigation/useAreasNavigationJourney';

type MockDivIcon = { options: { html: string } };

/** Extracts the raw HTML string this file's mocked `L.divIcon` was called with. */
function htmlOf(icon: unknown): string {
  return (icon as MockDivIcon).options.html;
}

function baseChild(overrides: Partial<AreasNavigationChild> = {}): AreasNavigationChild {
  return {
    nodeKey: 'a:koramangala',
    nodeType: 'AREA',
    displayLabel: 'Koramangala',
    displayOrder: 1,
    listingCount: 42,
    schoolCount: 5,
    isLeafArea: true,
    matchingAreaCount: null,
    descendantAreaCount: null,
    representativeAreaKeys: [],
    bounds: null,
    bearingDegrees: null,
    ...overrides,
  };
}

describe('AreaDestinationMarkerLayer zero-school rendering', () => {
  it('renders "0 schools" exactly once and includes listing count for a zero-school child in Schools journey', () => {
    const zeroSchoolChild: AreasNavigationChild = {
      nodeKey: 'a:koramangala',
      nodeType: 'AREA',
      displayLabel: 'Koramangala',
      displayOrder: 1,
      listingCount: 42,
      schoolCount: 0,
      isLeafArea: true,
      matchingAreaCount: null,
      descendantAreaCount: null,
      representativeAreaKeys: [],
      bounds: null,
      bearingDegrees: null,
    };

    const icon = makeSingleAreaChildCard(zeroSchoolChild, false, false, 'schools');
    const html = htmlOf(icon);

    // Issue #2330 (AC5) — the known-zero school count is now the HERO METRIC
    // (mono digit + uppercase "SCHOOLS" unit label, two separate spans,
    // matching the design source's `navMarkerHTML`/`areaPinHTML` hero-count
    // shape), never omitted, and never rendered as a bare unlabelled "0".
    // The aria-label still carries the lowercase "0 schools" grammar phrase
    // (AC11) for assistive tech, so ">0 schools<" now appears exactly once,
    // inside the aria-label only — not as a second, visually-duplicated copy.
    expect(html).toContain('aria-label="Koramangala, 0 schools, 42 listings"');
    const heroMatches = html.match(/>0<\/span>/g);
    expect(heroMatches).toHaveLength(1);
    expect(html).toMatch(/>0<\/span>[\s\S]{0,200}>SCHOOLS</);

    // Must contain the listing count (42 listings) since the zero state preserves useful listing metadata
    expect(html).toContain('42 listings');
  });
});

describe('AC11 — unavailable school count is OMITTED, never fabricated as a "0" hero metric', () => {
  it('schoolCount: null in Schools journey — no hero digit/unit is rendered, and no "0 schools" leaks into the aria-label', () => {
    const child: AreasNavigationChild = {
      nodeKey: 'a:koramangala',
      nodeType: 'AREA',
      displayLabel: 'Koramangala',
      displayOrder: 1,
      listingCount: 42,
      schoolCount: null,
      isLeafArea: true,
      matchingAreaCount: null,
      descendantAreaCount: null,
      representativeAreaKeys: [],
      bounds: null,
      bearingDegrees: null,
    };

    const icon = makeSingleAreaChildCard(child, false, false, 'schools');
    const html = htmlOf(icon);

    // No hero digit at all — an unavailable count must not render as a bare "0".
    expect(html).not.toMatch(/>0<\/span>/);
    expect(html).not.toContain('>SCHOOLS<');
    expect(html).not.toContain('>SCHOOL<');
    // The aria-label must not contain a fabricated "0 schools" phrase in any form.
    expect(html).not.toMatch(/0 schools?/i);
    expect(html).toContain('aria-label="Koramangala, 42 listings"');
  });

  it('schoolCount: undefined in Schools journey — same omission as null (unavailable, not zero)', () => {
    const child = baseChild({ schoolCount: undefined as unknown as null });
    const icon = makeSingleAreaChildCard(child, false, false, 'schools');
    const html = htmlOf(icon);

    expect(html).not.toMatch(/>0<\/span>/);
    expect(html).not.toContain('>SCHOOLS<');
    expect(html).not.toContain('>SCHOOL<');
    expect(html).not.toMatch(/0 schools?/i);
    expect(html).toContain('aria-label="Koramangala, 42 listings"');
  });
});

describe('AC5/AC12 — leaf (View homes/View schools) exact action copy + no grouping metadata', () => {
  it('View-homes (areas journey): footer copy is exactly "View homes", never the old "Tap to view homes" caption', () => {
    const child = baseChild();
    const icon = makeSingleAreaChildCard(child, false, false, 'areas');
    const html = htmlOf(icon);
    expect(html).toContain('>View homes<');
    expect(html).not.toContain('View schools');
    expect(html).not.toContain('Tap to view');
  });

  it('View-schools (schools journey): footer copy is exactly "View schools", never the old "Tap to view schools" caption', () => {
    const child = baseChild();
    const icon = makeSingleAreaChildCard(child, false, false, 'schools');
    const html = htmlOf(icon);
    expect(html).toContain('>View schools<');
    expect(html).not.toContain('>View homes<');
    expect(html).not.toContain('Tap to view');
  });

  it('the leaf card never carries grouping/cluster metadata — a real AREA node, not an ad-hoc client-side group', () => {
    const child = baseChild();
    const areasHtml = htmlOf(makeSingleAreaChildCard(child, false, false, 'areas'));
    const schoolsHtml = htmlOf(makeSingleAreaChildCard(child, false, false, 'schools'));
    for (const html of [areasHtml, schoolsHtml]) {
      expect(html).not.toMatch(/areas with matches/);
      expect(html).not.toMatch(/destinations?/i);
      expect(html).not.toMatch(/\+\d+\s*(nearby)?\s*areas?/i);
      // The footer action copy is always the fixed literal string — never a
      // dynamic count interpolated into the label itself.
      expect(html).not.toMatch(/View (homes|schools)\s*\(\d/);
    }
  });
});

describe('AC13 — leaf long-name clamp, accessible title, and injection-shaped-name escaping', () => {
  it('a long two-line displayLabel clamps visually but keeps the FULL name in title/aria-label, escaped', () => {
    const longLabel = 'Really Very Extremely Long Bangalore Locality Name';
    const child = baseChild({ displayLabel: longLabel });
    const icon = makeSingleAreaChildCard(child, false, false, 'areas');
    const html = htmlOf(icon);

    expect(html).toContain('-webkit-line-clamp:2');
    expect(html).not.toMatch(new RegExp(`>${longLabel}<`));
    expect(html).toContain(`title="${escapeHtml(longLabel)}"`);
    expect(html).toContain(`aria-label="${escapeHtml(longLabel)}`);
  });

  it('an injection-shaped displayLabel is fully escaped — never a raw <img> or unescaped quote reaches the card', () => {
    const MALICIOUS = '<img src=x onerror=alert(1)>';
    const child = baseChild({ displayLabel: MALICIOUS });
    const icon = makeSingleAreaChildCard(child, false, false, 'areas');
    const html = htmlOf(icon);

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain(escapeHtml(MALICIOUS));
  });
});
