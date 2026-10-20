/**
 * #2859 B1 — INV3-b (e2e/journey/admin-listings-inventory-2370.spec.ts): on the admin Listings page, a deep link
 * `?edit=<nonexistent>` opens the REAL ListingEditorDrawer in its "Listing not found" state, and "Close panel" drops
 * the `edit` param from the URL while keeping the other params. A location probe reads the router's URL before/after.
 * Disclosed seams: the inventory data hooks (page, tab counts, filter options, by-id) return a fixed empty result
 * (precedent Listings.test.tsx); `@/lib/api`, AuthContext, use-toast, AppLayout, and the drawer's activity/contact
 * hooks are inert. The drawer, the page and useAdminListingsInventory (URL state) are real.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Listings from '../Listings';

vi.mock('@/hooks/useAdminData', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useAdminData')>('@/hooks/useAdminData');
  return {
    ...actual,
    useAdminListingsPage: () => ({ data: { items: [], totalCount: 0 }, isLoading: false, isError: false, refetch: vi.fn() }),
    useAdminListingsTabCounts: () => ({ data: { all: 0, published: 0, pending: 0, 'needs-attention': 0, archived: 0 } }),
    useAdminListingFilterOptions: () => ({ data: { propertyTypes: [], localities: [], sellerTypes: [] } }),
    useAdminListingById: () => ({ data: null, isLoading: false }),
  };
});

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(async () => []), post: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/useListingActivity', () => ({
  useListingActivity: () => ({ entries: [], isLoading: false, isError: false, windowMayBeIncomplete: false }),
}));
vi.mock('@/hooks/useAdminListingContact', () => ({
  useAdminListingContact: () => ({ data: undefined, isLoading: false, isError: false }),
}));

function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="location-probe">{loc.pathname + loc.search}</output>;
}

describe('admin Listings ?edit deep link (#2859 B1, INV3-b)', () => {
  it('INV3-b: "Close panel" on an unresolvable ?edit=<id> drops edit from the URL and keeps the other params', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/admin/listings?tab=pending&edit=ghost-2859']}>
          <Listings />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // before: drawer in its not-found state, URL carries edit
    expect(await screen.findByRole('heading', { name: 'Listing not found' })).toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/admin/listings?tab=pending&edit=ghost-2859');

    await user.click(screen.getByRole('button', { name: 'Close panel' }));

    // after: exact URL — edit removed, tab kept; the drawer is gone
    await waitFor(() => expect(screen.getByTestId('location-probe').textContent).toBe('/admin/listings?tab=pending'));
    expect(screen.queryByRole('heading', { name: 'Listing not found' })).toBeNull();
  });
});
