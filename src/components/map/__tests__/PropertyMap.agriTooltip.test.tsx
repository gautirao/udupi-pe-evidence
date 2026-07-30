/**
 * Issue #1465 — Agri marker hover tooltip tests.
 *
 * Strategy:
 *   A) Pure helper `buildAgriMarkerLabel` — covers all label-building logic
 *      in isolation (no Leaflet mocking needed for label assertions).
 *   B) Integration smoke test through the Leaflet mock: verifies
 *      marker.bindTooltip is called for each listing AND that the
 *      click handler still invokes onSelectListing (no #1466 regression).
 */

// ─── Mocks (must precede imports) ────────────────────────────────────────────

const mockBindTooltip = vi.fn().mockReturnThis();
const mockOn = vi.fn().mockReturnThis();
const mockAddLayer = vi.fn();
const mockRemoveLayer = vi.fn();
const mockClusterGroupAddLayer = vi.fn();

// Capture the click callbacks registered via marker.on('click', cb) so we can
// fire them manually to assert onSelectListing is called.
const capturedClickCallbacks: Array<() => void> = [];

vi.mock('leaflet', () => {
  return {
    default: {
      Icon: {
        Default: {
          prototype: {},
          mergeOptions: vi.fn(),
        },
      },
      divIcon: vi.fn((opts: { html: string; className?: string; iconSize?: unknown }) => ({
        options: opts,
      })),
      marker: vi.fn(() => {
        const m = {
          on: vi.fn((event: string, cb: () => void) => {
            if (event === 'click') capturedClickCallbacks.push(cb);
            return m;
          }),
          bindTooltip: mockBindTooltip,
        };
        return m;
      }),
      markerClusterGroup: vi.fn(() => ({
        addLayer: mockClusterGroupAddLayer,
      })),
      point: vi.fn((x: number, y: number) => ({ x, y })),
    },
  };
});

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TileLayer: () => null,
  ZoomControl: () => null,
  Polygon: vi.fn(() => null),
  useMap: vi.fn(() => ({
    addLayer: mockAddLayer,
    removeLayer: mockRemoveLayer,
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    getBounds: vi.fn(() => ({
      getNorth: vi.fn(() => 14),
      getSouth: vi.fn(() => 13),
      getEast: vi.fn(() => 75),
      getWest: vi.fn(() => 74),
    })),
    getCenter: vi.fn(() => ({ lat: 13.5, lng: 74.7 })),
    getZoom: vi.fn(() => 12),
    setView: vi.fn().mockReturnThis(),
    getContainer: vi.fn(() => document.body),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
  })),
  useMapEvents: vi.fn(() => ({
    getBounds: vi.fn(() => ({
      getNorth: vi.fn(() => 14),
      getSouth: vi.fn(() => 13),
      getEast: vi.fn(() => 75),
      getWest: vi.fn(() => 74),
    })),
    getZoom: vi.fn(() => 12),
    getContainer: vi.fn(() => document.body),
  })),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.Default.css', () => ({}));
vi.mock('leaflet.markercluster', () => ({}));
vi.mock('leaflet-draw', () => ({}));
vi.mock('leaflet-draw/dist/leaflet.draw.css', () => ({}));

