/**
 * usePropertyListings — focused test for fetchPolygonListings items mapping.
 *
 * Covers: M39 envelope rename content→items on GET /api/public/listings/within-polygon.
 *
 * FAIL conditions:
 *   - If the code still reads `data.content` instead of `data.items`, the mock
 *     only supplies `items`, so `data.content` is undefined and `.map()` throws
 *     "Cannot read properties of undefined (reading 'map')".
 *   - If polygonResponseToListing misreads any field (e.g. id, price, images),
 *     the value-distinct assertions below catch it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPolygonListings } from './usePropertyListings';

// ─── Module mocks ────────────────────────────────────────────────────────────
// usePropertyListings.ts imports Supabase at module-level; mock it to prevent
// "supabaseUrl is required" during module collection. fetchPolygonListings only
// uses api.get, so supabase itself is never called by the tests here.

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) },
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null, session: null, isAdmin: false, isDealer: false })),
}));

// ─── Fixture ─────────────────────────────────────────────────────────────────

/** A realistic PolygonListingResponse payload for a Manipal house listing. */
const FIXTURE_ITEM = {
  id: 'plr-manipal-001',
  listingNumber: 4812,
  status: 'active',
  propertyType: 'house',
  title: 'Spacious house near MIT Manipal',
  locality: 'Manipal',
  price: 7500000,
  description: '3BHK with garden',
  landArea: 120,
  landAreaUnit: 'sqmt',
  bedrooms: 3,
  builtArea: 200,
  builtAreaUnit: 'sqft',
  latitude: 13.3527,
  longitude: 74.7862,
  firstImageUrl: 'https://cdn.example.com/images/plr-manipal-001.jpg',
  imageCount: 1,
  createdAt: '2026-05-01T10:00:00Z',
  updatedAt: '2026-05-15T08:00:00Z',
  sellerType: 'owner',
  listingPurpose: 'sale',
  reraNumber: 'KA-RERA-12345',
  daysOnMarket: 14,
  backOnMarket: false,
  lastUpdatedAt: '2026-05-15T08:00:00Z',
  firstPublishedAt: '2026-05-01T10:00:00Z',
  possessionStatus: 'ready_to_move',
  reraValid: true,
  trustTier: 'A',
  areaKey: 'IN|KA|Udupi|Manipal',
};

/** A minimal 3-point polygon to satisfy the function signature. */
const POLYGON: [number, number][] = [
  [74.78, 13.35],
  [74.79, 13.35],
  [74.785, 13.36],
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('fetchPolygonListings — items envelope mapping (M39)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps items[] from envelope to PropertyListing[] — id matches fixture', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce({
      items: [FIXTURE_ITEM],
      totalElements: 1,
      totalPages: 1,
      page: 0,
      size: 200,
    });

    const results = await fetchPolygonListings(POLYGON);

    expect(results).toHaveLength(1);
    // Value-distinct: fixture id is 'plr-manipal-001'; a stale .content read yields TypeError, not a wrong id.
    expect(results[0].id).toBe('plr-manipal-001');
  });

  it('maps locality from items[], not content[]', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce({
      items: [FIXTURE_ITEM],
      totalElements: 1,
      totalPages: 1,
      page: 0,
      size: 200,
    });

    const results = await fetchPolygonListings(POLYGON);

    expect(results[0].locality).toBe('Manipal');
  });

  it('price is coerced to number', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce({
      items: [FIXTURE_ITEM],
      totalElements: 1,
      totalPages: 1,
      page: 0,
      size: 200,
    });

    const results = await fetchPolygonListings(POLYGON);

    expect(typeof results[0].price).toBe('number');
    expect(results[0].price).toBe(7500000);
  });

  it('images derive from firstImageUrl in the items entry', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce({
      items: [FIXTURE_ITEM],
      totalElements: 1,
      totalPages: 1,
      page: 0,
      size: 200,
    });

    const results = await fetchPolygonListings(POLYGON);

    expect(results[0].images).toHaveLength(1);
    expect(results[0].images[0].url).toBe('https://cdn.example.com/images/plr-manipal-001.jpg');
  });

  it('areaKey is preserved from the items entry', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce({
      items: [FIXTURE_ITEM],
      totalElements: 1,
      totalPages: 1,
      page: 0,
      size: 200,
    });

    const results = await fetchPolygonListings(POLYGON);

    expect(results[0].areaKey).toBe('IN|KA|Udupi|Manipal');
  });

  it('maps multiple items[], preserving order', async () => {
    const { api } = await import('@/lib/api');
    const secondItem = { ...FIXTURE_ITEM, id: 'plr-manipal-002', locality: 'Parkala', price: 5000000 };
    vi.mocked(api.get).mockResolvedValueOnce({
      items: [FIXTURE_ITEM, secondItem],
      totalElements: 2,
      totalPages: 1,
      page: 0,
      size: 200,
    });

    const results = await fetchPolygonListings(POLYGON);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('plr-manipal-001');
    expect(results[1].id).toBe('plr-manipal-002');
    expect(results[1].locality).toBe('Parkala');
  });

  it('returns empty array when items[] is empty', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce({
      items: [],
      totalElements: 0,
      totalPages: 0,
      page: 0,
      size: 200,
    });

    const results = await fetchPolygonListings(POLYGON);

    expect(results).toHaveLength(0);
  });

  it('passes skipAuth:true and the encoded polygon to api.get', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce({
      items: [],
      totalElements: 0,
      totalPages: 0,
      page: 0,
      size: 200,
    });

    await fetchPolygonListings(POLYGON);

    expect(vi.mocked(api.get)).toHaveBeenCalledOnce();
    const [url, opts] = vi.mocked(api.get).mock.calls[0];
    expect(url).toContain('/api/public/listings/within-polygon');
    expect(url).toContain('size=200');
    expect(opts).toEqual({ skipAuth: true });
  });
});
