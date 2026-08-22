// Issue #1838 (slice-3-payload-builder) — exhaustive coverage for the
// extracted PUT-payload builder. Mirrors the field-visibility contract in
// listingFieldConfig.ts CONFIG_MAP + isListingFieldVisible.
import { describe, it, expect } from 'vitest';
import { buildListingUpdatePayload, makeUpdatePayloadCtx } from '../buildUpdatePayload';
import type { ListingFormState } from '../buildUpdatePayload';

/** Fully-populated form state — individual tests override just the fields under test. */
function baseState(overrides: Partial<ListingFormState> = {}): ListingFormState {
  return {
    title: 'Test title',
    description: 'Test description',
    priceRupees: 5000000,
    propertyType: 'apartment',
    locality: 'Manipal',
    landArea: 1000,
    landAreaUnit: 'cent',
    bedrooms: '3',
    builtArea: 1200,
    builtAreaUnit: 'sqft',
    reraNumber: 'RERA123',
    listingPurpose: 'sale',
    carpetArea: 900,
    carpetAreaUnit: 'sqft',
    floorNumber: '2',
    totalFloors: '5',
    furnishingStatus: 'furnished',
    washrooms: '2',
    parkingCount: '1',
    roadFrontageFt: '30',
    commercialUsage: 'Retail',
    numberOfUnits: '4',
    monthlyRent: '15000',
    securityDepositMonths: '10',
    lockInMonths: '12',
    waterSource: 'BOREWELL',
    soilType: 'RED_LATERITE',
    roadAccess: 'TARRED_ROAD',
    cultivationStatus: 'CULTIVATED',
    ownershipType: 'FREEHOLD',
    surveyNumber: '123/4A',
    landCategory: 'WET_LAND',
    agriConversionStatus: 'NOT_CONVERTED',
    farmhouseAvailable: 'true',
    fencingDone: 'false',
    bathrooms: '2',
    balconies: '1',
    facing: 'EAST',
    availabilityTimeline: 'IMMEDIATE',
    superBuiltArea: 1350,
    superBuiltAreaUnit: 'SQ_FT',
    propertyAge: 'NEW',
    residentialWaterSource: 'BOREWELL',
    parking2wCount: '2',
    parking4wCount: '1',
    roadWidthFt: '30',
    plotDimensions: '40x60',
    conversionStatus: 'CONVERTED',
    khataNumber: '123/45',
    propertyTaxPid: 'PID-00123',
    approvingAuthority: 'Udupi CMC',
    projectName: 'Sunrise Residency',
    builderName: 'ABC Builders',
    maintenancePaise: '2000',
    possessionStatus: 'READY',
    maintenanceIncluded: 'true',
    priceNegotiable: 'true',
    rentNegotiable: 'false',
    petsAllowed: 'true',
    hasLift: 'true',
    hasPowerBackup: 'true',
    isGated: 'true',
    hasGarden: 'false',
    hasTerrace: 'false',
    hasCompound: 'false',
    hasServantRoom: 'false',
    isCornerPlot: 'false',
    hasBoundaryWall: 'true',
    isGatedLayout: 'true',
    hasWaterConnection: 'true',
    hasElectricityConnection: 'true',
    hasDrainage: 'true',
    amenities: ['GYM', 'POOL'],
    specialLocationViews: ['PARK_FACING'],
    preferredTenants: ['FAMILY'],
    // #2281 [#1684 parity] — 28 commercial subtype-gated fields. Defaults are
    // populated (mirroring the pattern above) so a bare makeUpdatePayloadCtx
    // call (no 4th arg -> commercialSubtype undefined) resolves every one of
    // these to hidden/omitted, exactly like the pre-#2281 behaviour — see the
    // dedicated 'commercial subtype-gated fields (#2281)' describe block below
    // for coverage of the new visible/omitted paths.
    commercialSubtype: '',
    floorChoice: 'GROUND_FLOOR',
    hubType: 'MALL',
    floorMode: 'GF_ONLY',
    powerLoadKva: '25',
    occupancyStatus: 'VACANT',
    officeSeats: '10',
    officeCabins: '2',
    officeMeetingRooms: '1',
    warehouseClearHeightFt: '20',
    warehouseLoadingBays: '3',
    warehouseTruckAccess: 'true',
    warehouseFlooring: 'CONCRETE_RCC',
    commercialZoning: 'Commercial zone',
    commercialOwnership: 'FREEHOLD',
    commercialApprovals: 'Building plan approved',
    washroomsPublic: '2',
    washroomsPrivate: '1',
    parkingPublicCount: '4',
    parkingPrivateCount: '2',
    commercialFurnishingStatus: 'FURNISHED',
    utilities: ['POWER', 'CCTV'],
    utilitiesTouched: false,
    suitableUses: ['RETAIL'],
    suitableUsesTouched: false,
    commercialAvailability: 'IMMEDIATE',
    commercialAreaUnit: 'SQ_FT',
    expectedRentalYieldPct: '5.5',
    currentMonthlyIncomePaise: '25000',
    leaseTermMonths: '24',
    leaseEscalationPct: '5',
    ...overrides,
  };
}

