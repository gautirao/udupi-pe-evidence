import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ─── Polyfills ────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ─── Hoisted mocks ────────────────────────────────────────────
const mockNavigate = vi.hoisted(() => vi.fn());
const mockUseParams = vi.hoisted(() => vi.fn(() => ({ id: 'listing-123' })));
const mockUser = vi.hoisted(() => ({ current: null as { id: string } | null }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: mockUseParams,
  };
});

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/components/listing/AreaMarketWidget', () => ({
  AreaMarketWidget: () => React.createElement('div', { 'data-testid': 'area-market-widget' }),
}));

vi.mock('@/components/listing/SimilarListings', () => ({
  SimilarListings: () => React.createElement('div', { 'data-testid': 'similar-listings' }),
}));

vi.mock('@/components/listing/ListingTransparencyCard', () => ({
  ListingTransparencyCard: (props: Record<string, unknown>) =>
    React.createElement('div', {
      'data-testid': 'listing-transparency-card',
      'data-days': props.daysOnMarket,
      'data-back': String(props.backOnMarket),
      'data-duplicate': String(props.isSuspectedDuplicate),
    }),
}));

vi.mock('@/components/poi/NearbyPois', () => ({
  NearbyPois: () => React.createElement('div', { 'data-testid': 'nearby-pois' }),
}));

vi.mock('@/components/listing/RequestViewingModal', () => ({
  RequestViewingModal: () => React.createElement('div', { 'data-testid': 'request-viewing-modal' }),
}));

vi.mock('@/components/listing/NearbySchoolsCard', () => ({
  NearbySchoolsCard: () => React.createElement('div', { 'data-testid': 'nearby-schools' }),
}));

vi.mock('@/components/listing/RERACard', () => ({
  RERACard: () => React.createElement('div', { 'data-testid': 'rera-card' }),
}));

vi.mock('@/components/poi/PoiMiniMap', () => ({
  PoiMiniMap: () => React.createElement('div', { 'data-testid': 'poi-mini-map' }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser.current,
    session: null,
    isLoading: false,
    isAdmin: false,
    isDealer: false,
    userRole: null,
    insightsAccessUntil: null,
    refreshRole: vi.fn(),
    refreshAuth: vi.fn(),
    signOut: vi.fn(),
  }),
}));

// Mock api — useListingById and useListingPriceHistory now call api.get;
// cache is pre-populated in tests so queryFn is never reached, but the mock
// prevents accidental real fetch calls if cache misses in future tests.
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve(null)),
  },
}));

// ─── Import component AFTER mocks ─────────────────────────────
import ListingDetail from '../ListingDetail';

// ─── Helpers ──────────────────────────────────────────────────

/** Build a minimal listing fixture. Caller overrides specific fields. */
function makeListing(overrides = {}) {
  return {
    id: 'listing-123',
    propertyType: 'land',
    title: 'Test Land Plot',
    locality: 'Udupi',
    price: 500000,
    price_unit: 'INR',
    price_per_cent_paise: 150000, // ₹1,500 / cent
    builtArea: null,
    builtAreaUnit: null,
    landArea: 10,
    landAreaUnit: 'cent',
    bedrooms: null,
    bathrooms: null,
    description: 'A nice plot',
    contact_phone: null,
    contact_info: null,
    confidence_score: 85,
    latitude: 13.34,
    longitude: 74.74,
    status: 'LIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Required by ListingResponse but not exercised by these tests
    addressConfirmed: false,
    imageCount: 0,
    firstImageUrl: null,
    rejectionReason: null,
    videoUrl: null,
    reraNumber: null,
    listingPurpose: null,
    carpetArea: null,
    carpetAreaUnit: null,
    floorNumber: null,
    totalFloors: null,
    furnishingStatus: null,
    washrooms: null,
    parkingCount: null,
    roadFrontageFt: null,
    commercialUsage: null,
    numberOfUnits: null,
    monthlyRent: null,
    securityDepositMonths: null,
    lockInMonths: null,
    sellerType: null,
    images: [],
    ...overrides,
  };
}

function renderWithListing(listing: ReturnType<typeof makeListing> | null, loading = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  // Pre-populate TanStack Query cache to avoid network call.
  // Query key: ['listing-public', id, userId ?? null] — with mockUser.current
  // the third element is either the user id or null.
  if (listing !== null) {
    const userId = mockUser.current?.id ?? null;
    queryClient.setQueryData(['listing-public', 'listing-123', userId], listing);
  }
  // Pre-populate price history cache with empty array (no price changes by default)
  queryClient.setQueryData(['listing-price-history', 'listing-123'], []);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/listing/listing-123']}>
        <ListingDetail />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParams.mockReturnValue({ id: 'listing-123' });
});

