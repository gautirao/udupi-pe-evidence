/**
 * Unit tests for discoverMappers.ts (Issue #1372).
 *
 * Confirms that filteredMarkerToPropertyListing forwards propertyType from the
 * marker so agricultural_land markers are not collapsed to 'other'.
 */
import { describe, it, expect } from 'vitest';
import { filteredMarkerToPropertyListing } from './discoverMappers';
import type { DiscoverFilteredMarker } from '@/hooks/useDiscoverFilteredMarkers';

const NOW = '2026-06-08T00:00:00.000Z';

describe('filteredMarkerToPropertyListing — propertyType mapping (Issue #1372)', () => {
  it('maps agricultural_land propertyType through without collapsing to "other"', () => {
    const marker: DiscoverFilteredMarker = {
      id: 'agri-1',
      lat: 13.4,
      lon: 74.8,
      pricePaise: 50_000_000,
      locality: 'Udupi Rural',
      propertyType: 'agricultural_land',
    };

    const listing = filteredMarkerToPropertyListing(marker, NOW);

    expect(listing.property_type).toBe('agricultural_land');
  });

  it('falls back to "other" when propertyType is null', () => {
    const marker: DiscoverFilteredMarker = {
      id: 'marker-2',
      lat: 13.35,
      lon: 74.75,
      pricePaise: null,
      locality: null,
      propertyType: null,
    };

    const listing = filteredMarkerToPropertyListing(marker, NOW);

    expect(listing.property_type).toBe('other');
  });

  it('falls back to "other" when propertyType is undefined (field absent from API response)', () => {
    const marker: DiscoverFilteredMarker = {
      id: 'marker-3',
      lat: 13.3,
      lon: 74.7,
      pricePaise: 100_000,
      locality: null,
      // propertyType intentionally omitted
    };

    const listing = filteredMarkerToPropertyListing(marker, NOW);

    expect(listing.property_type).toBe('other');
  });

  it('forwards known residential types (house) unchanged', () => {
    const marker: DiscoverFilteredMarker = {
      id: 'house-1',
      lat: 13.34,
      lon: 74.74,
      pricePaise: 200_000_000,
      locality: 'Manipal',
      propertyType: 'house',
    };

    const listing = filteredMarkerToPropertyListing(marker, NOW);

    expect(listing.property_type).toBe('house');
  });

  it('maps price from pricePaise (paisa→rupee conversion)', () => {
    const marker: DiscoverFilteredMarker = {
      id: 'price-test',
      lat: 13.4,
      lon: 74.8,
      pricePaise: 150_00_00_000, // 1,50,00,00,000 paise = 1,50,00,000 rupees
      locality: null,
      propertyType: 'land',
    };

    const listing = filteredMarkerToPropertyListing(marker, NOW);

    expect(listing.price).toBe(15_000_000);
  });
});
