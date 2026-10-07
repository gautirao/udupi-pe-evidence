/**
 * Issue #1793 PR-C (C1) — the "Request a property" card appears in ListingsBody ONLY on a
 * settled-successful, empty, flag-enabled result. It must never appear while loading/fetching,
 * on error, when the query has produced no data (undefined), when results exist, or flag-off.
 */
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { ListingsBody } from '../ListingsBody';
import { RequestCardSettledContext } from '@/features/discover/areas-journey/results/requestCardSettledContext';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

// Bare render: NO RequestCardSettledContext provider (a surface that does not supply the signal).
const renderBare = (ui: React.ReactElement) => renderWithProviders(<DiscoverProvider>{ui}</DiscoverProvider>);

// Default render supplies the own-query signal. ListingsBody now fails closed without it (CR review 2,
// F1), so the tests that exercise the card's own gating/behaviour must be on a surface that provides
// it, as AreaLeafListingsSurface does. `settled` defaults to true (own query loaded, not a placeholder).
const render = (ui: React.ReactElement, settled: boolean = true) =>
  renderBare(<RequestCardSettledContext.Provider value={settled}>{ui}</RequestCardSettledContext.Provider>);

const listing: DiscoverCityListingItem = {
  id: '1',
  propertyType: 'apartment',
  title: 'Test Listing',
  locality: 'Kalsanka',
  pricePaise: 5000000,
  bedrooms: 2,
  bathrooms: 1,
};

const baseProps = {
  isFetching: false,
  isInitialLoading: false,
  isLoadingListings: false,
  areaListings: [] as DiscoverCityListingItem[],
  isListingsError: false,
  hasPropertyFilters: false,
  searchQuery: '',
  listingCount: null,
  areaLabel: 'Kalsanka',
  resolvedCityLabel: 'Udupi',
  commercialFromFilters: false,
  intentNoun: 'sale' as const,
  multiAreaKeys: null,
  fallbackAreaKey: 'kalsanka|city|udupi',
  resolvedAreasCity: 'udupi',
  filters: {},
  activeScope: null,
  resultScopeKind: 'AREA' as const,
  count: 0,
  isViewportScope: false,
  onNavigateToListing: vi.fn(),
  selectedListingId: null,
  hoveredListingId: null,
  registerCardRef: () => () => {},
};

const CARD = 'Request a property';