vi.mock('@/components/map/DrawControl', () => ({
  DrawControl: () => null,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// escapeHtml used in buildAgriMarkerLabel — mock to identity so label assertions
// don't need to account for HTML encoding (tested separately in PropertyMap.test.tsx).
vi.mock('@/lib/security', () => ({
  escapeHtml: (s: string) => s,
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { PropertyListingWithImages } from '../PropertyMap';

// ─── Section A: pure helper unit tests ───────────────────────────────────────

describe('buildAgriMarkerLabel — pure label logic (Issue #1465)', () => {
  // Import after mocks so escapeHtml mock is active.
  // Dynamic import is used to isolate from the integration tests below.

  it('returns the title when non-null and non-blank', async () => {
    const { buildAgriMarkerLabel } = await import('../PropertyMap');
    expect(buildAgriMarkerLabel('3-Acre Paddy Field, Udupi', 'Udupi', 3, 'acres')).toBe(
      '3-Acre Paddy Field, Udupi',
    );
  });

  it('trims whitespace from title before using it', async () => {
    const { buildAgriMarkerLabel } = await import('../PropertyMap');
    expect(buildAgriMarkerLabel('  Coconut Grove  ', 'Udupi', null, null)).toBe('Coconut Grove');
  });

  it('falls back to locality · acreage when title is null', async () => {
    const { buildAgriMarkerLabel } = await import('../PropertyMap');
    expect(buildAgriMarkerLabel(null, 'Hebri', 5, 'acres')).toBe('Hebri · 5 acres');
  });

  it('falls back to locality · acreage when title is blank string', async () => {
    const { buildAgriMarkerLabel } = await import('../PropertyMap');
    expect(buildAgriMarkerLabel('   ', 'Uchila', 2.5, 'acres')).toBe('Uchila · 2.5 acres');
  });

  it('falls back to acreage only when locality is missing', async () => {
    const { buildAgriMarkerLabel } = await import('../PropertyMap');
    expect(buildAgriMarkerLabel(null, null, 10, 'acres')).toBe('10 acres');
  });

  it('falls back to acreage only when locality is blank', async () => {
    const { buildAgriMarkerLabel } = await import('../PropertyMap');
    expect(buildAgriMarkerLabel(null, '   ', 4, 'acres')).toBe('4 acres');
  });

  it('falls back to locality only when acreage is null', async () => {
    const { buildAgriMarkerLabel } = await import('../PropertyMap');
    expect(buildAgriMarkerLabel(null, 'Agumbe', null, null)).toBe('Agumbe');
  });

  it('returns generic fallback when all inputs are null', async () => {
    const { buildAgriMarkerLabel } = await import('../PropertyMap');
    expect(buildAgriMarkerLabel(null, null, null, null)).toBe('Agricultural land');
  });

  it('returns generic fallback when all inputs are undefined', async () => {
    const { buildAgriMarkerLabel } = await import('../PropertyMap');
    expect(buildAgriMarkerLabel(undefined, undefined, undefined, undefined)).toBe(
      'Agricultural land',
    );
  });

  it('never returns the string "undefined"', async () => {
    const { buildAgriMarkerLabel } = await import('../PropertyMap');
    const label = buildAgriMarkerLabel(undefined, undefined, undefined, undefined);
    expect(label).not.toContain('undefined');
  });

  it('never returns the string "null"', async () => {
    const { buildAgriMarkerLabel } = await import('../PropertyMap');
    const label = buildAgriMarkerLabel(null, null, null, null);
    expect(label).not.toContain('null');
  });

  it('never returns an empty string', async () => {
    const { buildAgriMarkerLabel } = await import('../PropertyMap');
    const label = buildAgriMarkerLabel(null, null, null, null);
    expect(label.trim()).not.toBe('');
  });

  it('uses unit "acres" as default when landAreaUnit is null', async () => {
    const { buildAgriMarkerLabel } = await import('../PropertyMap');
    expect(buildAgriMarkerLabel(null, null, 7, null)).toBe('7 acres');
  });
});

// ─── Section B: integration smoke tests through PropertyMap ──────────────────

describe('AgriMarkerClusterLayer — bindTooltip + click wiring (Issue #1465)', () => {
  beforeEach(() => {
    mockBindTooltip.mockClear();
    mockOn.mockClear();
    mockAddLayer.mockClear();
    mockRemoveLayer.mockClear();
    mockClusterGroupAddLayer.mockClear();
    capturedClickCallbacks.length = 0;
  });

  it('calls bindTooltip for each agri listing with permanent:false and direction:top', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    const listings = [
      {
        id: 'agri-1',
        title: 'Paddy Field',
        property_type: 'agricultural_land' as const,
        latitude: 13.4,
        longitude: 74.8,
        price: 500_000,
        status: 'LIVE' as const,
        locality: 'Udupi Rural',
        land_area: 3,
        land_area_unit: 'acres',
        created_at: '',
        updated_at: '',
      },
      {
        id: 'agri-2',
        title: null,
        property_type: 'agricultural_land' as const,
        latitude: 13.45,
        longitude: 74.85,
        price: null,
        status: 'LIVE' as const,
        locality: 'Hebri',
        land_area: 5,
        land_area_unit: 'acres',
        created_at: '',
        updated_at: '',
      },
    ];

    render(<PropertyMap listings={listings as unknown as PropertyListingWithImages[]} isAgriMode={true} />);

    // bindTooltip called once per listing
    expect(mockBindTooltip).toHaveBeenCalledTimes(2);

    // All calls use permanent:false direction:top (hover-only, mirrors SchoolMarkerLayer)
    for (const call of mockBindTooltip.mock.calls) {
      const opts = call[1] as { permanent: boolean; direction: string; offset: number[] };
      expect(opts.permanent).toBe(false);
      expect(opts.direction).toBe('top');
    }
  });

  it('tooltip label for a listing with a title uses the title', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    const listings = [
      {
        id: 'agri-title',
        title: '3-Acre Paddy Field, Udupi',
        property_type: 'agricultural_land' as const,
        latitude: 13.4,
        longitude: 74.8,
        price: null,
        status: 'LIVE' as const,
        locality: 'Udupi',
        land_area: 3,
        land_area_unit: 'acres',
        created_at: '',
        updated_at: '',
      },
    ];

    render(<PropertyMap listings={listings as unknown as PropertyListingWithImages[]} isAgriMode={true} />);

    expect(mockBindTooltip).toHaveBeenCalledTimes(1);
    const label = mockBindTooltip.mock.calls[0][0] as string;
    expect(label).toBe('3-Acre Paddy Field, Udupi');
  });

  it('tooltip label falls back to locality · acreage when title is null', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    const listings = [
      {
        id: 'agri-no-title',
        title: null,
        property_type: 'agricultural_land' as const,
        latitude: 13.4,
        longitude: 74.8,
        price: null,
        status: 'LIVE' as const,
        locality: 'Hebri',
        land_area: 5,
        land_area_unit: 'acres',
        created_at: '',
        updated_at: '',
      },
    ];

    render(<PropertyMap listings={listings as unknown as PropertyListingWithImages[]} isAgriMode={true} />);

    expect(mockBindTooltip).toHaveBeenCalledTimes(1);
    const label = mockBindTooltip.mock.calls[0][0] as string;
    expect(label).toBe('Hebri · 5 acres');
  });

  it('click handler still invokes onSelectListing — no #1466 regression', async () => {
    const { PropertyMap } = await import('../PropertyMap');
    const onSelectListing = vi.fn();

    const listings = [
      {
        id: 'agri-click',
        title: 'Some Field',
        property_type: 'agricultural_land' as const,
        latitude: 13.4,
        longitude: 74.8,
        price: null,
        status: 'LIVE' as const,
        locality: 'Udupi',
        land_area: 2,
        land_area_unit: 'acres',
        created_at: '',
        updated_at: '',
      },
    ];

    render(<PropertyMap listings={listings as unknown as PropertyListingWithImages[]} isAgriMode={true} onSelectListing={onSelectListing} />);

    // Simulate marker click — should fire onSelectListing
    expect(capturedClickCallbacks).toHaveLength(1);
    capturedClickCallbacks[0]();
    expect(onSelectListing).toHaveBeenCalledTimes(1);
    expect(onSelectListing).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agri-click' }),
    );
  });
});
