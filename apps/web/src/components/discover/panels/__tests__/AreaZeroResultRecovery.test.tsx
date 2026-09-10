/**
 * Issue #2018 (slice 1) — zero-result recovery for a committed AREA_SET or a
 * single canonical AREA.
 *
 * The load-bearing claims under test are the issue's locked rules, not the
 * markup: the failed search is never mutated, nearby counts are the ones the
 * shopper's own filters produce, and "Add" opens the #2017 draft WITHOUT
 * committing a new result scope or pushing a history entry.
 */
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import { useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { AreaZeroResultRecovery } from '../AreaZeroResultRecovery';
import { summariseActiveFilters } from '../../zeroRecoveryCopy';
import type { NearbyAreaCandidate } from '@/hooks/useNearbyAreaCandidates';

const mockUseNearbyAreaCandidates = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useNearbyAreaCandidates', () => ({
  useNearbyAreaCandidates: (...args: unknown[]) => mockUseNearbyAreaCandidates(...args),
}));

const mockUseDiscoverAreas = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: (...args: unknown[]) => mockUseDiscoverAreas(...args),
}));

// Issue #2018 slice 2. Mocked for the same reason the two hooks above are: the
// component's contract with the endpoint is what is under test, not TanStack.
const mockUseRelaxationPreviews = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useRelaxationPreviews', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useRelaxationPreviews')>()),
  useRelaxationPreviews: (...args: unknown[]) => mockUseRelaxationPreviews(...args),
}));

// Issue #2454 — the component reads auth to refuse relaxation rows under an
// anonymous POLYGON (no anonymous polygon path exists). Controllable per test;
// `AuthProvider` is a passthrough so renderWithProviders' tree still mounts.
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockUseAuth(),
}));
const AUTH_BASE = {
  session: null,
  isLoading: false,
  isAdmin: false,
  isBroker: false,
  userRole: null,
  insightsAccessUntil: null,
  signUp: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  refreshRole: vi.fn(),
  refreshAuth: vi.fn(),
};
const signedOut = () => mockUseAuth.mockReturnValue({ ...AUTH_BASE, user: null });
const signedIn = () => mockUseAuth.mockReturnValue({ ...AUTH_BASE, user: { id: 'u-1' } });

const POLYGON_COORDS: [number, number][] = [
  [13.0, 74.6],
  [13.0, 74.8],
  [13.1, 74.8],
  [13.1, 74.6],
];
const POLYGON_SCOPE = { kind: 'POLYGON', coordinates: POLYGON_COORDS } as const;
const VIEWPORT_SCOPE = { kind: 'VIEWPORT', bounds: { s: 13.0, w: 74.6, n: 13.1, e: 74.8 } } as const;

const JAKKUR = 'IN|KA|Bengaluru|Jakkur';
const THANISANDRA = 'IN|KA|Bengaluru|Thanisandra';
const HENNUR = 'IN|KA|Bengaluru|Hennur';

function candidate(overrides: Partial<NearbyAreaCandidate> = {}): NearbyAreaCandidate {
  return {
    areaKey: HENNUR,
    name: 'Hennur',
    geoCenterLat: 13.04,
    geoCenterLon: 77.63,
    eligibleListingCount: 4,
    schoolCount: 2,
    ...overrides,
  };
}

/** Surfaces the shell's draft-open flag so "Add opens the draft" is observable. */
function DraftOpenProbe() {
  const shell = useDiscoverShell();
  return <div data-testid="draft-open">{String(shell.isAreaSetDraftOpen)}</div>;
}

