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
import { describe, it, expect, vi } from 'vitest';
import { render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
