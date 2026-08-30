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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

interface AreaTopGap {
  propertyType: string;
  listingPurpose: string;
  budgetBand: string;
  signalType: string;
  gapScore: number;
  confidence: string;
}

interface AreaRow {
  areaKey: string;
  areaLabel: string | null;
  district: string | null;
  live90dCount: number;
  scoredListingCount: number;
  avgQualityScore: number | null;
  confidence: Confidence;
  demandEventCount: number | null;
  topGaps: AreaTopGap[] | null;
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

// ─── New demand column tests (M30 backend now live) ───────────────────────────

function makeGap(overrides: Partial<AreaTopGap> = {}): AreaTopGap {
  return {
    propertyType: 'apartment',
    listingPurpose: 'rent',
    budgetBand: '10k-20k',
    signalType: 'search',
    gapScore: 8.5,
    confidence: 'full',
    ...overrides,
  };
}

describe('Intelligence page — demand events cell', () => {
  it('renders the number when demandEventCount is non-null', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ demandEventCount: 42 }),
    ]);
    renderIntelligence();
    await screen.findByText('Full');
    const cell = screen.getByTestId('cell-demand-events');
    expect(cell).toHaveTextContent('42');
    expect(cell).not.toHaveTextContent('—');
  });

  it('renders "—" (not "0") when demandEventCount is null', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ demandEventCount: null }),
    ]);
    renderIntelligence();
    await screen.findByText('Full');
    const cell = screen.getByTestId('cell-demand-events');
    expect(cell).toHaveTextContent('—');
    expect(cell).not.toHaveTextContent('0');
  });
});

describe('Intelligence page — top gaps cell', () => {
  it('renders "—" when topGaps is null', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ topGaps: null }),
    ]);
    renderIntelligence();
    await screen.findByText('Full');
    const cell = screen.getByTestId('cell-top-gaps');
    expect(cell).toHaveTextContent('—');
  });

  it('renders "—" when topGaps is an empty array', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ topGaps: [] }),
    ]);
    renderIntelligence();
    await screen.findByText('Full');
    const cell = screen.getByTestId('cell-top-gaps');
    expect(cell).toHaveTextContent('—');
  });

  it('renders gap fields when topGaps has entries', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({
        topGaps: [
          makeGap({ budgetBand: '10k-20k', propertyType: 'apartment', signalType: 'search', gapScore: 8.5 }),
        ],
      }),
    ]);
    renderIntelligence();
    await screen.findByText('Full');
    const cell = screen.getByTestId('cell-top-gaps');
    expect(cell).toHaveTextContent('10k-20k');
    expect(cell).toHaveTextContent('apartment');
    expect(cell).toHaveTextContent('search');
    expect(cell).toHaveTextContent('8.5');
    expect(cell).not.toHaveTextContent('—');
  });

  it('renders up to 3 gaps and does not crash with more than 3 entries', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({
        topGaps: [
          makeGap({ budgetBand: 'band-A', gapScore: 9.0 }),
          makeGap({ budgetBand: 'band-B', gapScore: 8.0 }),
          makeGap({ budgetBand: 'band-C', gapScore: 7.0 }),
          makeGap({ budgetBand: 'band-D', gapScore: 6.0 }),
        ],
      }),
    ]);
    renderIntelligence();
    await screen.findByText('Full');
    const cell = screen.getByTestId('cell-top-gaps');
    // band-A, band-B, band-C rendered; band-D must not appear
    expect(cell).toHaveTextContent('band-A');
    expect(cell).toHaveTextContent('band-B');
    expect(cell).toHaveTextContent('band-C');
    expect(cell).not.toHaveTextContent('band-D');
  });
});

describe('Intelligence page — insufficient data (suppressed row)', () => {
  it('shows "—" in BOTH demand cells when demandEventCount is null and topGaps is null', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ demandEventCount: null, topGaps: null, confidence: 'insufficient' }),
    ]);
    renderIntelligence();
    await screen.findByText('Insufficient');
    const eventsCell = screen.getByTestId('cell-demand-events');
    const gapsCell = screen.getByTestId('cell-top-gaps');
    expect(eventsCell).toHaveTextContent('—');
    expect(eventsCell).not.toHaveTextContent('0');
    expect(gapsCell).toHaveTextContent('—');
  });
});

