import { describe, it, expect } from 'vitest';
import { summarizeListings } from '../listingSummary';
import type { AdminListingRow } from '@/hooks/useAdminData';

function makeListing(overrides: Partial<AdminListingRow> = {}): AdminListingRow {
  return {
    id: 'l1',
    is_valid: true,
    ...overrides,
  } as unknown as AdminListingRow;
}

describe('summarizeListings', () => {
  it('slices the first 10 listings for the recent-listings panel', () => {
    const listings = Array.from({ length: 15 }, (_, i) => makeListing({ id: `l${i}` }));
    const { recentListings } = summarizeListings(listings);
    expect(recentListings).toHaveLength(10);
    expect(recentListings[0].id).toBe('l0');
    expect(recentListings[9].id).toBe('l9');
  });

  it('counts only is_valid listings', () => {
    const listings = [
      makeListing({ id: 'a', is_valid: true }),
      makeListing({ id: 'b', is_valid: false }),
      makeListing({ id: 'c', is_valid: true }),
    ];
    const { validListingCount } = summarizeListings(listings);
    expect(validListingCount).toBe(2);
  });

  it('handles an empty listings array', () => {
    const { recentListings, validListingCount } = summarizeListings([]);
    expect(recentListings).toEqual([]);
    expect(validListingCount).toBe(0);
  });
});
