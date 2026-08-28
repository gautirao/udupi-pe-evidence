import { describe, it, expect } from 'vitest';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import {
  ageInDays,
  computeQueueStats,
  filterAndSortListings,
  findNextListing,
  getReviewFlags,
  isBulkApprovalEligible,
  needsAttention,
  DEFAULT_FILTER_STATE,
} from '../pendingApprovalsHelpers';

function makeListing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'l1',
    status: 'PENDING_REVIEW',
    propertyType: 'apartment',
    title: 'Test listing',
    locality: 'Manipal',
    price: 100000,
    description: 'desc',
    landArea: null,
    landAreaUnit: null,
    bedrooms: null,
    builtArea: null,
    builtAreaUnit: null,
    latitude: null,
    longitude: null,
    addressConfirmed: true,
    imageCount: 2,
    firstImageUrl: null,
    rejectionReason: null,
    videoUrl: null,
    reraNumber: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    areaKey: null,
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
    waterSource: null,
    soilType: null,
    roadAccess: null,
    cultivationStatus: null,
    ownershipType: null,
    surveyNumber: null,
    ...overrides,
  } as ListingResponse;
}

describe('pendingApprovalsHelpers', () => {
  it('ageInDays computes whole days from a fixed "now"', () => {
    const now = new Date('2026-08-28T00:00:00Z');
    expect(ageInDays('2026-08-20T00:00:00Z', now)).toBe(8);
    expect(ageInDays('2026-08-28T00:00:00Z', now)).toBe(0);
  });

  it('needsAttention is true when age > 7 days OR address is unconfirmed (documented rule)', () => {
    const now = new Date('2026-08-28T00:00:00Z');
    expect(needsAttention(makeListing({ createdAt: '2026-08-19T00:00:00Z' }), now)).toBe(true); // 9 days
    expect(needsAttention(makeListing({ createdAt: '2026-08-27T00:00:00Z' }), now)).toBe(false); // 1 day, confirmed
    expect(
      needsAttention(makeListing({ createdAt: '2026-08-27T00:00:00Z', addressConfirmed: false }), now),
    ).toBe(true);
  });

  it('getReviewFlags returns only real, derivable flags', () => {
    const listing = makeListing({ title: null, imageCount: 0, addressConfirmed: false });
    expect(getReviewFlags(listing)).toEqual(['missing_info', 'no_photos', 'location_unconfirmed']);
    expect(getReviewFlags(makeListing())).toEqual([]);
  });

  it('isBulkApprovalEligible is true only when a listing has no review flags', () => {
    expect(isBulkApprovalEligible(makeListing())).toBe(true);
    expect(isBulkApprovalEligible(makeListing({ imageCount: 0 }))).toBe(false);
    expect(isBulkApprovalEligible(makeListing({ addressConfirmed: false }))).toBe(false);
    expect(isBulkApprovalEligible(makeListing({ title: null }))).toBe(false);
  });

  it('findNextListing returns the next item in queue order, wraps around, and returns null when nothing else remains', () => {
    const list = [makeListing({ id: 'a' }), makeListing({ id: 'b' }), makeListing({ id: 'c' })];
    expect(findNextListing(list, 'a')?.id).toBe('b');
    expect(findNextListing(list, 'c')?.id).toBe('a');
    expect(findNextListing([makeListing({ id: 'solo' })], 'solo')).toBeNull();
    expect(findNextListing(list, 'not-in-list')).toBeNull();
  });

  it('computeQueueStats aggregates newToday/overSevenDays/needsAttention', () => {
    const now = new Date('2026-08-28T00:00:00Z');
    const listings = [
      makeListing({ id: 'a', createdAt: '2026-08-28T00:00:00Z' }), // today
      makeListing({ id: 'b', createdAt: '2026-08-01T00:00:00Z' }), // >7 days
      makeListing({ id: 'c', createdAt: '2026-08-27T00:00:00Z', addressConfirmed: false }), // needs attention
    ];
    expect(computeQueueStats(listings, now)).toEqual({ newToday: 1, overSevenDays: 1, needsAttention: 2 });
  });

  it('filterAndSortListings filters by search, type, locality, age, flags and sorts by createdAt', () => {
    const now = new Date('2026-08-28T00:00:00Z');
    const listings = [
      makeListing({ id: 'old', title: 'Old villa', createdAt: '2026-08-01T00:00:00Z' }),
      makeListing({ id: 'new', title: 'New apartment', createdAt: '2026-08-27T00:00:00Z' }),
    ];

    const oldestFirst = filterAndSortListings(listings, DEFAULT_FILTER_STATE, now);
    expect(oldestFirst.map((l) => l.id)).toEqual(['old', 'new']);

    const newestFirst = filterAndSortListings(listings, { ...DEFAULT_FILTER_STATE, sort: 'newest' }, now);
    expect(newestFirst.map((l) => l.id)).toEqual(['new', 'old']);

    const searched = filterAndSortListings(listings, { ...DEFAULT_FILTER_STATE, search: 'villa' }, now);
    expect(searched.map((l) => l.id)).toEqual(['old']);

    const byAge = filterAndSortListings(listings, { ...DEFAULT_FILTER_STATE, ageBucket: '7plus' }, now);
    expect(byAge.map((l) => l.id)).toEqual(['old']);
  });
});
