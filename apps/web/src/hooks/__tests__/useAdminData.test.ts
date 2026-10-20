/**
 * useAdminData — issue #2280 AC6.
 *
 * `useAdminListings` reads `property_listings`. Since Flyway V128 the anon/
 * authenticated PostgREST roles no longer have SELECT grants on
 * `contact_phone`/`contact_info` for this table, so a wildcard select errors.
 * Assert on the literal string passed to `.select()` (what the client
 * REQUESTS), not on a mocked response shape — a response-shape assertion
 * would stay green even if the hook regressed to `select('*')`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockFrom = vi.hoisted(() => vi.fn());
const mockIsAdmin = vi.hoisted(() => ({ current: true }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: mockIsAdmin.current }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import {
  useAdminListings,
  useAdminListingsPage,
  useAdminListingById,
  buildAdminListingsSearchFilter,
  type AdminListingsQueryParams,
} from '../useAdminData';

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeChain(response: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(response);
  return chain;
}

/**
 * Recording chain for `useAdminListingsPage`: every filter/order method
 * returns the same chain object (so calls compose exactly like the real
 * Supabase query builder) and `.range()` is the terminal call that resolves
 * the query — mirrors how `makeChain` above terminates on `.limit()`.
 */
function makeRangeChain(response: { data: unknown; error: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  const chainable = ['select', 'eq', 'or', 'gte', 'lt', 'is', 'order'];
  for (const method of chainable) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.range = vi.fn().mockResolvedValue(response);
  return chain;
}

function makeMaybeSingleChain(response: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(response);
  return chain;
}

const BASE_PARAMS: AdminListingsQueryParams = {
  page: 1,
  pageSize: 25,
  tab: 'all',
  q: '',
  sort: 'updated-desc',
  propertyType: 'all',
  locality: 'all',
  sellerType: 'all',
  lifecycleStatus: 'all',
  visibility: 'all',
  quality: 'all',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAdmin.current = true;
});

describe('useAdminListings — select projection (AC6)', () => {
  it('projects through the allow-listed column list, not a wildcard', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    renderHook(() => useAdminListings(), { wrapper: makeWrapper() });

    await waitFor(() => expect(chain.select).toHaveBeenCalled());
    const projection = (chain.select as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

    expect(projection).not.toContain('contact_phone');
    expect(projection).not.toContain('contact_info');
    expect(projection).not.toBe('*');
    expect(projection.startsWith('*')).toBe(false);
    expect(projection).toContain('raw_posts(images)');
  });
});

