/**
 * Unit tests for AreaMarkerLayer — focusedGroupAreas opacity behaviour
 *
 * Strategy: AreaMarkerLayer uses L.divIcon to build HTML and L.marker to place it.
 * We capture the HTML string passed to L.divIcon and assert on inline style values,
 * matching the pattern established in PropertyMap.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Capture divIcon calls ────────────────────────────────────────────────────

type DivIconOpts = { html: string; className?: string; iconSize?: unknown; iconAnchor?: unknown };
const capturedDivIconCalls: DivIconOpts[] = [];

// ─── Mocks (must be declared before imports) ──────────────────────────────────

vi.mock('leaflet', () => ({
  default: {
    Icon: {
      Default: {
        prototype: {},
        mergeOptions: vi.fn(),
      },
    },
    divIcon: vi.fn((opts: DivIconOpts) => {
      capturedDivIconCalls.push(opts);
      return { options: opts };
    }),
    marker: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    })),
  },
}));

vi.mock('react-leaflet', () => ({
  useMap: vi.fn(() => ({
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    getZoom: vi.fn(() => 11),
    once: vi.fn(),
  })),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import React from 'react';
import { render } from '@testing-library/react';
import { AreaMarkerLayer } from '../AreaMarkerLayer';
import type { AreaPoint } from '../AreaMarkerLayer';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeArea(areaKey: string, overrides: Partial<AreaPoint> = {}): AreaPoint {
  return {
    areaKey,
    areaLabel: areaKey,
    geo_center_lat: 13.34,
    geo_center_lon: 74.74,
    bbox: [[13.3, 74.7], [13.4, 74.8]],
    listingCount: 5,
    ...overrides,
  };
}

const AREA_A = makeArea('area-a');
const AREA_B = makeArea('area-b');
const AREA_C = makeArea('area-c');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract the inline opacity value from a captured divIcon html string. */
function extractOpacity(html: string): string | null {
  const match = /opacity:([\d.]+)/.exec(html);
  return match ? match[1] : null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AreaMarkerLayer — focusedGroupAreas prop', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
  });

  it('renders all markers at opacity 1.0 when focusedGroupAreas is undefined', () => {
    render(
      <AreaMarkerLayer
        areas={[AREA_A, AREA_B, AREA_C]}
        focusedGroupAreas={undefined}
      />,
    );

    expect(capturedDivIconCalls).toHaveLength(3);
    for (const call of capturedDivIconCalls) {
      expect(extractOpacity(call.html)).toBe('1');
    }
  });

  it('renders group-member markers at opacity 1.0', () => {
    render(
      <AreaMarkerLayer
        areas={[AREA_A, AREA_B]}
        focusedGroupAreas={['area-a', 'area-b']}
      />,
    );

    expect(capturedDivIconCalls).toHaveLength(2);
    for (const call of capturedDivIconCalls) {
      expect(extractOpacity(call.html)).toBe('1');
    }
  });

  it('renders non-member markers at opacity 0.3 when focusedGroupAreas is provided', () => {
    render(
      <AreaMarkerLayer
        areas={[AREA_A, AREA_B, AREA_C]}
        focusedGroupAreas={['area-a']}
      />,
    );

    expect(capturedDivIconCalls).toHaveLength(3);

    // area-a is in the focused set → full opacity
    const aHtml = capturedDivIconCalls.find((c) => c.html.includes('area-a'))?.html ?? '';
    expect(extractOpacity(aHtml)).toBe('1');

    // area-b and area-c are not → dimmed
    const bHtml = capturedDivIconCalls.find((c) => c.html.includes('area-b'))?.html ?? '';
    expect(extractOpacity(bHtml)).toBe('0.3');

    const cHtml = capturedDivIconCalls.find((c) => c.html.includes('area-c'))?.html ?? '';
    expect(extractOpacity(cHtml)).toBe('0.3');
  });

  it('renders all markers dimmed when focusedGroupAreas is empty array', () => {
    render(
      <AreaMarkerLayer
        areas={[AREA_A, AREA_B]}
        focusedGroupAreas={[]}
      />,
    );

    expect(capturedDivIconCalls).toHaveLength(2);
    for (const call of capturedDivIconCalls) {
      expect(extractOpacity(call.html)).toBe('0.3');
    }
  });

  it('dimmed markers have pointer-events:auto (remain clickable)', () => {
    render(
      <AreaMarkerLayer
        areas={[AREA_B]}
        focusedGroupAreas={['area-a']} // area-b is not in group
      />,
    );

    expect(capturedDivIconCalls).toHaveLength(1);
    const html = capturedDivIconCalls[0].html;
    expect(html).toContain('pointer-events:auto');
    expect(extractOpacity(html)).toBe('0.3');
  });

  it('full-opacity markers also have pointer-events:auto', () => {
    render(
      <AreaMarkerLayer
        areas={[AREA_A]}
        focusedGroupAreas={['area-a']}
      />,
    );

    expect(capturedDivIconCalls).toHaveLength(1);
    const html = capturedDivIconCalls[0].html;
    expect(html).toContain('pointer-events:auto');
    expect(extractOpacity(html)).toBe('1');
  });

  it('regression: focusedGroupAreas=undefined → all 3 markers at opacity 1', () => {
    render(
      <AreaMarkerLayer
        areas={[AREA_A, AREA_B, AREA_C]}
      />,
    );

    expect(capturedDivIconCalls).toHaveLength(3);
    for (const call of capturedDivIconCalls) {
      const opacity = extractOpacity(call.html);
      expect(opacity).toBe('1');
    }
  });
});