describe('buildListingUpdatePayload — apartment (sale)', () => {
  const ctx = makeUpdatePayloadCtx('apartment', 'sale');
  const payload = buildListingUpdatePayload(baseState({ propertyType: 'apartment' }), ctx);

  it('includes apartment-visible fields', () => {
    expect(payload.carpetArea).toBe(900);
    expect(payload.builtArea).toBe(1200);
    expect(payload.bedrooms).toBe(3);
    expect(payload.bathrooms).toBe(2);
    expect(payload.balconies).toBe(1);
    expect(payload.superBuiltArea).toBe(1350);
    expect(payload.hasLift).toBe(true);
    expect(payload.hasPowerBackup).toBe(true);
    expect(payload.amenities).toEqual(['GYM', 'POOL']);
    expect(payload.ownershipType).toBe('FREEHOLD'); // sale + residence type
  });

  it('omits house/villa/plot-only fields', () => {
    expect(payload.propertyAge).toBeUndefined();
    expect(payload.residentialWaterSource).toBeUndefined();
    expect(payload.hasGarden).toBeUndefined();
    expect(payload.plotDimensions).toBeUndefined();
    expect(payload.isCornerPlot).toBeUndefined();
    expect(payload.conversionStatus).toBeUndefined();
  });

  it('omits agri-only fields', () => {
    expect(payload.waterSource).toBeUndefined();
    expect(payload.soilType).toBeUndefined();
    expect(payload.landCategory).toBeUndefined();
    expect(payload.agriConversionStatus).toBeUndefined();
    expect(payload.farmhouseAvailable).toBeUndefined();
    expect(payload.fencingDone).toBeUndefined();
  });

  it('sends builtAreaUnit but omits landAreaUnit (apartment: showBuiltArea true, showLandArea false)', () => {
    expect(payload.builtAreaUnit).toBe('sqft');
    expect(payload.landAreaUnit).toBeUndefined();
    // landArea VALUE is unconditional (only unit is gated) — apartment still sends the raw value.
    expect(payload.landArea).toBe(1000);
  });

  it('includes reraNumber for apartment', () => {
    expect(payload.reraNumber).toBe('RERA123');
  });

  it('reraNumber empty string -> null (the `|| null` branch, not undefined) for a visible type', () => {
    const emptyReraPayload = buildListingUpdatePayload(
      baseState({ propertyType: 'apartment', reraNumber: '' }),
      makeUpdatePayloadCtx('apartment', 'sale'),
    );
    expect(emptyReraPayload.reraNumber).toBeNull();
  });
});

describe('buildListingUpdatePayload — house (sale)', () => {
  const ctx = makeUpdatePayloadCtx('house', 'sale');
  const payload = buildListingUpdatePayload(baseState({ propertyType: 'house' }), ctx);

  it('includes house-only fields', () => {
    expect(payload.propertyAge).toBe('NEW');
    expect(payload.residentialWaterSource).toBe('BOREWELL');
    expect(payload.hasGarden).toBe(false);
    expect(payload.hasTerrace).toBe(false);
    expect(payload.hasCompound).toBe(false);
    expect(payload.hasServantRoom).toBe(false);
    expect(payload.totalFloors).toBe(5);
  });

  it('omits apartment-only fields', () => {
    expect(payload.balconies).toBeUndefined();
    expect(payload.floorNumber).toBeUndefined();
    expect(payload.superBuiltArea).toBeUndefined();
    expect(payload.hasLift).toBeUndefined();
    expect(payload.hasPowerBackup).toBeUndefined();
  });

  it('sends BOTH landAreaUnit and builtAreaUnit (house: both showLandArea and showBuiltArea true)', () => {
    expect(payload.landAreaUnit).toBe('cent');
    expect(payload.builtAreaUnit).toBe('sqft');
  });

  it('includes reraNumber for house', () => {
    expect(payload.reraNumber).toBe('RERA123');
  });
});

