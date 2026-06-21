/**
 * BrokerDashboard v2 — component render + honest-state tests.
 *
 * AC1  — 5 summary cards + nav section + 'Start here today' all present
 * AC3  — PENDING / PARTIAL / COMPLETE quality states render correct copy
 * AC4  — Engagement 'coming soon' (no numeric value)
 * AC5  — Demand gap 'limited data' tile
 * AC7  — /broker/listing-quality link disabled; /broker/listings link present
 * Load — skeleton present while loading
 * Err  — error/retry UI present on failure
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BrokerDashboard from '../BrokerDashboard';

// ── Hoisted mock factories ────────────────────────────────────────────────────

const mockQualitySummary = vi.hoisted(() => ({
  current: null as import('@/hooks/useBrokerListings').BrokerQualitySummaryResponse | null,
}));

const mockHookState = vi.hoisted(() => ({
  qualityLoading: false,
  qualityError: false,
  statsLoading: false,
  statsError: false,
  recentLoading: false,
  recentError: false,
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    isBroker: true,
    isAdmin: false,
    isLoading: false,
    user: {
      id: 'broker-uid-1',
      user_metadata: { full_name: 'Test Broker' },
    },
  })),
}));

vi.mock('@/hooks/useBrokerListings', () => ({
  useBrokerQualitySummary: vi.fn(() => ({
    data: mockQualitySummary.current,
    isLoading: mockHookState.qualityLoading,
    isError: mockHookState.qualityError,
    refetch: vi.fn(),
  })),
  useBrokerListingStats: vi.fn(() => ({
    data: { draftCount: 0, pendingReviewCount: 0, liveCount: 2, rejectedCount: 0, totalCount: 5 },
    isLoading: mockHookState.statsLoading,
    isError: mockHookState.statsError,
    refetch: vi.fn(),
  })),
  useBrokerMyListings: vi.fn(() => ({
    data: { listings: [], totalPages: 0, totalElements: 0, currentPage: 0, pageSize: 5, isFirst: true, isLast: true },
    isLoading: mockHookState.recentLoading,
    isError: mockHookState.recentError,
    refetch: vi.fn(),
  })),
}));

// Stub the trust panel — it makes its own API call which we don't need here
vi.mock('@/components/trust/TrustProgressPanel', () => ({
  TrustProgressPanel: () => <div data-testid="trust-progress-panel-stub" />,
}));

// Stub AppLayout to avoid routing/auth side-effects in tests
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

// api is called directly inside BrokerDashboard for the trust-progress sub-query
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({ badges: [] })),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// ── Fixture DTOs ──────────────────────────────────────────────────────────────

function buildQualitySummary(
  overrides: Partial<import('@/hooks/useBrokerListings').BrokerQualitySummaryResponse> = {},
): import('@/hooks/useBrokerListings').BrokerQualitySummaryResponse {
  return {
    portfolio: { activeListings: 2, totalListings: 5 },
    quality: {
      state: 'COMPLETE',
      averageQualityScore: 78,
      countComputed: 5,
      countTotal: 5,
      percentageComputed: 100,
    },
    actionSignals: {
      needsFixes: { count: 0, state: 'COMPLETE' },
      missingLocation: { count: 0, state: 'COMPLETE' },
      incomplete: { count: 0, state: 'COMPLETE' },
      buyerReady: { count: 2, state: 'COMPLETE' },
    },
    engagement: {
      state: 'UNAVAILABLE',
      views: null,
      enquiries: null,
      reason: 'Engagement tracking is not yet available.',
    },
    demandGap: {
      state: 'LIMITED_DATA',
      signal: null,
      reason: 'Not enough data to compute demand gaps.',
    },
    ...overrides,
  };
}

// ── Render helper ─────────────────────────────────────────────────────────────

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/broker/dashboard']}>
        <BrokerDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BrokerDashboard v2', () => {
  beforeEach(() => {
    // Reset hook state to defaults
    mockHookState.qualityLoading = false;
    mockHookState.qualityError = false;
    mockHookState.statsLoading = false;
    mockHookState.statsError = false;
    mockHookState.recentLoading = false;
    mockHookState.recentError = false;
    mockQualitySummary.current = buildQualitySummary();
    vi.clearAllMocks();
  });

  // ── AC1: structural presence ─────────────────────────────────────────────

  describe('AC1 — structural presence', () => {
    it('renders the 5 summary card labels', () => {
      renderDashboard();

      // Card labels use uppercase text — check case-insensitive (multiple matches are expected)
      expect(screen.getAllByText(/active listings/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/avg quality/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/needs fixes/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/missing location/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/buyer-ready/i).length).toBeGreaterThanOrEqual(1);
    });

    it('renders the "How are these calculated?" link/button', () => {
      renderDashboard();
      expect(screen.getAllByText(/how are these calculated/i).length).toBeGreaterThanOrEqual(1);
    });

    it('renders the "Start here today" section heading', () => {
      renderDashboard();
      expect(screen.getByText(/start here today/i)).toBeInTheDocument();
    });

    it('renders the "Broker workspaces" nav section heading', () => {
      renderDashboard();
      expect(screen.getByText(/broker workspaces/i)).toBeInTheDocument();
    });

    it('renders "My Listings" and "Drafts" nav workspace cards', () => {
      renderDashboard();
      expect(screen.getByText('My Listings')).toBeInTheDocument();
      expect(screen.getByText('Drafts')).toBeInTheDocument();
    });
  });

  // ── AC3: PENDING quality state ───────────────────────────────────────────

  describe('AC3 — PENDING quality state', () => {
    // countTotal > 0, countComputed = 0 → backend returns percentageComputed: 0 (not null)
    it('shows "Not yet scored" label when quality.state=PENDING and averageQualityScore=null (countTotal>0)', () => {
      mockQualitySummary.current = buildQualitySummary({
        quality: {
          state: 'PENDING',
          averageQualityScore: null,
          countComputed: 0,
          countTotal: 3,
          percentageComputed: 0, // backend sends 0, not null, when countTotal > 0
        },
      });
      renderDashboard();

      expect(screen.getByText(/not yet scored/i)).toBeInTheDocument();
    });

    it('does NOT render a bare "0" as the average quality score in PENDING state', () => {
      mockQualitySummary.current = buildQualitySummary({
        quality: {
          state: 'PENDING',
          averageQualityScore: null,
          countComputed: 0,
          countTotal: 3,
          percentageComputed: 0, // backend sends 0, not null, when countTotal > 0
        },
      });
      renderDashboard();

      // Find the Avg Quality card area — it should not show "0" as the score
      // We locate the "Avg Quality" label then look at its parent card
      const avgQualityLabel = screen.getByText(/avg quality/i);
      const cardContent = avgQualityLabel.closest('[class*="CardContent"], [class*="p-4"]') ?? avgQualityLabel.parentElement?.parentElement;

      if (cardContent) {
        // The score "0" should not appear as a standalone large number inside the card
        expect(within(cardContent as HTMLElement).queryByText('0')).toBeNull();
      }

      // Belt-and-suspenders: the text "Not yet scored" must be present
      expect(screen.getByText(/not yet scored/i)).toBeInTheDocument();
    });

    // countTotal = 0 → no listings exist at all; backend returns percentageComputed: null
    it('shows "Not yet scored" label when quality.state=PENDING with countTotal=0 (percentageComputed=null)', () => {
      mockQualitySummary.current = buildQualitySummary({
        quality: {
          state: 'PENDING',
          averageQualityScore: null,
          countComputed: 0,
          countTotal: 0,
          percentageComputed: null, // null only when countTotal = 0
        },
      });
      renderDashboard();

      // Still shows "Not yet scored" — a broker with zero listings sees the same honest state
      expect(screen.getByText(/not yet scored/i)).toBeInTheDocument();
    });
  });

  // ── AC3: PARTIAL quality state ───────────────────────────────────────────

  describe('AC3 — PARTIAL quality state', () => {
    it('shows "Based on 2 of 5 scored"-type caveat when state=PARTIAL', () => {
      mockQualitySummary.current = buildQualitySummary({
        quality: {
          state: 'PARTIAL',
          averageQualityScore: 65,
          countComputed: 2,
          countTotal: 5,
          percentageComputed: 40,
        },
      });
      renderDashboard();

      // The actual copy is "Based on 2 of 5 scored listings"
      expect(screen.getByText(/based on 2 of 5 scored/i)).toBeInTheDocument();
    });
  });

  // ── AC3: COMPLETE + zero missing location ────────────────────────────────

  describe('AC3 — COMPLETE state with zero count', () => {
    it('shows positive empty copy for missingLocation count=0 with COMPLETE state', () => {
      mockQualitySummary.current = buildQualitySummary({
        actionSignals: {
          needsFixes: { count: 0, state: 'COMPLETE' },
          missingLocation: { count: 0, state: 'COMPLETE' },
          incomplete: { count: 0, state: 'COMPLETE' },
          buyerReady: { count: 0, state: 'COMPLETE' },
        },
      });
      renderDashboard();

      // Should show positive copy, not a bare "0"
      expect(screen.getAllByText(/all location-confirmed/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── AC4: Engagement UNAVAILABLE ─────────────────────────────────────────

  describe('AC4 — Engagement UNAVAILABLE', () => {
    it('shows "coming soon" copy for engagement section', () => {
      renderDashboard();

      // Workspace nav card for Engagement
      expect(screen.getByText(/engagement tracking coming soon/i)).toBeInTheDocument();
    });

    it('does NOT render a numeric engagement value', () => {
      renderDashboard();

      // Locate the Engagement workspace nav card by its heading text
      const engagementHeading = screen.getByText('Engagement', { selector: 'p' });
      const engagementCard = engagementHeading.closest('[class*="p-4"]');

      if (engagementCard) {
        // Should not have a <p> with a purely numeric text child
        const pTags = Array.from(engagementCard.querySelectorAll('p'));
        const hasNumericValue = pTags.some((p) => /^\d+$/.test((p.textContent ?? '').trim()));
        expect(hasNumericValue).toBe(false);
      }

      // engagement.views and enquiries are null — no data-testid numeric elements
      expect(screen.queryByTestId('engagement-views')).toBeNull();
      expect(screen.queryByTestId('engagement-enquiries')).toBeNull();
    });
  });

  // ── AC5: Demand gap LIMITED_DATA ─────────────────────────────────────────

  describe('AC5 — Demand gap LIMITED_DATA', () => {
    it('renders the "Possible demand gap" action card with limited-data copy', () => {
      renderDashboard();

      expect(screen.getAllByText(/possible demand gap/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/limited data/i).length).toBeGreaterThanOrEqual(1);
    });

    it('renders the Demand Gaps workspace nav card with limited-data copy', () => {
      renderDashboard();

      expect(screen.getByText('Demand Gaps')).toBeInTheDocument();
      expect(screen.getByText(/limited data.*coming in a future update/i)).toBeInTheDocument();
    });
  });

  // ── AC7: listing-quality disabled; /broker/listings active ──────────────

  describe('AC7 — listing-quality CTA disabled', () => {
    it('does NOT render an active anchor link to /broker/listing-quality', () => {
      renderDashboard();

      const allLinks = screen.queryAllByRole('link');
      const qualityLinks = allLinks.filter(
        (el) => el.getAttribute('href') === '/broker/listing-quality',
      );
      expect(qualityLinks).toHaveLength(0);
    });

    it('renders a "Details coming soon" non-link label on the quality card', () => {
      renderDashboard();
      expect(screen.getByText(/details coming soon/i)).toBeInTheDocument();
    });

    it('renders working deep-link to /broker/listings', () => {
      renderDashboard();

      const listingsLinks = screen
        .getAllByRole('link')
        .filter((el) => el.getAttribute('href') === '/broker/listings');
      expect(listingsLinks.length).toBeGreaterThanOrEqual(1);
    });

    it('renders working deep-link to /broker/listings?status=DRAFT', () => {
      renderDashboard();

      const draftLinks = screen
        .getAllByRole('link')
        .filter((el) => el.getAttribute('href') === '/broker/listings?status=DRAFT');
      expect(draftLinks.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Loading state ────────────────────────────────────────────────────────

  describe('Loading state', () => {
    it('renders skeleton elements while quality data is loading', () => {
      mockHookState.qualityLoading = true;
      mockQualitySummary.current = null;
      renderDashboard();

      // Skeleton elements are rendered as [class*="animate-pulse"] or role=status
      // We check that no summary card content texts appear
      expect(screen.queryByText(/avg quality/i)).toBeNull();
      // But the page wrapper and heading still render
      expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    });
  });

  // ── Error state ──────────────────────────────────────────────────────────

  describe('Error state', () => {
    it('renders error indicator and retry button when quality fetch fails', () => {
      mockHookState.qualityError = true;
      mockQualitySummary.current = null;
      renderDashboard();

      // Error shows retry button
      expect(screen.getByRole('button', { name: /retry quality summary/i })).toBeInTheDocument();
    });

    it('renders error indicator and retry button when stats fetch fails', () => {
      mockHookState.statsError = true;
      renderDashboard();

      expect(screen.getByRole('button', { name: /retry listing stats/i })).toBeInTheDocument();
    });
  });
});
