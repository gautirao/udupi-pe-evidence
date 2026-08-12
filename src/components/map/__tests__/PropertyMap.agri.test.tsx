/**
 * Issue #1372 — AgriMarkerClusterLayer rendering tests.
 *
 * Confirms that:
 *   1. isAgriMode=true renders AgriMarkerClusterLayer (agri-cluster icon) and NOT MarkerClusterLayer.
 *   2. isAgriMode=false (default) renders MarkerClusterLayer and NOT AgriMarkerClusterLayer.
 */

// ─── Mocks (must precede imports) ────────────────────────────────────────────

// Capture divIcon calls so we can distinguish agri-cluster vs custom-marker-cluster HTML.
const capturedDivIconCalls: Array<{ html: string }> = [];

// Track addLayer calls per clusterGroup so we can verify mount/unmount.
const mockAddLayer = vi.fn();
const mockRemoveLayer = vi.fn();
const mockClusterGroupAddLayer = vi.fn();

vi.mock('leaflet', () => {
  return {
    default: {
      Icon: {
        Default: {
          prototype: {},
          mergeOptions: vi.fn(),
        },
      },
      divIcon: vi.fn((opts: { html: string; className?: string; iconSize?: unknown }) => {
        capturedDivIconCalls.push({ html: opts.html ?? '' });
        return { options: opts };
      }),
      marker: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        bindTooltip: vi.fn().mockReturnThis(),
      })),
      markerClusterGroup: vi.fn(() => ({
        addLayer: mockClusterGroupAddLayer,
        // iconCreateFunction is stored by the cluster group; we invoke it manually below
        // where we need to inspect the generated HTML.
        // Issue #1762 — MarkerClusterLayer (residential) now registers/
        // unregisters a clusterclick/clusterkeypress listener on the group.
        on: vi.fn().mockReturnThis(),
        off: vi.fn().mockReturnThis(),
      })),
      point: vi.fn((x: number, y: number) => ({ x, y })),
    },
  };
});

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TileLayer: () => null,
  ZoomControl: () => null,
  Polygon: vi.fn(({ pathOptions }: { pathOptions?: { interactive?: boolean } }) => (
    <div
      data-testid="mock-sector-polygon"
      data-interactive={String(pathOptions?.interactive)}
    />
  )),
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
    // Issue #1762 fix — MarkerClusterLayer registers a general 'moveend'
    // listener directly on the map on mount now, not just inside a
    // cluster-click handler.
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
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

// ─── Imports after mocks ──────────────────────────────────────────────────────
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import L from 'leaflet';

// ─── Shared listing fixture ───────────────────────────────────────────────────
const agriListing = {
  id: 'agri-1',
  title: 'Paddy Field',
  property_type: 'agricultural_land' as const,
  latitude: 13.4,
  longitude: 74.8,
  price: 500_000,
  status: 'LIVE' as const,
  locality: 'Udupi Rural',
  created_at: '',
  updated_at: '',
};

const houseListing = {
  id: 'house-1',
  title: 'Modern House',
  property_type: 'house' as const,
  latitude: 13.35,
  longitude: 74.75,
  price: 1_000_000,
  status: 'LIVE' as const,
  locality: 'Udupi',
  created_at: '',
  updated_at: '',
};

