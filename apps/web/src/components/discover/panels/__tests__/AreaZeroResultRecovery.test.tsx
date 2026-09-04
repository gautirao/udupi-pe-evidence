/**
 * Issue #2018 (slice 1) — zero-result recovery for a committed AREA_SET or a
 * single canonical AREA.
 *
 * The load-bearing claims under test are the issue's locked rules, not the
 * markup: the failed search is never mutated, nearby counts are the ones the
 * shopper's own filters produce, and "Add" opens the #2017 draft WITHOUT
 * committing a new result scope or pushing a history entry.
 */
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
    );
  });

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
    expect(mockUseNearbyAreaCandidates).toHaveBeenCalledWith('bangalore', [JAKKUR], {
      priceMax: 5_000_000,
    });
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
