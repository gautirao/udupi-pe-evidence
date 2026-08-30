/**
 * useDuplicateManagement — issue #2280 AC6 + the two admin contact RPC paths.
 *
 * Since Flyway V128, `property_listings.contact_phone`/`contact_info` are no
 * longer selectable directly by anon/authenticated PostgREST roles. The two
 * read queries in this file must project through `propertyListingSelect(...)`
 * instead of a wildcard, and the "match by phone" duplicate-candidate lookup
 * must resolve server-side via `admin_find_contact_duplicate_candidates`
 * (passing only the duplicate's id, never the phone value itself) rather than
 * filtering the table by `contact_phone` client-side. Admin-only contact
 * values are fetched separately and merged back in by
 * `admin_get_listing_contacts`, chunked at 200 ids per call because the RPC
 * raises above that.
 *
 * All projection/RPC assertions below check the literal arguments the client
 * sends — not a mocked response shape — because the point is what gets
 * REQUESTED. A response-shape-only assertion would stay green even if a hook
 * regressed to `select('*')` or `.eq('contact_phone', ...)`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────
const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());
const mockIsAdmin = vi.hoisted(() => ({ current: true }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: mockIsAdmin.current }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Import AFTER mocks
import { useDuplicateListings, usePotentialOriginals, useDismissDuplicate } from '../useDuplicateManagement';
import type { DuplicateListing } from '../useDuplicateManagement';

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

/**
 * Chainable supabase query-builder mock. Every method returns the chain AND
 * the chain itself is thenable — this hook's queries terminate on different
 * methods depending on the branch (`.order(...)`, `.in(...)`, `.limit(...)`),
 * so making the whole chain awaitable regardless of which method is called
 * last avoids needing a bespoke chain shape per branch.
 */
function makeChain(response: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  (chain as unknown as PromiseLike<unknown>).then = ((onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(response).then(onFulfilled)) as PromiseLike<unknown>['then'];
  return chain;
}

function makeDuplicate(overrides: Partial<DuplicateListing> = {}): DuplicateListing {
  return {
    id: 'dup-1',
    property_type: 'apartment',
    locality: 'Udupi',
    contact_phone: null,
    contact_info: null,
    // Fields below are unused by these code paths; cast keeps the fixture terse.
    ...overrides,
  } as DuplicateListing;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAdmin.current = true;
});

// ─── Task 1: projection (AC6) ──────────────────────────────────

describe('useDuplicateManagement — select projection (AC6)', () => {
  it('useDuplicateListings projects through the allow-listed column list', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    renderHook(() => useDuplicateListings(), { wrapper: makeWrapper() });

    await waitFor(() => expect(chain.select).toHaveBeenCalled());
    const projection = (chain.select as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

    expect(projection).not.toContain('contact_phone');
    expect(projection).not.toContain('contact_info');
    expect(projection).not.toBe('*');
    expect(projection.startsWith('*')).toBe(false);
    expect(projection).toContain('raw_posts(images, content)');
  });

  it('usePotentialOriginals (locality/type branch) projects through the allow-listed column list', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    renderHook(() => usePotentialOriginals(makeDuplicate({ contact_phone: null })), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(chain.select).toHaveBeenCalled());
    const projection = (chain.select as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

    expect(projection).not.toContain('contact_phone');
    expect(projection).not.toContain('contact_info');
    expect(projection).not.toBe('*');
    expect(projection.startsWith('*')).toBe(false);
    expect(projection).toContain('raw_posts(images, content)');
  });

  it('usePotentialOriginals (phone-candidate branch) also projects through the allow-listed column list', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'candidate-1' }], error: null });
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    renderHook(() => usePotentialOriginals(makeDuplicate({ contact_phone: '9900000000' })), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(chain.select).toHaveBeenCalled());
    const projection = (chain.select as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

    expect(projection).not.toContain('contact_phone');
    expect(projection).not.toContain('contact_info');
    expect(projection.startsWith('*')).toBe(false);
    expect(projection).toContain('raw_posts(images, content)');
  });
});

// ─── Task 2: the two admin contact RPC paths ───────────────────

describe('usePotentialOriginals — phone-match resolved server-side', () => {
  it('with a phone: calls admin_find_contact_duplicate_candidates with p_duplicate_id (never the phone value), then fetches the returned ids', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'candidate-1' }, { id: 'candidate-2' }], error: null });
    const chain = makeChain({ data: [{ id: 'candidate-1' }, { id: 'candidate-2' }], error: null });
    mockFrom.mockReturnValue(chain);

    const duplicate = makeDuplicate({ id: 'dup-42', contact_phone: '9900000000' });
    const { result } = renderHook(() => usePotentialOriginals(duplicate), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith('admin_find_contact_duplicate_candidates', {
      p_duplicate_id: 'dup-42',
      p_limit: 10,
    });

    // No call to any RPC ever carries the phone value as an argument.
    for (const call of mockRpc.mock.calls) {
      expect(JSON.stringify(call[1] ?? {})).not.toContain('9900000000');
    }

    // Fetches the candidate ids the RPC returned.
    expect(chain.in).toHaveBeenCalledWith('id', ['candidate-1', 'candidate-2']);
    expect(result.current.data).toHaveLength(2);
  });

  it('with a phone but zero server-resolved candidates: returns [] without querying property_listings', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const duplicate = makeDuplicate({ id: 'dup-43', contact_phone: '9900000001' });
    const { result } = renderHook(() => usePotentialOriginals(duplicate), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('without a phone: falls through to the locality/property_type branch unchanged', async () => {
    const chain = makeChain({ data: [{ id: 'orig-1' }], error: null });
    mockFrom.mockReturnValue(chain);

    const duplicate = makeDuplicate({ id: 'dup-44', contact_phone: null, locality: 'Manipal', property_type: 'apartment' as DuplicateListing['property_type'] });
    const { result } = renderHook(() => usePotentialOriginals(duplicate), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).not.toHaveBeenCalledWith('admin_find_contact_duplicate_candidates', expect.anything());
    expect(chain.eq).toHaveBeenCalledWith('is_duplicate', false);
    expect(chain.eq).toHaveBeenCalledWith('locality', 'Manipal');
    expect(chain.eq).toHaveBeenCalledWith('property_type', 'apartment');
    expect(chain.limit).toHaveBeenCalledWith(10);
  });
});

