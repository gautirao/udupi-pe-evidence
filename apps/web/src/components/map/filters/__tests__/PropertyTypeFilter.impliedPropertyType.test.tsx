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
