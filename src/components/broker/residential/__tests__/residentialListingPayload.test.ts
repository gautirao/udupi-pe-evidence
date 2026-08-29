/**
 * #2387 — focused unit tests for the extracted residential payload/validation
 * owner (residentialListingPayload.ts). Pure functions, no component render —
 * reduces dependence on the giant ResidentialListingForm component tests for
 * this mapping logic, per the issue's Definition of Done.
 */
import { describe, it, expect } from 'vitest';
import { isListingFieldVisible, type ListingFieldKey } from '@/lib/listingFieldConfig';
import {
  buildResidentialListingPayload,
  computeResidentialChecklist,
  computeResidentialSpecChips,
  type ResidentialPayloadInputs,
} from '../residentialListingPayload';

function fieldVisibleFor(propertyType: ResidentialPayloadInputs['propertyType'], listingPurpose: 'sale' | 'rent') {
  return (key: ListingFieldKey) => isListingFieldVisible(key, propertyType, listingPurpose);
}

const BASE_APARTMENT_SALE: ResidentialPayloadInputs = {
  propertyType: 'apartment',
  title: 'Nice apartment',
  locality: 'Manipal',
  priceRupees: 5_000_000,
  description: 'A description',
  listingPurpose: 'sale',
  isRent: false,
  isPlot: false,
  isHouseOrVilla: false,
  isApartment: true,
  landArea: null,
  landAreaUnit: 'cent',
  builtArea: 1200,
  builtAreaUnit: 'sqft',
  carpetArea: 1000,
  carpetAreaUnit: 'sqft',
  bedrooms: '3',
  bathrooms: '2',
  balconies: '1',
  furnishingStatus: '',
  facing: '',
  floorNumber: '',
  totalFloors: '',
  superBuiltArea: '',
  propertyAge: '',
  residentialWaterSource: '',
  parking2wCount: '',
  parking4wCount: '',
  isGated: null,
  projectName: '',
  builderName: '',
  amenities: [],
  specialLocationViews: [],
  hasLift: null,
  hasPowerBackup: null,
  hasGarden: null,
  hasTerrace: null,
  hasCompound: null,
  hasServantRoom: null,
  plotDimensions: '',
  roadWidthFt: '',
  isCornerPlot: null,
  hasBoundaryWall: null,
  isGatedLayout: null,
  hasWaterConnection: null,
  hasElectricityConnection: null,
  hasDrainage: null,
  priceNegotiable: null,
  maintenancePaise: '',
  possessionStatus: '',
  monthlyRent: '',
  securityDepositMonths: '',
  lockInMonths: '',
  maintenanceIncluded: null,
  rentNegotiable: null,
  petsAllowed: null,
  availabilityTimeline: '',
  preferredTenants: [],
  ownershipType: '',
  conversionStatus: '',
  khataNumber: '',
  propertyTaxPid: '',
  approvingAuthority: '',
  surveyNumber: '',
  fieldVisible: fieldVisibleFor('apartment', 'sale'),
};

