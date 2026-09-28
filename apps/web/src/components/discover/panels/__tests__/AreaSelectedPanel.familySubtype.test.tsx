import React from 'react';
import { screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AreaSelectedPanel } from '../AreaSelectedPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import {
  DISCOVER_COMMERCIAL_SUBTYPES,
  type CommercialSubtype,
} from '@/lib/listing-constants';
import { toAreaSelectedPanelContract, type AreaSelectedPanelFlatTestProps } from './areaSelectedPanelTestAdapter';

/**
 * Issue #2450 — buyer-reachable Residential/Commercial family + subtype filters.
 *
 * RED BY DESIGN. Every assertion here fails at f6f557c9 because the control does
 * not exist: AreaSelectedPanel's quick row is hard-coded to
 * `QUICK_PROPERTY_TYPES = ['apartment', 'villa', 'land']` (AreaSelectedPanel.tsx L34),
 * with no family row and no Commercial chip.
 *
 * WHY THIS FILE EXISTS AHEAD OF THE IMPLEMENTATION. The passing Commercial subtype
 * coverage in `components/map/filters/__tests__/PropertyTypeFilter.commercialSubtype.test.tsx`
 * exercises `MapFilters`/`PropertyTypeFilter`, a composition that is NOT mounted in the
 * normal buyer Discover journey. Those tests cannot fail when the buyer surface is
 * broken, so they are not coverage of this issue. These tests are written against the
 * real buyer panel specifically so that they can.
 *
 * SCOPE DISCIPLINE:
 *  - These are BEHAVIOUR assertions only. Visual specification (chip structure, tokens,
 *    placement, responsive composition) is deliberately absent: the approved #2429
 *    Commercial Discover design source is not present in this tree, and inventing it is
 *    forbidden by #2450 ("HOLD until the #2429 design source/commit is available").
 *  - `filters.propertyTypes` and `filters.commercialSubtypes` are the MERGED shapes from
 *    #2431 / PR #2444 (`DiscoverUrlFilters`, useDiscoverUrlState.ts L107+), not a
 *    speculative invention. #2458 extends the subtype allowlist from SHOP/OFFICE to all
 *    five; it does not rename these fields.
 *  - Membership/predicate truth (legacy NULL-subtype inclusion, SQL/OpenSearch parity,
 *    anon/authed agreement) belongs to #2458 and is asserted there, not here. This file
 *    asserts only what the panel itself owns: what a buyer can reach, and what the panel
 *    emits through `onFiltersChange`.
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

/**
 * Approved #2450 filter wording. NOTE the deliberate divergence from #2430's
 * COMMERCIAL_SUBTYPE_LABELS, which renders SHOP as "Commercial Shop" and OFFICE as
 * "Commercial Office" (propertyTypeConfig.ts L226-232). That choice is correct for a
 * result card, where the javadoc notes a bare "Shop" would read as a different property
 * family. Inside a filter row that is already scoped to the Commercial family, the
 * family context is established by the control itself and #2450 specifies the shorter
 * wording. See the mismatch record on PR #2500 — per #2450 this is a focused follow-up,
 * NOT a second private label map and NOT a change to #2430's card labels.
 */
/**
 * ONE-AXIS CONTRACT (ruled for #2458, carried by team-lead).
 *
 * All five Commercial peers ride the SUBTYPE axis alone. #2450 emits `subtype=` and does
 * NOT fan out across `propertyTypes`. On #2458's backend, `subtype=WAREHOUSE` with no
 * `type=` resolves through `impliedPropertyTypes` -> `[warehouse]` -> the non-bearing
 * branch, matching warehouse rows including legacy ones.
 *
 * This supersedes the two-axis reading an earlier revision of this spec encoded. That
 * revision was caught by `tsc -p tsconfig.app.json` under subtraction, which rejected
 * `commercialSubtypes: ['WAREHOUSE']` against the then-current
 * `DISCOVER_COMMERCIAL_SUBTYPES = ['SHOP','OFFICE']`. The ruling resolves it by widening
 * the vocabulary to all five rather than making the UI fan out, so the approved five-peer
 * design is expressible exactly as designed.
 *
 * VOCABULARY SOURCE. #2458 has landed, so the local five-value mirror this file used to
 * carry is gone. `value` is typed `CommercialSubtype`, which derives from
 * `DISCOVER_COMMERCIAL_SUBTYPES` in `lib/listing-constants.ts` — the same declaration
 * `PropertyFilters.commercialSubtypes` is typed against. `BUYER_COMMERCIAL_SUBTYPES` in
 * `propertyTypeConfig.ts` is now a re-export of that same binding rather than a second
 * literal, so the two-list drift flagged earlier from this lane is resolved at source and
 * there is no longer a choice to make.
 *
 * The LABELS stay local and are deliberately not imported: they are #2450's approved buyer
 * wording, which differs from #2430's card labels (`Shop` here versus `Commercial Shop`
 * there) for a reason recorded on the PR.
 *
 * AN EARLIER REVISION ADDED: "The `coversWholeVocabulary` assertion below is what stops this
 * table silently falling out of step with the constant." TRUE ON THE VALUE AXIS ONLY, and
 * misleading directly after a paragraph about LABELS. That assertion compares the value set
 * against `DISCOVER_COMMERCIAL_SUBTYPES` and never looks at a label.
 *
 * THE CORRECTION ITSELF THEN OVERSHOT, and this is the retraction of it. It went on to claim
 * that "nothing anywhere compares the label strings" and that renaming `Warehouse / Godown` in
 * the panel leaves "every arm in this file green". BOTH ARE FALSE: the `selecting Commercial
 * reveals the Commercial subtype row` arm below asserts `toHaveTextContent(choice.label)` for
 * all six chips, so that rename goes red right here.
 *
 * What is genuinely missing is EQUALITY, and the distinction is load-bearing because
 * `toHaveTextContent` matches a SUBSTRING, not the whole string. The guard is directional:
 *
 *   - `Warehouse / Godown` -> `Warehouse/Godown`           FAILS — existing text was altered.
 *   - `Warehouse / Godown` -> `Warehouse / Godown (Large)` PASSES — text was only appended.
 *
 * So a rename is caught and an APPEND is not, against #2450's requirement to preserve the exact
 * human labels from #2429. That is why the prescribed fix survives the retraction even though
 * the justification originally given for it did not. A label-EQUALITY arm against the panel's
 * table is the fix, and it belongs to the enabling head rather than to this doc-only correction.
 */
