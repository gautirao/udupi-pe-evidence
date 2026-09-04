/**
 * Issue #2431 — `commercialSubtypes` reaches BOTH Discover endpoints identically.
 *
 * Why this lives in its own file rather than as an addition to the existing parity test in
 * discoverSearchParams.test.ts: that test is currently RED on `main` for an unrelated `areaKeys`
 * divergence (verified by stashing every change in this branch and re-running — it fails the same
 * way on an untouched tree). An assertion added to a test that never reaches a green state is not
 * evidence of anything, so the subtype parity claim is proven here, where it actually runs.
 *
 * The `commercialSubtypes` key IS also added to that test's overlapping-key list, so the claim is
 * covered there too once the pre-existing failure is fixed by whoever owns it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

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

import { buildDiscoverSearchParams } from '../discoverSearchParams';
import { useDiscoverListings } from '@/hooks/useDiscoverListings';
import { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('#2431 — commercialSubtypes serialisation', () => {
  it('emits one repeated param per selected subtype', () => {
    const params = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: { propertyTypes: ['commercial'], commercialSubtypes: ['SHOP', 'OFFICE'] },
    });
    expect(params.getAll('commercialSubtypes')).toEqual(['SHOP', 'OFFICE']);
  });

  it('emits nothing when no subtype is selected, so existing requests are unchanged', () => {
    const params = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: { propertyTypes: ['commercial'] },
    });
    expect(params.has('commercialSubtypes')).toBe(false);
  });
});

describe('#2431 — cards and markers ask the server the SAME subtype question', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the listings hook and the markers hook emit identical commercialSubtypes params', async () => {
    mockGet.mockResolvedValue({});

    const filters: PropertyFilters = {
      propertyTypes: ['commercial'],
      commercialSubtypes: ['SHOP', 'OFFICE'],
    };

    const { result: listingResult } = renderHook(
      () =>
        useDiscoverListings({ city: 'bangalore', page: 0, filters, enabled: true }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(listingResult.current.isSuccess).toBe(true));

    const { result: markerResult } = renderHook(
      () => useDiscoverFilteredMarkers('bangalore', filters, true),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(markerResult.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledTimes(2);
    const [listingCall] = mockGet.mock.calls[0] as [string, unknown];
    const [markerCall] = mockGet.mock.calls[1] as [string, unknown];

    const listingParams = new URLSearchParams(listingCall.split('?')[1]);
    const markerParams = new URLSearchParams(markerCall.split('?')[1]);

    // Non-vacuous: assert the ACTUAL value first, so a builder that silently dropped the param
    // could not make the equality below pass with two empty arrays.
    expect(listingParams.getAll('commercialSubtypes')).toEqual(['SHOP', 'OFFICE']);
    expect(markerParams.getAll('commercialSubtypes')).toEqual(['SHOP', 'OFFICE']);
    expect(listingParams.getAll('commercialSubtypes')).toEqual(
      markerParams.getAll('commercialSubtypes'),
    );
  });
});
