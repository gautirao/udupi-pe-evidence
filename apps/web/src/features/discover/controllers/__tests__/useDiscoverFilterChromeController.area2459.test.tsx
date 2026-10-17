/**
 * Issue #2459 AC6 (wiring half) — the contextual AREA chip's clear affordance must actually reset
 * the filter, not merely render an ×.
 *
 * This is deliberately a CONTROLLER test, not a component test. ActiveContextChips already forwards
 * `onClearArea?.()` correctly and is covered by ActiveContextChips.area2459.test.tsx; the defect was
 * that nothing SUPPLIED the prop, so the chip's × — and, worse, Chip.tsx's Enter/Space/Backspace/
 * Delete handler, which calls e.preventDefault() before onClear() — silently swallowed the input.
 * A test that passes its own vi.fn() into the component cannot see that gap. Rendering the node the
 * controller actually hands to DiscoverRightPanel can.
 *
 * The sibling arms are the discriminating control: they must stay green if the area wiring is
 * removed. If dropping `onClearArea` reddened them too, this file would be asserting "the chip row
 * works" rather than "the area chip is wired", and would not localise the defect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { projectUrlFilters } from '@/features/discover/selectors/urlFiltersProjection';
import { useDiscoverFilterChromeController } from '../useDiscoverFilterChromeController';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';
import type { DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';

/**
 * DiscoverNavContextValue and DiscoverUrlActions are wide page-level surfaces. The controller reads
 * only `nav.q` plus the two URL-authoritative filter arrays, and calls `actions` solely from chip
 * handlers this file does not exercise, so each is cast once here rather than stubbed in full.
 */
const nav = {
  q: '',
  filters: { boardFilters: undefined, categoryFilters: undefined },
} as unknown as DiscoverNavContextValue;

const actions = {
  setSearchQuery: vi.fn(),
  setBoardFilters: vi.fn(),
  setCategoryFilters: vi.fn(),
  clearAllFiltersAndSearch: vi.fn(),
} as unknown as DiscoverUrlActions;

/**
 * Price, area and BHK are all active together so each clear can be checked for collateral damage.
 * Three chips is under ActiveContextChips' MAX_VISIBLE_FILTER_CHIPS, so none collapses into the
 * "+N" overflow popover and every × is directly reachable.
 */
const ACTIVE_FILTERS: PropertyFilters = {
  areaMinSqft: 800,
  areaMaxSqft: 1200,
  priceMin: 5_000_000,
  priceMax: 10_000_000,
  bedrooms: [2],
};

function setup(filters: PropertyFilters = ACTIVE_FILTERS) {
  const handleFiltersChange = vi.fn();
  const { result } = renderHook(() =>
    useDiscoverFilterChromeController({
      nav,
      actions,
      filters,
      setFilters: vi.fn(),
      handleFiltersChange,
      selectedSchool: null,
      onSchoolSelect: vi.fn(),
      schoolBoardFilter: [],
      onSchoolBoardFilterChange: vi.fn(),
      city: 'udupi',
      effectiveSelectedArea: null,
      trendsAreaKeys: undefined,
      isFetching: false,
    }),
  );
  render(result.current.activeContextChips);
  return { handleFiltersChange };
}

/**
 * Clicks the chip's dismiss control by STRUCTURAL POSITION — the single button inside the chip
 * container — rather than by its label text, so the assertion does not quietly re-encode the copy
 * the sibling AC6 test already owns.
 */
async function clearChip(testId: string) {
  const user = userEvent.setup();
  await user.click(within(screen.getByTestId(testId)).getByRole('button'));
}

function nextFilters(handleFiltersChange: ReturnType<typeof vi.fn>): PropertyFilters {
  expect(handleFiltersChange).toHaveBeenCalledTimes(1);
  return handleFiltersChange.mock.calls[0][0] as PropertyFilters;
}

