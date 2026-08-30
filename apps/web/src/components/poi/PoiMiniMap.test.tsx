/**
 * PoiMiniMap — #1797 AC8 / #1726 privacy tests.
 *
 * #1726 coarsening withholds latitude/longitude for anon residential listings by
 * returning null. PoiMiniMap must never leak the exact pin or nearby-POI data in
 * that case:
 *   (a) coords absent → the POI query (`GET /api/listings/:id/pois`) must NOT fire
 *       at all, and the component must render an honest static fallback with no
 *       map, no POI markers/lines, and no fabricated distances.
 *   (b) coords present → the map renders, and any POI whose `distanceMeters` is
 *       null falls back to a haversine distance computed ONLY from the coordinates
 *       the POI endpoint itself returned (never a guess).
 *
 * react-leaflet/leaflet are mocked (pattern from ListingDetailBoundaryMap.test.tsx)
 * because MapContainer throws in JSDOM (zero-size canvas, no real layout engine).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Mock react-leaflet ─────────────────────────────────────────────────────
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ icon, position, children }: { icon?: { options?: { html?: string } }; position: [number, number]; children?: React.ReactNode }) => (
    <div
      data-testid="poi-marker"
      data-position={JSON.stringify(position)}
      data-icon-html={icon?.options?.html ?? ''}
    >
      {children}
    </div>
  ),
  Polyline: ({ positions }: { positions: [number, number][] }) => (
    <div data-testid="poi-polyline" data-positions={JSON.stringify(positions)} />
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <div data-testid="poi-tooltip">{children}</div>,
}));

vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn((opts: { html?: string }) => ({ options: opts })),
  },
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

// ─── Mock api ────────────────────────────────────────────────────────────────
const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet },
}));

// ─── Component under test (import AFTER mocks) ──────────────────────────────
import { PoiMiniMap } from './PoiMiniMap';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiGet.mockResolvedValue([]);
});

describe('PoiMiniMap — coords withheld (#1797 AC8 / #1726 coarsening)', () => {
  it('does NOT fire the POI query when latitude/longitude are null', () => {
    renderWithClient(
      <PoiMiniMap listingId="listing-1" latitude={null} longitude={null} localityLabel="Manipal" />,
    );
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('does NOT fire the POI query when latitude/longitude are absent (undefined)', () => {
    renderWithClient(<PoiMiniMap listingId="listing-1" />);
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('renders an honest static fallback with no map, no markers, no lines, no fabricated distances', () => {
    renderWithClient(
      <PoiMiniMap listingId="listing-1" latitude={null} longitude={null} localityLabel="Manipal" />,
    );
    // Fallback copy (locality only — no exact coordinates, no distances)
    expect(screen.getByText(/Map view — Manipal/)).toBeInTheDocument();
    // No map, no POI markers/polylines/tooltips leaked
    expect(screen.queryByTestId('map-container')).not.toBeInTheDocument();
    expect(screen.queryByTestId('poi-marker')).not.toBeInTheDocument();
    expect(screen.queryByTestId('poi-polyline')).not.toBeInTheDocument();
    expect(screen.queryByTestId('poi-tooltip')).not.toBeInTheDocument();
    expect(screen.queryByText(/km|m\b/)).not.toBeInTheDocument();
  });

  it('renders the fallback without a locality suffix when localityLabel is absent', () => {
    renderWithClient(<PoiMiniMap listingId="listing-1" latitude={null} longitude={null} />);
    expect(screen.getByText('Map view')).toBeInTheDocument();
  });
});

describe('PoiMiniMap — coords present', () => {
  const LISTING_LAT = 13.34;
  const LISTING_LNG = 74.74;

  it('fires the POI query when coords are present', () => {
    renderWithClient(
      <PoiMiniMap listingId="listing-2" latitude={LISTING_LAT} longitude={LISTING_LNG} />,
    );
    expect(mockApiGet).toHaveBeenCalledWith('/api/listings/listing-2/pois');
  });

  it('renders the real map (not the fallback) when coords are present', async () => {
    renderWithClient(
      <PoiMiniMap listingId="listing-2" latitude={LISTING_LAT} longitude={LISTING_LNG} />,
    );
    expect(await screen.findByTestId('map-container')).toBeInTheDocument();
    expect(screen.queryByText('Map view')).not.toBeInTheDocument();
  });

  it('falls back to a haversine distance computed only from the POI-returned coords when distanceMeters is null', async () => {
    // A POI ~0.01 degrees north of the listing — roughly 1.1km by haversine.
    // distanceMeters is deliberately null so the component must compute it itself
    // from latitude/longitude — never fabricate a value out of thin air.
    mockApiGet.mockResolvedValue([
      {
        id: 'poi-1',
        name: 'Test Hospital',
        category: 'HOSPITAL',
        distanceMeters: null,
        latitude: LISTING_LAT + 0.01,
        longitude: LISTING_LNG,
        pinned: false,
        approved: true,
      },
    ]);

    renderWithClient(
      <PoiMiniMap listingId="listing-2" latitude={LISTING_LAT} longitude={LISTING_LNG} />,
    );

    const tooltip = await screen.findByTestId('poi-tooltip');
    // haversine(13.34, 74.74, 13.35, 74.74) ≈ 1113m → formatDistance renders "1.1 km"
    expect(tooltip).toHaveTextContent(/1\.1\s*km/);
  });

  it('uses the backend distanceMeters directly when present, without recomputing', async () => {
    mockApiGet.mockResolvedValue([
      {
        id: 'poi-2',
        name: 'Test School',
        category: 'SCHOOL',
        distanceMeters: 500,
        latitude: LISTING_LAT + 0.05, // would haversine to a much larger value
        longitude: LISTING_LNG,
        pinned: false,
        approved: true,
      },
    ]);

    renderWithClient(
      <PoiMiniMap listingId="listing-2" latitude={LISTING_LAT} longitude={LISTING_LNG} />,
    );

    const tooltip = await screen.findByTestId('poi-tooltip');
    expect(tooltip).toHaveTextContent(/500\s*m/);
  });

  it('excludes settlement-category POIs (e.g. TOWN_CENTER) from the generic amenity markers — rendered once via the dedicated town path', async () => {
    mockApiGet.mockResolvedValue([
      {
        id: 'poi-town',
        name: 'Manipal Town',
        category: 'TOWN_CENTER',
        distanceMeters: 2000,
        latitude: LISTING_LAT + 0.02,
        longitude: LISTING_LNG,
        pinned: false,
        approved: true,
      },
    ]);

    renderWithClient(
      <PoiMiniMap listingId="listing-2" latitude={LISTING_LAT} longitude={LISTING_LNG} propertyType="land" />,
    );

    await screen.findByTestId('map-container');
    // TOWN_CENTER is excluded from `mappable` (the generic amenity marker/tooltip
    // list) and rendered exactly once via the dedicated landTown marker path —
    // not duplicated as a second generic amenity POI.
    const tooltips = screen.getAllByTestId('poi-tooltip');
    expect(tooltips).toHaveLength(1);
    expect(tooltips[0]).toHaveTextContent('Manipal Town');
  });
});
