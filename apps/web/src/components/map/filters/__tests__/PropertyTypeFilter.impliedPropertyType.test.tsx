/**
 * HOTFIX — a picked subtype must imply ITS OWN property type, not a fixed `commercial`.
 *
 * THE DEFECT (shipped, buyer-visible, HTTP 200 with zero results). `handleSubtypeChange`
 * appended `SUBTYPE_BEARING_PROPERTY_TYPE` (`'commercial'`) for every subtype. Only SHOP and
 * OFFICE live in `property_type='commercial'`; BUILDING, WAREHOUSE and LAND are self-describing
 * types (`commercial_building`, `warehouse`, `commercial_land`).
 *
 * So picking Warehouse emitted `type=commercial&subtype=WAREHOUSE`. The server's #2458
 * family/subtype union reads that as:
 *
 *     AND ( pl.property_type IN ('commercial')
 *           AND EXISTS (... UPPER(commercial_subtype) IN ('WAREHOUSE')) )
 *
 * `impliedPropertyTypes` is NOT consulted, because it only runs when the request carries no
 * explicit property types (`hasTypes` is true here). A warehouse row is `property_type='warehouse'`
 * and fails the `IN ('commercial')` test; no `'commercial'` row carries a WAREHOUSE subtype. The
 * set is empty for structural reasons — three buyer-visible filters returning nothing, with no
 * error to notice.
 *
 * WHY THESE ASSERT EMITTED PARAMS. The emitted filter state is the defect: the request shape is
 * wrong before it leaves the browser. Asserting it here is failure-sensitive regardless of what
 * inventory exists, so it cannot be weakened by an empty or changed fixture. The end-to-end arms
 * over real Commercial inventory are separate and additional, not a substitute.
 *
 * THE NAIVE FIX THIS GUARDS AGAINST. Simply not appending the family token makes Shop-alone,
 * Warehouse-alone and every other single selection correct, and silently breaks MIXED selections
 * the moment a bearing subtype and a self-describing one are chosen together. `mixed Shop +
 * Warehouse` below is the arm that catches it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyTypeFilter } from '../PropertyTypeFilter';
import { BUYER_SUBTYPE_TO_PROPERTY_TYPE } from '@/lib/propertyTypeConfig';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

function renderFilter(filters: PropertyFilters = {}) {
  const onFiltersChange = vi.fn();
  const view = render(
    <PropertyTypeFilter filters={filters} onFiltersChange={onFiltersChange} />,
  );
  return { onFiltersChange, view };
}

/**
 * Targets the SUBTYPE checkbox by the component's own id.
 *
 * `getByLabelText('Warehouse')` is ambiguous here and throws: the property-type grid has a
 * "Warehouse" checkbox and the subtype row has one too — which is itself part of why the wrong
 * token went unnoticed, since the two controls read identically on screen.
 */
function subtypeCheckbox(view: ReturnType<typeof render>, value: string): HTMLElement {
  const el = view.container.querySelector<HTMLElement>(`#subtype-${value}`);
  if (!el) throw new Error(`subtype checkbox #subtype-${value} not found`);
  return el;
}

/** The property type each buyer subtype actually lives in — mirrors the server mapping. */
const SELF_DESCRIBING = [
  { label: 'Commercial building', subtype: 'BUILDING', impliedType: 'commercial_building' },
  { label: 'Warehouse', subtype: 'WAREHOUSE', impliedType: 'warehouse' },
  { label: 'Commercial land', subtype: 'LAND', impliedType: 'commercial_land' },
] as const;

const BEARING = [
  { label: 'Shop', subtype: 'SHOP' },
  { label: 'Office', subtype: 'OFFICE' },
] as const;

