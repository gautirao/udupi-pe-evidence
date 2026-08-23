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

import { useAdminListings } from '../useAdminData';

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
