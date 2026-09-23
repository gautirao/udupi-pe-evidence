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
 * At the time this was written, the school feed structurally could NOT carry a
 * commercial subtype at all — the field was absent from its anon contract. #2516 has
 * since added `commercialSubtype`/`commercialFacts` to `PublicSchoolRadiusListingCard`
 * (see `DiscoverCityListingItem`'s three-feed caveat in `useDiscoverCityListings.ts`),
 * so a row from that feed CAN now carry a resolved subtype. It can still be absent,
 * though — a legacy `property_type='commercial'` row whose Shop-vs-Office was never
 * recorded reports `commercialSubtype: null` on every feed, this one included. So a
 * subtype branch in this shared helper would still evaluate `l.commercialSubtype == null`
 * for such a row and exclude it — silently emptying part of the anon school-first list
 * the moment a buyer picks a subtype, for exactly the population #2516 fixed the FEED
 * gap for but did not (and does not) change the ABSENCE case for.
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

/** A row whose subtype was recorded and resolved — on any feed, as of #2516. */
const OFFICE = { id: 'office', propertyType: 'commercial', commercialSubtype: 'OFFICE' } as Item;
const SHOP = { id: 'shop', propertyType: 'commercial', commercialSubtype: 'SHOP' } as Item;
/**
 * A legacy `commercial` row whose Shop-vs-Office was never recorded, so
 * `commercialSubtype` is absent — reachable on any feed (this fixture models the
 * school-radius feed specifically, which is why it is the one used below), not only
 * the one that, before #2516, could not carry the field at all.
 */
const SCHOOL_FEED_ROW = { id: 'school-row', propertyType: 'commercial' } as Item;

describe('applyAnonPropertyFilters — does NOT filter by commercialSubtypes (#2531)', () => {
  /**
   * The load-bearing assertion. If someone adds a subtype branch, the row with no
   * resolved subtype is excluded and this fails — which is the whole point: the
   * failure surfaces here, at the shared helper, rather than as an empty school-first
   * list in production.
   */
  it('keeps a row with no resolved subtype, even when a subtype is selected', () => {
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
