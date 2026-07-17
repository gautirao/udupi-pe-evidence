import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from '../LandingPage';

// ─── Hoisted mock handles ──────────────────────────────────────
const mockNavigate = vi.hoisted(() => vi.fn());
const mockSignOut = vi.hoisted(() => vi.fn());

// ─── Mutable auth state ───────────────────────────────────────
let mockIsLoading = false;
let mockUser: { email: string } | null = null;

// ─── Mocks ────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isLoading: mockIsLoading, user: mockUser, signOut: mockSignOut }),
}));

vi.mock('@/hooks/useTrendingAreas', () => ({
  useTrendingAreas: vi.fn(() => ({
    areas: [],
    isLoading: false,
    isError: false,
  })),
}));

// Default: no data yet (loading/undefined) → non-numeric early-access fallback.
vi.mock('@/hooks/useDiscoverSummary', () => ({
  useDiscoverSummary: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
  })),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ─── Helpers ──────────────────────────────────────────────────
function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage(initialPath = '/') {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <LandingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function mockSummary(value: {
  data?: unknown;
  isLoading?: boolean;
  isError?: boolean;
}) {
  const { useDiscoverSummary } = await import('@/hooks/useDiscoverSummary');
  vi.mocked(useDiscoverSummary).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...value,
  } as ReturnType<typeof useDiscoverSummary>);
}

