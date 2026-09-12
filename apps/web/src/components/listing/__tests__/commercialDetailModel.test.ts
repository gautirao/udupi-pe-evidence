/**
 * Issue #2432 — subtype matrix, honest-null behaviour and generic-row supersession.
 *
 * The model is pure, so the six subtype arms are function calls rather than renders.
 */

import { describe, it, expect } from 'vitest';
import {
  buildCommercialDetailModel,
  supersededGenericSpecs,
  isCommercialListing,
  type CommercialDetailSubtype,
} from '../commercialDetailModel';
import type { PublicListingDetail } from '@/pages/ListingDetail';

function listing(over: Partial<PublicListingDetail> = {}): PublicListingDetail {
  return { id: 'l1', propertyType: 'commercial', images: [], ...over } as PublicListingDetail;
}

/** Flattens groups to `key -> value` for concise assertions. */
function facts(groups: ReturnType<typeof buildCommercialDetailModel>): Record<string, string> {
  return Object.fromEntries(groups.flatMap((g) => g.facts.map((f) => [f.key, f.value])));
}

function factKeys(groups: ReturnType<typeof buildCommercialDetailModel>): string[] {
  return groups.flatMap((g) => g.facts.map((f) => f.key));
}

/** A row with every typed commercial field populated, used to probe per-subtype gating. */
const FULLY_POPULATED: Partial<PublicListingDetail> = {
  carpetArea: 1200,
  commercialAreaUnit: 'SQ_FT',
  commercialAvailability: 'IMMEDIATE',
  commercialFurnishingStatus: 'PLUG_AND_PLAY',
  occupancyStatus: 'PARTLY_OCCUPIED',
  floorChoice: 'GROUND_FLOOR',
  floorMode: 'WHOLE_BUILDING',
  hubType: 'HIGH_STREET',
  parkingPublicCount: 10,
  parkingPrivateCount: 4,
  washroomsPublic: 2,
  washroomsPrivate: 1,
  powerLoadKva: 25,
  utilities: ['POWER', 'CCTV'],
  officeSeats: 40,
  officeCabins: 3,
  officeMeetingRooms: 2,
  warehouseClearHeightFt: 24,
  warehouseLoadingBays: 3,
  warehouseTruckAccess: true,
  warehouseFlooring: 'EPOXY_COATED',
  commercialZoning: 'Mixed commercial',
  commercialOwnership: 'FREEHOLD',
  commercialApprovals: 'CC and OC obtained',
  currentMonthlyIncomePaise: 15000000,
  expectedRentalYieldPct: 6.5,
  leaseTermMonths: 36,
  leaseEscalationPct: 5,
  suitableUses: ['RETAIL'],
};

describe('isCommercialListing', () => {
  it.each(['commercial', 'commercial_building', 'warehouse', 'commercial_land'])(
    'treats %s as commercial',
    (t) => expect(isCommercialListing(t)).toBe(true),
  );

  it.each(['apartment', 'house', 'villa', 'residential_plot', 'agricultural_land', '', null])(
    'treats %s as not commercial',
    (t) => expect(isCommercialListing(t as string)).toBe(false),
  );
});

describe('buildCommercialDetailModel — non-commercial listings', () => {
  it('renders nothing for a residential listing even when commercial columns are somehow set', () => {
    const groups = buildCommercialDetailModel(
      listing({ propertyType: 'apartment', ...FULLY_POPULATED }),
      null,
    );
    expect(groups).toEqual([]);
  });
});