describe('buildResidentialListingPayload', () => {
  it('sends carpetArea/builtArea/bedrooms for an apartment sale and omits rent-only fields', () => {
    const payload = buildResidentialListingPayload(BASE_APARTMENT_SALE);
    expect(payload.propertyType).toBe('apartment');
    expect(payload.price).toBe(5_000_000);
    expect(payload.carpetArea).toBe(1000);
    expect(payload.builtArea).toBe(1200);
    expect(payload.bedrooms).toBe(3);
    expect(payload.monthlyRent).toBeUndefined();
    expect(payload.landArea).toBeUndefined();
  });

  it('sends monthlyRent and omits price for a rent listing', () => {
    const rentInputs: ResidentialPayloadInputs = {
      ...BASE_APARTMENT_SALE,
      listingPurpose: 'rent',
      isRent: true,
      monthlyRent: '25000',
      securityDepositMonths: '2',
      fieldVisible: fieldVisibleFor('apartment', 'rent'),
    };
    const payload = buildResidentialListingPayload(rentInputs);
    expect(payload.price).toBeUndefined();
    expect(payload.monthlyRent).toBe(25000);
    expect(payload.securityDepositMonths).toBe(2);
  });

  it('sends landArea (not builtArea/carpetArea) for a residential_plot', () => {
    const plotInputs: ResidentialPayloadInputs = {
      ...BASE_APARTMENT_SALE,
      propertyType: 'residential_plot',
      isApartment: false,
      isPlot: true,
      landArea: 5,
      landAreaUnit: 'cent',
      plotDimensions: '30x40',
      fieldVisible: fieldVisibleFor('residential_plot', 'sale'),
    };
    const payload = buildResidentialListingPayload(plotInputs);
    expect(payload.landArea).toBe(5);
    expect(payload.landAreaUnit).toBe('cent');
    expect(payload.builtArea).toBeUndefined();
    expect(payload.carpetArea).toBeUndefined();
    expect(payload.plotDimensions).toBe('30x40');
  });

  it('never sends a field the current type/purpose does not visibly collect, even if stale state is set', () => {
    // Simulates a mid-flow property-type switch (Apartment -> Plot) where
    // bedrooms/carpetArea are stale useState values not yet reset.
    const switchedToPlot: ResidentialPayloadInputs = {
      ...BASE_APARTMENT_SALE,
      propertyType: 'residential_plot',
      isApartment: false,
      isPlot: true,
      fieldVisible: fieldVisibleFor('residential_plot', 'sale'),
    };
    const payload = buildResidentialListingPayload(switchedToPlot);
    expect(payload.bedrooms).toBeUndefined();
    expect(payload.carpetArea).toBeUndefined();
  });
});

describe('computeResidentialChecklist', () => {
  it('marks hasConfigDetails from plotDimensions for a plot, and from bedrooms otherwise', () => {
    const plotChecklist = computeResidentialChecklist({
      locality: 'Manipal',
      primaryAreaSqft: 2000,
      priceValid: true,
      title: 'Plot',
      isPlot: true,
      plotDimensions: '30x40',
      bedrooms: '',
      imageCount: 0,
      addressConfirmed: false,
      description: '',
    });
    expect(plotChecklist.hasConfigDetails).toBe(true);

    const apartmentChecklist = computeResidentialChecklist({
      locality: 'Manipal',
      primaryAreaSqft: 1000,
      priceValid: true,
      title: 'Apt',
      isPlot: false,
      plotDimensions: '',
      bedrooms: '2',
      imageCount: 0,
      addressConfirmed: false,
      description: '',
    });
    expect(apartmentChecklist.hasConfigDetails).toBe(true);
  });

  it('requires a 20+ character description for hasDescription', () => {
    const short = computeResidentialChecklist({
      locality: 'x', primaryAreaSqft: null, priceValid: false, title: '', isPlot: false,
      plotDimensions: '', bedrooms: '', imageCount: 0, addressConfirmed: false, description: 'too short',
    });
    expect(short.hasDescription).toBe(false);

    const long = computeResidentialChecklist({
      locality: 'x', primaryAreaSqft: null, priceValid: false, title: '', isPlot: false,
      plotDimensions: '', bedrooms: '', imageCount: 0, addressConfirmed: false, description: 'this description is long enough',
    });
    expect(long.hasDescription).toBe(true);
  });
});

describe('computeResidentialSpecChips', () => {
  it('never fabricates a chip for a field the current type does not collect', () => {
    // fieldVisible for a residential_plot returns false for bedrooms/bathrooms —
    // a stale "3 BHK" from before a mid-flow switch must not leak into the chips.
    const chips = computeResidentialSpecChips({
      fieldVisible: fieldVisibleFor('residential_plot', 'sale'),
      bedrooms: '3',
      bathrooms: '2',
      primaryAreaFieldKey: 'landArea',
      primaryAreaSqft: 5,
      furnishingStatus: '',
    });
    expect(chips.some((c) => c.label.includes('BHK'))).toBe(false);
    expect(chips.some((c) => c.label.includes('Bath'))).toBe(false);
  });

  it('includes bedrooms/bathrooms/area chips for an apartment', () => {
    const chips = computeResidentialSpecChips({
      fieldVisible: fieldVisibleFor('apartment', 'sale'),
      bedrooms: '3',
      bathrooms: '2',
      primaryAreaFieldKey: 'carpetArea',
      primaryAreaSqft: 1000,
      furnishingStatus: '',
    });
    expect(chips).toEqual(
      expect.arrayContaining([
        { label: '3 BHK' },
        { label: '2 Bath' },
        { label: '1000 sqft' },
      ]),
    );
  });
});
