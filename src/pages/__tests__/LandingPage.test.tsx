import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import LandingPage from '../LandingPage';

// ─── Hoisted mock handles ──────────────────────────────────────
const mockNavigate = vi.hoisted(() => vi.fn());

// ─── Mutable auth state ───────────────────────────────────────
let mockIsLoading = false;

// ─── Mocks ────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isLoading: mockIsLoading }),
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

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────
describe('LandingPage', () => {
  beforeEach(() => {
    mockIsLoading = false;
    mockNavigate.mockReset();
  });

  it('renders the two-column wrapper at the layout level', () => {
    renderPage();
    expect(screen.getByTestId('two-column-wrapper')).toBeInTheDocument();
  });

  it('renders both columns: hero content and filter panel', () => {
    renderPage();
    // Left column: hero h1 heading (exact text starts with "Find Your Perfect Home with Trust")
    expect(
      screen.getByRole('heading', { name: /Find Your Perfect Home with Trust/i }),
    ).toBeInTheDocument();
    // Right column: HomepageFilterPanel heading
    expect(
      screen.getByRole('heading', { name: /Find your next property/i }),
    ).toBeInTheDocument();
  });

  it('shows a spinner while auth is loading and does not render the two-column wrapper', () => {
    mockIsLoading = true;
    renderPage();
    expect(screen.queryByTestId('two-column-wrapper')).not.toBeInTheDocument();
  });

  it('renders the header with ReTrends brand and Sign in link', () => {
    renderPage();
    expect(screen.getByText('ReTrends')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sign in/i })).toBeInTheDocument();
  });

  it('renders the hero Explore on Map button', () => {
    renderPage();
    // One in the left column, one inside HomepageFilterPanel (right column)
    const exploreButtons = screen.getAllByRole('button', { name: /Explore on Map/i });
    expect(exploreButtons).toHaveLength(2);
  });

  it('left-column Explore on Map navigates to /discover with city param', async () => {
    const user = userEvent.setup();
    renderPage();
    const buttons = screen.getAllByRole('button', { name: /Explore on Map/i });
    // First button is the left-column CTA
    await user.click(buttons[0]);
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/discover?city=bangalore'));
  });

  it('renders the panel toggle button', () => {
    renderPage();
    expect(screen.getByTestId('panel-toggle')).toBeInTheDocument();
  });

  it('panel is open by default — right column has lg:w-1/2 class', () => {
    renderPage();
    const rightCol = screen.getByTestId('filter-panel-col');
    expect(rightCol.className).toContain('lg:w-1/2');
  });

  it('clicking toggle collapses the right panel then expands it again', async () => {
    const user = userEvent.setup();
    renderPage();
    const toggle = screen.getByTestId('panel-toggle');
    const rightCol = screen.getByTestId('filter-panel-col');

    // Initially open
    expect(rightCol.className).toContain('lg:w-1/2');
    expect(rightCol.className).not.toContain('lg:w-0');

    // Collapse
    await user.click(toggle);
    expect(rightCol.className).toContain('lg:w-0');
    expect(rightCol.className).not.toContain('lg:w-1/2');

    // Expand
    await user.click(toggle);
    expect(rightCol.className).toContain('lg:w-1/2');
    expect(rightCol.className).not.toContain('lg:w-0');
  });
});
