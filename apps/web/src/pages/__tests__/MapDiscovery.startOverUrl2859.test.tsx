/**
 * #2859 B7 (issue 285907) WEB slice B1 — discover-area-first-drilldown-1483, assertion 1483-11.
 *
 * 1483-11 is "the Start Over control wired through the page (control -> handleStartOver -> urlActions.startOver)
 * clears the URL". The sibling coverage proves the button confirm flow (StartOverButton.test, frozen-red Radix
 * stall) and the facade URL write (resultScope.atomicCommit) in isolation only. This file composes them in ONE it:
 * the REAL MapDiscovery -> DiscoverPanelSurface -> LegacyRightPanelBridge -> REAL DiscoverRightPanel -> panel
 * PanelHeader -> REAL StartOverButton, the confirm click, the REAL useDiscoverJourneyTransitions.handleStartOver
 * and the REAL urlActions.startOver, observed through a LocationProbe.
 *
 * R_double_guard: Start Over has more than one host. THIS fixture exercises the LEGACY shell
 * (journey=school-first -> LegacyRightPanelBridge -> DiscoverRightPanel -> PanelHeader). The area-first shell
 * (AreaFirstJourneyPanel -> DiscoverAreasJourneyPanel, commands.navigation.startOver) is a second host and is NOT
 * driven here; both shells receive the SAME `journeyCommands.startOver` from useDiscoverJourneyTransitions, so the
 * seam mutation (urlActions.startOver -> no-op) is single-sourced for the handler, and the shell-specific button
 * wiring of the area-first shell is RETAIN.
 *
 * R_jsdom / R_injected: the Radix Popover is replaced by a file-scoped stateful stand-in (the
 * AgriGroupLocalityPanel.test.tsx pattern). The trigger and the confirm button are real components; the Popover's
 * own open/close/portal behaviour is RETAIN (injected).
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

// Same Radix Popover stand-in as AgriGroupLocalityPanel.test.tsx: a real open Popover stalls the jsdom worker.
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

const KUNJIBETTU_AREA_KEY = 'IN|KA|Udupi|Kunjibettu';
const AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: KUNJIBETTU_AREA_KEY,
      areaLabel: 'Kunjibettu',
      name: 'Kunjibettu',
      geo_center_lat: 13.342,
      geo_center_lon: 74.745,
      geoCenterLat: 13.342,
      geoCenterLon: 74.745,
      minLat: 13.33, minLon: 74.73, maxLat: 13.36, maxLon: 74.76,
      bbox: [[13.33, 74.73], [13.36, 74.76]] as [[number, number], [number, number]],
      listingCount: 3,
      schoolCount: 1,
      trendDirection: 'stable' as const,
    },
  ],
};

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: AREAS_RESPONSE, isLoading: false })),
}));
vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: vi.fn(() => ({ data: { areas: [] }, isLoading: false })),
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

// One probe records every location the router held, in order (pathname + search + key).
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

// The city-root hierarchy probe (area.ts defaultJourneyProbe) runs once no journey and no scope= remain, i.e.
// right after Start Over. A 404 would REPLACE-write scope='' into the URL; this stub deliberately answers 503
// (non-404 keeps area-first and writes nothing), so the post-Start-Over URL is the pure Start Over output.
const fetchCalls: string[] = [];
const realFetch = globalThis.fetch;

// History: PREV is the entry BEFORE the loaded entry, so REPLACE vs PUSH is observable with navigate(-1).
const PREV_URL = '/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=11';
const LOADED_URL =
  '/discover?city=udupi&intent=rent&journey=school-first&groupId=coastal-strip&beds=2&areaKey=' +
  encodeURIComponent(KUNJIBETTU_AREA_KEY);

describe('#2859 B7 1483-11 — Start Over control -> handleStartOver -> urlActions.startOver -> URL', () => {
  beforeEach(() => {
    seen.length = 0;
    fetchCalls.length = 0;
    probeNavigate = undefined;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input));
      return new Response(JSON.stringify({ message: 'stub' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('clicking the real Start Over control and its confirm drops journey/groupId/areaKey/beds, keeps city + rent intent, as ONE REPLACE', async () => {
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

    // BEFORE: the loaded URL carries every param Start Over must clear, the real control is on screen.
    const startOver = await screen.findByTestId('start-over-button');
    const before = lastParams();
    expect(before.get('journey')).toBe('school-first');
    expect(before.get('groupId')).toBe('coastal-strip');
    expect(before.get('areaKey')).toBe(KUNJIBETTU_AREA_KEY);
    expect(before.get('beds')).toBe('2');
    expect(before.get('intent')).toBe('rent');
    const locationsBefore = seen.length;
    const keyBefore = seen[seen.length - 1].key;

    // ACTION: click the real control; the confirm popover (stand-in) is shown, nothing is written yet.
    await user.click(startOver);
    const confirm = await screen.findByTestId('start-over-confirm');
    expect(lastParams().get('areaKey')).toBe(KUNJIBETTU_AREA_KEY);
    await user.click(confirm);

    // AFTER: positive — the write landed (observed by the SAME probe), city + rent intent kept.
    await waitFor(() => {
      expect(lastParams().has('journey')).toBe(false);
    });
    expect(seen.length).toBeGreaterThan(locationsBefore);
    expect(seen[seen.length - 1].key).not.toBe(keyBefore);
    const after = lastParams();
    expect(after.get('city')).toBe('udupi');
    expect(after.get('intent')).toBe('rent');
    // negatives (the positive writes above were seen by this same probe, in this same it)
    expect(after.has('groupId')).toBe(false);
    expect(after.has('areaKey')).toBe(false);
    expect(after.has('beds')).toBe(false);
    expect(after.has('scope')).toBe(false);

    // REPLACE, not PUSH: one Back skips the cleared entry's predecessor-of-loaded and lands on PREV, not the loaded URL.
    act(() => {
      probeNavigate!(-1);
    });
    await waitFor(() => {
      expect(lastParams().get('lat')).toBe('13.34000');
    });
    expect(lastParams().has('journey')).toBe(false);
    expect(lastParams().has('areaKey')).toBe(false);
  });
});
