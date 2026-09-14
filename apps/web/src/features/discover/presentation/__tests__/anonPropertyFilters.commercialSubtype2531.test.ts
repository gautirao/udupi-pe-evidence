/**
 * applyAnonPropertyFilters — Issue #2531, the DELIBERATE non-change.
 *
 * #2531 asked whether the client-side compensation layer needs a `commercialSubtypes`
 * branch now that the server narrows the anon city-listings path. The answer is NO, and
 * this spec exists to stop a future reader from "fixing" the apparent omission.
 *
 * WHY NOT. `applyAnonPropertyFilters` is shared by THREE feeds:
 *
 *   1. useSchoolListings.ts:98        → /school-radius-listings  (PublicSchoolRadiusListingCard)
 *   2. useDiscoverGroupResults.ts:97  → city-listings            (DiscoverCityListingItem)
 *   3. NodeListingsSurface.tsx:201    → city-listings            (DiscoverCityListingItem)
 *
 * The school feed structurally CANNOT carry a commercial subtype — the field is absent
 * from its 20-field anon contract (see DiscoverCityListingItem's three-feed caveat:
 * "the school feed is the ONLY one where absence means 'this endpoint cannot carry it'").
 * So a subtype branch in this shared helper would evaluate `l.commercialSubtype == null`
 * for EVERY school-radius row and exclude all of them — silently emptying the anon
 * school-first list the moment a buyer picks a subtype.
 *
 * That is exactly the false-empty failure this codebase has already hit twice and
 * documented in place: backOnMarket/newToMarket/readyToMove are STRIPPED before
 * delegation (useDiscoverGroupResults.ts:73-76), and readyToMove is excluded again in
 * NodeListingsSurface.tsx:191-197, both because the backing field is absent from the
 * feed. A subtype branch would be a third instance of the same bug.
 *
 * On the two city-listings feeds the server is now authoritative (#2509 backend, #2531
 * forwarding), so client compensation is unnecessary there as well as unsafe here.
 *
 * The callers pass the full PropertyFilters object — including `commercialSubtypes` —
 * without stripping it (useSchoolListings.ts:98 passes `filters` whole). That is SAFE
 * only as long as this helper never reads the key. These tests pin that invariant.
 */
import { describe, it, expect } from 'vitest';
import { applyAnonPropertyFilters } from '../anonPropertyFilters';

type Item = Parameters<typeof applyAnonPropertyFilters>[0][number];

/** A city-listings row: carries the subtype. */
const OFFICE = { id: 'office', propertyType: 'commercial', commercialSubtype: 'OFFICE' } as Item;
const SHOP = { id: 'shop', propertyType: 'commercial', commercialSubtype: 'SHOP' } as Item;
/** A school-radius row: the feed cannot carry a subtype at all, so the field is absent. */
const SCHOOL_FEED_ROW = { id: 'school-row', propertyType: 'commercial' } as Item;

describe('applyAnonPropertyFilters — does NOT filter by commercialSubtypes (#2531)', () => {
  /**
   * The load-bearing assertion. If someone adds a subtype branch, the school-feed row
   * (no subtype field) is excluded and this fails — which is the whole point: the
   * failure surfaces here, at the shared helper, rather than as an empty school-first
   * list in production.
   */
  it('keeps a row whose feed cannot express a subtype, even when a subtype is selected', () => {
    const out = applyAnonPropertyFilters(
      [SCHOOL_FEED_ROW],
      { commercialSubtypes: ['OFFICE'] } as Parameters<typeof applyAnonPropertyFilters>[1],
    );
    expect(out.map((l) => l.id)).toEqual(['school-row']);
  });

  /**
   * The server is authoritative on the city-listings path: this helper must not
   * second-guess it. A SHOP row survives an OFFICE selection here because narrowing is
   * the server's job — re-applying it client-side is what would double-filter a
   * correctly-narrowed set.
   */
  it('is inert on subtype-carrying rows — the server already narrowed them', () => {
    const out = applyAnonPropertyFilters(
      [OFFICE, SHOP],
      { commercialSubtypes: ['OFFICE'] } as Parameters<typeof applyAnonPropertyFilters>[1],
    );
    expect(out.map((l) => l.id)).toEqual(['office', 'shop']);
  });

  /**
   * Control arm, same query shape: the helper still filters by the axes it DOES own,
   * varying only the subtype key. Without this, a helper that had stopped filtering
   * entirely (or that received no rows) would pass both assertions above vacuously.
   */
  it('still applies the axes it does own, so the two tests above are not vacuous', () => {
    const out = applyAnonPropertyFilters(
      [OFFICE, SHOP, { id: 'flat', propertyType: 'apartment' } as Item],
      { propertyTypes: ['apartment'] },
    );
    expect(out.map((l) => l.id)).toEqual(['flat']);
  });
});