// ─── Tests ────────────────────────────────────────────────────
describe('LandingPage (honest curated early-access — Issue #1792)', () => {
  beforeEach(() => {
    mockIsLoading = false;
    mockUser = null;
    mockNavigate.mockReset();
    mockSignOut.mockReset();
  });

  it('renders the hero with the honest curated heading', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /Coastal Karnataka homes, honestly curated/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('hero')).toBeInTheDocument();
  });

  it('shows a spinner while auth is loading and does not render the hero', async () => {
    vi.useFakeTimers();
    try {
      mockIsLoading = true;
      renderPage();
      await act(() => {
        vi.advanceTimersByTime(201);
      });
      expect(screen.queryByTestId('hero')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  describe('Header', () => {
    it('renders the ReTrends brand', () => {
      renderPage();
      expect(screen.getByText('ReTrends')).toBeInTheDocument();
      expect(screen.getByText('Real Estate Trends')).toBeInTheDocument();
    });

    it('renders the public nav links (Discover, Schools, Agricultural land, Trends) and List property CTA for anonymous users — no Saved', () => {
      renderPage();
      expect(screen.getByRole('link', { name: /Discover/i })).toHaveAttribute('href', '/discover?city=udupi');
      expect(screen.getByRole('link', { name: /Schools/i })).toHaveAttribute('href', '/discover?city=udupi&lat=13.34090&lon=74.74210&zoom=11&journey=school-first');
      expect(screen.getByRole('link', { name: /Agricultural land/i })).toHaveAttribute('href', '/discover?city=udupi&lat=13.34090&lon=74.74210&zoom=11&journey=agri-first');
      expect(screen.getByRole('link', { name: /^Trends$/i })).toHaveAttribute('href', '/trends?city=udupi');
      expect(screen.getByRole('link', { name: /List property/i })).toHaveAttribute('href', '/auth?redirect=/broker/listings/new&returnTo=/broker/listings/new');
      expect(screen.queryByRole('link', { name: /^Saved$/i })).not.toBeInTheDocument();
    });

    it('renders Saved and List property actions for signed-in normal consumers', () => {
      mockUser = { email: 'user@test.com' };
      renderPage();
      expect(screen.getByRole('link', { name: /^Saved$/i })).toHaveAttribute('href', '/saved-areas');
      expect(screen.getByRole('link', { name: /Saved homes/i })).toHaveAttribute('href', '/saved-homes');
      expect(screen.getByRole('link', { name: /List property/i })).toHaveAttribute('href', '/broker/listings/new');
    });

    it('updates header nav links when hero selectedCity changes to a non-default city', async () => {
      Element.prototype.hasPointerCapture = vi.fn();
      Element.prototype.setPointerCapture = vi.fn();
      Element.prototype.releasePointerCapture = vi.fn();
      Element.prototype.scrollIntoView = vi.fn();

      const user = userEvent.setup();
      renderPage();
      expect(screen.getByRole('link', { name: /Discover/i })).toHaveAttribute('href', '/discover?city=udupi');

      const citySelect = screen.getByRole('combobox', { name: /city/i });
      await user.click(citySelect);
      const option = await screen.findByRole('option', { name: /mangalore/i });
      await user.click(option);

      expect(screen.getByRole('link', { name: /Discover/i })).toHaveAttribute('href', '/discover?city=mangalore');
    });

    it('renders a Sign In link to /auth (unauthenticated)', () => {
      renderPage();
      const signInLink = screen.getByRole('link', { name: /Sign In/i });
      expect(signInLink).toBeInTheDocument();
      expect(signInLink.getAttribute('href')).toContain('/auth');
    });
  });

  describe('SiteHeader — auth state', () => {
    it('unauthenticated: renders Sign In button, no avatar', () => {
      renderPage();
      expect(screen.getByRole('link', { name: /Sign In/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^[A-Z]{2}$/i })).not.toBeInTheDocument();
    });

    it('authenticated: renders avatar, hides Sign In button', () => {
      mockUser = { email: 'test@example.com' };
      renderPage();
      expect(screen.queryByRole('link', { name: /Sign In/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^TE$/i })).toBeInTheDocument();
    });

    it('authenticated: email is shown inside the dropdown', async () => {
      mockUser = { email: 'test@example.com' };
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: /^TE$/i }));
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('authenticated: clicking Sign out calls signOut', async () => {
      mockUser = { email: 'test@example.com' };
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: /^TE$/i }));
      await user.click(screen.getByRole('menuitem', { name: /sign out/i }));
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('loading: renders neither Sign In nor avatar', async () => {
      mockIsLoading = true;
      renderPage();
      expect(screen.queryByRole('link', { name: /Sign In/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^[A-Z]{2}$/i })).not.toBeInTheDocument();
    });

    it('Sign In link encodes returnTo with current pathname', () => {
      renderPage('/');
      const signInLink = screen.getByRole('link', { name: /Sign In/i });
      const href = signInLink.getAttribute('href') ?? '';
      expect(href).toContain('returnTo');
      expect(href).toContain(encodeURIComponent('/'));
    });

    it('Sign In link encodes returnTo including query params', () => {
      renderPage('/discover?city=udupi&journey=area-first');
      const signInLink = screen.getByRole('link', { name: /Sign In/i });
      const href = signInLink.getAttribute('href') ?? '';
      expect(href).toContain('returnTo');
      expect(href).toContain('%2Fdiscover');
    });
  });

  describe('Hero search', () => {
    it('renders the city select and optional locality input', () => {
      renderPage();
      expect(screen.getByLabelText(/City/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Locality/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Search localities/i)).toBeInTheDocument();
    });

    it('renders the Explore on Map button', () => {
      renderPage();
      expect(screen.getByRole('button', { name: /Explore on Map/i })).toBeInTheDocument();
    });

    it('Explore on Map navigates to /discover with the city param and without journey=area-first', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: /Explore on Map/i }));
      expect(mockNavigate).toHaveBeenCalledWith('/discover?city=udupi');
      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('journey=area-first'));
    });
  });

  describe('Hero stats — live counts with honest non-numeric fallback', () => {
    it('renders only the real totalActiveListings count (no derived locality figure)', async () => {
      await mockSummary({
        data: {
          city: 'udupi',
          totalActiveListings: 27,
          regions: [],
          // hotspots is a capped sample, not the true locality total — the hero
          // stats must NOT surface it as an "across N localities" figure.
          hotspots: [
            { areaKey: 'a1', name: 'Manipal', listingCount: 10, geoCenterLat: 0, geoCenterLon: 0 },
            { areaKey: 'a2', name: 'Katapadi', listingCount: 8, geoCenterLat: 0, geoCenterLon: 0 },
            { areaKey: 'a3', name: 'Malpe', listingCount: 6, geoCenterLat: 0, geoCenterLon: 0 },
            { areaKey: 'a4', name: 'Kaup', listingCount: 3, geoCenterLat: 0, geoCenterLon: 0 },
          ],
        },
      });
      renderPage();
      const stats = within(screen.getByTestId('hero-stats'));
      expect(stats.getByText(/27 curated listings/i)).toBeInTheDocument();
      // No derived/implied locality count from the capped hotspots sample.
      expect(stats.queryByText(/localit/i)).not.toBeInTheDocument();
      expect(stats.queryByText(/across/i)).not.toBeInTheDocument();
      // Fallback early-access copy must NOT appear in the stats row when real counts are present.
      expect(stats.queryByText(/early access/i)).not.toBeInTheDocument();
    });

    it('renders truthful non-numeric copy when the summary API errors (no fabricated numbers)', async () => {
      await mockSummary({ isError: true });
      renderPage();
      const stats = within(screen.getByTestId('hero-stats'));
      expect(stats.getByText(/Curated early access/i)).toBeInTheDocument();
      expect(stats.getByText(/Personally onboarded brokers/i)).toBeInTheDocument();
      // No fabricated "N ... listings" number in the stats row.
      expect(stats.queryByText(/\d+\s+curated listings/i)).not.toBeInTheDocument();
    });

    it('does not fabricate marketing numbers when counts are zero', async () => {
      await mockSummary({
        data: {
          city: 'udupi',
          totalActiveListings: 0,
          regions: [],
          hotspots: [],
        },
      });
      renderPage();
      const stats = within(screen.getByTestId('hero-stats'));
      expect(stats.getByText(/Curated early access/i)).toBeInTheDocument();
      expect(stats.queryByText(/0 curated/i)).not.toBeInTheDocument();
      expect(stats.queryByText(/500\+/)).not.toBeInTheDocument();
    });

    it('shows the non-numeric fallback while the summary is still loading', async () => {
      await mockSummary({ isLoading: true });
      renderPage();
      const stats = within(screen.getByTestId('hero-stats'));
      expect(stats.getByText(/Curated early access/i)).toBeInTheDocument();
      expect(stats.queryByText(/\d+\s+curated listings/i)).not.toBeInTheDocument();
    });
  });

  describe('Hero image', () => {
    it('uses a repository-owned local hero asset (no remote stock URL)', () => {
      renderPage();
      const img = screen.getByRole('img', { name: /Coastal Karnataka homes/i });
      expect(img).toHaveAttribute('src', '/hero-coastal-karnataka.svg');
      expect(img.getAttribute('src') ?? '').not.toMatch(/unsplash|https?:\/\//i);
    });

    it('renders the curated early-access overlay card', () => {
      renderPage();
      expect(screen.getAllByText(/Curated early access/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Honesty guarantees', () => {
    it('contains no unsupported verification wording anywhere on the page', () => {
      const { container } = renderPage();
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/verified/i);
      expect(text).not.toMatch(/personally verified/i);
      expect(text).not.toMatch(/credential checked/i);
      expect(text).not.toMatch(/RERA verified/i);
      expect(text).not.toMatch(/documents? checked/i);
    });

    it('shows no Bangalore fallback localities', () => {
      const { container } = renderPage();
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/Koramangala/i);
      expect(text).not.toMatch(/Indiranagar/i);
      expect(text).not.toMatch(/HSR Layout/i);
      expect(text).not.toMatch(/Bangalore/i);
    });

    it('uses honest founder-managed wording, not guarantee-style freshness claims', () => {
      const { container } = renderPage();
      const text = container.textContent ?? '';
      // No wording implying a dedicated automated/systematic reconfirmation workflow.
      expect(text).not.toMatch(/no stale listings/i);
      expect(text).not.toMatch(/unconfirmed listings are removed/i);
      expect(text).not.toMatch(/real and current/i);
      // Positive assertion: founder-operated process wording is present.
      expect(text).toMatch(/founding team/i);
    });
  });

  describe('Major sections', () => {
    it('renders the Why Choose ReTrends section with the honest curation feature', () => {
      renderPage();
      expect(screen.getByRole('heading', { name: /Why Choose ReTrends\?/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Map-First Discovery/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Honest Curation/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Market Insights/i })).toBeInTheDocument();
    });

    it('renders the Trending Localities section with a non-numeric note when no live data', () => {
      renderPage();
      expect(screen.getByRole('heading', { name: /Localities in Udupi/i })).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /New localities are being added/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /View All Trends/i })).toHaveAttribute(
        'href',
        expect.stringContaining('/trends'),
      );
    });

    it('renders the honest curation-practices section', () => {
      renderPage();
      expect(
        screen.getByRole('heading', { name: /How we keep listings honest/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /Personally onboarded brokers/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Founder-managed listings/i })).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /RERA number provided by seller/i }),
      ).toBeInTheDocument();
    });

    it('renders the Area Overview Pages section with coastal localities and no fabricated counts', () => {
      renderPage();
      expect(screen.getByRole('heading', { name: /Area Overview Pages/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /^Manipal$/i })).toBeInTheDocument();
      expect(screen.getByText(/Full Data/i)).toBeInTheDocument();
      expect(screen.getByText(/Limited Data/i)).toBeInTheDocument();
      expect(screen.getByText(/Fallback Data/i)).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /View Overview/i }).length).toBe(3);
    });

    it('renders the bottom CTA with both action buttons', () => {
      renderPage();
      expect(
        screen.getByRole('heading', { name: /Ready to Find Your Perfect Home\?/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Start Map Search/i })).toHaveAttribute(
        'href',
        expect.stringContaining('/discover'),
      );
      expect(screen.getByRole('link', { name: /Explore Trends/i })).toHaveAttribute('href', '/trends');
    });
  });

  describe('Trending Localities live data', () => {
    it('renders live trending areas when the hook returns data', async () => {
      const { useTrendingAreas } = await import('@/hooks/useTrendingAreas');
      vi.mocked(useTrendingAreas).mockReturnValue({
        areas: [
          {
            areaKey: 'area|manipal|udupi',
            areaLabel: 'Manipal',
            districtLabel: 'Udupi',
            medianPricePaise: 1_500_000_000,
            listingCount90d: 12,
          },
        ],
        isLoading: false,
        isError: false,
      } as ReturnType<typeof useTrendingAreas>);

      renderPage();
      // Manipal appears in both the live Trending card and the Area Overview section.
      expect(screen.getAllByRole('heading', { name: /^Manipal$/i }).length).toBeGreaterThanOrEqual(1);
      // The non-numeric "being added" note must NOT render when live data is present.
      expect(
        screen.queryByRole('heading', { name: /New localities are being added/i }),
      ).not.toBeInTheDocument();
    });

    it('filters trending cards to the selected city, excluding other-city areas', async () => {
      const { useTrendingAreas } = await import('@/hooks/useTrendingAreas');
      // Mixed source data: one Udupi area and one Bangalore area. Selected city is
      // the default (udupi) → only the Udupi card may render under the city-specific
      // heading; the Bangalore area must be excluded, not silently shown.
      vi.mocked(useTrendingAreas).mockReturnValue({
        areas: [
          {
            areaKey: 'area|manipal|Udupi',
            areaLabel: 'Manipal',
            districtLabel: 'Udupi',
            medianPricePaise: 1_500_000_000,
            listingCount90d: 12,
          },
          {
            areaKey: 'area|koramangala|Bengaluru',
            areaLabel: 'Koramangala',
            districtLabel: 'Bengaluru',
            medianPricePaise: 9_000_000_000,
            listingCount90d: 88,
          },
        ],
        isLoading: false,
        isError: false,
      } as ReturnType<typeof useTrendingAreas>);

      renderPage();
      // Udupi area renders; Bangalore area is excluded entirely (not in any card).
      expect(screen.getAllByRole('heading', { name: /^Manipal$/i }).length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByRole('heading', { name: /Koramangala/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/Bengaluru/i)).not.toBeInTheDocument();
    });

    it('shows the honest empty state when no live area matches the selected city', async () => {
      const { useTrendingAreas } = await import('@/hooks/useTrendingAreas');
      // All live areas belong to a different city than the selected default (udupi).
      vi.mocked(useTrendingAreas).mockReturnValue({
        areas: [
          {
            areaKey: 'area|koramangala|Bengaluru',
            areaLabel: 'Koramangala',
            districtLabel: 'Bengaluru',
            medianPricePaise: 9_000_000_000,
            listingCount90d: 88,
          },
        ],
        isLoading: false,
        isError: false,
      } as ReturnType<typeof useTrendingAreas>);

      renderPage();
      // No fabricated/wrong-city cards; the existing honest empty state renders.
      expect(
        screen.getByRole('heading', { name: /New localities are being added/i }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /Koramangala/i })).not.toBeInTheDocument();
    });
  });
});