describe('a picked subtype implies its own property type', () => {
  describe('self-describing subtypes — the shipped defect', () => {
    it.each(SELF_DESCRIBING)(
      '$label implies $impliedType, and NOT the bearing commercial token',
      async ({ subtype, impliedType }) => {
        const user = userEvent.setup();
        const { onFiltersChange, view } = renderFilter();

        await user.click(subtypeCheckbox(view, subtype));

        const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
        expect(emitted.commercialSubtypes).toEqual([subtype]);
        expect(emitted.propertyTypes).toContain(impliedType);

        // The defect itself: `commercial` alongside a self-describing subtype is a set no row
        // can be in, so the buyer gets zero results and no error.
        expect(
          emitted.propertyTypes,
          `${subtype} must not be paired with 'commercial' — ` +
            `that AND-combination matches zero rows and fails silently`,
        ).not.toContain('commercial');
      },
    );
  });

  describe('bearing subtypes — must keep working', () => {
    it.each(BEARING)('$label still implies the commercial family', async ({ subtype }) => {
      const user = userEvent.setup();
      const { onFiltersChange, view } = renderFilter();

      await user.click(subtypeCheckbox(view, subtype));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      expect(emitted.commercialSubtypes).toEqual([subtype]);
      // SHOP and OFFICE genuinely DO live in property_type='commercial'. A fix that merely
      // stopped appending the family token would break these two and pass everything above.
      expect(emitted.propertyTypes).toContain('commercial');
    });
  });

  describe('mixed selection — the arm a naive fix fails', () => {
    it('Shop + Warehouse implies BOTH commercial and warehouse', async () => {
      const user = userEvent.setup();
      const first = renderFilter();

      await user.click(subtypeCheckbox(first.view, 'SHOP'));
      // Re-render with the state the first click produced, the way the real controller does.
      const afterShop = first.onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      first.view.unmount();

      const second = renderFilter(afterShop);
      await user.click(subtypeCheckbox(second.view, 'WAREHOUSE'));

      const emitted = second.onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      expect(emitted.commercialSubtypes).toEqual(
        expect.arrayContaining(['SHOP', 'WAREHOUSE']),
      );
      // Both branches of the server union need their type present: the warehouse row matches on
      // property_type, the shop row on subtype. Dropping either yields a half-empty result the
      // buyer cannot distinguish from "nothing matched".
      expect(emitted.propertyTypes).toEqual(
        expect.arrayContaining(['commercial', 'warehouse']),
      );
    });
  });

  /**
   * THE REVERSE PATH — unticking a property TYPE.
   *
   * `handleSubtypeChange` and `handleTypeChange` describe the same relationship from opposite
   * ends, so both must agree that a subtype belongs to its OWN implied type. Keying the clear on
   * a single bearing token left the two handlers disagreeing, and neither the unit nor the browser
   * arm exercised deselection at all — which is why it survived three passes.
   */
  describe('unticking a property type clears only the subtypes that lived in it', () => {
    /**
     * Regression: a subtype stranded without its type. The server intersects `nonBearing` with
     * `namedBySubtypes`, finds nothing, and emits literal `AND FALSE` — silent zero results.
     */
    it('unticking Warehouse clears WAREHOUSE rather than stranding it', async () => {
      const user = userEvent.setup();
      const { onFiltersChange, view } = renderFilter({
        propertyTypes: ['apartment', 'warehouse'],
        commercialSubtypes: ['WAREHOUSE'],
      });

      await user.click(view.container.querySelector<HTMLElement>('#type-warehouse')!);

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      expect(emitted.propertyTypes).toEqual(['apartment']);
      expect(
        emitted.commercialSubtypes ?? [],
        'a subtype left without its property type produces AND FALSE — zero rows, no error',
      ).toEqual([]);
    });

    /**
     * The mirror, pre-existing: unticking `commercial` used to clear BUILDING / WAREHOUSE / LAND
     * too, silently discarding selections that never lived in that type.
     */
    it('unticking Commercial keeps self-describing subtypes that never lived there', async () => {
      const user = userEvent.setup();
      const { onFiltersChange, view } = renderFilter({
        propertyTypes: ['commercial', 'warehouse'],
        commercialSubtypes: ['SHOP', 'WAREHOUSE'],
      });

      await user.click(view.container.querySelector<HTMLElement>('#type-commercial')!);

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      // SHOP lived in 'commercial' and goes with it; WAREHOUSE did not and must survive.
      expect(emitted.commercialSubtypes).toEqual(['WAREHOUSE']);
      expect(emitted.propertyTypes).toEqual(['warehouse']);
    });

    /** #2431's intent preserved: a subtype whose implying type is gone is still cleared. */
    it('unticking Commercial still clears SHOP, leaving no invisible filter', async () => {
      const user = userEvent.setup();
      const { onFiltersChange, view } = renderFilter({
        propertyTypes: ['commercial'],
        commercialSubtypes: ['SHOP'],
      });

      await user.click(view.container.querySelector<HTMLElement>('#type-commercial')!);

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      expect(emitted.commercialSubtypes ?? []).toEqual([]);
    });

    it('ticking a type leaves subtype selections untouched', async () => {
      const user = userEvent.setup();
      const { onFiltersChange, view } = renderFilter({
        propertyTypes: ['warehouse'],
        commercialSubtypes: ['WAREHOUSE'],
      });

      await user.click(view.container.querySelector<HTMLElement>('#type-apartment')!);

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      expect(emitted.commercialSubtypes).toEqual(['WAREHOUSE']);
    });
  });

  /**
   * THE OTHER DESELECTION PATH — unticking a SUBTYPE (issue #2532).
   *
   * `handleTypeChange` above releases the subtypes that lived in a type being unticked. The
   * mirror was never written: `handleSubtypeChange` only ever UNIONED implied types, so a type a
   * subtype had selected FOR the buyer outlived that subtype's removal.
   *
   * THE BUYER-VISIBLE CONSEQUENCE IS NOT THE ZERO-RESULT CLASS the type direction produces. A
   * stranded TYPE widens results; a stranded SUBTYPE empties them. Measured on this branch:
   *
   *   - MAP MARKERS — `buildDiscoverSearchParams` emits EVERY selected property type, so
   *     `type=commercial,warehouse&subtype=SHOP` goes on matching warehouse rows by
   *     property_type. The buyer unticked Warehouse and still receives warehouses.
   *   - RESULT CARDS — worse at the time of writing. `useDiscoverMapData`'s
   *     `discoverPropertyType` derivation sends a property type only when EXACTLY ONE is
   *     selected, so a stranded second token makes it `undefined`, dropping the type filter
   *     ALTOGETHER — a Commercial selection then shows apartments, houses and land.
   *
   * Cited by SYMBOL, not by line: #2533/#2559 are actively reworking that single-value collapse
   * (five such sites, not three), so any line number here would be stale on their merge. The
   * second bullet is therefore CONDITIONAL on the collapse still existing. NOTHING BELOW DEPENDS
   * ON IT — releasing an orphaned implied type is correct either way, and the marker bullet holds
   * regardless.
   *
   * One change fixes both: releasing an implied type the moment nothing implies it collapses the
   * mixed case back to a single token, which is also what restores the card-list filter.
   *
   * WHY THE RULE IS MECHANICAL RATHER THAN PROVENANCE-BASED. Nothing in state distinguishes "the
   * buyer ticked this type in the grid" from "a subtype selected it for them": `PropertyFilters`
   * carries no origin field, and `serializeFilters` writes no origin param. So the rule keeps any
   * selected type that NO subtype can imply, plus the implied types of the subtypes that REMAIN.
   * The arms below pin what follows from that — including the one case where it is knowingly
   * wrong, which is asserted rather than left to be discovered.
   */
  describe('unticking a subtype releases the property type it implied (#2532)', () => {
    it('mixed pair — unticking Warehouse leaves Shop alone, not Shop plus every warehouse', async () => {
      const user = userEvent.setup();
      const { onFiltersChange, view } = renderFilter({
        propertyTypes: ['commercial', 'warehouse'],
        commercialSubtypes: ['SHOP', 'WAREHOUSE'],
      });

      await user.click(subtypeCheckbox(view, 'WAREHOUSE'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      expect(emitted.commercialSubtypes).toEqual(['SHOP']);
      expect(
        emitted.propertyTypes,
        "'warehouse' was selected only because WAREHOUSE implied it — unticking WAREHOUSE must " +
          'release it, or the buyer keeps receiving the very rows they just excluded',
      ).toEqual(['commercial']);
    });

    it('last subtype, self-describing — unticking Warehouse leaves no filter behind', async () => {
      const user = userEvent.setup();
      const { onFiltersChange, view } = renderFilter({
        propertyTypes: ['warehouse'],
        commercialSubtypes: ['WAREHOUSE'],
      });

      await user.click(subtypeCheckbox(view, 'WAREHOUSE'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      expect(emitted.commercialSubtypes).toBeUndefined();
      expect(emitted.propertyTypes).toBeUndefined();
    });

    /**
     * THE BEHAVIOUR CHANGE THIS PR ASKS TO RATIFY, stated as an assertion so it cannot ship
     * unnoticed. Today unticking Shop RETAINS `commercial`, leaving the buyer filtered to the
     * whole Commercial family after removing the only thing that selected it. Releasing it is
     * the same rule the other four subtypes get; treating the bearing token as special is what
     * made the two handlers disagree in the first place.
     */
    it('last subtype, bearing — unticking Shop also releases commercial', async () => {
      const user = userEvent.setup();
      const { onFiltersChange, view } = renderFilter({
        propertyTypes: ['commercial'],
        commercialSubtypes: ['SHOP'],
      });

      await user.click(subtypeCheckbox(view, 'SHOP'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      expect(emitted.commercialSubtypes).toBeUndefined();
      expect(emitted.propertyTypes).toBeUndefined();
    });

    /**
     * THE CONTROL that a naive "always drop the implied token" fix fails. SHOP and OFFICE share
     * one implied type, so removing SHOP while OFFICE remains must NOT release `commercial` —
     * doing so would strand OFFICE and recreate the `AND FALSE` silent-zero class the #2530
     * hotfix removed.
     */
    it('keeps commercial while a sibling bearing subtype still needs it', async () => {
      const user = userEvent.setup();
      const { onFiltersChange, view } = renderFilter({
        propertyTypes: ['commercial'],
        commercialSubtypes: ['SHOP', 'OFFICE'],
      });

      await user.click(subtypeCheckbox(view, 'SHOP'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      expect(emitted.commercialSubtypes).toEqual(['OFFICE']);
      expect(emitted.propertyTypes).toEqual(['commercial']);
    });

    it('a selected type that no subtype implies survives untouched', async () => {
      const user = userEvent.setup();
      const { onFiltersChange, view } = renderFilter({
        propertyTypes: ['apartment', 'warehouse'],
        commercialSubtypes: ['WAREHOUSE'],
      });

      await user.click(subtypeCheckbox(view, 'WAREHOUSE'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      // 'apartment' is unreachable from any subtype, so no subtype's removal may touch it.
      expect(emitted.propertyTypes).toEqual(['apartment']);
    });

    /**
     * The hotfix's defect class approached from this side: a SURVIVING subtype must never lose
     * the type that carries it, or the server intersects incompatible families and emits literal
     * `AND FALSE` — zero rows, HTTP 200, no error. Asserted over the whole surviving set rather
     * than one hardcoded pair, so a future vocabulary addition is covered too.
     */
    it('never strands a surviving subtype without its implied type', async () => {
      const user = userEvent.setup();
      const { onFiltersChange, view } = renderFilter({
        propertyTypes: ['commercial', 'commercial_building', 'warehouse'],
        commercialSubtypes: ['SHOP', 'BUILDING', 'WAREHOUSE'],
      });

      await user.click(subtypeCheckbox(view, 'BUILDING'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      const surviving = emitted.commercialSubtypes ?? [];
      expect(surviving).toEqual(['SHOP', 'WAREHOUSE']);
      for (const s of surviving) {
        expect(
          emitted.propertyTypes ?? [],
          `${s} lost its implied type — that pairing matches zero rows and fails silently`,
        ).toContain(BUYER_SUBTYPE_TO_PROPERTY_TYPE[s]);
      }
      // ...and the type the REMOVED subtype implied is the one that goes.
      expect(emitted.propertyTypes).not.toContain('commercial_building');
    });

    /**
     * KNOWN COLLATERAL — asserted, not hidden.
     *
     * A buyer who ticks Warehouse in the TYPE grid AND the WAREHOUSE subtype has made two
     * selections that state records as one token. Unticking the subtype therefore also releases
     * the grid selection. This is visible (the grid checkbox unticks) and recoverable (re-tick
     * it), but it is not what the buyer asked for.
     *
     * It is inherent to having no provenance, NOT to this rule: with `propertyTypes: ['warehouse']`
     * carrying no origin, the two cases are the same value and no mechanical rule can separate
     * them. Fixing it properly needs a provenance field AND a URL param (it must survive reload
     * and back/forward), which is #2458's canonical URL-contract domain. Pinned here so that a
     * future provenance change has a test to flip rather than a surprise to discover.
     */
    it('KNOWN COLLATERAL: a grid-ticked type that a subtype also implies is released too', async () => {
      const user = userEvent.setup();
      const { onFiltersChange, view } = renderFilter({
        propertyTypes: ['warehouse'],
        commercialSubtypes: ['WAREHOUSE'],
      });

      await user.click(subtypeCheckbox(view, 'WAREHOUSE'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      expect(emitted.propertyTypes).toBeUndefined();
    });
  });

  describe('no stale token accumulates', () => {
    it('does not duplicate an already-selected type', async () => {
      const user = userEvent.setup();
      const { onFiltersChange, view } = renderFilter({ propertyTypes: ['commercial'] });

      await user.click(subtypeCheckbox(view, 'SHOP'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      expect(emitted.propertyTypes).toEqual(['commercial']);
    });

    it('preserves an unrelated selected type rather than replacing it', async () => {
      const user = userEvent.setup();
      const { onFiltersChange, view } = renderFilter({ propertyTypes: ['apartment'] });

      await user.click(subtypeCheckbox(view, 'WAREHOUSE'));

      const emitted = onFiltersChange.mock.calls.at(-1)?.[0] as PropertyFilters;
      expect(emitted.propertyTypes).toEqual(
        expect.arrayContaining(['apartment', 'warehouse']),
      );
    });
  });
});