describe('buildListingUpdatePayload — villa (sale)', () => {
  const ctx = makeUpdatePayloadCtx('villa', 'sale');
  const payload = buildListingUpdatePayload(baseState({ propertyType: 'villa' }), ctx);

  it('uses the identical visibility set to house', () => {
    expect(payload.propertyAge).toBe('NEW');
    expect(payload.hasGarden).toBe(false);
    expect(payload.balconies).toBeUndefined();
  });

  it('sends BOTH landAreaUnit and builtAreaUnit', () => {
    expect(payload.landAreaUnit).toBe('cent');
    expect(payload.builtAreaUnit).toBe('sqft');
  });

  it('includes reraNumber for villa', () => {
    expect(payload.reraNumber).toBe('RERA123');
  });
});

describe('buildListingUpdatePayload — residential_plot (sale)', () => {
  const ctx = makeUpdatePayloadCtx('residential_plot', 'sale');
  const payload = buildListingUpdatePayload(baseState({ propertyType: 'residential_plot' }), ctx);

  it('includes plot-only fields', () => {
    expect(payload.plotDimensions).toBe('40x60');
    expect(payload.roadWidthFt).toBe(30);
    expect(payload.isCornerPlot).toBe(false);
    expect(payload.hasBoundaryWall).toBe(true);
    expect(payload.isGatedLayout).toBe(true);
    expect(payload.hasWaterConnection).toBe(true);
    expect(payload.hasElectricityConnection).toBe(true);
    expect(payload.hasDrainage).toBe(true);
    expect(payload.conversionStatus).toBe('CONVERTED');
    expect(payload.khataNumber).toBe('123/45');
    expect(payload.propertyTaxPid).toBe('PID-00123');
    expect(payload.approvingAuthority).toBe('Udupi CMC');
    expect(payload.surveyNumber).toBe('123/4A');
    expect(payload.specialLocationViews).toEqual(['PARK_FACING']);
    // residential_plot is not a "residence type" — ownershipType is unconditional (any purpose).
    expect(payload.ownershipType).toBe('FREEHOLD');
  });

  it('omits residence-unit-only fields (bedrooms/bathrooms/amenities never shown for plots)', () => {
    expect(payload.bedrooms).toBeUndefined();
    expect(payload.bathrooms).toBeUndefined();
    expect(payload.amenities).toBeUndefined();
    expect(payload.furnishingStatus).toBeUndefined();
  });

  it('sends landAreaUnit but omits builtAreaUnit (plot: showLandArea true, showBuiltArea false)', () => {
    expect(payload.landAreaUnit).toBe('cent');
    expect(payload.builtAreaUnit).toBeUndefined();
  });

  it('includes reraNumber for residential_plot', () => {
    expect(payload.reraNumber).toBe('RERA123');
  });
});

describe('buildListingUpdatePayload — commercial (sale) [representative commercial type]', () => {
  const ctx = makeUpdatePayloadCtx('commercial', 'sale');
  const payload = buildListingUpdatePayload(baseState({ propertyType: 'commercial' }), ctx);

  it('includes commercial fields', () => {
    expect(payload.carpetArea).toBe(900);
    expect(payload.floorNumber).toBe(2);
    expect(payload.furnishingStatus).toBe('furnished');
    expect(payload.washrooms).toBe(2);
    expect(payload.parkingCount).toBe(1);
    expect(payload.roadFrontageFt).toBe(30);
    expect(payload.commercialUsage).toBe('Retail');
  });

  it('omits residential/agri fields', () => {
    expect(payload.bedrooms).toBeUndefined();
    expect(payload.amenities).toBeUndefined();
    expect(payload.waterSource).toBeUndefined();
  });

  it('omits reraNumber for commercial (not apartment/house/villa/residential_plot)', () => {
    expect(payload.reraNumber).toBeUndefined();
  });

  it('omits both area units (commercial: showLandArea and showBuiltArea both false)', () => {
    expect(payload.landAreaUnit).toBeUndefined();
    expect(payload.builtAreaUnit).toBeUndefined();
  });
});

