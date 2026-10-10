/**
 * ListingQuality page — frontend tests (Issue #1538)
 *
 * Coverage:
 * (a) Loading / skeleton state
 * (b) Summary cards render with real data
 * (c) Filter chips reflect server filterCounts
 * (d) Filter chips change the visible worklist
 * (e) Sort by score
 * (f) Selecting a listing opens fix-plan panel
 * (g) Empty state — no listings
 * (h) NOT_SCORED listing row renders "Not yet scored", never a fake 0
 * (i) Backfill-incomplete banner
 * (j) NO-FAKE-ZERO: averageQuality===null renders "—", not "0"
 * (k) NO-FAKE-ZERO: engagement UNAVAILABLE renders honest message, not 0s
 * (l) Error state renders retry button
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockQualityHook = vi.hoisted(() => ({
  current: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
}));

vi.mock('@/hooks/useBrokerListingQuality', () => ({
  useBrokerListingQuality: vi.fn(() => mockQualityHook.current),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    isBroker: true,
    isAdmin: false,
    isLoading: false,
  })),
}));

// AppLayout renders children directly in tests
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

import type { ListingQualityResponse, QualityListing } from '@/types/listingQuality';

function makeListing(overrides: Partial<QualityListing> = {}): QualityListing {
  return {
    listingId: 'listing-abc-123',
    title: 'Test Plot, Udupi',
    status: 'LIVE',
    scoreStatus: 'SCORED',
    qualityScore: 72,
    band: 'NEEDS_IMPROVEMENT',
    computedAt: '2026-06-20T10:00:00Z',
    findings: [
      { component: 'Photos', score: 10, applied: true, finding: 'Good photos' },
    ],
    fixPlan: [
      {
        component: 'Description',
        impact: 'HIGH',
        action: 'Add a detailed property description',
        editDeepLink: '/broker/listings/listing-abc-123/edit',
      },
    ],
    engagement: {
      status: 'UNAVAILABLE',
      views: null,
      enquiries: null,
      enquiryRate: null,
    },
    ...overrides,
  };
}

function makePriorityFixListing(overrides: Partial<QualityListing> = {}): QualityListing {
  return makeListing({
    listingId: 'listing-prio-456',
    title: 'Priority Plot, Manipal',
    band: 'PRIORITY_FIX',
    qualityScore: 35,
    fixPlan: [
      {
        component: 'Price',
        impact: 'HIGH',
        action: 'Add a realistic price',
        editDeepLink: '/broker/listings/listing-prio-456/edit',
      },
    ],
    ...overrides,
  });
}

function makeBuyerReadyListing(overrides: Partial<QualityListing> = {}): QualityListing {
  return makeListing({
    listingId: 'listing-ready-789',
    title: 'Ready Plot, Karkala',
    band: 'BUYER_READY',
    qualityScore: 95,
    fixPlan: [],
    ...overrides,
  });
}

function makeUnscoredListing(overrides: Partial<QualityListing> = {}): QualityListing {
  return makeListing({
    listingId: 'listing-unscored-999',
    title: 'New Draft',
    status: 'DRAFT',
    scoreStatus: 'NOT_SCORED',
    qualityScore: null,
    band: 'UNSCORED',
    computedAt: null,
    findings: [],
    fixPlan: [],
    ...overrides,
  });
}

function makeFullResponse(overrides: Partial<ListingQualityResponse> = {}): ListingQualityResponse {
  const listings = [
    makePriorityFixListing(),
    makeListing(),
    makeBuyerReadyListing(),
    makeUnscoredListing(),
  ];
  return {
    generatedAt: '2026-06-21T08:00:00Z',
    backfill: { status: 'COMPLETE', scoredCount: 3, totalCount: 3 },
    aggregates: {
      averageQuality: 67,
      buyerReadyCount: 1,
      needImprovementCount: 1,
      priorityFixesCount: 1,
      filterCounts: {
        all: 4,
        buyerReady: 1,
        needImprovement: 1,
        priorityFix: 1,
        notScored: 1,
      },
    },
    listings,
    ...overrides,
  };
}

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/broker/listing-quality']}>
        <ListingQualityPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

import ListingQualityPage from '../ListingQuality';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ListingQuality page', () => {
  beforeEach(() => {
    // Reset hook state to default (loaded, no error)
    mockQualityHook.current = {
      data: makeFullResponse(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  });

  // (a) Loading / skeleton
  it('renders skeleton while loading', () => {
    mockQualityHook.current = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    renderPage();
    // aria-busy div is present while loading
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    // Summary card text is absent — skeletons render instead
    expect(screen.queryByText('Avg Quality')).toBeNull();
  });

  // (b) Summary cards
  it('renders summary cards with correct data', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Avg Quality')).toBeDefined();
    });
    // averageQuality = 67 → shows "67" in the aria-label
    expect(screen.getByLabelText(/average quality score: 67/i)).toBeDefined();
    // summary card label exists (multiple "Buyer Ready" may appear — chip + badge)
    expect(screen.getAllByText('Buyer Ready').length).toBeGreaterThan(0);
  });

  // (c) Filter chips show server counts
  it('renders filter chip counts from server aggregates', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('group', { name: /filter listings/i }));
    const group = screen.getByRole('group', { name: /filter listings/i });
    // "All" chip should have count "4"
    const allChip = within(group).getAllByRole('button').find(c => /^All/.test(c.textContent ?? ''));
    expect(allChip?.textContent).toContain('4');
    // "Priority Fix" chip should show "1"
    const priorityChip = within(group).getAllByRole('button').find(c => c.textContent?.includes('Priority Fix'));
    expect(priorityChip?.textContent).toContain('1');
  });

  // (d) Filter chips filter the worklist
  it('filters worklist by chip selection', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByRole('group', { name: /filter listings/i }));

    const group = screen.getByRole('group', { name: /filter listings/i });
    const buyerReadyChip = within(group).getByRole('button', { name: /buyer ready/i });
    await user.click(buyerReadyChip);

    // Only buyer-ready listing should be visible
    await waitFor(() => {
      const list = screen.getByRole('list', { name: /listings worklist/i });
      expect(within(list).getByText('Ready Plot, Karkala')).toBeDefined();
      expect(within(list).queryByText('Test Plot, Udupi')).toBeNull();
    });
  });

  // (e) Sort by score
  it('sorts worklist by score descending', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByRole('list', { name: /listings worklist/i }));

    await user.click(screen.getByRole('button', { name: /^score$/i }));

    const list = screen.getByRole('list', { name: /listings worklist/i });
    const items = within(list).getAllByRole('button');
    // Score 95 (buyer ready) should appear before score 72 (needs improvement)
    const texts = items.map(i => i.textContent ?? '');
    const idx95 = texts.findIndex(t => t.includes('Ready Plot'));
    const idx72 = texts.findIndex(t => t.includes('Test Plot'));
    expect(idx95).toBeLessThan(idx72);
  });

  // (f) Selecting a listing opens fix-plan panel
  it('opens fix-plan panel when a listing row is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByRole('list', { name: /listings worklist/i }));

    const list = screen.getByRole('list', { name: /listings worklist/i });
    const row = within(list).getByText('Test Plot, Udupi').closest('[role="button"]')!;
    await user.click(row);

    await waitFor(() => {
      // Fix plan panel should appear with the fix action
      expect(screen.getByText('Add a detailed property description')).toBeDefined();
    });
  });

  // (g) Empty state
  it('renders empty state when no listings', async () => {
    mockQualityHook.current = {
      data: {
        ...makeFullResponse(),
        listings: [],
        aggregates: {
          averageQuality: null,
          buyerReadyCount: 0,
          needImprovementCount: 0,
          priorityFixesCount: 0,
          filterCounts: { all: 0, buyerReady: 0, needImprovement: 0, priorityFix: 0, notScored: 0 },
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("You don't have any listings yet.")).toBeDefined();
    });
  });

  // (h) NOT_SCORED listing renders "Not yet scored", no fake 0
  it('renders not-scored listing row as "Not yet scored" without a fake 0 score', async () => {
    mockQualityHook.current = {
      data: makeFullResponse({ listings: [makeUnscoredListing()] }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    renderPage();
    await waitFor(() => screen.getByRole('list', { name: /listings worklist/i }));

    const list = screen.getByRole('list', { name: /listings worklist/i });
    expect(within(list).getByText(/not yet scored/i)).toBeDefined();
    // Must NOT show "Score: 0"
    expect(within(list).queryByText(/score: 0/i)).toBeNull();
  });

  // (i) Backfill-incomplete banner
  it('renders backfill-incomplete banner when status is INCOMPLETE', async () => {
    mockQualityHook.current = {
      data: makeFullResponse({
        backfill: { status: 'INCOMPLETE', scoredCount: 2, totalCount: 5 },
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/2 of 5 listings scored so far/i)).toBeDefined();
    });
  });

  // (j) NO-FAKE-ZERO: averageQuality null → renders "—"
  it('renders "—" for average quality when averageQuality is null, not "0"', async () => {
    mockQualityHook.current = {
      data: makeFullResponse({
        aggregates: {
          averageQuality: null,
          buyerReadyCount: 0,
          needImprovementCount: 0,
          priorityFixesCount: 0,
          filterCounts: { all: 0, buyerReady: 0, needImprovement: 0, priorityFix: 0, notScored: 0 },
        },
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/average quality score: —/i)).toBeDefined();
    });
    // Must NOT show "0" in the avg quality position
    const avgEl = screen.getByLabelText(/average quality score: —/i);
    expect(avgEl.textContent).toBe('—');
    expect(avgEl.textContent).not.toBe('0');
  });

  // (k) NO-FAKE-ZERO: engagement UNAVAILABLE → honest message, not 0s
  it('renders engagement unavailable message, never shows 0 for views/enquiries', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByRole('list', { name: /listings worklist/i }));

    // Click the "needs improvement" listing which has UNAVAILABLE engagement
    const list = screen.getByRole('list', { name: /listings worklist/i });
    const row = within(list).getByText('Test Plot, Udupi').closest('[role="button"]')!;
    await user.click(row);

    await waitFor(() => {
      expect(screen.getByTestId('engagement-unavailable')).toBeDefined();
    });

    // Must NOT contain "0" as a numeric engagement value
    const engEl = screen.getByTestId('engagement-unavailable');
    expect(engEl.textContent).not.toMatch(/views.*0|enquiries.*0|0.*views|0.*enquiries/i);
  });

  // (l) Error state renders retry button
  it('renders error state with retry button', async () => {
    const refetch = vi.fn();
    mockQualityHook.current = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 500, message: 'Internal Server Error' },
      refetch,
    };
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/failed to load listing quality data/i)).toBeDefined();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  // (n) Rendered contract of the page shell + fix-plan edit link (#2750 PR-2 D3: replaces the
  // retired e2e/broker-listing-quality.spec.ts LQ2/LQ3/LQ4/LQ5-empty assertions, which ran against live data)
  it('renders the page shell, opens the fix-plan panel, and links Edit to the listing edit route', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPage();

    // LQ2: page heading + "All" chip pressed by default
    expect(screen.getByRole('heading', { level: 1, name: 'Listing Quality' })).toBeDefined();
    const group = screen.getByRole('group', { name: /filter listings/i });
    expect(within(group).getByRole('button', { name: /^all/i, pressed: true })).toBeDefined();

    // LQ3: panel is absent before selection, present (with the listing title) after
    expect(screen.queryByRole('button', { name: /close fix plan panel/i })).toBeNull();
    const list = screen.getByRole('list', { name: /listings worklist/i });
    await user.click(within(list).getByText('Test Plot, Udupi').closest('[role="button"]')!);
    expect(await screen.findByRole('button', { name: /close fix plan panel/i })).toBeDefined();
    expect(screen.getByRole('heading', { level: 3, name: 'Test Plot, Udupi' })).toBeDefined();

    // LQ4: the rendered Edit link targets the listing's edit route
    const editLink = screen.getByRole('link', { name: 'Edit listing for: Add a detailed property description' });
    expect(editLink.getAttribute('href')).toBe('/broker/listings/listing-abc-123/edit');
    unmount();

    // LQ5 empty branch: a filter with no matches shows the honest empty message
    mockQualityHook.current = {
      data: makeFullResponse({ listings: [makeListing()] }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    renderPage();
    await user.click(screen.getByRole('button', { name: /^Not Scored/ }));
    expect(await screen.findByText('No listings match this filter.')).toBeDefined();
  });

  // (m) Fix-plan panel shows "Not yet scored" for NOT_SCORED listing
  it('fix-plan panel shows not-scored message when listing is NOT_SCORED', async () => {
    const user = userEvent.setup();
    mockQualityHook.current = {
      data: makeFullResponse({ listings: [makeUnscoredListing()] }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    renderPage();
    await waitFor(() => screen.getByRole('list', { name: /listings worklist/i }));

    const list = screen.getByRole('list', { name: /listings worklist/i });
    const row = within(list).getByText('New Draft').closest('[role="button"]')!;
    await user.click(row);

    await waitFor(() => {
      expect(screen.getByTestId('not-scored-message')).toBeDefined();
      expect(screen.getByTestId('score-unavailable')).toBeDefined();
    });
  });
});
