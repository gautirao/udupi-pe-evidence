import React, { useState } from 'react';
import { screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AreaSelectedPanel } from '../AreaSelectedPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

/**
 * Issue #2555 — the four #2450 DoD items that had no durable owner, plus the owner-mock
 * parity work that shares this file's surface.
 *
 * WHY A SEPARATE SPEC. Items 1-3 are MISSING BEHAVIOUR and item 4 is MISSING COVERAGE, so the
 * arms below are written to fail at `ca4a92c9` for reasons specific to this issue. They are kept
 * out of `AreaSelectedPanel.familySubtype.test.tsx` (#2450's contract) and
 * `AreaSelectedPanel.familyResync.test.tsx` (#2552's state-ownership contract) so that a failure
 * here names #2555 rather than muddying either of those.
 *
 * ASSERT THE EMITTED FILTER OBJECT, NOT WHICH CHIP IS HIGHLIGHTED. #2552's defect had the chip
 * highlighting CORRECTLY while the query selected the wrong family — a display-only assertion
 * passes on that bug. Every behaviour arm below therefore reads `onFiltersChange`'s last call.
 *
 * THE CONTROLLED HOST IS LOAD-BEARING for items 1 and 2. `familySubtype`'s `renderPanel` passes a
 * bare `vi.fn()`, so emitted filters are observed but never APPLIED — the panel never re-renders
 * with the state it just asked for. Per-family RESTORATION is invisible to that shape by
 * construction: restoring requires the switch-away emission to round-trip back as props before the
 * switch-back is clicked. The host below commits what the panel emits, exactly as the real parent
 * does (verified in #2552's spec: every production `onFiltersChange` call site forwards by spread).
 */

/**
 * The zero-result relaxation offers are fed by a React Query hook, so in jsdom they return
 * `undefined` and the block never renders. Mocking it is the ONLY way to reach that path — the
 * same approach `AreaZeroResultRecovery.test.tsx` already uses, so this follows the established
 * convention rather than inventing a second one.
 *
 * Defaulted to `{ data: undefined }` in `beforeEach` so every other arm in this file behaves
 * exactly as it did before the mock existed; only the relaxation arm opts in. (`renderHost`
 * defaults to a NON-empty `areaListings`, so no other arm even reaches the recovery stack.)
 */
const mockUseRelaxationPreviews = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useRelaxationPreviews', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useRelaxationPreviews')>()),
  useRelaxationPreviews: (...args: unknown[]) => mockUseRelaxationPreviews(...args),
}));

beforeEach(() => {
  mockUseRelaxationPreviews.mockReturnValue({ data: undefined, isLoading: false });
});

const mockArea: AreaPoint = {
  areaKey: 'test-area|city|udupi',
  areaLabel: 'Test Area',
  geo_center_lat: 13.5,
  geo_center_lon: 74.5,
  bbox: null,
};

const mockListing: DiscoverCityListingItem = {
  id: '1',
  propertyType: 'apartment',
  title: 'Test Listing',
  locality: 'Test Area',
  pricePaise: 5000000,
  bedrooms: 2,
  bathrooms: 1,
};

type PanelProps = React.ComponentProps<typeof AreaSelectedPanel>;
type PanelFilters = NonNullable<PanelProps['filters']>;

/** #2450's approved buyer wording for the Commercial subtype row, in mock order. */
const COMMERCIAL_SUBTYPE_CHOICES = [
  { testId: 'quick-chip-subtype-all', label: 'All commercial' },
  { testId: 'quick-chip-subtype-shop', label: 'Shop' },
  { testId: 'quick-chip-subtype-office', label: 'Office' },
  { testId: 'quick-chip-subtype-building', label: 'Commercial Building' },
  { testId: 'quick-chip-subtype-warehouse', label: 'Warehouse / Godown' },
  { testId: 'quick-chip-subtype-land', label: 'Commercial Land' },
] as const;

/**
 * A parent that COMMITS what the panel emits: `filters` is state and `onFiltersChange` sets it.
 * Mirrors `AreaSelectedPanel.familyResync.test.tsx`'s host deliberately — a second, divergent
 * host would be a second model of the same parent, free to drift from it.
 */
function ControlledHost({
  initialFilters = {},
  onEmit,
  intent,
  onSearchChange,
  searchQuery,
  areaListings = [mockListing],
  isCommercialSubtypeSupported = true,
}: {
  initialFilters?: PanelFilters;
  onEmit?: (f: PanelFilters) => void;
  intent?: PanelProps['intent'];
  onSearchChange?: (q: string) => void;
  searchQuery?: string;
  areaListings?: DiscoverCityListingItem[];
  isCommercialSubtypeSupported?: boolean;
}) {
  const [filters, setFilters] = useState<PanelFilters>(initialFilters);
  const [query, setQuery] = useState(searchQuery ?? '');

  return (
    <AreaSelectedPanel
      selectedArea={mockArea}
      areaListings={areaListings}
      filters={filters}
      intent={intent}
      searchQuery={query}
      onSearchChange={(q) => {
        onSearchChange?.(q);
        setQuery(q);
      }}
      onFiltersChange={(next) => {
        onEmit?.(next);
        setFilters(next);
      }}
      isCommercialSubtypeSupported={isCommercialSubtypeSupported}
    />
  );
}

const renderHost = (props: React.ComponentProps<typeof ControlledHost> = {}) =>
  renderWithProviders(
    <DiscoverProvider>
      <AreaSetDraftProvider>
        <ControlledHost {...props} />
      </AreaSetDraftProvider>
    </DiscoverProvider>,
    { router: 'browser' },
  );

const lastEmit = (onEmit: ReturnType<typeof vi.fn>): PanelFilters =>
  onEmit.mock.calls.at(-1)?.[0] as PanelFilters;