function renderRecovery(
  props: Partial<React.ComponentProps<typeof AreaZeroResultRecovery>> = {},
) {
  return renderWithProviders(
    <DiscoverProvider>
      <AreaSetDraftProvider>
        <DraftOpenProbe />
        <AreaZeroResultRecovery
          scopeAreaKeys={[JAKKUR, THANISANDRA]}
          fallbackScopeName="Jakkur"
          city="bangalore"
          filters={{ priceMax: 5_000_000 }}
          intent="buy"
          noun="homes"
          cause="filters"
          onClearFilters={vi.fn()}
          {...props}
        />
      </AreaSetDraftProvider>
    </DiscoverProvider>,
    { router: 'browser' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  signedOut();
  mockUseDiscoverAreas.mockReturnValue({
    data: {
      city: 'bangalore',
      areas: [
        { areaKey: JAKKUR, name: 'Jakkur', geoCenterLat: 13.07, geoCenterLon: 77.62 },
        { areaKey: THANISANDRA, name: 'Thanisandra', geoCenterLat: 13.05, geoCenterLon: 77.63 },
      ],
    },
  });
  mockUseNearbyAreaCandidates.mockReturnValue({
    data: { city: 'bangalore', selectedAreaKeys: [JAKKUR, THANISANDRA], candidates: [candidate()] },
    isLoading: false,
  });
  // Default: no relaxation offers, so slice 1's existing expectations are
  // unaffected by slice 2's block.
  mockUseRelaxationPreviews.mockReturnValue({ data: undefined, isLoading: false });
});

describe('AreaZeroResultRecovery', () => {
  it('names the full committed scope and the shopper\'s own filters, not just the first area', () => {
    renderRecovery();
    // The Before state this issue exists to fix said "the homes in Jakkur"
    // under a two-area scope. Both areas must be named.
    expect(screen.getByTestId('area-zero-recovery-heading')).toHaveTextContent(
      'No matching homes in your 2 selected areas',
    );
    const scopeLine = screen.getByTestId('area-zero-recovery-scope-line');
    expect(scopeLine).toHaveTextContent('Jakkur · Thanisandra');
    expect(scopeLine).toHaveTextContent('up to ₹50 L');
  });

  it('states that the search is preserved and never offers to widen it', () => {
    renderRecovery();
    expect(screen.getByTestId('area-zero-recovery-note')).toHaveTextContent(
      'Your search is kept exactly as it is. Nothing here widens it for you.',
    );
  });

  it('asks the nearby contract for the committed scope keys and the active filters', () => {
    renderRecovery();
    expect(mockUseNearbyAreaCandidates).toHaveBeenCalledWith(
      'bangalore',
      [JAKKUR, THANISANDRA],
      { priceMax: 5_000_000 },
      { listingPurpose: 'sale' },
    );
  });

  // Issue #2456 — the recovery rows must carry the same buy/rent purpose the
  // listings query sends, or the fixture's rent-only rows are counted into a
  // Buy search's "with matches" list (RR Nagar: Buy 2 → 0 once purpose is sent).
  it.each([
    ['buy', 'sale'],
    ['rent', 'rent'],
  ] as const)(
    'nearby rows send the listings query\'s own listingPurpose (intent=%s → %s)',
    (intent, listingPurpose) => {
      renderRecovery({ intent });
      expect(mockUseNearbyAreaCandidates).toHaveBeenCalledWith(
        'bangalore',
        [JAKKUR, THANISANDRA],
        { priceMax: 5_000_000 },
        { listingPurpose },
      );
    },
  );

  it('shows each nearby area with the count its own filters produce', () => {
    renderRecovery();
    const row = screen.getByTestId(`area-zero-recovery-nearby-${HENNUR}`);
    expect(within(row).getByText('Hennur')).toBeInTheDocument();
    expect(screen.getByTestId(`area-zero-recovery-nearby-${HENNUR}-count`)).toHaveTextContent(
      '4 listings',
    );
  });

  it('never lists an area with zero matches under a "with matches" heading', () => {
    // Verified live: the backend DOES return eligibleListingCount: 0
    // candidates under a restrictive filter, so this gate is load-bearing.
    mockUseNearbyAreaCandidates.mockReturnValue({
      data: {
        city: 'bangalore',
        selectedAreaKeys: [JAKKUR, THANISANDRA],
        candidates: [
          candidate({ areaKey: HENNUR, name: 'Hennur', eligibleListingCount: 0 }),
          candidate({ areaKey: 'IN|KA|Bengaluru|Hebbal', name: 'Hebbal', eligibleListingCount: 0 }),
        ],
      },
      isLoading: false,
    });
    renderRecovery();
    expect(screen.queryByTestId('area-zero-recovery-nearby')).not.toBeInTheDocument();
    expect(screen.getByTestId('area-zero-recovery-nearby-empty')).toHaveTextContent(
      'No nearby area has matches with these filters either',
    );
    expect(screen.queryByText('Hennur')).not.toBeInTheDocument();
  });

  it('Add opens the draft without committing a scope or pushing history', async () => {
    const user = userEvent.setup();
    renderRecovery();

    const urlBefore = window.location.search;
    const historyBefore = window.history.length;
    expect(screen.getByTestId('draft-open')).toHaveTextContent('false');

    await user.click(screen.getByTestId(`area-zero-recovery-nearby-${HENNUR}-add`));

    // The draft opened...
    expect(screen.getByTestId('draft-open')).toHaveTextContent('true');
    // ...and nothing about the committed search moved. `commitAreaSet` is the
    // only writer of the result scope, and it is not on this path.
    expect(window.location.search).toBe(urlBefore);
    expect(window.history.length).toBe(historyBefore);
  });

  it('confirms a zero-content canonical area is valid rather than blaming filters', () => {
    renderRecovery({
      scopeAreaKeys: [JAKKUR],
      fallbackScopeName: 'Jakkur',
      cause: 'empty',
      filters: {},
      onClearFilters: undefined,
    });
    expect(screen.getByTestId('area-zero-recovery-heading')).toHaveTextContent(
      'Jakkur has no homes listed right now',
    );
    expect(screen.getByTestId('area-zero-recovery-note')).toHaveTextContent(
      'not a filtered-out result',
    );
    // Nothing to clear, so no clear action is offered — and the nearby
    // alternatives the issue requires for this state are still present.
    expect(screen.queryByTestId('area-zero-recovery-actions')).not.toBeInTheDocument();
    expect(screen.getByTestId('area-zero-recovery-nearby')).toBeInTheDocument();
  });

  it('offers nearby alternatives for a single canonical AREA too (issue text over frozen mock)', () => {
    renderRecovery({ scopeAreaKeys: [JAKKUR], fallbackScopeName: 'Jakkur' });
    expect(mockUseNearbyAreaCandidates).toHaveBeenCalledWith(
      'bangalore',
      [JAKKUR],
      { priceMax: 5_000_000 },
      { listingPurpose: 'sale' },
    );
    expect(screen.getByTestId(`area-zero-recovery-nearby-${HENNUR}-add`)).toBeInTheDocument();
  });

  it('keeps every recovery action reachable as plain in-flow content (mobile list mode)', () => {
    // J7.9's requirement is that recovery is not buried below an oversized
    // empty map. This block is ordinary panel flow content with no fixed
    // height, absolute positioning or scroll container of its own, so on the
    // mobile List surface it sits directly under the scope bar.
    const { container } = renderRecovery();
    const root = container.querySelector('[data-testid="area-zero-result-recovery"]');
    expect(root?.className).not.toMatch(/absolute|fixed|h-screen|overflow-/);
    expect(screen.getByTestId(`area-zero-recovery-nearby-${HENNUR}-add`)).toBeVisible();
    expect(screen.getByTestId('area-zero-recovery-clear-filters')).toBeVisible();
  });

  it('disables Add once the draft is at the three-area cap', () => {
    renderRecovery({
      scopeAreaKeys: [JAKKUR, THANISANDRA, 'IN|KA|Bengaluru|Hebbal'],
    });
    expect(screen.getByTestId(`area-zero-recovery-nearby-${HENNUR}-add`)).toBeDisabled();
  });
});

// ── Issue #2018 slice 3 — the recovery may only say what is TRUE of the
// active scope. Before this, a committed POLYGON had no scope-aware branch
// anywhere (both flags in useDiscoverMapData are gated on kind === 'VIEWPORT'),
// so it fell through to the single-canonical-AREA path: the banner named an
// AREA that was not the scope and offered nearby areas measured from it.
describe('non-AREA result scopes', () => {
  it('POLYGON names the drawn area, never a previously-selected area', () => {
    renderRecovery({ scopeKind: 'POLYGON' });

    expect(screen.getByTestId('area-zero-recovery-heading')).toHaveTextContent(
      'No matching homes inside your drawn area',
    );
    // FUNCTIONAL_AUDIT §C2: "The zero panel no longer prints previous area
    // names as the active scope."
    const scopeLine = screen.getByTestId('area-zero-recovery-scope-line');
    expect(scopeLine).toHaveTextContent('Drawn area');
    expect(scopeLine).not.toHaveTextContent('Jakkur');
    expect(scopeLine).not.toHaveTextContent('Thanisandra');
  });

  it('VIEWPORT names the visible map area, never a previously-selected area', () => {
    renderRecovery({ scopeKind: 'VIEWPORT' });

    expect(screen.getByTestId('area-zero-recovery-heading')).toHaveTextContent(
      'No matching homes in the visible map area',
    );
    const scopeLine = screen.getByTestId('area-zero-recovery-scope-line');
    expect(scopeLine).toHaveTextContent('Visible map area');
    expect(scopeLine).not.toHaveTextContent('Jakkur');
  });

  it.each(['POLYGON', 'VIEWPORT'] as const)(
    '%s offers no area-shaped nearby list, because the relationship cannot be stated truthfully',
    (scopeKind) => {
      // The candidate that WOULD be offered under an AREA scope.
      mockUseNearbyAreaCandidates.mockReturnValue({
        data: { city: 'bangalore', selectedAreaKeys: [JAKKUR], candidates: [candidate()] },
        isLoading: false,
      });

      renderRecovery({ scopeKind });

      expect(screen.queryByTestId('area-zero-recovery-nearby')).not.toBeInTheDocument();
      expect(screen.queryByTestId('area-zero-recovery-nearby-empty')).not.toBeInTheDocument();
      expect(screen.queryByText('Hennur')).not.toBeInTheDocument();
    },
  );

  it.each(['POLYGON', 'VIEWPORT'] as const)(
    '%s does not ask the area-keyed nearby endpoint at all',
    (scopeKind) => {
      renderRecovery({ scopeKind });
      // The hook disables itself on an empty city (its own documented guard),
      // so an area-keyed request is never issued for a non-area scope.
      expect(mockUseNearbyAreaCandidates).toHaveBeenCalledWith(
        '',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    },
  );

  it.each(['POLYGON', 'VIEWPORT'] as const)(
    '%s with no committed scope to hand over asks nothing and shows no relaxation counts',
    (scopeKind) => {
      // Slice 3's rule survives for the one case that is still untruthful: the
      // panel says POLYGON/VIEWPORT but has no matching resultScope, so there is
      // no geometry to ask about. A deterministic count of the wrong thing is
      // worse than none.
      mockUseRelaxationPreviews.mockReturnValue({
        data: {
          scopeKind: 'AREA_SET',
          previews: [{ kind: 'PRICE_MAX', resultingCount: 7, priceMax: 8_000_000 }],
        },
      });

      renderRecovery({ scopeKind, onApplyFilters: vi.fn() });

      expect(mockUseRelaxationPreviews).toHaveBeenCalledWith('bangalore', null, expect.anything(), expect.anything());
      expect(screen.queryByTestId('area-zero-recovery-relaxations')).not.toBeInTheDocument();
    },
  );

  it('still preserves the search and offers to clear filters under a non-AREA scope', () => {
    renderRecovery({ scopeKind: 'POLYGON', onClearFilters: vi.fn() });

    expect(screen.getByTestId('area-zero-recovery-note')).toHaveTextContent(
      'Your search is kept exactly as it is. Nothing here widens it for you.',
    );
    expect(screen.getByTestId('area-zero-recovery-clear-filters')).toBeInTheDocument();
    // #2454 — the actions row names the ACTIVE scope, not the previous areas.
    expect(screen.getByTestId('area-zero-recovery-actions')).toHaveTextContent(
      'Your drawn area stays exactly as it is.',
    );
  });

  it('POLYGON offers Adjust boundary, and it commits nothing', async () => {
    const user = userEvent.setup();
    const onAdjustBoundary = vi.fn();
    renderRecovery({ scopeKind: 'POLYGON', onAdjustBoundary });

    const urlBefore = window.location.href;
    const historyBefore = window.history.length;

    const row = screen.getByTestId('area-zero-recovery-scope-actions');
    expect(within(row).getByText('Change your drawn area')).toBeInTheDocument();

    await user.click(screen.getByTestId('area-zero-recovery-adjust-boundary'));

    // Calls the existing #2419 seam exactly once...
    expect(onAdjustBoundary).toHaveBeenCalledTimes(1);
    // ...and commits nothing: no scope change, no URL write, no history entry.
    // `handleRedrawPolygon` only moves to the DRAWING phase; the committed
    // scope keeps producing results until a new polygon is drawn AND accepted.
    expect(window.location.href).toBe(urlBefore);
    expect(window.history.length).toBe(historyBefore);
  });

  it('omits the Adjust boundary row entirely when no redraw seam is supplied', () => {
    renderRecovery({ scopeKind: 'POLYGON' });
    // A mock action with no working implementation is left out rather than
    // rendered inert.
    expect(screen.queryByTestId('area-zero-recovery-scope-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-zero-recovery-adjust-boundary')).not.toBeInTheDocument();
  });

  it('does not offer Adjust boundary under VIEWPORT or AREA scopes', () => {
    renderRecovery({ scopeKind: 'VIEWPORT', onAdjustBoundary: vi.fn() });
    expect(screen.queryByTestId('area-zero-recovery-adjust-boundary')).not.toBeInTheDocument();
  });

  it('AREA is unchanged by the new prop (default) — the nearby list still renders', () => {
    renderRecovery();
    expect(screen.getByTestId('area-zero-recovery-nearby')).toBeInTheDocument();
    expect(mockUseNearbyAreaCandidates).toHaveBeenCalledWith(
      'bangalore',
      [JAKKUR, THANISANDRA],
      { priceMax: 5_000_000 },
      { listingPurpose: 'sale' },
    );
  });
});

describe('summariseActiveFilters', () => {
  it('always names the buy/rent intent first', () => {
    expect(summariseActiveFilters({}, 'buy')[0]).toBe('Buy');
    expect(summariseActiveFilters({}, 'rent')[0]).toBe('Rent');
  });

  it('renders a max-only budget as an upper bound, not a range', () => {
    expect(summariseActiveFilters({ priceMax: 5_000_000 }, 'buy')).toContain('up to ₹50 L');
  });

  it('renders a real range when both bounds are set', () => {
    expect(summariseActiveFilters({ priceMin: 5_000_000, priceMax: 8_000_000 }, 'buy')).toContain(
      '₹50 L – ₹80 L',
    );
  });

  it('names the search term so the state says exactly what was searched', () => {
    expect(summariseActiveFilters({}, 'buy', '  corner plot  ')).toContain('“corner plot”');
  });

  it('omits filters that are not set', () => {
    expect(summariseActiveFilters({}, 'buy')).toEqual(['Buy']);
  });
});

/**
 * Issue #2018 (slice 2) — filter-relaxation count previews.
 *
 * The load-bearing claims are the issue's rules again, not the markup: the
 * previewed number is the server's real count, clicking applies exactly ONE
 * filter change, and nothing about the committed scope moves.
 */
describe('AreaZeroResultRecovery — relaxation previews', () => {
  const ACTIVE_FILTERS = { priceMax: 5_000_000, bedrooms: [3] };

  function withPreviews(
    previews: unknown[],
    scopeKind: 'AREA_SET' | 'POLYGON' | 'VIEWPORT' = 'AREA_SET',
  ) {
    mockUseRelaxationPreviews.mockReturnValue({
      data: {
        city: 'bangalore',
        scopeKind,
        areaKeys: scopeKind === 'AREA_SET' ? [JAKKUR, THANISANDRA] : [],
        baselineCount: 0,
        previews,
      },
      isLoading: false,
    });
  }

  it('asks the endpoint for the committed scope keys and the active filters', () => {
    renderRecovery({ filters: ACTIVE_FILTERS });
    expect(mockUseRelaxationPreviews).toHaveBeenCalledWith(
      'bangalore',
      { kind: 'AREA_SET', areaKeys: [JAKKUR, THANISANDRA] },
      ACTIVE_FILTERS,
      { listingPurpose: 'sale' },
    );
  });

  it('renders each offer with the count the SERVER returned, verbatim', () => {
    withPreviews([
      { kind: 'PRICE_MAX', resultingCount: 7, priceMax: 6_000_000 },
      { kind: 'BEDROOMS', resultingCount: 11, bedrooms: [2, 3] },
    ]);
    renderRecovery({ filters: ACTIVE_FILTERS, onApplyFilters: vi.fn() });

    const price = screen.getByTestId('area-zero-recovery-relaxation-PRICE_MAX');
    expect(price).toHaveTextContent('Increase maximum price to ₹60 L');
    expect(
      screen.getByTestId('area-zero-recovery-relaxation-PRICE_MAX-count'),
    ).toHaveTextContent('7 listings');

    const beds = screen.getByTestId('area-zero-recovery-relaxation-BEDROOMS');
    expect(beds).toHaveTextContent('Include 2 BHK');
    expect(
      screen.getByTestId('area-zero-recovery-relaxation-BEDROOMS-count'),
    ).toHaveTextContent('11 listings');
  });

  it('applies EXACTLY ONE filter change, leaving every other filter untouched', async () => {
    const user = userEvent.setup();
    const onApplyFilters = vi.fn();
    withPreviews([{ kind: 'PRICE_MAX', resultingCount: 7, priceMax: 6_000_000 }]);
    renderRecovery({ filters: ACTIVE_FILTERS, onApplyFilters });

    await user.click(screen.getByTestId('area-zero-recovery-relaxation-PRICE_MAX'));

    expect(onApplyFilters).toHaveBeenCalledTimes(1);
    expect(onApplyFilters).toHaveBeenCalledWith({ priceMax: 6_000_000, bedrooms: [3] });
  });

  it('clearing a filter removes it rather than sending an empty list', async () => {
    const user = userEvent.setup();
    const onApplyFilters = vi.fn();
    withPreviews([{ kind: 'BEDROOMS', resultingCount: 5, bedrooms: [] }]);
    renderRecovery({ filters: ACTIVE_FILTERS, onApplyFilters });

    expect(screen.getByTestId('area-zero-recovery-relaxation-BEDROOMS')).toHaveTextContent(
      'Accept any number of bedrooms',
    );
    await user.click(screen.getByTestId('area-zero-recovery-relaxation-BEDROOMS'));

    // An empty array would serialize into an unsatisfiable IN list.
    expect(onApplyFilters).toHaveBeenCalledWith({ priceMax: 5_000_000, bedrooms: undefined });
  });

  it('never renders a suggestion that would change the scope', async () => {
    const user = userEvent.setup();
    const onApplyFilters = vi.fn();
    withPreviews([{ kind: 'PRICE_MAX', resultingCount: 7, priceMax: 6_000_000 }]);
    renderRecovery({ filters: ACTIVE_FILTERS, onApplyFilters });

    await user.click(screen.getByTestId('area-zero-recovery-relaxation-PRICE_MAX'));

    const applied = onApplyFilters.mock.calls[0][0];
    // The scope lives outside PropertyFilters, so the strongest available
    // statement is that no scope-shaped key was smuggled into the patch.
    expect(applied).not.toHaveProperty('localities');
    expect(applied).not.toHaveProperty('polygon');
    expect(applied.city).toBeUndefined();
    // And the committed chips the banner names are still exactly as they were.
    expect(screen.getByTestId('area-zero-recovery-scope-line')).toHaveTextContent(
      'Jakkur · Thanisandra',
    );
  });

  it('renders nothing at all while the real counts have not arrived', () => {
    mockUseRelaxationPreviews.mockReturnValue({ data: undefined, isLoading: true });
    renderRecovery({ filters: ACTIVE_FILTERS, onApplyFilters: vi.fn() });
    // A placeholder count is exactly the dishonest preview the issue forbids.
    expect(screen.queryByTestId('area-zero-recovery-relaxations')).not.toBeInTheDocument();
  });

  it('renders nothing when the server offers no relaxation that helps', () => {
    withPreviews([]);
    renderRecovery({ filters: ACTIVE_FILTERS, onApplyFilters: vi.fn() });
    expect(screen.queryByTestId('area-zero-recovery-relaxations')).not.toBeInTheDocument();
  });

  it('renders no rows when the surface has no filter owner, rather than inert rows', () => {
    withPreviews([{ kind: 'PRICE_MAX', resultingCount: 7, priceMax: 6_000_000 }]);
    renderRecovery({ filters: ACTIVE_FILTERS, onApplyFilters: undefined });
    expect(screen.queryByTestId('area-zero-recovery-relaxations')).not.toBeInTheDocument();
  });

  it('offers are keyboard-reachable buttons, not click-only rows', () => {
    withPreviews([{ kind: 'PRICE_MAX', resultingCount: 7, priceMax: 6_000_000 }]);
    renderRecovery({ filters: ACTIVE_FILTERS, onApplyFilters: vi.fn() });
    expect(screen.getByTestId('area-zero-recovery-relaxation-PRICE_MAX').tagName).toBe('BUTTON');
  });

  it('keeps the mock\'s section order: nearby areas first, then filter changes', () => {
    withPreviews([{ kind: 'PRICE_MAX', resultingCount: 7, priceMax: 6_000_000 }]);
    renderRecovery({ filters: ACTIVE_FILTERS, onApplyFilters: vi.fn() });

    const block = screen.getByTestId('area-zero-result-recovery');
    const order = Array.from(
      block.querySelectorAll('[data-testid="area-zero-recovery-nearby"], [data-testid="area-zero-recovery-relaxations"]'),
    ).map((el) => el.getAttribute('data-testid'));
    expect(order).toEqual(['area-zero-recovery-nearby', 'area-zero-recovery-relaxations']);
  });

  it('a stale response cannot be shown against newer filters', async () => {
    // The guard is the query key: `filters` is part of it, so a reply computed
    // for older filters is cached under a DIFFERENT key and is never read back
    // as the current key's `data`. What is observable from here is the
    // behaviour that guard produces — on a filter change the component re-asks
    // with the new filters and stops showing the old answer, rather than
    // leaving a superseded count on screen until a reply arrives.
    const user = userEvent.setup();
    const NEWER = { priceMax: 8_000_000, bedrooms: [3] };

    // A real state change inside the SAME provider tree (including the router),
    // which is what a filter change actually is.
    function Harness() {
      const [f, setF] = useState<Record<string, unknown>>(ACTIVE_FILTERS);
      return (
        <>
          <button type="button" data-testid="change-filters" onClick={() => setF(NEWER)}>
            change
          </button>
          <AreaZeroResultRecovery
            scopeAreaKeys={[JAKKUR, THANISANDRA]}
            fallbackScopeName="Jakkur"
            city="bangalore"
            filters={f}
            intent="buy"
            noun="homes"
            cause="filters"
            onApplyFilters={vi.fn()}
            onClearFilters={vi.fn()}
          />
        </>
      );
    }

    withPreviews([{ kind: 'PRICE_MAX', resultingCount: 7, priceMax: 6_000_000 }]);
    renderWithProviders(
      <DiscoverProvider>
        <AreaSetDraftProvider>
          <Harness />
        </AreaSetDraftProvider>
      </DiscoverProvider>,
      { router: 'browser' },
    );

    expect(screen.getByTestId('area-zero-recovery-relaxation-PRICE_MAX-count')).toHaveTextContent(
      '7 listings',
    );

    // The newer filter state has no answer yet.
    mockUseRelaxationPreviews.mockReturnValue({ data: undefined, isLoading: true });
    await user.click(screen.getByTestId('change-filters'));

    expect(mockUseRelaxationPreviews).toHaveBeenLastCalledWith(
      'bangalore',
      { kind: 'AREA_SET', areaKeys: [JAKKUR, THANISANDRA] },
      NEWER,
      { listingPurpose: 'sale' },
    );
    // The superseded 7-listing answer is gone rather than lingering under the
    // newer filters it was never computed for.
    expect(screen.queryByTestId('area-zero-recovery-relaxations')).not.toBeInTheDocument();
  });
});

/**
 * Issue #2454 (slice 4) — scope-aware relaxation previews. The rows now render
 * under POLYGON (signed in) and VIEWPORT with the numbers the hook returns for
 * THAT scope, and never under an anonymous POLYGON or for a reply computed for a
 * different scope kind.
 */
describe('AreaZeroResultRecovery — scope-aware relaxation previews (#2454)', () => {
  const ACTIVE_FILTERS = { priceMax: 5_000_000, bedrooms: [3] };

  function withPreviews(scopeKind: 'AREA_SET' | 'POLYGON' | 'VIEWPORT', previews: unknown[]) {
    mockUseRelaxationPreviews.mockReturnValue({
      data: { city: 'bangalore', scopeKind, areaKeys: [], baselineCount: 0, previews },
      isLoading: false,
    });
  }

  it('VIEWPORT: hands the committed viewport to the hook and renders the rows with its numbers, anonymously', () => {
    signedOut();
    withPreviews('VIEWPORT', [
      { kind: 'PRICE_MAX', resultingCount: 4, priceMax: 6_000_000 },
      { kind: 'BEDROOMS', resultingCount: 9, bedrooms: [2, 3] },
    ]);
    renderRecovery({
      scopeKind: 'VIEWPORT',
      resultScope: VIEWPORT_SCOPE,
      filters: ACTIVE_FILTERS,
      onApplyFilters: vi.fn(),
    });

    expect(mockUseRelaxationPreviews).toHaveBeenCalledWith('bangalore', VIEWPORT_SCOPE, ACTIVE_FILTERS, {
      listingPurpose: 'sale',
    });
    expect(screen.getByTestId('area-zero-recovery-relaxation-PRICE_MAX-count')).toHaveTextContent('4 listings');
    expect(screen.getByTestId('area-zero-recovery-relaxation-BEDROOMS-count')).toHaveTextContent('9 listings');
    expect(screen.getByTestId('area-zero-recovery-relaxations')).toHaveTextContent(
      'The visible map area stays exactly as it is.',
    );
  });

  it('POLYGON (signed in): hands the committed polygon to the hook and renders the rows with its numbers', () => {
    signedIn();
    withPreviews('POLYGON', [{ kind: 'PRICE_MAX', resultingCount: 3, priceMax: 6_000_000 }]);
    renderRecovery({
      scopeKind: 'POLYGON',
      resultScope: POLYGON_SCOPE,
      filters: ACTIVE_FILTERS,
      onApplyFilters: vi.fn(),
      onAdjustBoundary: vi.fn(),
    });

    expect(mockUseRelaxationPreviews).toHaveBeenCalledWith('bangalore', POLYGON_SCOPE, ACTIVE_FILTERS, {
      listingPurpose: 'sale',
    });
    expect(screen.getByTestId('area-zero-recovery-relaxation-PRICE_MAX-count')).toHaveTextContent('3 listings');
    expect(screen.getByTestId('area-zero-recovery-relaxations')).toHaveTextContent(
      'Your drawn area stays exactly as it is.',
    );
    // Kit order (`EPZero` L290-342): scope actions directly under the banner, then the filter rows.
    const block = screen.getByTestId('area-zero-result-recovery');
    const order = Array.from(
      block.querySelectorAll(
        '[data-testid="area-zero-recovery-scope-actions"], [data-testid="area-zero-recovery-relaxations"]',
      ),
    ).map((el) => el.getAttribute('data-testid'));
    expect(order).toEqual(['area-zero-recovery-scope-actions', 'area-zero-recovery-relaxations']);
  });

  it('POLYGON (signed in): applying a row changes exactly one filter and leaves the polygon scope untouched', async () => {
    signedIn();
    const user = userEvent.setup();
    const onApplyFilters = vi.fn();
    withPreviews('POLYGON', [{ kind: 'PRICE_MAX', resultingCount: 3, priceMax: 6_000_000 }]);
    renderRecovery({
      scopeKind: 'POLYGON',
      resultScope: POLYGON_SCOPE,
      filters: ACTIVE_FILTERS,
      onApplyFilters,
    });

    await user.click(screen.getByTestId('area-zero-recovery-relaxation-PRICE_MAX'));

    expect(onApplyFilters).toHaveBeenCalledTimes(1);
    expect(onApplyFilters).toHaveBeenCalledWith({ priceMax: 6_000_000, bedrooms: [3] });
    expect(screen.getByTestId('area-zero-recovery-scope-line')).toHaveTextContent('Drawn area');
  });

  it('POLYGON (signed OUT): renders NO relaxation rows even if a reply is somehow present — no anonymous polygon path exists', () => {
    // Mutation proof for the component-side guard: delete
    // `previewScope.kind !== 'POLYGON' || isSignedIn` from `canOfferRelaxations`
    // and this test fails (the hook is mocked, so its own `enabled` guard cannot
    // mask the component's).
    signedOut();
    withPreviews('POLYGON', [{ kind: 'PRICE_MAX', resultingCount: 3, priceMax: 6_000_000 }]);
    renderRecovery({
      scopeKind: 'POLYGON',
      resultScope: POLYGON_SCOPE,
      filters: ACTIVE_FILTERS,
      onApplyFilters: vi.fn(),
      onClearFilters: vi.fn(),
    });

    expect(screen.queryByTestId('area-zero-recovery-relaxations')).not.toBeInTheDocument();
    expect(screen.queryByText(/3 listings/)).not.toBeInTheDocument();
    // The rest of the recovery stays: heading, scope line, clear filters.
    expect(screen.getByTestId('area-zero-recovery-heading')).toHaveTextContent('inside your drawn area');
    expect(screen.getByTestId('area-zero-recovery-clear-filters')).toBeInTheDocument();
  });

  it('refuses a reply computed for a DIFFERENT scope kind than the one being shown', () => {
    // The server half of the stale-response guard: an AREA_SET reply must never
    // dress up a VIEWPORT zero state.
    signedOut();
    withPreviews('AREA_SET', [{ kind: 'PRICE_MAX', resultingCount: 7, priceMax: 6_000_000 }]);
    renderRecovery({
      scopeKind: 'VIEWPORT',
      resultScope: VIEWPORT_SCOPE,
      filters: ACTIVE_FILTERS,
      onApplyFilters: vi.fn(),
    });
    expect(screen.queryByTestId('area-zero-recovery-relaxations')).not.toBeInTheDocument();
  });

  it('AREA is unchanged: rows render from an AREA_SET reply as before, with the selected-areas footnote', () => {
    signedOut();
    withPreviews('AREA_SET', [{ kind: 'PRICE_MAX', resultingCount: 7, priceMax: 6_000_000 }]);
    renderRecovery({ filters: ACTIVE_FILTERS, onApplyFilters: vi.fn() });
    expect(screen.getByTestId('area-zero-recovery-relaxation-PRICE_MAX-count')).toHaveTextContent('7 listings');
    expect(screen.getByTestId('area-zero-recovery-relaxations')).toHaveTextContent(
      'Your selected areas stay exactly as they are.',
    );
  });
});
