/**
 * Issue #1793 PR-C (C1/C2) — the request card inside the school-radius zero state, through both
 * real school panels. Same gate as ListingsBody: settled-success + empty only; never on
 * loading/placeholder/error/missing-coords/results; flag-off => hidden.
 *
 * Fix cycle 1 (CR F1/F2): the gate is THIS query's own `settled` signal (loaded, not failed, not a
 * keepPreviousData placeholder) — never `fetching`, which is also true for a same-key background
 * refetch — and an anonymous capped page (`hasMore`) filtered to empty is not a real zero.
 */
import React, { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { SchoolSelectedPanel, AreaSchoolCombinedPanel } from '../SchoolJourneyPanels';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

const mockArea: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.3531,
  geo_center_lon: 74.7935,
  bbox: [[13.34, 74.78], [13.37, 74.81]],
};

const mockSchool: SchoolResult = {
  id: 'sch-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  latitude: 13.3531,
  longitude: 74.7935,
  address: 'Manipal, Udupi District',
  distanceKm: 0.5,
  areaKey: 'IN|KA|Udupi|Manipal',
};

const makeListing = (id: string): DiscoverCityListingItem => ({
  id,
  pricePaise: 5000000 * 100,
  propertyType: 'apartment',
  locality: 'Manipal',
  primaryImageUrl: null,
  lat: 13.354,
  lon: 74.791,
});

interface Scenario {
  listings?: DiscoverCityListingItem[];
  loading?: boolean;
  error?: boolean;
  fetching?: boolean;
  /** The query's own settled signal. Defaults to true (a settled success). */
  settled?: boolean;
  hasMore?: boolean;
  isAuthenticated?: boolean;
  intent?: 'buy' | 'rent';
}

function selectedProps(s: Scenario): React.ComponentProps<typeof SchoolSelectedPanel> {
  return {
    view: {
      chrome: {},
      viewer: { intent: s.intent ?? 'buy', isAuthenticated: s.isAuthenticated ?? false },
      school: mockSchool,
      radius: { km: 3 },
      listings: {
        data: s.listings ?? [],
        loading: s.loading ?? false,
        error: s.error,
        fetching: s.fetching,
        settled: s.settled ?? true,
        hasMore: s.hasMore,
      },
      propertyFilters: { value: {} },
      boundedSearch: {},
    },
    commands: {
      chrome: {},
      radius: { change: vi.fn() },
      listings: { retry: vi.fn() },
      propertyFilters: { replace: vi.fn() },
    },
  };
}

function combinedProps(s: Scenario): React.ComponentProps<typeof AreaSchoolCombinedPanel> {
  return {
    view: {
      chrome: {},
      viewer: { intent: s.intent ?? 'buy', isAuthenticated: s.isAuthenticated ?? false },
      area: mockArea,
      school: mockSchool,
      radius: { km: 3 },
      listings: {
        data: s.listings ?? [],
        loading: s.loading ?? false,
        error: s.error,
        fetching: s.fetching,
        settled: s.settled ?? true,
        hasMore: s.hasMore,
      },
      propertyFilters: { value: {} },
    },
    commands: {
      chrome: {},
      radius: { change: vi.fn() },
      listings: { retry: vi.fn() },
      propertyFilters: { replace: vi.fn() },
      school: { clear: vi.fn() },
    },
  };
}

const PANELS = [
  {
    name: 'SchoolSelectedPanel',
    element: (s: Scenario) => <SchoolSelectedPanel {...selectedProps(s)} />,
  },
  {
    name: 'AreaSchoolCombinedPanel',
    element: (s: Scenario) => <AreaSchoolCombinedPanel {...combinedProps(s)} />,
  },
].map((p) => ({
  ...p,
  render: (s: Scenario) =>
    renderWithProviders(<DiscoverProvider>{p.element(s)}</DiscoverProvider>, { router: 'browser' }),
}));

const CARD = 'Request a property';

