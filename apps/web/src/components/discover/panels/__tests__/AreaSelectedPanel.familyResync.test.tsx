import React, { useState } from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AreaSelectedPanel } from '../AreaSelectedPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { toAreaSelectedPanelContract, type AreaSelectedPanelFlatTestProps } from './areaSelectedPanelTestAdapter';

/**
 * Issue #2552 — the family control must never disagree with the predicate.
 *
 * WHY THIS IS A WRONG-RESULTS BUG AND NOT A STALE-DISPLAY ONE, which is the whole reason these
 * arms assert emitted filters rather than chip highlighting.
 *
 * `AreaSelectedPanel` holds `familyOverride` so that the FIRST Commercial click can open the
 * subtype row before any subtype exists to derive the family from. The defect is that the
 * override then wins over the derivation PERMANENTLY, for the life of the mount, with nothing
 * clearing it when `filters` change underneath. Two consequences, and only the second is visual:
 *
 *   1. Switching to Residential cleared `commercialSubtypes` but left inbound Commercial
 *      `propertyTypes` tokens in the emitted object. The panel then said Residential while the
 *      query still selected Commercial rows. A test that asserted only which chip is highlighted
 *      CANNOT catch this — the chip was right and the results were wrong.
 *   2. Browser Back/Forward, or any restored URL, left `activeFamily` pinned to the stale click.
 *
 * #2528 is a RELATED BUT DIFFERENT disease and is deliberately not addressed here: its predicate
 * derives from URL state at the consumption boundary, so it is display-only. `familyOverride`
 * diverges the predicate as well, which is what makes this one a correctness bug.
 *
 * THE CONTROLLED HOST BELOW IS LOAD-BEARING, not convenience. The existing
 * `AreaSelectedPanel.familySubtype.test.tsx` arms pass a bare `vi.fn()` as `onFiltersChange`, so
 * emitted filters are observed but never APPLIED — the panel never re-renders with the state it
 * just asked for, and a stale-override bug is invisible to that shape. Here the host holds
 * `filters` in state exactly as the real parent does, so every emission round-trips and the
 * override meets the derivation.
 */

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

type PanelFilters = NonNullable<AreaSelectedPanelFlatTestProps['filters']>;

/**
 * Stored `property_type` tokens that mean "Commercial family", mirroring the panel's own
 * `COMMERCIAL_FAMILY_TOKENS` (itself a mirror of the server's
 * `DiscoverFilterNormalizer.BUYER_SUBTYPE_TO_PROPERTY_TYPE` value set).
 *
 * Declared locally rather than imported because the panel does not export it — the same choice
 * the existing `familySubtype` spec makes with its `FAMILY_TOKENS`.
 */
const COMMERCIAL_FAMILY_TOKENS = [
  'commercial',
  'commercial_building',
  'warehouse',
  'commercial_land',
] as const;