describe('buildCommercialDetailModel — subtype matrix', () => {
  it('SHOP shows floor/hub and facilities, and no office or warehouse group', () => {
    const g = buildCommercialDetailModel(listing(FULLY_POPULATED), 'SHOP');
    const keys = factKeys(g);
    expect(keys).toContain('hub-type');
    expect(keys).toContain('washrooms-public');
    expect(keys).not.toContain('office-seats');
    expect(keys).not.toContain('clear-height');
    expect(keys).not.toContain('zoning');
  });

  it('OFFICE shows workspace capacity', () => {
    const g = buildCommercialDetailModel(listing(FULLY_POPULATED), 'OFFICE');
    expect(facts(g)['office-seats']).toBe('40');
    expect(facts(g)['office-cabins']).toBe('3');
    expect(factKeys(g)).not.toContain('clear-height');
  });

  it('BUILDING shows floors-offered and occupancy, not office capacity', () => {
    const g = buildCommercialDetailModel(listing(FULLY_POPULATED), 'BUILDING');
    expect(facts(g)['floor-mode']).toBe('Whole building');
    expect(facts(g).occupancy).toBe('Partly occupied');
    expect(factKeys(g)).not.toContain('office-seats');
  });

  it('WAREHOUSE shows clear height, bays, truck access and flooring', () => {
    const g = buildCommercialDetailModel(listing(FULLY_POPULATED), 'WAREHOUSE');
    expect(facts(g)).toMatchObject({
      'clear-height': '24 ft',
      'loading-bays': '3',
      'truck-access': 'Yes',
      flooring: 'Epoxy coated',
    });
    expect(factKeys(g)).not.toContain('hub-type');
  });

  it('LAND shows zoning, ownership and approvals, and no facilities group', () => {
    const g = buildCommercialDetailModel(listing(FULLY_POPULATED), 'LAND');
    expect(facts(g)).toMatchObject({
      zoning: 'Mixed commercial',
      ownership: 'Freehold',
      approvals: 'CC and OC obtained',
    });
    expect(factKeys(g)).not.toContain('washrooms-public');
    expect(factKeys(g)).not.toContain('clear-height');
  });

  it('GENERIC legacy row (null subtype) surfaces every populated fact rather than hiding them', () => {
    // #1742: a legacy row has no subtype to gate on. Gating it to an empty set would silently
    // discard facts the broker actually entered, which is the exact failure this guards.
    const g = buildCommercialDetailModel(listing(FULLY_POPULATED), null);
    const keys = factKeys(g);
    expect(keys).toEqual(
      expect.arrayContaining(['hub-type', 'office-seats', 'clear-height', 'zoning', 'washrooms-public']),
    );
  });

  it('never infers a Shop/Office classification for a legacy row', () => {
    // The model must not fabricate a subtype; it only ever reflects what it was handed.
    const g = buildCommercialDetailModel(listing({ carpetArea: 900 }), null);
    expect(JSON.stringify(g)).not.toMatch(/Shop|Office/);
  });
});

describe('buildCommercialDetailModel — honest absence', () => {
  it('returns no groups when every commercial field is null', () => {
    expect(buildCommercialDetailModel(listing(), 'SHOP')).toEqual([]);
  });

  it('omits a group entirely rather than rendering it empty', () => {
    // Only a warehouse fact is populated, so Facilities and Floor must not appear as empty shells.
    const g = buildCommercialDetailModel(listing({ warehouseLoadingBays: 2 }), 'WAREHOUSE');
    expect(g.map((x) => x.key)).toEqual(['warehouse']);
  });

  it('drops a field whose code the vocabulary no longer recognises instead of showing the raw code', () => {
    const g = buildCommercialDetailModel(listing({ commercialFurnishingStatus: 'NOT_A_REAL_CODE' }), 'SHOP');
    expect(JSON.stringify(g)).not.toContain('NOT_A_REAL_CODE');
    expect(g).toEqual([]);
  });
});

