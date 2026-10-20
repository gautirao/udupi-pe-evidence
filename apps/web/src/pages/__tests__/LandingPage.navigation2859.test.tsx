/**
 * #2859 B4 (csv176, e2e/homepage-listing-journey.spec.ts) — landing navigation LANDS, not just
 * builds a URL.
 *
 * LandingPage.test.tsx mocks `useNavigate` and asserts the argument only; several of its header
 * its are red at base (default city moved to `bangalore`, brand renamed). This file uses the REAL
 * router: a MemoryRouter with the landing page on `/` and a LocationProbe on every other path, so
 * each click is proved by the location the app actually arrived at (H3.land, H3b.land), not by a
 * spy argument. The expected city is derived from DEFAULT_CITY, never typed.
 *
 * Synthetic data only; no network (useTrendingAreas / useDiscoverSummary mocked to their idle
 * shape, as LandingPage.test.tsx does).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import LandingPage from '../LandingPage';
import { DEFAULT_CITY } from '@/lib/localityUtils';

let mockUser: { email: string } | null = null;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isLoading: false, user: mockUser, signOut: vi.fn(), isAdmin: false, isBroker: false }),
}));

vi.mock('@/hooks/useTrendingAreas', () => ({
  useTrendingAreas: vi.fn(() => ({ areas: [], isLoading: false, isError: false })),
}));

vi.mock('@/hooks/useDiscoverSummary', () => ({
  useDiscoverSummary: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="landed" data-pathname={location.pathname} data-search={location.search} />
  );
}

function renderLanding() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function landed() {
  const probe = screen.getByTestId('landed');
  return {
    pathname: probe.getAttribute('data-pathname'),
    params: new URLSearchParams(probe.getAttribute('data-search') ?? ''),
  };
}

beforeEach(() => {
  mockUser = null;
});

describe('LandingPage navigation #2859 B4 (real router, no useNavigate mock)', () => {
  it('H3.land: Explore on Map lands on /discover?city=<default city> and leaves the landing page', async () => {
    const user = userEvent.setup();
    renderLanding();

    // Before: on the landing page, nothing has navigated yet.
    expect(screen.queryByTestId('landed')).not.toBeInTheDocument();
    expect(screen.getByTestId('hero')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Explore on Map/i }));

    // After: the hero is gone and the router is on Discover with the selected city.
    expect(screen.queryByTestId('hero')).not.toBeInTheDocument();
    const { pathname, params } = landed();
    expect(pathname).toBe('/discover');
    expect(params.get('city')).toBe(DEFAULT_CITY);
    expect(params.get('journey')).toBeNull();
  });

  it('H3b.land: the header Discover link carries /discover?city=<default city> and the click lands there', async () => {
    const user = userEvent.setup();
    renderLanding();

    const discover = screen.getByRole('link', { name: 'Discover' });
    expect(discover).toHaveAttribute('href', `/discover?city=${DEFAULT_CITY}`);

    await user.click(discover);

    const { pathname, params } = landed();
    expect(pathname).toBe('/discover');
    expect(params.get('city')).toBe(DEFAULT_CITY);
  });

  it('H3b.land: the bottom-CTA Start Map Search click lands on /discover?city=<default city>', async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getByRole('link', { name: /Start Map Search/i }));

    const { pathname, params } = landed();
    expect(pathname).toBe('/discover');
    expect(params.get('city')).toBe(DEFAULT_CITY);
  });

  it('H3b.land: the bottom-CTA Explore Trends click lands on /trends', async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getByRole('link', { name: /Explore Trends/i }));

    const { pathname } = landed();
    expect(pathname).toBe('/trends');
  });

  // LandingPage.test.tsx is red at base on 15 of 37 its, so NONE of its its are cited; the landing
  // section claims are proved here instead (H2a, H2e, H2f, H3b.href, P1a).
  it('H2a: the hero search renders the Explore on Map button and the "Search localities..." input', () => {
    renderLanding();
    expect(screen.getByRole('button', { name: 'Explore on Map' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search localities...')).toBeInTheDocument();
  });

  it('H2e: the "Area Overview Pages" section heading renders', () => {
    renderLanding();
    expect(screen.getByRole('heading', { level: 2, name: 'Area Overview Pages' })).toBeInTheDocument();
  });

  it('H2f / H3b.href: the bottom CTA heading renders with Start Map Search -> /discover?city=<default> and Explore Trends -> /trends', () => {
    renderLanding();
    expect(screen.getByRole('heading', { level: 2, name: 'Ready to Find Your Perfect Home?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Start Map Search/i })).toHaveAttribute('href', `/discover?city=${DEFAULT_CITY}`);
    expect(screen.getByRole('link', { name: /Explore Trends/i })).toHaveAttribute('href', '/trends');
  });

  it('P1a: the anonymous header Sign in link points at /auth with returnTo=/', () => {
    renderLanding();
    const signIn = screen.getByRole('link', { name: /^Sign in$/i });
    expect(signIn).toHaveAttribute('href', `/auth?returnTo=${encodeURIComponent('/')}`);
  });

  it('P1b: the anonymous header shows the Sign in link and contains no literal "undefined"', () => {
    renderLanding();

    const header = screen.getByRole('banner');
    // Positive control first: this IS the anonymous header (Sign in rendered, brand rendered).
    expect(screen.getByRole('link', { name: /^Sign in$/i })).toBeInTheDocument();
    expect(header.textContent ?? '').toMatch(/Real Estate Trends/);
    // The legacy defect: an anonymous email interpolated as "undefined".
    expect(header.textContent ?? '').not.toContain('undefined');
  });
});
