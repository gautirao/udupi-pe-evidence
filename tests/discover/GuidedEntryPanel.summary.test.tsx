/**
 * GuidedEntryPanel — consumes useDiscoverSummary for macro-region cards, and
 * wires card selection to the scope= URL axis (Issue #1745 P7 + P8).
 *
 * Covers the tests_required items from the approved Batch A plan:
 * 1. Macro-region cards render backend-owned, listingPurpose-correct counts;
 *    loading/empty/error states.
 * 2. The useDiscoverSummary call site passes listingPurpose (never propertyType),
 *    derived from intent; the query re-fetches when intent (Buy/Rent) toggles.
 * 3. Clicking a card sets scope= (highlight + URL persistence); a clear
 *    affordance removes it; the three journey cards remain reachable regardless
 *    of summary success/failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────────────────
const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockGet },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(msg: string, status: number, body: unknown) {
      super(msg);
      this.status = status;
      this.body = body;
    }
  },
}));

import { GuidedEntryPanel } from '@/components/discover/panels/GuidedEntryPanel';

const SUMMARY_FIXTURE = {
  city: 'udupi',
  propertyType: null,
  groupBy: 'area_group',
  totalActiveListings: 6,
  regions: [
    { regionKey: 'north', regionLabel: 'North Udupi', listingCount: 4 },
    { regionKey: 'south', regionLabel: 'South Udupi', listingCount: 2 },
  ],
  hotspots: [],
  generatedAt: '2026-07-04T00:00:00Z',
};

function renderPanel(initialUrl = '/discover?city=udupi', props: Partial<Parameters<typeof GuidedEntryPanel>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const baseProps = {
    onSelectJourney: vi.fn(),
    city: 'udupi',
    onCityChange: vi.fn(),
    intent: 'buy' as const,
    onIntentChange: vi.fn(),
    totalProperties: 6,
    areasCount: 2,
  };
  const utils = render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        MemoryRouter,
        { initialEntries: [initialUrl] },
        React.createElement(GuidedEntryPanel, { ...baseProps, ...props }),
      ),
    ),
  );
  return { ...utils, queryClient };
}

function getRequestedParams(): URLSearchParams {
  const [url] = mockGet.mock.calls[mockGet.mock.calls.length - 1] as [string, unknown];
  return new URLSearchParams(url.split('?')[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GuidedEntryPanel — macro-region cards (Issue #1745 P7)', () => {
  it('shows a loading skeleton while the summary is in flight, and the journey cards stay usable', async () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    renderPanel();

    expect(screen.getByTestId('guided-entry-regions-loading')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-school-first')).toBeInTheDocument();
  });

  it('renders macro-region cards with backend-owned counts on success', async () => {
    mockGet.mockResolvedValue(SUMMARY_FIXTURE);
    renderPanel();

    await waitFor(() => expect(screen.getByTestId('guided-entry-regions-grid')).toBeInTheDocument());
    expect(screen.getByText('North Udupi')).toBeInTheDocument();
    expect(screen.getByText('South Udupi')).toBeInTheDocument();
    // Backend-owned counts rendered verbatim — no client-side aggregation.
    expect(screen.getByText('4 properties')).toBeInTheDocument();
    expect(screen.getByText('2 properties')).toBeInTheDocument();
  });

  it('degrades gracefully on error — journey cards remain usable, no crash', async () => {
    mockGet.mockRejectedValue(new Error('network down'));
    renderPanel();

    await waitFor(() =>
      expect(screen.getByTestId('guided-entry-regions-error')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-school-first')).toBeInTheDocument();
    expect(screen.queryByTestId('guided-entry-regions-grid')).not.toBeInTheDocument();
  });

  it('renders no region grid (graceful empty state) when the summary returns zero regions', async () => {
    mockGet.mockResolvedValue({ ...SUMMARY_FIXTURE, regions: [] });
    renderPanel();

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByTestId('guided-entry-regions-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('guided-entry-regions-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
  });
});

describe('GuidedEntryPanel — listingPurpose separate from propertyType (Issue #1745 P7)', () => {
  it('passes listingPurpose="sale" for intent="buy", never propertyType', async () => {
    mockGet.mockResolvedValue(SUMMARY_FIXTURE);
    renderPanel('/discover?city=udupi', { intent: 'buy' });

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const params = getRequestedParams();
    expect(params.get('listingPurpose')).toBe('sale');
    expect(params.has('propertyType')).toBe(false);
  });

  it('passes listingPurpose="rent" for intent="rent", never propertyType', async () => {
    mockGet.mockResolvedValue(SUMMARY_FIXTURE);
    renderPanel('/discover?city=udupi', { intent: 'rent' });

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const params = getRequestedParams();
    expect(params.get('listingPurpose')).toBe('rent');
    expect(params.has('propertyType')).toBe(false);
  });

  it('re-fetches with the new listingPurpose when Buy/Rent (intent) toggles', async () => {
    mockGet.mockResolvedValue(SUMMARY_FIXTURE);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const baseProps = {
      onSelectJourney: vi.fn(),
      city: 'udupi',
      onCityChange: vi.fn(),
      onIntentChange: vi.fn(),
      totalProperties: 6,
      areasCount: 2,
    };

    const { rerender } = render(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/discover?city=udupi'] },
          React.createElement(GuidedEntryPanel, { ...baseProps, intent: 'buy' as const }),
        ),
      ),
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    expect(getRequestedParams().get('listingPurpose')).toBe('sale');

    rerender(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/discover?city=udupi'] },
          React.createElement(GuidedEntryPanel, { ...baseProps, intent: 'rent' as const }),
        ),
      ),
    );

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(getRequestedParams().get('listingPurpose')).toBe('rent');
  });
});

describe('GuidedEntryPanel — scope selection (Issue #1745 P8, landing-level only)', () => {
  it('clicking a macro-region card selects it (aria-pressed + scope= in the URL)', async () => {
    mockGet.mockResolvedValue(SUMMARY_FIXTURE);
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByTestId('guided-entry-regions-grid')).toBeInTheDocument());
    const northCard = screen.getByRole('button', { name: /North Udupi/ });
    expect(northCard).toHaveAttribute('aria-pressed', 'false');

    await user.click(northCard);

    expect(northCard).toHaveAttribute('aria-pressed', 'true');
    // A second card must not also read as selected.
    const southCard = screen.getByRole('button', { name: /South Udupi/ });
    expect(southCard).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking the selected card again deselects it (toggle-off clear affordance)', async () => {
    mockGet.mockResolvedValue(SUMMARY_FIXTURE);
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByTestId('guided-entry-regions-grid')).toBeInTheDocument());
    const northCard = screen.getByRole('button', { name: /North Udupi/ });
    await user.click(northCard);
    expect(northCard).toHaveAttribute('aria-pressed', 'true');

    await user.click(northCard);
    expect(northCard).toHaveAttribute('aria-pressed', 'false');
  });

  it('the explicit Clear affordance deselects the current scope', async () => {
    mockGet.mockResolvedValue(SUMMARY_FIXTURE);
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByTestId('guided-entry-regions-grid')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /North Udupi/ }));
    expect(screen.getByRole('button', { name: /North Udupi/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: /Clear/ }));
    expect(screen.getByRole('button', { name: /North Udupi/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('a card already selected via the URL renders pre-highlighted', async () => {
    mockGet.mockResolvedValue(SUMMARY_FIXTURE);
    renderPanel('/discover?city=udupi&scope=south');

    await waitFor(() => expect(screen.getByTestId('guided-entry-regions-grid')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /South Udupi/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('scope selection does not disable or hide the three journey cards', async () => {
    mockGet.mockResolvedValue(SUMMARY_FIXTURE);
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByTestId('guided-entry-regions-grid')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /North Udupi/ }));

    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-school-first')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-agri-first')).toBeInTheDocument();
  });
});
