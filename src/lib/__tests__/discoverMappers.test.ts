import { describe, it, expect } from 'vitest';
import { filteredMarkerToPropertyListing } from '../discoverMappers';
import { DiscoverFilteredMarker } from '@/hooks/useDiscoverFilteredMarkers';

describe('filteredMarkerToPropertyListing', () => {
  const now = '2026-05-27T00:00:00.000Z';

  it('maps lat/lon from DiscoverFilteredMarker to PropertyListing latitude/longitude', () => {
    const marker: DiscoverFilteredMarker = {
      id: 'abc123',
      lat: 13.3498,
      lon: 74.7852,
      pricePaise: 5000000,
      locality: 'Katapadi',
    };
    const result = filteredMarkerToPropertyListing(marker, now);
    expect(result.latitude).toBe(13.3498);
    expect(result.longitude).toBe(74.7852);
    expect(result.id).toBe('abc123');
  });

  it('produces defined (non-undefined) coordinates so property pins render on map', () => {
    const marker: DiscoverFilteredMarker = {
      id: 'xyz',
      lat: 12.9716,
      lon: 77.5946,
      pricePaise: null,
      locality: null,
    };
    const result = filteredMarkerToPropertyListing(marker, now);
    expect(result.latitude).not.toBeUndefined();
    expect(result.longitude).not.toBeUndefined();
    expect(result.latitude).toBeTypeOf('number');
    expect(result.longitude).toBeTypeOf('number');
  });
});
