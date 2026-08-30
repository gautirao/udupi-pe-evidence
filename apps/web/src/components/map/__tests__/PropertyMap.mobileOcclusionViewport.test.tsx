/**
 * Issue #2129 — mobile lower-map listing markers must stay tappable after
 * the compact preview sheet opens.
 *
 * Follow-up to #1823/PR #2128: AreaPanner's one-time fitBounds padding only
 * reserves the bottom `bottomOcclusionPx` band at the MOMENT of a
 * canonical-node fit. A plain user pan/drag afterwards is not re-guarded,
 * so a marker can drift into the band the compact preview sheet
 * (MobileListingPreviewSheet, z-[1100], bottom-anchored) will later cover.
 *
 * The fix shrinks the Leaflet container's own clipped viewport — but on
 * `previewOcclusionPx`, NOT `bottomOcclusionPx` (code-reviewer cycle 1,
 * Finding 1). `bottomOcclusionPx` is a proactive journey/capability signal
 * (`mobileMapOpen && isMarkerPopoverEligible`, MapDiscovery.tsx) that is
 * true for the WHOLE mobile Map-mode browsing session in an eligible
 * journey, independent of whether the sheet is ever actually opened — it
 * remains correct as AreaPanner's one-time fit-time padding input, but
 * using it to drive a PERSISTENT DOM clip would visibly shrink the map for
 * the entire session before any marker is ever tapped (the exact defect
 * code-reviewer caught in fix cycle 1). `previewOcclusionPx` is the
 * REACTIVE counterpart (`mobileMapOpen && selectedListingPreview`) that is
 * 0 unless the sheet is actually selected/rendered right now, and is the
 * value that must drive the persistent viewport-clipping wrapper.
 *
 * These tests assert the wrapper element PropertyMap renders
 * (data-testid="discover-map-usable-viewport") is keyed on
 * previewOcclusionPx alone — critically including the regression case that
 * shipped undetected in cycle 1: an eligible journey with NO preview
 * selected (bottomOcclusionPx=150, previewOcclusionPx=0) must leave
 * ordinary mobile map browsing at full height. The DOM-clipping behaviour
 * itself (actual Leaflet marker positions) requires a real browser (E2E,
 * authored separately by qa) since react-leaflet is mocked here.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({ on: vi.fn().mockReturnThis() })),
    markerClusterGroup: vi.fn(() => ({ addLayer: vi.fn(), on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis() })),
    point: vi.fn((x: number, y: number) => ({ x, y })),
  },
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.Default.css', () => ({}));
vi.mock('leaflet.markercluster', () => ({}));

const mapStub = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  getZoom: vi.fn(() => 11),
  getBounds: vi.fn(() => ({
    getNorth: () => 14,
    getSouth: () => 13,
    getEast: () => 75,
    getWest: () => 74,
  })),
  getContainer: vi.fn(() => document.body),
  on: vi.fn(),
  off: vi.fn(),
  invalidateSize: vi.fn(),
  setView: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 13.3409, lng: 74.7421 })),
  remove: vi.fn(),
}));

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
vi.mock('@/components/map/AreaMarkerLayer', () => ({ AreaMarkerLayer: () => null }));
vi.mock('@/components/map/SchoolMarkerLayer', () => ({ SchoolMarkerLayer: () => null }));
vi.mock('@/dev/ScaleHud', () => ({ ScaleHud: () => null }));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { PropertyMap } from '@/components/map/PropertyMap';

const baseProps = {
  listings: [],
  cityCenter: [13.3409, 74.7421] as [number, number],
  cityZoom: 11,
  resetMapTick: 0,
  areas: [],
};

describe('PropertyMap — #2129 mobile usable-viewport reservation', () => {
  it('previewOcclusionPx > 0 (sheet actually open): the usable-viewport wrapper is shrunk by exactly that amount', () => {
    render(<PropertyMap {...baseProps} bottomOcclusionPx={150} previewOcclusionPx={150} />);
    const wrapper = screen.getByTestId('discover-map-usable-viewport');
    expect(wrapper.getAttribute('data-bottom-occlusion-px')).toBe('150');
    expect(wrapper.style.height).toBe('calc(100% - 150px)');
  });

  it('REGRESSION (code-reviewer cycle 1, Finding 1) — eligible journey but NO preview selected: bottomOcclusionPx=150 must NOT shrink the viewport; only previewOcclusionPx drives the persistent clip', () => {
    render(<PropertyMap {...baseProps} bottomOcclusionPx={150} previewOcclusionPx={0} />);
    const wrapper = screen.getByTestId('discover-map-usable-viewport');
    expect(wrapper.getAttribute('data-bottom-occlusion-px')).toBe('0');
    expect(wrapper.style.height).toBe('100%');
  });

  it('previewOcclusionPx omitted (default 0): the wrapper is a full-height no-op, unchanged from pre-#2129 layout, even with bottomOcclusionPx set', () => {
    render(<PropertyMap {...baseProps} bottomOcclusionPx={150} />);
    const wrapper = screen.getByTestId('discover-map-usable-viewport');
    expect(wrapper.getAttribute('data-bottom-occlusion-px')).toBe('0');
    expect(wrapper.style.height).toBe('100%');
  });

  it('desktop / no props at all: stays full height', () => {
    render(<PropertyMap {...baseProps} />);
    const wrapper = screen.getByTestId('discover-map-usable-viewport');
    expect(wrapper.style.height).toBe('100%');
  });
});