/**
 * A parent that commits what the panel emits: `filters` is STATE, and `onFiltersChange` sets it.
 *
 * `externalFilters` + the `simulate-url-change` button stand in for browser Back/Forward or a
 * restored link — a filters change this panel did NOT emit. That is the exact input the override
 * has to yield to, and there is no other way to produce it from inside the panel.
 *
 * THE ORIGINAL CLAIM HERE WAS TRUE, AND IS RESTORED. This host commits what the panel emits, and so
 * does production — so it models the real parent accurately, for `commercialSubtypes` as much as for
 * `propertyTypes`. The retraction below is kept rather than deleted because the FALSE version
 * shipped, in this comment and in a PR body as an enablement blocker, and in a file whose convention
 * is that corrections are recorded, a confidently-wrong recorded correction is the worst state of
 * the three.
 *
 * An earlier revision replaced that true sentence with a false one on review's authority: that every
 * production commit path projects an explicit FIVE-KEY whitelist (`propertyTypes`, `bedrooms`,
 * `priceMin`, `priceMax`, `readyToMove`) dropping `commercialSubtypes` in both directions. **False at
 * this head, and I relayed it without checking.** Verified since:
 *
 *   (Cited BY SYMBOL, not by line. Bare line numbers drift, and that is not a hypothetical concern
 *   here — line-precise citation is exactly what let two-day-old source read as current.)
 *
 *   - `selectors/effectiveDiscoverContext.ts::toCommittedUrlFilters` SPREAD-forwards the panel's
 *     emission, excluding only `dateFrom`/`dateTo` — the two keys whose REPRESENTATION differs
 *     between the shapes. There is no allowlist.
 *   - `selectors/effectiveDiscoverContext.ts::resolveEffectiveAreaLeafFilters` projects
 *     `commercialSubtypes` on BOTH its committed and its nav-fallback branch.
 *   - All three `onFiltersChange` call sites forward by spread: the two in
 *     `views/DiscoverAreasJourneyPanel.tsx` (the school-flow surface and `AreaLeafListingsSurface`)
 *     and the one in `views/NodeListingsSurface.tsx` — each either
 *     `onCommittedFiltersChange({ ...committedFilters, ...next })` or
 *     `setFiltersCommitted(toCommittedUrlFilters(nav.filters, next))`.
 *
 * Pinned green here by `commitAllowlist.2553.test.tsx` and `effectiveDiscoverContext.test.ts` (18).
 *
 * ROOT CAUSE — A STALE INDEX, NOT A MISREAD COMMENT. My own first reconstruction (that the doc
 * comment at `effectiveDiscoverContext.ts:27-33`, which describes the allowlist Issue #2553 removed,
 * had been read as live code) was ALSO wrong, and the real mechanism generalises where that one does
 * not. The reviewer reported first-hand that it read the changed files from this worktree but reached
 * for the jCodemunch MAIN index for the callers outside the diff. That index is `indexed_at`
 * 2026-09-12; PR #2564, which removed the allowlists, merged 2026-09-14T03:06:20Z. So it was served
 * GENUINE pre-#2553 source: every line number it cited was real, just two days historical, returned
 * with no error and no empty result to signal staleness.
 *
 * The rule worth carrying: never cite a caller from an index whose `indexed_at` predates the branch
 * base. It bites exactly where the changed files are open in the worktree and the index is consulted
 * only for what lies beyond the diff.
 *
 * WHAT THIS HOST THEREFORE MODELS: the commit boundary really does forward wholesale, which is what
 * this host does — so it is accurate there, for `commercialSubtypes` as much as for `propertyTypes`,
 * and the subtype half of the reconciliation is NOT inert on production wiring. A separate
 * projection further out (`useDiscoverPageContext.ts`'s `urlDiscoverFilters`) is reported by the
 * orchestrator to omit the axis from both its object literal and its memo deps. That is another
 * lane's finding and another lane's fix, deliberately NOT verified from here — and it, not anything
 * in the files named above, is what would decide whether the axis survives the full URL round trip.
 */
function ControlledHost({
  initialFilters,
  externalFilters,
  onEmit,
  areaListings = [mockListing],
  isCommercialSubtypeSupported = true,
}: {
  initialFilters: PanelFilters;
  externalFilters?: PanelFilters;
  onEmit?: (f: PanelFilters) => void;
  areaListings?: DiscoverCityListingItem[];
  isCommercialSubtypeSupported?: boolean;
}) {
  const [filters, setFilters] = useState<PanelFilters>(initialFilters);

  const { view, commands } = toAreaSelectedPanelContract({
    selectedArea: mockArea,
    areaListings,
    filters,
    onFiltersChange: (next) => {
      onEmit?.(next);
      setFilters(next);
    },
    isCommercialSubtypeSupported,
  });

  return (
    <>
      <button
        type="button"
        data-testid="simulate-url-change"
        onClick={() => setFilters(externalFilters ?? {})}
      >
        simulate back/forward
      </button>
      <AreaSelectedPanel view={view} commands={commands} />
    </>
  );
}

