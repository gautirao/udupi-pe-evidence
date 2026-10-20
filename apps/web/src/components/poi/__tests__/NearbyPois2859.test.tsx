/**
 * #2859 B4 (csv204, e2e/poi-display.spec.ts P1/P2/P4 + PM1k.render) — the PUBLIC nearby-places
 * section renders what GET /api/listings/{id}/pois returns.
 *
 * COMPONENT level: api.get is mocked at the network boundary; the real useQuery runs. The listing
 * detail page mount (/listing/:id) is a separate boundary (RETAIN in the B4 map) — and
 * ListingDetailMainContent.test.tsx mocks NearbyPois out entirely, which is why this file exists.
 * The anonymous public read itself (absent before approve, present after) is the backend slice's
 * PoiApproveAuthorization2859IT AC4(b); this file proves only that a response is rendered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NearbyPois } from '../NearbyPois';

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api: { get: mockApiGet } }));

const LAND_ID = '28590004-0000-4000-8000-0000000000a1';
const APT_EMPTY_ID = '28590004-0000-4000-8000-0000000000a2';
const APT_FULL_ID = '28590004-0000-4000-8000-0000000000a3';

function poi(id: string, name: string, category: string, distanceMeters: number) {
  return { id, name, category, distanceMeters, latitude: 13.34, longitude: 74.74, pinned: false, approved: true };
}

function renderNearby(listingId: string, propertyType: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (id: string, type: string) => (
    <QueryClientProvider client={qc}>
      <NearbyPois listingId={id} propertyType={type} />
    </QueryClientProvider>
  );
  const view = render(ui(listingId, propertyType));
  return { ...view, rerenderWith: (id: string, type: string) => view.rerender(ui(id, type)) };
}

beforeEach(() => {
  mockApiGet.mockReset();
});

describe('NearbyPois #2859 B4 (component, api.get mocked)', () => {
  it('P1a-d / PM1k.render: a land listing fetches its POIs anonymously and renders the heading, each returned name and the OSM attribution', async () => {
    mockApiGet.mockResolvedValue([
      poi('p-2859-1', 'District Hospital', 'HOSPITAL', 150),
      poi('p-2859-2', "St. Mary's School", 'SCHOOL', 300),
    ]);

    renderNearby(LAND_ID, 'land');

    expect(await screen.findByText('District Hospital')).toBeInTheDocument();
    expect(screen.getByText("St. Mary's School")).toBeInTheDocument();
    expect(screen.getByText('Location & Access')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright',
    );
    // The public, unauthenticated read: exact path, skipAuth true.
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith(`/api/listings/${LAND_ID}/pois`, { skipAuth: true });
  });

  it('P4a-c: a land listing renders Nearest town and Bus stop fact rows plus the hospital amenity', async () => {
    mockApiGet.mockResolvedValue([
      poi('p-2859-4', 'Manipal Bus Stand', 'TRANSPORT', 500),
      poi('p-2859-5', 'Town Hall', 'TOWN_CENTER', 100),
      poi('p-2859-6', 'District Hospital', 'HOSPITAL', 150),
    ]);

    const { container } = renderNearby(LAND_ID, 'land');

    expect(await screen.findByText('District Hospital')).toBeInTheDocument();
    const rows = Array.from(container.querySelectorAll('dl')).map((dl) => dl.textContent);
    expect(rows).toContain('Nearest town ·Town Hall');
    expect(rows).toContain('Bus stop ·Manipal Bus Stand');
    // A settlement row is present, so the "not yet computed" placeholder is not.
    expect(screen.queryByText(/Location context not yet computed/)).not.toBeInTheDocument();
  });

  it('P2 (apartment): an empty POI list renders no nearby section; the same component with POIs does (rerender control)', async () => {
    mockApiGet.mockImplementation((path: string) =>
      Promise.resolve(path.includes(APT_FULL_ID) ? [poi('p-2859-7', 'Udupi Bus Stand', 'TRANSPORT', 400)] : []),
    );

    const { rerenderWith } = renderNearby(APT_EMPTY_ID, 'apartment');
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith(`/api/listings/${APT_EMPTY_ID}/pois`, { skipAuth: true }));
    // Wait until the empty response has settled (the loading skeleton's heading is gone)...
    await waitFor(() => expect(screen.queryByText('Nearby Essentials')).not.toBeInTheDocument());
    // ...then the essentials section is absent.
    expect(screen.queryByText('Nearby essentials')).not.toBeInTheDocument();

    rerenderWith(APT_FULL_ID, 'apartment');
    expect(await screen.findByText('Udupi Bus Stand')).toBeInTheDocument();
    expect(screen.getByText('Nearby essentials')).toBeInTheDocument();
  });
});