describe('useDiscoverFilterChromeController — area chip clear wiring (#2459 AC6)', () => {
  it('clears BOTH area bounds when the area chip is dismissed', async () => {
    const { handleFiltersChange } = setup();
    await clearChip('chip-area');

    const next = nextFilters(handleFiltersChange);
    expect(next.areaMinSqft).toBeUndefined();
    expect(next.areaMaxSqft).toBeUndefined();
  });

  it('clears the bounds to undefined and NEVER to 0 (AC5 unresolvable-area rows)', async () => {
    const { handleFiltersChange } = setup();
    await clearChip('chip-area');

    const next = nextFilters(handleFiltersChange);
    // Deliberately explicit rather than folded into toBeUndefined(): a 0 lower bound renders the
    // same "Any size" affordance but is a DIFFERENT server request — it excludes every row whose
    // primary area is unresolvable, which AC5 requires stay visible. This is the trap.
    expect(next.areaMinSqft).not.toBe(0);
    expect(next.areaMaxSqft).not.toBe(0);
    // Both keys must be PRESENT-and-undefined so the URL writer drops them, rather than absent and
    // leaving the previous bounds standing.
    expect('areaMinSqft' in next).toBe(true);
    expect('areaMaxSqft' in next).toBe(true);
  });

  it('leaves sibling filters untouched when the area chip is dismissed', async () => {
    const { handleFiltersChange } = setup();
    await clearChip('chip-area');

    const next = nextFilters(handleFiltersChange);
    expect(next.priceMin).toBe(5_000_000);
    expect(next.priceMax).toBe(10_000_000);
    expect(next.bedrooms).toEqual([2]);
  });

  // ── Control arm: unaffected by the area wiring, and must stay green without it ──────────────
  it('still clears both price bounds, preserving the area bounds', async () => {
    const { handleFiltersChange } = setup();
    await clearChip('chip-price');

    const next = nextFilters(handleFiltersChange);
    expect(next.priceMin).toBeUndefined();
    expect(next.priceMax).toBeUndefined();
    expect(next.areaMinSqft).toBe(800);
    expect(next.areaMaxSqft).toBe(1200);
  });

  it('still clears the BHK filter, preserving the area bounds', async () => {
    const { handleFiltersChange } = setup();
    await clearChip('chip-bhk');

    const next = nextFilters(handleFiltersChange);
    expect(next.bedrooms).toBeUndefined();
    expect(next.areaMinSqft).toBe(800);
    expect(next.areaMaxSqft).toBe(1200);
  });
});

