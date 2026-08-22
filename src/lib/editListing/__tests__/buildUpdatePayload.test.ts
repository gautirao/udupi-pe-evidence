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