describe('AreaSelectedPanel — #2555 DoD items', () => {
  /**
   * ITEM 1 — PER-FAMILY SUBTYPE RESTORATION.
   *
   * `familyOverride` records WHICH family is active, never WHAT was selected inside it, and
   * `handleSelectFamily` emits `commercialSubtypes: undefined` / `propertyTypes: undefined` on the
   * way out. So switching away and back restores nothing. #2450: "Restore each family's last
   * subtype selection when switching back."
   */
  describe('Item 1 — each family restores its own last selection', () => {
    it('restores the Commercial subtype selection when switching back to Commercial', () => {
      const onEmit = vi.fn();
      renderHost({ onEmit });

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      fireEvent.click(screen.getByTestId('quick-chip-subtype-shop'));
      expect(lastEmit(onEmit).commercialSubtypes ?? []).toContain('SHOP');

      // Away…
      fireEvent.click(screen.getByTestId('quick-chip-family-residential'));
      expect(lastEmit(onEmit).commercialSubtypes ?? []).toEqual([]);

      // …and back. The selection must come with it.
      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      expect(
        lastEmit(onEmit).commercialSubtypes ?? [],
        'switching back to Commercial must restore the subtype the buyer last held there',
      ).toContain('SHOP');
    });

    it('restores a MULTI-subtype Commercial selection, not just the first', () => {
      const onEmit = vi.fn();
      renderHost({ onEmit });

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      fireEvent.click(screen.getByTestId('quick-chip-subtype-shop'));
      fireEvent.click(screen.getByTestId('quick-chip-subtype-warehouse'));

      fireEvent.click(screen.getByTestId('quick-chip-family-residential'));
      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));

      const restored = lastEmit(onEmit).commercialSubtypes ?? [];
      expect(restored).toContain('SHOP');
      expect(restored).toContain('WAREHOUSE');
    });

    /** The mirror. Restoration that only works one way is half the feature. */
    it('restores the Residential type selection when switching back to Residential', () => {
      const onEmit = vi.fn();
      renderHost({ initialFilters: { propertyTypes: ['apartment'] }, onEmit });

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      expect(lastEmit(onEmit).propertyTypes ?? []).toEqual([]);

      fireEvent.click(screen.getByTestId('quick-chip-family-residential'));
      expect(
        lastEmit(onEmit).propertyTypes ?? [],
        'switching back to Residential must restore the type the buyer last held there',
      ).toContain('apartment');
    });

    /**
     * FALSIFIABILITY GUARD. Without this, an implementation that simply never cleared the other
     * family's axis would pass every arm above while reintroducing the contradictory
     * `propertyTypes:['apartment'] + commercialSubtypes:['SHOP']` state #2450 exists to remove.
     * Restoration must be MEMORY, not retention.
     */
    it('does not leave the other family\'s axis set while away from it', () => {
      const onEmit = vi.fn();
      renderHost({ initialFilters: { propertyTypes: ['apartment'] }, onEmit });

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      fireEvent.click(screen.getByTestId('quick-chip-subtype-shop'));

      const emitted = lastEmit(onEmit);
      expect(
        emitted.propertyTypes ?? [],
        'while Commercial is active the Residential axis must be silent, not merely remembered',
      ).toEqual([]);
      expect(emitted.commercialSubtypes ?? []).toContain('SHOP');
    });
  });

  /**
   * ITEM 2 — REMOVABLE SELECTED-FILTER CHIPS.
   *
   * #2450: "Use selected-filter chips that can be removed individually", repeated for mobile:
   * "selected filters can be removed." Re-clicking an active control toggles it off, which is
   * per-control toggling, not a removable chip set. `activeContextChips` is an opaque
   * caller-supplied ReactNode and cannot carry removal.
   */
  describe('Item 2 — selected filters can be removed individually', () => {
    it('removes ONE subtype and retains the others', () => {
      const onEmit = vi.fn();
      renderHost({ initialFilters: { commercialSubtypes: ['SHOP', 'OFFICE'] }, onEmit });

      const chips = screen.getByTestId('selected-filter-chips');
      fireEvent.click(within(chips).getByTestId('selected-chip-subtype-SHOP-dismiss'));

      const emitted = lastEmit(onEmit);
      expect(emitted.commercialSubtypes ?? []).not.toContain('SHOP');
      expect(
        emitted.commercialSubtypes ?? [],
        'removing one chip must not clear the whole axis — that is reset, not removal',
      ).toContain('OFFICE');
    });

    it('removes a Residential type chip individually', () => {
      const onEmit = vi.fn();
      renderHost({ initialFilters: { propertyTypes: ['apartment', 'villa'] }, onEmit });

      fireEvent.click(screen.getByTestId('selected-chip-type-apartment-dismiss'));

      const emitted = lastEmit(onEmit);
      expect(emitted.propertyTypes ?? []).not.toContain('apartment');
      expect(emitted.propertyTypes ?? []).toContain('villa');
    });

    it('removes the Budget chip without touching the subtype selection', () => {
      const onEmit = vi.fn();
      renderHost({
        initialFilters: { commercialSubtypes: ['SHOP'], priceMax: 10_000_000 },
        onEmit,
      });

      fireEvent.click(screen.getByTestId('selected-chip-budget-dismiss'));

      const emitted = lastEmit(onEmit);
      expect(emitted.priceMax).toBeUndefined();
      expect(emitted.commercialSubtypes ?? []).toContain('SHOP');
    });

    it('removes the Area chip without touching the subtype selection', () => {
      const onEmit = vi.fn();
      renderHost({
        initialFilters: { commercialSubtypes: ['SHOP'], areaMinSqft: 1000 },
        onEmit,
      });

      fireEvent.click(screen.getByTestId('selected-chip-area-dismiss'));

      const emitted = lastEmit(onEmit);
      expect(emitted.areaMinSqft).toBeUndefined();
      expect(emitted.commercialSubtypes ?? []).toContain('SHOP');
    });

    /**
     * CONTRAST ARM. Without it every arm above would also pass on a panel that rendered a chip row
     * unconditionally, including when nothing is selected — chips for filters nobody applied.
     */
    it('renders no selected-filter chip row when nothing is filtering', () => {
      renderHost({ initialFilters: {} });

      // Positive control: the panel really rendered.
      expect(screen.getByTestId('quick-chip-apartment')).toBeInTheDocument();
      expect(screen.queryByTestId('selected-filter-chips')).not.toBeInTheDocument();
    });
  });

  /**
   * ITEM 3 — PURPOSE-AWARE BUDGET.
   *
   * #2450: "Buy uses total purchase-price bands. Rent/Lease uses monthly bands with `/month`."
   * `QUICK_BUDGETS` is a fixed max-only list with no intent branch, and the file contains zero
   * occurrences of `/month`.
   *
   * #2458 IS THE PURPOSE AUTHORITY: LEASE is not persistable under `chk_listing_purpose`, so the
   * label reads "Rent / Lease" while `rent` stays the sole query value. No third purpose is
   * invented here; the intent axis is the existing `buy | rent`.
   */
  describe('Item 3 — Budget bands are purpose-aware', () => {
    it('offers monthly bands labelled /month under the rent intent', () => {
      renderHost({ intent: 'rent' });

      const budgetRow = screen.getByTestId('quick-budget-row');
      expect(budgetRow.textContent ?? '').toMatch(/\/month/);
    });

    it('offers NO /month band under the buy intent', () => {
      renderHost({ intent: 'buy' });

      const budgetRow = screen.getByTestId('quick-budget-row');
      // Positive control: the row really rendered, so the absence below is scoped.
      expect(within(budgetRow).getByTestId('quick-chip-budget-any')).toBeInTheDocument();
      expect(budgetRow.textContent ?? '').not.toMatch(/\/month/);
    });

    it('emits a monthly priceMax under rent, not the purchase-price band', () => {
      const onEmit = vi.fn();
      renderHost({ intent: 'rent', onEmit });

      const budgetRow = screen.getByTestId('quick-budget-row');
      const bands = within(budgetRow).getAllByTestId(/^quick-chip-budget-\d+$/);
      fireEvent.click(bands[0]);

      // EXACT, not a bound (review finding). `toBeLessThan(1_000_000)` passed on the commercial
      // rent bands, on any residential band under ₹10L, and on a rent table wrong in every entry —
      // it discriminated "not a purchase-price band" and nothing finer.
      expect(lastEmit(onEmit).priceMax).toBe(15_000);
    });

    /** The mock's Commercial Buy bands. Residential keeps its own — bands are per family/intent. */
    it('offers the approved Commercial Buy bands once Commercial is the active family', () => {
      renderHost({ initialFilters: { commercialSubtypes: ['SHOP'] }, intent: 'buy' });

      const budgetRow = screen.getByTestId('quick-budget-row');
      expect(within(budgetRow).getByTestId('quick-chip-budget-10000000')).toHaveTextContent(
        '≤ ₹1 Cr',
      );
      expect(within(budgetRow).getByTestId('quick-chip-budget-25000000')).toHaveTextContent(
        '≤ ₹2.5 Cr',
      );
      expect(within(budgetRow).getByTestId('quick-chip-budget-50000000')).toHaveTextContent(
        '≤ ₹5 Cr',
      );
    });

    it('keeps the Residential Buy bands unchanged, labels included', () => {
      renderHost({ initialFilters: { propertyTypes: ['apartment'] }, intent: 'buy' });

      // All THREE bands, and their exact labels (review finding): asserting only that two testids
      // exist would pass on a table whose wording had drifted, which is half of what "#2023's
      // approved bands are unchanged" is supposed to mean.
      const budgetRow = screen.getByTestId('quick-budget-row');
      expect(within(budgetRow).getByTestId('quick-chip-budget-5000000').textContent?.trim()).toBe(
        '≤ ₹50L',
      );
      expect(within(budgetRow).getByTestId('quick-chip-budget-8000000').textContent?.trim()).toBe(
        '≤ ₹80L',
      );
      expect(within(budgetRow).getByTestId('quick-chip-budget-12000000').textContent?.trim()).toBe(
        '≤ ₹1.2Cr',
      );
    });

    /** #2450: "Switching subtype must not discard a compatible Budget selection." */
    it('retains a Budget selection across a subtype change within Commercial', () => {
      const onEmit = vi.fn();
      renderHost({
        initialFilters: { commercialSubtypes: ['SHOP'], priceMax: 25_000_000 },
        onEmit,
      });

      fireEvent.click(screen.getByTestId('quick-chip-subtype-warehouse'));

      expect(lastEmit(onEmit).priceMax).toBe(25_000_000);
    });
  });

  /**
   * ITEM 4 — SEARCH INPUT REMAINS INTERACTIVE.
   *
   * A TEST gap, not a defect: the input is live and untouched by this work. Satisfying the item
   * means adding the arm, not changing the panel. Asserted across BOTH a family change and a
   * subtype change, because #2450 lists them as separate preservation requirements.
   */
  describe('Item 4 — the search input survives family and subtype changes', () => {
    it('stays mounted, keeps its value and still fires across a family change', () => {
      const onSearchChange = vi.fn();
      renderHost({ onSearchChange });

      fireEvent.change(screen.getByTestId('area-search-input'), {
        target: { value: 'manipal' },
      });
      expect(screen.getByTestId('area-search-input')).toHaveValue('manipal');

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));

      const afterSwitch = screen.getByTestId('area-search-input');
      expect(afterSwitch).toBeInTheDocument();
      expect(afterSwitch).toBeEnabled();
      expect(afterSwitch, 'a family switch must preserve the search input').toHaveValue('manipal');

      onSearchChange.mockClear();
      fireEvent.change(afterSwitch, { target: { value: 'manipal road' } });
      expect(onSearchChange).toHaveBeenCalledWith('manipal road');
    });

    it('stays interactive across a subtype change', () => {
      const onSearchChange = vi.fn();
      renderHost({ initialFilters: { commercialSubtypes: ['SHOP'] }, onSearchChange });

      fireEvent.change(screen.getByTestId('area-search-input'), { target: { value: 'udupi' } });
      fireEvent.click(screen.getByTestId('quick-chip-subtype-warehouse'));

      const input = screen.getByTestId('area-search-input');
      expect(input).toHaveValue('udupi');
      onSearchChange.mockClear();
      fireEvent.change(input, { target: { value: 'udupi west' } });
      expect(onSearchChange).toHaveBeenCalledWith('udupi west');
    });
  });

  /**
   * OWNER-MOCK PARITY — the structural half, asserted here because an independent visual verifier
   * cannot catch a label that is right on screen but wrong in the emitted query.
   */
  describe('Owner mock parity — structure and exact labels', () => {
    /**
     * LABEL EQUALITY, not substring. `familySubtype`'s arm uses `toHaveTextContent`, which matches
     * a SUBSTRING: it catches `Warehouse / Godown` -> `Warehouse/Godown` (text altered) but NOT
     * `Warehouse / Godown` -> `Warehouse / Godown (Large)` (text appended). #2450 requires the
     * exact approved wording, so equality is what pins it.
     */
    it('renders the six Commercial subtype labels EXACTLY', () => {
      renderHost({ initialFilters: { commercialSubtypes: ['SHOP'] } });

      const row = screen.getByTestId('quick-subtype-row');
      for (const choice of COMMERCIAL_SUBTYPE_CHOICES) {
        expect(within(row).getByTestId(choice.testId).textContent?.trim()).toBe(choice.label);
      }
    });

    it('renders the approved AREA (SQ FT) presets while Commercial is active', () => {
      renderHost({ initialFilters: { commercialSubtypes: ['SHOP'] } });

      const row = screen.getByTestId('quick-area-row');
      expect(within(row).getByTestId('quick-chip-area-any').textContent?.trim()).toBe('Any size');
      expect(within(row).getByTestId('quick-chip-area-1000').textContent?.trim()).toBe(
        '1,000+ sq ft',
      );
      expect(within(row).getByTestId('quick-chip-area-2500').textContent?.trim()).toBe(
        '2,500+ sq ft',
      );
      expect(within(row).getByTestId('quick-chip-area-5000').textContent?.trim()).toBe(
        '5,000+ sq ft',
      );
    });

    /**
     * ISSUE #2459 D1 — "per-row truthful primary area, meaning DISCLOSED in label and chip …
     * Disclosure is NOT optional." A RULED acceptance criterion, and it was UNMET on this panel.
     *
     * The row took `.label` off the shared resolver and discarded `disclosure`, so the DEFAULT
     * state — no property-type narrowing, every shape in play — rendered the deliberately
     * non-committal "AREA (SQ FT)" while comparing built-up area on homes and plot size on plots,
     * and said so nowhere. The chip was worse: a bare "1,000+ sq ft", naming no quantity at all.
     * A filter can be perfectly correct in its predicate and still dishonest in what it claims to
     * be measuring, which is the whole reason D1 exists.
     *
     * BOTH HALVES ARE PINNED, AND SO IS THE NEGATIVE. A disclosure rendered unconditionally would
     * satisfy any presence-only assertion while being wrong: where exactly ONE meaning is in play
     * the label IS the disclosure, and the module deliberately returns null rather than emit a
     * redundant sentence. So each arm carries its single-meaning contrast — without them these
     * would pass against a panel that simply always printed a sentence.
     */
    it('discloses WHICH area is compared when the selection spans more than one meaning', () => {
      renderHost({ initialFilters: { propertyTypes: ['apartment', 'residential_plot'] } });

      // The row label is broad by design…
      expect(screen.getByTestId('quick-area-row').textContent ?? '').toContain('AREA (SQ FT)');
      // …so the sentence naming each quantity and what it is measured ON is mandatory.
      expect(screen.getByTestId('quick-area-disclosure')).toHaveTextContent(
        'Compares built-up area for homes; plot size for plots.',
      );
    });

    it('renders NO disclosure when one meaning is in play — the label already names it', () => {
      renderHost({ initialFilters: { propertyTypes: ['apartment'] } });

      // POSITIVE CONTROL FIRST: the row rendered AND names the specific quantity, so the absence
      // below is scoped rather than vacuous — it cannot pass against a panel that failed to mount.
      expect(screen.getByTestId('quick-area-row').textContent ?? '').toContain(
        'BUILT-UP AREA (SQ FT)',
      );
      expect(screen.queryByTestId('quick-area-disclosure')).not.toBeInTheDocument();
    });

    it('carries the area MEANING on the selected chip, not a bare range', () => {
      renderHost({ initialFilters: { propertyTypes: ['apartment'], areaMinSqft: 1000 } });

      const chip = screen.getByTestId('selected-chip-area');
      // The quantity leads the value: "1,000+ sq ft" on its own never says what was measured.
      expect(chip).toHaveTextContent('Built-up area');
      expect(chip).toHaveTextContent('1,000+ sq ft');
    });

    it('carries the disclosure on the chip too when the selection is mixed', () => {
      renderHost({
        initialFilters: { propertyTypes: ['apartment', 'residential_plot'], areaMinSqft: 1000 },
      });

      const chip = screen.getByTestId('selected-chip-area');
      expect(chip).toHaveTextContent('1,000+ sq ft');
      expect(chip).toHaveTextContent('Compares built-up area for homes; plot size for plots.');
    });

    /**
     * THE AREA CONTROL MUST BE LIVE, NOT DESIGN-ONLY. #2450: "Never ship an inert design-only Area
     * chip." It must ride #2459's real `areaMinSqft` contract — the same key `AreaRangeFilter`
     * writes and the URL/predicate layer consumes.
     */
    it('emits the real #2459 areaMinSqft contract, not an inert control', () => {
      const onEmit = vi.fn();
      renderHost({ initialFilters: { commercialSubtypes: ['SHOP'] }, onEmit });

      fireEvent.click(screen.getByTestId('quick-chip-area-1000'));
      expect(lastEmit(onEmit).areaMinSqft).toBe(1000);

      fireEvent.click(screen.getByTestId('quick-chip-area-any'));
      expect(lastEmit(onEmit).areaMinSqft).toBeUndefined();
    });

    /**
     * #2459 AC2, second sentence: "Commercial never shows or submits Bedrooms." The submit half is
     * owned by `bedroomApplicability.ts`, which states in terms that VISIBILITY is #2450's
     * question — this is that half. The mock's Commercial panel has no Bedrooms row.
     */
    it('hides the Bedrooms row while Commercial is the active family', () => {
      renderHost({ initialFilters: { commercialSubtypes: ['SHOP'] } });

      // Positive control: the Commercial half really rendered.
      expect(screen.getByTestId('quick-subtype-row')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-bedrooms-row')).not.toBeInTheDocument();
      expect(screen.queryByTestId('quick-chip-2-bhk')).not.toBeInTheDocument();
    });

    it('shows the Bedrooms row while Residential is the active family', () => {
      renderHost({ initialFilters: { propertyTypes: ['apartment'] } });

      expect(screen.getByTestId('quick-bedrooms-row')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-2-bhk')).toBeInTheDocument();
    });

    /** #2450 copy rule: "Prefer `Ready to occupy` in Commercial contexts." */
    it('labels the possession chip "Ready to occupy" in Commercial', () => {
      renderHost({ initialFilters: { commercialSubtypes: ['SHOP'] } });
      expect(screen.getByTestId('quick-chip-ready-to-move').textContent?.trim()).toBe(
        'Ready to occupy',
      );
    });

    it('keeps "Ready to move" in Residential', () => {
      renderHost({ initialFilters: { propertyTypes: ['apartment'] } });
      expect(screen.getByTestId('quick-chip-ready-to-move').textContent?.trim()).toBe(
        'Ready to move',
      );
    });
  });

  /**
   * EXACT-HEAD REVIEW FINDINGS on PR #2585.
   *
   * SIX of the seven arms below failed at 4d267f9f, verified by reverting the panel alone. The
   * seventh — "does not add /month to an off-band Buy ceiling" — passes in BOTH states by design:
   * it is the contrast arm against the fix over-applying `/month` unconditionally, so it would go
   * red on a naive fix rather than on the original defect. An earlier revision of this docstring
   * claimed "each arm below failed", which was false for that one; corrected here rather than left
   * for the next reader to audit.
   *
   * These are kept as their own block rather than folded into the item sections above, so that a
   * future regression names the defect that was actually found rather than the feature generally.
   */
  describe('Review findings — implicit clears, removal paths, and hidden axes', () => {
    /**
     * FINDING 1. The recording effect banks only NON-EMPTY selections, and the toggle handlers did
     * not invalidate the memory — so deselecting the LAST chip left the memory holding the very
     * selection the buyer had just removed, and the next family round trip resurrected it.
     *
     * A wrong-NARROWING bug: the buyer gets a query they explicitly cleared. The panel's own
     * comment claimed explicit clears were honoured, and toggling the last chip off is one.
     */
    it('does not resurrect a type selection the buyer toggled off', () => {
      const onEmit = vi.fn();
      renderHost({ onEmit });

      fireEvent.click(screen.getByTestId('quick-chip-apartment'));
      fireEvent.click(screen.getByTestId('quick-chip-apartment')); // deselect the only type
      // `toBeUndefined`, not `toEqual([])` (review finding): this file treats the two as
      // materially different — `withoutCommercialFamilyTokens` documents `[]` as "a narrowing to
      // zero types" — so the loose form would pass on an emission this panel considers wrong.
      expect(lastEmit(onEmit).propertyTypes).toBeUndefined();

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      fireEvent.click(screen.getByTestId('quick-chip-family-residential'));

      expect(
        lastEmit(onEmit).propertyTypes,
        'a type the buyer deselected must not return on the next family switch',
      ).toBeUndefined();
    });

    /** The mirror, on the subtype axis. */
    it('does not resurrect a subtype selection the buyer toggled off', () => {
      const onEmit = vi.fn();
      renderHost({ onEmit });

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      fireEvent.click(screen.getByTestId('quick-chip-subtype-shop'));
      fireEvent.click(screen.getByTestId('quick-chip-subtype-shop')); // deselect the only subtype
      expect(lastEmit(onEmit).commercialSubtypes).toBeUndefined();

      fireEvent.click(screen.getByTestId('quick-chip-family-residential'));
      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));

      expect(lastEmit(onEmit).commercialSubtypes).toBeUndefined();
    });

    /**
     * FINDING 2 — #2552's defect class, reintroduced through the new removal path.
     *
     * The canonical restored-link shape: `?subtype=SHOP` carries the subtype ALONE, so the family
     * is DERIVED and `familyOverride` is still null. Dismissing the chip empties the only evidence
     * of the family; without recording intent the filters fall silent and the buyer is dropped
     * into Residential, closing the subtype row under them. The existing familyResync arms pin
     * this for "All commercial" and stayed green while the removal path routed around them.
     */
    it('keeps the family on Commercial when the last subtype chip is dismissed', () => {
      renderHost({ initialFilters: { commercialSubtypes: ['SHOP'] } });

      // Derived, not clicked — no family chip has been pressed.
      expect(screen.getByTestId('quick-subtype-row')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('selected-chip-subtype-SHOP-dismiss'));

      expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(
        screen.queryByTestId('quick-subtype-row'),
        'dismissing a chip must not close the row the buyer is working in',
      ).toBeInTheDocument();
    });

    /**
     * FINDING 4, SUPERSEDED — one test became two, and the reason is recorded rather than tidied.
     *
     * This slot held `offers a removable Bedrooms chip even while the Bedrooms row is hidden`,
     * which rendered `{ commercialSubtypes: ['SHOP'], bedrooms: [3] }` and asserted the chip was
     * present and removable. It was CORRECT WHEN WRITTEN: `shouldSubmitBedrooms` still returned
     * true for the one-axis Commercial shape, so `beds=3` genuinely reached the request and the
     * shared link, and surfacing a live narrowing was the honest choice.
     *
     * `isCommercialOnlySelection` has since gained an empty-`propertyTypes` branch, so that fixture
     * is now SUPPRESSED at every boundary that consults the predicate. The old assertion would
     * therefore pin a chip reporting a narrowing the wire does not carry — the inverse of what it
     * was written to protect.
     *
     * IT IS NOT REPLACED BY A SINGLE INVERTED ASSERTION. "The chip is absent" would also pass if
     * the chip row stopped rendering entirely, or if the panel failed to mount — the assertion
     * would survive the feature's deletion, which makes it no evidence at all. The contract is
     * instead pinned from BOTH sides, across the exact gap the production comment claims:
     * `showBedroomsRow` answers whether the CONTROL is visible, the chip answers whether the VALUE
     * is submitted, and those are different questions. Where they diverge the chip must render;
     * where they agree nothing is sent, it must not.
     */
    it('renders the Bedrooms chip where the row is hidden but the value is STILL submitted', () => {
      const onEmit = vi.fn();
      // The divergent shape, and the only one that produces it: `apartment` is Residential, so the
      // selection is not commercial-ONLY and `shouldSubmitBedrooms` stays true — while the subtype
      // alone makes `commercialFromFilters` true, which hides the Bedrooms ROW. Row hidden, value
      // live: precisely the case the chip exists to cover.
      renderHost({
        initialFilters: {
          propertyTypes: ['apartment'],
          commercialSubtypes: ['SHOP'],
          bedrooms: [3],
        },
        onEmit,
      });

      expect(screen.queryByTestId('quick-bedrooms-row')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('selected-chip-bedrooms-3-dismiss'));

      expect(lastEmit(onEmit).bedrooms).toBeUndefined();
      expect(lastEmit(onEmit).commercialSubtypes ?? []).toContain('SHOP');
    });

    it('renders NO Bedrooms chip for a one-axis Commercial selection, whose bedrooms are suppressed', () => {
      renderHost({ initialFilters: { commercialSubtypes: ['SHOP'], bedrooms: [3] } });

      // POSITIVE CONTROL FIRST, so the absence below is scoped rather than vacuous — it proves the
      // panel mounted AND the chip row rendered AND that row is populated. Without it the two
      // negative assertions would pass just as happily against a panel that threw on render.
      expect(screen.getByTestId('selected-filter-chips')).toBeInTheDocument();
      expect(screen.getByTestId('selected-chip-subtype-SHOP')).toBeInTheDocument();

      expect(screen.queryByTestId('quick-bedrooms-row')).not.toBeInTheDocument();
      expect(screen.queryByTestId('selected-chip-bedrooms-3')).not.toBeInTheDocument();
    });

    /**
     * FINDING 5. The chip row must not hand the capability-OFF surface a working commercial
     * subtype control. Both halves are pinned: the chip is absent, and a positive control proves
     * the panel and its chip row really rendered, so the absence is scoped rather than vacuous.
     */
    it('renders no Commercial subtype chip while the capability is off', () => {
      renderHost({
        isCommercialSubtypeSupported: false,
        initialFilters: { commercialSubtypes: ['SHOP'], propertyTypes: ['apartment'] },
      });

      expect(screen.getByTestId('quick-chip-apartment')).toBeInTheDocument();
      expect(screen.getByTestId('selected-chip-type-apartment')).toBeInTheDocument();
      expect(screen.queryByTestId('selected-chip-subtype-SHOP')).not.toBeInTheDocument();
    });

    /**
     * THE NON-DESTRUCTIVE HALF of the exact-head reviewer's acceptance for the bedroom blocker,
     * which has TWO halves and whose second is easy to miss. Subtype-only Commercial must omit
     * bedrooms at the request boundary — and switching back to Residential must "preserve and reuse
     * the stored bedroom preference without destructive clearing".
     *
     * Those are not the same property, and every suppression assertion in this file would be
     * satisfied by a fix that simply CLEARED bedrooms on the way into Commercial: the value would
     * not be submitted, the chip would not render, the row would be hidden — and the buyer's
     * selection would be silently gone. Hiding a control is not discarding its value. This arm is
     * the one that can tell those two apart.
     */
    it('preserves the bedroom preference across a Commercial round trip and re-applies it on return', () => {
      const onEmit = vi.fn();
      renderHost({ initialFilters: { propertyTypes: ['apartment'], bedrooms: [3] }, onEmit });

      // Residential: the row is visible and 3 BHK is pressed.
      expect(screen.getByTestId('quick-bedrooms-row')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-3-bhk')).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));

      // Commercial: the row is hidden…
      expect(screen.queryByTestId('quick-bedrooms-row')).not.toBeInTheDocument();
      // …but the VALUE is retained, not cleared.
      expect(lastEmit(onEmit).bedrooms ?? []).toContain(3);

      fireEvent.click(screen.getByTestId('quick-chip-family-residential'));

      // Back on Residential the control returns with the preference still applied.
      expect(screen.getByTestId('quick-bedrooms-row')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-3-bhk')).toHaveAttribute('aria-pressed', 'true');
      expect(lastEmit(onEmit).bedrooms ?? []).toContain(3);
    });

    /**
     * ITEM 6 — PER-FAMILY BUDGET INDEPENDENCE, pinned so a future globalising change fails LOUDLY.
     *
     * #2450: "Budget state is independent per family/intent." The owner mock shows the COMMERCIAL
     * Buy row (≤ ₹1 Cr / ≤ ₹2.5 Cr / ≤ ₹5 Cr), and the obvious way to satisfy a mock-parity check
     * is to replace the single `QUICK_BUDGETS` list wholesale. That would silently retire #2023's
     * approved Residential bands while every parity assertion still passed — the change would look
     * correct from the only angle anyone was checking. This arm exists to make that swap fail.
     *
     * BOTH DIRECTIONS ARE ASSERTED, because presence alone is not enough: a table that returned the
     * UNION of both families' bands would satisfy every positive assertion here while destroying
     * exactly the independence the issue is about. So each family's ceilings must be present AND
     * the other family's must be absent — at the SAME intent, so the only variable under test is
     * family. (Intent is left at its default `buy` in both halves for that reason.)
     */
    it('keeps Residential Buy bands and Commercial Buy bands independent at the same intent', () => {
      const { unmount } = renderHost({ initialFilters: {} });

      // No filters set → Residential is the derived family.
      expect(screen.getByTestId('quick-chip-budget-5000000')).toHaveTextContent('≤ ₹50L');
      expect(screen.getByTestId('quick-chip-budget-8000000')).toHaveTextContent('≤ ₹80L');
      expect(screen.getByTestId('quick-chip-budget-12000000')).toHaveTextContent('≤ ₹1.2Cr');
      // The Commercial ceilings must not be on offer here.
      expect(screen.queryByTestId('quick-chip-budget-25000000')).not.toBeInTheDocument();
      expect(screen.queryByTestId('quick-chip-budget-50000000')).not.toBeInTheDocument();

      unmount();

      // A derived-Commercial selection — same intent, only the family differs.
      renderHost({ initialFilters: { commercialSubtypes: ['SHOP'] } });

      expect(screen.getByTestId('quick-chip-budget-10000000')).toHaveTextContent('≤ ₹1 Cr');
      expect(screen.getByTestId('quick-chip-budget-25000000')).toHaveTextContent('≤ ₹2.5 Cr');
      expect(screen.getByTestId('quick-chip-budget-50000000')).toHaveTextContent('≤ ₹5 Cr');
      // …and the Residential ceilings are GONE, not merely joined by the Commercial ones.
      expect(screen.queryByTestId('quick-chip-budget-5000000')).not.toBeInTheDocument();
      expect(screen.queryByTestId('quick-chip-budget-8000000')).not.toBeInTheDocument();
      expect(screen.queryByTestId('quick-chip-budget-12000000')).not.toBeInTheDocument();
    });

    /**
     * FINDING 6. Every rent BAND label carries `/month`; the chip's fallback label — used when a
     * URL supplies a priceMax matching no band — did not. A rent ceiling then read as a purchase
     * price, in the one panel whose item-3 premise is that the two are different quantities.
     */
    it('keeps /month on the Budget chip for an off-band rent ceiling', () => {
      renderHost({ intent: 'rent', initialFilters: { priceMax: 40_000 } });

      expect(screen.getByTestId('selected-chip-budget').textContent ?? '').toMatch(/\/month/);
    });

    /** CONTRAST ARM: the same off-band path under Buy must NOT acquire a monthly suffix. */
    it('does not add /month to an off-band Buy ceiling', () => {
      renderHost({ intent: 'buy', initialFilters: { priceMax: 7_500_000 } });

      const chip = screen.getByTestId('selected-chip-budget');
      expect(chip).toBeInTheDocument();
      expect(chip.textContent ?? '').not.toMatch(/\/month/);
    });

    /**
     * RE-REVIEW FINDING — the memory class through its FIFTH door.
     *
     * `AreaZeroResultRecovery`'s "Include every property type" offer emits
     * `propertyTypes: undefined` through `onApplyFilters`, bypassing every family control. It is a
     * deliberate clear by the buyer, so it must not be resurrected on the next family switch — the
     * same contract as the toggle-off arms above, reached by a path none of them touches.
     */
    it('does not resurrect a type selection cleared by a zero-result relaxation', () => {
      // THE RELAXATION OFFER, not "Clear filters". An earlier revision of this arm clicked
      // `area-zero-recovery-clear-filters`, which routes to `handleClearPropertyFilters` — a path
      // that already invalidated the memory BEFORE this fix. It would therefore have passed in
      // both states and proved nothing about the finding it names. `onApplyFilters` is the
      // distinct path that bypasses every family control, and this reaches it.
      mockUseRelaxationPreviews.mockReturnValue({
        data: {
          scopeKind: 'AREA_SET',
          previews: [{ kind: 'PROPERTY_TYPES', resultingCount: 12, propertyTypes: [] }],
        },
        isLoading: false,
      });

      const onEmit = vi.fn();
      renderHost({
        initialFilters: { propertyTypes: ['apartment'] },
        areaListings: [],
        onEmit,
      });

      // Positive control: the relaxation block really rendered, so the click below is real.
      expect(screen.getByTestId('area-zero-recovery-relaxations')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('area-zero-recovery-relaxation-PROPERTY_TYPES'));
      expect(lastEmit(onEmit).propertyTypes).toBeUndefined();

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      fireEvent.click(screen.getByTestId('quick-chip-family-residential'));

      expect(
        lastEmit(onEmit).propertyTypes,
        'a selection cleared through the relaxation path must not return on a family switch',
      ).toBeUndefined();
    });

    /**
     * RE-REVIEW FINDING — `handleSelectArea` now forwards `applyAreaBound`'s return value directly,
     * relying on it spreading the whole filter object. That reliance is real but UNDECLARED: the
     * function's signature says it returns `AreaBounds`, a two-key type. A future edit constructing
     * a fresh `AreaBounds` would type-check and silently drop every other active filter on an area
     * click. This arm is what makes the reliance explicit.
     */
    it('preserves every other filter when an AREA preset is clicked', () => {
      const onEmit = vi.fn();
      renderHost({
        initialFilters: { commercialSubtypes: ['SHOP'], priceMax: 25_000_000, bedrooms: [3] },
        onEmit,
      });

      fireEvent.click(screen.getByTestId('quick-chip-area-1000'));

      const emitted = lastEmit(onEmit);
      expect(emitted.areaMinSqft).toBe(1000);
      expect(emitted.commercialSubtypes ?? []).toContain('SHOP');
      expect(emitted.priceMax).toBe(25_000_000);
      expect(emitted.bedrooms ?? []).toContain(3);
    });

    /**
     * FIFTH-CYCLE FINDING — the AREA axis was added to the card without being registered in the
     * panel's two axis-WIDE readers, so the panel lied about why the list was empty.
     *
     * `hasPropertyFilters` enumerates its keys explicitly and never gained the area bounds, so an
     * area-only narrowing read as "no filters active". The zero-result state then asserted, as a
     * fact about the marketplace, that this is "a real area with nothing listed today, not a
     * filtered-out result" — while the buyer's own one-click filter was what filtered it out — and
     * `onClearFilters` resolved to `undefined`, withdrawing the escape hatch.
     *
     * The omission predates this issue (an area bound could already arrive by URL or from the
     * filters sheet). What this issue changed is REACHABILITY: the AREA presets are ungated and
     * render on the default surface, so it went from a hand-edited URL to one click on the card.
     */
    it('treats an area-only narrowing as an active filter in the zero-result state', () => {
      renderHost({ initialFilters: { areaMinSqft: 5000 }, areaListings: [] });

      // Positive control: the zero-result recovery really rendered, so the assertion is scoped.
      expect(screen.getByTestId('area-zero-recovery-heading')).toBeVisible();
      expect(
        screen.getByTestId('area-zero-recovery-clear-filters'),
        'an area bound is a real narrowing, so the clear affordance must be offered',
      ).toBeInTheDocument();
    });

    /**
     * The second half, and it is required rather than optional: offering "Clear filters" while
     * `handleClearPropertyFilters` does not enumerate the area keys would ship a clear affordance
     * that does not clear — the exact defect this file's own comment calls out for
     * `commercialSubtypes`. `handleRemoveArea` already clears both bounds; only the family-wide
     * reset was missing them.
     */
    it('actually clears the area bounds from the family-wide reset', () => {
      const onEmit = vi.fn();
      renderHost({
        initialFilters: { areaMinSqft: 5000, areaMaxSqft: 9000 },
        areaListings: [],
        onEmit,
      });

      fireEvent.click(screen.getByTestId('area-zero-recovery-clear-filters'));

      const emitted = lastEmit(onEmit);
      expect(emitted.areaMinSqft).toBeUndefined();
      expect(emitted.areaMaxSqft).toBeUndefined();
    });

    /**
     * FOURTH-CYCLE FINDING — the memory class through the RELAXATION wrapper, a door this PR
     * itself opened.
     *
     * `applyRelaxationPreview` spreads `filters` and overwrites ONE key, so `propertyTypes` passes
     * through untouched on the PRICE_MAX / READY_TO_MOVE / BEDROOMS branches. The wrapper then
     * banked `next.propertyTypes` unfiltered, so a Commercial family token landed in the
     * RESIDENTIAL memory and the next Residential click restored it — the buyer asks for
     * Residential and stays in Commercial, the same symptom at the same read site as the two
     * earlier instances.
     *
     * This arm is deliberately NOT about the wrapper. The fix strips on the READ side in
     * `handleSelectFamily`, which is complete regardless of what any writer banks, so this arm
     * stays green no matter which future site forgets to filter.
     */
    it('does not restore a Commercial token banked by a zero-result relaxation', () => {
      mockUseRelaxationPreviews.mockReturnValue({
        data: {
          scopeKind: 'AREA_SET',
          // A NON-PROPERTY_TYPES offer, precisely because those branches leave `propertyTypes`
          // untouched — that pass-through is what let the commercial token through.
          previews: [{ kind: 'BEDROOMS', resultingCount: 9, bedrooms: [] }],
        },
        isLoading: false,
      });

      const onEmit = vi.fn();
      renderHost({
        initialFilters: { propertyTypes: ['warehouse'], bedrooms: [3] },
        areaListings: [],
        onEmit,
      });

      // Positive control: the relaxation block really rendered.
      expect(screen.getByTestId('area-zero-recovery-relaxations')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('area-zero-recovery-relaxation-BEDROOMS'));

      fireEvent.click(screen.getByTestId('quick-chip-family-residential'));

      expect(
        lastEmit(onEmit).propertyTypes,
        'a Commercial token banked through the relaxation path must not survive into Residential',
      ).toBeUndefined();
    });

    /**
     * THIRD-CYCLE FINDING — the memory class again, on the line BENEATH the one just fixed.
     *
     * `handleRemovePropertyType` was made token-aware for `setFamilyOverride` but kept banking the
     * whole surviving selection into the RESIDENTIAL memory. A mixed `?type=warehouse,apartment`
     * (reachable — the `type` param is parsed with no allowlist) then banks `['warehouse']` as the
     * Residential memory, and the next click on Residential restores it: the buyer asks for
     * Residential and stays in Commercial, over a Commercial predicate, with no visible reason.
     *
     * The recording effect cannot cause this — `activeFamily === 'residential'` already implies no
     * commercial token is present — so this handler is the only door, which is exactly why making
     * the effect unconditional did not cover it.
     */
    it('does not bank a Commercial family token into the Residential memory', () => {
      const onEmit = vi.fn();
      renderHost({ initialFilters: { propertyTypes: ['warehouse', 'apartment'] }, onEmit });

      fireEvent.click(screen.getByTestId('selected-chip-type-apartment-dismiss'));
      fireEvent.click(screen.getByTestId('quick-chip-family-residential'));

      expect(
        lastEmit(onEmit).propertyTypes,
        'switching to Residential must not restore a Commercial family token from the memory',
      ).toBeUndefined();
      expect(screen.getByTestId('quick-chip-family-residential')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    /**
     * RE-REVIEW FINDING — F2's class on the neighbouring axis. An inbound Commercial FAMILY token
     * renders a TYPE chip, and dismissing it must not drop the buyer out of Commercial.
     */
    it('keeps the family on Commercial when a Commercial family-token chip is dismissed', () => {
      renderHost({ initialFilters: { propertyTypes: ['warehouse'] } });

      expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      fireEvent.click(screen.getByTestId('selected-chip-type-warehouse-dismiss'));

      expect(
        screen.getByTestId('quick-chip-family-commercial'),
        'dismissing a Commercial family token must not land the buyer in Residential',
      ).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
