/**
 * ListingDetail — crops disclosure regression (Issue #2044)
 *
 * A PR reviewer twice asked for a regression test proving the seller-declared/
 * unverified disclosure that accompanies the crops list on the public agri
 * listing detail page. The disclosure block (~ListingDetail.tsx:266-281) is
 * gated on `Array.isArray(listing.crops) && listing.crops.length > 0`.
 *
 * Tests:
 * 1. With crops — heading + caption render, and crop values render as labels
 *    (not raw machine values).
 * 2. Without crops (empty array) — the disclosure caption must NOT render.
 * 3. Without crops (undefined) — the disclosure caption must NOT render.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

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
const mockUseParams = vi.hoisted(() => vi.fn(() => ({ id: 'listing-2044' })));
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

// Shallow-mock heavy UI components to keep test fast. AgriListingDetail is
// mocked out because the crops disclosure block under test is rendered by
// ListingDetail.tsx itself, ahead of AgriListingDetail.
vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
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
  AgriListingDetail: () =>
    React.createElement('div', { 'data-testid': 'agri-detail-root' }),
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
const LISTING_ID = 'listing-2044';

const CAPTION_TEXT =
  "Declared by the seller/broker; ReTrends does not verify what's actually grown.";
const HEADING_TEXT = 'Crops grown (declared by seller/broker)';

function buildListing(crops: string[] | undefined) {
  return {
    id: LISTING_ID,
    title: 'Agri Crops Disclosure Test',
    propertyType: 'agricultural_land',
    images: [],
    status: 'LIVE',
    ...(crops !== undefined ? { crops } : {}),
  };
}

function mockApiResponses(crops: string[] | undefined) {
  const listingData = buildListing(crops);
  mockGet.mockImplementation((url: string) => {
    if (url.includes('/price-history')) return Promise.resolve([]);
    if (url.includes('/trust')) return Promise.resolve({ badges: [] });
    return Promise.resolve(listingData);
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

describe('ListingDetail — crops disclosure (Issue #2044)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSession.current = null;
    mockUseParams.mockReturnValue({ id: LISTING_ID });
    mockSearchParams.mockReturnValue([new URLSearchParams('')]);
  });

  it('renders the disclosure heading/caption and crop LABELS (not raw machine values) when crops is non-empty', async () => {
    mockApiResponses(['ARECA_SUPARI', 'MIXED_PLANTATION']);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderPage(queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('agri-detail-crops')).toBeInTheDocument();
    });

    expect(screen.getByText(HEADING_TEXT)).toBeInTheDocument();
    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();

    // Values render as human labels
    expect(screen.getByText('Areca / supari, Mixed plantation')).toBeInTheDocument();

    // Raw machine values must never leak into the rendered output
    expect(screen.queryByText(/ARECA_SUPARI/)).not.toBeInTheDocument();
    expect(screen.queryByText(/MIXED_PLANTATION/)).not.toBeInTheDocument();
  });

  it('does NOT render the disclosure caption when crops is an empty array', async () => {
    mockApiResponses([]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderPage(queryClient);

    // Wait for the agri page to have finished loading (AgriListingDetail mount point exists)
    await waitFor(() => {
      expect(screen.getByTestId('agri-detail-root')).toBeInTheDocument();
    });

    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText(HEADING_TEXT)).not.toBeInTheDocument();
  });

  it('does NOT render the disclosure caption when crops is undefined/absent', async () => {
    mockApiResponses(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderPage(queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('agri-detail-root')).toBeInTheDocument();
    });

    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText(HEADING_TEXT)).not.toBeInTheDocument();
  });
});