// ─── Journey-aware badge logic ────────────────────────────────────────────────

describe('AreaMarkerLayer — journey-aware badge', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
  });

  // ── school-first, no school selected ──────────────────────────────────────

  it('school-first + no selectedSchool + schoolCount=5 → shows "5 schools"', () => {
    const area = makeArea('area-x', { schoolCount: 5, listingCount: 10 });
    render(<AreaMarkerLayer areas={[area]} journey="school-first" selectedSchool={null} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('5 schools');
    expect(capturedDivIconCalls[0].html).not.toContain('properties');
  });

  it('school-first + no selectedSchool + schoolCount=1 → shows "1 school" (singular)', () => {
    const area = makeArea('area-x', { schoolCount: 1, listingCount: 10 });
    render(<AreaMarkerLayer areas={[area]} journey="school-first" selectedSchool={null} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('1 school');
    expect(capturedDivIconCalls[0].html).not.toContain('1 schools');
    expect(capturedDivIconCalls[0].html).not.toContain('properties');
  });

  it('school-first + no selectedSchool + schoolCount=0 → shows "0 schools" (zero is NOT hidden)', () => {
    const area = makeArea('area-x', { schoolCount: 0, listingCount: 10 });
    render(<AreaMarkerLayer areas={[area]} journey="school-first" selectedSchool={null} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('0 schools');
    expect(capturedDivIconCalls[0].html).not.toContain('properties');
  });

  it('school-first + no selectedSchool + schoolCount=null → falls back to property count', () => {
    const area = makeArea('area-x', { schoolCount: null, listingCount: 7 });
    render(<AreaMarkerLayer areas={[area]} journey="school-first" selectedSchool={null} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('7 properties');
    expect(capturedDivIconCalls[0].html).not.toContain('schools');
  });

  it('school-first + no selectedSchool + schoolCount=undefined → falls back to property count', () => {
    const area = makeArea('area-x', { listingCount: 3 }); // schoolCount deliberately absent
    render(<AreaMarkerLayer areas={[area]} journey="school-first" selectedSchool={null} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('3 properties');
    expect(capturedDivIconCalls[0].html).not.toContain('schools');
  });

  // ── school selected — should revert to property count ─────────────────────

  it('school-first + selectedSchool set → falls back to property count badge', () => {
    const area = makeArea('area-x', { schoolCount: 5, listingCount: 10 });
    const fakeSchool = { id: 's1', name: 'Test School' };
    render(<AreaMarkerLayer areas={[area]} journey="school-first" selectedSchool={fakeSchool} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('10 properties');
    expect(capturedDivIconCalls[0].html).not.toContain('schools');
  });

  // ── area-first journey — regression ───────────────────────────────────────

  it('area-first journey → shows property count regardless of schoolCount', () => {
    const area = makeArea('area-x', { schoolCount: 8, listingCount: 12 });
    render(<AreaMarkerLayer areas={[area]} journey="area-first" selectedSchool={null} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('12 properties');
    expect(capturedDivIconCalls[0].html).not.toContain('schools');
  });

  it('no journey (undefined) → shows property count (existing default)', () => {
    const area = makeArea('area-x', { schoolCount: 4, listingCount: 6 });
    render(<AreaMarkerLayer areas={[area]} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('6 properties');
    expect(capturedDivIconCalls[0].html).not.toContain('schools');
  });

  // ── pluralization for property count ──────────────────────────────────────

  it('listingCount=1 → shows "1 property" (singular)', () => {
    const area = makeArea('area-x', { listingCount: 1 });
    render(<AreaMarkerLayer areas={[area]} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('1 property');
    expect(capturedDivIconCalls[0].html).not.toContain('1 properties');
  });

  it('listingCount=2 → shows "2 properties" (plural)', () => {
    const area = makeArea('area-x', { listingCount: 2 });
    render(<AreaMarkerLayer areas={[area]} />);

    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].html).toContain('2 properties');
  });
});