// ─── G2-N6 (#2750 PR-3 B1) — board/category chips are URL-authoritative + dismiss wiring ───
// Retires discover-school-first-hardening HRD-1..HRD-4/HRD-6 wiring half: the chips element the
// controller hands to the right panel reads nav.filters.* (URL), NOT the local `filters` state, and
// the board dismiss writes the URL-side list minus the dismissed board through actions.setBoardFilters.
describe('useDiscoverFilterChromeController — board/category chips (G2-N6)', () => {
  function setupBoard(
    navFilters: { boardFilters?: string[]; categoryFilters?: string[] },
    localFilters: Record<string, unknown> = {},
  ) {
    const boardActions = {
      setSearchQuery: vi.fn(),
      setBoardFilters: vi.fn(),
      setCategoryFilters: vi.fn(),
      clearAllFiltersAndSearch: vi.fn(),
    };
    const boardNav = { q: '', filters: navFilters } as unknown as DiscoverNavContextValue;
    const { result } = renderHook(() =>
      useDiscoverFilterChromeController({
        nav: boardNav,
        actions: boardActions as unknown as DiscoverUrlActions,
        filters: localFilters as PropertyFilters,
        setFilters: vi.fn(),
        handleFiltersChange: vi.fn(),
        selectedSchool: null,
        onSchoolSelect: vi.fn(),
        schoolBoardFilter: [],
        onSchoolBoardFilterChange: vi.fn(),
        city: 'udupi',
        effectiveSelectedArea: null,
        trendsAreaKeys: undefined,
        isFetching: false,
      }),
    );
    render(result.current.activeContextChips);
    return boardActions;
  }

  it('G2-N6 chips come from nav.filters (URL), not from stale local filters: URL [CBSE]/[secondary] wins over local [ICSE]/[primary]', () => {
    setupBoard(
      { boardFilters: ['CBSE'], categoryFilters: ['secondary'] },
      { boardFilters: ['ICSE'], categoryFilters: ['primary'] },
    );
    expect(screen.getByTestId('active-chip-board-cbse')).toBeInTheDocument();
    expect(screen.getByTestId('active-chip-category-secondary')).toBeInTheDocument();
    expect(screen.queryByTestId('active-chip-board-icse')).not.toBeInTheDocument();
    expect(screen.queryByTestId('active-chip-category-primary')).not.toBeInTheDocument();
  });

  it('G2-N6 dismissing the only CBSE chip writes setBoardFilters([]) (once, and no category write)', async () => {
    const boardActions = setupBoard({ boardFilters: ['CBSE'], categoryFilters: ['secondary'] });
    await userEvent.setup().click(screen.getByTestId('active-chip-board-cbse-dismiss'));
    expect(boardActions.setBoardFilters).toHaveBeenCalledTimes(1);
    expect(boardActions.setBoardFilters).toHaveBeenCalledWith([]);
    expect(boardActions.setCategoryFilters).not.toHaveBeenCalled();
  });

  it('G2-N6 dismissing CBSE among [CBSE, ICSE] keeps ICSE: setBoardFilters([ICSE])', async () => {
    const boardActions = setupBoard({ boardFilters: ['CBSE', 'ICSE'] });
    await userEvent.setup().click(screen.getByTestId('active-chip-board-cbse-dismiss'));
    expect(boardActions.setBoardFilters).toHaveBeenCalledTimes(1);
    expect(boardActions.setBoardFilters).toHaveBeenCalledWith(['ICSE']);
  });
});

// ─── #2750 PR-5 B1 T2 — discover-filter-chips: cold-load URL -> projected filters -> chips, and dismiss wiring ───
// Rows FC-1 (cold-load projection, real URL facade), FC-2 (seller), FC-3 (date range), FC-4 (boolean chips).
// FOUR chips are active at once (seller, date, new-to-market, RERA) = ActiveContextChips' MAX_VISIBLE_FILTER_CHIPS,
// so none collapses into the Radix "+N" overflow popover (D13: no popover is opened here) and every x is reachable.
const SELLER_DATE_BOOL_FILTERS: PropertyFilters = {
  sellerTypes: ['owner'],
  dateFrom: new Date('2025-01-15'),
  dateTo: new Date('2025-02-01'),
  newToMarket: true,
  reraRegistered: true,
};