describe('buildListingUpdatePayload — agricultural_land (sale)', () => {
  const ctx = makeUpdatePayloadCtx('agricultural_land', 'sale');
  const payload = buildListingUpdatePayload(
    baseState({ propertyType: 'agricultural_land', landAreaUnit: 'acre' }),
    ctx,
  );

  it('includes all nine agri fields plus facing', () => {
    expect(payload.waterSource).toBe('BOREWELL');
    expect(payload.soilType).toBe('RED_LATERITE');
    expect(payload.roadAccess).toBe('TARRED_ROAD');
    expect(payload.cultivationStatus).toBe('CULTIVATED');
    expect(payload.ownershipType).toBe('FREEHOLD');
    expect(payload.surveyNumber).toBe('123/4A');
    expect(payload.landCategory).toBe('WET_LAND');
    expect(payload.agriConversionStatus).toBe('NOT_CONVERTED');
    expect(payload.farmhouseAvailable).toBe(true);
    expect(payload.fencingDone).toBe(false);
    expect(payload.facing).toBe('EAST');
  });

  it('omits reraNumber and residential/commercial fields', () => {
    expect(payload.reraNumber).toBeUndefined();
    expect(payload.bedrooms).toBeUndefined();
    expect(payload.furnishingStatus).toBeUndefined();
  });

  it('sends landAreaUnit but omits builtAreaUnit (agri: showLandArea true, showBuiltArea false)', () => {
    expect(payload.landAreaUnit).toBe('acre');
    expect(payload.builtAreaUnit).toBeUndefined();
  });
});

describe('buildListingUpdatePayload — agriConversionStatus (#2043)', () => {
  it('empty string -> undefined (not specified) for agricultural_land', () => {
    const ctx = makeUpdatePayloadCtx('agricultural_land', 'sale');
    const payload = buildListingUpdatePayload(
      baseState({ propertyType: 'agricultural_land', agriConversionStatus: '' }),
      ctx,
    );
    expect(payload.agriConversionStatus).toBeUndefined();
  });

  it.each(['NOT_CONVERTED', 'CONVERSION_APPLIED', 'APPROVED_FOR_CONVERSION', 'NOT_SURE'])(
    '%s round-trips for agricultural_land',
    (value) => {
      const ctx = makeUpdatePayloadCtx('agricultural_land', 'sale');
      const payload = buildListingUpdatePayload(
        baseState({ propertyType: 'agricultural_land', agriConversionStatus: value }),
        ctx,
      );
      expect(payload.agriConversionStatus).toBe(value);
    },
  );

  it.each(['land', 'apartment', 'house', 'villa', 'residential_plot', 'commercial', 'commercial_building', 'warehouse', 'commercial_land'] as const)(
    'omitted for %s even when state still holds a value (hidden-field gate)',
    (propertyType) => {
      const ctx = makeUpdatePayloadCtx(propertyType, 'sale');
      const payload = buildListingUpdatePayload(
        baseState({ propertyType, agriConversionStatus: 'NOT_CONVERTED' }),
        ctx,
      );
      expect(payload.agriConversionStatus).toBeUndefined();
    },
  );
});

