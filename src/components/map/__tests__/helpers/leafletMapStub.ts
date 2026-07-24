import { vi } from 'vitest';

/**
 * Issue #2005 (Slice 2 PR6) — Category C shared test infrastructure.
 *
 * A minimal Leaflet `Map` instance stub for components that call `useMap()`
 * from react-leaflet. Modelled on the file-local `mapStub` in
 * src/components/map/__tests__/PropertyMap.jitterDiagnostic.test.tsx (the
 * richest of three near-identical file-local stubs in the tree — see also
 * AreaMarkerLayer.test.tsx and PropertyMap.areaPanner.test.tsx).
 *
 * `createMapStub()` is a FACTORY, not a shared singleton: every call returns
 * a fresh set of `vi.fn()` spies so tests do not leak mock-call-state across
 * suites (or across renders within a suite that mounts more than one map).
 * Each new Category-C test file should wire its own instance into
 * `vi.hoisted(() => createMapStub())` + `vi.mock('react-leaflet', ...)`.
 *
 * Method coverage — every `map.<method>(` call across the 4 Category-C
 * production files (useDiscoverCameraOrchestration.ts,
 * useDiscoverJourneyTransitions.ts, useDiscoverBadgeAnnounce.ts,
 * AreaMarkerLayer.tsx) was enumerated before finalizing this list. Only
 * AreaMarkerLayer.tsx calls the map instance directly (getZoom, on/off for
 * zoomend, getSize, latLngToContainerPoint, containerPointToLatLng, plus the
 * camera methods below for completeness/parity with the other file-local
 * stubs in the tree) — the other three Category-C files are pure state
 * hooks with no direct Leaflet access.
 */
export interface MapStub {
  fitBounds: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
  setView: ReturnType<typeof vi.fn>;
  setZoom: ReturnType<typeof vi.fn>;
  getZoom: ReturnType<typeof vi.fn>;
  getBoundsZoom: ReturnType<typeof vi.fn>;
  getBounds: ReturnType<typeof vi.fn>;
  getCenter: ReturnType<typeof vi.fn>;
  getContainer: ReturnType<typeof vi.fn>;
  getSize: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  invalidateSize: ReturnType<typeof vi.fn>;
  addLayer: ReturnType<typeof vi.fn>;
  removeLayer: ReturnType<typeof vi.fn>;
  containerPointToLatLng: ReturnType<typeof vi.fn>;
  latLngToContainerPoint: ReturnType<typeof vi.fn>;
}

export interface CreateMapStubOptions {
  /** Initial value returned by getZoom() (default 11). */
  zoom?: number;
  /** Viewport pixel size returned by getSize() (default 1200x800). */
  size?: { x: number; y: number };
}

/**
 * Deterministic lat/lon -> pixel projection standing in for Leaflet's real
 * map.latLngToContainerPoint — mirrors the projection used in
 * AreaMarkerLayer.test.tsx so callers can reuse fixtures/expectations.
 */
function projectLatLon(lat: number, lon: number): { x: number; y: number } {
  return { x: (lon - 74.5) * 10000, y: (13.5 - lat) * 10000 };
}

export function createMapStub(options: CreateMapStubOptions = {}): MapStub {
  const zoom = { current: options.zoom ?? 11 };
  const size = options.size ?? { x: 1200, y: 800 };

  return {
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    setView: vi.fn().mockReturnThis(),
    setZoom: vi.fn((z: number) => {
      zoom.current = z;
    }),
    getZoom: vi.fn(() => zoom.current),
    getBoundsZoom: vi.fn(() => zoom.current + 2),
    getBounds: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 13.34, lng: 74.74 })),
    getContainer: vi.fn(() => document.createElement('div')),
    getSize: vi.fn(() => size),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    invalidateSize: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    containerPointToLatLng: vi.fn(({ x, y }: { x: number; y: number }) => ({
      lat: 13.5 - y / 10000,
      lng: x / 10000 + 74.5,
    })),
    latLngToContainerPoint: vi.fn(([lat, lon]: [number, number]) => projectLatLon(lat, lon)),
  };
}
