/**
 * Unit tests for SchoolMarkerLayer — Issue #1157 rev-5 DEFECT A.
 *
 * The layer renders Leaflet markers imperatively (L.marker(...).addTo(map)) inside
 * a useEffect, mirroring AreaMarkerLayer. We mock `leaflet` so each L.marker call is
 * captured, then assert how many markers are placed for a given `showSchoolMarkers`
 * value.
 *
 * Strategy mirrors AreaMarkerLayer.test.tsx (capture L.marker / L.divIcon calls;
 * mock react-leaflet's useMap).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Capture L.marker calls ───────────────────────────────────────────────────

type MarkerCall = { latlng: [number, number]; opts?: Record<string, unknown> };
const capturedMarkerCalls: MarkerCall[] = [];

// ─── Mocks (must be declared before imports) ──────────────────────────────────

vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn((opts: unknown) => ({ options: opts })),
    marker: vi.fn((latlng: [number, number], opts?: Record<string, unknown>) => {
      capturedMarkerCalls.push({ latlng, opts });
      return {
        bindTooltip: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
      };
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

// escapeHtml is a pure helper — no need to mock, but isolate from any side effects.
vi.mock('@/lib/security', () => ({
  escapeHtml: (s: string) => s,
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { render } from '@testing-library/react';
import { SchoolMarkerLayer } from '../SchoolMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSchool(id: string, overrides: Partial<SchoolResult> = {}): SchoolResult {
  return {
    id,
    name: `School ${id}`,
    board: 'CBSE',
    boardType: null,
    latitude: 13.35,
    longitude: 74.79,
    address: 'Udupi',
    distanceKm: 0.5,
    ...overrides,
  };
}

const SCHOOL_A = makeSchool('a', { latitude: 13.35, longitude: 74.79 });
const SCHOOL_B = makeSchool('b', { latitude: 13.36, longitude: 74.80 });
const SCHOOL_C = makeSchool('c', { latitude: 13.37, longitude: 74.81 });

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('SchoolMarkerLayer — showSchoolMarkers gate (DEFECT A)', () => {
  beforeEach(() => {
    capturedMarkerCalls.length = 0;
  });

  it('showSchoolMarkers=true renders a marker for each school passed', () => {
    render(
      <SchoolMarkerLayer
        schools={[SCHOOL_A, SCHOOL_B, SCHOOL_C]}
        showSchoolMarkers
        journey="area-first"
      />,
    );

    expect(capturedMarkerCalls).toHaveLength(3);
    expect(capturedMarkerCalls.map((c) => c.latlng)).toEqual([
      [13.35, 74.79],
      [13.36, 74.80],
      [13.37, 74.81],
    ]);
  });

  it('showSchoolMarkers=false renders no markers', () => {
    render(
      <SchoolMarkerLayer
        schools={[SCHOOL_A, SCHOOL_B, SCHOOL_C]}
        showSchoolMarkers={false}
        journey="area-first"
      />,
    );

    expect(capturedMarkerCalls).toHaveLength(0);
  });

  it('defaults to no markers when showSchoolMarkers is omitted', () => {
    render(<SchoolMarkerLayer schools={[SCHOOL_A]} journey="school-first" />);

    expect(capturedMarkerCalls).toHaveLength(0);
  });

  it('renders markers in the area-first sub-step (journey=area-first, showSchoolMarkers=true)', () => {
    // DEFECT A core case: area-first school-picking previously showed cards but no
    // markers because the layer was hard-gated to journey==='school-first'.
    render(
      <SchoolMarkerLayer
        schools={[SCHOOL_A, SCHOOL_B]}
        showSchoolMarkers
        journey="area-first"
      />,
    );

    expect(capturedMarkerCalls).toHaveLength(2);
  });

  it('focus mode: selectedSchoolId renders exactly one marker (the selected one)', () => {
    render(
      <SchoolMarkerLayer
        schools={[SCHOOL_A, SCHOOL_B, SCHOOL_C]}
        showSchoolMarkers
        journey="area-first"
        selectedSchoolId="b"
      />,
    );

    expect(capturedMarkerCalls).toHaveLength(1);
    expect(capturedMarkerCalls[0].latlng).toEqual([13.36, 74.80]);
  });

  it('showSchoolMarkers=true but empty schools renders no markers', () => {
    render(<SchoolMarkerLayer schools={[]} showSchoolMarkers journey="school-first" />);

    expect(capturedMarkerCalls).toHaveLength(0);
  });
});

// ─── Golden color guard (Issue #1954) ─────────────────────────────────────────
// schoolPinIcon is recolored from blue (#2563eb) to the plum design-system token,
// matching PropertyMap.tsx's schoolMarkerIcon + SchoolRadiusMapOverlay.tsx's legend
// swatch. This guards against a future edit silently reintroducing blue.
describe('SchoolMarkerLayer — schoolPinIcon colour (Issue #1954 golden guard)', () => {
  it('renders the schoolPinIcon html with the plum token and never the old blue hex', async () => {
    const L = (await import('leaflet')).default;
    const divIconMock = L.divIcon as unknown as ReturnType<typeof vi.fn>;
    const schoolPinCall = divIconMock.mock.calls.find(
      (call) => (call[0] as { className?: string }).className === 'school-pin',
    );
    expect(schoolPinCall).toBeDefined();
    const html = (schoolPinCall?.[0] as { html: string }).html;
    expect(html).toContain('hsl(var(--plum))');
    expect(html).not.toContain('#2563eb');
  });
});
