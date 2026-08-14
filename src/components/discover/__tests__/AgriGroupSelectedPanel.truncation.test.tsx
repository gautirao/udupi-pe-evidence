/**
 * AgriGroupSelectedPanel truncation notice tests (Issue #1460)
 *
 * Covers:
 * - truncated=true + limit=250 → notice with "Showing first 250 plots" appears
 * - truncated=false → notice does NOT appear
 * - truncated absent (undefined) → notice does NOT appear
 * - staleTime in useAgriMapListings is 120_000
 * - staleTime in useRegionalAreaGroups is 120_000
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgriGroupSelectedPanel } from '../panels/AgriGroupSelectedPanel';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';

// ── Mocks required by transitive imports ──────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));

// ── Minimal required props ─────────────────────────────────────────────────────

const SAMPLE_LISTING: AgriMapListingItem = {
  id: 'listing-1',
  areaKey: 'area-north',
  latitude: 13.3,
  longitude: 74.7,
  propertyType: 'agricultural_land',
  locality: 'Hebri',
};

const BASE_PROPS = {
  groupLabel: 'North · up to 25 km',
  listings: [SAMPLE_LISTING],
  listingCount: 1,
  isLoading: false,
  isError: false,
  onRetry: () => {},
  onClear: () => {},
  onSelectListing: () => {},
  selectedMaxKm: 25 as const,
  availableMaxDistances: undefined,
  onSetMaxKm: () => {},
};

function renderPanel(extraProps: Partial<React.ComponentProps<typeof AgriGroupSelectedPanel>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AgriGroupSelectedPanel {...BASE_PROPS} {...extraProps} />
    </QueryClientProvider>,
  );
}

// ── Component tests ────────────────────────────────────────────────────────────

describe('AgriGroupSelectedPanel — truncation notice', () => {
  it('renders notice when truncated=true and limit=250', () => {
    renderPanel({ truncated: true, limit: 250 });
    expect(screen.getByText(/Showing first 250 plots/)).toBeInTheDocument();
  });

  it('does NOT render notice when truncated=false', () => {
    renderPanel({ truncated: false, limit: 250 });
    expect(screen.queryByText(/Showing first/)).not.toBeInTheDocument();
  });

  it('does NOT render notice when truncated is absent (undefined)', () => {
    renderPanel();
    expect(screen.queryByText(/Showing first/)).not.toBeInTheDocument();
  });
});

// ── staleTime constant tests ───────────────────────────────────────────────────

describe('useAgriMapListings — staleTime', () => {
  it('hook uses staleTime 120_000', async () => {
    const { useAgriMapListings } = await import('@/hooks/useAgriMapListings');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    expect(useAgriMapListings).toBeDefined();

    const { renderHook } = await import('@testing-library/react');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    renderHook(() => useAgriMapListings('udupi', 'area-north'), { wrapper });

    // Wait for query to be registered in the cache.
    await new Promise((r) => setTimeout(r, 0));

    const queries = qc.getQueryCache().getAll();
    expect(queries.length).toBeGreaterThan(0);
    // Cast options to access staleTime — getAll() returns Query<unknown> but the
    // staleTime field is always present at runtime. This cast is the minimal safe
    // way to read it without pulling in @tanstack/react-query internals. (#1460)
    const queryOptions = queries[0].options as { staleTime?: number };
    expect(queryOptions.staleTime).toBe(120_000);
  });
});

describe('useRegionalAreaGroups — staleTime', () => {
  it('hook uses staleTime 120_000', async () => {
    const { useRegionalAreaGroups } = await import('@/hooks/useRegionalAreaGroups');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    expect(useRegionalAreaGroups).toBeDefined();

    const { renderHook } = await import('@testing-library/react');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    renderHook(() => useRegionalAreaGroups('udupi'), { wrapper });

    await new Promise((r) => setTimeout(r, 0));

    const queries = qc.getQueryCache().getAll();
    expect(queries.length).toBeGreaterThan(0);
    // Same cast rationale as useAgriMapListings staleTime test above. (#1460)
    const queryOptions = queries[0].options as { staleTime?: number };
    expect(queryOptions.staleTime).toBe(120_000);
  });
});