const COMMERCIAL_SUBTYPE_CHOICES: readonly {
  testId: string;
  label: string;
  value: CommercialSubtype | null;
}[] = [
  { testId: 'quick-chip-subtype-all', label: 'All commercial', value: null },
  { testId: 'quick-chip-subtype-shop', label: 'Shop', value: 'SHOP' },
  { testId: 'quick-chip-subtype-office', label: 'Office', value: 'OFFICE' },
  { testId: 'quick-chip-subtype-building', label: 'Commercial Building', value: 'BUILDING' },
  { testId: 'quick-chip-subtype-warehouse', label: 'Warehouse / Godown', value: 'WAREHOUSE' },
  { testId: 'quick-chip-subtype-land', label: 'Commercial Land', value: 'LAND' },
];

/**
 * Stored `property_type` tokens, mirroring `BUYER_SUBTYPE_TO_PROPERTY_TYPE`. Present ONLY
 * so the auto-add trap tests can assert the panel does NOT emit them.
 */
const FAMILY_TOKENS = [
  'commercial',
  'commercial_building',
  'warehouse',
  'commercial_land',
] as const;

/** The one-axis contract: the selection rides `commercialSubtypes`, and nothing else. */
const expectSubtypeExpressed = (
  emitted: Record<string, unknown> | undefined,
  choice: { value: string },
) => {
  expect((emitted?.commercialSubtypes as string[] | undefined) ?? []).toContain(choice.value);
};

type PanelFilters = NonNullable<AreaSelectedPanelFlatTestProps['filters']>;

/**
 * The props this spec requires, including the capability gate the implementation must add.
 *
 * Declared as a local intersection rather than suppressed at each use site, so this file adds
 * ZERO errors to the project's typecheck baseline — four `TS2353`s would otherwise land in
 * every other lane's subtraction control.
 */
type PanelProps = AreaSelectedPanelFlatTestProps;

/*
 * NO TYPE-LEVEL TRIPWIRE HERE, deliberately, and the reason is worth recording because I built
 * two failed ones before seeing it.
 *
 * The first suppressed a width mismatch that survived the widening it was waiting for, so it
 * could never clear. The second aimed a directive at an indexed-access type — TypeScript reports
 * that error at the property position, not the directive's line, so it came out simultaneously
 * "unused" AND leaving the real error standing.
 *
 * Both were redundant anyway: the 29 failing arms in this file already announce that the prop
 * and the control do not exist, and they stop failing exactly when the implementation lands.
 * A separate mechanism to detect the same event added two errors to the project baseline and
 * told nobody anything the suite was not already saying.
 */

/**
 * Builds a Commercial filter fixture over the five-value buyer vocabulary.
 *
 * #2458 HAS LANDED, so this now types against the real `CommercialSubtype` union rather than
 * suppressing an assignment error. The values below are checked by the compiler against the
 * merged vocabulary; a subtype that stopped existing would fail to compile here.
 *
 * A NOTE ON THE SUPPRESSION THIS REPLACES, because the lesson outlived it. The previous
 * revision carried one `@ts-expect-error`, chosen over a cast specifically so it would
 * self-clear with TS2578 once `CommercialSubtype` widened. **It could never have fired.**
 * The parameter was typed `readonly string[]`, so the error being suppressed was
 * `string[]` -> `CommercialSubtype[]` — a width mismatch that persists no matter how wide
 * the union becomes. The directive was load-bearing before and after the widening, and the
 * merge produced no signal at all.
 *
 * The general shape: a self-clearing suppression only clears if the error it suppresses is
 * the one the awaited change removes. Suppressing a DIFFERENT error that happens to sit at
 * the same line gives a tripwire that cannot trip while looking like one that can.
 *
 * ONE AXIS ONLY. This deliberately does NOT set `propertyTypes`. An earlier revision set
 * `propertyTypes: ['commercial']` for all five subtypes, which is the SUPERSEDED two-axis
 * shape and contradicts this file's own auto-add-trap assertions: pairing `'commercial'`
 * with LAND / WAREHOUSE / BUILDING names a set no row can be in, so that fixture pinned
 * "render a zero-row state as an applied filter" as the expected contract.
 */
const commercialFilters = (subtypes: readonly CommercialSubtype[]): PanelFilters => ({
  commercialSubtypes: [...subtypes],
});

