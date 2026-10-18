/**
 * ListingDetail — legacy E2E retirement replacements (#2837 / #2750 PR-6 batch C, stage B1).
 *
 * Replaces assertion-by-assertion what e2e/gallery-behaviour.spec.ts and
 * e2e/listing-detail-viewing.spec.ts checked in a browser, at the page level.
 *
 * BOUNDARY (disclosed):
 *  - The REAL ListingDetail, ListingGallery, useGalleryNavigation, ListingDetailSidebar,
 *    ViewingRequestPanel and the REAL useListingById (in-file query hook) run.
 *  - ONLY the HTTP client (`@/lib/api`) is mocked. The mock is auth-aware: an anonymous caller
 *    gets the teaser shape (primaryImageUrl + imageCount, images []), an authenticated caller
 *    gets images[]. No query cache is seeded, so every listing is served through the HTTP path.
 *  - PERMITTED, DISCLOSED EXCEPTION: `@/contexts/AuthContext` is mocked for auth STATE only
 *    (the real provider needs supabase.auth). user and session are set together and every arm
 *    asserts the auth state the mock actually observed.
 *  - Component stubs (AppLayout, widgets, RequestViewingModal) follow ListingDetail.test.tsx.
 *    The RequestViewingModal stub renders role="dialog" when open, so "no dialog" is not vacuous
 *    (a self-test below proves the stub does render one).
 *  - No data hook (useListingById / useBookings / useCreateBooking) is vi.mock'ed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

// ─── Polyfills ────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ─── Hoisted state ────────────────────────────────────────────
type MockUser = { id: string; email: string };
type MockSession = { access_token: string; user: MockUser };

const authState = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  session: null as { access_token: string; user: { id: string; email: string } } | null,
}));
const authObservations = vi.hoisted(() => ({ seen: [] as string[] }));
const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());

// ─── Mocks (HTTP boundary + auth STATE + component stubs only) ─────────────
vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
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
  ListingTransparencyCard: () => React.createElement('div', { 'data-testid': 'listing-transparency-card' }),
}));
vi.mock('@/components/poi/NearbyPois', () => ({
  NearbyPois: () => React.createElement('div', { 'data-testid': 'nearby-pois' }),
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
// Stub renders role="dialog" when open (so a re-mounted modal is detectable by role).
vi.mock('@/components/listing/RequestViewingModal', () => ({
  RequestViewingModal: ({ open }: { open: boolean }) =>
    open ? React.createElement('div', { role: 'dialog', 'aria-label': 'Request viewing (stub)' }) : null,
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => {
    authObservations.seen.push(
      `${authState.user ? 'user' : 'no-user'}+${authState.session ? 'session' : 'no-session'}`,
    );
    return {
      user: authState.user,
      session: authState.session,
      isLoading: false,
      isAdmin: false,
      isDealer: false,
      isBroker: false,
      userRole: null,
      insightsAccessUntil: null,
      refreshRole: vi.fn(),
      refreshAuth: vi.fn(),
      signOut: vi.fn(),
    };
  },
}));
// HTTP client mock. API_BASE_URL is required by useDiscoverTelemetry (imported by the real panel).
vi.mock('@/lib/api', () => ({
  API_BASE_URL: 'http://api.test',
  ApiError: class ApiError extends Error {
    constructor(message: string, public status: number, public body: unknown) {
      super(message);
    }
  },
  api: { get: apiGet, post: apiPost, put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

// ─── Import component AFTER mocks ─────────────────────────────
import ListingDetail from '../ListingDetail';
import { RequestViewingModal } from '@/components/listing/RequestViewingModal';

// ─── Named tolerant matchers (each has an accept AND a reject self-test below) ─────────
/** Gallery counter text: tolerates whitespace around the slash, rejects other k / n. */
const COUNTER = (k: number, n: number) => new RegExp(`^\\s*${k}\\s*/\\s*${n}\\s*$`);
/** Any "Contact broker" button label (any case / spacing). */
const CONTACT_BROKER_RE = /contact\s+broker/i;
/** The legacy sign-in wall copy that must NOT be on the page. */
const WALL_RE = /sign in to view full details/i;
/** The gallery lock overlay heading. */
const LOCK_HEADING_RE = /sign in to view all photos/i;
/** The inline viewing-request panel heading (not the submit button text). */
const PANEL_HEADING_RE = /request a viewing time/i;

// ─── Fixtures (contract-faithful) ─────────────────────────────
const LISTING_ID = 'listing-123';
const AUTHED_USER: MockUser = { id: 'user-1', email: 'buyer@example.test' };
const AUTHED_SESSION: MockSession = { access_token: 'test-token', user: AUTHED_USER };

