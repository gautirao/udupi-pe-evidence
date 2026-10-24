/**
 * #2859 B7 (issue 285907) WEB slice B1 — discover-bounded-listing-2087, assertion 2087-8.
 *
 * 2087-8 is "the Back-to-<label> click reaches the URL write through the panel wiring
 * (DiscoverAreasJourneyPanel `onClearNodeListings={clearNodeListings}`)". NodeListingsSurface.2087 proves the
 * surface calls its prop and the real facade write separately; nothing mounts the panel with the real facade.
 * This file composes them in ONE it: the REAL MapDiscovery -> DiscoverPanelSurface -> AreaFirstJourneyPanel ->
 * DiscoverAreasJourneyPanel -> NodeListingsSurface at ?city=bangalore&node=<N>&nodeListings=1, the real Back
 * button, the real navigation.ts clearNodeListings write, observed through a LocationProbe.
 *
 * Data boundary (named, not claimed): the navigation resolve is answered by a global fetch stub (the real
 * lib/api + useAreasNavigationJourney run); the anon city-listings hook is mocked to an empty teaser. What the
 * server returns for a node is excluded from the claim. R_double_guard: the AREA-leaf surface is a different
 * branch (AreaLeafListingsSurface) and is not driven here.
 *
 * R_jsdom: Radix Popover is replaced by a file-scoped stand-in (AgriGroupLocalityPanel.test.tsx pattern); no
 * Popover is opened.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));
vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: () => <div data-testid="property-map-mock" />,
}));
vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@radix-ui/react-popover', async () => {
  const ReactActual = await vi.importActual<typeof import('react')>('react');
  const OpenCtx = ReactActual.createContext<{ open: boolean; setOpen: (next: boolean) => void }>({
    open: false,
    setOpen: () => {},
  });
  const Root = (props: { children?: React.ReactNode }) => {
    const [open, setOpen] = ReactActual.useState(false);
    return ReactActual.createElement(OpenCtx.Provider, { value: { open, setOpen } }, props.children);
  };
  const Trigger = ReactActual.forwardRef<HTMLElement, { asChild?: boolean; children: React.ReactElement }>(
    (props, ref) => {
      const ctx = ReactActual.useContext(OpenCtx);
      return ReactActual.cloneElement(props.children, {
        ref,
        onClick: (event: MouseEvent) => {
          (props.children.props as { onClick?: (e: MouseEvent) => void }).onClick?.(event);
          ctx.setOpen(!ctx.open);
        },
        'aria-haspopup': 'dialog',
        'aria-expanded': ctx.open,
      });
    },
  );
  const Portal = (props: { children?: React.ReactNode }) => props.children;
  const Content = ReactActual.forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => {
    const ctx = ReactActual.useContext(OpenCtx);
    const domProps = { ...props };
    delete domProps.align;
    delete domProps.sideOffset;
    if (!ctx.open) return null;
    return ReactActual.createElement('div', { ...domProps, ref, role: 'dialog' });
  });
  const Anchor = (props: { children?: React.ReactNode }) => props.children;
  const Close = (props: { children?: React.ReactNode }) => props.children;
  return { Root, Trigger, Portal, Content, Anchor, Close };
});

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: { city: 'bangalore', areas: [] }, isLoading: false })),
}));
vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: vi.fn(() => ({
    data: { areas: [] }, isLoading: false, isError: false, isSuccess: true, isPlaceholderData: false, refetch: vi.fn(),
  })),
}));
vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: vi.fn(() => ({ data: undefined, isLoading: false, isFetching: false, error: null })),
}));
vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: vi.fn(() => ({ data: undefined, isLoading: false, isFetching: false })),
}));
vi.mock('@/hooks/useTrendsOptions', () => ({ useTrendsOptions: vi.fn(() => ({ data: undefined })) }));
vi.mock('@/hooks/useListingSearch', () => ({
  useListingSearch: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
}));
vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: undefined })),
  useSchoolById: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
}));
vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: vi.fn(() => ({
    data: undefined, isLoading: false, isError: false, error: null,
    fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
  })),
}));
vi.mock('@/hooks/useAreaGroups', () => ({ useAreaGroups: vi.fn(() => ({ data: undefined, isLoading: false })) }));
vi.mock('react-leaflet', () => ({
  MapContainer: () => null, TileLayer: () => null, Marker: () => null, Popup: () => null,
  useMap: () => ({ flyTo: vi.fn(), invalidateSize: vi.fn(), fitBounds: vi.fn() }),
  useMapEvents: () => null, Circle: () => null, Polygon: () => null, ZoomControl: () => null,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  },
}));

// ── navigation resolve wire stub ────────────────────────────────────────────────────────────────────────
const NODE_KEY = 'c:domlur';
const NODE_LABEL = 'Domlur Layout';
const wireNode = {
  nodeKey: NODE_KEY,
  nodeType: 'CLUSTER',
  displayLabel: NODE_LABEL,
  depth: 2,
  regionKey: 'r:central',
  ancestry: [{ nodeKey: 'd:central', nodeType: 'DIRECTION', displayLabel: 'Central', displayOrder: 1 }],
  nextLevelType: 'AREA',
  children: [] as unknown[],
  revisionId: 1,
  bounds: null,
  // <= 15 canonical descendant areas, non-root: the node IS eligible for Browse-all (isNodeEligibleForBrowse), so
  // the #2087 eligibility-clear effect does NOT clear nodeListings by itself — only the Back click can.
  descendantAreaKeys: ['IN|KA|Bangalore|Domlur', 'IN|KA|Bangalore|Kodihalli', 'IN|KA|Bangalore|Indiranagar'],
  areaKey: null,
};
const wireRoot = {
  nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', depth: 0, regionKey: null, ancestry: [],
  nextLevelType: 'DIRECTION', children: [] as unknown[], revisionId: 1, bounds: null, descendantAreaKeys: null, areaKey: null,
};
const fetchCalls: string[] = [];
const realFetch = globalThis.fetch;
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const seen: Array<{ search: string; key: string }> = [];
let probeNavigate: ReturnType<typeof useNavigate> | undefined;
function LocationProbe() {
  const location = useLocation();
  probeNavigate = useNavigate();
  React.useEffect(() => {
    seen.push({ search: location.search, key: location.key });
  }, [location]);
  return null;
}
const lastParams = () => new URLSearchParams(seen[seen.length - 1]?.search ?? '');

// PREV is the entry BEFORE the node-listings entry so REPLACE vs PUSH is observable with navigate(-1).
const PREV_URL = `/discover?city=bangalore&lat=12.97000&lon=77.59000&zoom=11&node=${encodeURIComponent(NODE_KEY)}`;
const LOADED_URL = `/discover?city=bangalore&node=${encodeURIComponent(NODE_KEY)}&nodeListings=1`;

describe('#2859 B7 2087-8 — NodeListingsSurface Back click -> DiscoverAreasJourneyPanel onClearNodeListings -> URL', () => {
  beforeEach(() => {
    seen.length = 0;
    fetchCalls.length = 0;
    probeNavigate = undefined;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.includes('/navigation/resolve')) {
        const node = new URL(url).searchParams.get('node');
        const resolved = node === NODE_KEY ? wireNode : wireRoot;
        return jsonResponse(200, { requested: node, resolution: 'EXACT', node: resolved, revisionId: 1 });
      }
      if (url.includes('/navigation/') && url.includes('/counts')) {
        return jsonResponse(200, {
          nodeKey: NODE_KEY, count: 3, schoolCount: 0, areaCounts: {}, areaSchoolCounts: {}, children: [], revisionId: 1,
        });
      }
      return jsonResponse(404, { message: 'not stubbed' });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('with nodeListings=1 the real Back-to-<label> button is shown; clicking it drops nodeListings, keeps node, as a REPLACE', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[PREV_URL, LOADED_URL]} initialIndex={1}>
          <LocationProbe />
          <Routes>
            <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // BEFORE: the node-listings surface is mounted, the Back control names the node, and the URL still carries the flag.
    const back = await screen.findByRole('button', { name: `Back to ${NODE_LABEL}` });
    expect(screen.getByTestId('areas-journey-panel-node-listings')).toBeInTheDocument();
    // settle any mount-time URL rewrite (the eligibility-clear effect must NOT have fired for this eligible node)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(lastParams().get('nodeListings')).toBe('1');
    expect(lastParams().get('node')).toBe(NODE_KEY);
    const locationsBefore = seen.length;
    const keyBefore = seen[seen.length - 1].key;

    // ACTION: click the real Back control.
    await user.click(back);

    // AFTER: positive — the write landed (observed by the SAME probe): flag dropped, node kept.
    await waitFor(() => {
      expect(lastParams().has('nodeListings')).toBe(false);
    });
    expect(seen.length).toBeGreaterThan(locationsBefore);
    expect(seen[seen.length - 1].key).not.toBe(keyBefore);
    expect(lastParams().get('node')).toBe(NODE_KEY);
    expect(lastParams().get('city')).toBe('bangalore');
    // the surface is gone: the hierarchy level for the node renders instead
    await waitFor(() => {
      expect(screen.queryByTestId('areas-journey-panel-node-listings')).not.toBeInTheDocument();
    });

    // REPLACE, not PUSH: one Back skips the cleared entry and lands on PREV (not on the nodeListings=1 entry).
    act(() => {
      probeNavigate!(-1);
    });
    await waitFor(() => {
      expect(lastParams().get('lat')).toBe('12.97000');
    });
    expect(lastParams().has('nodeListings')).toBe(false);
    expect(lastParams().get('node')).toBe(NODE_KEY);
  });
});