describe('Intelligence page — sort by demandEventCount', () => {
  it('sorts ascending with nulls last', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ areaKey: 'area-A', areaLabel: 'A', demandEventCount: null }),
      makeRow({ areaKey: 'area-B', areaLabel: 'B', demandEventCount: 10 }),
      makeRow({ areaKey: 'area-C', areaLabel: 'C', demandEventCount: 5 }),
    ]);
    renderIntelligence();
    await screen.findByText('A');

    const btn = screen.getByRole('button', { name: /sort by demand events/i });
    // First click → desc (default when changing key)
    fireEvent.click(btn);
    // Second click → asc
    fireEvent.click(btn);

    await waitFor(() => {
      const cells = screen.getAllByTestId('cell-demand-events');
      // Asc: 5, 10, null(last)
      expect(cells[0]).toHaveTextContent('5');
      expect(cells[1]).toHaveTextContent('10');
      expect(cells[2]).toHaveTextContent('—');
    });
  });

  it('sorts descending with nulls last', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ areaKey: 'area-A', areaLabel: 'A', demandEventCount: null }),
      makeRow({ areaKey: 'area-B', areaLabel: 'B', demandEventCount: 10 }),
      makeRow({ areaKey: 'area-C', areaLabel: 'C', demandEventCount: 5 }),
    ]);
    renderIntelligence();
    await screen.findByText('A');

    const btn = screen.getByRole('button', { name: /sort by demand events/i });
    // First click → desc
    fireEvent.click(btn);

    await waitFor(() => {
      const cells = screen.getAllByTestId('cell-demand-events');
      // Desc: 10, 5, null(last)
      expect(cells[0]).toHaveTextContent('10');
      expect(cells[1]).toHaveTextContent('5');
      expect(cells[2]).toHaveTextContent('—');
    });
  });
});

describe('Intelligence page — sort by topGapScore', () => {
  it('sorts ascending by max gapScore with nulls last', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ areaKey: 'area-A', areaLabel: 'AreaA', topGaps: null }),
      makeRow({ areaKey: 'area-B', areaLabel: 'AreaB', topGaps: [makeGap({ gapScore: 9.0 }), makeGap({ gapScore: 5.0 })] }),
      makeRow({ areaKey: 'area-C', areaLabel: 'AreaC', topGaps: [makeGap({ gapScore: 3.0 })] }),
    ]);
    renderIntelligence();
    await screen.findByText('AreaA');

    const btn = screen.getByRole('button', { name: /sort by top gap score/i });
    // First click → desc; second click → asc
    fireEvent.click(btn);
    fireEvent.click(btn);

    await waitFor(() => {
      // In asc order: area-C (max 3.0), area-B (max 9.0), area-A (null, last)
      const rows = screen.getAllByTestId('cell-top-gaps');
      // area-C has gapScore 3.0
      expect(rows[0]).toHaveTextContent('3.0');
      // area-B has gapScore 9.0
      expect(rows[1]).toHaveTextContent('9.0');
      // area-A is null → '—'
      expect(rows[2]).toHaveTextContent('—');
    });
  });

  it('sorts descending by max gapScore with nulls last', async () => {
    mockApiGet.mockResolvedValueOnce([
      makeRow({ areaKey: 'area-A', areaLabel: 'AreaA', topGaps: null }),
      makeRow({ areaKey: 'area-B', areaLabel: 'AreaB', topGaps: [makeGap({ gapScore: 9.0 })] }),
      makeRow({ areaKey: 'area-C', areaLabel: 'AreaC', topGaps: [makeGap({ gapScore: 3.0 })] }),
    ]);
    renderIntelligence();
    await screen.findByText('AreaA');

    const btn = screen.getByRole('button', { name: /sort by top gap score/i });
    // First click → desc
    fireEvent.click(btn);

    await waitFor(() => {
      // In desc order: area-B (9.0), area-C (3.0), area-A (null, last)
      const rows = screen.getAllByTestId('cell-top-gaps');
      expect(rows[0]).toHaveTextContent('9.0');
      expect(rows[1]).toHaveTextContent('3.0');
      expect(rows[2]).toHaveTextContent('—');
    });
  });
});
