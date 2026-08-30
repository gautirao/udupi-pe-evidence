import { describe, it, expect } from 'vitest';
import {
  canTogglePublish,
  compareListings,
  computeTabCounts,
  formatDisplayId,
  getQualityBucket,
  hasMissingCoordinates,
  isContradictoryVisibilityState,
  isPubliclyVisible,
  matchesSearch,
  matchesTab,
  needsAttention,
  neutralizeCsvFormula,
  stripStatusFromUpdate,
} from '../listingInventory';

function listing(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    status: 'LIVE',
    is_valid: true,
    quality_score: 80,
    locality: 'Manipal',
    latitude: 13.34,
    longitude: 74.74,
    ...overrides,
  };
}

describe('isPubliclyVisible', () => {
  it('is true only when status is LIVE and is_valid is true', () => {
    expect(isPubliclyVisible(listing({ status: 'LIVE', is_valid: true }))).toBe(true);
    expect(isPubliclyVisible(listing({ status: 'LIVE', is_valid: false }))).toBe(false);
    expect(isPubliclyVisible(listing({ status: 'DRAFT', is_valid: true }))).toBe(false);
  });
});

describe('isContradictoryVisibilityState', () => {
  it('flags is_valid=true on a non-LIVE listing', () => {
    expect(isContradictoryVisibilityState(listing({ status: 'REJECTED', is_valid: true }))).toBe(true);
    expect(isContradictoryVisibilityState(listing({ status: 'LIVE', is_valid: true }))).toBe(false);
    expect(isContradictoryVisibilityState(listing({ status: 'DRAFT', is_valid: false }))).toBe(false);
  });
});

describe('hasMissingCoordinates', () => {
  it('is true only when locality is present but coords are missing', () => {
    expect(hasMissingCoordinates(listing({ locality: 'Udupi', latitude: null, longitude: null }))).toBe(true);
    expect(hasMissingCoordinates(listing({ locality: 'Udupi', latitude: 13.3, longitude: 74.7 }))).toBe(false);
    expect(hasMissingCoordinates(listing({ locality: null, latitude: null, longitude: null }))).toBe(false);
    expect(hasMissingCoordinates(listing({ locality: '', latitude: null, longitude: null }))).toBe(false);
  });
});

describe('needsAttention — single reusable definition', () => {
  it('flags REJECTED listings', () => {
    expect(needsAttention(listing({ status: 'REJECTED' }))).toBe(true);
  });

  it('flags the contradictory is_valid=true + non-LIVE state', () => {
    expect(needsAttention(listing({ status: 'ARCHIVED', is_valid: true, quality_score: 90 }))).toBe(true);
  });

  it('flags quality_score < 50', () => {
    expect(needsAttention(listing({ quality_score: 49 }))).toBe(true);
    expect(needsAttention(listing({ quality_score: 50 }))).toBe(false);
  });

  it('does not flag a null quality_score on its own', () => {
    expect(needsAttention(listing({ quality_score: null }))).toBe(false);
  });

  it('flags locality present with missing coordinates', () => {
    expect(needsAttention(listing({ latitude: null, longitude: null }))).toBe(true);
  });

  it('is false for a clean LIVE, valid, well-scored, geocoded listing', () => {
    expect(needsAttention(listing())).toBe(false);
  });
});

describe('getQualityBucket', () => {
  it('buckets scores correctly, nulls as unscored', () => {
    expect(getQualityBucket(null)).toBe('unscored');
    expect(getQualityBucket(undefined)).toBe('unscored');
    expect(getQualityBucket(49)).toBe('low');
    expect(getQualityBucket(50)).toBe('medium');
    expect(getQualityBucket(79)).toBe('medium');
    expect(getQualityBucket(80)).toBe('high');
    expect(getQualityBucket(100)).toBe('high');
  });
});

describe('formatDisplayId', () => {
  it('formats a real listing_number, falls back to em-dash', () => {
    expect(formatDisplayId(42)).toBe('PROP-42');
    expect(formatDisplayId(null)).toBe('—');
    expect(formatDisplayId(undefined)).toBe('—');
  });
});

describe('matchesTab', () => {
  it('all always matches', () => {
    expect(matchesTab(listing({ status: 'ARCHIVED' }), 'all')).toBe(true);
  });
  it('published matches only LIVE', () => {
    expect(matchesTab(listing({ status: 'LIVE' }), 'published')).toBe(true);
    expect(matchesTab(listing({ status: 'DRAFT' }), 'published')).toBe(false);
  });
  it('pending matches only PENDING_REVIEW', () => {
    expect(matchesTab(listing({ status: 'PENDING_REVIEW' }), 'pending')).toBe(true);
    expect(matchesTab(listing({ status: 'LIVE' }), 'pending')).toBe(false);
  });
  it('needs-attention delegates to needsAttention', () => {
    expect(matchesTab(listing({ quality_score: 10 }), 'needs-attention')).toBe(true);
    expect(matchesTab(listing(), 'needs-attention')).toBe(false);
  });
  it('archived matches only ARCHIVED', () => {
    expect(matchesTab(listing({ status: 'ARCHIVED' }), 'archived')).toBe(true);
    expect(matchesTab(listing({ status: 'LIVE' }), 'archived')).toBe(false);
  });
});