describe('useDiscoverFilterChromeController — cold-load URL becomes the four projected filters the chips render (FC-1)', () => {
  beforeEach(() => {
    // No journey/scope in the URL -> the area domain fires a default-journey probe; keep it offline.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline (test)'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // #2750 PR-5 FC-1
  it('seller, date range, new-to-market and RERA from a cold-load URL are projected and mounted as four chips', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={['/discover?city=udupi&seller=owner&from=2025-01-15&to=2025-02-01&ntm=1&rera=1']}
        >
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );

    const { result } = renderHook(
      () => {
        const [urlState, urlActions] = useDiscoverUrlState();
        const projected = projectUrlFilters(urlState.filters);
        const chrome = useDiscoverFilterChromeController({
          nav: { q: '', filters: urlState.filters } as unknown as DiscoverNavContextValue,
          actions: urlActions,
          filters: projected,
          setFilters: vi.fn(),
          handleFiltersChange: vi.fn(),
          selectedSchool: null,
          onSchoolSelect: vi.fn(),
          schoolBoardFilter: [],
          onSchoolBoardFilterChange: vi.fn(),
          city: 'udupi',
          effectiveSelectedArea: null,
          trendsAreaKeys: undefined,
          isFetching: false,
        });
        return { projected, chips: chrome.activeContextChips };
      },
      { wrapper: Wrapper },
    );

    // The projected PropertyFilters (the object the page seeds its `filters` from).
    expect(result.current.projected.sellerTypes).toEqual(['owner']);
    expect(result.current.projected.newToMarket).toBe(true);
    expect(result.current.projected.reraRegistered).toBe(true);
    expect(result.current.projected.dateFrom).toBeInstanceOf(Date);
    expect((result.current.projected.dateFrom as Date).getTime()).toBe(new Date('2025-01-15').getTime());
    expect(result.current.projected.dateTo).toBeInstanceOf(Date);
    expect((result.current.projected.dateTo as Date).getTime()).toBe(new Date('2025-02-01').getTime());

    // And the chips the controller hands to the right panel render all four.
    render(result.current.chips);
    expect(screen.getByTestId('chip-seller')).toHaveTextContent(/Seller: /);
    // A BOTH-dates label ("Listed: <from> – <to>"), not "from"/"until" (timezone-independent shape check).
    expect(screen.getByTestId('chip-date')).toHaveTextContent(/Listed: .+ – .+$/);
    expect(screen.getByTestId('chip-bool-ntm')).toBeInTheDocument();
    expect(screen.getByTestId('chip-bool-rera')).toBeInTheDocument();
  });
});

describe('useDiscoverFilterChromeController — seller / date / boolean chip dismiss wiring (FC-2..FC-4)', () => {
  // #2750 PR-5 FC-2
  it('dismissing the seller chip clears sellerTypes only', async () => {
    const { handleFiltersChange } = setup(SELLER_DATE_BOOL_FILTERS);
    await clearChip('chip-seller');

    const next = nextFilters(handleFiltersChange);
    // PRESENT-and-undefined so the URL writer drops it (absent would leave the old value standing).
    expect('sellerTypes' in next).toBe(true);
    expect(next.sellerTypes).toBeUndefined();
    expect(next.dateFrom).toEqual(new Date('2025-01-15'));
    expect(next.dateTo).toEqual(new Date('2025-02-01'));
    expect(next.newToMarket).toBe(true);
    expect(next.reraRegistered).toBe(true);
  });

  // #2750 PR-5 FC-3
  it('dismissing the date chip clears BOTH dateFrom and dateTo, leaving seller and booleans', async () => {
    const { handleFiltersChange } = setup(SELLER_DATE_BOOL_FILTERS);
    await clearChip('chip-date');

    const next = nextFilters(handleFiltersChange);
    expect('dateFrom' in next).toBe(true);
    expect('dateTo' in next).toBe(true);
    expect(next.dateFrom).toBeUndefined();
    expect(next.dateTo).toBeUndefined();
    expect(next.sellerTypes).toEqual(['owner']);
    expect(next.newToMarket).toBe(true);
    expect(next.reraRegistered).toBe(true);
  });

  // #2750 PR-5 FC-4
  it('dismissing the new-to-market chip clears newToMarket and keeps reraRegistered (and the RERA chip clears only RERA)', async () => {
    const ntm = setup(SELLER_DATE_BOOL_FILTERS);
    await clearChip('chip-bool-ntm');
    const afterNtm = nextFilters(ntm.handleFiltersChange);
    expect('newToMarket' in afterNtm).toBe(true);
    expect(afterNtm.newToMarket).toBeUndefined();
    expect(afterNtm.reraRegistered).toBe(true);
    expect(afterNtm.sellerTypes).toEqual(['owner']);

    // Symmetric arm on a fresh render: dismissing RERA clears RERA and keeps new-to-market.
    cleanup();
    const rera = setup(SELLER_DATE_BOOL_FILTERS);
    await clearChip('chip-bool-rera');
    const afterRera = nextFilters(rera.handleFiltersChange);
    expect('reraRegistered' in afterRera).toBe(true);
    expect(afterRera.reraRegistered).toBeUndefined();
    expect(afterRera.newToMarket).toBe(true);
  });
});
