/**
 * Issue #2398 — focused unit tests for the extracted agricultural payload/
 * checklist/strength/description-facts/spec-chip pure mapping module. These
 * exercise the logic in isolation (no React render), covering what the
 * pre-decomposition AgriculturalListingForm.test.tsx exercised indirectly
 * through the DOM plus a few additional pure-function edge cases.
 */
import { describe, it, expect } from 'vitest';
import {
  buildAgriculturalListingPayload,
  computeAgriculturalChecklist,
  computeAgriculturalStrengthResult,
  computeAgriculturalDescriptionFacts,
  computeAgriculturalSpecChips,
  type AgriculturalPayloadInputs,
} from '../agricultural/agriculturalListingPayload';

function basePayloadInputs(overrides: Partial<AgriculturalPayloadInputs> = {}): AgriculturalPayloadInputs {
  return {
    propertyType: 'agricultural_land',
    title: '',
    locality: '',
    priceRupees: null,
    description: '',
    landArea: null,
    landAreaUnit: 'acre',
    facing: '',
    waterSource: '',
    soilType: '',
    roadAccess: '',
    cultivationStatus: '',
    ownershipType: '',
    surveyNumber: '',
    landCategory: '',
    agriConversionStatus: '',
    farmhouseAvailable: '',
    fencingDone: '',
    crops: [],
    fieldVisible: () => true,
    ...overrides,
  };
}

describe('buildAgriculturalListingPayload', () => {
  it('sends crops as the full current canonical set, and NEVER sends features/rtc (no backend write path)', () => {
    const payload = buildAgriculturalListingPayload(basePayloadInputs({ crops: ['ARECA_SUPARI', 'PADDY'] }));
    expect(payload.crops).toEqual(['ARECA_SUPARI', 'PADDY']);
    expect(payload).not.toHaveProperty('features');
    expect(payload).not.toHaveProperty('rtc');
  });

  it('omits landArea/landAreaUnit when landArea is null or non-positive', () => {
    expect(buildAgriculturalListingPayload(basePayloadInputs({ landArea: null })).landArea).toBeUndefined();
    expect(buildAgriculturalListingPayload(basePayloadInputs({ landArea: 0 })).landArea).toBeUndefined();
    const withArea = buildAgriculturalListingPayload(basePayloadInputs({ landArea: 2.5, landAreaUnit: 'acre' }));
    expect(withArea.landArea).toBe(2.5);
    expect(withArea.landAreaUnit).toBe('acre');
  });

  it('gates facing and agriConversionStatus behind fieldVisible', () => {
    const hidden = buildAgriculturalListingPayload(basePayloadInputs({ facing: 'NORTH', agriConversionStatus: 'converted', fieldVisible: () => false }));
    expect(hidden.facing).toBeUndefined();
    expect(hidden.agriConversionStatus).toBeUndefined();

    const visible = buildAgriculturalListingPayload(basePayloadInputs({ facing: 'NORTH', agriConversionStatus: 'converted', fieldVisible: () => true }));
    expect(visible.facing).toBe('NORTH');
    expect(visible.agriConversionStatus).toBe('converted');
  });

  it('converts farmhouseAvailable/fencingDone tri-state strings to boolean|undefined', () => {
    expect(buildAgriculturalListingPayload(basePayloadInputs({ farmhouseAvailable: 'true' })).farmhouseAvailable).toBe(true);
    expect(buildAgriculturalListingPayload(basePayloadInputs({ farmhouseAvailable: 'false' })).farmhouseAvailable).toBe(false);
    expect(buildAgriculturalListingPayload(basePayloadInputs({ farmhouseAvailable: '' })).farmhouseAvailable).toBeUndefined();
    expect(buildAgriculturalListingPayload(basePayloadInputs({ fencingDone: 'true' })).fencingDone).toBe(true);
    expect(buildAgriculturalListingPayload(basePayloadInputs({ fencingDone: '' })).fencingDone).toBeUndefined();
  });

  it('trims title/locality/surveyNumber and omits them when blank', () => {
    const payload = buildAgriculturalListingPayload(basePayloadInputs({ title: '  Farm  ', locality: '  Hejamadi  ', surveyNumber: ' 123/4A ' }));
    expect(payload.title).toBe('Farm');
    expect(payload.locality).toBe('Hejamadi');
    expect(payload.surveyNumber).toBe('123/4A');
    expect(buildAgriculturalListingPayload(basePayloadInputs({ title: '   ' })).title).toBeUndefined();
  });

  it('always sets propertyType and listingPurpose (sale-only)', () => {
    const payload = buildAgriculturalListingPayload(basePayloadInputs());
    expect(payload.propertyType).toBe('agricultural_land');
    expect(payload.listingPurpose).toBe('sale');
  });
});

