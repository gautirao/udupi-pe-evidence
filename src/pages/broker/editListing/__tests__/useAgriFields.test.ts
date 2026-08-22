import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAgriFields } from '../useAgriFields';
import type { ListingResponse } from '@/hooks/useBrokerListings';

// Minimal ListingResponse fixture — only the fields useAgriFields.hydrate() reads
// are meaningful here; the rest satisfy the required interface shape.
function makeListing(overrides: Partial<ListingResponse>): ListingResponse {
  return {
    id: 'listing-1',
    status: 'DRAFT',
    propertyType: 'agricultural_land',
    title: null,
    locality: null,
    price: null,
    description: null,
    landArea: null,
    landAreaUnit: null,
    bedrooms: null,
    builtArea: null,
    builtAreaUnit: null,
    latitude: null,
    longitude: null,
    addressConfirmed: false,
    imageCount: 0,
    firstImageUrl: null,
    rejectionReason: null,
    videoUrl: null,
    reraNumber: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    listingPurpose: null,
    carpetArea: null,
    carpetAreaUnit: null,
    floorNumber: null,
    totalFloors: null,
    furnishingStatus: null,
    washrooms: null,
    parkingCount: null,
    roadFrontageFt: null,
    commercialUsage: null,
    numberOfUnits: null,
    monthlyRent: null,
    securityDepositMonths: null,
    lockInMonths: null,
    sellerType: null,
    earnedBadgeCount: 0,
    areaKey: null,
    waterSource: null,
    soilType: null,
    roadAccess: null,
    cultivationStatus: null,
    ownershipType: null,
    surveyNumber: null,
    ...overrides,
  };
}

describe('useAgriFields', () => {
  it('initializes all 9 values to empty string', () => {
    const { result } = renderHook(() => useAgriFields());

    expect(result.current.values).toEqual({
      waterSource: '',
      soilType: '',
      roadAccess: '',
      cultivationStatus: '',
      surveyNumber: '',
      landCategory: '',
      agriConversionStatus: '',
      farmhouseAvailable: '',
      fencingDone: '',
    });
  });

  it('setters round-trip into values', () => {
    const { result } = renderHook(() => useAgriFields());

    act(() => {
      result.current.setters.setWaterSource('BOREWELL');
      result.current.setters.setSoilType('CLAY');
      result.current.setters.setRoadAccess('TARRED_ROAD');
      result.current.setters.setCultivationStatus('FALLOW');
      result.current.setters.setSurveyNumber('123/4A');
      result.current.setters.setLandCategory('WET_LAND');
      result.current.setters.setAgriConversionStatus('CONVERSION_APPLIED');
      result.current.setters.setFarmhouseAvailable('true');
      result.current.setters.setFencingDone('false');
    });

    expect(result.current.values).toEqual({
      waterSource: 'BOREWELL',
      soilType: 'CLAY',
      roadAccess: 'TARRED_ROAD',
      cultivationStatus: 'FALLOW',
      surveyNumber: '123/4A',
      landCategory: 'WET_LAND',
      agriConversionStatus: 'CONVERSION_APPLIED',
      farmhouseAvailable: 'true',
      fencingDone: 'false',
    });
  });

  it('hydrate() sets all 9 fields from a listing, mapping null to empty string', () => {
    const { result } = renderHook(() => useAgriFields());
    const listing = makeListing({
      waterSource: 'RIVER',
      soilType: 'RED_LATERITE',
      roadAccess: 'KACHCHA_ROAD',
      cultivationStatus: 'CULTIVATED',
      surveyNumber: '99/1',
      landCategory: 'DRY_LAND',
      agriConversionStatus: 'APPROVED_FOR_CONVERSION',
      farmhouseAvailable: true,
      fencingDone: false,
    });

    act(() => {
      result.current.hydrate(listing);
    });

    expect(result.current.values).toEqual({
      waterSource: 'RIVER',
      soilType: 'RED_LATERITE',
      roadAccess: 'KACHCHA_ROAD',
      cultivationStatus: 'CULTIVATED',
      surveyNumber: '99/1',
      landCategory: 'DRY_LAND',
      agriConversionStatus: 'APPROVED_FOR_CONVERSION',
      farmhouseAvailable: 'true',
      fencingDone: 'false',
    });
  });

  it('hydrate() falls back to empty string for null string fields and "" for unset tri-state booleans', () => {
    const { result } = renderHook(() => useAgriFields());
    const listing = makeListing({
      waterSource: null,
      soilType: null,
      roadAccess: null,
      cultivationStatus: null,
      surveyNumber: null,
      landCategory: null,
      agriConversionStatus: null,
      farmhouseAvailable: null,
      fencingDone: null,
    });

    // Seed with non-empty values first to prove hydrate() actively resets them.
    act(() => {
      result.current.setters.setWaterSource('BOREWELL');
      result.current.setters.setAgriConversionStatus('NOT_SURE');
      result.current.setters.setFarmhouseAvailable('true');
    });

    act(() => {
      result.current.hydrate(listing);
    });

    expect(result.current.values).toEqual({
      waterSource: '',
      soilType: '',
      roadAccess: '',
      cultivationStatus: '',
      surveyNumber: '',
      landCategory: '',
      agriConversionStatus: '',
      farmhouseAvailable: '',
      fencingDone: '',
    });
  });
});