describe('buildListingUpdatePayload — mid-edit type switch', () => {
  it('switching house→apartment omits stale house-only fields even though state still holds them', () => {
    // State still has house-only values populated (as if broker was editing a house),
    // but ctx now reflects 'apartment' — the SAME scenario the characterisation
    // anchors (EditListing.residential.test.tsx) verify at the component level.
    const state = baseState({
      propertyType: 'apartment',
      hasGarden: 'true',
      propertyAge: 'NEW',
      residentialWaterSource: 'BOREWELL',
      hasTerrace: 'true',
      hasCompound: 'true',
      hasServantRoom: 'true',
    });
    const ctx = makeUpdatePayloadCtx('apartment', 'sale');
    const payload = buildListingUpdatePayload(state, ctx);

    expect(payload.hasGarden).toBeUndefined();
    expect(payload.propertyAge).toBeUndefined();
    expect(payload.residentialWaterSource).toBeUndefined();
    expect(payload.hasTerrace).toBeUndefined();
    expect(payload.hasCompound).toBeUndefined();
    expect(payload.hasServantRoom).toBeUndefined();
    // bedrooms IS shared with apartment, so it should still be sent.
    expect(payload.bedrooms).toBe(3);
  });

  it('switching apartment→house omits stale apartment-only fields', () => {
    const state = baseState({
      propertyType: 'house',
      balconies: '2',
      floorNumber: '3',
      superBuiltArea: 1400,
      hasLift: 'true',
      hasPowerBackup: 'true',
    });
    const ctx = makeUpdatePayloadCtx('house', 'sale');
    const payload = buildListingUpdatePayload(state, ctx);

    expect(payload.balconies).toBeUndefined();
    expect(payload.floorNumber).toBeUndefined();
    expect(payload.superBuiltArea).toBeUndefined();
    expect(payload.hasLift).toBeUndefined();
    expect(payload.hasPowerBackup).toBeUndefined();
  });
});

describe('buildListingUpdatePayload — isRent gating', () => {
  it('sale: sends price, omits monthlyRent/securityDepositMonths/lockInMonths', () => {
    const ctx = makeUpdatePayloadCtx('apartment', 'sale');
    const payload = buildListingUpdatePayload(
      baseState({ propertyType: 'apartment', listingPurpose: 'sale', priceRupees: 5000000 }),
      ctx,
    );
    expect(payload.price).toBe(5000000);
    expect(payload.monthlyRent).toBeUndefined();
    expect(payload.securityDepositMonths).toBeUndefined();
    expect(payload.lockInMonths).toBeUndefined();
  });

  it('rent: sends monthlyRent/securityDepositMonths/lockInMonths, omits price', () => {
    const ctx = makeUpdatePayloadCtx('apartment', 'rent');
    const payload = buildListingUpdatePayload(
      baseState({ propertyType: 'apartment', listingPurpose: 'rent', priceRupees: 5000000 }),
      ctx,
    );
    expect(payload.price).toBeUndefined();
    expect(payload.monthlyRent).toBe(15000);
    expect(payload.securityDepositMonths).toBe(10);
    expect(payload.lockInMonths).toBe(12);
  });
});

describe('buildListingUpdatePayload — empty-multiselect handling', () => {
  it('empty amenities array -> undefined (never sends an empty delta)', () => {
    const ctx = makeUpdatePayloadCtx('apartment', 'sale');
    const payload = buildListingUpdatePayload(
      baseState({ propertyType: 'apartment', amenities: [] }),
      ctx,
    );
    expect(payload.amenities).toBeUndefined();
  });

  it('non-empty amenities array -> passed through as the final desired set', () => {
    const ctx = makeUpdatePayloadCtx('apartment', 'sale');
    const payload = buildListingUpdatePayload(
      baseState({ propertyType: 'apartment', amenities: ['GYM', 'LIFT'] }),
      ctx,
    );
    expect(payload.amenities).toEqual(['GYM', 'LIFT']);
  });
});

describe('buildListingUpdatePayload — tri-state edge cases', () => {
  it("farmhouseAvailable '' -> undefined (not specified)", () => {
    const ctx = makeUpdatePayloadCtx('agricultural_land', 'sale');
    const payload = buildListingUpdatePayload(
      baseState({ propertyType: 'agricultural_land', farmhouseAvailable: '' }),
      ctx,
    );
    expect(payload.farmhouseAvailable).toBeUndefined();
  });

  it("farmhouseAvailable 'true' -> true", () => {
    const ctx = makeUpdatePayloadCtx('agricultural_land', 'sale');
    const payload = buildListingUpdatePayload(
      baseState({ propertyType: 'agricultural_land', farmhouseAvailable: 'true' }),
      ctx,
    );
    expect(payload.farmhouseAvailable).toBe(true);
  });

  it("farmhouseAvailable 'false' -> false", () => {
    const ctx = makeUpdatePayloadCtx('agricultural_land', 'sale');
    const payload = buildListingUpdatePayload(
      baseState({ propertyType: 'agricultural_land', farmhouseAvailable: 'false' }),
      ctx,
    );
    expect(payload.farmhouseAvailable).toBe(false);
  });
});