describe('PropertyMap — AgriMarkerClusterLayer (Issue #1372)', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    mockAddLayer.mockClear();
    mockRemoveLayer.mockClear();
    mockClusterGroupAddLayer.mockClear();
    vi.mocked(L.markerClusterGroup).mockClear();
    vi.mocked(L.divIcon).mockClear();
  });

  it('agri mode: markerClusterGroup is created and added to the map for agri listings', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    render(<PropertyMap listings={[agriListing]} isAgriMode={true} />);

    // markerClusterGroup should have been called (AgriMarkerClusterLayer uses it)
    expect(L.markerClusterGroup).toHaveBeenCalled();
    // The cluster group should be added to the map
    expect(mockAddLayer).toHaveBeenCalled();
  });

  it('agri mode: cluster icon HTML contains agri-cluster class and wheat emoji', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    // Capture the iconCreateFunction passed to markerClusterGroup
    let capturedIconCreateFn: ((cluster: { getChildCount: () => number }) => unknown) | undefined;
    vi.mocked(L.markerClusterGroup).mockImplementationOnce((opts) => {
      if (opts?.iconCreateFunction) {
        capturedIconCreateFn = opts.iconCreateFunction as typeof capturedIconCreateFn;
      }
      return {
        addLayer: mockClusterGroupAddLayer,
        on: vi.fn().mockReturnThis(),
        off: vi.fn().mockReturnThis(),
      } as unknown as ReturnType<typeof L.markerClusterGroup>;
    });

    render(<PropertyMap listings={[agriListing]} isAgriMode={true} />);

    expect(capturedIconCreateFn).toBeDefined();

    // Invoke iconCreateFunction with count=5 (small bucket)
    capturedIconCreateFn!({ getChildCount: () => 5 });

    // The most recent divIcon call should have agri-cluster HTML
    const lastCall = capturedDivIconCalls[capturedDivIconCalls.length - 1];
    expect(lastCall).toBeDefined();
    expect(lastCall.html).toContain('agri-cluster');
    expect(lastCall.html).toContain('🌾');
    expect(lastCall.html).toContain('5 properties');
    // Should NOT contain residential cluster class
    expect(lastCall.html).not.toContain('custom-marker-cluster');
  });

  it('non-agri mode (default): cluster icon HTML contains custom-marker-cluster and NO agri-cluster', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    let capturedIconCreateFn: ((cluster: { getChildCount: () => number }) => unknown) | undefined;
    vi.mocked(L.markerClusterGroup).mockImplementationOnce((opts) => {
      if (opts?.iconCreateFunction) {
        capturedIconCreateFn = opts.iconCreateFunction as typeof capturedIconCreateFn;
      }
      return {
        addLayer: mockClusterGroupAddLayer,
        on: vi.fn().mockReturnThis(),
        off: vi.fn().mockReturnThis(),
      } as unknown as ReturnType<typeof L.markerClusterGroup>;
    });

    render(<PropertyMap listings={[houseListing]} isAgriMode={false} />);

    expect(capturedIconCreateFn).toBeDefined();
    capturedIconCreateFn!({ getChildCount: () => 3 });

    const lastCall = capturedDivIconCalls[capturedDivIconCalls.length - 1];
    expect(lastCall).toBeDefined();
    expect(lastCall.html).toContain('custom-marker-cluster');
    expect(lastCall.html).not.toContain('agri-cluster');
    expect(lastCall.html).not.toContain('🌾');
  });

  it('non-agri mode (isAgriMode omitted): falls back to residential MarkerClusterLayer', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    let capturedIconCreateFn: ((cluster: { getChildCount: () => number }) => unknown) | undefined;
    vi.mocked(L.markerClusterGroup).mockImplementationOnce((opts) => {
      if (opts?.iconCreateFunction) {
        capturedIconCreateFn = opts.iconCreateFunction as typeof capturedIconCreateFn;
      }
      return {
        addLayer: mockClusterGroupAddLayer,
        on: vi.fn().mockReturnThis(),
        off: vi.fn().mockReturnThis(),
      } as unknown as ReturnType<typeof L.markerClusterGroup>;
    });

    // No isAgriMode prop → defaults to false
    render(<PropertyMap listings={[houseListing]} />);

    expect(capturedIconCreateFn).toBeDefined();
    capturedIconCreateFn!({ getChildCount: () => 1 });

    const lastCall = capturedDivIconCalls[capturedDivIconCalls.length - 1];
    expect(lastCall.html).not.toContain('agri-cluster');
  });
});

// ─── Issue #2139 code-review follow-up: AgriMarkerClusterLayer coincident- ──
// ─── coordinate marker separation ───────────────────────────────────────────

