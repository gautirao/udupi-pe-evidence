import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchNominatim,
  reverseGeocode,
  parseAddress,
  _clearCache,
  _resetThrottle,
  type NominatimAddress,
} from '@/lib/geocode';

// Mock api.get — geocode.ts now proxies through the backend
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

import { api } from '@/lib/api';
const mockApiGet = vi.mocked(api.get);

// ---------------------------------------------------------------------------
// parseAddress — pure function, no mocking needed
// ---------------------------------------------------------------------------

describe('parseAddress', () => {
  it('returns empty address_line1 when no address provided', () => {
    const result = parseAddress(undefined);
    expect(result).toEqual({ address_line1: '' });
  });

  it('builds address_line1 from house_number + road', () => {
    const addr: NominatimAddress = {
      house_number: '42',
      road: 'MG Road',
      city: 'Udupi',
      county: 'Udupi',
      postcode: '576101',
      country: 'India',
    };
    const result = parseAddress(addr);
    expect(result.address_line1).toBe('42 MG Road');
    expect(result.city).toBe('Udupi');
    expect(result.county).toBe('Udupi');
    expect(result.postcode).toBe('576101');
    expect(result.country).toBe('India');
  });

  it('falls back to neighbourhood when no road/house_number', () => {
    const addr: NominatimAddress = {
      neighbourhood: 'Kunjibettu',
      city: 'Udupi',
    };
    const result = parseAddress(addr);
    expect(result.address_line1).toBe('Kunjibettu');
  });

  it('falls back to suburb when nothing else available', () => {
    const addr: NominatimAddress = { suburb: 'Manipal' };
    const result = parseAddress(addr);
    expect(result.address_line1).toBe('Manipal');
  });

  it('uses town when city is absent', () => {
    const addr: NominatimAddress = { town: 'Kundapura', road: 'NH 66' };
    const result = parseAddress(addr);
    expect(result.city).toBe('Kundapura');
  });

  it('uses village when city and town are absent', () => {
    const addr: NominatimAddress = { village: 'Padubidri', road: 'Coast Road' };
    const result = parseAddress(addr);
    expect(result.city).toBe('Padubidri');
  });

  it('puts suburb in address_line2 when road is present', () => {
    const addr: NominatimAddress = {
      road: 'Temple Road',
      suburb: 'Rathnagiri',
      city: 'Udupi',
    };
    const result = parseAddress(addr);
    expect(result.address_line1).toBe('Temple Road');
    expect(result.address_line2).toBe('Rathnagiri');
  });
});

// ---------------------------------------------------------------------------
// searchNominatim — mocked api.get (proxies through backend)
// ---------------------------------------------------------------------------

describe('searchNominatim', () => {
  beforeEach(() => {
    _clearCache();
    _resetThrottle();
    mockApiGet.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array for blank query', async () => {
    const result = await searchNominatim('   ');
    expect(result).toEqual([]);
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('parses backend response correctly (lat/lon as numbers)', async () => {
    mockApiGet.mockResolvedValueOnce([
      {
        lat: 13.3409,
        lon: 74.7421,
        display_name: 'Udupi, Karnataka, India',
        address: { city: 'Udupi', state: 'Karnataka', country: 'India' },
      },
    ]);

    const results = await searchNominatim('Udupi');
    expect(results).toHaveLength(1);
    expect(results[0].lat).toBe(13.3409);
    expect(results[0].lon).toBe(74.7421);
    expect(results[0].display_name).toBe('Udupi, Karnataka, India');
    expect(results[0].address?.city).toBe('Udupi');
  });

  it('returns cached results on repeated query (no second api.get call)', async () => {
    mockApiGet.mockResolvedValue([
      { lat: 13.0, lon: 74.0, display_name: 'Place A' },
    ]);

    await searchNominatim('Manipal');
    await searchNominatim('Manipal');

    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('cache is case-insensitive', async () => {
    mockApiGet.mockResolvedValue([
      { lat: 13.0, lon: 74.0, display_name: 'Place A' },
    ]);

    await searchNominatim('udupi');
    await searchNominatim('Udupi');

    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('calls backend with encoded query and limit params', async () => {
    mockApiGet.mockResolvedValueOnce([]);

    await searchNominatim('test query', 3);

    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining('test%20query'),
    );
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining('limit=3'),
    );
  });

  it('propagates api errors to the caller', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('network error'));
    await expect(searchNominatim('fail')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// reverseGeocode — mocked api.get
// ---------------------------------------------------------------------------

describe('reverseGeocode', () => {
  beforeEach(() => {
    _resetThrottle();
    mockApiGet.mockReset();
  });

  it('returns structured result with address', async () => {
    mockApiGet.mockResolvedValueOnce({
      lat: 13.35,
      lon: 74.79,
      display_name: 'Manipal, Udupi, Karnataka',
      address: { town: 'Manipal', county: 'Udupi', country: 'India' },
    });

    const result = await reverseGeocode(13.35, 74.79);
    expect(result).not.toBeNull();
    expect(result!.display_name).toBe('Manipal, Udupi, Karnataka');
    expect(result!.address?.town).toBe('Manipal');
  });

  it('returns null when backend returns empty object (no result)', async () => {
    mockApiGet.mockResolvedValueOnce({});

    const result = await reverseGeocode(0, 0);
    expect(result).toBeNull();
  });

  it('calls backend with correct lat/lon params', async () => {
    mockApiGet.mockResolvedValueOnce({
      lat: 13.35,
      lon: 74.79,
      display_name: 'Some Place',
    });

    await reverseGeocode(13.35, 74.79);

    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining('lat=13.35'),
    );
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining('lon=74.79'),
    );
  });
});