// ── A. Price-per-unit display ──────────────────────────────────

describe('ListingDetail — price-per-unit (PR-11.4)', () => {
  it('shows price-per-cent for land listings with price_per_cent_paise', () => {
    renderWithListing(makeListing({
      propertyType: 'land',
      price_per_cent_paise: 150000, // ₹1,500 / cent
    }));
    expect(screen.getByText(/1,500.*cent/)).toBeInTheDocument();
  });

  it('shows price-per-sqft for apartment with built_area (sqft) + price', () => {
    renderWithListing(makeListing({
      propertyType: 'apartment',
      price: 3200000,
      builtArea: 1000,
      builtAreaUnit: 'sqft',
      price_per_cent_paise: null,
    }));
    // ₹3,200,000 / 1000 sqft = ₹3,200 / sqft
    expect(screen.getByText(/3,200.*sqft/)).toBeInTheDocument();
  });

  it('shows price-per-sqft for house with built_area (sqft) + price', () => {
    renderWithListing(makeListing({
      propertyType: 'house',
      price: 2000000,
      builtArea: 800,
      builtAreaUnit: 'sqft',
      price_per_cent_paise: null,
    }));
    // ₹2,000,000 / 800 sqft = ₹2,500 / sqft
    expect(screen.getByText(/2,500.*sqft/)).toBeInTheDocument();
  });

  it('does NOT show per-unit line for land without price_per_cent_paise', () => {
    renderWithListing(makeListing({
      propertyType: 'land',
      price_per_cent_paise: null,
    }));
    expect(screen.queryByText(/\/\s*cent/)).not.toBeInTheDocument();
  });

  it('does NOT show per-sqft for apartment without built_area', () => {
    renderWithListing(makeListing({
      propertyType: 'apartment',
      builtArea: null,
      price_per_cent_paise: null,
    }));
    expect(screen.queryByText(/\/\s*sqft/)).not.toBeInTheDocument();
  });

  it('does NOT show per-sqft when built_area_unit is not sqft', () => {
    renderWithListing(makeListing({
      propertyType: 'apartment',
      price: 2000000,
      builtArea: 200,
      builtAreaUnit: 'sqm', // not sqft
      price_per_cent_paise: null,
    }));
    expect(screen.queryByText(/\/\s*sqft/)).not.toBeInTheDocument();
  });
});

// ── B. Back button ─────────────────────────────────────────────

describe('ListingDetail — back button (PR-11.4)', () => {
  it('renders "Back to Map" label', () => {
    renderWithListing(makeListing());
    expect(screen.getAllByText('Back to Map').length).toBeGreaterThan(0);
  });

  it('navigates to "/" when back button is clicked', async () => {
    const { getByText } = renderWithListing(makeListing());
    // Click the Back to Map button in the header
    getByText('Back to Map').click();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});

// ── C. Low confidence tooltip ──────────────────────────────────

describe('ListingDetail — low confidence badge (PR-11.4)', () => {
  it('shows "Low confidence" badge when confidence_score < 70', () => {
    renderWithListing(makeListing({ confidence_score: 55 }));
    expect(screen.getByText('Low confidence')).toBeInTheDocument();
  });

  it('does NOT show "Low confidence" badge when confidence_score >= 70', () => {
    renderWithListing(makeListing({ confidence_score: 85 }));
    expect(screen.queryByText('Low confidence')).not.toBeInTheDocument();
  });

  it('does NOT show "Low confidence" badge when confidence_score is null', () => {
    renderWithListing(makeListing({ confidence_score: null }));
    expect(screen.queryByText('Low confidence')).not.toBeInTheDocument();
  });
});

// ── D. Not found / error state ─────────────────────────────────

describe('ListingDetail — not found state (PR-11.4)', () => {
  it('shows "Listing Not Found" when no data returned', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['listing-public', 'listing-123', null], null);
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ListingDetail />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('Listing Not Found')).toBeInTheDocument();
  });

  it('shows "Back to Map" in not-found state', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['listing-public', 'listing-123', null], null);
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ListingDetail />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getAllByText('Back to Map').length).toBeGreaterThan(0);
  });
});

// ── E. Human-friendly listing ID (RE-83) ────────────────────────

describe('ListingDetail — display ID (RE-83)', () => {
  it('shows formatted PROP-XXXXX when listing_number is present', () => {
    renderWithListing(makeListing({ listingNumber: 42 }));
    expect(screen.getByText('PROP-00042')).toBeInTheDocument();
  });

  it('does NOT show display ID when listing_number is absent', () => {
    renderWithListing(makeListing());
    expect(screen.queryByText(/PROP-/)).not.toBeInTheDocument();
  });
});

