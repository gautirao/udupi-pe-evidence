/**
 * Intelligence.tsx unit tests — M28 admin intelligence validator page
 *
 * Coverage contract (from approved-plan.toml + issue prompt):
 *  - Confidence label rendering for each of full / limited / insufficient
 *  - "insufficient" rows are visibly flagged (amber row background)
 *  - Boundary live90dCount rows: 9→insufficient, 10→limited, 29→limited, 30→full
 *  - demandEventCount null and topGaps null render "—" (NOT "0")
 *  - avgQualityScore null renders "unavailable" (NOT "0")
 *  - Loading state renders
 *  - Error state renders with retry
 *  - Empty state renders when rows array is empty
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Intelligence from '../Intelligence';

// ─── Hoisted mocks (must precede vi.mock calls) ───────────────────────────────

const mockApiGet = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet },
  ApiError: class ApiError extends Error {
    constructor(msg: string, public status: number, public body: unknown) {
      super(msg);
    }
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'admin-1' },
    isAdmin: true,
    isDealer: false,
    isLoading: false,
    signOut: vi.fn(),
  })),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// Stub notification bell if AppLayout pulls it in transitively
vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}));

// ─── Types (mirror page types) ────────────────────────────────────────────────

type Confidence = 'full' | 'limited' | 'insufficient';

interface AreaRow {
  areaKey: string;
  areaLabel: string | null;
  district: string | null;
  live90dCount: number;
  scoredListingCount: number;
  avgQualityScore: number | null;
  confidence: Confidence;
  demandEventCount: number | null;
  topGaps: string | null;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<AreaRow> = {}): AreaRow {
  return {
    areaKey: 'IN|KA|Udupi|Manipal',
    areaLabel: 'Manipal',
    district: 'Udupi',
    live90dCount: 35,
    scoredListingCount: 30,
    avgQualityScore: 72.5,
    confidence: 'full',
    demandEventCount: null,
    topGaps: null,
    ...overrides,
  };
}

// ─── Render helper ────────────────────────────────────────────────────────────

function renderIntelligence() {
  // Fresh QueryClient per test; retry: false so errors surface immediately
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Intelligence />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Intelligence page — confidence label rendering', () => {
  it('renders "Full" badge for confidence=full', async () => {
    mockApiGet.mockResolvedValueOnce([makeRow({ confidence: 'full' })]);
    renderIntelligence();
    expect(await screen.findByText('Full')).toBeInTheDocument();
  });

  it('renders "Limited" badge for confidence=limited', async () => {
    mockApiGet.mockResolvedValueOnce([makeRow({ confidence: 'limited' })]);
    renderIntelligence();
    expect(await screen.findByText('Limited')).toBeInTheDocument();
  });

  it('renders "Insufficient" badge for confidence=insufficient', async () => {
    mockApiGet.mockResolvedValueOnce([makeRow({ confidence: 'insufficient' })]);
    renderIntelligence();
    expect(await screen.findByText('Insufficient')).toBeInTheDocument();
  });

  it('visibly flags an insufficient row with amber background class', async () => {
    mockApiGet.mockResolvedValueOnce([makeRow({ confidence: 'insufficient' })]);
    renderIntelligence();
    // Wait for data to render
    await screen.findByText('Insufficient');
    // The <tr> element should carry data-confidence="insufficient"
    const row = document.querySelector('[data-confidence="insufficient"]');
    expect(row).not.toBeNull();
    // And should have the amber flagging class
    expect(row?.className).toMatch(/amber/);
  });
});

describe('Intelligence page — confidence boundary: live90dCount 9/10/29/30', () => {
  /**
   * The backend owns the confidence classification rule and returns it as a
   * string field. The frontend renders the backend value directly.
   * These tests assert the label shown for rows whose live90dCount boundary
   * values match the confidence the backend sends — verifying the render layer
   * handles each label correctly, not that the frontend re-computes the rule.
   */

  it('live90dCount=9 → backend sends insufficient → renders "Insufficient"', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ live90dCount: 9, confidence: 'insufficient' }),
    ]);
    renderIntelligence();
    expect(await screen.findByText('Insufficient')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('live90dCount=10 → backend sends limited → renders "Limited"', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ live90dCount: 10, confidence: 'limited' }),
    ]);
    renderIntelligence();
    expect(await screen.findByText('Limited')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('live90dCount=29 → backend sends limited → renders "Limited"', async () => {
    mockApiGet.mockResolvedValueOnce([
      // scoredListingCount set to 0 to avoid colliding with live90dCount=29
      makeRow({ live90dCount: 29, scoredListingCount: 0, confidence: 'limited' }),
    ]);
    renderIntelligence();
    expect(await screen.findByText('Limited')).toBeInTheDocument();
    expect(screen.getByText('29')).toBeInTheDocument();
  });

  it('live90dCount=30 → backend sends full → renders "Full"', async () => {
    mockApiGet.mockResolvedValueOnce([
      // scoredListingCount set to 0 to avoid colliding with live90dCount=30
      makeRow({ live90dCount: 30, scoredListingCount: 0, confidence: 'full' }),
    ]);
    renderIntelligence();
    expect(await screen.findByText('Full')).toBeInTheDocument();
    // live90dCount=30 appears exactly once (LIVE column); scoredListingCount=0
    expect(screen.getAllByText('30')).toHaveLength(1);
  });
});