describe('AreaSelectedPanel — #2450 family / subtype filters', () => {
  /**
   * DRIFT GUARD, and the reason it exists is worth more than the assertion.
   *
   * This file previously relied on a single `@ts-expect-error` to announce #2458's landing,
   * chosen over a cast precisely so it would self-clear. It could not: the suppressed error was
   * `string[]` -> `CommercialSubtype[]`, a width mismatch that survives any widening of the
   * union, so the directive stayed load-bearing before and after the merge and the event
   * produced no signal.
   *
   * This assertion is the replacement, and it is falsifiable in the direction that matters:
   * add a sixth subtype to the vocabulary and this fails until the table covers it; remove one
   * and the typed `value` field stops compiling.
   */
  it('covers the whole vocabulary — table and constant cannot drift apart', () => {
    const covered = COMMERCIAL_SUBTYPE_CHOICES
      .map((c) => c.value)
      .filter((v): v is CommercialSubtype => v !== null);

    expect([...covered].sort()).toEqual([...DISCOVER_COMMERCIAL_SUBTYPES].sort());
  });

  /**
   * THE CAPABILITY GATE — why every behaviour arm below opts in explicitly.
   *
   * The panel's card list is fed by `useDiscoverCityListings`, which carries **no
   * `commercialSubtypes` param at all** (cited by name, not by line — the `:142` this
   * paragraph used to carry had drifted off the field it named). So the subtype axis this
   * panel emits is not consumed by the panel's own results: a buyer picking
   * Commercial → Warehouse would see results **unchanged**, not zero.
   *
   * Issue #2533 removed the OTHER half of this argument — that hook's `propertyType` was
   * also SINGULAR, so a multi-select dropped the type filter outright. It now takes the
   * full selection. The missing subtype param above is what still holds this gate shut.
   *
   * That is worse than an empty list. Zero at least signals that something happened;
   * unchanged results signal that the control did nothing — the inert-control class this
   * file's own auto-add-trap section condemns. A spec that required the control to be
   * buyer-reachable today would therefore pin a lying control as the contract.
   *
   * `isCommercialSubtypeSupported` mirrors the panel's existing `isReadyToMoveSupported`
   * precedent — declared beside it on `AreaSelectedPanelProps`, defaulted in the same
   * destructure, and consulted by its handler before emitting — and unlike it **defaults
   * FALSE**: the behaviour is built and pinned, the buyer cannot reach it, and D2 is satisfied
   * literally rather than deferred. It flips to true when the card path can actually consume a
   * subtype, which is #2533's work. (Line citations deliberately omitted: the earlier revision
   * carried `:142`/`:223`/`:317-322`, all of which this issue's own implementation then moved.)
   *
   * ── A TRAP FOR WHOEVER ADDS THE NEXT ARM HERE (#2552) ─────────────────────────────────────
   *
   * `onFiltersChange` below is a bare `vi.fn()`, so emitted filters are OBSERVED but never
   * APPLIED — the panel never re-renders with the state it just asked for. Every arm in this file
   * is written against that, and all 43 still pass.
   *
   * Since #2552 the panel consults `familyOverride` only while the filters are family-SILENT, so
   * clicking Commercial **no longer opens the subtype row when `propertyTypes` is non-empty**.
   * Every existing arm that clicks Commercial happens to start from `filters: {}` or from an
   * already-commercial-deriving object, which is why none of them noticed. A NEW arm that clicks
   * Commercial from a non-empty Residential selection will fail here — for a correct reason, but a
   * confusing one, because the non-committing mock cannot show you the round trip that resolves it.
   * Use the controlled host in `AreaSelectedPanel.familyResync.test.tsx` for anything that depends
   * on emitted filters coming back as props.
   */
  const renderPanel = (
    props: Partial<PanelProps> = {},
  ) => {
    const defaultProps: PanelProps = {
      selectedArea: mockArea,
      areaListings: [mockListing],
      filters: {},
      onFiltersChange: vi.fn(),
      onSelectJourney: vi.fn(),
      onAddSchool: vi.fn(),
      // Behaviour arms opt in. The default-false contract is pinned separately below.
      isCommercialSubtypeSupported: true,
      /*
       * ANONYMOUS BY DEFAULT — by omission, deliberately, and this is the widest pin of the
       * ratified anon posture anywhere in the file.
       *
       * An earlier revision set `isAuthenticated: true` here, because the superseded posture made
       * the anon Commercial chip genuinely DISABLED: every arm that clicks it would have been
       * gated and failed for the anon reason rather than its own. That default no longer protects
       * anything. The owner has since ruled that anonymous buyers browse and filter Commercial
       * exactly as they do Residential, so pinning the arms authed would HIDE the contract instead
       * of protecting it.
       *
       * Omitting the prop lets the panel's own `isAuthenticated = false` default apply, so every
       * family and subtype arm below runs ANONYMOUS. Reintroducing any Commercial-specific auth
       * condition therefore turns most of this file red, not one describe block. The authed side
       * stays covered: the restoration arms pass `isAuthenticated: true` explicitly, and the
       * anonymous-posture block below carries the contrast arm.
       */
    };

    const { view, commands } = toAreaSelectedPanelContract({ ...defaultProps, ...props });
    renderWithProviders(
      <DiscoverProvider>
        <AreaSetDraftProvider>
          <AreaSelectedPanel view={view} commands={commands} />
        </AreaSetDraftProvider>
      </DiscoverProvider>,
      { router: 'browser' },
    );
  };

  /**
   * THE GATE ITSELF. These are the arms that stop this spec pinning a buyer-reachable inert
   * control, so they must fail if the gate is missing or defaults the wrong way.
   *
   * ── RULED: OPTION A, "NO FAMILY ROW". The open question below is CLOSED. ──────────────────
   *
   * An earlier revision of this comment left the gate-off presentation deliberately unpinned,
   * because these arms assert only what is ABSENT and say nothing about
   * `quick-chip-family-residential` — so TWO shipped states satisfied them:
   *
   *   (a) no family row at all — the panel looks exactly as it does today; or
   *   (b) a family row showing Residential ALONE.
   *
   * The owner ratified **(a)**, and explicitly REJECTED (b), on the same ground this file's anon
   * rationale already argued: a lone Residential chip is indistinguishable from "this product has
   * no commercial inventory", which is a claim about the catalogue that the capability flag is not
   * making. Today's buyer surface is preserved unchanged while the capability is off.
   *
   * The missing assertion is therefore now WRITTEN, below, rather than left to implementation —
   * which matters because capability-off is the DEFAULT until #2533 lands, so this branch is what
   * every buyer sees in the meantime.
   */
  describe('Commercial is NOT buyer-reachable until the card path can consume a subtype', () => {
    /**
     * LOAD-BEARING as of the implementation. An earlier revision marked this CANNOT FAIL, which
     * was true while no Commercial control existed under ANY prop — the absence it observed was
     * absence-of-feature, not the gate working. The contrast arm below now renders that control,
     * so this arm fails if the gate stops suppressing it.
     */
    it('renders no Commercial family control when the capability is absent', () => {
      renderPanel({ isCommercialSubtypeSupported: undefined });

      // Positive control: the panel really rendered.
      expect(screen.getByTestId('quick-chip-apartment')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-chip-family-commercial')).not.toBeInTheDocument();
      expect(screen.queryByTestId('quick-subtype-row')).not.toBeInTheDocument();
    });

    /** LOAD-BEARING as of the implementation, for the same reason as the arm above. */
    it('renders no Commercial family control when the capability is explicitly false', () => {
      renderPanel({ isCommercialSubtypeSupported: false });

      expect(screen.getByTestId('quick-chip-apartment')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-chip-family-commercial')).not.toBeInTheDocument();
    });

    /**
     * THE RULED BRANCH — Option A. This is the assertion the earlier revision deliberately left
     * unwritten pending the owner. Without it, a Residential-only family row would satisfy every
     * other arm in this describe while being the state the owner rejected.
     *
     * It pins BOTH halves: the row itself is absent, and so is the Residential chip that would
     * make it a one-option selector. Asserting only the latter would pass on a row rendered empty.
     */
    it('renders no family row at all while the capability is off — not a Residential-only row', () => {
      renderPanel({ isCommercialSubtypeSupported: false });

      // Positive control: the panel really rendered, so the absences below mean something.
      expect(screen.getByTestId('quick-chip-apartment')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-family-row')).not.toBeInTheDocument();
      expect(screen.queryByTestId('quick-chip-family-residential')).not.toBeInTheDocument();
    });

    /**
     * CONTRAST ARM. Without it, the assertions above would also pass on a panel that never
     * renders a Commercial control under any prop — which was the pre-implementation state and
     * would make them vacuous. It covers the family row too, so the ruled-branch arm above is
     * falsifiable in both directions.
     */
    it('renders it once the capability is present', () => {
      renderPanel({ isCommercialSubtypeSupported: true });
      expect(screen.getByTestId('quick-chip-family-commercial')).toBeInTheDocument();
      expect(screen.getByTestId('quick-family-row')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-family-residential')).toBeInTheDocument();
    });
  });

  describe('Family row is reachable in the real buyer panel', () => {
    it('renders exactly Residential and Commercial as the TYPE family choices', () => {
      renderPanel();
      expect(screen.getByTestId('quick-chip-family-residential')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-family-commercial')).toBeInTheDocument();
    });

    it('selecting Commercial reveals the Commercial subtype row', () => {
      renderPanel();
      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));

      const subtypeRow = screen.getByTestId('quick-subtype-row');
      for (const choice of COMMERCIAL_SUBTYPE_CHOICES) {
        expect(within(subtypeRow).getByTestId(choice.testId)).toHaveTextContent(
          choice.label,
        );
      }
    });

    /**
     * LOAD-BEARING as of the implementation. It was CANNOT-FAIL at f6f557c9, where no subtype row
     * rendered in ANY state and the absence it asserts was absence-of-feature rather than correct
     * scoping. The row now exists and is family-local, so this fails if it stops being scoped —
     * e.g. if it were hoisted out of the family branch and rendered unconditionally.
     */
    it('does not render a Commercial subtype row while Residential is the active family', () => {
      renderPanel({ filters: { propertyTypes: ['apartment'] } });
      expect(screen.queryByTestId('quick-chip-subtype-warehouse')).not.toBeInTheDocument();
    });
  });

  describe('Subtype selection emits the canonical filter state', () => {
    it.each(
      COMMERCIAL_SUBTYPE_CHOICES.filter((c) => c.value !== null),
    )('expresses a filter selection for $label', (choice) => {
      const onFiltersChange = vi.fn();
      renderPanel({ filters: { propertyTypes: ['commercial'] }, onFiltersChange });

      fireEvent.click(screen.getByTestId(choice.testId));

      expect(onFiltersChange).toHaveBeenCalled();
      expectSubtypeExpressed(onFiltersChange.mock.calls.at(-1)?.[0], choice);
    });

    /**
     * Shop + Warehouse / Godown — the pair #2458 named as unrepresentable under the old
     * AND predicate. Under the one-axis ruling both ride `commercialSubtypes` together.
     */
    it('multi-select accumulates subtypes rather than replacing them (OR semantics)', () => {
      const onFiltersChange = vi.fn();
      renderPanel({
        filters: { propertyTypes: ['commercial'], commercialSubtypes: ['SHOP'] },
        onFiltersChange,
      });

      fireEvent.click(screen.getByTestId('quick-chip-subtype-warehouse'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0];
      expectSubtypeExpressed(emitted, { value: 'SHOP' });
      expectSubtypeExpressed(emitted, { value: 'WAREHOUSE' });
    });

    it('"All commercial" clears the subtype narrowing without leaving the family', () => {
      const onFiltersChange = vi.fn();
      renderPanel({
        filters: { propertyTypes: ['commercial'], commercialSubtypes: ['SHOP', 'OFFICE'] },
        onFiltersChange,
      });

      fireEvent.click(screen.getByTestId('quick-chip-subtype-all'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0];
      expect(emitted.commercialSubtypes ?? []).toEqual([]);
      // Issue #2572 — this asserted the OPPOSITE until now: that the three non-`commercial` family
      // tokens were NOT emitted. That encoded "All commercial" as "clear the subtype and narrow by
      // nothing", and the cost was measured in a browser against the seeded fixture: the chip read
      // aria-pressed=true while the list returned 10 rows — three of them Residential [BEDS]
      // listings and one a Residential apartment. "Without leaving the family", the name of this
      // test, was true of the CHIP and false of the RESULTS.
      //
      // The whole family is the honest expression of "all commercial", and it is safe in exactly
      // this branch: the auto-add trap documented below needs a SUBTYPE to contradict, and this
      // branch has just cleared it. That contradiction arm is asserted, unchanged, in that block —
      // so widening here cannot quietly license the shape #2450 removed.
      expect(emitted.propertyTypes ?? []).toEqual(
        expect.arrayContaining([
          'commercial',
          'commercial_building',
          'warehouse',
          'commercial_land',
        ]),
      );
    });
  });

  /**
   * THE AUTO-ADD TRAP — the highest-value assertions in this file.
   *
   * `PropertyTypeFilter.tsx` auto-adds the `'commercial'` token whenever a subtype is
   * picked. That is right for Shop and Office, whose stored type really is `commercial`,
   * and WRONG for the other three: `type=commercial&subtype=WAREHOUSE` asks for
   * `(commercial AND subtype=WAREHOUSE)`, and no row satisfies it, because `commercial`
   * rows never carry WAREHOUSE. The buyer gets zero results, no error, and a control that
   * looks like it worked. #2450 exists to remove exactly this class of quiet wrongness, so
   * reproducing it here would be self-defeating.
   *
   * WHY THESE ASSERT EMITTED PARAMS AND NOT RESULTS. Against today's Commercial-empty
   * fixture a results-based test passes whether or not the bug is present — zero rows is
   * the expected outcome either way, so such a test could never fail and would be
   * worthless as a guard. Asserting the emitted filter state is failure-sensitive with no
   * data at all, which is why the check lives at this level and not in an E2E.
   */
  describe('Does not auto-add a family token that contradicts the subtype', () => {
    it.each(
      COMMERCIAL_SUBTYPE_CHOICES.filter(
        (c) => c.value !== null && c.value !== 'SHOP' && c.value !== 'OFFICE',
      ),
    )('emits $label on the subtype axis alone, with no family token', (choice) => {
      const onFiltersChange = vi.fn();
      renderPanel({ filters: {}, onFiltersChange });

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      fireEvent.click(screen.getByTestId(choice.testId));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0];
      expectSubtypeExpressed(emitted, choice);

      // The contradiction: a family token alongside a non-bearing subtype matches nothing.
      for (const token of FAMILY_TOKENS) {
        expect(
          (emitted?.propertyTypes as string[] | undefined) ?? [],
          `${choice.value} must not be accompanied by the '${token}' property type — ` +
            `that AND-combination matches zero rows and fails silently`,
        ).not.toContain(token);
      }
    });

    it('still emits the commercial family token for Shop, whose stored type IS commercial', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ filters: {}, onFiltersChange });

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      fireEvent.click(screen.getByTestId('quick-chip-subtype-shop'));

      expectSubtypeExpressed(onFiltersChange.mock.calls.at(-1)?.[0], { value: 'SHOP' });
    });
  });

  /**
   * URL restoration — the half of the round-trip #2450 owns.
   *
   * Canonical serialise/parse of `subtype=` across all five values belongs to #2458, in
   * `features/discover/state/url/__tests__/commercialSubtype.test.ts`, and it HAS LANDED —
   * that file's L77 asserts BUILDING/WAREHOUSE/LAND are KEPT as peer subtypes, with L67-76
   * recording why. This file therefore does not duplicate it; there is nothing left to owe.
   *
   * SUPERSEDED — kept rather than deleted so the correction is legible. An earlier version of
   * this comment said that file "currently asserts the OPPOSITE of the one-axis ruling ('drops
   * BUILDING/WAREHOUSE/LAND — they are property types here, not subtypes')" and that reversing
   * it was still owed. That described #2431's assertion, which #2458 already replaced; it was
   * NOT true at this branch's head. The stale claim then travelled three hops — this comment, a
   * closing review that faithfully relayed it, and the Main Agent — and was on its way into the
   * enabling work as a blocker that does not exist, because nobody opened the file. The
   * allowlist's PURPOSE is unchanged either way: unknown values are still dropped (see the
   * RESTAURANT cases at that file's L57-60). Only its membership moved.
   *
   * What #2450 owns is that restored state renders as the correct VISIBLE selection.
   */
  describe('Restores the visible selection from URL state', () => {
    /**
     * How family-active is DERIVED under the one-axis contract, which was pinned nowhere.
     *
     * Since a subtype selection rides `commercialSubtypes` alone and sets no `propertyTypes`,
     * the family chip cannot read its pressed state from `propertyTypes`. A restored URL
     * carrying only `subtype=WAREHOUSE` must still show Commercial as the active family — or
     * the buyer returns to a link and sees Residential selected while Commercial results
     * render.
     */
    it('marks Commercial active when ONLY commercialSubtypes is set', () => {
      renderPanel({
        isAuthenticated: true,
        filters: { commercialSubtypes: ['WAREHOUSE'] },
      });

      expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('quick-chip-family-residential')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it.each(
      COMMERCIAL_SUBTYPE_CHOICES.filter((c) => c.value !== null),
    )('renders $label as the active chip when restored from the URL', (choice) => {
      renderPanel({
        isAuthenticated: true,
        filters: commercialFilters([choice.value]),
      });

      expect(screen.getByTestId(choice.testId)).toHaveAttribute('aria-pressed', 'true');
    });

    it('restores a multi-subtype selection as multiple active chips', () => {
      renderPanel({
        isAuthenticated: true,
        filters: commercialFilters(['SHOP', 'WAREHOUSE']),
      });

      expect(screen.getByTestId('quick-chip-subtype-shop')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('quick-chip-subtype-warehouse')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('quick-chip-subtype-office')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('restores the Commercial family as active, not Residential', () => {
      renderPanel({
        isAuthenticated: true,
        filters: commercialFilters(['LAND']),
      });

      expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('quick-chip-family-residential')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  describe('Family switching preserves unrelated state', () => {
    it('switching family does not discard a compatible Budget selection', () => {
      const onFiltersChange = vi.fn();
      renderPanel({
        filters: { propertyTypes: ['apartment'], priceMax: 8_000_000 },
        onFiltersChange,
      });

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0];
      expect(emitted.priceMax).toBe(8_000_000);
    });

    it('family-local subtype reset does not silently clear Budget', () => {
      const onFiltersChange = vi.fn();
      renderPanel({
        // One axis. An earlier revision wrote `propertyTypes: ['commercial','warehouse']`
        // here, which is the superseded two-axis shape — still the reason not to use it.
        // It was ALSO a two-type selection, which #2533's single-type collapse turned into
        // an unfiltered list; that half no longer applies, since the #2533 frontend half
        // now sends every selected type.
        filters: { ...commercialFilters(['WAREHOUSE']), priceMax: 12_000_000 },
        onFiltersChange,
      });

      fireEvent.click(screen.getByTestId('quick-chip-subtype-all'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0];
      expect(emitted.priceMax).toBe(12_000_000);
    });
  });

  /**
   * F1 — THE TWO FAMILIES MUST NOT BE SELECTABLE AT ONCE.
   *
   * Found by exact-head review at 86fbcc6a. The subtype row shipped directly beneath the
   * unconditional Residential type chips, with a comment claiming it renders "never alongside"
   * them. The comment was false, and the consequence was worse than a wrong comment: a buyer
   * could hold `propertyTypes:['apartment']` AND `commercialSubtypes:['SHOP']` simultaneously,
   * which the predicate builder ANDs into a query no row can satisfy. That is precisely the
   * contradictory-selection class this issue exists to remove — the auto-add trap above
   * forbids it on the EMISSION axis, and this forbids the same combination being assembled by
   * hand through the UI.
   *
   * Not reachable at default-OFF, so it shipped harmlessly; it is an entry condition for the
   * enabling change, which is why it is pinned now rather than rediscovered later.
   *
   * Every arm carries a positive control, because "the apartment chip is absent" passes just as
   * happily on a panel that failed to render.
   */
  describe('Residential type chips and the Commercial subtype row are mutually exclusive', () => {
    it('hides every Residential type chip while the Commercial subtype row is open', () => {
      renderPanel({ filters: commercialFilters(['SHOP']) });

      // Positive control: the panel rendered, and rendered the commercial half.
      expect(screen.getByTestId('quick-subtype-row')).toBeInTheDocument();

      // Issue #2605 — the Plots chip's testid is `quick-chip-residential_plot`, not
      // `quick-chip-land`; asserting the old, now-nonexistent testid would vacuously pass
      // regardless of the mutual-exclusion logic under test.
      for (const type of ['apartment', 'villa', 'residential_plot']) {
        expect(
          screen.queryByTestId(`quick-chip-${type}`),
          `the '${type}' chip must not be reachable while a Commercial subtype is held — ` +
            `clicking it would AND a Residential type onto a Commercial subtype and match zero rows`,
        ).not.toBeInTheDocument();
      }
      // The "All" chip writes `propertyTypes: undefined`, so it is not itself contradictory —
      // but it belongs to the Residential axis and reads as "all property types" while the
      // subtype row is the actual type control. It goes with the chips it labels.
      expect(screen.queryByTestId('quick-chip-all')).not.toBeInTheDocument();
    });

    /**
     * CONTRAST ARM. Without it every assertion above would also pass on a panel that never
     * renders type chips at all, which is a different bug wearing the same test result.
     */
    it('renders the Residential type chips while Residential is the active family', () => {
      renderPanel({ filters: { propertyTypes: ['apartment'] } });

      expect(screen.getByTestId('quick-chip-apartment')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-all')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-subtype-row')).not.toBeInTheDocument();
    });

    /**
     * The exclusion is keyed on `showSubtypeRow`, NOT on the derived family, and this arm is what
     * forces that. The family is derived from filters, so an inbound `subtype=` URL reads as
     * Commercial even where the subtype row cannot render — and hiding the type chips there would
     * change the surface the owner ruled must stay exactly as it is today.
     *
     * A SECOND ARM HERE WAS DELETED, and the deletion is the point rather than tidying. It asserted
     * that an anonymous visitor on this same inbound URL keeps the Residential type chips and gets
     * NO subtype row. Under the owner's ruling that is the exact inverse of the contract: anon sees
     * the subtype row precisely as a signed-in buyer does. Its replacement is the inbound-URL arm
     * in the anonymous-posture block below, which asserts the row IS present — so the coverage
     * moved rather than lapsed.
     */
    it('keeps the Residential type chips on an inbound subtype URL while the capability is off', () => {
      renderPanel({
        isCommercialSubtypeSupported: false,
        filters: commercialFilters(['SHOP']),
      });

      expect(screen.getByTestId('quick-chip-apartment')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-subtype-row')).not.toBeInTheDocument();
    });
  });

  /**
   * F2 — A SUBTYPE-ONLY SELECTION MUST BE VISIBLE TO THE CLEAR AFFORDANCE.
   *
   * Also found by exact-head review at 86fbcc6a. `hasPropertyFilters` and
   * `handleClearPropertyFilters` both enumerate their keys explicitly, and neither gained
   * `commercialSubtypes`. Under the one-axis contract a Commercial selection rides that key
   * ALONE and sets no `propertyTypes` — so a subtype-only selection actively narrowed the
   * results while the panel reported no active filter: no "Clear filters" control, and the
   * cause-routed empty state blaming an empty market rather than the filter the buyer applied.
   *
   * Both directions are pinned: the affordance appears, and it actually clears.
   */
  describe('A subtype-only selection is a real filter to the clear affordance', () => {
    it('offers "Clear filters" when the ONLY active filter is a Commercial subtype', () => {
      renderPanel({ filters: commercialFilters(['SHOP']), areaListings: [] });

      expect(screen.getByTestId('area-zero-recovery-clear-filters')).toBeInTheDocument();
    });

    /**
     * CONTRAST ARM — and it is what makes the arm above mean anything. The control is rendered
     * only when `onClearFilters` is defined, so without this, a panel that offered "Clear
     * filters" unconditionally would pass.
     */
    it('offers no "Clear filters" control when nothing is filtering', () => {
      renderPanel({ filters: {}, areaListings: [] });

      // Positive control: the zero-result recovery really rendered, so the absence is scoped.
      expect(screen.getByTestId('area-zero-recovery-heading')).toBeVisible();
      expect(screen.queryByTestId('area-zero-recovery-clear-filters')).not.toBeInTheDocument();
    });

    it('actually clears the subtype narrowing, rather than only offering to', () => {
      const onFiltersChange = vi.fn();
      renderPanel({
        filters: commercialFilters(['SHOP', 'WAREHOUSE']),
        areaListings: [],
        onFiltersChange,
      });

      fireEvent.click(screen.getByTestId('area-zero-recovery-clear-filters'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0];
      expect(emitted.commercialSubtypes ?? []).toEqual([]);
    });
  });

  /**
   * Issue #2450 / #2509 — ANONYMOUS POSTURE.
   *
   * OWNER RULING. Anonymous users may browse and filter Commercial **exactly as they browse and
   * filter Residential**: switch family, choose subtypes, use the supported filters, and see the
   * normal anonymous teaser cards with normal list/map membership. Sign-in is required only for the
   * same protected detail Residential already gates — the existing teaser/paywall behaviour is
   * REUSED, and inventing a Commercial-only auth wall is forbidden in those words.
   *
   * THIS SUPERSEDES THE POSTURE THIS BLOCK USED TO ASSERT (disabled-with-a-visible-explanation),
   * and the supersession is recorded rather than silently rewritten because what changed was the
   * MECHANISM, not a matter of taste.
   *
   * The retired posture rested on a real impossibility: the anonymous endpoint matched property
   * type by exact single-value equality, while the Commercial family is a four-value union in
   * storage (`commercial`, `commercial_building`, `warehouse`, `commercial_land`). An anonymous
   * buyer could not express the FAMILY at all — `propertyType=commercial` silently excluded
   * buildings, warehouses and commercial land — so any anon Commercial control would have lied,
   * and disabled-with-explanation was the honest response.
   *
   * #2550 REMOVED THE IMPOSSIBILITY. Both query paths now normalise a multi-value property-type
   * list through one shared `IN (...)` clause. A shipped product decision was resting on a
   * mechanism that no longer exists; the owner was asked, and ruled. The gate went with its premise.
   *
   * THESE ARE NOW PARITY ARMS, and they are falsifiable in the direction that matters: each asserts
   * the anonymous state matches the authenticated one. Reintroducing an auth condition on the
   * family chip, on the subtype row, or on the emitted filters fails them. `renderPanel` defaults
   * to ANONYMOUS (see its note), so the whole file is a second and wider guard on the same rule —
   * this block is the explicit statement of it.
   *
   * REACHABILITY IS STILL CAPABILITY-GATED, and nothing here enables anything. The capability
   * defaults FALSE and flips only once #2509 makes the anonymous path express
   * family/subtype/multi-select truthfully. These arms pin the POSTURE, not the enablement.
   *
   * Every assertion carries a POSITIVE CONTROL asserting the panel actually rendered. Without it an
   * assertion about the Commercial chip passes just as happily on a dead page — the same
   * cannot-fail trap as the vacuous guards elsewhere in this file.
   */
  describe('Anonymous posture — parity with Residential', () => {
    /** Positive control: proves the panel mounted and rendered its quick row. */
    const expectPanelRendered = () => {
      expect(screen.getByTestId('quick-chip-apartment')).toBeInTheDocument();
    };

    it('renders the Commercial family control ENABLED for anonymous users', () => {
      renderPanel({ isAuthenticated: false });
      expectPanelRendered();

      const commercial = screen.getByTestId('quick-chip-family-commercial');
      expect(commercial).toBeInTheDocument();
      expect(commercial).toBeEnabled();
    });

    /**
     * The retired gate is pinned as ABSENT rather than merely left unasserted, and that is
     * deliberate. Without this arm the explanatory paragraph could be reinstated ALONGSIDE an
     * enabled chip and nothing in the suite would fail — a sign-in prompt sitting next to a control
     * that works is a worse lie than the disabled chip ever was.
     *
     * Both instruments are kept: the testid catches the element returning under its own name, the
     * copy match catches it returning under a different one.
     */
    it('shows no Commercial-specific sign-in explanation', () => {
      renderPanel({ isAuthenticated: false });
      expectPanelRendered();

      expect(
        screen.queryByTestId('quick-chip-family-commercial-gate'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/sign in to filter commercial/i)).not.toBeInTheDocument();
    });

    it('emits filter state when an anonymous user selects Commercial', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ isAuthenticated: false, onFiltersChange });
      expectPanelRendered();

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));

      expect(onFiltersChange).toHaveBeenCalled();
    });

    it('renders the Commercial subtype row for anonymous users', () => {
      renderPanel({ isAuthenticated: false });
      expectPanelRendered();

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));

      expect(screen.getByTestId('quick-subtype-row')).toBeInTheDocument();
    });

    /**
     * The narrowing itself, not merely the control's presence. An anon buyer who can click the row
     * but whose selection never reaches `onFiltersChange` has an inert control — the precise class
     * this file's auto-add-trap section condemns — so the emission is asserted, and asserted on the
     * subtype axis alone so the anon path cannot quietly acquire the contradictory family token.
     */
    it('lets an anonymous user narrow by subtype, on the subtype axis alone', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ isAuthenticated: false, onFiltersChange });
      expectPanelRendered();

      fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
      fireEvent.click(screen.getByTestId('quick-chip-subtype-warehouse'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0];
      expectSubtypeExpressed(emitted, { value: 'WAREHOUSE' });
      for (const token of FAMILY_TOKENS) {
        expect(
          (emitted?.propertyTypes as string[] | undefined) ?? [],
          `an anonymous WAREHOUSE selection must not carry the '${token}' property type`,
        ).not.toContain(token);
      }
    });

    /**
     * CONTRAST ARM, and its job has changed with the ruling — stated plainly so nobody reads it as
     * the old auth-conditional guard. It no longer discriminates anon from authed, because the two
     * are now required to agree. What it still rules out is the case every anon arm above would
     * pass on: a panel where Commercial is disabled, or gated, for EVERYONE.
     */
    it('presents the same enabled Commercial control when authenticated', () => {
      renderPanel({ isAuthenticated: true });
      expectPanelRendered();

      expect(screen.getByTestId('quick-chip-family-commercial')).toBeEnabled();
      expect(
        screen.queryByTestId('quick-chip-family-commercial-gate'),
      ).not.toBeInTheDocument();
    });

    /**
     * Inbound-URL case, and the contract INVERTED with the ruling rather than merely relaxing.
     *
     * A signed-out visitor can arrive on a shared or back/forward URL that already carries a
     * Commercial selection. Under the retired posture the panel had to refuse to present it as
     * applied, because it could not honour it. Under the ruling it must present it exactly as it
     * would for a signed-in buyer — otherwise one shared link means two different things to two
     * people, which is the same false-impression failure the old posture was trying to avoid,
     * pointed the other way.
     *
     * The positive control is the family row, NOT `quick-chip-apartment`: the Residential type
     * chips are correctly absent here, since the subtype row is open and the two are mutually
     * exclusive. Using the panel-wide control would have made this arm fail for the wrong reason.
     */
    it('presents an inbound Commercial URL as an applied filter for anonymous users', () => {
      renderPanel({
        isAuthenticated: false,
        filters: commercialFilters(['SHOP']),
      });

      expect(screen.getByTestId('quick-family-row')).toBeInTheDocument();
      expect(screen.getByTestId('quick-subtype-row')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-subtype-shop')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });

  describe('Copy truth rules', () => {
    /**
     * LOAD-BEARING. **ONE** defect was keeping it vacuous, not two.
     *
     * THE VACUITY, AND ALL OF IT. `AreaSelectedPanel.tsx:1044` routes to the zero-result recovery
     * stack only when `areaListings` is empty, and `:1092` is the sole site passing
     * `noun={intentNoun === 'rent' ? 'rentals' : 'homes'}`. `renderPanel` defaults to
     * `areaListings: [mockListing]`, so the panel took the CARD branch and the word could not
     * appear under any filter. Passing `areaListings: []` is the entire fix.
     *
     * ── SUPERSEDED CLAIM, kept because the reasoning was wrong in a way worth seeing ──────────
     *
     *   An earlier revision of this comment claimed a SECOND defect — that
     *   `document.body.textContent` joins adjacent nodes with no separator, so a real "Home"
     *   abutting the fixture's "Test Area" read as `HomeTest Area` and `\bhomes?\b` failed to
     *   match — and concluded that BOTH had to be fixed together or the arm stayed vacuous.
     *
     *   THAT CONJUNCTION IS FALSE, and it was settled by mutation rather than by argument:
     *   restoring the body-wide `document.body.textContent` scan while KEEPING
     *   `areaListings: []` still fails —
     *
     *     expected 'HomeTest AreaTest AreaDraw search are…' not to match /\bhomes?\b/i
     *
     *   so fixing the `areaListings` default ALONE makes this arm load-bearing. Why: the heading
     *   is one template literal with the noun spaced on both sides in all five branches
     *   (`AreaZeroResultRecovery.tsx:299-308`), rendered as a single text node at `:374`, so its
     *   word boundary is INTERIOR and no amount of sibling concatenation can hide it.
     *
     *   ONE HALF OF THE ORIGINAL CLAIM SURVIVES, AND THE CORRECTION SHOULD NOT OVERSHOOT IT.
     *   `HomeTest Area` is not fictional — it is right there in the mutation output. Its source is
     *   `AreaFirstBreadcrumb.tsx:113`'s `<span>Home</span>` abutting the area label, and that
     *   occurrence really is boundary-masked. What was wrong was the CONSEQUENCE drawn from it:
     *   the masked breadcrumb explains nothing about the old pass, because once the recovery stack
     *   renders there is a second, unmasked occurrence that matches. The old arm passed for
     *   defect 1 alone — no stack, no heading, no noun.
     *
     *   The error was diagnosing a second cause for an observation the first cause already fully
     *   explained, then promoting a real-but-irrelevant mechanism into a necessary one.
     *
     * ── WHY THE SCOPED LOCATOR STAYS ─────────────────────────────────────────────────────────
     *
     * It is a FALSE-POSITIVE guard, not a vacuity fix — and the breadcrumb above is the concrete
     * thing it guards against. A whole-body sweep has to reason about every unrelated legitimate
     * "Home"/"home" on the panel, and would be hostage to whether each one happens to sit at a
     * node edge. Scoping to the element that actually renders the noun is what keeps a failure
     * here attributable to the copy under test.
     *
     * The positive control is the `getByTestId` + `toBeVisible` pair immediately BELOW this
     * comment (`:711-712` at time of writing): it proves the branch rendered before the negative
     * assertion is trusted.
     *
     * It fails at this head for the right reason — the noun is chosen from INTENT alone and is
     * blind to the property family. The observed message is
     * `expected 'No matching homes in Test Area' not to match /\bhomes?\b/i`, which is the
     * `:308` branch. Note that is NOT the `cause === 'empty'` wording (`:305`, "has no homes
     * listed right now"): this test sets `propertyTypes`, so the cause is a filtered one. An
     * earlier revision of this comment quoted the `empty` wording and was wrong about which
     * branch it was reading.
     */
    it('never describes Commercial results as homes', () => {
      renderPanel({
        filters: { propertyTypes: ['commercial'] },
        areaListings: [],
        areaResultSummaryText: undefined,
      });

      const heading = screen.getByTestId('area-zero-recovery-heading');
      expect(heading).toBeVisible();
      expect(heading.textContent ?? '').not.toMatch(/\bhomes?\b/i);
    });
  });
});