// ── F. ListingTransparencyCard integration (RE-94) ──────────────

describe('ListingDetail — ListingTransparencyCard (RE-94)', () => {
  it('renders the transparency card for a listing with daysOnMarket', () => {
    renderWithListing(makeListing({ daysOnMarket: 5 }));
    const card = screen.getByTestId('listing-transparency-card');
    expect(card).toBeInTheDocument();
    expect(card.getAttribute('data-days')).toBe('5');
  });

  it('renders transparency card even when all new fields are absent (card renders null internally)', () => {
    // The card is always rendered by ListingDetail; it returns null internally when nothing to show
    renderWithListing(makeListing());
    expect(screen.getByTestId('listing-transparency-card')).toBeInTheDocument();
  });

  it('passes backOnMarket flag to the transparency card', () => {
    renderWithListing(makeListing({ backOnMarket: true }));
    const card = screen.getByTestId('listing-transparency-card');
    expect(card.getAttribute('data-back')).toBe('true');
  });

  it('passes isSuspectedDuplicate flag to the transparency card', () => {
    renderWithListing(makeListing({ isSuspectedDuplicate: true }));
    const card = screen.getByTestId('listing-transparency-card');
    expect(card.getAttribute('data-duplicate')).toBe('true');
  });
});

// ── G. Anonymous teaser view — RE-189 regression ──────────────

describe('ListingDetail — anonymous teaser (RE-189)', () => {
  /**
   * The backend returns a teaser response with only 7 fields for anonymous users:
   * id, primaryImageUrl, imageCount, price, propertyType, locality, listingPurpose.
   * Fields like createdAt, title, images, status are absent.
   * The component must not crash on this minimal shape.
   */
  function makeTeaserListing() {
    return {
      id: 'listing-123',
      primaryImageUrl: null,
      imageCount: 0,
      price: 500000,
      propertyType: 'land',
      locality: 'Udupi',
      listingPurpose: 'SALE',
    };
  }

  it('renders without crashing when backend returns teaser-only fields (no createdAt)', () => {
    // This is the regression test for RE-189: format(new Date(undefined)) threw RangeError
    renderWithListing(makeTeaserListing());
    // The page renders — no error boundary. Title falls back to "Land in Udupi".
    expect(screen.getByRole('heading', { level: 1, name: /Land in Udupi/ })).toBeInTheDocument();
  });

  it('shows "Sign in to view full details" CTA for anonymous users', () => {
    renderWithListing(makeTeaserListing());
    expect(screen.getByText('Sign in to view full details', { selector: 'p' })).toBeInTheDocument();
  });

  it('does not render the Posted Date section when createdAt is absent', () => {
    renderWithListing(makeTeaserListing());
    expect(screen.queryByText(/Posted/)).not.toBeInTheDocument();
  });
});

// ── H. Anonymous gallery lock (issue #835) ─────────────────────────────────

