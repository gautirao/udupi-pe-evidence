/**
 * ListingDetail — useListingById cache key contract (Issue #1462)
 *
 * The internal useListingById hook must:
 * - Public path (isPreview=false): use listingKeys.public(id, isAuthenticated) + staleTime=5min
 * - Preview path (isPreview=true): use listingKeys.preview(id) + no staleTime
 * - Anon and authed public calls use DISTINCT cache entries (disclosure regression guard)
 *
 * Because useListingById is private to ListingDetail.tsx, we test it indirectly
 * by inspecting the QueryClient cache after the component renders.
 *
 * Tests:
 * 17  public path (isPreview=false) uses listingKeys.public(id, isAuthenticated) key
 * 18  preview path (isPreview=true) uses listingKeys.preview(id) key
 * 19  public path staleTime = 5 * 60 * 1000
 * 20  Disclosure regression — anon and authed public detail use DISTINCT cache keys
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { listingKeys } from '@/lib/listingQueryKeys';

// ─── Polyfill ─────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ─── Hoisted mocks ────────────────────────────────────────────
const mockGet = vi.hoisted(() => vi.fn());
const mockSession = vi.hoisted(() => ({ current: null as unknown }));
const mockUseParams = vi.hoisted(() => vi.fn(() => ({ id: 'listing-1462' })));
const mockSearchParams = vi.hoisted(() => vi.fn(() => [new URLSearchParams('')]));

vi.mock('@/lib/api', () => ({
  api: { get: mockGet },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ session: mockSession.current }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: mockUseParams,
    useSearchParams: mockSearchParams,
  };
});

// Shallow-mock heavy UI components to keep test fast
vi.mock('@/components/layout/AppLayout', () => ({ RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));
vi.mock('@/components/listing/ListingGallery', () => ({
  ListingGallery: () => null,
}));
vi.mock('@/components/listing/ListingDetailMainContent', () => ({
  ListingDetailMainContent: () => null,
}));
vi.mock('@/components/listing/ListingDetailSidebar', () => ({
  ListingDetailSidebar: () => null,
}));
vi.mock('@/components/listing/ListingTransparencyCard', () => ({
  ListingTransparencyCard: () => null,
}));
vi.mock('@/components/listing/RequestViewingModal', () => ({
  RequestViewingModal: () => null,
}));
vi.mock('@/components/listing/ListingPreviewActions', () => ({
  TakeOfflineButton: () => null,
  ReopenForEditingButton: () => null,
}));
vi.mock('@/components/listing/agri/AgriListingDetail', () => ({
  AgriListingDetail: () => null,
}));
vi.mock('@/components/poi/NearbyPois', () => ({
  NearbyPois: () => null,
}));
vi.mock('@/components/listing/SimilarListings', () => ({
  SimilarListings: () => null,
}));
vi.mock('@/components/listing/AreaMarketWidget', () => ({
  AreaMarketWidget: () => null,
}));
vi.mock('@/components/listing/NearbySchoolsCard', () => ({
  NearbySchoolsCard: () => null,
}));
vi.mock('@/components/listing/RERACard', () => ({
  RERACard: () => null,
}));
vi.mock('@/components/poi/PoiMiniMap', () => ({
  PoiMiniMap: () => null,
}));

// Import component AFTER mocks
import ListingDetail from '../ListingDetail';

// ─── Fixtures ─────────────────────────────────────────────────
const LISTING_ID = 'listing-1462';
const LISTING_DATA = {
  id: LISTING_ID,
  title: 'Cache Key Test',
  propertyType: 'land',
  images: [],
  status: 'LIVE',
};

// ─── Helpers ──────────────────────────────────────────────────
function mockApiResponses() {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('/price-history')) return Promise.resolve([]);
    if (url.includes('/trust')) return Promise.resolve({ badges: [] });
    return Promise.resolve(LISTING_DATA);
  });
}

function renderPage(queryClient: QueryClient) {
  return render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        MemoryRouter,
        { initialEntries: [`/listing/${LISTING_ID}`] },
        React.createElement(ListingDetail),
      ),
    ),
  );
}

describe('ListingDetail — useListingById cache key contract (Issue #1462)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSession.current = null;
    mockUseParams.mockReturnValue({ id: LISTING_ID });
    mockSearchParams.mockReturnValue([new URLSearchParams('')]);
  });

  it('17: public path (isPreview=false) puts listingKeys.public(id, isAuthenticated) in cache', async () => {
    mockSession.current = { user: { id: 'u1' } };
    mockApiResponses();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { unmount } = renderPage(queryClient);

    await waitFor(() => {
      const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
      expect(keys).toContainEqual(listingKeys.public(LISTING_ID, true));
    });

    unmount();
  });

  it('18: preview path (isPreview=true) puts listingKeys.preview(id) in cache', async () => {
    mockSession.current = { user: { id: 'u1' } };
    mockSearchParams.mockReturnValue([new URLSearchParams('preview=true')]);
    mockApiResponses();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { unmount } = renderPage(queryClient);

    await waitFor(() => {
      const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
      expect(keys).toContainEqual(listingKeys.preview(LISTING_ID));
    });

    unmount();
  });

  it('19: public path query has staleTime = 5 * 60 * 1000 (300 000 ms)', async () => {
    mockSession.current = { user: { id: 'u1' } };
    mockApiResponses();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { unmount } = renderPage(queryClient);

    await waitFor(() => {
      const entry = queryClient.getQueryCache().find({
        queryKey: listingKeys.public(LISTING_ID, true),
      });
      expect(entry).toBeDefined();
    });

    const entry = queryClient.getQueryCache().find({
      queryKey: listingKeys.public(LISTING_ID, true),
    });
    expect(entry?.options.staleTime).toBe(5 * 60 * 1000);

    unmount();
  });

  it('20: Disclosure regression — anon and authed public detail use DISTINCT cache keys', async () => {
    mockApiResponses();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // Render as anon
    mockSession.current = null;
    const { unmount: u1 } = renderPage(queryClient);
    await waitFor(() => {
      const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
      expect(keys).toContainEqual(listingKeys.public(LISTING_ID, false));
    });
    u1();

    // Render as authed (new render, same QueryClient)
    mockSession.current = { user: { id: 'u1' } };
    const { unmount: u2 } = renderPage(queryClient);
    await waitFor(() => {
      const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
      expect(keys).toContainEqual(listingKeys.public(LISTING_ID, true));
    });
    u2();

    // Both keys exist and are distinct
    const allKeys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(allKeys).toContainEqual(listingKeys.public(LISTING_ID, false));
    expect(allKeys).toContainEqual(listingKeys.public(LISTING_ID, true));
    expect(listingKeys.public(LISTING_ID, false)).not.toEqual(listingKeys.public(LISTING_ID, true));
  });
});