describe('Intelligence page — null cell invariants', () => {
  it('demandEventCount null renders "—", NOT "0"', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ demandEventCount: null }),
    ]);
    renderIntelligence();
    await screen.findByText('Full'); // wait for render
    // "—" must appear (at least for demand events + top gaps columns)
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2); // demand events + top gaps
    // Must NOT contain "0" in any demand-events context
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('topGaps null renders "—", NOT "0"', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ topGaps: null }),
    ]);
    renderIntelligence();
    await screen.findByText('Full');
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('avgQualityScore null renders "unavailable", NOT "0"', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ avgQualityScore: null, confidence: 'limited' }),
    ]);
    renderIntelligence();
    await screen.findByText('Limited');
    expect(screen.getByText('unavailable')).toBeInTheDocument();
    // Must NOT render "0" in place of the quality score
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
  });

  it('avgQualityScore non-null renders the formatted number', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ avgQualityScore: 72.5 }),
    ]);
    renderIntelligence();
    await screen.findByText('Full');
    expect(screen.getByText('72.5')).toBeInTheDocument();
    expect(screen.queryByText('unavailable')).not.toBeInTheDocument();
  });
});

describe('Intelligence page — loading state', () => {
  it('shows a loading spinner while fetching', () => {
    // Never resolves — keeps query in loading state
    mockApiGet.mockReturnValueOnce(new Promise(() => {}));
    renderIntelligence();
    // Loader2 has aria-label set
    expect(
      screen.getByLabelText('Loading intelligence data'),
    ).toBeInTheDocument();
  });
});

describe('Intelligence page — error state', () => {
  it('shows error message and retry button on fetch failure', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Network error'));
    renderIntelligence();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Failed to load intelligence data/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('Intelligence page — empty state', () => {
  it('shows empty state message when API returns no rows', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    renderIntelligence();
    expect(
      await screen.findByText(/No area intelligence data available yet/i),
    ).toBeInTheDocument();
  });
});

describe('Intelligence page — multi-row rendering', () => {
  it('renders one table row per returned area', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ areaKey: 'IN|KA|Udupi|Manipal', areaLabel: 'Manipal', confidence: 'full' }),
      makeRow({ areaKey: 'IN|KA|Udupi|Udupi', areaLabel: 'Udupi Town', confidence: 'limited' }),
      makeRow({ areaKey: 'IN|KA|Udupi|Karkala', areaLabel: 'Karkala', live90dCount: 5, confidence: 'insufficient' }),
    ]);
    renderIntelligence();
    await screen.findByText('Manipal');
    expect(screen.getByText('Udupi Town')).toBeInTheDocument();
    expect(screen.getByText('Karkala')).toBeInTheDocument();
    // All three confidence labels present (use getAllByText — footer also contains "Insufficient")
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByText('Limited')).toBeInTheDocument();
    expect(screen.getAllByText('Insufficient').length).toBeGreaterThanOrEqual(1);
  });
});
