/**
 * #2859 B6 (handoff 285906) AC5 — e2e/discover-anon-price-consistency-1941.spec.ts row 8 (csv50, SEC):
 * a live sign-in / sign-out while ONE listing detail page stays mounted on ONE QueryClient.
 *
 * Real: pages/ListingDetail.tsx (useListingById key listingKeys.public(id, !!session), staleTime 5 min),
 * the REAL lib/api.ts (getAuthToken -> Authorization header) and the REAL ListingDetailMainContent,
 * ListingDetailSidebar and ListingMobileActionBar (every surface that could render a price).
 * Injected (R_injected): the two session sources the product reads, flipped TOGETHER per phase —
 * useAuth().session (a test store read through useSyncExternalStore, so a flip re-renders the page
 * the way the AuthContext provider would) and supabase.auth.getSession (read by lib/api.ts:46-49).
 * Global fetch is the stubbed boundary; it answers like the server projection (Authorization ->
 * exact price; none -> band). Real Supabase sign-in and the server projection itself are RETAIN.
 * Stubbed leaf widgets: the precedent set of ListingDetail.previewLifecycle2859.test.tsx:33-40.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React, { useSyncExternalStore } from 'react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

type Session = { access_token: string; user: { id: string } } | null;

const authStore = vi.hoisted(() => {
  let session: Session = null;
  const listeners = new Set<() => void>();
  return {
    get: () => session,
    set: (s: Session) => {
      session = s;
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});
const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => {
    const session = useSyncExternalStore(authStore.subscribe, authStore.get);
    return {
      session,
      user: session ? session.user : null,
      isLoading: false, isAdmin: false, isDealer: false, userRole: session ? 'user' : null,
      insightsAccessUntil: null, refreshRole: vi.fn(), refreshAuth: vi.fn(), signOut: vi.fn(),
    };
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
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

import ListingDetail from '../ListingDetail';

const ID = 'L2859-1941';
const MAIN_PATH = `/api/public/listings/${ID}`;
const TOKEN = 'tok-2859-b6';
const BAND = '₹1–2Cr';
const EXACT = 13_500_000;
const EXACT_TEXT = '₹1.35 Cr';
const SESSION: Session = { access_token: TOKEN, user: { id: 'u-2859' } };

function detail(authed: boolean) {
  return {
    id: ID, propertyType: 'house', title: 'Session switch house 2859', locality: 'Manipal',
    listingPurpose: 'sale', status: 'LIVE', images: [], imageCount: 0,
    price: authed ? EXACT : null,
    pricePaise: authed ? EXACT * 100 : null,
    // The anon response carries the band. The authed response ALSO carries a stray band
    // (defence in depth, as MarkerPopoverCard 'ignores priceBand'): the exact price must win.
    priceBand: BAND,
    createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
  };
}

type Captured = { path: string; auth: string | null };
let mainGets: Captured[] = [];
let fetchSpy: ReturnType<typeof vi.spyOn>;

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

beforeEach(() => {
  authStore.set(null);
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mainGets = [];
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://x');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const auth = headers['Authorization'] ?? null;
    if (url.pathname === MAIN_PATH) {
      mainGets.push({ path: url.pathname, auth });
      return json(detail(auth != null));
    }
    if (url.pathname === `${MAIN_PATH}/price-history`) return json([]);
    if (url.pathname === `/api/listings/${ID}/trust`) return json({ badges: [] });
    return json(null);
  });
});

afterEach(() => {
  fetchSpy.mockRestore();
  authStore.set(null);
});

const bandCount = () => screen.queryAllByText(BAND).length;
const exactCount = () => screen.queryAllByText(EXACT_TEXT).length;

describe('#2859 B6 AC5 ListingDetail live session switch (one QueryClient, REAL lib/api, fetch-stubbed)', () => {
  it('1941-8 (L50): anon GET has no Authorization and renders the band only; sign-in sends a NEW GET with Bearer and renders the exact price only; sign-out renders the band only again, never the cached exact price', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/listing/${ID}`]}>
          <Routes>
            <Route path="/listing/:id" element={<ListingDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // ── Phase 1: anonymous ──
    await screen.findByText(BAND);
    expect(mainGets).toEqual([{ path: MAIN_PATH, auth: null }]);
    expect(bandCount()).toBe(1);
    expect(exactCount()).toBe(0);

    // ── Phase 2: sign in (both sources flip together, as onAuthStateChange would) ──
    mockGetSession.mockResolvedValue({ data: { session: SESSION } });
    act(() => authStore.set(SESSION));
    await screen.findByText(EXACT_TEXT);
    expect(mainGets).toHaveLength(2);
    expect(mainGets[1]).toEqual({ path: MAIN_PATH, auth: `Bearer ${TOKEN}` });
    expect(exactCount()).toBe(1);
    expect(bandCount()).toBe(0);

    // ── Phase 3: sign out ──
    mockGetSession.mockResolvedValue({ data: { session: null } });
    act(() => authStore.set(null));
    await waitFor(() => expect(bandCount()).toBe(1));
    expect(exactCount()).toBe(0);
    // Observed: the anon-keyed entry from phase 1 is still fresh (staleTime 5 min, ListingDetail.tsx:117),
    // so the page serves it without a third request. Any request that DID go out must carry no
    // Authorization; none may be authed after sign-out.
    const afterSignOut = mainGets.slice(2);
    expect(afterSignOut.every((g) => g.auth === null)).toBe(true);
    expect(mainGets).toHaveLength(2);
  });
});