describe('PropertyMap — AgriMarkerClusterLayer coincident-coordinate marker separation (Issue #2139)', () => {
  // Mirrors the residential MarkerClusterLayer coverage in
  // PropertyMap.clusterTapFit.test.tsx ("Issue #2139 — coincident-coordinate
  // marker separation wiring"). AgriMarkerClusterLayer uses the SAME
  // disableClusteringAtZoom/maxClusterRadius constants as the residential
  // layer, so agri listings sharing (near-)identical fallback-tier geocoded
  // coordinates are equally exposed to full occlusion once zoom crosses
  // disableClusteringAtZoom — this proves the fix is wired end-to-end via
  // the actual `L.marker` construction calls for the agri layer too.
  const agriListingA = { ...agriListing, id: 'agri-a' };
  const agriListingB = { ...agriListing, id: 'agri-b' };
  const agriListingC = { ...agriListing, id: 'agri-c' };

  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    mockAddLayer.mockClear();
    mockRemoveLayer.mockClear();
    mockClusterGroupAddLayer.mockClear();
    vi.mocked(L.marker).mockClear();
  });

  it('3 agri listings sharing identical coordinates are constructed as 3 markers at 3 distinct [lat,lng] positions', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    render(
      <PropertyMap
        listings={[agriListingA, agriListingB, agriListingC]}
        isAgriMode={true}
      />,
    );

    const markerCalls = vi.mocked(L.marker).mock.calls;
    const lastThree = markerCalls.slice(-3) as unknown as Array<[[number, number], unknown]>;

    // All 3 listings share agriListing's exact [13.4, 74.8] — assert the fix
    // actually moved them apart (the pre-fix behaviour would construct all
    // 3 at the byte-identical raw coordinate).
    const positions = lastThree.map((call) => call[0]);
    expect(positions[0]).not.toEqual([agriListing.latitude, agriListing.longitude]);
    expect(positions[1]).not.toEqual([agriListing.latitude, agriListing.longitude]);
    expect(positions[2]).not.toEqual([agriListing.latitude, agriListing.longitude]);
    expect(positions[0]).not.toEqual(positions[1]);
    expect(positions[0]).not.toEqual(positions[2]);
    expect(positions[1]).not.toEqual(positions[2]);
  });

  it('a single non-coincident agri listing still renders at its exact original coordinates, unaffected by the fix', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    render(<PropertyMap listings={[agriListing]} isAgriMode={true} />);

    const markerCalls = vi.mocked(L.marker).mock.calls;
    const lastCall = markerCalls[markerCalls.length - 1] as unknown as [[number, number], unknown];
    expect(lastCall[0]).toEqual([agriListing.latitude, agriListing.longitude]);
  });

  it('does not add or drop agri markers — a mix of one coincident pair and one distinct listing still constructs exactly 3 markers, one per listing', async () => {
    const { PropertyMap } = await import('../PropertyMap');
    const distinctListing = { ...agriListing, id: 'agri-distinct', latitude: 13.6, longitude: 74.9 };

    render(
      <PropertyMap
        listings={[agriListingA, agriListingB, distinctListing]}
        isAgriMode={true}
      />,
    );

    const markerCalls = vi.mocked(L.marker).mock.calls;
    const lastThree = markerCalls.slice(-3) as unknown as Array<[[number, number], unknown]>;
    // The distinct listing's own coordinates are untouched.
    expect(lastThree[2][0]).toEqual([13.6, 74.9]);
    // The coincident pair separated from each other.
    expect(lastThree[0][0]).not.toEqual(lastThree[1][0]);
  });
});

// ─── AC4: SectorOverlay conditional render guard (Issue #1429) ───────────────

describe('PropertyMap — SectorOverlay conditional render (Issue #1429 AC4)', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    mockAddLayer.mockClear();
    mockRemoveLayer.mockClear();
    mockClusterGroupAddLayer.mockClear();
  });

  it('Test A: sectorOverlay=null (default) renders no Polygon', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    render(<PropertyMap listings={[agriListing]} isAgriMode={true} />);

    // No sectorOverlay prop → SectorOverlay is not mounted → no mock-sector-polygon
    expect(screen.queryByTestId('mock-sector-polygon')).not.toBeInTheDocument();
  });

  it('Test B: sectorOverlay set → Polygon is rendered', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    render(
      <PropertyMap
        listings={[agriListing]}
        isAgriMode={true}
        cityCenter={[13.34, 74.74]}
        sectorOverlay={{ directionCode: 'NW', maxKm: 50 }}
      />,
    );

    // SectorOverlay is mounted → it renders the mocked Polygon
    expect(screen.getByTestId('mock-sector-polygon')).toBeInTheDocument();
  });
});
