/**
 * #2859 B2 (handoff 285902) W4 — the broker's preview page (/listing/:id?preview=true) lifecycle actions.
 * Replaces e2e/journey/listing-lifecycle.spec.ts LC1.P1 / P1b.1 / P2.1 / P2b.1 / P3.1 (csv195).
 *
 * Real: ListingDetail in preview mode, TakeOfflineButton / ReopenForEditingButton, the real
 * useArchiveListing / useReopenAsDraftListing hooks and the Radix AlertDialog.
 * Injected: `@/lib/api` (request recorder; the GET returns the in-test listing) and `useToast`
 * (hoisted spy — toast claims are the call ARGUMENT only; no real Toaster is mounted, R_toast).
 * R_reload: each "fresh mount" it renders a new QueryClient + tree; that is NOT a browser reload,
 * so the reload-path claims LC1.P2.2 / LC1.P3.2 stay RETAIN. Persistence is ListingModerationLifecycleIT.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

const mockToast = vi.hoisted(() => vi.fn());
const listingState = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));
vi.mock('@/components/listing/AreaMarketWidget', () => ({ AreaMarketWidget: () => null }));
vi.mock('@/components/listing/SimilarListings', () => ({ SimilarListings: () => null }));
vi.mock('@/components/listing/ListingTransparencyCard', () => ({ ListingTransparencyCard: () => null }));
vi.mock('@/components/poi/NearbyPois', () => ({ NearbyPois: () => null }));
vi.mock('@/components/listing/RequestViewingModal', () => ({ RequestViewingModal: () => null }));
vi.mock('@/components/listing/NearbySchoolsCard', () => ({ NearbySchoolsCard: () => null }));
vi.mock('@/components/listing/RERACard', () => ({ RERACard: () => null }));
vi.mock('@/components/poi/PoiMiniMap', () => ({ PoiMiniMap: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'owner-2859' }, session: { access_token: 'synthetic' }, isLoading: false, isAdmin: false,
    isDealer: true, userRole: 'dealer', insightsAccessUntil: null, refreshRole: vi.fn(), refreshAuth: vi.fn(),
    signOut: vi.fn(),
  }),
}));
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(async (url: string) => {
      if (url === '/api/listings/L2859') return listingState.current;
      return null;
    }),
    post: vi.fn(async (url: string) => {
      if (url.endsWith('/archive')) return { ...listingState.current, status: 'ARCHIVED' };
      if (url.endsWith('/reopen-as-draft')) return { ...listingState.current, status: 'DRAFT' };
      return {};
    }),
  },
}));

import { api } from '@/lib/api';
import ListingDetail from '../ListingDetail';

function makeListing(status: string) {
  return {
    id: 'L2859', propertyType: 'house', title: 'Preview house 2859', locality: 'Manipal', price: 5000000,
    builtArea: 1200, builtAreaUnit: 'sqft', landArea: null, landAreaUnit: null, bedrooms: 3, description: 'Synthetic',
    latitude: 13.34, longitude: 74.74, status, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
    addressConfirmed: true, imageCount: 0, firstImageUrl: null, rejectionReason: null, videoUrl: null,
    reraNumber: null, listingPurpose: 'sale', images: [],
  };
}

/** A fresh mount: new QueryClient + new tree at /listing/L2859?preview=true. */
function freshMount(status: string) {
  listingState.current = makeListing(status);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/listing/L2859?preview=true']}>
        <Routes>
          <Route path="/listing/:id" element={<ListingDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const toastTitles = () => mockToast.mock.calls.map((c) => (c[0] as { title?: string }).title);

beforeEach(() => {
  vi.mocked(api.post).mockClear();
  mockToast.mockReset();
});

describe('ListingDetail preview — lifecycle actions (#2859 B2 csv195 LC1)', () => {
  it('LC1.P1/LC1.P1b.1: LIVE preview "Take Offline" opens the confirm dialog (no POST); confirm POSTs /api/listings/{id}/archive and calls the toast with "Listing archived"', async () => {
    const user = userEvent.setup();
    freshMount('LIVE');
    await user.click(await screen.findByRole('button', { name: /take offline/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: 'Take Listing Offline' })).toBeInTheDocument();
    expect(within(dialog).getByText(/archive your listing and remove it from public search results/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(toastTitles()).not.toContain('Listing archived');

    await user.click(within(dialog).getByRole('button', { name: /take offline/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/listings/L2859/archive'));
    await waitFor(() => expect(toastTitles()).toContain('Listing archived'));
  });

  it('LC1.P2.1/LC1.P2b.1: a fresh mount of an ARCHIVED listing shows the archived banner, "Reopen for Editing" and no "Take Offline"; Reopen POSTs /reopen-as-draft and calls the toast with "Listing reopened"', async () => {
    const user = userEvent.setup();
    freshMount('ARCHIVED');
    expect(await screen.findByText('This listing is archived and not visible to the public. You can reopen it for editing.'))
      .toBeInTheDocument();
    const reopen = screen.getByRole('button', { name: /reopen for editing/i });
    expect(screen.getByRole('link', { name: 'Edit Listing' })).toHaveAttribute('href', '/broker/listings/L2859/edit');
    expect(screen.queryByRole('button', { name: /take offline/i })).not.toBeInTheDocument();
    expect(toastTitles()).not.toContain('Listing reopened');

    await user.click(reopen);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/listings/L2859/reopen-as-draft'));
    await waitFor(() => expect(toastTitles()).toContain('Listing reopened'));
  });

  it('LC1.P3.1: a fresh mount of a DRAFT listing shows the draft banner and the "Edit Listing" link; no Reopen / Take Offline', async () => {
    freshMount('DRAFT');
    expect(await screen.findByText('Preview mode — this listing is a draft. Only you can see this page.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit Listing' })).toHaveAttribute('href', '/broker/listings/L2859/edit');
    expect(screen.queryByRole('button', { name: /reopen for editing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /take offline/i })).not.toBeInTheDocument();
  });
});