const imgUrl = (k: number) => `https://example.test/photo-${k}.jpg`;

/** Anonymous teaser: primaryImageUrl + imageCount, images [] (no gated data). */
function teaser(imageCount: number) {
  return {
    id: LISTING_ID,
    primaryImageUrl: imgUrl(1),
    imageCount,
    images: [] as { url: string; alt: string }[],
    price: 5_000_000,
    propertyType: 'apartment',
    locality: 'Malpe',
    listingPurpose: 'SALE',
  };
}

/** Authenticated detail: full images[]. */
function fullDetail(imageCount: number) {
  return {
    ...teaser(imageCount),
    title: 'Sea View Apartment',
    status: 'LIVE',
    images: Array.from({ length: imageCount }, (_, i) => ({ url: imgUrl(i + 1), alt: `Image ${i + 1}` })),
  };
}

type HttpCall = { method: 'GET'; path: string; authed: boolean };
const httpLog: HttpCall[] = [];
const unexpectedPaths: string[] = [];

/** Auth-aware HTTP mock: answers by path and by the auth state AT CALL TIME. */
function installHttp(imageCount: number) {
  apiGet.mockImplementation(async (path: string) => {
    const authed = authState.session !== null;
    httpLog.push({ method: 'GET', path, authed });
    if (path === `/api/public/listings/${LISTING_ID}`) {
      return authed ? fullDetail(imageCount) : teaser(imageCount);
    }
    if (path === `/api/public/listings/${LISTING_ID}/price-history`) return [];
    if (path === `/api/listings/${LISTING_ID}/trust`) return { badges: [] };
    unexpectedPaths.push(path);
    return null;
  });
}

type Role = 'anon' | 'authed';
function setRole(role: Role) {
  authState.user = role === 'authed' ? AUTHED_USER : null;
  authState.session = role === 'authed' ? AUTHED_SESSION : null;
}