describe('ListingDetail — anonymous gallery lock (issue #835)', () => {
  // Real teaser shape: backend returns primaryImageUrl + imageCount, no images[].
  // The component synthesizes a 1-item gallery from primaryImageUrl; clicking
  // "Next" when imageCount > 1 sets galleryLocked = true, showing the overlay.
  const anonTeaser = {
    images: [] as { url: string; alt: string }[],
    primaryImageUrl: 'https://example.com/img1.jpg',
    imageCount: 3,
  };

  // Full images shape returned for authenticated users.
  const authImages = [
    { url: 'https://example.com/img1.jpg', alt: 'Image 1' },
    { url: 'https://example.com/img2.jpg', alt: 'Image 2' },
    { url: 'https://example.com/img3.jpg', alt: 'Image 3' },
  ];

  beforeEach(() => {
    mockUser.current = null;
  });

  afterEach(() => {
    mockUser.current = null;
  });

  it('anon: first image visible — no locked overlay at index 0', () => {
    renderWithListing(makeListing(anonTeaser));
    expect(screen.queryByText('Sign in to view all photos')).not.toBeInTheDocument();
  });

  it('anon: thumbnail strip not rendered', () => {
    renderWithListing(makeListing(anonTeaser));
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('anon: clicking next image shows locked overlay', async () => {
    renderWithListing(makeListing(anonTeaser));
    await userEvent.click(screen.getByRole('button', { name: /next image/i }));
    expect(screen.getByRole('heading', { name: /sign in to view all photos/i })).toBeInTheDocument();
  });

  it('anon: locked overlay CTA links to /auth with returnTo', async () => {
    renderWithListing(makeListing(anonTeaser));
    await userEvent.click(screen.getByRole('button', { name: /next image/i }));
    const cta = screen.getByRole('link', { name: /sign in to view all photos/i });
    expect(cta).toHaveAttribute('href', '/auth?returnTo=%2Flisting%2Flisting-123');
  });

  it('logged-in: thumbnail strip is rendered', () => {
    mockUser.current = { id: 'user-1' };
    renderWithListing(makeListing({ images: authImages }));
    expect(screen.getAllByRole('tab').length).toBe(authImages.length);
  });

  it('anon: pressing prev after lock clears overlay', async () => {
    renderWithListing(makeListing(anonTeaser));
    await userEvent.click(screen.getByRole('button', { name: /next image/i }));
    expect(screen.getByRole('heading', { name: /sign in to view all photos/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /previous image/i }));
    expect(screen.queryByText('Sign in to view all photos')).not.toBeInTheDocument();
  });

  it('logged-in: no locked overlay when navigating to image 2', async () => {
    mockUser.current = { id: 'user-1' };
    renderWithListing(makeListing({ images: authImages }));
    await userEvent.click(screen.getByRole('button', { name: /next image/i }));
    expect(screen.queryByText('Sign in to view all photos')).not.toBeInTheDocument();
  });
});

// ── I. Gallery polish — issue #845 ─────────────────────────────

describe('ListingDetail — gallery polish (issue #845)', () => {
  beforeEach(() => {
    mockUser.current = null;
  });

  afterEach(() => {
    mockUser.current = null;
  });

  // I-1: Lock icon in overlay (not Eye)
  it('overlay shows Lock icon SVG, not Eye, when anon navigates to locked image', async () => {
    const { container } = renderWithListing(makeListing({
      images: [] as { url: string; alt: string }[],
      primaryImageUrl: 'https://example.com/img1.jpg',
      imageCount: 3,
    }));
    await userEvent.click(screen.getByRole('button', { name: /next image/i }));
    // The overlay heading confirms the lock overlay rendered
    expect(screen.getByRole('heading', { name: /sign in to view all photos/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in to view all photos/i })).toBeInTheDocument();
    // Assert icon identity: lucide-react v0.462 renders class names, not data-lucide attrs.
    // Lock SVG gets class "lucide-lock"; Eye SVG would get "lucide-eye".
    const lockSvg = container.querySelector('svg.lucide-lock');
    const eyeSvg = container.querySelector('svg.lucide-eye');
    expect(lockSvg).not.toBeNull();
    expect(eyeSvg).toBeNull();
  });

  // I-2: aspect-[4/3] class on gallery container
  it('gallery container has aspect-[4/3] class', () => {
    const { container } = renderWithListing(makeListing({
      images: [] as { url: string; alt: string }[],
      primaryImageUrl: 'https://example.com/img1.jpg',
      imageCount: 1,
    }));
    // Find the div that is the direct gallery container (relative bg-muted)
    const galleryDiv = container.querySelector('.aspect-\\[4\\/3\\]');
    expect(galleryDiv).not.toBeNull();
  });

  it('gallery container does NOT have aspect-video class', () => {
    const { container } = renderWithListing(makeListing({
      images: [] as { url: string; alt: string }[],
      primaryImageUrl: 'https://example.com/img1.jpg',
      imageCount: 1,
    }));
    const videoDiv = container.querySelector('.aspect-video');
    expect(videoDiv).toBeNull();
  });

  // I-3: Zero-preview locked placeholder (imageCount > 0, primaryImageUrl = null, user = null)
  it('shows locked placeholder (not "No images available") when imageCount > 0 but primaryImageUrl is null and user is anonymous', () => {
    renderWithListing(makeListing({
      images: [],
      primaryImageUrl: null,
      imageCount: 5,
    }));
    expect(screen.queryByText('No images available')).not.toBeInTheDocument();
    // CTA link presence is asserted independently in I-4; no duplicate assertion needed here.
  });

  it('locked placeholder CTA links to /auth with returnTo', () => {
    renderWithListing(makeListing({
      images: [],
      primaryImageUrl: null,
      imageCount: 5,
    }));
    const cta = screen.getByRole('link', { name: /sign in to view all photos/i });
    expect(cta).toHaveAttribute('href', '/auth?returnTo=%2Flisting%2Flisting-123');
  });

  // I-4: imageCount === 0 still shows "No images available" (unchanged)
  it('shows "No images available" when imageCount is 0 and no images', () => {
    renderWithListing(makeListing({
      images: [],
      primaryImageUrl: null,
      imageCount: 0,
    }));
    expect(screen.getByText('No images available')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to view all photos')).not.toBeInTheDocument();
  });

  // I-5: Zero-preview branch does NOT fire when primaryImageUrl is non-null
  it('does NOT show zero-preview placeholder when primaryImageUrl is non-null (normal teaser path)', () => {
    renderWithListing(makeListing({
      images: [],
      primaryImageUrl: 'https://example.com/img1.jpg',
      imageCount: 3,
    }));
    // The synthesized image renders; neither placeholder should appear
    expect(screen.queryByText('No images available')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign in to view all photos')).not.toBeInTheDocument();
  });
});

// ── J. Anonymous gallery teaser flow (issue #844) ─────────────────────────────
//
// Covers the three ACs not yet exercised by describe blocks H and I:
//   AC2 — synthetic images array contains exactly 1 item for anon
//   AC3 — nav arrows are shown when imageCount > 1
//   AC7 — image counter shows "1 / N" where N comes from the backend imageCount

describe('anonymous gallery teaser flow (issue #844)', () => {
  const PRIMARY_URL = 'https://example.com/photo.jpg';

  beforeEach(() => {
    mockUser.current = null;
  });

  afterEach(() => {
    mockUser.current = null;
  });

  // AC2: Synthetic array has exactly 1 item (the primaryImageUrl) for anon users.
  // We verify this indirectly: the rendered <img> shows the primary URL, and after
  // clicking Next the lock overlay fires (not a second real image), proving the
  // array held only 1 real item.
  it('AC2: anon gallery uses exactly 1 synthetic image (next click locks, not advances)', async () => {
    renderWithListing(makeListing({
      images: [],
      primaryImageUrl: PRIMARY_URL,
      imageCount: 3,
    }));

    // Image 1 is the primary URL
    const img = screen.getByRole('img', { name: /property image/i });
    expect(img).toHaveAttribute('src', PRIMARY_URL);

    // Clicking Next locks rather than navigating to a second image, proving the
    // synthetic array has only 1 entry (otherwise the index would advance).
    await userEvent.click(screen.getByRole('button', { name: /next image/i }));
    expect(screen.getByRole('heading', { name: /sign in to view all photos/i })).toBeInTheDocument();

    // Gallery image still shows image 1 — no navigation occurred
    const imgAfter = screen.getByRole('img', { name: /property image/i });
    expect(imgAfter).toHaveAttribute('src', PRIMARY_URL);
  });

  // AC3: Nav arrows appear when imageCount > 1 for anon (hasMoreLocked = true).
  it('AC3: prev and next nav arrows are rendered when imageCount > 1', () => {
    renderWithListing(makeListing({
      images: [],
      primaryImageUrl: PRIMARY_URL,
      imageCount: 3,
    }));

    expect(screen.getByRole('button', { name: /next image/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous image/i })).toBeInTheDocument();
  });

  // AC3 edge: nav arrows NOT rendered when hasMoreLocked is false.
  // hasMoreLocked = !user && effectiveImageCount > images.length.
  // When imageCount === 1 and primaryImageUrl is set, images.length === 1, so
  // effectiveImageCount (1) > images.length (1) is false → hasMoreLocked = false,
  // and images.length > 1 is also false → no arrows.
  it('AC3: nav arrows are NOT rendered when hasMoreLocked is false (imageCount equals synthetic array length)', () => {
    renderWithListing(makeListing({
      images: [],
      primaryImageUrl: PRIMARY_URL,
      imageCount: 1,
    }));

    expect(screen.queryByRole('button', { name: /next image/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /previous image/i })).not.toBeInTheDocument();
  });

  // AC7: Counter shows "1 / N" where N = imageCount from the backend, not
  // the length of the local images array (which is 1 for anon).
  it('AC7: image counter shows "1 / 3" using backend imageCount, not local array length', () => {
    renderWithListing(makeListing({
      images: [],
      primaryImageUrl: PRIMARY_URL,
      imageCount: 3,
    }));

    // The counter text "1 / 3" confirms N comes from backend imageCount, not local array length (1)
    expect(screen.getByText(/^1 \/ 3$/)).toBeInTheDocument();
  });

  // AC7 edge: counter not rendered when only 1 image and no locked images.
  it('AC7: counter is NOT rendered when imageCount === 1 (no nav needed)', () => {
    renderWithListing(makeListing({
      images: [],
      primaryImageUrl: PRIMARY_URL,
      imageCount: 1,
    }));

    expect(screen.queryByText(/^1 \/ 1$/)).not.toBeInTheDocument();
  });
});
