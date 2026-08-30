import { describe, it, expect } from 'vitest';
import type { QualityListing } from '@/types/listingQuality';
import {
  bandLabel,
  bandBadgeClass,
  impactBadgeClass,
  sortListings,
  deriveTodaysPriority,
  filterListings,
  safeEditLink,
} from '../listingQualityModel';

function makeListing(overrides: Partial<QualityListing> = {}): QualityListing {
  return {
    listingId: 'listing-1',
    title: 'A Plot',
    status: 'LIVE',
    scoreStatus: 'SCORED',
    qualityScore: 50,
    band: 'NEEDS_IMPROVEMENT',
    computedAt: '2026-06-20T10:00:00Z',
    findings: [],
    fixPlan: [],
    engagement: { status: 'UNAVAILABLE', views: null, enquiries: null, enquiryRate: null },
    ...overrides,
  };
}

describe('bandLabel / bandBadgeClass / impactBadgeClass', () => {
  it('maps every QualityBand to a human label', () => {
    expect(bandLabel('BUYER_READY')).toBe('Buyer Ready');
    expect(bandLabel('NEEDS_IMPROVEMENT')).toBe('Needs Work');
    expect(bandLabel('PRIORITY_FIX')).toBe('Priority Fix');
    expect(bandLabel('UNSCORED')).toBe('Not Scored');
  });

  it('returns a non-empty class string for every band and impact level', () => {
    (['BUYER_READY', 'NEEDS_IMPROVEMENT', 'PRIORITY_FIX', 'UNSCORED'] as const).forEach(band => {
      expect(bandBadgeClass(band)).toMatch(/\S/);
    });
    (['HIGH', 'MEDIUM', 'LOW'] as const).forEach(impact => {
      expect(impactBadgeClass(impact)).toMatch(/\S/);
    });
  });
});

describe('filterListings', () => {
  const listings = [
    makeListing({ listingId: 'a', band: 'PRIORITY_FIX' }),
    makeListing({ listingId: 'b', band: 'NEEDS_IMPROVEMENT' }),
    makeListing({ listingId: 'c', band: 'BUYER_READY' }),
    makeListing({ listingId: 'd', band: 'UNSCORED', scoreStatus: 'NOT_SCORED', qualityScore: null }),
  ];

  it('"all" returns every listing unchanged', () => {
    expect(filterListings(listings, 'all')).toEqual(listings);
  });

  it('filters by band for buyerReady / needImprovement / priorityFix', () => {
    expect(filterListings(listings, 'buyerReady').map(l => l.listingId)).toEqual(['c']);
    expect(filterListings(listings, 'needImprovement').map(l => l.listingId)).toEqual(['b']);
    expect(filterListings(listings, 'priorityFix').map(l => l.listingId)).toEqual(['a']);
  });

  it('filters "notScored" by scoreStatus, not band', () => {
    expect(filterListings(listings, 'notScored').map(l => l.listingId)).toEqual(['d']);
  });
});

describe('sortListings', () => {
  it('sorts by band precedence: priorityFix, needsImprovement, buyerReady, unscored', () => {
    const listings = [
      makeListing({ listingId: 'buyer', band: 'BUYER_READY' }),
      makeListing({ listingId: 'unscored', band: 'UNSCORED' }),
      makeListing({ listingId: 'priority', band: 'PRIORITY_FIX' }),
      makeListing({ listingId: 'needs', band: 'NEEDS_IMPROVEMENT' }),
    ];
    expect(sortListings(listings, 'band').map(l => l.listingId)).toEqual([
      'priority', 'needs', 'buyer', 'unscored',
    ]);
  });

  it('sorts by score descending, keeping null (unscored) at the bottom', () => {
    const listings = [
      makeListing({ listingId: 'low', qualityScore: 20 }),
      makeListing({ listingId: 'null', qualityScore: null }),
      makeListing({ listingId: 'high', qualityScore: 90 }),
    ];
    expect(sortListings(listings, 'score').map(l => l.listingId)).toEqual([
      'high', 'low', 'null',
    ]);
  });

  it('sorts by title alphabetically', () => {
    const listings = [
      makeListing({ listingId: 'z', title: 'Zebra Plot' }),
      makeListing({ listingId: 'a', title: 'Apple Plot' }),
    ];
    expect(sortListings(listings, 'title').map(l => l.listingId)).toEqual(['a', 'z']);
  });

  it('does not mutate the input array', () => {
    const listings = [
      makeListing({ listingId: 'z', title: 'Zebra Plot' }),
      makeListing({ listingId: 'a', title: 'Apple Plot' }),
    ];
    const original = [...listings];
    sortListings(listings, 'title');
    expect(listings).toEqual(original);
  });
});

describe('deriveTodaysPriority', () => {
  it('picks the PRIORITY_FIX listing with the most HIGH-impact fixes', () => {
    const listings = [
      makeListing({
        listingId: 'few-high',
        band: 'PRIORITY_FIX',
        fixPlan: [{ component: 'a', impact: 'HIGH', action: 'x', editDeepLink: '' }],
      }),
      makeListing({
        listingId: 'many-high',
        band: 'PRIORITY_FIX',
        fixPlan: [
          { component: 'a', impact: 'HIGH', action: 'x', editDeepLink: '' },
          { component: 'b', impact: 'HIGH', action: 'y', editDeepLink: '' },
        ],
      }),
    ];
    expect(deriveTodaysPriority(listings)?.listingId).toBe('many-high');
  });

  it('falls back to the first NEEDS_IMPROVEMENT listing when there is no PRIORITY_FIX', () => {
    const listings = [
      makeListing({ listingId: 'buyer', band: 'BUYER_READY' }),
      makeListing({ listingId: 'needs-1', band: 'NEEDS_IMPROVEMENT' }),
      makeListing({ listingId: 'needs-2', band: 'NEEDS_IMPROVEMENT' }),
    ];
    expect(deriveTodaysPriority(listings)?.listingId).toBe('needs-1');
  });

  it('returns null when there is no PRIORITY_FIX or NEEDS_IMPROVEMENT listing', () => {
    const listings = [
      makeListing({ listingId: 'buyer', band: 'BUYER_READY' }),
      makeListing({ listingId: 'unscored', band: 'UNSCORED' }),
    ];
    expect(deriveTodaysPriority(listings)).toBeNull();
  });
});

describe('safeEditLink', () => {
  it('returns the fallback route when listingId is null/undefined', () => {
    expect(safeEditLink(null, '/broker/listings/x/edit')).toBe('/broker/listings');
    expect(safeEditLink(undefined, '/broker/listings/x/edit')).toBe('/broker/listings');
  });

  it('returns the provided href when set', () => {
    expect(safeEditLink('id-1', '/broker/listings/id-1/edit')).toBe('/broker/listings/id-1/edit');
  });

  it('builds a deep-link from listingId when the href is empty', () => {
    expect(safeEditLink('id-1', '')).toBe('/broker/listings/id-1/edit');
  });
});