beforeEach(() => {
  vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', 'true');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('ListingsBody — request card render matrix (#1793 PR-C C1)', () => {
  it('settled success + zero results: the card renders as a sibling AFTER the zero-result recovery', () => {
    render(<ListingsBody {...baseProps} />);
    const recovery = screen.getByTestId('area-zero-result-recovery');
    const trigger = screen.getByRole('button', { name: CARD });
    expect(recovery.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(recovery.contains(trigger)).toBe(false);
  });

  it.each([
    ['loading', { isLoadingListings: true }],
    ['initial loading', { isInitialLoading: true, isFetching: true }],
    // A first/keyed refetch: the own query is NOT settled while it is in flight (the surface's signal).
    ['refetching (fetching, not initial; own query unsettled)', { isFetching: true, settled: false }],
    ['error with nothing to fall back on', { isListingsError: true }],
    ['not settled: areaListings undefined, no error, not loading', { areaListings: undefined }],
  ])('hidden when %s', (_name, { settled, ...patch }: { settled?: boolean } & Record<string, unknown>) => {
    render(<ListingsBody {...baseProps} {...patch} />, settled ?? true);
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
    expect(screen.queryByText("Can't find what you need?")).not.toBeInTheDocument();
  });

  it('hidden when there are results (populated grid, including stale results with a refresh error)', () => {
    const { unmount } = render(<ListingsBody {...baseProps} areaListings={[listing]} count={1} />);
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
    unmount();
    render(<ListingsBody {...baseProps} areaListings={[listing]} count={1} isListingsError />);
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
  });

  it('hidden when the flag is off, while the existing zero-result recovery still renders', () => {
    vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', '');
    render(<ListingsBody {...baseProps} />);
    expect(screen.getByTestId('area-zero-result-recovery')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
  });
});

describe('ListingsBody — request card context (#1793 PR-C C2)', () => {
  async function submitAndGetBody(props: Partial<React.ComponentProps<typeof ListingsBody>>) {
    // The zero-result recovery makes its own (unrelated) requests through the same global fetch,
    // so only the property-request POST is answered 201 and asserted on.
    const fetchMock = vi.fn(async (...args: [unknown, RequestInit?]) =>
      String(args[0]).includes("/api/public/property-requests")
        ? new Response(JSON.stringify({ id: 'r', status: 'NEW', createdAt: 'x' }), { status: 201 })
        : new Response('{}', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ListingsBody {...baseProps} {...props} />);
    await user.click(screen.getByRole('button', { name: CARD }));
    await user.type(screen.getByLabelText(/phone number/i), '9876543210');
    await user.click(screen.getByRole('checkbox', { name: /i agree to share this information/i }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    const posts = () =>
      fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/public/property-requests'));
    await waitFor(() => expect(posts()).toHaveLength(1));
    return JSON.parse((posts()[0][1] as RequestInit).body as string);
  }

  it('AREA scope: journey AREA with the real area key/label, city and BUY intent', async () => {
    const body = await submitAndGetBody({});
    expect(body).toMatchObject({
      journey: 'AREA',
      intent: 'BUY',
      city: 'udupi',
      areaKey: 'kalsanka|city|udupi',
      areaLabel: 'Kalsanka',
    });
  });

  it('rent intent maps to RENT', async () => {
    const body = await submitAndGetBody({ intentNoun: 'rent' });
    expect(body.intent).toBe('RENT');
  });

  it.each([['POLYGON'], ['VIEWPORT']] as const)(
    '%s scope: journey MAP and NO invented area key/label',
    async (kind) => {
      const body = await submitAndGetBody({ resultScopeKind: kind, isViewportScope: kind === 'VIEWPORT' });
      expect(body.journey).toBe('MAP');
      expect(body.areaKey ?? null).toBeNull();
      expect(body.areaLabel ?? null).toBeNull();
      expect(body.city).toBe('udupi');
    },
  );
});

describe('ListingsBody — own-query settled gate (#1793 PR-C fix cycle, CR F1)', () => {
  const withSettled = (settled: boolean | undefined, props: Partial<React.ComponentProps<typeof ListingsBody>> = {}) =>
    render(
      <RequestCardSettledContext.Provider value={settled}>
        <ListingsBody {...baseProps} {...props} />
      </RequestCardSettledContext.Provider>,
    );

  it('F1a/b: hidden while the scope\'s own query is NOT settled (keepPreviousData placeholder), even though the shared isFetching is false', () => {
    // The anonymous placeholder case: the previous key's [] is on screen, isFetching is false.
    withSettled(false, { isFetching: false });
    expect(screen.getByTestId('area-zero-result-recovery')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
  });

  it('F1c: visible while the own query IS settled even though the shared isFetching is true (same-key background refetch)', () => {
    withSettled(true, { isFetching: true });
    expect(screen.getByRole('button', { name: CARD })).toBeInTheDocument();
  });

  it('F1c: a background refetch keeps the card mounted: the typed phone and the success state survive', async () => {
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
          <RequestCardSettledContext.Provider value={true}>
            <ListingsBody {...baseProps} isFetching={fetching} />
          </RequestCardSettledContext.Provider>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
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

  it('no provider (a surface that does not supply the signal): FAILS CLOSED, even on a settled-looking zero (isFetching false)', () => {
    // The legacy `?areaKey=` AreaJourneyPanel route: shared isFetching is false, data is a settled-
    // looking [], but nothing vouches that THIS scope's query settled, so no card (CR review 2, F1).
    renderBare(<ListingsBody {...baseProps} isFetching={false} />);
    expect(screen.getByTestId('area-zero-result-recovery')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
  });

  it('provider value undefined behaves like no provider: fails closed', () => {
    withSettled(undefined, { isFetching: false });
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
  });

  it('a settled own query never overrides loading / error / undefined data', () => {
    const { unmount } = withSettled(true, { isLoadingListings: true });
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
    unmount();
    const second = withSettled(true, { isListingsError: true });
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
    second.unmount();
    withSettled(true, { areaListings: undefined });
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
  });
});

describe('ListingsBody — a same-key refetch never dims or remounts the open card (#1793 PR-C r4)', () => {
  /** The first ancestor (or the element itself) carrying a dim / click-block class, if any. */
  function dimmedAncestor(el: HTMLElement): HTMLElement | null {
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      if (/\bpointer-events-none\b|\bopacity-50\b/.test(n.className)) return n;
    }
    return null;
  }

  it('isFetching=true over a settled zero: the open card, typed values and consent stay live, same node, not dimmed', async () => {
    function Harness() {
      const [fetching, setFetching] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setFetching((v) => !v)}>
            toggle-refetch
          </button>
          <RequestCardSettledContext.Provider value={true}>
            <ListingsBody {...baseProps} isFetching={fetching} />
          </RequestCardSettledContext.Provider>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: CARD }));
    const requirement = screen.getByLabelText(/what are you looking for/i);
    await user.type(requirement, '3 BHK near the school');
    await user.type(screen.getByLabelText(/phone number/i), '9876543210');
    await user.click(screen.getByRole('checkbox', { name: /i agree to share this information/i }));
    const cardBefore = screen.getByTestId('request-property-card');
    const phoneBefore = screen.getByLabelText(/phone number/i);
    expect(dimmedAncestor(cardBefore)).toBeNull();

    // Same-key background refetch begins: the shared isFetching flips true while the own query stays settled.
    await user.click(screen.getByRole('button', { name: 'toggle-refetch' }));
    // (the toggle is outside the card; put focus back in the card as the buyer would while typing)
    phoneBefore.focus();

    const card = screen.getByTestId('request-property-card');
    expect(card).toBe(cardBefore); // not remounted
    expect(dimmedAncestor(card)).toBeNull();
    expect(screen.getByLabelText(/phone number/i)).toBe(phoneBefore);
    expect(phoneBefore).toBeEnabled();
    expect(phoneBefore).toHaveFocus();
    expect(screen.getByLabelText(/what are you looking for/i)).toHaveValue('3 BHK near the school');
    expect(phoneBefore).toHaveValue('9876543210');
    expect(screen.getByRole('checkbox', { name: /i agree to share this information/i })).toBeChecked();
    // And the buyer can still type into it mid-refetch.
    await user.type(screen.getByLabelText(/what are you looking for/i), '!');
    expect(screen.getByLabelText(/what are you looking for/i)).toHaveValue('3 BHK near the school!');
  });

  it('the surrounding zero-result recovery IS still dimmed and click-blocked while refetching', () => {
    render(<ListingsBody {...baseProps} isFetching />);
    expect(dimmedAncestor(screen.getByTestId('area-zero-result-recovery'))).not.toBeNull();
  });
});

describe('ListingsBody — error branch never hosts the request card (#1793 PR-C r2, surviving E2E mutation)', () => {
  // Reachability: the area-first leaf (AreaLeafListingsSurface) returns its OWN error+Retry before it
  // renders AreaSelectedPanel/ListingsBody, so E2E cannot reach this branch with the provider present.
  // The legacy ?areaKey= AreaJourneyPanel and NodeListingsSurface DO reach it but supply no
  // RequestCardSettledContext, so the card fails closed there anyway. This pins the branch directly,
  // with the provider reporting settled=true (the value that would let a misplaced card show).
  it('settled=true + error + nothing to fall back on: error and Retry render, and NO request card', async () => {
    const onRetryListings = vi.fn();
    const user = userEvent.setup();
    render(<ListingsBody {...baseProps} isListingsError onRetryListings={onRetryListings} />, true);
    expect(screen.getByTestId('area-listings-error')).toBeInTheDocument();
    expect(screen.queryByTestId('area-zero-result-recovery')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('area-listings-error-retry'));
    expect(onRetryListings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
    expect(screen.queryByTestId('request-property-card')).not.toBeInTheDocument();
    expect(screen.queryByText("Can't find what you need?")).not.toBeInTheDocument();
  });
});

describe('ListingsBody — multi-area AREA_SET request label (#1793 PR-C fix cycle, CR F3)', () => {
  async function submit(props: Partial<React.ComponentProps<typeof ListingsBody>>) {
    const fetchMock = vi.fn(async (...args: [unknown, RequestInit?]) =>
      String(args[0]).includes('/api/public/property-requests')
        ? new Response(JSON.stringify({ id: 'r', status: 'NEW', createdAt: 'x' }), { status: 201 })
        : new Response('{}', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ListingsBody {...baseProps} {...props} />);
    await user.click(screen.getByRole('button', { name: CARD }));
    await user.type(screen.getByLabelText(/phone number/i), '9876543210');
    await user.click(screen.getByRole('checkbox', { name: /i agree to share this information/i }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    const posts = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/public/property-requests'));
    await waitFor(() => expect(posts()).toHaveLength(1));
    return JSON.parse((posts()[0][1] as RequestInit).body as string);
  }

  it('a multi-area set sends areaKey null and names EVERY committed area, not just the primary one', async () => {
    const body = await submit({ multiAreaKeys: ['IN|KA|Udupi|kalsanka', 'IN|KA|Udupi|manipal'] });
    expect(body.journey).toBe('AREA');
    expect(body.areaKey ?? null).toBeNull();
    expect(body.areaLabel).toContain('kalsanka');
    expect(body.areaLabel).toContain('manipal');
  });

  it('the set label is truncated to the backend 200-char limit', async () => {
    const keys = Array.from({ length: 40 }, (_, i) => `IN|KA|Udupi|a-rather-long-area-slug-${i}`);
    const body = await submit({ multiAreaKeys: keys });
    expect(body.areaLabel.length).toBeLessThanOrEqual(200);
  });

  it('a single committed area is unchanged: real key and label', async () => {
    const body = await submit({ multiAreaKeys: ['IN|KA|Udupi|kalsanka'] });
    expect(body.areaKey).toBe('IN|KA|Udupi|kalsanka');
    expect(body.areaLabel).toBe('Kalsanka');
  });
});