// ─── index.html metadata (real product branding, no Lovable placeholders) ───
describe('index.html metadata', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');

  it('uses real ReTrends branding in the title and description', () => {
    expect(html).toMatch(/<title>[^<]*ReTrends[^<]*<\/title>/i);
    expect(html).toMatch(/name="description"[^>]*content="[^"]*coastal Karnataka/i);
  });

  it('has no Lovable placeholder metadata', () => {
    expect(html).not.toMatch(/Lovable/i);
    expect(html).not.toMatch(/lovable\.dev/i);
  });

  it('uses real OG and Twitter branding with an absolute raster social image', () => {
    expect(html).toMatch(/property="og:title"[^>]*content="[^"]*ReTrends/i);
    // Social scrapers require an absolute (https) raster URL, not a relative path or SVG.
    expect(html).toMatch(
      /property="og:image"[^>]*content="https:\/\/propertysignal\.in\/og-card\.png"/i,
    );
    expect(html).toMatch(
      /name="twitter:image"[^>]*content="https:\/\/propertysignal\.in\/og-card\.png"/i,
    );
    // Declared at the OG-standard 1200x630 raster dimensions.
    expect(html).toMatch(/property="og:image:width"[^>]*content="1200"/i);
    expect(html).toMatch(/property="og:image:height"[^>]*content="630"/i);
    // og:image must not point at a relative path or an SVG.
    expect(html).not.toMatch(/property="og:image"[^>]*content="\/[^"]*"/i);
    expect(html).not.toMatch(/property="og:image"[^>]*content="[^"]*\.svg"/i);
    // Uses the real production origin, not the CI/deploy-default domain.
    expect(html).toMatch(/property="og:url"[^>]*content="https:\/\/propertysignal\.in\//i);
    expect(html).not.toMatch(/pages\.dev/i);
  });
});
