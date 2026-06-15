import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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

// ─── Tests ────────────────────────────────────────────────────
describe('LandingPage (ReTrends redesign)', () => {
  beforeEach(() => {
    mockIsLoading = false;
    mockUser = null;
    mockNavigate.mockReset();
    mockSignOut.mockReset();
  });

  it('renders the hero with the main heading', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /Find Your Perfect Home with Trust/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('hero')).toBeInTheDocument();
  });

  it('shows a spinner while auth is loading and does not render the hero', async () => {
    vi.useFakeTimers();
    try {
      mockIsLoading = true;
      renderPage();
      // Advance past the 200 ms delayed-show threshold and flush the React state update
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

    it('renders the nav links (Discover, Trends, Saved) with correct routes', () => {
      renderPage();
      expect(screen.getByRole('link', { name: /Discover/i })).toHaveAttribute('href', '/discover');
      expect(screen.getByRole('link', { name: /^Trends$/i })).toHaveAttribute('href', '/trends');
      expect(screen.getByRole('link', { name: /Saved/i })).toHaveAttribute('href', '/saved-areas');
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
      // mockUser is null from beforeEach
      renderPage();
      expect(screen.getByRole('link', { name: /Sign In/i })).toBeInTheDocument();
      // No avatar trigger (ghost button with initials)
      expect(screen.queryByRole('button', { name: /^[A-Z]{2}$/i })).not.toBeInTheDocument();
    });

    it('authenticated: renders avatar, hides Sign In button', () => {
      mockUser = { email: 'test@example.com' };
      renderPage();
      // Sign In link must not be present
      expect(screen.queryByRole('link', { name: /Sign In/i })).not.toBeInTheDocument();
      // Avatar initials button is present (first 2 chars of "test" → "TE")
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
      // Do not advance timers — isLoading=true but showAuthLoader hasn't fired yet,
      // so the header renders with isLoading=true → null from SiteHeader
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
      // The encoded value must contain the path portion
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

    it('Explore on Map navigates to /discover with the city param', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: /Explore on Map/i }));
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringContaining('/discover?city=bangalore'),
      );
    });

    it('renders the trust stats row', () => {
      renderPage();
      expect(screen.getByText(/500\+ Verified Listings/i)).toBeInTheDocument();
      expect(screen.getByText(/Trusted Brokers/i)).toBeInTheDocument();
    });
  });

  describe('Hero image', () => {
    it('uses the required Unsplash hero image', () => {
      renderPage();
      const img = screen.getByRole('img', { name: /Verified property/i });
      expect(img).toHaveAttribute(
        'src',
        'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&h=600&fit=crop',
      );
    });

    it('renders the Verified Property overlay card', () => {
      renderPage();
      expect(screen.getByText('Verified Property')).toBeInTheDocument();
    });
  });

  describe('Major sections', () => {
    it('renders the Why Choose ReTrends section with three features', () => {
      renderPage();
      expect(
        screen.getByRole('heading', { name: /Why Choose ReTrends\?/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Map-First Discovery/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Trust Signals/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Market Insights/i })).toBeInTheDocument();
    });

    it('renders the Trending Localities section (static fallback when no live data)', () => {
      renderPage();
      expect(
        screen.getByRole('heading', { name: /Trending Localities in Bangalore/i }),
      ).toBeInTheDocument();
      // Koramangala appears in both Trending and Area Overview sections (static fallback)
      expect(screen.getAllByRole('heading', { name: /Koramangala/i }).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('heading', { name: /Indiranagar/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /HSR Layout/i })).toBeInTheDocument();
      // View All Trends link routes to /trends
      expect(screen.getByRole('link', { name: /View All Trends/i })).toHaveAttribute(
        'href',
        expect.stringContaining('/trends'),
      );
    });

    it('renders the Trust Badges section with Verified, Trusted, Listed', () => {
      renderPage();
      expect(
        screen.getByRole('heading', { name: /Understanding Trust Badges/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /^Verified$/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /^Trusted$/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /^Listed$/i })).toBeInTheDocument();
    });

    it('renders the Area Overview Pages section with three cards', () => {
      renderPage();
      expect(
        screen.getByRole('heading', { name: /Area Overview Pages/i }),
      ).toBeInTheDocument();
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
      expect(screen.getByRole('link', { name: /Explore Trends/i })).toHaveAttribute(
        'href',
        '/trends',
      );
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
      expect(screen.getByRole('heading', { name: /^Manipal$/i })).toBeInTheDocument();
      // static fallback should NOT render when live data is present
      expect(screen.queryByRole('heading', { name: /Indiranagar/i })).not.toBeInTheDocument();
    });
  });
});
