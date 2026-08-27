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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  remove: vi.fn(),
  // Issue #1943 Slice B — AreaPanner's hierarchy-fit branch calls
  // `map.project(latlng, zoom)` (Leaflet's own projection, injected
  // literally into resolveHierarchyCameraFit — risk R5). A simple
  // deterministic linear approximation is sufficient here: only the
  // RELATIVE placement/spacing of anchors at a given zoom matters to the
  // resolver's overlap/containment math, not real Mercator accuracy.
  project: vi.fn((latlng: [number, number], zoom: number) => {
    const scale = 2 ** zoom;
    return { x: (latlng[1] + 180) * scale, y: (90 - latlng[0]) * scale };
  }),
  // Issue #1943 Slice B (code review fix 2) — the canonicalNode branch reads
  // `map.getSize()` directly (no defensive fallback: production always has
  // it once `isMapSized()` has already gated entry into `applyFit`). Give
  // the stub a real, non-zero size so it exercises the same code path real
  // Leaflet does, rather than a window.innerWidth/innerHeight substitute
  // geometry a production map would never actually use.
  getSize: vi.fn(() => ({ x: 1440, y: 900 })),
  // Issue #1943 (Slice B, code review cycle 2, FIX 1) — the canonicalNode
  // branch's derived-minZoom floor calls `map.getBoundsZoom` directly. This
  // MUST be present (alongside `L.latLngBounds` below) for the guard at
  // PropertyMap.tsx's derivation site to actually execute — omitting either
  // was itself the FIX 1 defect (the derivation silently no-op'd, and every
  // canonicalNode test kept passing against the LEAF_FIT_MIN_ZOOM fallback
  // it was written to replace). Default value matches LEAF_FIT_MIN_ZOOM (13)
  // so pre-existing canonicalNode tests that don't care about the derived
  // floor keep observing the same numbers as before, while now genuinely
  // exercising the call.
  getBoundsZoom: vi.fn(() => 13),
}));

// ─── Mocks (must come before importing PropertyMap) ───────────
vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({ on: vi.fn().mockReturnThis() })),
    markerClusterGroup: vi.fn(() => ({ addLayer: vi.fn(), on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis() })),
    point: vi.fn((x: number, y: number) => ({ x, y })),
    // Issue #1943 (Slice B, code review cycle 2, FIX 1) — the canonicalNode
    // branch's derived-minZoom floor calls `L.latLngBounds(...)` before
    // `map.getBoundsZoom`. A real, minimal stand-in (min/max over the given
    // points) rather than an omission — omitting it was the FIX 1 defect:
    // the `typeof L.latLngBounds === 'function'` guard failed, so the
    // derivation never ran under test.
    latLngBounds: vi.fn((latlngs: [number, number][]) => {
      if (!latlngs || latlngs.length === 0) {
        return { isValid: () => false, getNorth: () => 0, getSouth: () => 0, getEast: () => 0, getWest: () => 0 };
      }
      const lats = latlngs.map((p) => p[0]);
      const lons = latlngs.map((p) => p[1]);
      return {
        isValid: () => true,
        getNorth: () => Math.max(...lats),
        getSouth: () => Math.min(...lats),
        getEast: () => Math.max(...lons),
        getWest: () => Math.min(...lons),
      };
    }),
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
  AreaDestinationMarkerLayer: () => null,
}));
vi.mock('@/components/map/SchoolMarkerLayer', () => ({
  SchoolMarkerLayer: () => null,
}));
vi.mock('@/dev/ScaleHud', () => ({ ScaleHud: () => null }));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Imports after mocks ───────────────────────────────────────
import { PropertyMap, AREA_PANNER_GROUP_MAX_ZOOM, narrowToLegibleZoomWindow } from '@/components/map/PropertyMap';
// Issue #1943 (Stage-B rework, TASK 1) — imported as a namespace so
// `vi.spyOn` can assert `narrowToLegibleZoomWindow` genuinely calls the SAME
// `clusterAreaMembers` the render layer (AreaMarkerLayer.tsx) uses, rather
// than re-implementing its own merge logic.
import * as areaClusteringModule from '@/features/discover/navigation/areaClustering';
// Issue #1943 Slice B (code review fix 3) — the resolver itself, used to
// independently compute an expected centre/zoom with the SAME inputs
// production feeds it, rather than re-deriving PropertyMap's internal math
// by hand in the test.
import { resolveHierarchyCameraFit } from '@/features/discover/navigation/hierarchyCameraFit';
import { LEAF_FIT_MIN_ZOOM, LEAF_FIT_MAX_ZOOM } from '@/shared/map/zoomPolicy';
// Issue #1943 (Slice B, code review cycle 2, FIX 1) — the same mocked `leaflet`
// module PropertyMap.tsx imports; used to assert `L.latLngBounds` call args
// directly (which envelope — node bbox vs. anchor union — actually fed
// `map.getBoundsZoom`) rather than re-deriving the bounds object by hand.
import L from 'leaflet';

const baseProps = {
  listings: [],
  cityCenter: [13.3409, 74.7421] as [number, number],
  cityZoom: 11,
  resetMapTick: 0,
  areas: [],
};

type SeqAreaPoint = AreaPoint & {
  seq?: number;
  reason?: 'group' | 'scope' | 'canonicalNode';
  // Issue #1823 (fix cycle 3) — mirrors the ref useDiscoverCameraOrchestration
  // attaches alongside seq/reason in production (publishPanToArea). Plain
  // `{ current: number }` here since these tests construct panToArea
  // directly rather than going through the hook.
  consumedSeqRef?: { current: number };
};

const renderWithPan = (panToArea: SeqAreaPoint | null) =>
  render(<PropertyMap {...baseProps} panToArea={panToArea} />);

// Issue #1943 Slice B — widened panToArea shape carrying the hierarchy
// camera-fit anchors, attached only on the canonicalNode publish.
type HierarchyAreaPoint = SeqAreaPoint & {
  hierarchyChildAnchors?: Array<{
    lat: number | null | undefined;
    lon: number | null | undefined;
    footprintWidthPx: number;
    footprintHeightPx: number;
  }> | null;
};

describe('Issue #1069 — AreaPanner.fitBounds maxZoom clamp', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    // Issue #1823 AC3 — AreaPanner padding is now responsive
    // (computeCameraPadding), not a hardcoded [40, 40]. Pin a desktop width
    // as this describe block's baseline; the dedicated responsive-padding
    // tests below cover both tiers explicitly.
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
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
    // PR #2128 final review (HIGH) — a single `padding: [x, y]` tuple is NOT
    // directional in Leaflet; AreaPanner now uses paddingTopLeft/
    // paddingBottomRight (bottomOcclusionPx defaults to 0 here, so both
    // corners carry the same [120, 40] tier).
    expect(opts).toEqual({
      paddingTopLeft: [120, 40],
      paddingBottomRight: [120, 40],
      maxZoom: AREA_PANNER_GROUP_MAX_ZOOM,
      // Issue #2143 (PR follow-up) — animate:false so the fit applies
      // synchronously (a Leaflet-animated fitBounds silently failed to
      // complete on a just-remounted container; see AreaPanner's own
      // comment for the confirmed mechanism).
      animate: false,
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
    expect(opts).toEqual({ paddingTopLeft: [120, 40], paddingBottomRight: [120, 40], maxZoom: 16, animate: false });
  });

  it('does not call fitBounds when panToArea is null', () => {
    renderWithPan(null);
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
  });

  it('Issue #1823 AC3 — uses mobile padding [40, 40] below the desktop breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', { value: 480, configurable: true });
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
    expect(opts).toEqual({ paddingTopLeft: [40, 40], paddingBottomRight: [40, 40], maxZoom: 16, animate: false });
  });

  it('PR #2128 final review (HIGH fix) — a nonzero bottomOcclusionPx prop adds ONLY to paddingBottomRight, leaving paddingTopLeft at the plain responsive tier', () => {
    const realArea: AreaPoint = {
      areaKey: 'IN|KA|Udupi|Manipal',
      areaLabel: 'Manipal',
      geo_center_lat: 13.3525,
      geo_center_lon: 74.7869,
      bbox: [[13.34, 74.78], [13.37, 74.82]],
    };

    render(<PropertyMap {...baseProps} panToArea={realArea} bottomOcclusionPx={150} />);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    const [, opts] = mapStub.fitBounds.mock.calls[0];
    // Desktop tier [120, 40] (innerWidth pinned to 1440 by this block's
    // beforeEach); the 150px occlusion adds ONLY to paddingBottomRight's
    // vertical component — a single `padding: [x, y]` tuple would apply to
    // BOTH corners (double cost), which is exactly the bug this fixes.
    expect(opts).toEqual({
      paddingTopLeft: [120, 40],
      paddingBottomRight: [120, 190],
      maxZoom: 16,
      animate: false,
    });
  });

  it('omitting bottomOcclusionPx (the default) leaves both corners at the plain responsive tier, unaffected', () => {
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
    expect(opts).toEqual({ paddingTopLeft: [120, 40], paddingBottomRight: [120, 40], maxZoom: 16, animate: false });
  });
});

