/**
 * PoiManager unit tests — issue #2042.
 *
 * GET /pois/suggestions wraps its response as { pois, providerIssue }. The "Nearby Places"
 * tab must render three DISTINCT states rather than collapsing two of them into the same
 * "No nearby places found" copy:
 *   1. populated        — pois.length > 0
 *   2. genuine empty     — pois.length === 0, providerIssue === false
 *   3. provider failure   — pois.length === 0, providerIssue === true (must NOT read as a
 *                          confirmed empty result)
 * A fourth state, request failure (network/HTTP error before a response body exists), is
 * already handled by react-query's isError and must remain distinct from both empty states.
 */
import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { PoiManager } from './PoiManager';

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PoiManager — Nearby Places tab: empty vs provider-failure vs populated (#2042)', () => {
  it('renders returned POIs when the provider succeeds with results', async () => {
    mockApiGet.mockResolvedValue({
      pois: [
        {
          id: 'poi-1',
          name: 'KMC Hospital',
          category: 'HOSPITAL',
          distanceMeters: 300,
          latitude: 13.3534,
          longitude: 74.7893,
          pinned: false,
          approved: false,
        },
      ],
      providerIssue: false,
    });

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    expect(await screen.findByText('KMC Hospital')).toBeInTheDocument();
    expect(screen.queryByText(/No nearby places found/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn.?t fetch nearby places/i)).not.toBeInTheDocument();
  });

  it('renders the genuine-empty message (not a provider-failure warning) when providerIssue is false', async () => {
    mockApiGet.mockResolvedValue({ pois: [], providerIssue: false });

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    expect(await screen.findByText(/No nearby places found for this listing/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn.?t fetch nearby places/i)).not.toBeInTheDocument();
  });

  it('renders a distinct provider-failure warning (not "No nearby places found") when providerIssue is true', async () => {
    mockApiGet.mockResolvedValue({ pois: [], providerIssue: true });

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    expect(await screen.findByText(/couldn.?t fetch nearby places/i)).toBeInTheDocument();
    expect(screen.queryByText(/No nearby places found for this listing/i)).not.toBeInTheDocument();
  });

  it('renders the request-failure alert (distinct from both empty states) when the HTTP call itself fails', async () => {
    mockApiGet.mockRejectedValue(new Error('network error'));

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    expect(await screen.findByText(/Failed to load POI suggestions/i)).toBeInTheDocument();
    expect(screen.queryByText(/No nearby places found for this listing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn.?t fetch nearby places/i)).not.toBeInTheDocument();
  });
});
