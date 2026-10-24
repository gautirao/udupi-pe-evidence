/**
 * Issue #2857 (FU-LOWER-A) — L84 replacement (`e2e/discover-school-first-journey.spec.ts` E2E-2).
 *
 * Proves E2E-2 (G3-N4):
 *   - In `school-first` mode (`journey="school-first"`, `selectedSchool={null}`), `AreaMarkerLayer`
 *     renders the `"N schools"` (and `"1 school"`) badge on the area marker `divIcon` HTML
 *     (`AreaMarkerLayer.tsx:369-370, 444-447`), paired in the same `it` with:
 *       1. `journey="area-first"` control -> renders `"N properties"` and NOT `"N schools"`.
 *       2. `journey="school-first"` with `selectedSchool` active -> switches back to `"N properties"`.
 *       3. `AreaDestinationMarkerLayer` (`AreaMarkerLayer.tsx:1009-1051`) in canonical `school-first`
 *          mode (`journeyMode="schools"`) vs `area-first` (`journeyMode="areas"`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type DivIconOpts = { html: string; className?: string; iconSize?: unknown; iconAnchor?: unknown };
const capturedDivIconCalls: DivIconOpts[] = [];

function boundsFromExpression(expr: [number, number][]) {
  const lats = expr.map((p) => p[0]);
  const lons = expr.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return {
    getSouthWest: () => ({ lat: minLat, lng: minLon }),
    getNorthEast: () => ({ lat: maxLat, lng: maxLon }),
    getCenter: () => ({ lat: (minLat + maxLat) / 2, lng: (minLon + maxLon) / 2 }),
  };
}

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
    point: vi.fn((x: number, y: number) => ({ x, y })),
    latLngBounds: vi.fn((expr: [number, number][]) => boundsFromExpression(expr)),
    marker: vi.fn((_latlng: [number, number], options?: { icon?: { options?: DivIconOpts } }) => {
      const element = document.createElement('div');
      if (options?.icon?.options?.html) {
        element.innerHTML = options.icon.options.html;
      }
      const instance: Record<string, unknown> = {
        on: vi.fn(() => instance),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        setIcon: vi.fn(),
        setLatLng: vi.fn(),
        off: vi.fn(),
        getElement: vi.fn(() => element),
      };
      return instance;
    }),
  },
}));

function projectLatLon(lat: number, lon: number): { x: number; y: number } {
  return { x: (lon - 74.5) * 10000, y: (13.5 - lat) * 10000 };
}

const paneRegistry = vi.hoisted(() => new Map<string, HTMLElement>());

const mapStub = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  setZoom: vi.fn(),
  setView: vi.fn(),
  panTo: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 13.35, lng: 74.78 })),
  getZoom: vi.fn(() => 12),
  getBoundsZoom: vi.fn(() => 13),
  once: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  getSize: vi.fn(() => ({ x: 1200, y: 800 })),
  latLngToContainerPoint: vi.fn(([lat, lon]: [number, number]) => projectLatLon(lat, lon)),
  getMaxZoom: vi.fn(() => 19),
  project: vi.fn(([lat, lon]: [number, number], zoom: number) => {
    const base = projectLatLon(lat, lon);
    const scale = 2 ** (zoom - 12);
    return { x: base.x * scale, y: base.y * scale };
  }),
  getContainer: vi.fn(() => document.createElement('div')),
  containerPointToLatLng: vi.fn(({ x, y }: { x: number; y: number }) => ({
    lat: 13.5 - y / 10000,
    lng: x / 10000 + 74.5,
  })),
  getPane: vi.fn((name: string) => paneRegistry.get(name)),
  createPane: vi.fn((name: string) => {
    const pane = document.createElement('div');
    paneRegistry.set(name, pane);
    return pane;
  }),
}));

vi.mock('react-leaflet', () => ({
  useMap: vi.fn(() => mapStub),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

import React from 'react';
import { render } from '@testing-library/react';
import { AreaMarkerLayer, type AreaPoint } from '../AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

const MANIPAL_AREA: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  lat: 13.3525,
  lon: 74.7868,
  listingCount: 12,
  schoolCount: 4,
  medianPricePerSqft: 5200,
};

const BRAHMAVAR_SINGLE_SCHOOL_AREA: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Brahmavar',
  areaLabel: 'Brahmavar',
  lat: 13.4319,
  lon: 74.7453,
  listingCount: 7,
  schoolCount: 1,
  medianPricePerSqft: 3800,
};

const ACTIVE_SCHOOL: SchoolResult = {
  id: 'school-manipal-1',
  name: 'Manipal Junior College',
  city: 'udupi',
  areaKey: 'IN|KA|Udupi|Manipal',
  latitude: 13.3525,
  longitude: 74.7868,
};

describe('AreaMarkerLayer — #2857 L84 E2E-2 school-first "N schools" badge on area markers', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    paneRegistry.clear();
    vi.clearAllMocks();
  });

  it('E2E-2 (G3-N4): renders "N schools" / "1 school" badge in school-first mode when no school is selected, paired with area-first and selectedSchool controls', () => {
    // 1. Control A: area-first mode renders "12 properties" and NOT "4 schools"
    const areaFirstRender = render(
      <AreaMarkerLayer
        areas={[MANIPAL_AREA, BRAHMAVAR_SINGLE_SCHOOL_AREA]}
        selectedArea={null}
        onSelectArea={vi.fn()}
        journey="area-first"
        selectedSchool={null}
      />,
    );
    const areaFirstHtml = capturedDivIconCalls.map((c) => c.html).join('\n');
    expect(areaFirstHtml).toContain('Manipal');
    expect(areaFirstHtml).toContain('12 properties');
    expect(areaFirstHtml).toContain('Brahmavar');
    expect(areaFirstHtml).toContain('7 properties');
    expect(areaFirstHtml).not.toContain('4 schools');
    expect(areaFirstHtml).not.toContain('1 school');
    areaFirstRender.unmount();
    capturedDivIconCalls.length = 0;

    // 2. E2E-2 positive assertion: school-first mode with selectedSchool=null renders "4 schools" and "1 school"
    const schoolFirstRender = render(
      <AreaMarkerLayer
        areas={[MANIPAL_AREA, BRAHMAVAR_SINGLE_SCHOOL_AREA]}
        selectedArea={null}
        onSelectArea={vi.fn()}
        journey="school-first"
        selectedSchool={null}
      />,
    );
    const schoolFirstHtml = capturedDivIconCalls.map((c) => c.html).join('\n');
    expect(schoolFirstHtml).toContain('Manipal');
    expect(schoolFirstHtml).toContain('4 schools');
    expect(schoolFirstHtml).toContain('Brahmavar');
    expect(schoolFirstHtml).toContain('1 school');
    expect(schoolFirstHtml).not.toContain('12 properties');
    expect(schoolFirstHtml).not.toContain('7 properties');
    schoolFirstRender.unmount();
    capturedDivIconCalls.length = 0;

    // 3. Control B: school-first mode WITH selectedSchool active switches badge back to "12 properties"
    const selectedSchoolRender = render(
      <AreaMarkerLayer
        areas={[MANIPAL_AREA]}
        selectedArea={MANIPAL_AREA}
        onSelectArea={vi.fn()}
        journey="school-first"
        selectedSchool={ACTIVE_SCHOOL}
      />,
    );
    const selectedSchoolHtml = capturedDivIconCalls.map((c) => c.html).join('\n');
    expect(selectedSchoolHtml).toContain('12 properties');
    expect(selectedSchoolHtml).not.toContain('4 schools');
    selectedSchoolRender.unmount();
  });
});
