import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────
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

// ─── Import after mocks ───────────────────────────────────────
import {
  useSchoolRadiusListings,
  mapSchoolRadiusCard,
  type PublicSchoolRadiusListingCard,
  type PublicSchoolRadiusListingsPage,
} from './useSchoolRadiusListings';

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const FULL_CARD: PublicSchoolRadiusListingCard = {
  id: 'l1',
  listingNumber: 101,
  propertyType: 'house',
  title: 'Sea-view villa',
  locality: 'Manipal',
  areaKey: 'IN|KA|Udupi|Manipal',
  priceBand: '₹50L–1Cr',
  landArea: 2400,
  landAreaUnit: 'sqft',
  builtArea: 1800,
  builtAreaUnit: 'sqft',
  bedrooms: 3,
  latitude: 13.35,
  longitude: 74.79,
  heroImageUrl: 'https://cdn/img.jpg',
  listingPurpose: 'sale',
  possessionStatus: 'ready_to_move',
  daysOnMarket: 4,
  backOnMarket: false,
  createdAt: '2026-05-01T00:00:00Z',
};

const PAGE: PublicSchoolRadiusListingsPage = {
  content: [FULL_CARD],
  page: 0,
  size: 50,
  hasMore: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSchoolRadiusListings', () => {
  it('is disabled (idle, no fetch) when coordinates are null (AC4)', () => {
    const { result } = renderHook(
      () =>
        useSchoolRadiusListings({
          city: 'udupi',
          schoolLat: null,
          schoolLon: null,
          schoolRadiusKm: 3,
        }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('is disabled when enabled=false even with coordinates (auth path uses its own query)', () => {
    const { result } = renderHook(
      () =>
        useSchoolRadiusListings({
          city: 'udupi',
          schoolLat: 13.35,
          schoolLon: 74.79,
          schoolRadiusKm: 3,
          enabled: false,
        }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('calls the PUBLIC endpoint with skipAuth and no Authorization header (AC4)', async () => {
    mockGet.mockResolvedValue(PAGE);

    const { result } = renderHook(
      () =>
        useSchoolRadiusListings({
          city: 'udupi',
          schoolLat: 13.35,
          schoolLon: 74.79,
          schoolRadiusKm: 3,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, options] = mockGet.mock.calls[0] as [string, { skipAuth?: boolean }];
    expect(url).toContain('/api/discover/cities/udupi/school-radius-listings');
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('schoolLat')).toBe('13.35');
    expect(params.get('schoolLon')).toBe('74.79');
    expect(params.get('schoolRadiusKm')).toBe('3');
    expect(params.get('size')).toBe('50');
    expect(params.get('page')).toBe('0');
    // No property-filter params are ever sent (endpoint has none).
    expect(params.has('bedrooms')).toBe(false);
    expect(params.has('propertyType')).toBe(false);
    // skipAuth must be true → public, no Authorization header.
    expect(options.skipAuth).toBe(true);
  });

  it('omits schoolRadiusKm when not provided', async () => {
    mockGet.mockResolvedValue(PAGE);
    const { result } = renderHook(
      () =>
        useSchoolRadiusListings({
          city: 'udupi',
          schoolLat: 13.35,
          schoolLon: 74.79,
        }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = mockGet.mock.calls[0] as [string];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('schoolRadiusKm')).toBe(false);
  });

  it('returns empty content gracefully (AC7)', async () => {
    mockGet.mockResolvedValue({ content: [], page: 0, size: 50, hasMore: false });
    const { result } = renderHook(
      () =>
        useSchoolRadiusListings({
          city: 'udupi',
          schoolLat: 13.35,
          schoolLon: 74.79,
          schoolRadiusKm: 3,
        }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.content).toEqual([]);
    expect(result.current.data?.hasMore).toBe(false);
  });
});

describe('useSchoolRadiusListings outgoing request layer (S2-HDR)', () => {
  it('S2-HDR: anonymous school-radius request reaches fetch with NO Authorization header even when a session token exists', async () => {
    // Real api client (this file mocks '@/lib/api' wholesale): delegate the mocked api.get to it.
    // Session source is deterministic: a dummy token that WOULD be attached if skipAuth were ignored.
    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { access_token: 'dummy-token' } },
          }),
        },
      },
    }));
    const real = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    mockGet.mockImplementation((path: string, opts?: Parameters<typeof real.api.get>[1]) =>
      real.api.get(path, opts),
    );
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(PAGE), { status: 200 }));

    try {
      const { result } = renderHook(
        () =>
          useSchoolRadiusListings({
            city: 'udupi',
            schoolLat: 13.35,
            schoolLon: 74.79,
            schoolRadiusKm: 3,
          }),
        { wrapper: makeWrapper() },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // (a) the school-radius request was actually made, exactly once, at the expected URL.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [rawUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const url = new URL(String(rawUrl));
      expect(url.pathname).toBe('/api/discover/cities/udupi/school-radius-listings');
      expect(url.searchParams.get('schoolLat')).toBe('13.35');
      expect(url.searchParams.get('schoolLon')).toBe('74.79');
      expect(url.searchParams.get('schoolRadiusKm')).toBe('3');
      expect(init.method).toBe('GET');

      // (b) outgoing headers carry no Authorization header (case-insensitive; Headers or plain object).
      const names = Object.keys(
        init.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : ((init.headers ?? {}) as Record<string, string>),
      ).map((n) => n.toLowerCase());
      expect(names).toContain('accept'); // headers were inspected, not an empty/absent bag
      expect(names).not.toContain('authorization');
    } finally {
      fetchSpy.mockRestore();
      mockGet.mockReset();
      vi.doUnmock('@/integrations/supabase/client');
    }
  });
});

describe('mapSchoolRadiusCard (AC5)', () => {
  it('maps the full card to the DiscoverCityListingItem shape', () => {
    const item = mapSchoolRadiusCard(FULL_CARD);
    expect(item.id).toBe('l1');
    expect(item.propertyType).toBe('house');
    expect(item.title).toBe('Sea-view villa');
    expect(item.locality).toBe('Manipal');
    expect(item.priceBand).toBe('₹50L–1Cr');
    expect(item.bedrooms).toBe(3);
    expect(item.builtArea).toBe(1800);
    expect(item.landAreaUnit).toBe('sqft');
    expect(item.listingPurpose).toBe('sale');
    expect(item.createdAt).toBe('2026-05-01T00:00:00Z');
  });

  it('maps heroImageUrl → primaryImageUrl', () => {
    expect(mapSchoolRadiusCard(FULL_CARD).primaryImageUrl).toBe('https://cdn/img.jpg');
    expect(mapSchoolRadiusCard({ ...FULL_CARD, heroImageUrl: null }).primaryImageUrl).toBeNull();
  });

  it('maps latitude/longitude into BOTH lat/lon and latitude/longitude', () => {
    const item = mapSchoolRadiusCard(FULL_CARD);
    expect(item.lat).toBe(13.35);
    expect(item.latitude).toBe(13.35);
    expect(item.lon).toBe(74.79);
    expect(item.longitude).toBe(74.79);
  });

  it('carries filter-relevant contract fields (daysOnMarket/backOnMarket/possessionStatus)', () => {
    const item = mapSchoolRadiusCard(FULL_CARD);
    expect(item.daysOnMarket).toBe(4);
    expect(item.backOnMarket).toBe(false);
    expect(item.possessionStatus).toBe('ready_to_move');
  });

  it('leaves excluded/private fields undefined and does not crash on a sparse card (AC6)', () => {
    const sparse: PublicSchoolRadiusListingCard = { id: 'l2' };
    const item = mapSchoolRadiusCard(sparse);
    expect(item.id).toBe('l2');
    // trustTier/bathrooms/totalFloors/parkingCount/furnishingStatus are never set.
    expect((item as { trustTier?: unknown }).trustTier).toBeUndefined();
    expect(item.bathrooms).toBeUndefined();
    expect(item.totalFloors).toBeUndefined();
    expect(item.lat).toBeNull();
    expect(item.lon).toBeNull();
  });
});
