/**
 * #2750 PILOT CX-4 — real useBrokerListingQuality, HTTP boundary only mocked.
 *
 * ListingQuality.test.tsx mocks `@/hooks/useBrokerListingQuality` wholesale, so nothing there reaches the
 * hook's `api.get('/api/broker/listing-quality')` call or the hook -> page wiring. These its close both:
 *   (1) real hook in a QueryClientProvider: exact method (api.get) + exact path, returns the response data,
 *       and the 403 / 401 retry policy is the documented one;
 *   (2) real ListingQuality page -> real useListingQualityView -> real hook, so the page renders
 *       "Avg Quality" and the average from the mocked HTTP response.
 * Only `api.get` (the HTTP client boundary) plus AuthContext and AppLayout (unrelated providers) are mocked.
 * Response shape mirrors makeFullResponse in pages/broker/__tests__/ListingQuality.test.tsx.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ListingQualityResponse } from '@/types/listingQuality';

const httpMock = vi.hoisted(() => {
  class FakeApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  }
  return { FakeApiError, get: vi.fn() };
});
const apiGet = httpMock.get;

// The HTTP client boundary. The real module pulls in the Supabase client (needs a live key at import time), so
// it is replaced whole; ApiError mirrors lib/api.ts (message, status, body) because the hook's retry policy
// does `instanceof ApiError` against whatever this module exports.
vi.mock('@/lib/api', () => ({ ApiError: httpMock.FakeApiError, api: { get: httpMock.get } }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isBroker: true, isAdmin: false, isLoading: false }),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ApiError } from '@/lib/api';
import { useBrokerListingQuality } from '../useBrokerListingQuality';
import ListingQualityPage from '@/pages/broker/ListingQuality';

const ENDPOINT = '/api/broker/listing-quality';

function response(overrides: Partial<ListingQualityResponse> = {}): ListingQualityResponse {
  return {
    generatedAt: '2026-06-21T08:00:00Z',
    backfill: { status: 'COMPLETE', scoredCount: 1, totalCount: 1 },
    aggregates: {
      averageQuality: 67,
      buyerReadyCount: 0,
      needImprovementCount: 1,
      priorityFixesCount: 0,
      filterCounts: { all: 1, buyerReady: 0, needImprovement: 1, priorityFix: 0, notScored: 0 },
    },
    listings: [
      {
        listingId: 'listing-abc-123',
        title: 'Test Plot, Udupi',
        status: 'LIVE',
        scoreStatus: 'SCORED',
        qualityScore: 72,
        band: 'NEEDS_IMPROVEMENT',
        computedAt: '2026-06-20T10:00:00Z',
        findings: [{ component: 'Photos', score: 10, applied: true, finding: 'Good photos' }],
        fixPlan: [],
        engagement: { status: 'UNAVAILABLE', views: null, enquiries: null, enquiryRate: null },
      },
    ],
    ...overrides,
  };
}

function wrapper() {
  const qc = new QueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  apiGet.mockReset();
});

describe('useBrokerListingQuality — real hook, HTTP boundary mocked (#2750 PILOT CX-4)', () => {
  it('GETs exactly /api/broker/listing-quality once, with no extra arguments, and returns the response data', async () => {
    const payload = response();
    apiGet.mockResolvedValue(payload);

    const { result } = renderHook(() => useBrokerListingQuality(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet.mock.calls[0]).toEqual([ENDPOINT]);
    expect(result.current.data).toEqual(payload);
    expect(result.current.data?.aggregates.averageQuality).toBe(67);
  });

  it('does NOT retry a 403 (permanent role denial): one request, error surfaced with status 403', async () => {
    apiGet.mockRejectedValue(new ApiError('forbidden', 403, null));

    const { result } = renderHook(() => useBrokerListingQuality(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(result.current.error?.status).toBe(403);
  });
});

describe('ListingQuality page <- real useBrokerListingQuality (#2750 PILOT CX-4 hook->page wiring)', () => {
  it('renders "Avg Quality" and the response averageQuality (aria-label) and the listing from the mocked HTTP response', async () => {
    apiGet.mockResolvedValue(response());

    const Wrapper = wrapper();
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/broker/listing-quality']}>
          <ListingQualityPage />
        </MemoryRouter>
      </Wrapper>,
    );

    await waitFor(() => expect(screen.getByText('Avg Quality')).toBeInTheDocument());
    expect(screen.getByLabelText('Average quality score: 67')).toHaveTextContent('67');
    // title appears in both the Today's-priority card and the worklist row
    expect(screen.getAllByText('Test Plot, Udupi').length).toBeGreaterThan(0);
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet.mock.calls[0]).toEqual([ENDPOINT]);
  });

  it('a null averageQuality from the response renders the honest dash, never 0 (field flows hook -> page)', async () => {
    apiGet.mockResolvedValue(
      response({
        aggregates: {
          averageQuality: null,
          buyerReadyCount: 0,
          needImprovementCount: 0,
          priorityFixesCount: 0,
          filterCounts: { all: 0, buyerReady: 0, needImprovement: 0, priorityFix: 0, notScored: 0 },
        },
        listings: [],
      }),
    );

    const Wrapper = wrapper();
    render(
      <Wrapper>
        <MemoryRouter>
          <ListingQualityPage />
        </MemoryRouter>
      </Wrapper>,
    );

    await waitFor(() => expect(screen.getByText('Avg Quality')).toBeInTheDocument());
    expect(screen.getByLabelText('Average quality score: —')).toBeInTheDocument();
    expect(screen.queryByLabelText(/average quality score: 0/i)).toBeNull();
  });
});