const renderHost = (props: React.ComponentProps<typeof ControlledHost>) =>
  renderWithProviders(
    <DiscoverProvider>
      <AreaSetDraftProvider>
        <ControlledHost {...props} />
      </AreaSetDraftProvider>
    </DiscoverProvider>,
    { router: 'browser' },
  );

describe('AreaSelectedPanel — #2552 family/predicate agreement', () => {
  /**
   * THE WRONG-RESULTS ARM. This is the assertion the issue exists for.
   *
   * Asserts the EMITTED FILTER OBJECT, deliberately: at the defective head the Residential chip
   * highlights correctly while `propertyTypes: ['commercial']` survives into the query, so a
   * display-only assertion passes on the bug. Membership is what diverges, so membership is what
   * is pinned.
   */
  describe('Switching family cannot leave the other family behind in the emitted filters', () => {
    it('strips Commercial family tokens when switching to Residential', () => {
      const onEmit = vi.fn();
      renderHost({
        initialFilters: { propertyTypes: ['commercial'], commercialSubtypes: ['SHOP'] },
        onEmit,
      });

      fireEvent.click(screen.getByTestId('quick-chip-family-residential'));

      const emitted = onEmit.mock.calls.at(-1)?.[0] as PanelFilters;
      expect(emitted.commercialSubtypes ?? []).toEqual([]);
      for (const token of COMMERCIAL_FAMILY_TOKENS) {
        expect(
          (emitted.propertyTypes as string[] | undefined) ?? [],
          `selecting Residential must not leave the '${token}' property type in the emitted ` +
            `filters — the panel would read Residential while the query returns Commercial rows`,
        ).not.toContain(token);
      }
    });

    /**
     * The strip must be SURGICAL. Dropping `propertyTypes` wholesale would also discard a genuine
     * Residential selection the buyer still holds, trading one wrong-results bug for another.
     */
    it('keeps Residential types while stripping the Commercial ones', () => {
      const onEmit = vi.fn();
      renderHost({
        initialFilters: { propertyTypes: ['apartment', 'commercial'] },
        onEmit,
      });

      fireEvent.click(screen.getByTestId('quick-chip-family-residential'));

      const emitted = onEmit.mock.calls.at(-1)?.[0] as PanelFilters;
      expect(emitted.propertyTypes ?? []).toContain('apartment');
      expect(emitted.propertyTypes ?? []).not.toContain('commercial');
    });

    /**
     * The round trip, where display and predicate are forced to meet.
     *
     * CORRECTION, RECORDED RATHER THAN REWRITTEN. An earlier revision of this comment claimed this
     * arm "fails at the defective head on the visible state too". The RED run disproved it: this
     * arm PASSED at the defective head while the other four failed. The reason is the defect
     * itself — `familyOverride` won unconditionally there, so the chip read Residential even though
     * `propertyTypes: ['commercial']` survived into the query. Display right, predicate wrong.
     *
     * So this is a NON-REGRESSION arm, not a defect arm, and saying so matters: it passes before
     * and after, and only the emitted-filter arms above are failure-sensitive to the bug. What it
     * does pin is that the fix keeps the visible state correct for the RIGHT reason — the family
     * token is stripped, the filters go genuinely silent on family, and the override is then
     * honoured — rather than by masking a wrong predicate as the old code did.
     */
    it('settles on Residential after the emitted filters round-trip back', () => {
      renderHost({
        initialFilters: { propertyTypes: ['commercial'], commercialSubtypes: ['SHOP'] },
      });

      fireEvent.click(screen.getByTestId('quick-chip-family-residential'));

      expect(screen.getByTestId('quick-chip-family-residential')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      // Positive control: the Residential half of the panel really rendered, so the subtype row's
      // absence below is scoped rather than a dead page.
      expect(screen.getByTestId('quick-chip-apartment')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-subtype-row')).not.toBeInTheDocument();
    });
  });

  /**
   * RE-SYNC. An external filters change must win over a stale click, in BOTH directions.
   */
  describe('An external filters change re-syncs the displayed family', () => {
    it('drops a stale Commercial override when the URL restores a Residential selection', () => {
      renderHost({
        initialFilters: {},
        externalFilters: { propertyTypes: ['apartment'] },
      });

      // Establish the override the way only a click can.
      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      expect(screen.getByTestId('quick-subtype-row')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('simulate-url-change'));

      expect(screen.getByTestId('quick-chip-family-residential')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      // Positive control + the mutual-exclusion consequence: the Residential chips are back.
      expect(screen.getByTestId('quick-chip-apartment')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-subtype-row')).not.toBeInTheDocument();
    });

    it('drops a stale Residential override when the URL restores a Commercial selection', () => {
      renderHost({
        initialFilters: { commercialSubtypes: ['SHOP'] },
        externalFilters: { commercialSubtypes: ['WAREHOUSE'] },
      });

      fireEvent.click(screen.getByTestId('quick-chip-family-residential'));
      expect(screen.getByTestId('quick-chip-apartment')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('simulate-url-change'));

      expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('quick-chip-subtype-warehouse')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });

  /**
   * RESURRECTION — the half of this defect that the first fix left standing.
   *
   * Found by exact-head review of PR #2582, and it is the same disease as the one above rather
   * than a new one. `setFamilyOverride` is called ONLY from `handleSelectFamily`, so a stale
   * `'commercial'` override outlives the filter state that superseded it and re-asserts itself the
   * moment the filters fall silent again.
   *
   * Scoping the override to family-silent filters makes the invariant "the override cannot
   * contradict the FILTERS" true — but that is weaker than this issue needs. It can still
   * contradict the buyer's most recent expressed intent, and the resulting display (Commercial)
   * sits over an emitted predicate carrying NO narrowing at all, i.e. a result set full of
   * Residential rows. Wrong results by the same definition as the arms above.
   *
   * All three entry points are in-panel and require no external navigation beyond the first step.
   * Each clicks inside the RESIDENTIAL type row, which renders only while Residential is the active
   * family — so each click is an unambiguous Residential statement, and landing in Commercial is
   * indefensible.
   *
   * The positive control here is `quick-family-row`, NOT `quick-chip-apartment`: the type chips'
   * presence is part of what is under test (they vanish if the row flips to Commercial), so using
   * one as the control would make these arms pass or fail for the wrong reason.
   */
  describe('A stale override is not resurrected when the filters fall silent again', () => {
    it('stays Residential when "All" clears the type selection', () => {
      renderHost({
        initialFilters: {},
        externalFilters: { propertyTypes: ['apartment'] },
      });

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      fireEvent.click(screen.getByTestId('simulate-url-change'));
      fireEvent.click(screen.getByTestId('quick-chip-all'));

      expect(screen.getByTestId('quick-family-row')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-family-residential')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(screen.queryByTestId('quick-subtype-row')).not.toBeInTheDocument();
    });

    it('stays Residential when the last remaining type chip is deselected', () => {
      renderHost({
        initialFilters: {},
        externalFilters: { propertyTypes: ['apartment'] },
      });

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      fireEvent.click(screen.getByTestId('simulate-url-change'));
      // Toggles the ONLY active type off, so `propertyTypes` goes back to undefined.
      fireEvent.click(screen.getByTestId('quick-chip-apartment'));

      expect(screen.getByTestId('quick-family-row')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-family-residential')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.queryByTestId('quick-subtype-row')).not.toBeInTheDocument();
    });

    /**
     * THE MIRROR CASE, on the Commercial side — the same reasoning pointed the other way.
     *
     * If a click inside the Residential row is an unambiguous Residential statement, then a click
     * inside the SUBTYPE row is an unambiguous Commercial one, and `handleToggleSubtype` records
     * nothing. That matters for exactly one shape, and it is the canonical one: under the one-axis
     * contract a restored link carries `commercialSubtypes` ALONE, so the family is DERIVED and
     * `familyOverride` is still `null`. Clicking "All commercial" — a chip documented to clear the
     * narrowing WITHOUT leaving the family — empties the only evidence of the family, and the
     * buyer lands in Residential.
     *
     * The existing `familySubtype` arm for "All commercial" does not catch this: it passes
     * `propertyTypes: ['commercial']` alongside the subtypes, so `commercialFromFilters` survives
     * the clear. This arm is subtype-only, which is what a real shared link looks like.
     */
    it('keeps the family on Commercial when "All commercial" clears a subtype-only URL selection', () => {
      renderHost({ initialFilters: { commercialSubtypes: ['SHOP'] } });

      // Derived, not clicked: no family chip has been pressed, so the override is still null.
      expect(screen.getByTestId('quick-subtype-row')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('quick-chip-subtype-all'));

      expect(screen.getByTestId('quick-family-row')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('quick-subtype-row')).toBeInTheDocument();
    });

    /**
     * "Clear filters" is the worst of the three: an affordance whose entire promise is to return
     * the buyer to an unfiltered state would instead deposit them in the other family.
     */
    it('does not leave the buyer in Commercial after "Clear filters"', () => {
      renderHost({
        initialFilters: {},
        externalFilters: { propertyTypes: ['apartment'] },
        areaListings: [],
      });

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      fireEvent.click(screen.getByTestId('simulate-url-change'));
      fireEvent.click(screen.getByTestId('area-zero-recovery-clear-filters'));

      expect(screen.getByTestId('quick-family-row')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-family-residential')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.queryByTestId('quick-subtype-row')).not.toBeInTheDocument();
    });
  });

  /**
   * NON-REGRESSION ARMS — these pass at the defective head, and that is the point.
   *
   * They pin the two behaviours the override legitimately exists to provide, so that a fix which
   * simply cleared it (an effect on `filters`, or a key reset) cannot pass this file. Without
   * them, "delete `familyOverride`" would look like a valid fix while closing the subtype row the
   * instant a buyer opened it.
   */
  describe('The first Commercial click still opens the row, and unrelated edits keep it open', () => {
    it('keeps the subtype row open on the first Commercial click, with no subtype yet', () => {
      renderHost({ initialFilters: {} });

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));

      // The emission is `propertyTypes: undefined` with no subtype, so the filters say NOTHING
      // about family. Derivation alone would fall back to Residential and shut the row.
      expect(screen.getByTestId('quick-subtype-row')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    /**
     * Issue #2555 — the CHIP this clicks changed; the contract it pins did not.
     *
     * Budget bands are now family-aware (#2450: "Budget state is independent per family/intent"),
     * so once Commercial is the active family the offered bands are the Commercial ones and the
     * residential ₹50L chip (`quick-chip-budget-5000000`) is genuinely not rendered. This arm was
     * reaching for it AFTER clicking Commercial, so it failed on `Unable to find an element` —
     * the band table working as designed, not a regression in the behaviour under test.
     *
     * Retargeted to `quick-chip-budget-10000000` (≤ ₹1 Cr), the Commercial Buy band that exists in
     * this state. Every assertion below is untouched: the point is still that a family-IRRELEVANT
     * Budget change leaves the subtype row open and the family on Commercial.
     */
    it('keeps the subtype row open across a family-irrelevant Budget change', () => {
      renderHost({ initialFilters: {} });

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      fireEvent.click(screen.getByTestId('quick-chip-budget-10000000'));

      expect(screen.getByTestId('quick-subtype-row')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('keeps the family on Commercial when "All commercial" clears the narrowing', () => {
      renderHost({ initialFilters: {} });

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      fireEvent.click(screen.getByTestId('quick-chip-subtype-warehouse'));
      fireEvent.click(screen.getByTestId('quick-chip-subtype-all'));

      // "All commercial" clears the subtype WITHOUT leaving the family.
      expect(screen.getByTestId('quick-subtype-row')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });
});