describe('computeTabCounts', () => {
  it('counts each tab independently over the same dataset', () => {
    const listings = [
      listing({ status: 'LIVE' }),
      listing({ status: 'PENDING_REVIEW', is_valid: false }),
      listing({ status: 'REJECTED', is_valid: false }),
      listing({ status: 'ARCHIVED', is_valid: false }),
      listing({ status: 'LIVE', quality_score: 10 }), // LIVE but also needs-attention
    ];
    const counts = computeTabCounts(listings);
    expect(counts.all).toBe(5);
    expect(counts.published).toBe(2);
    expect(counts.pending).toBe(1);
    expect(counts.archived).toBe(1);
    expect(counts['needs-attention']).toBe(2); // REJECTED + low-quality LIVE
  });
});

describe('matchesSearch', () => {
  const item = { title: 'Sea view villa', locality: 'Malpe', seller_type: 'owner', listing_number: 7 };

  it('matches on title, locality, seller_type, and display id (case-insensitive)', () => {
    expect(matchesSearch(item, 'sea view')).toBe(true);
    expect(matchesSearch(item, 'MALPE')).toBe(true);
    expect(matchesSearch(item, 'owner')).toBe(true);
    expect(matchesSearch(item, 'prop-7')).toBe(true);
    expect(matchesSearch(item, 'nonexistent')).toBe(false);
  });

  it('empty query matches everything', () => {
    expect(matchesSearch(item, '')).toBe(true);
    expect(matchesSearch(item, '   ')).toBe(true);
  });
});

describe('compareListings', () => {
  const a = { updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', price: 100, quality_score: 90 };
  const b = { updated_at: '2026-02-01T00:00:00Z', created_at: '2025-06-01T00:00:00Z', price: 200, quality_score: null };

  it('updated-desc sorts most-recently-updated first', () => {
    expect(compareListings(a, b, 'updated-desc')).toBeGreaterThan(0);
  });
  it('updated-asc sorts oldest-updated first', () => {
    expect(compareListings(a, b, 'updated-asc')).toBeLessThan(0);
  });
  it('created-desc sorts newest-created first', () => {
    expect(compareListings(a, b, 'created-desc')).toBeLessThan(0);
  });
  it('price-desc sorts higher price first', () => {
    expect(compareListings(a, b, 'price-desc')).toBeGreaterThan(0);
  });
  it('completeness-desc sends null quality_score last regardless of direction', () => {
    expect(compareListings(a, b, 'completeness-desc')).toBeLessThan(0);
    expect(compareListings(b, a, 'completeness-desc')).toBeGreaterThan(0);
  });
});

describe('canTogglePublish — LIVE-only gate', () => {
  it('is true only for LIVE listings', () => {
    expect(canTogglePublish({ status: 'LIVE' })).toBe(true);
    for (const status of ['SCRAPED', 'DRAFT', 'PENDING_REVIEW', 'REJECTED', 'ARCHIVED', null]) {
      expect(canTogglePublish({ status })).toBe(false);
    }
  });
});

describe('stripStatusFromUpdate — #2369 no-implicit-approval guard', () => {
  it('removes status from an update payload, however it got there', () => {
    const payload = { locality: 'Manipal', status: 'LIVE', is_valid: true };
    const stripped = stripStatusFromUpdate(payload);
    expect(stripped).not.toHaveProperty('status');
    expect(stripped).toEqual({ locality: 'Manipal', is_valid: true });
  });

  it('is a no-op when status is already absent', () => {
    const payload = { locality: 'Manipal' };
    expect(stripStatusFromUpdate(payload)).toEqual({ locality: 'Manipal' });
  });
});

describe('neutralizeCsvFormula — CSV/formula injection guard', () => {
  it('prefixes values starting with =, +, -, or @ with a single quote', () => {
    expect(neutralizeCsvFormula('=1+1')).toBe("'=1+1");
    expect(neutralizeCsvFormula('=HYPERLINK("http://evil.example")')).toBe(
      '\'=HYPERLINK("http://evil.example")',
    );
    expect(neutralizeCsvFormula('+1234567890')).toBe("'+1234567890");
    expect(neutralizeCsvFormula('-1')).toBe("'-1");
    expect(neutralizeCsvFormula('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('leaves ordinary text untouched', () => {
    expect(neutralizeCsvFormula('Sea view villa')).toBe('Sea view villa');
    expect(neutralizeCsvFormula('')).toBe('');
    expect(neutralizeCsvFormula('3 BHK for sale')).toBe('3 BHK for sale');
  });
});
