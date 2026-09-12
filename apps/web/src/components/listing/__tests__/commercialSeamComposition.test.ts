/**
 * Issue #2432 — the seam between #2458's identity resolver and #2430's label authority.
 *
 * These are two separate functions over the same two raw axes, and they must agree for every input.
 * `getPropertyTypeLabel` is the label authority; `resolveBuyerCommercialSubtype` is the identity
 * authority. The intended relationship is `label(identity(row))` — the label a row gets must be the
 * label its resolved identity gets. If the two ever disagree for one input, a buyer sees an identity
 * on one surface and a different one on another, and neither function owns the discrepancy.
 *
 * This is written against the real symbols. It was deliberately NOT stubbed while the resolver was
 * unavailable: a stub that trivially passes gets counted as coverage while proving nothing.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveBuyerCommercialSubtype,
  getPropertyTypeLabel,
  BUYER_COMMERCIAL_SUBTYPES,
  BUYER_SUBTYPE_TO_PROPERTY_TYPE,
  type BuyerCommercialSubtype,
} from '@/lib/propertyTypeConfig';
import { buildCommercialDetailModel, isCommercialListing } from '../commercialDetailModel';
import type { PublicListingDetail } from '@/pages/ListingDetail';

/** The raw storage axes a real row can present, including every legacy shape. */
const ROWS: Array<{ propertyType: string; commercialSubtype: string | null; note: string }> = [
  { propertyType: 'commercial', commercialSubtype: 'SHOP', note: 'typed shop' },
  { propertyType: 'commercial', commercialSubtype: 'OFFICE', note: 'typed office' },
  { propertyType: 'commercial', commercialSubtype: null, note: 'legacy generic (V102 NULL)' },
  { propertyType: 'commercial', commercialSubtype: '', note: 'blank subtype' },
  { propertyType: 'commercial', commercialSubtype: 'NOT_A_REAL_CODE', note: 'unknown subtype' },
  { propertyType: 'commercial_building', commercialSubtype: null, note: 'legacy building' },
  { propertyType: 'commercial_building', commercialSubtype: 'BUILDING', note: 'typed building' },
  { propertyType: 'warehouse', commercialSubtype: null, note: 'legacy warehouse' },
  { propertyType: 'commercial_land', commercialSubtype: null, note: 'legacy land' },
  { propertyType: 'apartment', commercialSubtype: null, note: 'residential' },
  { propertyType: 'agricultural_land', commercialSubtype: null, note: 'agricultural' },
];

describe('seam — label(identity(row)) composition', () => {
  it.each(ROWS)(
    'label of the row equals label of its resolved identity — $note',
    ({ propertyType, commercialSubtype }) => {
      const identity = resolveBuyerCommercialSubtype(propertyType, commercialSubtype);
      const rowLabel = getPropertyTypeLabel(propertyType, commercialSubtype);

      if (identity === null) {
        // Honest absence: the row falls back to its property type's own label. It must never
        // acquire a Shop/Office label it does not carry.
        expect(rowLabel).toBe(getPropertyTypeLabel(propertyType, null));
        return;
      }

      // A resolved identity must label identically however it is reached — directly from the row's
      // axes, or by re-deriving the axes from the identity itself.
      expect(rowLabel).toBe(
        getPropertyTypeLabel(BUYER_SUBTYPE_TO_PROPERTY_TYPE[identity], identity),
      );
    },
  );

  it('never labels a legacy generic commercial row as Shop or Office', () => {
    // #1742 — the failure this whole lane guards against.
    const identity = resolveBuyerCommercialSubtype('commercial', null);
    expect(identity).toBeNull();
    expect(getPropertyTypeLabel('commercial', null)).toBe('Commercial');
  });

  it.each([...BUYER_COMMERCIAL_SUBTYPES])(
    'round-trips %s through its stored property type back to the same identity',
    (subtype) => {
      const storedType = BUYER_SUBTYPE_TO_PROPERTY_TYPE[subtype as BuyerCommercialSubtype];
      expect(resolveBuyerCommercialSubtype(storedType, subtype)).toBe(subtype);
    },
  );

  it('gives every buyer subtype a distinct, non-raw label', () => {
    const labels = BUYER_COMMERCIAL_SUBTYPES.map((s) =>
      getPropertyTypeLabel(BUYER_SUBTYPE_TO_PROPERTY_TYPE[s as BuyerCommercialSubtype], s),
    );
    expect(new Set(labels).size).toBe(BUYER_COMMERCIAL_SUBTYPES.length);
    for (const l of labels) expect(l).not.toMatch(/^[A-Z][A-Z0-9_]*$/);
  });
});

describe('seam — the model agrees with the resolver about what is commercial', () => {
  it.each(ROWS)('$note', ({ propertyType, commercialSubtype }) => {
    const identity = resolveBuyerCommercialSubtype(propertyType, commercialSubtype);
    const listing = { id: 'l1', propertyType, commercialSubtype, images: [], carpetArea: 500 } as PublicListingDetail;
    const groups = buildCommercialDetailModel(listing, identity);

    if (isCommercialListing(propertyType)) {
      // A commercial row with a populated fact must render something, subtype or not.
      expect(groups.length).toBeGreaterThan(0);
    } else {
      // A non-commercial row renders nothing, and the resolver agrees it has no identity.
      expect(identity).toBeNull();
      expect(groups).toEqual([]);
    }
  });

  it('resolves a legacy building/warehouse/land row to its identity rather than null', () => {
    // These carry NO subtype on any axis — V102 backfilled only property_type='commercial' —
    // so a resolver that consulted the subtype axis first would drop them into the generic branch.
    expect(resolveBuyerCommercialSubtype('commercial_building', null)).toBe('BUILDING');
    expect(resolveBuyerCommercialSubtype('warehouse', null)).toBe('WAREHOUSE');
    expect(resolveBuyerCommercialSubtype('commercial_land', null)).toBe('LAND');
  });
});
