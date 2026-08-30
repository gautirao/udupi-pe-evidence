/**
 * usePropertyListings — issue #2280 AC6.
 *
 * Flyway V128 revoked table-wide SELECT grants on `property_listings` for the
 * anon/authenticated PostgREST roles and re-granted column-by-column over an
 * allow-list that excludes `contact_phone` and `contact_info`. A bare
 * `select('*, raw_posts(images)')` now errors outright, so the hook must
 * project through `propertyListingSelect(...)`.
 *
 * This test asserts the literal string handed to `.select()` — not the shape
 * of a mocked response — because the point is what the client REQUESTS from
 * PostgREST. A response-shape assertion would stay green even if the hook
 * silently reverted to `select('*')`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────
const mockFrom = vi.hoisted(() => vi.fn());
const mockUser = vi.hoisted(() => ({ current: { id: 'user-1' } as { id: string } | null }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser.current }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Import hook AFTER mocks
import { usePropertyListings, useUpdateListing } from '../usePropertyListings';

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

/** Chainable supabase builder that resolves `limit` with the given response. */
function makeChain(response: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(response);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.current = { id: 'user-1' };
});

describe('usePropertyListings — select projection (AC6)', () => {
  it('projects through the allow-listed column list, not a wildcard', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    renderHook(() => usePropertyListings(), { wrapper: makeWrapper() });

    await waitFor(() => expect(chain.select).toHaveBeenCalled());
    const projection = (chain.select as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

    expect(projection).not.toContain('contact_phone');
    expect(projection).not.toContain('contact_info');
    expect(projection).not.toBe('*');
    expect(projection.startsWith('*')).toBe(false);
    // Still fetches the raw_posts image embed the hook relied on before.
    expect(projection).toContain('raw_posts(images)');
    // Sanity: it's genuinely the allow-listed column list, not some other
    // narrow-but-arbitrary string that happens to satisfy the assertions above.
    expect(projection).toContain('id, raw_post_id, property_type');
  });
});

/**
 * useUpdateListing — regression test for the production defect found in
 * #2280 code review (finding F-CR2/missing test (a)): this hook used to
 * chain `.update(updates).eq('id', id).select().single()`. An argument-less
 * `.select()` defaults to `columns=*`, and PostgREST puts that `*` in the
 * UPDATE's RETURNING list — which, since V128 revoked the anon/authenticated
 * grant on `contact_phone`/`contact_info`, made the WHOLE update 42501 and
 * roll back in production (breaking the admin Listings Save button). The fix
 * dropped `.select()` entirely, since no caller consumes the returned row.
 *
 * These assertions check the literal chain the client builds — never a
 * mocked response shape — so this test would fail again if `.select()` (bare
 * or `'*'`) were ever reintroduced here, exactly the regression that reached
 * production undetected.
 */
describe('useUpdateListing — mutation request shape (production regression)', () => {
  /** Chainable mock for `.from(...).update(...).eq(...)`, awaitable at any point in the chain. */
  function makeMutationChain(response: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {};
    chain.update = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.single = vi.fn(() => chain);
    (chain as unknown as PromiseLike<unknown>).then = ((onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(response).then(onFulfilled)) as PromiseLike<unknown>['then'];
    return chain;
  }

  it('updates the correct row and never chains .select() (bare or wildcard) on the mutation', async () => {
    const chain = makeMutationChain({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useUpdateListing(), { wrapper: makeWrapper() });

    result.current.mutate({ id: 'listing-42', updates: { title: 'New title' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith('property_listings');
    expect(chain.update).toHaveBeenCalledWith({ title: 'New title' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'listing-42');
    // The actual regression this guards: no argument-less `.select()` (which
    // silently expands to `columns=*` and 42501s under V128's revoked grants).
    expect(chain.select).not.toHaveBeenCalled();
  });

  it('propagates a PostgREST error (e.g. the 42501 this defect caused) as a rejected mutation', async () => {
    const pgError = { message: 'permission denied for column contact_phone', code: '42501' };
    const chain = makeMutationChain({ data: null, error: pgError });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useUpdateListing(), { wrapper: makeWrapper() });

    result.current.mutate({ id: 'listing-43', updates: { title: 'x' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ message: pgError.message });
  });
});