describe('buildListingUpdatePayload — empty-string trim', () => {
  it('surveyNumber whitespace-only -> undefined', () => {
    const ctx = makeUpdatePayloadCtx('agricultural_land', 'sale');
    const payload = buildListingUpdatePayload(
      baseState({ propertyType: 'agricultural_land', surveyNumber: '   ' }),
      ctx,
    );
    expect(payload.surveyNumber).toBeUndefined();
  });
});

describe('buildListingUpdatePayload — reraNumber visibility', () => {
  it.each(['apartment', 'house', 'villa', 'residential_plot'] as const)(
    'present for %s',
    (propertyType) => {
      const ctx = makeUpdatePayloadCtx(propertyType, 'sale');
      const payload = buildListingUpdatePayload(baseState({ propertyType, reraNumber: 'RERA999' }), ctx);
      expect(payload.reraNumber).toBe('RERA999');
    },
  );

  it.each(['commercial', 'commercial_building', 'warehouse', 'commercial_land', 'land', 'agricultural_land'] as const)(
    'omitted for %s',
    (propertyType) => {
      const ctx = makeUpdatePayloadCtx(propertyType, 'sale');
      const payload = buildListingUpdatePayload(baseState({ propertyType, reraNumber: 'RERA999' }), ctx);
      expect(payload.reraNumber).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// #2281 [#1684 parity] — commercial subtype-gated fields. makeUpdatePayloadCtx's
// 4th (commercialSubtype) argument mirrors the derived value production computes
// in EditListingForm.tsx via deriveCommercialSubtype(propertyType, explicitSubtype)
// (F1) — never the raw stored listing.commercialSubtype.
// ---------------------------------------------------------------------------

describe('buildListingUpdatePayload — commercial subtype-gated fields (#2281)', () => {
  it('OFFICE subtype: includes office-only fields, omits SHOP/BUILDING/WAREHOUSE/LAND-only fields', () => {
    const ctx = makeUpdatePayloadCtx('commercial', 'sale', 'OFFICE');
    const payload = buildListingUpdatePayload(baseState({ propertyType: 'commercial' }), ctx);

    expect(payload.officeSeats).toBe(10);
    expect(payload.officeCabins).toBe(2);
    expect(payload.officeMeetingRooms).toBe(1);
    expect(payload.floorChoice).toBe('GROUND_FLOOR');
    expect(payload.hubType).toBe('MALL');
    expect(payload.suitableUses).toBeUndefined(); // touched flag false — see F3 block below
    expect(payload.commercialAvailability).toBe('IMMEDIATE');

    expect(payload.floorMode).toBeUndefined();
    expect(payload.powerLoadKva).toBeUndefined();
    expect(payload.occupancyStatus).toBeUndefined();
    expect(payload.warehouseClearHeightFt).toBeUndefined();
    expect(payload.commercialZoning).toBeUndefined();
  });

  it('BUILDING subtype (commercial_building propertyType, no explicit choice needed): includes floorMode/powerLoadKva/occupancyStatus', () => {
    const ctx = makeUpdatePayloadCtx('commercial_building', 'sale', 'BUILDING');
    const payload = buildListingUpdatePayload(baseState({ propertyType: 'commercial_building' }), ctx);

    expect(payload.floorMode).toBe('GF_ONLY');
    expect(payload.powerLoadKva).toBe(25);
    expect(payload.occupancyStatus).toBe('VACANT');
    expect(payload.officeSeats).toBeUndefined();
    expect(payload.warehouseClearHeightFt).toBeUndefined();
  });

  it('WAREHOUSE subtype: includes warehouse-only fields including the boolean warehouseTruckAccess', () => {
    const ctx = makeUpdatePayloadCtx('warehouse', 'sale', 'WAREHOUSE');
    const payload = buildListingUpdatePayload(baseState({ propertyType: 'warehouse' }), ctx);

    expect(payload.warehouseClearHeightFt).toBe(20);
    expect(payload.warehouseLoadingBays).toBe(3);
    expect(payload.warehouseTruckAccess).toBe(true);
    expect(payload.warehouseFlooring).toBe('CONCRETE_RCC');
    expect(payload.occupancyStatus).toBeUndefined();
  });

  it('LAND subtype: includes zoning/ownership/approvals, omits built-space-only fields', () => {
    const ctx = makeUpdatePayloadCtx('commercial_land', 'sale', 'LAND');
    const payload = buildListingUpdatePayload(baseState({ propertyType: 'commercial_land' }), ctx);

    expect(payload.commercialZoning).toBe('Commercial zone');
    expect(payload.commercialOwnership).toBe('FREEHOLD');
    expect(payload.commercialApprovals).toBe('Building plan approved');
    // washroomsPublic/parkingPublicCount/commercialFurnishingStatus/utilities are
    // excluded for LAND even though the subtype has resolved.
    expect(payload.washroomsPublic).toBeUndefined();
    expect(payload.parkingPublicCount).toBeUndefined();
    expect(payload.commercialFurnishingStatus).toBeUndefined();
    expect(payload.utilities).toBeUndefined();
    // suitableUses/commercialAvailability/commercialAreaUnit ARE shown for every resolved subtype, LAND included.
    expect(payload.commercialAvailability).toBe('IMMEDIATE');
    expect(payload.commercialAreaUnit).toBe('SQ_FT');
  });

  it('AC5/F2 — undefined subtype (unresolved) omits every subtype-gated field, even LAND-only ones', () => {
    const ctx = makeUpdatePayloadCtx('commercial', 'sale'); // no 4th arg -> undefined, same as null/legacy-normalised
    const payload = buildListingUpdatePayload(baseState({ propertyType: 'commercial' }), ctx);

    expect(payload.floorChoice).toBeUndefined();
    expect(payload.officeSeats).toBeUndefined();
    expect(payload.warehouseClearHeightFt).toBeUndefined();
    expect(payload.commercialZoning).toBeUndefined();
    expect(payload.washroomsPublic).toBeUndefined();
    expect(payload.commercialAvailability).toBeUndefined();
  });

  it('AC10/F1 — mid-edit switch from warehouse to apartment omits every commercial field even though state still holds warehouse values', () => {
    // Simulates a broker who had picked 'warehouse' (state populated) then switched
    // propertyType to 'apartment' — ctx now reflects derive(propertyType='apartment', ...) = undefined.
    const ctx = makeUpdatePayloadCtx('apartment', 'sale', undefined);
    const payload = buildListingUpdatePayload(baseState({ propertyType: 'apartment' }), ctx);

    expect(payload.warehouseClearHeightFt).toBeUndefined();
    expect(payload.warehouseTruckAccess).toBeUndefined();
    expect(payload.commercialZoning).toBeUndefined();
    expect(payload.commercialSubtype).toBeUndefined();
  });

  it('F4 — commercialSubtype is sent only for propertyType "commercial", never for the derived-subtype types', () => {
    const commercialCtx = makeUpdatePayloadCtx('commercial', 'sale', 'OFFICE');
    const commercialPayload = buildListingUpdatePayload(
      baseState({ propertyType: 'commercial', commercialSubtype: 'OFFICE' }),
      commercialCtx,
    );
    expect(commercialPayload.commercialSubtype).toBe('OFFICE');

    const buildingCtx = makeUpdatePayloadCtx('commercial_building', 'sale', 'BUILDING');
    const buildingPayload = buildListingUpdatePayload(
      baseState({ propertyType: 'commercial_building', commercialSubtype: 'OFFICE' /* stale, must never be sent */ }),
      buildingCtx,
    );
    expect(buildingPayload.commercialSubtype).toBeUndefined();
  });

  it('sale purpose: sends expectedRentalYieldPct/currentMonthlyIncomePaise, omits leaseTermMonths/leaseEscalationPct', () => {
    const ctx = makeUpdatePayloadCtx('commercial', 'sale', 'OFFICE');
    const payload = buildListingUpdatePayload(baseState({ propertyType: 'commercial', listingPurpose: 'sale' }), ctx);
    expect(payload.expectedRentalYieldPct).toBe(5.5);
    expect(payload.currentMonthlyIncomePaise).toBe(25000);
    expect(payload.leaseTermMonths).toBeUndefined();
    expect(payload.leaseEscalationPct).toBeUndefined();
  });

  it('lease purpose: sends leaseTermMonths/leaseEscalationPct, omits expectedRentalYieldPct/currentMonthlyIncomePaise', () => {
    const ctx = makeUpdatePayloadCtx('commercial', 'lease', 'OFFICE');
    const payload = buildListingUpdatePayload(
      baseState({ propertyType: 'commercial', listingPurpose: 'lease' as unknown as 'rent' }),
      ctx,
    );
    expect(payload.leaseTermMonths).toBe(24);
    expect(payload.leaseEscalationPct).toBe(5);
    expect(payload.expectedRentalYieldPct).toBeUndefined();
    expect(payload.currentMonthlyIncomePaise).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// F3 — HIGHEST SEVERITY: utilities/suitableUses child-set REPLACE semantics.
// The backend deletes+reinserts these rows on ANY non-null value, so the
// payload builder must be able to tell "never touched" (omit) apart from
// "touched and now empty" (send [] — a real delete) and "touched and set" (send array).
// ---------------------------------------------------------------------------

describe('buildListingUpdatePayload — utilities/suitableUses touched-tracking (F3/AC8)', () => {
  it('never touched -> omitted entirely, even though a hydrated value is present in state', () => {
    const ctx = makeUpdatePayloadCtx('commercial', 'sale', 'OFFICE');
    const payload = buildListingUpdatePayload(
      baseState({
        propertyType: 'commercial',
        utilities: ['POWER', 'CCTV'], // hydrated from the stored listing
        utilitiesTouched: false,
        suitableUses: ['RETAIL'],
        suitableUsesTouched: false,
      }),
      ctx,
    );
    expect(payload.utilities).toBeUndefined();
    expect(payload.suitableUses).toBeUndefined();
  });

  it('touched + non-empty -> sends the complete current array', () => {
    const ctx = makeUpdatePayloadCtx('commercial', 'sale', 'OFFICE');
    const payload = buildListingUpdatePayload(
      baseState({
        propertyType: 'commercial',
        utilities: ['POWER', 'CCTV', 'AC'],
        utilitiesTouched: true,
        suitableUses: ['OFFICE', 'CO_WORKING'],
        suitableUsesTouched: true,
      }),
      ctx,
    );
    expect(payload.utilities).toEqual(['POWER', 'CCTV', 'AC']);
    expect(payload.suitableUses).toEqual(['OFFICE', 'CO_WORKING']);
  });

  it('touched + cleared to [] -> sends [] (an explicit delete), never omitted', () => {
    const ctx = makeUpdatePayloadCtx('commercial', 'sale', 'OFFICE');
    const payload = buildListingUpdatePayload(
      baseState({
        propertyType: 'commercial',
        utilities: [],
        utilitiesTouched: true,
        suitableUses: [],
        suitableUsesTouched: true,
      }),
      ctx,
    );
    expect(payload.utilities).toEqual([]);
    expect(payload.suitableUses).toEqual([]);
  });

  it('undefined array state + touched=true -> still sends [] (never a partial/garbage value)', () => {
    const ctx = makeUpdatePayloadCtx('commercial', 'sale', 'OFFICE');
    const payload = buildListingUpdatePayload(
      baseState({
        propertyType: 'commercial',
        utilities: undefined,
        utilitiesTouched: true,
        suitableUses: undefined,
        suitableUsesTouched: true,
      }),
      ctx,
    );
    expect(payload.utilities).toEqual([]);
    expect(payload.suitableUses).toEqual([]);
  });

  it('not visible for the resolved subtype (LAND) -> omitted regardless of touched state', () => {
    const ctx = makeUpdatePayloadCtx('commercial_land', 'sale', 'LAND');
    const payload = buildListingUpdatePayload(
      baseState({ propertyType: 'commercial_land', utilities: ['POWER'], utilitiesTouched: true }),
      ctx,
    );
    // utilities is excluded for LAND even though touched — the fieldVisible gate wins.
    expect(payload.utilities).toBeUndefined();
  });
});