// ─── Issue #1823 — AreaPanner seq/adopt-on-mount ──────────────────────────
// Mirrors MapController's lastHandledSeqRef (RH1) pattern, but scoped ONLY
// to the three sequenced fit reasons (group/scope/canonicalNode) that
// useDiscoverCameraOrchestration's guardedSetPanToArea publishes with a
// `seq`. A `panToArea` with no `seq` (every other existing caller) is
// legacy/un-sequenced and must keep firing on every identity change.
describe('Issue #1823 — AreaPanner seq/adopt-on-mount', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
  });

  const areaA: SeqAreaPoint = {
    areaKey: 'IN|KA|Udupi|Manipal',
    areaLabel: 'Manipal',
    geo_center_lat: 13.3525,
    geo_center_lon: 74.7869,
    bbox: [[13.34, 74.78], [13.37, 74.82]],
  };
  const areaB: SeqAreaPoint = {
    areaKey: 'IN|KA|Udupi|Katapadi',
    areaLabel: 'Katapadi',
    geo_center_lat: 13.36,
    geo_center_lon: 74.82,
    bbox: [[13.35, 74.8], [13.38, 74.84]],
  };

  it('a genuinely fresh mount fires on the FIRST sequenced value it ever observes (cold load with a group/scope selection already in the URL)', () => {
    // AreaPanner mounts with panToArea=null (data not yet resolved), then the
    // orchestration hook's group/scope effect publishes the first-ever
    // sequenced fit. This must fire — it is not a remount, there was no
    // PRIOR sighting of any panToArea to have already consumed it.
    const consumedSeqRef = { current: 0 };
    const { rerender } = render(<PropertyMap {...baseProps} panToArea={null} />);
    expect(mapStub.fitBounds).not.toHaveBeenCalled();

    rerender(<PropertyMap {...baseProps} panToArea={{ ...areaA, seq: 1, reason: 'group', consumedSeqRef }} />);
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('Issue #1823 (fix cycle 1) — a mount whose FIRST-EVER render already carries a sequenced value fires (warm-cache navigation where the parent published before AreaPanner\'s own first render)', () => {
    // Reproduces react-leaflet's real one-commit-later child-mount ordering:
    // MapContainer only renders children (AreaPanner included) in the commit
    // AFTER its own mapRef callback sets context. On a warm-cache navigation
    // (React Query already serving cached data), the orchestration hook's
    // group/scope effect can publish seq 1 in the commit BEFORE AreaPanner
    // ever mounts — so AreaPanner's effect runs for the very first time with
    // panToArea.seq already set, having never observed panToArea==null. The
    // previous adopt-on-mount implementation mistook this for a stale
    // remount echo and silently swallowed it, producing a permanent dead
    // camera (nothing else re-triggers the fit once the orchestration hook's
    // prevGroupIdRef/prevScopeRef has advanced). Mounting PropertyMap
    // directly with a pre-seeded seq puts AreaPanner's effect into exactly
    // that first-observed state (the test harness's MapContainer mock
    // renders children synchronously, so a direct initial render is the most
    // faithful way to reproduce "first execution already has a seq").
    //
    // `consumedSeqRef` starts at its per-hook-lifetime initial value (0) —
    // exactly like a genuine first-ever mount of useDiscoverCameraOrchestration
    // itself — so seq 1 > 0 fires normally, proving the fix cycle 3 gate
    // preserves this original guarantee.
    const consumedSeqRef = { current: 0 };
    render(<PropertyMap {...baseProps} panToArea={{ ...areaA, seq: 1, reason: 'group', consumedSeqRef }} />);
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('Issue #1823 (fix cycle 3 — PR #2128 review) — a PropertyMap-level remount does NOT replay an already-consumed seq, because consumedSeqRef survives the remount', () => {
    // consumedSeqRef models useDiscoverCameraOrchestration's
    // consumedPanToAreaSeqRef: owned by a hook instance that lives ABOVE
    // PropertyMap (in MapDiscovery) and therefore survives exactly the
    // remounts under test here — a mapInstanceKey bump, or the mobile Map
    // dismiss/reopen unmounting PropertyMap itself. Reusing the SAME ref
    // object across the unmount()/render() boundary below is what makes this
    // test faithful to that survival; a fresh `{ current: 0 }` per render
    // would just reproduce the old (now-rejected) replay behaviour.
    const consumedSeqRef = { current: 0 };
    const { unmount } = render(
      <PropertyMap {...baseProps} panToArea={{ ...areaA, seq: 3, reason: 'scope', consumedSeqRef }} />,
    );
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    unmount();
    mapStub.fitBounds.mockClear();

    const { rerender } = render(
      <PropertyMap {...baseProps} panToArea={{ ...areaA, seq: 3, reason: 'scope', consumedSeqRef }} />,
    );
    expect(mapStub.fitBounds).not.toHaveBeenCalled(); // already consumed — NOT replayed

    // A genuine new transition (seq 4) still fires through the same persistent ref.
    rerender(<PropertyMap {...baseProps} panToArea={{ ...areaB, seq: 4, reason: 'scope', consumedSeqRef }} />);
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('Issue #1823 (fix cycle 3) — WITHOUT a consumedSeqRef (direct construction, not via publishPanToArea), the local fallback ref still resets per-mount', () => {
    // Documents the fallback path's scope: it only matters for a sequenced
    // panToArea built without going through publishPanToArea. Every real
    // sequenced write in production always attaches consumedSeqRef, so this
    // path is a defensive default, not a behaviour real users can hit.
    const { unmount } = render(<PropertyMap {...baseProps} panToArea={{ ...areaA, seq: 3, reason: 'scope' }} />);
    unmount();
    mapStub.fitBounds.mockClear();

    render(<PropertyMap {...baseProps} panToArea={{ ...areaA, seq: 3, reason: 'scope' }} />);
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('un-sequenced (legacy) panToArea writes keep firing on every identity change, unaffected by the seq guard', () => {
    const { rerender } = render(<PropertyMap {...baseProps} panToArea={areaA} />);
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);

    rerender(<PropertyMap {...baseProps} panToArea={areaB} />);
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(2);
  });

  it("issue #1069's AREA_PANNER_GROUP_MAX_ZOOM clamp still applies to a sequenced group fit (the clamp is outside the seq gate)", () => {
    const groupBounds: SeqAreaPoint = {
      areaKey: GROUP_BOUNDS_SYNTHETIC_KEY,
      areaLabel: '',
      geo_center_lat: 13.355,
      geo_center_lon: 74.79,
      bbox: [[13.34, 74.76], [13.37, 74.82]],
      seq: 1,
      reason: 'group',
    };
    const { rerender } = render(<PropertyMap {...baseProps} panToArea={null} />);
    rerender(<PropertyMap {...baseProps} panToArea={groupBounds} />);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    const [, opts] = mapStub.fitBounds.mock.calls[0];
    expect(opts).toMatchObject({ maxZoom: AREA_PANNER_GROUP_MAX_ZOOM });
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

// Issue #1953 (RH1 adopt-on-mount) — a genuine first mount of PropertyMap
// always sees schoolFocusTick=0: the tick lives in useState(0) inside
// useDiscoverCameraOrchestration, and the effect that bumps it only runs
// AFTER the first render (even for a school-first deep link), so tick=1 is
// only ever OBSERVED on a subsequent render, never as the very first one.
// Rendering directly at a nonzero tick (as this helper used to do) exercises
// a state PropertyMap can never actually be mounted into — mount-at-0 then
// rerender-to-the-requested-tick mirrors the real sequence and is what RH1's
// adopt-on-mount seeding is designed to distinguish from an actual remount
// (fresh component instance, same already-handled tick value persisted).
const renderSchoolFocus = (props: {
  schoolFocusTick: number;
  schoolFocusRadiusKm?: number;
}) => {
  const utils = render(
    <PropertyMap
      {...schoolBase}
      schoolFocusTick={0}
      schoolFocusLat={SCHOOL_LAT}
      schoolFocusLon={SCHOOL_LON}
      schoolFocusRadiusKm={props.schoolFocusRadiusKm}
    />,
  );
  utils.rerender(
    <PropertyMap
      {...schoolBase}
      schoolFocusTick={props.schoolFocusTick}
      schoolFocusLat={SCHOOL_LAT}
      schoolFocusLon={SCHOOL_LON}
      schoolFocusRadiusKm={props.schoolFocusRadiusKm}
    />,
  );
  return utils;
};

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

// ─── Issue #2143 (PR follow-up) — URLViewportController vs AreaPanner race ──
// Two independent camera writers can both fire on the same (re)mount:
// URLViewportController (setView, from the raw URL viewport) and AreaPanner
// (fitBounds, from panToArea/CameraIntent). Before this fix, a cold
// canonical-node transition let BOTH fire, and whichever landed last on the
// real Leaflet instance won — non-deterministic (confirmed live: repeated
// identical cold `node=` loads sometimes fit correctly, sometimes stayed
// pinned at the stale URL viewport with markers off-screen). These tests
// assert only ONE writer ever acts for a given transition, deterministically.
describe('Issue #2143 — URLViewportController skips its unconditional apply for a cold canonical-node transition (AreaPanner owns it)', () => {
  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    mapStub.setView.mockClear();
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  });

  const rayasandra: SeqAreaPoint = {
    areaKey: 'IN|KA|Bengaluru|Rayasandra',
    areaLabel: 'Rayasandra',
    geo_center_lat: 12.874,
    geo_center_lon: 77.678,
    bbox: [[12.865, 77.669], [12.883, 77.687]],
    seq: 1,
    reason: 'canonicalNode',
    consumedSeqRef: { current: 0 },
  };

  it('cold node= transition (isColdNavigate=true, navigationNodeKey present): AreaPanner fits, URLViewportController does NOT apply the stale URL viewport', () => {
    render(
      <PropertyMap
        {...baseProps}
        panToArea={rayasandra}
        initialCenter={[12.87402, 77.67845]}
        initialZoom={16}
        historyAction="POP"
        navigationNodeKey="a:IN|KA|Bengaluru|Rayasandra"
        isColdNavigate={true}
      />,
    );

    // AreaPanner is the sole writer: fits fresh to the node's own bounds.
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapStub.fitBounds.mock.calls[0][0]).toEqual(rayasandra.bbox);
    // URLViewportController must NOT also apply the raw, stale URL viewport —
    // this is the exact non-determinism this fix removes.
    expect(mapStub.setView).not.toHaveBeenCalled();
  });

  it('no node in play (navigationNodeKey null/undefined): URLViewportController still applies the URL viewport unconditionally on mount (#2125 original intent preserved)', () => {
    render(
      <PropertyMap
        {...baseProps}
        panToArea={null}
        initialCenter={[12.87402, 77.67845]}
        initialZoom={16}
        historyAction="POP"
        navigationNodeKey={null}
        isColdNavigate={true}
      />,
    );

    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    expect(mapStub.setView).toHaveBeenCalledWith([12.87402, 77.67845], 16);
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
  });

  it('genuine restore (isColdNavigate=false) with a node in play: URLViewportController still applies the URL viewport — AreaPanner is not competing for this transition', () => {
    render(
      <PropertyMap
        {...baseProps}
        panToArea={null}
        initialCenter={[12.87402, 77.67845]}
        initialZoom={16}
        historyAction="POP"
        navigationNodeKey="a:IN|KA|Bengaluru|Rayasandra"
        isColdNavigate={false}
      />,
    );

    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    expect(mapStub.setView).toHaveBeenCalledWith([12.87402, 77.67845], 16);
  });
});

// ─── Issue #2143 (PR follow-up, third defect) — container-not-ready race ──
// Confirmed live with instrumentation: on the mobile List<->Map toggle,
// DiscoverMapMount real-unmounts/remounts the whole map. AreaPanner's
// fit-once effect DID run and DID call fitBounds — but the Leaflet
// container wasn't laid out to its final size yet, so fitBounds computed
// against 0x0 dimensions and the camera silently stayed at the raw stale
// URL viewport. The seq guard previously marked the seq "consumed" the
// instant the effect ran, regardless of whether the fit could actually
// apply — permanently wasting the one fit opportunity. These tests assert
// the seq is only consumed once a real, sized map instance is written to.
describe('Issue #2143 (PR follow-up) — AreaPanner defers (does not consume) a fit while the map container is not yet sized', () => {
  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    mapStub.on.mockClear();
    mapStub.off.mockClear();
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  });

  afterEach(() => {
    delete (mapStub as { getSize?: unknown }).getSize;
  });

  const rayasandra: SeqAreaPoint = {
    areaKey: 'IN|KA|Bengaluru|Rayasandra',
    areaLabel: 'Rayasandra',
    geo_center_lat: 12.874,
    geo_center_lon: 77.678,
    bbox: [[12.865, 77.669], [12.883, 77.687]],
    seq: 1,
    reason: 'canonicalNode',
  };

  it('container 0x0 on mount: does NOT fit and does NOT consume the seq; a later real Leaflet resize retries and THEN fits/consumes', () => {
    const consumedSeqRef = { current: 0 };
    (mapStub as { getSize: () => { x: number; y: number } }).getSize = vi.fn(() => ({ x: 0, y: 0 }));

    renderWithPan({ ...rayasandra, consumedSeqRef });

    // Container not ready — no fit fired, seq left outstanding.
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(consumedSeqRef.current).toBe(0);
    expect(mapStub.on).toHaveBeenCalledWith('resize', expect.any(Function));

    // Container reaches its real size; MapContainerResizeSync's
    // ResizeObserver->invalidateSize() fires Leaflet's own 'resize' event.
    (mapStub as { getSize: () => { x: number; y: number } }).getSize = vi.fn(() => ({ x: 500, y: 500 }));
    const resizeHandler = mapStub.on.mock.calls.find((call) => call[0] === 'resize')?.[1] as () => void;
    resizeHandler();

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapStub.fitBounds.mock.calls[0][0]).toEqual(rayasandra.bbox);
    expect(consumedSeqRef.current).toBe(1);
    expect(mapStub.off).toHaveBeenCalledWith('resize', resizeHandler);
  });

  it('container already sized on mount (the common case): fits immediately, no resize listener left armed', () => {
    const consumedSeqRef = { current: 0 };
    (mapStub as { getSize: () => { x: number; y: number } }).getSize = vi.fn(() => ({ x: 500, y: 500 }));

    renderWithPan({ ...rayasandra, consumedSeqRef });

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(consumedSeqRef.current).toBe(1);
    // No deferred-retry path taken — no resize listener needed.
    expect(mapStub.on).not.toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('test stubs without getSize are treated as always-ready (pre-existing test behaviour unaffected)', () => {
    const consumedSeqRef = { current: 0 };
    renderWithPan({ ...rayasandra, consumedSeqRef });

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(consumedSeqRef.current).toBe(1);
  });

  // Issue #1823 fix-cycle-3 invariant, re-verified under the new gate: a
  // remount whose seq WAS already genuinely applied to a real, sized map
  // must NOT replay the fit (would fight a manual pan). Distinguishing
  // signal is "was this seq actually written to a live map", not "did the
  // effect merely run" — confirmed still true here.
  it('#1823 preserved: a remount replaying an already-genuinely-applied seq does NOT re-fit', () => {
    const consumedSeqRef = { current: 0 };
    (mapStub as { getSize: () => { x: number; y: number } }).getSize = vi.fn(() => ({ x: 500, y: 500 }));

    const { unmount } = renderWithPan({ ...rayasandra, consumedSeqRef });
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(consumedSeqRef.current).toBe(1);
    mapStub.fitBounds.mockClear();

    // Real unmount/remount (mirrors DiscoverMapMount's mobile List<->Map
    // toggle) with the SAME seq/consumedSeqRef — the seq was genuinely
    // applied last time, so this must be a no-op, not a replay.
    unmount();
    renderWithPan({ ...rayasandra, consumedSeqRef });

    expect(mapStub.fitBounds).not.toHaveBeenCalled();
  });
});

// ─── Issue #1943 Slice B — AreaPanner's hierarchy camera-fit branch ────────
// Wires the (previously dark) resolveHierarchyCameraFit resolver into
// AreaPanner's applyFit for reason === 'canonicalNode'. These tests are the
// slice's binding jsdom-executable proof — see the handoff's
// jsdom_honesty_binding: none of these assert real rendered-card geometry
// (vacuous in jsdom); they assert which camera-write PRIMITIVE fired and
// with what upper-bounded zoom, which jsdom can genuinely prove or fail.
describe('Issue #1943 Slice B — AreaPanner hierarchy camera-fit branch (canonicalNode)', () => {
  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    mapStub.setView.mockClear();
    mapStub.project.mockClear();
    // Issue #1943 Slice B (code review fix 2) — the earlier "container not
    // ready" describe block's afterEach deletes `getSize` off this shared
    // stub, so it must be re-established here rather than relied on from
    // the hoisted initializer: the canonicalNode branch under test calls
    // `map.getSize()` directly, with no defensive fallback.
    (mapStub as { getSize: () => { x: number; y: number } }).getSize = vi.fn(() => ({ x: 1440, y: 900 }));
    // Issue #1943 (Slice B, code review cycle 2, FIX 1) — full reset (not
    // just mockClear) so a `mockReturnValueOnce` queued by one test can
    // never leak into the next; then restore the LEAF_FIT_MIN_ZOOM-matching
    // default described at the hoisted declaration above.
    mapStub.getBoundsZoom.mockReset();
    mapStub.getBoundsZoom.mockReturnValue(13);
    (L.latLngBounds as ReturnType<typeof vi.fn>).mockClear();
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  });

  const oneChildAnchor = [
    { lat: 12.971, lon: 77.594, footprintWidthPx: 150, footprintHeightPx: 130 },
  ];

  const twoCloseChildAnchors = [
    { lat: 12.9701, lon: 77.5936, footprintWidthPx: 150, footprintHeightPx: 130 },
    { lat: 12.9702, lon: 77.5937, footprintWidthPx: 150, footprintHeightPx: 130 },
  ];

  // Issue #1943 (Slice B, code review cycle 2, FIX 1) — two anchors far
  // enough apart (0.5deg lon) that at LEAF_FIT_MIN_ZOOM=13 (scale=8192) they
  // project 4096px apart — far wider than the 1200px usable width at
  // innerWidth=1440 — so childZBase's [16..13] search finds no fit and
  // falls back to a clipped zoom=13. At a derived floor of 9 (scale=512,
  // 256px apart), the SAME search extended down to 9 finds a genuinely
  // legible zoom (11) well below 13.
  const wideSeparatedChildAnchors = [
    { lat: 12.97, lon: 77.34, footprintWidthPx: 150, footprintHeightPx: 130 },
    { lat: 12.97, lon: 77.84, footprintWidthPx: 150, footprintHeightPx: 130 },
  ];

  // Issue #1943 Slice B fix — a fresh `consumedSeqRef` PER TEST (never a
  // single module-level shared object): the seq guard is keyed on
  // `seq <= consumedSeqRef.current`, so reusing one object across tests at
  // the same `seq` value would make every test after the first observe an
  // already-consumed seq and silently no-op (exactly the false-green trap
  // this slice's own T-B1 exists to catch, turned inward on the test file).
  const makeCanonicalPayload = (overrides: Partial<HierarchyAreaPoint> = {}): HierarchyAreaPoint => ({
    areaKey: 'd:central',
    areaLabel: 'd:central',
    geo_center_lat: 12.97,
    geo_center_lon: 77.59,
    bbox: [[12.9, 77.5], [13.0, 77.7]],
    seq: 1,
    reason: 'canonicalNode',
    consumedSeqRef: { current: 0 },
    ...overrides,
  });

  // T-B1 (R8, the anti-inert test) — the single test that proves this
  // slice is not dead code: a mis-AND'd branch condition would leave every
  // existing test passing (none of them uses reason==='canonicalNode' WITH
  // anchors) while the resolver silently never fires. Issue #1943 Slice B
  // (code review fix 3) — re-pointed at the TWO-anchor fixture so this test
  // keeps testing "which primitive fired", not incidentally the
  // single-child pinpoint case, which T-B7 below regression-guards on its
  // own.
  it('T-B1: reason=canonicalNode WITH anchors -> map.setView called, map.fitBounds NOT called, with the resolver-computed centre', () => {
    const payload = makeCanonicalPayload({ hierarchyChildAnchors: twoCloseChildAnchors });
    renderWithPan(payload as SeqAreaPoint);

    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    expect(mapStub.fitBounds).not.toHaveBeenCalled();

    // Issue #1943 Slice B (code review fix 3) — assert setView's FIRST
    // argument is the resolver's OWN `centre`, independently computed here
    // with the exact same inputs production feeds resolveHierarchyCameraFit
    // (viewport from getSize()=1440x900 + desktop padding [120,40], the
    // node's own bbox as containmentBounds, and the same project formula
    // mapStub.project uses). A branch that instead wrote
    // [panToArea.geo_center_lat, panToArea.geo_center_lon] would still pass
    // every other assertion in this file.
    const expected = resolveHierarchyCameraFit({
      anchors: twoCloseChildAnchors,
      containmentBounds: { south: 12.9, west: 77.5, north: 13.0, east: 77.7 },
      viewport: {
        widthPx: 1440,
        heightPx: 900,
        insetTopPx: 40,
        insetRightPx: 120,
        insetBottomPx: 40,
        insetLeftPx: 120,
      },
      project: (lat: number, lon: number, zoom: number) => {
        const scale = 2 ** zoom;
        return { x: (lon + 180) * scale, y: (90 - lat) * scale };
      },
      minZoom: LEAF_FIT_MIN_ZOOM,
      maxZoom: LEAF_FIT_MAX_ZOOM,
    });
    expect(expected).not.toBeNull();
    expect(mapStub.setView).toHaveBeenCalledWith(expected?.centre, expected?.zoom, { animate: false });
    // Issue #1943 (Slice B, code review cycle 2, FIX 1) — this test's
    // `minZoom: LEAF_FIT_MIN_ZOOM` above is now the mock's ACTUAL computed
    // return, not an inert fallback: `map.getBoundsZoom` is asserted called
    // (it was previously never reachable at all — see FIX 1 — and the
    // hoisted mock default of 13 is what makes this coincide with
    // LEAF_FIT_MIN_ZOOM here).
    expect(mapStub.getBoundsZoom).toHaveBeenCalledTimes(1);
  });

  // T-B7 (code review fix 3 — the regression guard for FIX 1) — a SINGLE
  // anchor with a WIDE node bbox must NOT collapse to the LEAF_FIT_MAX_ZOOM
  // pinpoint. Without containmentBounds wired through from the node's own
  // bbox, this fixture's child-rect footprint is near-zero, so zBase climbs
  // straight to the clamp (16) — exactly the "meaningless pinpoint" failure
  // mode hierarchyCameraFit.ts's own module doc describes for sparse nodes.
  // Witnessed: this test FAILS (writes zoom 16) against the pre-fix code
  // that never passed containmentBounds, and PASSES once it is threaded
  // through from panToArea.bbox.
  it('T-B7: canonicalNode with a SINGLE anchor and a WIDE node bbox does not collapse to LEAF_FIT_MAX_ZOOM (containmentBounds regression guard)', () => {
    renderWithPan(
      makeCanonicalPayload({
        hierarchyChildAnchors: oneChildAnchor,
        bbox: [[12.9, 77.5], [13.0, 77.7]],
      }) as SeqAreaPoint,
    );

    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    const [, zoom] = mapStub.setView.mock.calls[0];
    expect(zoom).toBeLessThan(LEAF_FIT_MAX_ZOOM);
    // Issue #1943 (Slice B, code review cycle 2, FIX 1) — proves the derived
    // floor's guard is genuinely open here too, not inert.
    expect(mapStub.getBoundsZoom).toHaveBeenCalledTimes(1);
  });

  // T-B2 (byte-identity, covers C4's real scope) — 'group'/'scope' reasons
  // must be completely unaffected: fitBounds fires with UNCHANGED args,
  // setView is never called, even when (hypothetically) hierarchyChildAnchors
  // is present on the payload.
  it("T-B2: reason='group' -> fitBounds called with unchanged args, setView NOT called", () => {
    const groupBounds: HierarchyAreaPoint = {
      areaKey: GROUP_BOUNDS_SYNTHETIC_KEY,
      areaLabel: '',
      geo_center_lat: 13.355,
      geo_center_lon: 74.79,
      bbox: [[13.34, 74.76], [13.37, 74.82]],
      seq: 1,
      reason: 'group',
      hierarchyChildAnchors: oneChildAnchor,
    };
    renderWithPan(groupBounds as SeqAreaPoint);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapStub.fitBounds.mock.calls[0][0]).toEqual(groupBounds.bbox);
    expect(mapStub.setView).not.toHaveBeenCalled();
  });

  it("T-B2: reason='scope' -> fitBounds called with unchanged args, setView NOT called", () => {
    const scopeBounds: HierarchyAreaPoint = {
      areaKey: 'IN|KA|Bengaluru|Central',
      areaLabel: 'Central',
      geo_center_lat: 12.97,
      geo_center_lon: 77.59,
      bbox: [[12.9, 77.5], [13.0, 77.7]],
      seq: 1,
      reason: 'scope',
      hierarchyChildAnchors: oneChildAnchor,
    };
    renderWithPan(scopeBounds as SeqAreaPoint);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapStub.fitBounds.mock.calls[0][0]).toEqual(scopeBounds.bbox);
    expect(mapStub.setView).not.toHaveBeenCalled();
  });

  // T-B3 (C7 null contract) — canonicalNode with no usable anchors (null/
  // empty hierarchyChildAnchors) must take today's fitBounds path verbatim;
  // the resolver must not even be consulted (the `?.length` guard short-
  // circuits before resolveHierarchyCameraFit is ever called).
  it('T-B3: reason=canonicalNode with hierarchyChildAnchors=null -> resolver not consulted, fitBounds fallback taken verbatim', () => {
    const payload = makeCanonicalPayload({ hierarchyChildAnchors: null });
    renderWithPan(payload as SeqAreaPoint);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapStub.fitBounds.mock.calls[0][0]).toEqual(payload.bbox);
    expect(mapStub.setView).not.toHaveBeenCalled();
    expect(mapStub.project).not.toHaveBeenCalled();
  });

  it('T-B3: reason=canonicalNode with an EMPTY hierarchyChildAnchors array -> fitBounds fallback taken verbatim', () => {
    renderWithPan(makeCanonicalPayload({ hierarchyChildAnchors: [] }) as SeqAreaPoint);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapStub.setView).not.toHaveBeenCalled();
  });

  // T-B4 (R4) — setView bypasses fitBounds' own maxZoom clamp, so the
  // resolver's internal LEAF_FIT_MAX_ZOOM clamp is the ONLY ceiling. Assert
  // an UPPER BOUND (never equality/a fixed value): two anchors placed a
  // fraction of a degree apart at these projection-mock coordinates need
  // real zoom-climbing to separate, which is exactly what exercises the
  // clamp path.
  it('T-B4: the zoom written via setView never exceeds LEAF_FIT_MAX_ZOOM (16)', () => {
    renderWithPan(makeCanonicalPayload({ hierarchyChildAnchors: twoCloseChildAnchors }) as SeqAreaPoint);

    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    const [, zoom] = mapStub.setView.mock.calls[0];
    expect(zoom).toBeLessThanOrEqual(16);
  });

  it('uses map.project directly (risk R5) — never a hand-rolled projection', () => {
    renderWithPan(makeCanonicalPayload({ hierarchyChildAnchors: oneChildAnchor }) as SeqAreaPoint);

    expect(mapStub.project).toHaveBeenCalled();
    // Called with a [lat, lon] pair and a numeric zoom, exactly as
    // Leaflet's own `map.project(latlng, zoom)` signature expects.
    const [latlng, zoom] = mapStub.project.mock.calls[0];
    expect(latlng).toEqual([expect.any(Number), expect.any(Number)]);
    expect(typeof zoom).toBe('number');
  });

  // T-B8 (code review cycle 2, FIX 1 — the anti-inert test for the derived
  // minZoom floor itself) — a derived floor BELOW LEAF_FIT_MIN_ZOOM must let
  // the resolver reach a genuinely WIDER (lower-zoom) legible camera than
  // the flat 13 floor would ever have permitted. `wideSeparatedChildAnchors`
  // are far enough apart that zoom>=13 always clips (see the fixture's own
  // comment); only a floor of 9 opens a legible zoom (11) below 13.
  it('T-B8: a derived floor below LEAF_FIT_MIN_ZOOM resolves a zoom that DIFFERS from (and is lower than) the 13 fallback', () => {
    mapStub.getBoundsZoom.mockReturnValueOnce(9);
    renderWithPan(
      makeCanonicalPayload({ hierarchyChildAnchors: wideSeparatedChildAnchors, bbox: null }) as SeqAreaPoint,
    );

    expect(mapStub.getBoundsZoom).toHaveBeenCalledTimes(1);
    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    const [, zoom] = mapStub.setView.mock.calls[0];
    expect(zoom).toBeLessThan(LEAF_FIT_MIN_ZOOM);
    // Cross-check against the resolver directly with minZoom=9 vs. 13 — the
    // two must differ, proving the floor actually changed the outcome (not
    // just that SOME zoom below 13 happened to come out).
    const withDerivedFloor = resolveHierarchyCameraFit({
      anchors: wideSeparatedChildAnchors,
      containmentBounds: null,
      viewport: { widthPx: 1440, heightPx: 900, insetTopPx: 40, insetRightPx: 120, insetBottomPx: 40, insetLeftPx: 120 },
      project: (lat: number, lon: number, z: number) => {
        const scale = 2 ** z;
        return { x: (lon + 180) * scale, y: (90 - lat) * scale };
      },
      minZoom: 9,
      maxZoom: LEAF_FIT_MAX_ZOOM,
    });
    const withFlatFallback = resolveHierarchyCameraFit({
      anchors: wideSeparatedChildAnchors,
      containmentBounds: null,
      viewport: { widthPx: 1440, heightPx: 900, insetTopPx: 40, insetRightPx: 120, insetBottomPx: 40, insetLeftPx: 120 },
      project: (lat: number, lon: number, z: number) => {
        const scale = 2 ** z;
        return { x: (lon + 180) * scale, y: (90 - lat) * scale };
      },
      minZoom: LEAF_FIT_MIN_ZOOM,
      maxZoom: LEAF_FIT_MAX_ZOOM,
    });
    expect(withDerivedFloor?.needsDeclutter).toBe(false);
    expect(withFlatFallback?.needsDeclutter).toBe(true);
    expect(withDerivedFloor?.zoom).not.toBe(withFlatFallback?.zoom);
    expect(zoom).toBe(withDerivedFloor?.zoom);
  });

  // T-B9 (code review cycle 2, FIX 1) — which envelope actually feeds
  // `map.getBoundsZoom`: the node's own bbox corners when present, or the
  // child-anchor union when it is null (the Udupi synthetic-root case, which
  // has no bbox of its own).
  it('T-B9: getBoundsZoom is queried against the node bbox corners when panToArea.bbox is present', () => {
    const payload = makeCanonicalPayload({ hierarchyChildAnchors: oneChildAnchor });
    renderWithPan(payload as SeqAreaPoint);

    expect(L.latLngBounds).toHaveBeenCalledWith([payload.bbox?.[0], payload.bbox?.[1]]);
    expect(mapStub.getBoundsZoom).toHaveBeenCalledTimes(1);
    // F2 — `getBoundsZoom`'s padding argument is the TOTAL Leaflet subtracts
    // from the container (leaflet-src.js:3980-3987), not one edge's share of
    // it, so it must equal the resolver's full inset: 2*padH horizontally,
    // 2*padV + bottomOcclusionPx vertically (240x80 at the desktop padding/
    // zero-occlusion values this fixture renders under), PLUS (issue #2314)
    // the max card footprint across the node's anchors — `oneChildAnchor`'s
    // single anchor carries footprintWidthPx: 150 / footprintHeightPx: 130,
    // giving a total of 390x210.
    expect(mapStub.getBoundsZoom).toHaveBeenCalledWith(
      expect.anything(),
      false,
      { x: 390, y: 210 },
    );
  });

  // T-B11 (issue #2314) — `derivedMinZoom` must account for the REAL
  // destination-card footprint, not treat anchors as dimensionless points:
  // (a) a larger card footprint feeds a larger padding into getBoundsZoom
  // than a smaller one for an otherwise-identical envelope, and (b) across
  // several anchors with DIFFERING footprints, the MAX width/height wins
  // (never an under-estimate from averaging or picking an arbitrary anchor).
  it('T-B11: getBoundsZoom padding grows with the anchors’ real card footprint, using the MAX across anchors', () => {
    renderWithPan(
      makeCanonicalPayload({ hierarchyChildAnchors: oneChildAnchor }) as SeqAreaPoint,
    );
    const [, , smallPadding] = mapStub.getBoundsZoom.mock.calls[0];
    // oneChildAnchor: footprintWidthPx 150 / footprintHeightPx 130 (see T-B9).
    expect(smallPadding).toEqual({ x: 240 + 150, y: 80 + 130 });

    mapStub.getBoundsZoom.mockClear();
    renderWithPan(
      makeCanonicalPayload({
        hierarchyChildAnchors: [
          { lat: 12.971, lon: 77.594, footprintWidthPx: 150, footprintHeightPx: 130 },
          // A second, deliberately LARGER card on the same envelope — the
          // derived floor must widen to cover this one too, not the first.
          { lat: 12.972, lon: 77.595, footprintWidthPx: 260, footprintHeightPx: 200 },
        ],
        consumedSeqRef: { current: 0 },
      }) as SeqAreaPoint,
    );
    const [, , largePadding] = mapStub.getBoundsZoom.mock.calls[0];
    expect(largePadding).toEqual({ x: 240 + 260, y: 80 + 200 });
    // The larger footprint must produce a STRICTLY wider padding than the
    // smaller one — proving the calculation is genuinely footprint-aware,
    // not a flat constant that happens to equal one fixture's numbers.
    expect(largePadding.x).toBeGreaterThan(smallPadding.x);
    expect(largePadding.y).toBeGreaterThan(smallPadding.y);
  });

  it('T-B9: getBoundsZoom is queried against the child-anchor union when panToArea.bbox is null (Udupi synthetic-root case)', () => {
    // Two anchors (not one) — a single anchor with no bbox is itself a
    // degenerate (zero-span) point and would be skipped by the FIX 3 guard
    // (see T-B10); this test is specifically about WHICH envelope feeds
    // getBoundsZoom, so it needs a non-degenerate anchor union.
    renderWithPan(
      makeCanonicalPayload({ hierarchyChildAnchors: twoCloseChildAnchors, bbox: null }) as SeqAreaPoint,
    );

    expect(L.latLngBounds).toHaveBeenCalledWith([
      [twoCloseChildAnchors[0].lat, twoCloseChildAnchors[0].lon],
      [twoCloseChildAnchors[1].lat, twoCloseChildAnchors[1].lon],
    ]);
    expect(mapStub.getBoundsZoom).toHaveBeenCalledTimes(1);
  });

  // T-B10 (code review cycle 2, FIX 3) — a degenerate (zero-span) NODE BBOX
  // (e.g. bad upstream data collapsing it to a single point) must not force
  // `derivedMinZoom` up to LEAF_FIT_MAX_ZOOM: `wideSeparatedChildAnchors`
  // are spread far enough apart that they clip at EVERY zoom in [13, 16]
  // (see the fixture's own comment). Since (reroute cycle 2, Option 2) a
  // chosen candidate that clips is now discarded outright rather than
  // written via setView, this fixture's ALWAYS-clipping candidates never
  // reach setView regardless of which floor the search used — so the FIX 3
  // guard is no longer observable through setView's zoom. It is instead
  // observable through the resolver's SEARCH RANGE itself: `map.project` is
  // called once per candidate zoom in `[minZoom, maxZoom]`, so zoom 13
  // appearing among those calls proves `derivedMinZoom` stayed at
  // LEAF_FIT_MIN_ZOOM=13 rather than being clamped to 16. Without the FIX 3
  // guard, `map.getBoundsZoom` would report the degenerate bounds'
  // containment zoom as the map's own maximum (simulated here as 20) and
  // clamp `derivedMinZoom` straight to LEAF_FIT_MAX_ZOOM=16, so zoom 13
  // would never be probed at all.
  it('T-B10: a degenerate (zero-span) node bbox does not force the derived floor up to LEAF_FIT_MAX_ZOOM', () => {
    mapStub.getBoundsZoom.mockReturnValueOnce(20);
    renderWithPan(
      makeCanonicalPayload({
        hierarchyChildAnchors: wideSeparatedChildAnchors,
        bbox: [[12.97, 77.59], [12.97, 77.59]],
      }) as SeqAreaPoint,
    );

    // The degenerate bbox is detected before ever calling
    // map.getBoundsZoom — never fed the mocked max-zoom return into the
    // derivation at all.
    expect(mapStub.getBoundsZoom).not.toHaveBeenCalled();
    // Issue #1943 (Slice B, reroute cycle 2, Option 2) — every candidate in
    // range clips for this fixture, so the resolver's chosen candidate is
    // discarded and the fallback fitBounds path fires instead of setView.
    expect(mapStub.setView).not.toHaveBeenCalled();
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    const zoomsProbed = new Set(mapStub.project.mock.calls.map(([, z]) => z));
    expect(zoomsProbed.has(LEAF_FIT_MIN_ZOOM)).toBe(true);
    expect(zoomsProbed.has(LEAF_FIT_MAX_ZOOM)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Issue #1943 (Stage-B rework, rework-request-stage-b-6.toml) — TASK 1
// "A-containable": narrowToLegibleZoomWindow narrows the resolver's own
// [minZoom, maxZoom] window from the CALL SITE to exclude zooms that would
// be illegible AFTER the render layer's clusterAreaMembers merge pass —
// closing the resolver/clusterer feedback gap without touching
// hierarchyCameraFit.ts (forbidden, Slice-A calibrated).
//
// A simple linear projection (no real Mercator needed — only RELATIVE
// pixel spacing at a given zoom matters to clusterAreaMembers' grid
// bucketing / footprint-overlap merge) is used directly, independent of
// the mapStub/PropertyMap render machinery above: this exercises the
// exported pure function in isolation, which is exactly what gets called
// (and what feeds resolveHierarchyCameraFit's minZoom/maxZoom) at the real
// call site inside AreaPanner's applyFit.
// ─────────────────────────────────────────────────────────────────────────
describe('narrowToLegibleZoomWindow (Task 1 — A-containable)', () => {
  const projectAtZoom = (lat: number, lon: number, zoom: number) => {
    const scale = 2 ** zoom;
    return { x: lon * scale, y: -lat * scale };
  };

  // Base coordinate deliberately off (0, 0) — isUsableCentroid treats an
  // EXACT (0, 0) pair as an unplausible "null island" sentinel and drops it,
  // which would silently collapse these two-anchor fixtures to one usable
  // anchor (an unrelated early-return path) rather than exercising the
  // legibility search these tests target.
  const BASE_LAT = 12.97;
  const BASE_LON = 77.59;

  it('excludes wide/illegible candidate zooms where clusterAreaMembers would merge two anchors into ONE card, while keeping a legible zoom reachable (the resolver/clusterer feedback gap)', () => {
    // Two same-latitude anchors, fixed lon delta = 3/2**9. Distance at zoom
    // z = 3 * 2**(z-9): 3, 6, 12, 24 px at z=9..12 (always < the 40px
    // footprint-overlap threshold — clusterAreaMembers' merge pass ALWAYS
    // merges these into ONE card, regardless of absolute grid alignment) —
    // then 96, 192, 384 px at z=14..16 (always > 64px, so they can never
    // land in the same 64px grid cell, AND > the 40px footprint threshold —
    // clusterAreaMembers ALWAYS keeps these as two distinct cards). z=13
    // (48px) is a deliberately-excluded boundary case (grid-alignment
    // dependent) — assertions below never depend on its outcome either way.
    const lonDelta = 3 / 2 ** 9;
    const anchors = [
      { lat: BASE_LAT, lon: BASE_LON, footprintWidthPx: 40, footprintHeightPx: 40 },
      { lat: BASE_LAT, lon: BASE_LON + lonDelta, footprintWidthPx: 40, footprintHeightPx: 40 },
    ];

    const { minZoom, maxZoom } = narrowToLegibleZoomWindow(anchors, projectAtZoom, 9, 16);

    // The illegible-wide candidates (9-12 — everything merges into one
    // card) must be excluded from the narrowed window.
    expect(minZoom).not.toBe(9);
    expect(minZoom).toBeGreaterThanOrEqual(13);
    // A legible candidate (14-16 — two distinct, individually-selectable
    // cards) must remain reachable.
    expect(maxZoom).toBe(16);
  });

  it('never narrows to an empty or single-candidate window — falls back to the un-narrowed range (degenerate case: only ONE technically-legible zoom exists)', () => {
    // Distance at zoom z = 2 * 2**(z-9): 2, 4, 8, 16 px at z=9..12 — always
    // well under the 40px footprint-overlap threshold, so clusterAreaMembers
    // ALWAYS merges these into one card across the entire [9, 12] range
    // (no legible zoom exists at all here). A naive narrowing would still
    // never collapse to a single candidate in THIS fixture (there are zero
    // legible zooms, not one) — this exercises the "zero legible zooms"
    // degenerate branch specifically (the sibling "exactly one legible
    // zoom" branch — where the fix-cycle-2 argmax degrades to `[bestZoom,
    // maxZoom]` instead of the un-narrowed range — has its own dedicated
    // test below, "narrows to the best-available zoom when exactly one
    // candidate is legible"; the coincident-anchor test right after this one
    // exercises the SAME zero-legible-zooms branch as this test, not the
    // one-legible-zoom branch).
    const lonDelta = 2 / 2 ** 9;
    const anchors = [
      { lat: BASE_LAT, lon: BASE_LON, footprintWidthPx: 40, footprintHeightPx: 40 },
      { lat: BASE_LAT, lon: BASE_LON + lonDelta, footprintWidthPx: 40, footprintHeightPx: 40 },
    ];
    const { minZoom, maxZoom } = narrowToLegibleZoomWindow(anchors, projectAtZoom, 9, 12);
    expect(minZoom).toBe(9);
    expect(maxZoom).toBe(12);
  });

  it('never narrows to an empty window — degenerate case: EVERY candidate zoom is illegible (coincident anchors)', () => {
    // Two exactly-coincident anchors never separate at any finite zoom —
    // clusterAreaMembers always merges them into one card. Narrowing must
    // fall back to the un-narrowed range rather than returning an empty
    // window (which would make the resolver unrunnable).
    const anchors = [
      { lat: 12.97, lon: 77.59, footprintWidthPx: 150, footprintHeightPx: 130 },
      { lat: 12.97, lon: 77.59, footprintWidthPx: 150, footprintHeightPx: 130 },
    ];
    const { minZoom, maxZoom } = narrowToLegibleZoomWindow(anchors, projectAtZoom, 13, 16);
    expect(minZoom).toBe(13);
    expect(maxZoom).toBe(16);
  });

  it('narrows to the best-available zoom when exactly one candidate is legible — fix-cycle-2, FIX 1: degrades to [bestZoom, maxZoom], never back to the un-narrowed range that reproduced the collapse', () => {
    // Anchor 0 pinned at lon=0 (safe: lat is non-zero, so isUsableCentroid's
    // exact-(0,0)-pair "null island" guard does not apply). Anchor 1's lon
    // offset is calibrated so its projected x crosses exactly ONE 64px grid
    // boundary at the TOP of the range (z=13) and nowhere below it:
    //   z=10: x1=8  -> same grid cell as x0=0 (floor(8/64)=0)  -> merged, 1 cluster (illegible)
    //   z=11: x1=16 -> same cell (floor(16/64)=0)              -> merged, 1 cluster (illegible)
    //   z=12: x1=32 -> same cell (floor(32/64)=0)              -> merged, 1 cluster (illegible)
    //   z=13: x1=64 -> DIFFERENT cell (floor(64/64)=1) AND 64px
    //         apart, over the 40px footprint-overlap threshold  -> 2 clusters (legible)
    // Cluster count is monotone non-decreasing in zoom (spacing only grows),
    // so z=13 is the ONLY legible zoom in [10, 13] — `legibleZooms.length`
    // is exactly 1, hitting the `< 2` branch this test targets. Pre-fix-2
    // behaviour returned the un-narrowed [10, 13] (the very window that
    // produces the z=10..12 collapse); post-fix behaviour degrades to
    // [bestZoom, maxZoom] = [13, 13] — the one zoom that is actually legible.
    const lonDelta = 64 / 2 ** 13;
    const anchors = [
      { lat: BASE_LAT, lon: 0, footprintWidthPx: 40, footprintHeightPx: 40 },
      { lat: BASE_LAT, lon: lonDelta, footprintWidthPx: 40, footprintHeightPx: 40 },
    ];
    const { minZoom, maxZoom } = narrowToLegibleZoomWindow(anchors, projectAtZoom, 10, 13);
    expect(minZoom).toBe(13);
    expect(maxZoom).toBe(13);
  });

  it('is a no-op for a single (or zero) usable destination — nothing to narrow against', () => {
    const anchors = [{ lat: 12.97, lon: 77.59, footprintWidthPx: 150, footprintHeightPx: 130 }];
    expect(narrowToLegibleZoomWindow(anchors, projectAtZoom, 13, 16)).toEqual({ minZoom: 13, maxZoom: 16 });
    expect(narrowToLegibleZoomWindow([], projectAtZoom, 13, 16)).toEqual({ minZoom: 13, maxZoom: 16 });
  });

  it('uses the SAME clusterAreaMembers the render layer (AreaMarkerLayer.tsx) uses, called with the MAX-reduced footprint override', () => {
    const spy = vi.spyOn(areaClusteringModule, 'clusterAreaMembers');
    // Mixed per-anchor footprint dimensions — width's max comes from anchor
    // 0, height's max comes from anchor 1 — so only a genuine per-DIMENSION
    // max reduction across the batch (AreaMarkerLayer.tsx's own "FOOTPRINT
    // SOURCE" rule) produces {40, 55}; using either anchor's own footprint
    // alone would produce a distinguishably different pair ({40, 20} or
    // {30, 55}).
    const anchors = [
      { lat: BASE_LAT, lon: BASE_LON, footprintWidthPx: 40, footprintHeightPx: 20 },
      { lat: BASE_LAT, lon: BASE_LON + 3 / 2 ** 9, footprintWidthPx: 30, footprintHeightPx: 55 },
    ];

    narrowToLegibleZoomWindow(anchors, projectAtZoom, 9, 12);

    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    for (const call of spy.mock.calls) {
      expect(call[3]).toEqual({ footprintWidthPx: 40, footprintHeightPx: 55 });
    }
    spy.mockRestore();
  });

  // Issue #1943 (Stage-B rework, code review cycle 2, FIX 5 — test-regime
  // realism) — every OTHER fixture in this describe block uses a 40x40 or
  // 30x55 footprint, well BELOW the 64px grid cell. Production never enters
  // that regime: `AREAS_PILL_RESERVED_WIDTH_PX` (destinationCardFootprint.ts)
  // is 170px alone, so every real destination card footprint is at least
  // ~197x120 — comfortably larger than the grid cell. This fixture pins the
  // same "excludes wide/illegible while keeping a legible zoom reachable"
  // behaviour as the very first test in this describe block, but at an
  // actual PRODUCTION-SCALE footprint (200x130), so the tested regime
  // matches the one this function actually runs in.
  it('excludes wide/illegible candidate zooms at a PRODUCTION-SCALE footprint (200x130, >= the real ~197x120 minimum), keeping a legible zoom reachable', () => {
    // Distance at zoom z = 150 * 2**(z-13): 9.375, 18.75, 37.5, 75 px at
    // z=9..12 (always well under the 200px footprint-overlap threshold —
    // clusterAreaMembers' merge pass ALWAYS merges these into ONE card) —
    // then 150, 300, 600, 1200 px at z=13..16. z=13 (150px, still < 200) is
    // a deliberately-included merged candidate; z=14..16 (300/600/1200px,
    // always > 200px) always keep these as two distinct cards.
    const lonDelta = 150 / 2 ** 13;
    const anchors = [
      { lat: BASE_LAT, lon: BASE_LON, footprintWidthPx: 200, footprintHeightPx: 130 },
      { lat: BASE_LAT, lon: BASE_LON + lonDelta, footprintWidthPx: 200, footprintHeightPx: 130 },
    ];

    const { minZoom, maxZoom } = narrowToLegibleZoomWindow(anchors, projectAtZoom, 9, 16);

    // The illegible-wide candidates (9-13 — everything merges into one
    // card) must be excluded from the narrowed window.
    expect(minZoom).toBe(14);
    // A legible candidate (14-16 — two distinct, individually-selectable
    // cards) must remain reachable.
    expect(maxZoom).toBe(16);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Issue #1943 (bug: destination/cluster cards render outside the map
  // container) — CONTAINMENT OUTRANKS LEGIBILITY. `narrowToLegibleZoomWindow`
  // used to narrow purely on predicted card count, with no idea that
  // excluding a wide/zoomed-out zoom for illegibility could be excluding the
  // ONLY zoom at which every anchor's card rect is actually inside the
  // viewport. When `usableViewport` is supplied, the largest containable
  // zoom in the ORIGINAL range must survive in the returned window even if
  // it is illegible.
  // ───────────────────────────────────────────────────────────────────────
  describe('narrowToLegibleZoomWindow — containment outranks legibility (usableViewport param)', () => {
    it('retains the ONLY clip-free zoom in the original range even though narrowing-by-card-count-alone excludes it — MUST reproduce the bug when usableViewport is omitted', () => {
      // Two anchors symmetric around their own arithmetic-mean centroid.
      // Against a 300x400 usable rect with a 200x130 footprint (production
      // scale):
      //   - z=9,10:  both card rects are FULLY CONTAINED (centre-pinned
      //              placement) — but the anchors are still < 200px apart
      //              on screen, so clusterAreaMembers merges them into ONE
      //              card (illegible).
      //   - z=11:    neither contained nor legible (worst of both).
      //   - z=12-16: legible (>= 200px apart, two distinct cards) but NO
      //              LONGER contained — pushed outside the 300x400 usable
      //              rect entirely. This is exactly the measured bug: a
      //              zoom that scores perfectly on legibility while real
      //              anchors render off-screen.
      // Legibility-only narrowing (no `usableViewport`) picks
      // {minZoom: 12, maxZoom: 16} — reproducing the bug. The fix must
      // widen minZoom down to 10 (the largest containable zoom) once
      // `usableViewport` is supplied.
      const D = 0.09;
      const anchors = [
        { lat: BASE_LAT, lon: BASE_LON, footprintWidthPx: 200, footprintHeightPx: 130 },
        { lat: BASE_LAT, lon: BASE_LON + D, footprintWidthPx: 200, footprintHeightPx: 130 },
      ];
      const usableViewport = {
        widthPx: 300,
        heightPx: 400,
        insetTopPx: 0,
        insetRightPx: 0,
        insetBottomPx: 0,
        insetLeftPx: 0,
      };

      // Sanity/repro: WITHOUT usableViewport, narrowing-by-legibility-alone
      // really does exclude the only clip-free zoom (10) — this is the bug
      // this fix closes.
      const legibilityOnly = narrowToLegibleZoomWindow(anchors, projectAtZoom, 9, 16);
      expect(legibilityOnly).toEqual({ minZoom: 12, maxZoom: 16 });

      // WITH usableViewport: containment must win. z=10 (the largest
      // containable zoom) must be retained by widening minZoom.
      const { minZoom, maxZoom } = narrowToLegibleZoomWindow(anchors, projectAtZoom, 9, 16, usableViewport);
      expect(minZoom).toBe(10);
      expect(maxZoom).toBe(16);
    });

    it('is a no-op when the legibility-narrowed window already contains a clip-free zoom — never needlessly widens', () => {
      const lonDelta = 3 / 2 ** 9;
      const anchors = [
        { lat: BASE_LAT, lon: BASE_LON, footprintWidthPx: 40, footprintHeightPx: 40 },
        { lat: BASE_LAT, lon: BASE_LON + lonDelta, footprintWidthPx: 40, footprintHeightPx: 40 },
      ];
      // Generous enough that every candidate zoom in [9, 16] is fully
      // contained — containment can never be the binding constraint here.
      const generousViewport = {
        widthPx: 4000,
        heightPx: 4000,
        insetTopPx: 0,
        insetRightPx: 0,
        insetBottomPx: 0,
        insetLeftPx: 0,
      };

      const withoutViewport = narrowToLegibleZoomWindow(anchors, projectAtZoom, 9, 16);
      const withViewport = narrowToLegibleZoomWindow(anchors, projectAtZoom, 9, 16, generousViewport);
      expect(withViewport).toEqual(withoutViewport);
    });

    // Issue #1943 (Stage-B, LAST DEFECT fix) — previously this asserted the
    // null-safety-net branch left the legibility-raised floor UNCHANGED,
    // which was itself the root cause of the over-zoom defect: with nothing
    // containable anywhere in range, keeping the raised floor starves
    // resolveHierarchyCameraFit's candidate window of the only zoom that
    // could have avoided clipping every anchor. The fix widens the floor
    // back down to the caller's own minZoom instead.
    it("cannot invent a clip-free zoom that does not exist — when NO zoom anywhere in range is contained, the floor widens back to the caller's own minZoom", () => {
      const D = 0.09;
      const anchors = [
        { lat: BASE_LAT, lon: BASE_LON, footprintWidthPx: 200, footprintHeightPx: 130 },
        { lat: BASE_LAT, lon: BASE_LON + D, footprintWidthPx: 200, footprintHeightPx: 130 },
      ];
      // Viewport narrower than the 200px-wide footprint itself — no zoom,
      // however wide, can ever contain a card in it.
      const impossibleViewport = {
        widthPx: 50,
        heightPx: 50,
        insetTopPx: 0,
        insetRightPx: 0,
        insetBottomPx: 0,
        insetLeftPx: 0,
      };

      const legibilityOnly = narrowToLegibleZoomWindow(anchors, projectAtZoom, 9, 16);
      const withImpossibleViewport = narrowToLegibleZoomWindow(anchors, projectAtZoom, 9, 16, impossibleViewport);
      // maxZoom is untouched (still the legibility pass's own upper bound);
      // minZoom widens back down to the caller's original floor (9), not the
      // legibility-raised one.
      expect(withImpossibleViewport).toEqual({ minZoom: 9, maxZoom: legibilityOnly.maxZoom });
      expect(withImpossibleViewport.minZoom).not.toBe(legibilityOnly.minZoom);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Issue #1943 (Stage-B, LAST DEFECT) — a multi-member `clusterAreaMembers`
  // cell is rendered ONCE, at its members' CENTROID (`cell.anchor` in
  // `AreaMarkerLayer.tsx`) — a pixel position no individual raw anchor
  // occupies. The containment widening above (`largestContainableZoom`) used
  // to check ONLY raw per-anchor positions, so a zoom could look fully
  // clip-free while a real cluster card — rendered with the BATCH-MAX
  // footprint across every anchor, which can be far larger than the
  // merging anchors' own footprints — clips for real. The fix predicts the
  // SAME per-zoom clustering the render layer produces and additionally
  // requires every multi-member cell's own centroid card to be contained.
  // ───────────────────────────────────────────────────────────────────────
  describe('narrowToLegibleZoomWindow — cluster-centroid containment (the render/model gap)', () => {
    it('rejects a zoom where every RAW anchor individually fits but a merged cluster card (batch-max footprint) clips — MUST widen further than raw-anchor-only containment would', () => {
      // Six anchors:
      //  - P, Q: large footprint (40x40), close enough to stay merged with
      //    R/S below zoom 13 (see the "legibility" print trail this fixture
      //    was derived from) — these set the BATCH-MAX footprint (40x40)
      //    used for every cluster card, including cards that merge much
      //    smaller (10x10) anchors.
      //  - R, S: small footprint (10x10), close to P/Q at low zoom (so the
      //    legibility bar is not met below z=12 — matches the "containment
      //    outranks legibility" shape of the sibling describe block above),
      //    separating from P/Q above z=12.
      //  - A, B: small footprint (10x10) each, ALWAYS their own distinct
      //    2-member cluster (offset far enough from P/Q/R/S to never merge
      //    with them at any zoom in range) — the pair this test targets.
      //    Individually, a 10x10 card at A's or B's own translated position
      //    fits a 400x400 viewport with huge margin. But the CLUSTER card
      //    drawn at their centroid uses the batch-max 40x40 footprint (from
      //    P/Q) — 4x the linear size — which clips at zoom 11 even though
      //    every raw anchor (A, B included) individually still fits.
      const pqDelta = 3 / 2 ** 9;
      const abOffsetLon = 0.15;
      const rsOffsetLon = 0.02;
      const P = { lat: BASE_LAT, lon: BASE_LON, footprintWidthPx: 40, footprintHeightPx: 40 };
      const Q = { lat: BASE_LAT, lon: BASE_LON + pqDelta, footprintWidthPx: 40, footprintHeightPx: 40 };
      const A = {
        lat: BASE_LAT + 0.005,
        lon: BASE_LON + abOffsetLon,
        footprintWidthPx: 10,
        footprintHeightPx: 10,
      };
      const B = {
        lat: BASE_LAT + 0.005,
        lon: BASE_LON + abOffsetLon + 0.0000001,
        footprintWidthPx: 10,
        footprintHeightPx: 10,
      };
      const R = { lat: BASE_LAT, lon: BASE_LON + rsOffsetLon, footprintWidthPx: 10, footprintHeightPx: 10 };
      const S = {
        lat: BASE_LAT,
        lon: BASE_LON + rsOffsetLon + 0.0000001,
        footprintWidthPx: 10,
        footprintHeightPx: 10,
      };
      const anchors = [P, Q, A, B, R, S];

      const usableViewport = {
        widthPx: 400,
        heightPx: 400,
        insetTopPx: 0,
        insetRightPx: 0,
        insetBottomPx: 0,
        insetLeftPx: 0,
      };

      // Sanity: legibility-only narrowing floors at z=12 (below that, P/Q/R/S
      // merge into one 4-member blob, undercutting the legibility bar) —
      // independent of containment, matching this file's other fixtures.
      const legibilityOnly = narrowToLegibleZoomWindow(anchors, projectAtZoom, 9, 16);
      expect(legibilityOnly).toEqual({ minZoom: 12, maxZoom: 16 });

      // Containment must widen minZoom below 12. The FIX must land on z=10
      // (the largest zoom where BOTH every raw anchor AND the A/B cluster's
      // own centroid card are contained) — never z=11, which a raw-anchor-
      // only containment check would wrongly accept (every individual
      // anchor fits at z=11; only the A/B CLUSTER card, sized at the
      // batch-max 40x40 footprint, clips there).
      const { minZoom, maxZoom } = narrowToLegibleZoomWindow(anchors, projectAtZoom, 9, 16, usableViewport);
      expect(minZoom).toBe(10);
      expect(minZoom).not.toBe(11);
      expect(maxZoom).toBe(16);
    });

    it('HIGH-finding regression guard (code review, fix cycle 2): the cluster check is a PREFERENCE, never a VETO — when EVERY raw-contained zoom in range also has a clipping cluster card, containment falls back to the largest raw-contained zoom, NOT the legibility floor', () => {
      // The prior fix (previous test above) picked its fixture so that a
      // LOWER zoom (10) satisfied both raw-anchor AND cluster-card
      // containment, so `largestContainableZoom`'s old all-or-nothing
      // conjunct still found a valid answer (10) by continuing to search
      // downward. This fixture removes that safety net: the A/B cluster's
      // card clips at EVERY zoom where raw-anchor containment holds, so
      // the intersection of "raw contained" and "cluster contained" is
      // EMPTY across the whole search range. The old conjunct
      // (`allContained && clusterAnchorsContained(...)`) then finds no
      // zoom at all and returns null, and the caller's honesty branch
      // falls all the way back to `legibilityNarrowed` — the very
      // wide-open window `narrowToLegibleZoomWindow` exists to narrow away
      // from, and one that need not contain a single clip-free zoom.
      //
      // Geometry: same P/Q/A/B/R/S shape as the sibling fixture above,
      // doubled (k=2) so the A/B pair sits far enough from the P/Q/R/S
      // group that they never merge into one blob until z=9 (excluded by
      // passing minZoom=10) — a full merge trivially recentres everything
      // on the shared centroid and would make the cluster check pass by
      // accident, defeating the fixture. A 7th anchor, M, is added sitting
      // EXACTLY at the arithmetic mean of the other six: the mean of N
      // points plus a point AT their mean is unchanged, so M is pinned to
      // the usable-rect centre at every zoom (dx/dy cancel it out exactly)
      // regardless of how large its own declared footprint is. M's
      // oversized footprint (150x90, vs 10x10 for A/B) becomes the
      // batch-max footprint `narrowToLegibleZoomWindow` applies to every
      // cluster card (see its "FOOTPRINT SOURCE" comment) — inflating the
      // A/B cluster card just as a real over-wide batch-max would (the
      // reviewer's "batch-max over-estimation" note) — while M itself
      // never fails raw containment (always centred, and its own footprint
      // is well inside the 400x400 viewport).
      const k = 2;
      const pqDelta = (3 / 2 ** 9) * k;
      const abOffsetLon = 0.15 * k;
      const rsOffsetLon = 0.02 * k;
      const latOffset = 0.005 * k;
      const P = { lat: BASE_LAT, lon: BASE_LON, footprintWidthPx: 40, footprintHeightPx: 40 };
      const Q = { lat: BASE_LAT, lon: BASE_LON + pqDelta, footprintWidthPx: 40, footprintHeightPx: 40 };
      const A = {
        lat: BASE_LAT + latOffset,
        lon: BASE_LON + abOffsetLon,
        footprintWidthPx: 10,
        footprintHeightPx: 10,
      };
      const B = {
        lat: BASE_LAT + latOffset,
        lon: BASE_LON + abOffsetLon + 0.0000001,
        footprintWidthPx: 10,
        footprintHeightPx: 10,
      };
      const R = { lat: BASE_LAT, lon: BASE_LON + rsOffsetLon, footprintWidthPx: 10, footprintHeightPx: 10 };
      const S = {
        lat: BASE_LAT,
        lon: BASE_LON + rsOffsetLon + 0.0000001,
        footprintWidthPx: 10,
        footprintHeightPx: 10,
      };
      const sixAnchors = [P, Q, A, B, R, S];
      const meanLat = sixAnchors.reduce((sum, a) => sum + a.lat, 0) / sixAnchors.length;
      const meanLon = sixAnchors.reduce((sum, a) => sum + a.lon, 0) / sixAnchors.length;
      const M = { lat: meanLat, lon: meanLon, footprintWidthPx: 150, footprintHeightPx: 90 };
      const anchors = [P, Q, A, B, R, S, M];

      const usableViewport = {
        widthPx: 400,
        heightPx: 400,
        insetTopPx: 0,
        insetRightPx: 0,
        insetBottomPx: 0,
        insetLeftPx: 0,
      };

      // Sanity: within [10, 16] (z=9 deliberately excluded — that is where
      // everything merges into one blob and trivially satisfies both
      // constraints, which is not the regime this test targets), the
      // legibility-only floor is 13.
      const legibilityOnly = narrowToLegibleZoomWindow(anchors, projectAtZoom, 10, 16);
      expect(legibilityOnly).toEqual({ minZoom: 13, maxZoom: 16 });

      // z=10 is the ONLY zoom in [10, 16] where every raw anchor (including
      // M, always centred) is contained, and the A/B cluster's own
      // (batch-max-sized) card clips there too — so it is also the
      // LARGEST raw-contained zoom. The intersection of "raw contained"
      // and "cluster contained" is empty across the whole range: the fix
      // must fall back to 10 (raw-anchor-only), never regress to the
      // legibility floor (13), which the pre-fix all-or-nothing conjunct
      // did (it found no zoom satisfying both and returned null).
      const { minZoom, maxZoom } = narrowToLegibleZoomWindow(anchors, projectAtZoom, 10, 16, usableViewport);
      expect(minZoom).toBe(10);
      expect(minZoom).not.toBe(13);
      expect(maxZoom).toBe(16);
    });

    it('does not needlessly reject a zoom when every cluster (not just every raw anchor) is genuinely contained — never over-widens', () => {
      // Same fixture, but a viewport generous enough that neither raw
      // anchors nor the A/B cluster's enlarged (batch-max) card ever clip
      // anywhere in [9, 16] — containment must be a no-op here, exactly
      // like the sibling "is a no-op" test above.
      const pqDelta = 3 / 2 ** 9;
      const abOffsetLon = 0.15;
      const rsOffsetLon = 0.02;
      const P = { lat: BASE_LAT, lon: BASE_LON, footprintWidthPx: 40, footprintHeightPx: 40 };
      const Q = { lat: BASE_LAT, lon: BASE_LON + pqDelta, footprintWidthPx: 40, footprintHeightPx: 40 };
      const A = {
        lat: BASE_LAT + 0.005,
        lon: BASE_LON + abOffsetLon,
        footprintWidthPx: 10,
        footprintHeightPx: 10,
      };
      const B = {
        lat: BASE_LAT + 0.005,
        lon: BASE_LON + abOffsetLon + 0.0000001,
        footprintWidthPx: 10,
        footprintHeightPx: 10,
      };
      const R = { lat: BASE_LAT, lon: BASE_LON + rsOffsetLon, footprintWidthPx: 10, footprintHeightPx: 10 };
      const S = {
        lat: BASE_LAT,
        lon: BASE_LON + rsOffsetLon + 0.0000001,
        footprintWidthPx: 10,
        footprintHeightPx: 10,
      };
      const anchors = [P, Q, A, B, R, S];

      const generousViewport = {
        widthPx: 20000,
        heightPx: 20000,
        insetTopPx: 0,
        insetRightPx: 0,
        insetBottomPx: 0,
        insetLeftPx: 0,
      };

      const withoutViewport = narrowToLegibleZoomWindow(anchors, projectAtZoom, 9, 16);
      const withViewport = narrowToLegibleZoomWindow(anchors, projectAtZoom, 9, 16, generousViewport);
      expect(withViewport).toEqual(withoutViewport);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Issue #1943 (Stage-B rework) — TASK 2 "Option B": MapController's
// 'overview'-framed cameraIntent branch widens its fitBounds/flyTo zoom
// ceiling from AREA_LAYER_MAX_ZOOM (12) to LEAF_FIT_MAX_ZOOM (16) ONLY
// while the canonical Areas hierarchy is showing its 'clusters'/'directions'
// level (a destination-cluster-card drill-in click) — every OTHER
// 'overview' producer (macro-region pin, legacy area-group chip) keeps the
// original AREA_LAYER_MAX_ZOOM ceiling unchanged.
// ─────────────────────────────────────────────────────────────────────────
describe('MapController — overview framing zoom ceiling (Task 2 — Option B)', () => {
  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    mapStub.setView.mockClear();
  });

  type Journey = NonNullable<React.ComponentProps<typeof PropertyMap>['areasNavigationJourney']>;

  const journeyAt = (levelKind: Journey['levelKind']): Journey =>
    ({
      node: null,
      levelKind,
      children: [],
      selectNode: vi.fn(),
    }) as unknown as Journey;

  const overviewBounds: [[number, number], [number, number]] = [
    [12.9, 77.5],
    [13.0, 77.7],
  ];

  const renderThenPublishOverviewIntent = (levelKind: Journey['levelKind'] | undefined) => {
    const props = {
      ...baseProps,
      areasNavigationJourney: levelKind ? journeyAt(levelKind) : null,
    };
    const utils = render(<PropertyMap {...props} cameraIntent={null} />);
    utils.rerender(
      <PropertyMap
        {...props}
        cameraIntent={{ seq: 1, framing: 'overview', bounds: overviewBounds, center: [12.97, 77.6] }}
      />,
    );
    return utils;
  };

  it('widens the ceiling to LEAF_FIT_MAX_ZOOM while levelKind is "clusters" (a destination-cluster drill-in click)', () => {
    renderThenPublishOverviewIntent('clusters');
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    const [, options] = mapStub.fitBounds.mock.calls[0];
    expect(options).toMatchObject({ maxZoom: LEAF_FIT_MAX_ZOOM });
  });

  it('widens the ceiling to LEAF_FIT_MAX_ZOOM while levelKind is "directions"', () => {
    renderThenPublishOverviewIntent('directions');
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    const [, options] = mapStub.fitBounds.mock.calls[0];
    expect(options).toMatchObject({ maxZoom: LEAF_FIT_MAX_ZOOM });
  });

  it('keeps the ORIGINAL AREA_LAYER_MAX_ZOOM ceiling for every other levelKind (e.g. "areas") — unaffected by Task 2', () => {
    renderThenPublishOverviewIntent('areas');
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    const [, options] = mapStub.fitBounds.mock.calls[0];
    expect(options).toMatchObject({ maxZoom: AREA_LAYER_MAX_ZOOM });
    expect(AREA_LAYER_MAX_ZOOM).not.toBe(LEAF_FIT_MAX_ZOOM); // sanity — the two ceilings really do differ
  });

  it('keeps the ORIGINAL AREA_LAYER_MAX_ZOOM ceiling when no canonical Areas journey is active at all (macro-region / legacy area-group pin, unaffected by Task 2)', () => {
    renderThenPublishOverviewIntent(undefined);
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    const [, options] = mapStub.fitBounds.mock.calls[0];
    expect(options).toMatchObject({ maxZoom: AREA_LAYER_MAX_ZOOM });
  });
});