describe('useDuplicateListings — admin contact enrichment', () => {
  it('as admin: calls admin_get_listing_contacts and merges contact values back onto the right rows by id', async () => {
    const rows = [
      { id: 'row-1', contact_phone: null, contact_info: null },
      { id: 'row-2', contact_phone: null, contact_info: null },
    ];
    const chain = makeChain({ data: rows, error: null });
    mockFrom.mockReturnValue(chain);
    mockRpc.mockResolvedValue({
      data: [
        { id: 'row-1', contact_phone: '9000000001', contact_info: 'call after 6pm' },
        { id: 'row-2', contact_phone: '9000000002', contact_info: null },
      ],
      error: null,
    });

    const { result } = renderHook(() => useDuplicateListings(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith('admin_get_listing_contacts', { p_listing_ids: ['row-1', 'row-2'] });

    const byId = new Map(result.current.data!.map((r) => [r.id, r]));
    expect(byId.get('row-1')?.contact_phone).toBe('9000000001');
    expect(byId.get('row-1')?.contact_info).toBe('call after 6pm');
    expect(byId.get('row-2')?.contact_phone).toBe('9000000002');
    expect(byId.get('row-2')?.contact_info).toBeNull();
  });

  it('as non-admin: does not call admin_get_listing_contacts at all', async () => {
    mockIsAdmin.current = false;
    const chain = makeChain({ data: [{ id: 'row-1' }], error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useDuplicateListings(), { wrapper: makeWrapper() });

    // enabled: isAdmin — the query never runs at all for a non-admin.
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalledWith('admin_get_listing_contacts', expect.anything());
  });

  it('chunks admin_get_listing_contacts at 200 ids: called more than once, never with more than 200 ids', async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: `row-${i}`, contact_phone: null, contact_info: null }));
    const chain = makeChain({ data: rows, error: null });
    mockFrom.mockReturnValue(chain);
    mockRpc.mockImplementation((_fn: string, args: { p_listing_ids: string[] }) =>
      Promise.resolve({
        data: args.p_listing_ids.map((id) => ({ id, contact_phone: `phone-${id}`, contact_info: null })),
        error: null,
      }),
    );

    const { result } = renderHook(() => useDuplicateListings(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const contactCalls = mockRpc.mock.calls.filter((call) => call[0] === 'admin_get_listing_contacts');
    expect(contactCalls.length).toBeGreaterThan(1);
    for (const call of contactCalls) {
      const ids = (call[1] as { p_listing_ids: string[] }).p_listing_ids;
      expect(ids.length).toBeLessThanOrEqual(200);
    }
    // Every row still got its contact fields merged in, across chunk boundaries.
    expect(result.current.data).toHaveLength(250);
    expect(result.current.data!.every((r) => r.contact_phone === `phone-${r.id}`)).toBe(true);
  });
});

/**
 * useDismissDuplicate — regression test for the production defect found in
 * #2280 code review (finding F-CR2/missing test (a)): this hook used to
 * chain `.update({ is_duplicate: false }).eq('id', listingId).select().single()`.
 * An argument-less `.select()` defaults to `columns=*`, and PostgREST puts
 * that `*` in the UPDATE's RETURNING list — which, since V128 revoked the
 * anon/authenticated grant on `contact_phone`/`contact_info`, made the WHOLE
 * update 42501 and roll back in production (breaking the admin
 * Dismiss-duplicate action). The fix dropped `.select()` entirely, since no
 * caller consumes the returned row.
 *
 * These assertions check the literal chain the client builds — never a
 * mocked response shape — so this test would fail again if `.select()` (bare
 * or `'*'`) were ever reintroduced here, exactly the regression that reached
 * production undetected.
 */
describe('useDismissDuplicate — mutation request shape (production regression)', () => {
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

  it('marks the correct row not-a-duplicate and never chains .select() (bare or wildcard) on the mutation', async () => {
    const chain = makeMutationChain({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useDismissDuplicate(), { wrapper: makeWrapper() });

    result.current.mutate('dup-99');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith('property_listings');
    expect(chain.update).toHaveBeenCalledWith({ is_duplicate: false });
    expect(chain.eq).toHaveBeenCalledWith('id', 'dup-99');
    // The actual regression this guards: no argument-less `.select()` (which
    // silently expands to `columns=*` and 42501s under V128's revoked grants).
    expect(chain.select).not.toHaveBeenCalled();
  });

  it('propagates a PostgREST error (e.g. the 42501 this defect caused) as a rejected mutation', async () => {
    const pgError = { message: 'permission denied for column contact_phone', code: '42501' };
    const chain = makeMutationChain({ data: null, error: pgError });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useDismissDuplicate(), { wrapper: makeWrapper() });

    result.current.mutate('dup-100');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ message: pgError.message });
  });
});
