import { describe, it, expect } from 'vitest';

import { deriveDiscoverBadge } from './discoverBadge';

/**
 * Issue #2572 — the Commercial SUBTYPE axis must count as an active property filter.
 *
 * THE DEFECT THIS PINS, measured in a browser against the seeded fixture before the fix: on the
 * Shop arm the map overlay read "10 verified properties in Sanjeevini Nagar" while the card list
 * read "3 verified properties for sale in Sanjeevini Nagar" and the map legend itself read
 * Commercial 3 — two counts asserted about one area at the same moment.
 *
 * WHY IT REACHED PRODUCTION-SHAPED STATE ONLY NOW. `deriveDiscoverBadge`'s `hasPropertyFilters`
 * enumerates the axes it knows and omitted `commercialSubtypes` (the field was missing from the
 * input shape entirely). Under the one-axis contract a subtype selection rides `commercialSubtypes`
 * ALONE and sets no `propertyTypes`, so the predicate saw nothing narrowing and the badge fell back
 * to the unfiltered copy. Before the Commercial family became buyer-reachable, nobody could produce
 * that state.
 *
 * WHY THESE ARMS AND NOT MORE. The other paths already pass today and always did — that is exactly
 * what made this a one-condition fix rather than a feature — so only the subtype-only arm
 * discriminates. It is kept alongside a no-filter control and a propertyTypes control so the arm
 * cannot pass for the trivial reason that everything returns "filtered".
 */
describe('deriveDiscoverBadge — hasPropertyFilters (#2572)', () => {
  /** Area holds 10; the filtered response carries 3. M must be 3 and N must stay 10. */
  const baseInput = {
    selectedArea: { listingCount: 10 },
    isLoadingAreaListings: false,
    cityTotal: 100,
    areaListings: [{ id: '1' }, { id: '2' }, { id: '3' }],
  };

  it('counts a subtype-ONLY selection as an active property filter', () => {
    const badge = deriveDiscoverBadge({
      ...baseInput,
      filters: { commercialSubtypes: ['SHOP'] },
    });

    expect(
      badge.hasPropertyFilters,
      'a subtype rides commercialSubtypes alone and sets no propertyTypes — it is still a narrowing',
    ).toBe(true);
    expect(badge.hasActiveFilters).toBe(true);
    // The whole point: M and N must differ, so the copy can say "3 of 10 match your filters"
    // instead of reverting to the unfiltered "10 verified properties" beside a list showing 3.
    expect(badge.n).toBe(10);
    expect(badge.m).toBe(3);
  });

  /**
   * CONTROL 1 — without it, "always report filtered" would pass the arm above. No filter at all
   * must still read as unfiltered, with M equal to N.
   */
  it('reports no property filter when nothing is selected', () => {
    const badge = deriveDiscoverBadge({ ...baseInput, filters: {} });

    expect(badge.hasPropertyFilters).toBe(false);
    expect(badge.hasActiveFilters).toBe(false);
  });

  /**
   * CONTROL 2 — the path that already worked, pinned so the fix cannot be "corrected" later by
   * moving the omission onto the other axis. This is the arm that passed both before and after,
   * and it is why the defect read as a REVERSION rather than a constant: "All commercial" and a
   * mixed `?type=warehouse,apartment` selection both set `propertyTypes`, so both rendered the
   * filter-aware form correctly while only the subtype path fell through.
   */
  it('still counts a propertyTypes selection as an active property filter', () => {
    const badge = deriveDiscoverBadge({
      ...baseInput,
      filters: { propertyTypes: ['commercial', 'warehouse'] },
    });

    expect(badge.hasPropertyFilters).toBe(true);
    expect(badge.m).toBe(3);
  });

  /**
   * Issue #2572 — the AREA (SQ FT) axis: the same omission on a row that is UNGATED, so it reaches
   * every buyer rather than only Commercial ones.
   *
   * REPRODUCED IN THE RUNNING PRODUCT BEFORE BEING FIXED, and in ISOLATION — an area bound with no
   * family, no subtype and no budget, because the `commercialSubtypes` clause would otherwise have
   * masked it and produced a fix that fixed nothing. Measured: baseline 10 rows with the overlay
   * reading "10 verified properties in Sanjeevini Nagar"; then "1,000+ sq ft" alone narrowed the
   * list to one row while the overlay still read "10 verified properties" beside a list reading
   * "1 verified property for sale" — the identical two-counts-at-once contradiction.
   */
  it('counts an area bound ALONE as an active property filter', () => {
    const badge = deriveDiscoverBadge({
      ...baseInput,
      filters: { areaMinSqft: 1000 },
    });

    expect(
      badge.hasPropertyFilters,
      'an area bound narrows the list, so the badge must not keep reporting the unfiltered total',
    ).toBe(true);
    expect(badge.n).toBe(10);
    expect(badge.m).toBe(3);
  });

  /**
   * The upper bound is a SEPARATE field: a fix that added only `areaMinSqft` would pass the arm
   * above and still leave a max-only narrowing reporting the unfiltered total.
   */
  it('counts an areaMaxSqft-only bound as an active property filter', () => {
    const badge = deriveDiscoverBadge({ ...baseInput, filters: { areaMaxSqft: 5000 } });

    expect(badge.hasPropertyFilters).toBe(true);
  });
});
