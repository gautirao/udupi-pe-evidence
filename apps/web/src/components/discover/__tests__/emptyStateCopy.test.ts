/**
 * Issue #1817 (AC7) — deriveDiscoverEmptyStateCopy unit tests (design §7 cause table).
 */
import { describe, it, expect } from 'vitest';
import { deriveDiscoverEmptyStateCopy } from '../emptyStateCopy';

describe('deriveDiscoverEmptyStateCopy', () => {
  it('filters-only: heading + N-aware description + Clear filters primary + See all N secondary', () => {
    const copy = deriveDiscoverEmptyStateCopy({
      hasPropertyFilters: true,
      hasSearch: false,
      n: 18,
      scopeLabel: 'Whitefield',
      cityLabel: 'Bangalore',
      isCityScope: false,
      noun: 'homes',
    });
    expect(copy.cause).toBe('filters');
    expect(copy.heading).toBe('No homes match these filters');
    expect(copy.description).toBe(
      'All 18 homes in Whitefield are still here — your filters are hiding them.',
    );
    expect(copy.primaryLabel).toBe('Clear filters');
    expect(copy.secondaryLabel).toBe('See all 18 in Whitefield');
  });

  it('filters-only with N unknown: description omits the fabricated number', () => {
    const copy = deriveDiscoverEmptyStateCopy({
      hasPropertyFilters: true,
      hasSearch: false,
      n: null,
      scopeLabel: 'Whitefield',
      cityLabel: 'Bangalore',
      isCityScope: false,
    });
    expect(copy.description).not.toMatch(/\d/);
    expect(copy.secondaryLabel).toBeUndefined();
  });

  it('search-only: \'No results for "{q}"\' + Clear search primary + Search all of {city} secondary when narrower than city', () => {
    const copy = deriveDiscoverEmptyStateCopy({
      hasPropertyFilters: false,
      hasSearch: true,
      searchQuery: '  corner plot  ',
      n: 18,
      scopeLabel: 'Whitefield',
      cityLabel: 'Bangalore',
      isCityScope: false,
    });
    expect(copy.cause).toBe('search');
    expect(copy.heading).toBe('No results for "corner plot"');
    expect(copy.description).toBe('Nothing in Whitefield matches that search.');
    expect(copy.primaryLabel).toBe('Clear search');
    expect(copy.secondaryLabel).toBe('Search all of Bangalore');
  });

  it('search-only at city scope: no "Search all of {city}" secondary (already at city scope)', () => {
    const copy = deriveDiscoverEmptyStateCopy({
      hasPropertyFilters: false,
      hasSearch: true,
      searchQuery: 'plot',
      n: 1240,
      scopeLabel: 'Bangalore',
      cityLabel: 'Bangalore',
      isCityScope: true,
    });
    expect(copy.secondaryLabel).toBeUndefined();
  });

  it('filters AND search both active: combined heading, Clear search primary + Clear filters secondary', () => {
    const copy = deriveDiscoverEmptyStateCopy({
      hasPropertyFilters: true,
      hasSearch: true,
      searchQuery: 'corner plot',
      n: 18,
      scopeLabel: 'Whitefield',
      cityLabel: 'Bangalore',
      isCityScope: false,
    });
    expect(copy.cause).toBe('both');
    expect(copy.heading).toBe('No homes match your search and filters');
    expect(copy.primaryLabel).toBe('Clear search');
    expect(copy.secondaryLabel).toBe('Clear filters');
    expect(copy.secondaryIsClearFilters).toBe(true);
  });

  it('genuinely empty (no filters, no search): "No listings here yet", no action labels', () => {
    const copy = deriveDiscoverEmptyStateCopy({
      hasPropertyFilters: false,
      hasSearch: false,
      n: 0,
      scopeLabel: 'New Area',
      cityLabel: 'Bangalore',
      isCityScope: false,
    });
    expect(copy.cause).toBe('empty');
    expect(copy.heading).toBe('No listings here yet');
    expect(copy.primaryLabel).toBeUndefined();
    expect(copy.secondaryLabel).toBeUndefined();
  });

  it('whitespace-only searchQuery with hasSearch=false behaves as no-search (defensive)', () => {
    const copy = deriveDiscoverEmptyStateCopy({
      hasPropertyFilters: false,
      hasSearch: false,
      searchQuery: '   ',
      n: 0,
      scopeLabel: 'New Area',
      cityLabel: 'Bangalore',
      isCityScope: false,
    });
    expect(copy.cause).toBe('empty');
  });
});
