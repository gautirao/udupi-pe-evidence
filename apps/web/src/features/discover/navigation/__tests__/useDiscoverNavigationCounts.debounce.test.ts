/**
 * Issue #2083 RC_C — `useDiscoverNavigationCounts` filter-change debounce.
 *
 * Homed here (rather than beside the hook in `src/hooks/__tests__/`) because
 * this issue's allowed test-file scope is `src/features/discover/**\/__tests__/**`
 * and `src/pages/__tests__/**` — this file imports the real hook under test
 * from its actual location, it is simply not co-located with it.
 *
 * Covers the REQUIRED "Add debouncing on rapid filter changes" deliverable:
 *   - a fast sequence of filter-only changes (node/city unchanged) collapses
 *     into exactly ONE request, for the FINAL filter state
 *   - a node/city change is NEVER debounced — it fires immediately, even if
 *     filters changed in the same tick
 *   - the very first render (cold mount) is never debounced
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// REAL timers throughout this file, deliberately — the sibling
// `useDiscoverNavigationCounts.test.ts` suite (and this issue's own QA
// caution about fake-timer camera/debounce tests masking real races) both
// avoid `vi.useFakeTimers()` for this hook; `waitFor`'s own internal polling
// relies on real timers and hangs/times out under a faked clock unless
// carefully coordinated. `NAVIGATION_COUNTS_FILTERS_DEBOUNCE_MS` is only
// 300ms, comfortably inside `waitFor`'s default 1000ms window.

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

import {
  useDiscoverNavigationCounts,
  NAVIGATION_COUNTS_FILTERS_DEBOUNCE_MS,
  type DiscoverNavigationCountsFilters,
  type UseDiscoverNavigationCountsParams,
} from '@/hooks/useDiscoverNavigationCounts';
import type { NavigationCountsResponse } from '@/features/discover/navigation/types';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

function makeResponse(overrides: Partial<NavigationCountsResponse> = {}): NavigationCountsResponse {
  return {
    nodeKey: 'd:e',
    count: 100,
    schoolCount: 7,
    areaCounts: {},
    areaSchoolCounts: {},
    children: [],
    revisionId: 8,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('#2083 RC_C — filter-only changes are debounced', () => {
  it('a rapid sequence of filter-only changes fires exactly ONE request, for the FINAL state', async () => {
    mockGet.mockResolvedValue(makeResponse());
    const client = makeClient();

    const { rerender } = renderHook(
      (filters: DiscoverNavigationCountsFilters) =>
        useDiscoverNavigationCounts({ city: 'bangalore', nodeKey: 'd:e', filters }),
      { wrapper: makeWrapper(client), initialProps: { purpose: 'sale' } },
    );

    // Cold mount already fired the first (unfiltered-purpose) request.
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    mockGet.mockClear();

    // Three rapid filter-only changes, each well inside the debounce window —
    // no `await`/timer advance between them, so react-testing-library's
    // synchronous `rerender` genuinely exercises "back-to-back" changes.
    rerender({ purpose: 'sale', propertyTypes: ['house'] });
    rerender({ purpose: 'sale', propertyTypes: ['house'], bedrooms: [2] });
    rerender({ purpose: 'rent', propertyTypes: ['house'], bedrooms: [2] });

    // No request has fired yet — every change re-armed the timer.
    expect(mockGet).not.toHaveBeenCalled();

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1), { timeout: 1000 });

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    expect(url).toContain('purpose=rent');
    expect(url).toContain('propertyTypes=house');
    expect(url).toContain('bedrooms=2');
  });

  it('a node/city change fires IMMEDIATELY, never delayed by the filter debounce', async () => {
    mockGet.mockResolvedValue(makeResponse({ nodeKey: 'd:n' }));
    const client = makeClient();

    const { rerender } = renderHook(
      (props: UseDiscoverNavigationCountsParams) => useDiscoverNavigationCounts(props),
      {
        wrapper: makeWrapper(client),
        initialProps: { city: 'bangalore', nodeKey: 'd:e', filters: { purpose: 'sale' } },
      },
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    mockGet.mockClear();

    // A navigation to a new node, WITH a simultaneous filter change — must
    // still fire immediately (zero timer wait), unlike the filter-only case.
    rerender({ city: 'bangalore', nodeKey: 'd:n', filters: { purpose: 'rent' } });

    // A LOOSE upper bound (well under the 300ms filter debounce) proves this
    // did not wait for the debounce timer — a tight/zero-wait assertion
    // would be flaky on a loaded CI box for a genuinely synchronous dispatch.
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1), { timeout: 150 });
    const [url] = mockGet.mock.calls[0] as [string, unknown];
    expect(url).toContain('/navigation/d%3An/counts');
    expect(url).toContain('purpose=rent');
  });

  it('the cold-mount request is never debounced', () => {
    mockGet.mockResolvedValue(makeResponse());
    renderHook(
      () =>
        useDiscoverNavigationCounts({
          city: 'bangalore',
          nodeKey: 'd:e',
          filters: { purpose: 'sale' },
        }),
      { wrapper: makeWrapper(makeClient()) },
    );
    // Fired synchronously on mount — no need to advance timers at all.
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
