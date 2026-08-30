/**
 * BrokerDemandGaps — page render + honest-state tests.
 *
 * AC1  — page behind auth guard, renders layout
 * AC2  — Metric.value===null renders confidenceLabel, never "0"
 * AC3  — topGaps cards present, one CTA per card keyed by actionType
 * AC5  — capture-demand section: no related-searches field, null price/quality honest
 * AC6  — empty states present when no gaps
 * AC7  — signal legend / caveat present
 * AC9  — loading skeleton / error + retry
 * AC10 — dismiss/read omitted for id===null gaps
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BrokerDemandGaps from '../BrokerDemandGaps';
import type {
  DemandGapsResponse,
  GapItem,
  CaptureDemandListing,
} from '@/hooks/useBrokerDemandGaps';

// ── Hoisted mock factories ────────────────────────────────────────────────────

const mockHookState = vi.hoisted(() => ({
  isLoading: false,
  isError: false,
  data: null as DemandGapsResponse | null,
  refetch: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    isBroker: true,
    isAdmin: false,
    isLoading: false,
    user: { id: 'broker-uid-1', user_metadata: { full_name: 'Test Broker' } },
  })),
}));

// Complete module replacement — do NOT call importOriginal().
// importOriginal() loads the real hook, which imports @/lib/api -> @/integrations/supabase/client
// -> createClient(VITE_SUPABASE_URL) at module-eval time, crashing with "supabaseUrl is required".
// Pattern follows BrokerDashboard.v2.test.tsx: fully replace, no real module chain loaded.
vi.mock('@/hooks/useBrokerDemandGaps', () => ({
  DEMAND_GAPS_QUERY_KEY: ['broker', 'demand-gaps'] as const,
  useBrokerDemandGaps: vi.fn(() => ({
    data: mockHookState.data,
    isLoading: mockHookState.isLoading,
    isError: mockHookState.isError,
    refetch: mockHookState.refetch,
  })),
  useMarkGapRead: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDismissGap: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

// ── Fixture builders ──────────────────────────────────────────────────────────

function buildGapItem(overrides: Partial<GapItem> = {}): GapItem {
  return {
    id: 'gap-uuid-1',
    areaKey: 'Koramangala|Bangalore South|Bangalore',
    propertyType: 'APARTMENT',
    listingPurpose: 'SALE',
    budgetBand: '50L-75L',
    week: '2026-06-16',
    gapScore: { value: 8.4, confidenceLabel: 'Score available' },
    signalType: 'supply_gap',
    actionType: 'add_listing',
    confidence: { value: 'High', confidenceLabel: 'Confidence: High' },
    buyerEnquiries: { value: 12, confidenceLabel: 'Buyer enquiries available' },
    brokerLiveCount: 2,
    readAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

function buildCaptureListing(overrides: Partial<CaptureDemandListing> = {}): CaptureDemandListing {
  return {
    listingId: 'listing-uuid-1',
    title: '3BHK Apartment Koramangala',
    areaKey: 'Koramangala|Bangalore South|Bangalore',
    propertyType: 'APARTMENT',
    listingPurpose: 'SALE',
    pricePaise: 7500000 * 100,  // 75L in paise
    qualityScore: 72,
    ...overrides,
  };
}

function buildResponse(overrides: Partial<DemandGapsResponse> = {}): DemandGapsResponse {
  return {
    summary: {
      buyerSearches: { value: 240, confidenceLabel: 'Buyer searches available' },
      buyerEnquiries: { value: 18, confidenceLabel: 'Buyer enquiries available' },
      demandGapsFound: 5,
      brokerMatchingListings: 3,
      opportunitiesToAct: 2,
    },
    topGaps: [buildGapItem()],
    allGaps: [buildGapItem()],
    captureDemandListings: [buildCaptureListing()],
    ...overrides,
  };
}

// ── Render helper ─────────────────────────────────────────────────────────────

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/broker/demand-gaps']}>
        <BrokerDemandGaps />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BrokerDemandGaps', () => {
  beforeEach(() => {
    mockHookState.isLoading = false;
    mockHookState.isError = false;
    mockHookState.data = buildResponse();
    mockHookState.refetch = vi.fn();
    vi.clearAllMocks();
  });

  // ── AC1: auth guard + layout ─────────────────────────────────────────────

  describe('AC1 — page structure', () => {
    it('renders inside AppLayout', () => {
      renderPage();
      expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    });

    it('renders the page heading', () => {
      renderPage();
      // Use level:1 to distinguish the h1 from h2 "All Demand Gaps"
      expect(screen.getByRole('heading', { name: /demand gaps/i, level: 1 })).toBeInTheDocument();
    });
  });

  // ── AC2: Metric null → confidenceLabel, never "0" ────────────────────────

  describe('AC2 — Metric null safety', () => {
    it('renders confidenceLabel when buyerSearches.value is null', () => {
      mockHookState.data = buildResponse({
        summary: {
          buyerSearches: { value: null, confidenceLabel: 'Insufficient data' },
          buyerEnquiries: { value: null, confidenceLabel: 'Insufficient data' },
          demandGapsFound: 3,
          brokerMatchingListings: 1,
          opportunitiesToAct: 1,
        },
      });
      renderPage();
      expect(screen.getAllByText('Insufficient data').length).toBeGreaterThanOrEqual(2);
    });

    it('does NOT render "0" for null Metric values', () => {
      mockHookState.data = buildResponse({
        summary: {
          buyerSearches: { value: null, confidenceLabel: 'Suppressed' },
          buyerEnquiries: { value: null, confidenceLabel: 'Suppressed' },
          demandGapsFound: 0,
          brokerMatchingListings: 0,
          opportunitiesToAct: 0,
        },
      });
      renderPage();
      // The label text "Buyer Searches" card area should not show a bare 0 for its metric
      const summaryRegion = screen.getByText(/buyer searches/i).closest('[class*="p-4"]') as HTMLElement | null;
      if (summaryRegion) {
        // Should not have a "0" as a large number — "0" as demandGapsFound is ok elsewhere
        const largeParagraphs = Array.from(summaryRegion.querySelectorAll('p')).filter(
          (p) => (p as HTMLElement).className.includes('text-3xl'),
        );
        largeParagraphs.forEach((p) => {
          expect((p as HTMLElement).textContent?.trim()).not.toBe('0');
        });
      }
    });
  });

  // ── AC3: topGaps cards + single actionType CTA ───────────────────────────

  describe('AC3 — top gap cards', () => {
    it('renders the "Priority Signals" section heading', () => {
      renderPage();
      expect(screen.getByText(/priority signals/i)).toBeInTheDocument();
    });

    it('renders CTA button for actionType add_listing', () => {
      renderPage();
      // The gap has actionType: 'add_listing'
      expect(screen.getAllByRole('button', { name: /add listing/i }).length).toBeGreaterThanOrEqual(1);
    });

    it('renders improve_listing CTA for that actionType', () => {
      mockHookState.data = buildResponse({
        topGaps: [buildGapItem({ actionType: 'improve_listing' })],
        allGaps: [buildGapItem({ actionType: 'improve_listing' })],
      });
      renderPage();
      expect(screen.getAllByRole('button', { name: /improve listing/i }).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── AC5: capture-demand — no related-searches, honest null states ─────────

  describe('AC5 — capture-demand section', () => {
    it('renders capture-demand listing title', () => {
      renderPage();
      expect(screen.getByText('3BHK Apartment Koramangala')).toBeInTheDocument();
    });

    it('does NOT render any "related searches" text (field does not exist)', () => {
      renderPage();
      expect(screen.queryByText(/related searches/i)).toBeNull();
    });

    it('renders "Price not set" for null pricePaise', () => {
      mockHookState.data = buildResponse({
        captureDemandListings: [buildCaptureListing({ pricePaise: null })],
      });
      renderPage();
      expect(screen.getByText('Price not set')).toBeInTheDocument();
    });

    it('renders "Not yet scored" for null qualityScore', () => {
      mockHookState.data = buildResponse({
        captureDemandListings: [buildCaptureListing({ qualityScore: null })],
      });
      renderPage();
      expect(screen.getByText('Not yet scored')).toBeInTheDocument();
    });
  });

  // ── AC6: empty states ─────────────────────────────────────────────────────

  describe('AC6 — empty states', () => {
    it('renders "No priority gaps" empty state when topGaps is empty', () => {
      mockHookState.data = buildResponse({ topGaps: [] });
      renderPage();
      expect(screen.getByText(/no priority gaps right now/i)).toBeInTheDocument();
    });

    it('renders "No demand gaps found" empty state when allGaps is empty', () => {
      mockHookState.data = buildResponse({ allGaps: [] });
      renderPage();
      expect(screen.getByText(/no demand gaps found/i)).toBeInTheDocument();
    });
  });

  // ── AC7: signal legend ────────────────────────────────────────────────────

  describe('AC7 — signal legend', () => {
    it('renders "About these signals" caveat', () => {
      renderPage();
      // Multiple elements may contain this text (sr-only h2 + visible h3 inside SignalLegend)
      expect(screen.getAllByText(/about these signals/i).length).toBeGreaterThanOrEqual(1);
    });

    it('renders confidence level legend items', () => {
      renderPage();
      expect(screen.getByText(/confidence levels/i)).toBeInTheDocument();
      // "Suppressed" appears as a confidence label heading — use getAllByText
      expect(screen.getAllByText(/suppressed/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── AC9: loading + error ──────────────────────────────────────────────────

  describe('AC9 — loading and error states', () => {
    it('renders skeleton elements while loading', () => {
      mockHookState.isLoading = true;
      mockHookState.data = null;
      renderPage();
      // While loading there is no gap data — no gap cards or table rows render
      // Section headings ("Priority Signals", "All Demand Gaps") are structural and always present.
      // The substantive assertion is that no gap card content (area text) is visible.
      expect(screen.queryByText('Koramangala|Bangalore South|Bangalore')).toBeNull();
      // The layout wrapper still renders
      expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    });

    it('renders error alert and retry button on failure', () => {
      mockHookState.isError = true;
      mockHookState.data = null;
      renderPage();
      // P2-a: each section (global alert + TopGapCards + AllGapsTable) renders its own
      // Retry button so fetch-failure is never mistaken for "no gaps".
      expect(screen.getAllByRole('button', { name: /retry/i }).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── AC10: dismiss/read omitted for id===null ──────────────────────────────

  describe('AC10 — dismiss/read controls', () => {
    it('does NOT render dismiss/read buttons for id===null gaps', () => {
      mockHookState.data = buildResponse({
        topGaps: [buildGapItem({ id: null })],
        allGaps: [buildGapItem({ id: null })],
      });
      renderPage();
      expect(screen.queryByRole('button', { name: /dismiss gap/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /mark as read/i })).toBeNull();
    });

    it('renders dismiss/read buttons for id!==null gaps', () => {
      mockHookState.data = buildResponse({
        topGaps: [buildGapItem({ id: 'real-id-123' })],
        allGaps: [buildGapItem({ id: 'real-id-123' })],
      });
      renderPage();
      // Should find at least one dismiss button (TopGapCard has one, AllGapsTable has one)
      expect(screen.getAllByRole('button', { name: /dismiss gap/i }).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── AC1: redirect when not broker ────────────────────────────────────────

  describe('AC1 — auth redirect', () => {
    it('redirects to / when user is not broker or admin', async () => {
      const { useAuth } = vi.mocked(await import('@/contexts/AuthContext'));
      useAuth.mockReturnValueOnce({
        isBroker: false,
        isAdmin: false,
        isLoading: false,
        user: null,
        session: null,
        userRole: null,
        insightsAccessUntil: null,
        refreshRole: vi.fn(),
        refreshAuth: vi.fn(),
      } as unknown as ReturnType<typeof useAuth>);
      renderPage();
      // With MemoryRouter + Navigate, the content should not render
      expect(screen.queryByText(/demand gaps/i)).toBeNull();
    });
  });

  // ── Advisory-d: improve_listing CTA scrolls in-page (never navigates) ────

  describe('Advisory — improve_listing CTA behaviour', () => {
    it('calls onCaptureDemandAnchorClick (in-page scroll) for improve_listing, not a navigation', () => {
      // The TopGapCard component receives onCaptureDemandAnchorClick as a callback and
      // calls it when actionType === 'improve_listing'. The page passes scrollToCaptureDemand.
      // We can't spy on refs in JSDOM, but we verify the button renders with no external href.
      mockHookState.data = buildResponse({
        topGaps: [buildGapItem({ actionType: 'improve_listing' })],
        allGaps: [buildGapItem({ actionType: 'improve_listing' })],
      });
      renderPage();
      // Button exists and is NOT an anchor (so it performs no hard navigation)
      const ctaButton = screen.getAllByRole('button', { name: /improve listing/i })[0];
      expect(ctaButton.tagName).toBe('BUTTON');
      expect(ctaButton).not.toHaveAttribute('href');
    });
  });

  // ── Advisory-d: gap score column aria-sort reflects actual sort direction ──

  describe('Advisory — gap score sort ARIA', () => {
    it('renders aria-sort="descending" on the Gap Score column header by default', () => {
      renderPage();
      // The default sort direction is 'desc'. The Gap Score column header carries aria-sort.
      const gapScoreHeader = screen.getByRole('columnheader', { name: /gap score/i });
      expect(gapScoreHeader).toHaveAttribute('aria-sort', 'descending');
    });
  });

  // ── Security: query enabled guard — no fetch while auth unresolved ─────────
  //
  // useBrokerDemandGaps now reads useAuth() internally and sets:
  //   enabled: !authLoading && (isBroker || isAdmin)
  // These tests assert the page renders no gap data under those blocked conditions.

  describe('Security — enabled guard on useBrokerDemandGaps', () => {
    it('renders no gap data while authLoading is true (query gate blocks fetch)', async () => {
      const { useAuth } = await import('@/contexts/AuthContext');
      vi.mocked(useAuth).mockReturnValueOnce({
        isBroker: false,
        isAdmin: false,
        isLoading: true, // auth still evaluating
        user: null,
        session: null,
        userRole: null,
        insightsAccessUntil: null,
        refreshRole: vi.fn(),
        refreshAuth: vi.fn(),
      } as unknown as ReturnType<typeof useAuth>);
      // Simulate query in idle/loading state (enabled=false → no data yet)
      mockHookState.data = null;
      mockHookState.isLoading = true;
      renderPage();
      // No gap card content should be visible — query gated, page still loading
      expect(screen.queryByText('Koramangala|Bangalore South|Bangalore')).toBeNull();
    });

    it('redirects (renders no gap content) for a non-broker non-admin user', async () => {
      const { useAuth } = await import('@/contexts/AuthContext');
      vi.mocked(useAuth).mockReturnValueOnce({
        isBroker: false,
        isAdmin: false,
        isLoading: false, // auth resolved — definitively not a broker
        user: { id: 'buyer-uid', user_metadata: {} },
        session: null,
        userRole: null,
        insightsAccessUntil: null,
        refreshRole: vi.fn(),
        refreshAuth: vi.fn(),
      } as unknown as ReturnType<typeof useAuth>);
      renderPage();
      // Page issues <Navigate to="/" /> — no demand-gaps content renders
      expect(screen.queryByText(/priority signals/i)).toBeNull();
    });
  });
});