/** Real ListingDetail via real routing; NO query-cache seeding. */
function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/listing/${LISTING_ID}`]}>
        <Routes>
          <Route path="/listing/:id" element={<ListingDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The auth state the mock actually observed during this arm (user+session together). */
function expectObservedAuth(role: Role) {
  const expected = role === 'authed' ? 'user+session' : 'no-user+no-session';
  expect([...new Set(authObservations.seen)]).toEqual([expected]);
}

const lockHeading = () => screen.queryByRole('heading', { name: LOCK_HEADING_RE });
const counter = () => screen.getByTestId('gallery-counter');

beforeEach(() => {
  vi.clearAllMocks();
  authObservations.seen.length = 0;
  httpLog.length = 0;
  unexpectedPaths.length = 0;
  setRole('anon');
});

// ─── Matcher self-tests ───────────────────────────────────────
describe('matcher self-tests (accept AND reject)', () => {
  it('COUNTER accepts whitespace variants and rejects other positions / totals', () => {
    for (const ok of ['1 / 3', '1/3', ' 1  /  3 ']) expect(COUNTER(1, 3).test(ok)).toBe(true);
    for (const bad of ['1 / 30', '11 / 3', '2 / 3', '1 / 4', '1 / 13', '']) {
      expect(COUNTER(1, 3).test(bad)).toBe(false);
    }
  });

  it('CONTACT_BROKER_RE accepts case / spacing variants and rejects other labels', () => {
    for (const ok of ['Contact Broker', 'contact broker', 'CONTACT  BROKER']) {
      expect(CONTACT_BROKER_RE.test(ok)).toBe(true);
    }
    for (const bad of ['Contact lister', 'Contact', 'Request viewing time', 'Broker']) {
      expect(CONTACT_BROKER_RE.test(bad)).toBe(false);
    }
  });

  it('WALL_RE accepts the wall copy and rejects the gallery-lock / submit copy', () => {
    for (const ok of ['Sign in to view full details', 'SIGN IN TO VIEW FULL DETAILS']) {
      expect(WALL_RE.test(ok)).toBe(true);
    }
    for (const bad of ['Sign in to view all photos', 'Sign in to request viewing']) {
      expect(WALL_RE.test(bad)).toBe(false);
    }
  });

  it('LOCK_HEADING_RE accepts the lock heading and rejects the wall / submit copy', () => {
    expect(LOCK_HEADING_RE.test('Sign in to view all photos')).toBe(true);
    expect(LOCK_HEADING_RE.test('Sign in to view full details')).toBe(false);
    expect(LOCK_HEADING_RE.test('Sign in to request viewing')).toBe(false);
  });

  it('PANEL_HEADING_RE accepts the panel heading and rejects the submit-button text', () => {
    expect(PANEL_HEADING_RE.test('Request a viewing time')).toBe(true);
    expect(PANEL_HEADING_RE.test('Request viewing time')).toBe(false);
    expect(PANEL_HEADING_RE.test('Sign in to request viewing')).toBe(false);
  });

  it('the RequestViewingModal stub renders role=dialog when open and nothing when closed (no vacuous "no dialog")', () => {
    const { unmount } = render(<RequestViewingModal listingId="x" open onClose={() => {}} />);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    unmount();
    render(<RequestViewingModal listingId="x" open={false} onClose={() => {}} />);
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  });

  it('the contact-broker query is not blind: a Contact Broker button IS found when one exists', () => {
    render(<button type="button">Contact Broker</button>);
    expect(screen.queryAllByRole('button', { name: CONTACT_BROKER_RE })).toHaveLength(1);
  });
});

// ─── Gallery (e2e/gallery-behaviour.spec.ts) ──────────────────
describe('gallery — anonymous teaser (GB-A*)', () => {
  it('GB-A2c: after Next the lock shows and the counter STILL reads "1 / 3" (index did not advance)', async () => {
    installHttp(3);
    renderPage();
    // Positive control: gallery rendered from the HTTP-served teaser.
    expect(COUNTER(1, 3).test((await screen.findByTestId('gallery-counter')).textContent ?? '')).toBe(true);
    expect(lockHeading()).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /next image/i }));

    // Control that Next took effect: the lock heading appeared.
    expect(await screen.findByRole('heading', { name: LOCK_HEADING_RE })).toBeInTheDocument();
    // The assertion under test: the displayed index did not advance.
    expect(counter().textContent).toMatch(COUNTER(1, 3));
    expectObservedAuth('anon');
  });

  it('GB-A3b: the lock icon (svg.lucide-lock) sits INSIDE the overlay that holds the lock heading', async () => {
    installHttp(3);
    renderPage();
    await screen.findByTestId('gallery-counter');
    await userEvent.click(screen.getByRole('button', { name: /next image/i }));

    const heading = await screen.findByRole('heading', { name: LOCK_HEADING_RE });
    const overlay = heading.closest('div.absolute');
    expect(overlay).not.toBeNull();
    expect(overlay!.querySelector('svg.lucide-lock')).not.toBeNull();
    expect(overlay!.querySelector('svg.lucide-eye')).toBeNull();
    // The CTA lives in the same overlay container.
    expect(overlay!.querySelector('a')).not.toBeNull();
    expectObservedAuth('anon');
  });

  it('GB-A4c: Prev after the lock clears it and the counter reads "1 / 3"', async () => {
    installHttp(3);
    renderPage();
    await screen.findByTestId('gallery-counter');
    await userEvent.click(screen.getByRole('button', { name: /next image/i }));
    expect(await screen.findByRole('heading', { name: LOCK_HEADING_RE })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /previous image/i }));

    // Positive control on the same render: the gallery is still there.
    expect(counter().textContent).toMatch(COUNTER(1, 3));
    expect(lockHeading()).toBeNull();
    expectObservedAuth('anon');
  });

  it('GB-A5: anon has NO thumbnail strip (no tablist, no tab) while the gallery counter is present', async () => {
    installHttp(3);
    renderPage();
    // Positive control first: the gallery rendered and shows the total incl. locked photos.
    expect((await screen.findByTestId('gallery-counter')).textContent).toMatch(COUNTER(1, 3));
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expectObservedAuth('anon');
  });

  it('GB-A6: the counter total N follows imageCount SERVED over HTTP (4 -> "1 / 4", 2 -> "1 / 2")', async () => {
    for (const n of [4, 2]) {
      httpLog.length = 0;
      installHttp(n);
      const { unmount } = renderPage();
      const c = await screen.findByTestId('gallery-counter');
      expect(c.textContent).toMatch(COUNTER(1, n));
      // The listing really came through the HTTP client (nothing seeded in the cache), anonymously.
      expect(httpLog.filter((h) => h.path === `/api/public/listings/${LISTING_ID}`)).toEqual([
        { method: 'GET', path: `/api/public/listings/${LISTING_ID}`, authed: false },
      ]);
      unmount();
      cleanup();
    }
    expectObservedAuth('anon');
  });
});

describe('gallery — authenticated (GB-B*)', () => {
  it('GB-B1: authed has a thumbnail tablist, no lock at index 0, Next does not lock and the counter reads "2 / 3"', async () => {
    setRole('authed');
    installHttp(3);
    renderPage();
    // Authed-only positive control first.
    expect(await screen.findByRole('tablist')).toBeInTheDocument();
    expect(counter().textContent).toMatch(COUNTER(1, 3));
    expect(lockHeading()).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /next image/i }));

    expect(counter().textContent).toMatch(COUNTER(2, 3));
    expect(lockHeading()).toBeNull();
    expectObservedAuth('authed');
    expect(httpLog.find((h) => h.path === `/api/public/listings/${LISTING_ID}`)?.authed).toBe(true);
  });

  it('GB-B2: authed thumbnails: >= 2 tabs, clicking the 2nd moves the counter to "2 / 3" and shows image 2', async () => {
    setRole('authed');
    installHttp(3);
    renderPage();
    expect(await screen.findByRole('tablist')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(counter().textContent).toMatch(COUNTER(1, 3));

    await userEvent.click(tabs[1]);

    expect(counter().textContent).toMatch(COUNTER(2, 3));
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('img', { name: 'Image 2' })).toHaveAttribute('src', imgUrl(2));
    expectObservedAuth('authed');
  });

  it('GB-B3: authed walks the full set with Next - no lock and counter "k / 3" at every step', async () => {
    setRole('authed');
    installHttp(3);
    renderPage();
    expect(await screen.findByRole('tablist')).toBeInTheDocument();
    for (let k = 2; k <= 3; k++) {
      await userEvent.click(screen.getByRole('button', { name: /next image/i }));
      expect(lockHeading()).toBeNull();
      expect(counter().textContent).toMatch(COUNTER(k, 3));
      expect(screen.getByRole('img', { name: `Image ${k}` })).toHaveAttribute('src', imgUrl(k));
    }
    expectObservedAuth('authed');
  });

  it('GB-B3 control (anon): the same Next walk locks at step 1 and never advances', async () => {
    installHttp(3);
    renderPage();
    expect(await screen.findByTestId('gallery-counter')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /next image/i }));

    expect(await screen.findByRole('heading', { name: LOCK_HEADING_RE })).toBeInTheDocument();
    expect(counter().textContent).toMatch(COUNTER(1, 3));
    expectObservedAuth('anon');
  });
});

// ─── Listing detail viewing (e2e/listing-detail-viewing.spec.ts) ─────────
describe.each<Role>(['anon', 'authed'])('listing detail viewing panel — %s', (role) => {
  it(`LDV-panel (${role}): h2 "Request a viewing time" present; no role=dialog; no "Sign in to view full details" wall`, async () => {
    setRole(role);
    installHttp(3);
    renderPage();
    // Positive controls first: the page loaded and the inline panel heading is a level-2 heading.
    expect(await screen.findByRole('heading', { level: 2, name: PANEL_HEADING_RE })).toBeInTheDocument();
    expect(await screen.findByTestId('gallery-counter')).toBeInTheDocument();

    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    expect(screen.queryByText(WALL_RE)).toBeNull();
    expect(document.body.textContent ?? '').not.toMatch(WALL_RE);
    expectObservedAuth(role);
  });

  it(`LDV-contact (${role}): request-viewing-btn present and NO "Contact broker" button anywhere on the page`, async () => {
    setRole(role);
    installHttp(3);
    renderPage();
    // Positive control: the real panel's submit button is on the page.
    const submit = await screen.findByTestId('request-viewing-btn');
    expect(submit).toBeInTheDocument();
    expect(submit.textContent).toMatch(role === 'authed' ? /request viewing time/i : /sign in to request viewing/i);

    expect(screen.queryAllByRole('button', { name: CONTACT_BROKER_RE })).toHaveLength(0);
    expectObservedAuth(role);
  });
});

describe('http mock hygiene', () => {
  it('only the three expected GET endpoints are requested for a listing page (no unmocked path was hit)', async () => {
    installHttp(3);
    renderPage();
    await screen.findByTestId('gallery-counter');
    await screen.findByRole('heading', { level: 2, name: PANEL_HEADING_RE });
    expect(unexpectedPaths).toEqual([]);
    expect(new Set(httpLog.map((h) => h.path))).toEqual(
      new Set([
        `/api/public/listings/${LISTING_ID}`,
        `/api/public/listings/${LISTING_ID}/price-history`,
        `/api/listings/${LISTING_ID}/trust`,
      ]),
    );
  });
});