describe('computeAgriculturalChecklist', () => {
  it('marks hasType/hasPurpose always true, and derives the rest from inputs', () => {
    const checklist = computeAgriculturalChecklist({
      locality: 'Hejamadi',
      landArea: 2,
      priceValid: true,
      title: 'Farm',
      waterSource: 'borewell',
      soilType: '',
      imageCount: 1,
      addressConfirmed: true,
      description: 'A'.repeat(25),
    });
    expect(checklist.hasType).toBe(true);
    expect(checklist.hasPurpose).toBe(true);
    expect(checklist.hasLocality).toBe(true);
    expect(checklist.hasArea).toBe(true);
    expect(checklist.hasPrice).toBe(true);
    expect(checklist.hasTitle).toBe(true);
    expect(checklist.hasConfigDetails).toBe(true);
    expect(checklist.hasPhotos).toBe(true);
    expect(checklist.isPinned).toBe(true);
    expect(checklist.hasDescription).toBe(true);
  });

  it('hasDescription requires at least 20 trimmed characters', () => {
    expect(computeAgriculturalChecklist({
      locality: '', landArea: null, priceValid: false, title: '', waterSource: '', soilType: '',
      imageCount: 0, addressConfirmed: false, description: 'short',
    }).hasDescription).toBe(false);
  });
});

describe('computeAgriculturalStrengthResult', () => {
  it('mirrors ListingTransitionPolicy.validateFields agricultural_land gate: all six conditions must be met to submit', () => {
    const submittable = computeAgriculturalStrengthResult({
      priceValid: true,
      locality: 'Hejamadi',
      landArea: 2.5,
      landAreaUnit: 'acre',
      imageCount: 3,
      locationEntered: true,
      addressConfirmed: true,
    });
    expect(submittable.isSubmittable).toBe(true);
    expect(submittable.percent).toBe(100);
    expect(submittable.missingItems).toEqual([]);
  });

  it('blocks submission when fewer than 3 photos, and reports the remaining-count label', () => {
    const result = computeAgriculturalStrengthResult({
      priceValid: true,
      locality: 'Hejamadi',
      landArea: 2.5,
      landAreaUnit: 'acre',
      imageCount: 1,
      locationEntered: true,
      addressConfirmed: true,
    });
    expect(result.isSubmittable).toBe(false);
    expect(result.missingItems).toEqual(['Add at least 3 photos (1/3)']);
  });

  it('blocks submission when the pin is not confirmed even if locality was searched', () => {
    const result = computeAgriculturalStrengthResult({
      priceValid: true,
      locality: 'Hejamadi',
      landArea: 2.5,
      landAreaUnit: 'acre',
      imageCount: 3,
      locationEntered: true,
      addressConfirmed: false,
    });
    expect(result.isSubmittable).toBe(false);
    expect(result.missingItems).toContain('Map pin confirmed');
  });

  it('locationEntered is satisfied by addressConfirmed alone (matches original || semantics)', () => {
    const result = computeAgriculturalStrengthResult({
      priceValid: true,
      locality: 'Hejamadi',
      landArea: 2.5,
      landAreaUnit: 'acre',
      imageCount: 3,
      locationEntered: false,
      addressConfirmed: true,
    });
    expect(result.gates.find((g) => g.key === 'locationEntered')?.met).toBe(true);
  });
});

describe('computeAgriculturalDescriptionFacts', () => {
  it('passes every input through verbatim to the AgriculturalDescriptionFacts shape', () => {
    const facts = computeAgriculturalDescriptionFacts({
      locality: 'Hejamadi',
      landArea: 2.5,
      landAreaUnit: 'acre',
      facing: 'north',
      waterSource: 'borewell',
      soilType: 'red',
      roadAccess: 'tarred',
      cultivationStatus: 'cultivated',
      landCategory: 'dry',
      farmhouseAvailable: 'true',
      fencingDone: 'false',
      crops: ['PADDY'],
      features: ['Borewell'],
      priceRupees: 7800000,
    });
    expect(facts).toEqual({
      locality: 'Hejamadi',
      landArea: 2.5,
      landAreaUnit: 'acre',
      facing: 'north',
      waterSource: 'borewell',
      soilType: 'red',
      roadAccess: 'tarred',
      cultivationStatus: 'cultivated',
      landCategory: 'dry',
      farmhouseAvailable: 'true',
      fencingDone: 'false',
      crops: ['PADDY'],
      features: ['Borewell'],
      priceRupees: 7800000,
    });
  });
});

describe('computeAgriculturalSpecChips', () => {
  it('renders no chips when landArea and facing are both empty', () => {
    expect(computeAgriculturalSpecChips({ landArea: null, landAreaUnit: 'acre', facing: '' })).toEqual([]);
  });

  it('renders an area chip and a facing chip when both are present', () => {
    const chips = computeAgriculturalSpecChips({ landArea: 2.5, landAreaUnit: 'acre', facing: 'NORTH' });
    expect(chips).toEqual([
      { label: '2.5 acre' },
      { label: 'North facing' },
    ]);
  });

  it('omits the facing chip for an unrecognised facing value', () => {
    const chips = computeAgriculturalSpecChips({ landArea: 2.5, landAreaUnit: 'acre', facing: 'not-a-real-value' });
    expect(chips).toEqual([{ label: '2.5 acre' }]);
  });
});