describe('buildAdminListingsSearchFilter — pure filter-string builder', () => {
  it('returns null for an empty/whitespace query', () => {
    expect(buildAdminListingsSearchFilter('')).toBeNull();
    expect(buildAdminListingsSearchFilter('   ')).toBeNull();
  });

  it('builds an ilike-or across title/locality/seller_type for free text', () => {
    const filter = buildAdminListingsSearchFilter('sea view');
    expect(filter).toContain('title.ilike."%sea view%"');
    expect(filter).toContain('locality.ilike."%sea view%"');
    expect(filter).toContain('seller_type.ilike."%sea view%"');
    expect(filter).not.toContain('listing_number');
  });

  it('adds an exact listing_number match for a display-id-shaped query', () => {
    expect(buildAdminListingsSearchFilter('PROP-101')).toContain('listing_number.eq.101');
    expect(buildAdminListingsSearchFilter('prop-101')).toContain('listing_number.eq.101');
  });

  it('adds an exact listing_number match for a bare numeric query', () => {
    expect(buildAdminListingsSearchFilter('101')).toContain('listing_number.eq.101');
  });

  /**
   * Splits a PostgREST `.or()` filter string the way the PostgREST parser
   * does: on top-level commas only, treating a comma inside a double-quoted
   * value as a literal character rather than a clause separator. Used to
   * prove the generated filter has exactly 3 top-level clauses regardless of
   * grammar-significant punctuation in the search term.
   */
  function splitTopLevelClauses(filter: string): string[] {
    const clauses: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of filter) {
      if (ch === '"') inQuotes = !inQuotes;
      if (ch === ',' && !inQuotes) {
        clauses.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    clauses.push(current);
    return clauses;
  }

  it('quotes a comma in the search term so it cannot split/malform the .or() filter (review #5055162500)', () => {
    const filter = buildAdminListingsSearchFilter('Baker, Street')!;
    const clauses = splitTopLevelClauses(filter);
    expect(clauses).toHaveLength(3);
    expect(clauses[0]).toBe('title.ilike."%Baker, Street%"');
    expect(clauses[1]).toBe('locality.ilike."%Baker, Street%"');
    expect(clauses[2]).toBe('seller_type.ilike."%Baker, Street%"');
  });

  it('escapes a double-quote and parenthesis in the search term for PostgREST grammar (review #5055162500)', () => {
    const filter = buildAdminListingsSearchFilter('3BHK ("lake" view)')!;
    const clauses = splitTopLevelClauses(filter);
    expect(clauses).toHaveLength(3);
    expect(clauses[0]).toBe('title.ilike."%3BHK (\\"lake\\" view)%"');
  });

  it('still escapes literal %/_ ilike wildcards inside a punctuation-bearing search term', () => {
    const filter = buildAdminListingsSearchFilter('50%, off_topic')!;
    const clauses = splitTopLevelClauses(filter);
    expect(clauses).toHaveLength(3);
    expect(clauses[0]).toBe('title.ilike."%50\\\\%, off\\\\_topic%"');
  });
});

describe('useAdminListingsPage — server-side pagination (#2370)', () => {
  it('requests count:"exact" and the correct range for the page', async () => {
    const chain = makeRangeChain({ data: [{ id: 'a' }], error: null, count: 250 });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useAdminListingsPage({ ...BASE_PARAMS, page: 3, pageSize: 25 }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(mockFrom).toHaveBeenCalledWith('property_listings');
    expect(chain.select).toHaveBeenCalledWith(expect.any(String), { count: 'exact' });
    // Page 3 of size 25 -> rows 50..74.
    expect(chain.range).toHaveBeenCalledWith(50, 74);
    expect(result.current.data).toEqual({ items: [{ id: 'a' }], totalCount: 250 });
  });

  it('reports the real total even when the page is far beyond the old 200-row snapshot', async () => {
    const chain = makeRangeChain({ data: [], error: null, count: 517 });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useAdminListingsPage({ ...BASE_PARAMS, page: 20, pageSize: 25 }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.totalCount).toBe(517);
  });

  it('translates the "published" tab into an eq(status, LIVE) filter', async () => {
    const chain = makeRangeChain({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    renderHook(() => useAdminListingsPage({ ...BASE_PARAMS, tab: 'published' }), { wrapper: makeWrapper() });

    await waitFor(() => expect(chain.range).toHaveBeenCalled());
    expect(chain.eq).toHaveBeenCalledWith('status', 'LIVE');
  });

  // #2859 B1 (INV1-d.1, INV4a-c.1): filter subclaims only — the row appearing in the tab after a persisted
  // write is NOT proven here (RETAIN in docs/testing/e2e-retirement-map-2859-b1.md).
  it('#2859 INV1-d.1: the "pending" tab applies exactly one filter, eq(status, PENDING_REVIEW)', async () => {
    const chain = makeRangeChain({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    renderHook(() => useAdminListingsPage({ ...BASE_PARAMS, tab: 'pending' }), { wrapper: makeWrapper() });

    await waitFor(() => expect(chain.range).toHaveBeenCalled());
    expect((chain.eq as ReturnType<typeof vi.fn>).mock.calls).toEqual([['status', 'PENDING_REVIEW']]);
  });

  it('#2859 INV4a-c.1: the "archived" tab applies exactly one filter, eq(status, ARCHIVED)', async () => {
    const chain = makeRangeChain({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    renderHook(() => useAdminListingsPage({ ...BASE_PARAMS, tab: 'archived' }), { wrapper: makeWrapper() });

    await waitFor(() => expect(chain.range).toHaveBeenCalled());
    expect((chain.eq as ReturnType<typeof vi.fn>).mock.calls).toEqual([['status', 'ARCHIVED']]);
  });

  it('translates the "needs-attention" tab into the needs-attention or() filter', async () => {
    const chain = makeRangeChain({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    renderHook(() => useAdminListingsPage({ ...BASE_PARAMS, tab: 'needs-attention' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(chain.range).toHaveBeenCalled());
    const orCalls = (chain.or as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(orCalls.some((f) => f.includes('status.eq.REJECTED'))).toBe(true);
    expect(orCalls.some((f) => f.includes('quality_score.lt.50'))).toBe(true);
  });

  it('translates a "high" quality filter into gte(quality_score, 80)', async () => {
    const chain = makeRangeChain({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    renderHook(() => useAdminListingsPage({ ...BASE_PARAMS, quality: 'high' }), { wrapper: makeWrapper() });

    await waitFor(() => expect(chain.range).toHaveBeenCalled());
    expect(chain.gte).toHaveBeenCalledWith('quality_score', 80);
  });

  it('applies ascending/descending order for the requested sort key', async () => {
    const chain = makeRangeChain({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    renderHook(() => useAdminListingsPage({ ...BASE_PARAMS, sort: 'price-desc' }), { wrapper: makeWrapper() });

    await waitFor(() => expect(chain.range).toHaveBeenCalled());
    expect(chain.order).toHaveBeenCalledWith('price', { ascending: false, nullsFirst: false });
  });
});

describe('useAdminListingById — deep-link direct fetch (#2370)', () => {
  it('fetches the exact row by id with no range/limit', async () => {
    const chain = makeMaybeSingleChain({ data: { id: 'row-200' }, error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useAdminListingById('row-200'), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(chain.eq).toHaveBeenCalledWith('id', 'row-200');
    expect(chain.maybeSingle).toHaveBeenCalled();
    expect(result.current.data).toEqual({ id: 'row-200' });
  });

  it('is disabled and returns no data when id is null', () => {
    const { result } = renderHook(() => useAdminListingById(null), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