beforeEach(() => {
  window.history.pushState({}, '', '/discover?city=udupi');
  vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', 'true');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe.each(PANELS)('$name — request card in the school-radius zero state', ({ render, element }) => {
  it('settled zero result: card renders inside the empty state', () => {
    render({});
    const empty = screen.getByTestId('school-radius-empty-state');
    expect(empty).toContainElement(screen.getByRole('button', { name: CARD }));
  });

  it.each([
    ['loading', { loading: true }],
    // F1a: an anonymous radius change keeps the previous radius' [] on screen (keepPreviousData) while
    // `fetching` stays false for anon users — only the query's own `settled` is false.
    ['a keepPreviousData placeholder (previous radius [] while the new one loads)', { settled: false }],
    ['error (request-failure block is shown instead)', { error: true }],
    ['results present', { listings: [makeListing('l-1')] }],
  ])('hidden when %s', (_n, s) => {
    render(s);
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
  });

  // F1c: a same-key background refetch (window focus / stale refetch) is a SETTLED result.
  it('stays visible during a same-key background refetch (fetching, but the result is settled)', () => {
    render({ fetching: true, settled: true });
    expect(screen.getByRole('button', { name: CARD })).toBeInTheDocument();
  });

  it('a background refetch does not unmount the card: typed phone and the success state survive', async () => {
    const fetchMock = vi.fn(async (...args: [unknown, RequestInit?]) =>
      String(args[0]).includes('/api/public/property-requests')
        ? new Response(JSON.stringify({ id: 'r', status: 'NEW', createdAt: 'x' }), { status: 201 })
        : new Response('{}', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    function Harness() {
      const [fetching, setFetching] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setFetching((v) => !v)}>
            toggle-refetch
          </button>
          {element({ fetching, settled: true })}
        </>
      );
    }
    const user = userEvent.setup();
    renderWithProviders(
      <DiscoverProvider>
        <Harness />
      </DiscoverProvider>,
      { router: 'browser' },
    );
    await user.click(screen.getByRole('button', { name: CARD }));
    await user.type(screen.getByLabelText(/phone number/i), '9876543210');
    await user.click(screen.getByRole('button', { name: 'toggle-refetch' }));
    expect(screen.getByLabelText(/phone number/i)).toHaveValue('9876543210');
    await user.click(screen.getByRole('checkbox', { name: /i agree to share this information/i }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Request received')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'toggle-refetch' }));
    expect(screen.getByText('Request received')).toBeInTheDocument();
  });

  // r4: the listings wrapper dims + click-blocks on `fetching`; an OPEN card must be exempt from that.
  it('a same-key refetch never dims, blocks or remounts the open card; the empty-state options ARE still dimmed', async () => {
    const dimmedAncestor = (el: HTMLElement): HTMLElement | null => {
      for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        if (/\bpointer-events-none\b|\bopacity-50\b/.test(n.className)) return n;
      }
      return null;
    };
    function Harness() {
      const [fetching, setFetching] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setFetching((v) => !v)}>
            toggle-refetch
          </button>
          {element({ fetching, settled: true })}
        </>
      );
    }
    const user = userEvent.setup();
    renderWithProviders(
      <DiscoverProvider>
        <Harness />
      </DiscoverProvider>,
      { router: 'browser' },
    );
    await user.click(screen.getByRole('button', { name: CARD }));
    await user.type(screen.getByLabelText(/what are you looking for/i), '3 BHK near the school');
    await user.type(screen.getByLabelText(/phone number/i), '9876543210');
    await user.click(screen.getByRole('checkbox', { name: /i agree to share this information/i }));
    const cardBefore = screen.getByTestId('request-property-card');
    const phone = screen.getByLabelText(/phone number/i);
    expect(dimmedAncestor(cardBefore)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'toggle-refetch' }));
    phone.focus();

    const card = screen.getByTestId('request-property-card');
    expect(card).toBe(cardBefore);
    expect(dimmedAncestor(card)).toBeNull();
    expect(screen.getByLabelText(/phone number/i)).toBe(phone);
    expect(phone).toBeEnabled();
    expect(phone).toHaveFocus();
    expect(phone).toHaveValue('9876543210');
    expect(screen.getByLabelText(/what are you looking for/i)).toHaveValue('3 BHK near the school');
    expect(screen.getByRole('checkbox', { name: /i agree to share this information/i })).toBeChecked();
    // The rest of the empty state is still the dimmed, click-blocked surface during the refetch.
    expect(dimmedAncestor(screen.getByTestId('change-school-empty-btn'))).not.toBeNull();
  });

  // F2: the anonymous list is a capped page filtered client-side; a filtered-empty capped page is not a zero.
  it('anonymous: hidden on a capped page (hasMore) filtered to empty', () => {
    render({ hasMore: true });
    expect(screen.getByTestId('school-radius-empty-state')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
  });

  it('anonymous: visible when the page was NOT capped (hasMore false)', () => {
    render({ hasMore: false });
    expect(screen.getByRole('button', { name: CARD })).toBeInTheDocument();
  });

  it('signed-in: hasMore is ignored (the list is filtered server-side)', () => {
    render({ hasMore: true, isAuthenticated: true });
    expect(screen.getByRole('button', { name: CARD })).toBeInTheDocument();
  });

  it('hidden when the flag is off (existing empty state unchanged)', () => {
    vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', '');
    render({});
    expect(screen.getByTestId('school-radius-empty-state')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
  });

  it('submits journey SCHOOL with city, school name and radius carried in areaLabel', async () => {
    const fetchMock = vi.fn(async (...args: [unknown, RequestInit?]) =>
      String(args[0]).includes("/api/public/property-requests")
        ? new Response(JSON.stringify({ id: 'r', status: 'NEW', createdAt: 'x' }), { status: 201 })
        : new Response('{}', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render({ intent: 'rent' });
    await user.click(screen.getByRole('button', { name: CARD }));
    await user.type(screen.getByLabelText(/phone number/i), '9876543210');
    await user.click(screen.getByRole('checkbox', { name: /i agree to share this information/i }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    const posts = () =>
      fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/public/property-requests'));
    await waitFor(() => expect(posts()).toHaveLength(1));
    const body = JSON.parse((posts()[0][1] as RequestInit).body as string);
    expect(body.journey).toBe('SCHOOL');
    expect(body.intent).toBe('RENT');
    expect(body.city).toBe('udupi');
    expect(body.areaLabel).toContain('Manipal Public School');
    expect(body.areaLabel).toContain('3 km');
    expect(body.areaLabel.length).toBeLessThanOrEqual(200);
  });
});