describe('buildCommercialDetailModel — buyer-readable labels', () => {
  it.each(['SHOP', 'OFFICE', 'BUILDING', 'WAREHOUSE', 'LAND', null] as (CommercialDetailSubtype | null)[])(
    'emits no raw SCREAMING_SNAKE enum value for subtype %s',
    (subtype) => {
      const g = buildCommercialDetailModel(listing(FULLY_POPULATED), subtype);
      const rendered = g.flatMap((grp) => grp.facts.map((f) => f.value));
      expect(rendered.length).toBeGreaterThan(0);
      // A negative sweep rather than a per-field assertion: it also catches arms added later.
      // Free-text broker fields are excluded — they are not enums and may legitimately be anything.
      const freeText = ['Mixed commercial', 'CC and OC obtained'];
      for (const v of rendered.filter((x) => !freeText.includes(x))) {
        expect(v).not.toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
    },
  );

  it('resolves hubType against the subtype-scoped vocabulary', () => {
    const shop = buildCommercialDetailModel(listing({ hubType: 'HIGH_STREET' }), 'SHOP');
    expect(facts(shop)['hub-type']).toBe('High street');

    const office = buildCommercialDetailModel(listing({ hubType: 'IT_PARK' }), 'OFFICE');
    expect(facts(office)['hub-type']).toBe('IT park');

    // A shop hub code is not in the office vocabulary, so it is dropped rather than mislabelled.
    const mismatched = buildCommercialDetailModel(listing({ hubType: 'HIGH_STREET' }), 'OFFICE');
    expect(factKeys(mismatched)).not.toContain('hub-type');
  });
});

describe('buildCommercialDetailModel — purpose-sensitive terms', () => {
  const withTerms = { leaseTermMonths: 36, leaseEscalationPct: 5, currentMonthlyIncomePaise: 15000000 };

  it('shows lease term and escalation on a rent listing', () => {
    const g = buildCommercialDetailModel(listing({ ...withTerms, listingPurpose: 'rent' }), 'SHOP');
    expect(facts(g)).toMatchObject({ 'lease-term': '36 months', 'lease-escalation': '5%' });
  });

  it('withholds lease term and escalation on a sale listing', () => {
    const g = buildCommercialDetailModel(listing({ ...withTerms, listingPurpose: 'sale' }), 'SHOP');
    const keys = factKeys(g);
    expect(keys).not.toContain('lease-term');
    expect(keys).not.toContain('lease-escalation');
    // Income is purpose-independent and must still be shown.
    expect(keys).toContain('current-income');
  });

  it('never renders Lease as a purpose value', () => {
    // `chk_listing_purpose` permits only sale|rent; lease TERMS are facts, not a purpose.
    const g = buildCommercialDetailModel(listing({ ...withTerms, listingPurpose: 'rent' }), 'SHOP');
    const purposeish = g.flatMap((grp) => grp.facts).filter((f) => /purpose/i.test(f.label));
    expect(purposeish).toEqual([]);
  });

  it('singularises a one-month lease term', () => {
    const g = buildCommercialDetailModel(listing({ leaseTermMonths: 1, listingPurpose: 'rent' }), 'SHOP');
    expect(facts(g)['lease-term']).toBe('1 month');
  });
});

describe('buildCommercialDetailModel — attribution', () => {
  it('marks broker-entered claims as attributed and measured facts as not', () => {
    const g = buildCommercialDetailModel(listing(FULLY_POPULATED), null);
    const byKey = Object.fromEntries(g.flatMap((grp) => grp.facts.map((f) => [f.key, f])));

    for (const k of ['zoning', 'ownership', 'approvals', 'current-income', 'expected-yield', 'suitable-uses']) {
      expect(byKey[k]?.attributed).toBe(true);
    }
    for (const k of ['clear-height', 'washrooms-public', 'office-seats']) {
      expect(byKey[k]?.attributed).toBeUndefined();
    }
  });

  it('adds no guarantee, footfall, verification or proximity claim', () => {
    const rendered = JSON.stringify(buildCommercialDetailModel(listing(FULLY_POPULATED), null));
    expect(rendered).not.toMatch(/guarantee|guaranteed|footfall|verified|legal clearance|nearby|minutes from/i);
  });
});

describe('supersededGenericSpecs — conditional, not unconditional', () => {
  // The pairing below is what makes this suite discriminating. Arm A alone is satisfied by BOTH a
  // correct conditional rule and a broken "always suppress on commercial" rule; Arm B is what
  // separates them, because an unconditional rule deletes the legacy row's only copy of the fact.

  it('ARM A — supersedes the generic row when the typed twin is populated', () => {
    const s = supersededGenericSpecs(
      listing({ washrooms: 4, washroomsPublic: 2, washroomsPrivate: 2, parkingCount: 8, parkingPublicCount: 8 }),
    );
    expect(s.has('washrooms')).toBe(true);
    expect(s.has('parking')).toBe(true);
  });

  it('ARM B (control) — keeps the generic row on a legacy row whose typed twin is null', () => {
    const s = supersededGenericSpecs(
      listing({ washrooms: 4, parkingCount: 8, possessionStatus: 'ready', ownershipType: 'freehold' }),
    );
    expect(s.has('washrooms')).toBe(false);
    expect(s.has('parking')).toBe(false);
    expect(s.has('availability')).toBe(false);
    expect(s.has('ownership')).toBe(false);
  });

  it('ARM B (control) — supersedes nothing at all on a residential listing', () => {
    const s = supersededGenericSpecs(
      listing({ propertyType: 'apartment', washrooms: 2, washroomsPublic: 9, commercialOwnership: 'FREEHOLD' }),
    );
    expect(s.size).toBe(0);
  });

  it('supersedes washrooms when only ONE side of the typed pair is populated', () => {
    expect(supersededGenericSpecs(listing({ washrooms: 4, washroomsPublic: 2 })).has('washrooms')).toBe(true);
    expect(supersededGenericSpecs(listing({ washrooms: 4, washroomsPrivate: 2 })).has('washrooms')).toBe(true);
  });

  it('treats a zero count as populated, not absent', () => {
    // 0 public washrooms is a real, meaningful answer; `!= null` must not collapse it to absent.
    expect(supersededGenericSpecs(listing({ washrooms: 4, washroomsPublic: 0 })).has('washrooms')).toBe(true);
  });

  it('does not supersede furnishing when the typed value is an unrecognised code', () => {
    // The typed row would be dropped by label resolution, so suppressing the generic one would
    // leave the buyer with neither.
    const s = supersededGenericSpecs(listing({ commercialFurnishingStatus: 'NOT_A_REAL_CODE' }));
    expect(s.has('furnishing')).toBe(false);
  });
});
