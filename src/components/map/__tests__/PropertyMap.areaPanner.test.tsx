/**
 * Issue #1069 — AreaPanner must clamp `maxZoom` to AREA_LAYER_MAX_ZOOM (=12)
 * when fitBounds is invoked with a synthetic group-bounds AreaPoint.
 *
 * Without the clamp, narrow groups (e.g. University Belt: Manipal + Katapadi
 * ~4 km apart) fit at zoom ~14, which then exceeds MapDiscovery's
 * `mapZoom <= AREA_LAYER_MAX_ZOOM` filter and hides every area marker the
 * user was meant to see.
 *
 * For real (non-synthetic) areas the behaviour must remain unchanged
 * (maxZoom=16) so single-area focus continues to frame tightly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import {
  GROUP_BOUNDS_SYNTHETIC_KEY,
} from '@/utils/discoverGroupBounds';

// Shape of the Leaflet LatLngBounds stub returned by mapStub.getBounds(). Declared
// explicitly (rather than left to inference) so getBounds' factory return type widens
// to `number`, not the literal `14 | 13 | 75 | 74` TS would otherwise infer from the
// vi.fn() initializer — that literal-narrowed inference is what previously broke
// `mapStub.getBounds.mockReturnValue(wideViewport)` below (TS2345).
type LatLngBoundsStub = {
  getNorth: () => number;
  getSouth: () => number;
  getEast: () => number;
  getWest: () => number;
};

// ─── Hoisted stubs ─────────────────────────────────────────────
const mapStub = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  getZoom: vi.fn(() => 11),
  getBounds: vi.fn(
    (): LatLngBoundsStub => ({
      getNorth: () => 14,
      getSouth: () => 13,
      getEast: () => 75,
      getWest: () => 74,
    }),
  ),
  getContainer: vi.fn(() => document.body),
  on: vi.fn(),
  off: vi.fn(),
  invalidateSize: vi.fn(),
  setView: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 13.3409, lng: 74.7421 })),
}));

// ─── Mocks (must come before importing PropertyMap) ───────────
vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({ on: vi.fn().mockReturnThis() })),
    markerClusterGroup: vi.fn(() => ({ addLayer: vi.fn() })),
    point: vi.fn((x: number, y: number) => ({ x, y })),
  },
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.Default.css', () => ({}));
vi.mock('leaflet.markercluster', () => ({}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  ZoomControl: () => null,
  Marker: () => null,
  Circle: () => null,
  Tooltip: () => null,
  useMap: () => mapStub,
}));

vi.mock('@/components/map/DrawControl', () => ({ DrawControl: () => null }));
vi.mock('@/components/map/AreaMarkerLayer', () => ({
  AreaMarkerLayer: () => null,
}));
vi.mock('@/components/map/SchoolMarkerLayer', () => ({
  SchoolMarkerLayer: () => null,
}));
vi.mock('@/dev/ScaleHud', () => ({ ScaleHud: () => null }));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Imports after mocks ───────────────────────────────────────
import { PropertyMap, AREA_PANNER_GROUP_MAX_ZOOM } from '@/components/map/PropertyMap';

const baseProps = {
  listings: [],
  cityCenter: [13.3409, 74.7421] as [number, number],
  cityZoom: 11,
  resetMapTick: 0,
  areas: [],
};

const renderWithPan = (panToArea: AreaPoint | null) =>
  render(<PropertyMap {...baseProps} panToArea={panToArea} />);

describe('Issue #1069 — AreaPanner.fitBounds maxZoom clamp', () => {
  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
  });

  it('clamps maxZoom to AREA_PANNER_GROUP_MAX_ZOOM for synthetic group bounds', () => {
    // University-Belt-shaped bbox (Manipal + Katapadi ~4 km apart)
    const groupBounds: AreaPoint = {
      areaKey: GROUP_BOUNDS_SYNTHETIC_KEY,
      areaLabel: '',
      geo_center_lat: 13.355,
      geo_center_lon: 74.79,
      bbox: [[13.34, 74.76], [13.37, 74.82]],
    };

    renderWithPan(groupBounds);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    const [bbox, opts] = mapStub.fitBounds.mock.calls[0];
    expect(bbox).toEqual(groupBounds.bbox);
    expect(opts).toEqual({
      padding: [40, 40],
      maxZoom: AREA_PANNER_GROUP_MAX_ZOOM,
    });
    expect(AREA_PANNER_GROUP_MAX_ZOOM).toBe(12);
  });

  it('keeps maxZoom=16 for real (non-synthetic) area focus', () => {
    const realArea: AreaPoint = {
      areaKey: 'IN|KA|Udupi|Manipal',
      areaLabel: 'Manipal',
      geo_center_lat: 13.3525,
      geo_center_lon: 74.7869,
      bbox: [[13.34, 74.78], [13.37, 74.82]],
    };

    renderWithPan(realArea);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    const [, opts] = mapStub.fitBounds.mock.calls[0];
    expect(opts).toEqual({ padding: [40, 40], maxZoom: 16 });
  });

  it('does not call fitBounds when panToArea is null', () => {
    renderWithPan(null);
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
  });
});

// ─── Drift-guard ───────────────────────────────────────────────
// Issue #1882 (Track A PR2 Slice S1) — re-anchored to the canonical
// src/lib/map/zoomPolicy.ts source. MapDiscovery.tsx no longer declares a
// private AREA_LAYER_MAX_ZOOM const (it now imports the shared constant), so
// the previous regex-scan-of-MapDiscovery's-source mechanism can no longer
// find a match. Importing the canonical constant directly is strictly
// stronger (a real reference, not a textual heuristic) and does not weaken
// the guard: AREA_PANNER_GROUP_MAX_ZOOM must still equal the shared value.
import { AREA_LAYER_MAX_ZOOM } from '@/lib/map/zoomPolicy';

describe('Issue #1069 drift-guard — AREA_PANNER_GROUP_MAX_ZOOM matches AREA_LAYER_MAX_ZOOM', () => {
  it('PropertyMap clamp constant matches the canonical zoomPolicy threshold', () => {
    expect(AREA_LAYER_MAX_ZOOM).toBe(AREA_PANNER_GROUP_MAX_ZOOM);
  });
});

// ─── Issue #1173 — SchoolFocusPanner radius-change zoom stability ─────────────
// On a radius CHANGE for the already-focused school, SchoolFocusPanner must
// PRESERVE the current zoom/center when the new radius circle still fits the
// current viewport, and REFIT (fitBounds) only when the circle would be clipped.
// The INITIAL focus and the radius=0 flyTo path stay unchanged.
//
// Deterministic only: no waitForTimeout. We drive schoolFocusTick / radiusKm via
// rerender and control the imperative viewport via mapStub.getBounds.

const SCHOOL_LAT = 13.5;
const SCHOOL_LON = 74.5;

// 3 km circle around (13.5, 74.5): deltaLat ≈ 0.027, deltaLon ≈ 0.028.
// "Wide" viewport (S13/W74/N14/E75) contains it comfortably; "tight" clips it.
const wideViewport: LatLngBoundsStub = {
  getNorth: () => 14,
  getSouth: () => 13,
  getEast: () => 75,
  getWest: () => 74,
};
const tightViewport: LatLngBoundsStub = {
  getNorth: () => 13.505,
  getSouth: () => 13.495,
  getEast: () => 74.505,
  getWest: () => 74.495,
};

const schoolBase = {
  listings: [],
  cityCenter: [13.3409, 74.7421] as [number, number],
  cityZoom: 11,
  resetMapTick: 0,
  areas: [],
};

const renderSchoolFocus = (props: {
  schoolFocusTick: number;
  schoolFocusRadiusKm?: number;
}) =>
  render(
    <PropertyMap
      {...schoolBase}
      schoolFocusTick={props.schoolFocusTick}
      schoolFocusLat={SCHOOL_LAT}
      schoolFocusLon={SCHOOL_LON}
      schoolFocusRadiusKm={props.schoolFocusRadiusKm}
    />,
  );

describe('Issue #1173 — SchoolFocusPanner radius-change zoom stability', () => {
  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    mapStub.setView.mockClear();
    mapStub.getBounds.mockReset();
    mapStub.getBounds.mockReturnValue(wideViewport);
  });

  it('AC5: initial school focus fits (fitBounds called once on first tick)', () => {
    renderSchoolFocus({ schoolFocusTick: 1, schoolFocusRadiusKm: 3 });
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('AC1: radius change PRESERVES zoom/center when the new circle fits — no fit/setView/flyTo', () => {
    // Initial focus at 3 km (tick=1) → one fitBounds.
    const { rerender } = renderSchoolFocus({ schoolFocusTick: 1, schoolFocusRadiusKm: 3 });
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    mapStub.fitBounds.mockClear();

    // Radius 3 → 5 km (tick=2). 5 km circle still fits inside the wide viewport.
    rerender(
      <PropertyMap
        {...schoolBase}
        schoolFocusTick={2}
        schoolFocusLat={SCHOOL_LAT}
        schoolFocusLon={SCHOOL_LON}
        schoolFocusRadiusKm={5}
      />,
    );

    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.setView).not.toHaveBeenCalled();
    expect(mapStub.flyTo).not.toHaveBeenCalled();
  });

  it('AC2: radius change REFITS exactly once when the new circle would be clipped', () => {
    // Initial focus at 3 km against a wide viewport (tick=1).
    const { rerender } = renderSchoolFocus({ schoolFocusTick: 1, schoolFocusRadiusKm: 3 });
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    mapStub.fitBounds.mockClear();

    // Now the viewport is tight (user zoomed in), and radius grows 3 → 10 km.
    mapStub.getBounds.mockReturnValue(tightViewport);
    rerender(
      <PropertyMap
        {...schoolBase}
        schoolFocusTick={2}
        schoolFocusLat={SCHOOL_LAT}
        schoolFocusLon={SCHOOL_LON}
        schoolFocusRadiusKm={10}
      />,
    );

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('AC6 fit-loop guard: after a refit, a viewport move with the same radius does NOT refit again', () => {
    const { rerender } = renderSchoolFocus({ schoolFocusTick: 1, schoolFocusRadiusKm: 3 });
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);

    // Simulate the moveend that the fit itself would emit: re-render with the
    // SAME tick (the decision is keyed on the radius/tick change, not on map
    // movement, and there is no moveend listener). Call count must stay 1.
    rerender(
      <PropertyMap
        {...schoolBase}
        schoolFocusTick={1}
        schoolFocusLat={SCHOOL_LAT}
        schoolFocusLon={SCHOOL_LON}
        schoolFocusRadiusKm={3}
      />,
    );

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('AC6 idempotent: re-render with an unchanged radius and a higher tick but fitting circle does NOT refit', () => {
    const { rerender } = renderSchoolFocus({ schoolFocusTick: 1, schoolFocusRadiusKm: 3 });
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    mapStub.fitBounds.mockClear();

    // Same school, same 3 km radius, fresh tick (e.g. Back → re-select). The
    // circle still fits the wide viewport → preserve, no refit.
    rerender(
      <PropertyMap
        {...schoolBase}
        schoolFocusTick={2}
        schoolFocusLat={SCHOOL_LAT}
        schoolFocusLon={SCHOOL_LON}
        schoolFocusRadiusKm={3}
      />,
    );

    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.setView).not.toHaveBeenCalled();
    expect(mapStub.flyTo).not.toHaveBeenCalled();
  });

  it('AC5: a NEW school (centre change) always refits even if its circle would fit the current viewport', () => {
    const { rerender } = renderSchoolFocus({ schoolFocusTick: 1, schoolFocusRadiusKm: 3 });
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    mapStub.fitBounds.mockClear();

    // Different school centre at tick=2 with a fitting 3 km radius. Because the
    // centre changed, this is an INITIAL focus, not a radius change → always fit.
    rerender(
      <PropertyMap
        {...schoolBase}
        schoolFocusTick={2}
        schoolFocusLat={13.6}
        schoolFocusLon={74.6}
        schoolFocusRadiusKm={3}
      />,
    );

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('radius=0 path is unaffected: flyTo to school centre at zoom 14, no fitBounds', () => {
    renderSchoolFocus({ schoolFocusTick: 1, schoolFocusRadiusKm: 0 });
    expect(mapStub.flyTo).toHaveBeenCalledTimes(1);
    expect(mapStub.flyTo).toHaveBeenCalledWith([SCHOOL_LAT, SCHOOL_LON], 14, { duration: 1 });
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
  });

  it('AC5: panner dormant when schoolFocusTick is 0 (anon school-first, no schoolId)', () => {
    renderSchoolFocus({ schoolFocusTick: 0, schoolFocusRadiusKm: 3 });
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.flyTo).not.toHaveBeenCalled();
    expect(mapStub.setView).not.toHaveBeenCalled();
  });

  // Phase 7B regression: clear → RE-SELECT THE SAME school must REFIT (initial
  // focus), not PRESERVE the zoomed-out city view. The clear (lat/lon → null)
  // resets the persisted focus centre; re-selecting the same school therefore
  // reads as an initial focus, not a same-centre radius change. The viewport is
  // wide (the small circle would FIT) precisely to prove the fix: before the
  // reset, isRadiusChange was wrongly true and the fitting circle hit the
  // PRESERVE branch → no refit (the bug). Note MapDiscovery does NOT increment
  // schoolFocusTick on clear (its tick effect early-returns when lat/lon are
  // null), which is why the clear is represented here as a re-render with the
  // SAME tick but null lat/lon.
  it('clear → re-select SAME school REFITS (treated as initial focus, not a radius-change preserve)', () => {
    // Initial focus on the school at 3 km (tick=1) → one fitBounds.
    const { rerender } = renderSchoolFocus({ schoolFocusTick: 1, schoolFocusRadiusKm: 3 });
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    mapStub.fitBounds.mockClear();

    // Clear the selected school: lat/lon → null. MapDiscovery does not bump the
    // tick on clear, so the tick stays at 1; the panner must still observe the
    // null lat/lon and reset its persisted focus centre.
    rerender(
      <PropertyMap
        {...schoolBase}
        schoolFocusTick={1}
        schoolFocusLat={undefined}
        schoolFocusLon={undefined}
        schoolFocusRadiusKm={3}
      />,
    );
    expect(mapStub.fitBounds).not.toHaveBeenCalled();

    // Re-select THE SAME school (same lat/lon, fresh tick=2) against a WIDE
    // viewport in which the 3 km circle would fit. Without the clear-reset this
    // is mis-read as a same-centre radius change and PRESERVED (the regression);
    // with the reset it is an initial focus and must REFIT.
    rerender(
      <PropertyMap
        {...schoolBase}
        schoolFocusTick={2}
        schoolFocusLat={SCHOOL_LAT}
        schoolFocusLon={SCHOOL_LON}
        schoolFocusRadiusKm={3}
      />,
    );

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
  });
});
