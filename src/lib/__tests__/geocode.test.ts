import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchNominatim,
  reverseGeocode,
  parseAddress,
  _clearCache,
  _resetThrottle,
  MIN_INTERVAL_MS,
  type NominatimAddress,
} from '@/lib/geocode';

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
// searchNominatim — mocked fetch
// ---------------------------------------------------------------------------

describe('searchNominatim', () => {
  beforeEach(() => {
    _clearCache();
    _resetThrottle();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array for blank query', async () => {
    const result = await searchNominatim('   ');
    expect(result).toEqual([]);
  });

  it('parses Nominatim response correctly', async () => {
    const mockResponse = [
      {
        lat: '13.3409',
        lon: '74.7421',
        display_name: 'Udupi, Karnataka, India',
        address: { city: 'Udupi', state: 'Karnataka', country: 'India' },
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const results = await searchNominatim('Udupi');
    expect(results).toHaveLength(1);
    expect(results[0].lat).toBe(13.3409);
    expect(results[0].lon).toBe(74.7421);
    expect(results[0].display_name).toBe('Udupi, Karnataka, India');
    expect(results[0].address?.city).toBe('Udupi');
  });

  it('returns cached results on repeated query (no second fetch)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { lat: '13.0', lon: '74.0', display_name: 'Place A' },
        ]),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchNominatim('Manipal');
    _resetThrottle(); // avoid throttle delay on second call
    await searchNominatim('Manipal');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cache is case-insensitive', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { lat: '13.0', lon: '74.0', display_name: 'Place A' },
        ]),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchNominatim('udupi');
    _resetThrottle();
    await searchNominatim('Udupi');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    await expect(searchNominatim('fail')).rejects.toThrow(
      'Nominatim search failed: 503',
    );
  });

  it('includes addressdetails=1 in request URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchNominatim('test');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('addressdetails=1');
  });
});

// ---------------------------------------------------------------------------
// reverseGeocode — mocked fetch
// ---------------------------------------------------------------------------

describe('reverseGeocode', () => {
  beforeEach(() => {
    _resetThrottle();
    vi.restoreAllMocks();
  });

  it('returns structured result with address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            lat: '13.35',
            lon: '74.79',
            display_name: 'Manipal, Udupi, Karnataka',
            address: { town: 'Manipal', county: 'Udupi', country: 'India' },
          }),
      }),
    );

    const result = await reverseGeocode(13.35, 74.79);
    expect(result).not.toBeNull();
    expect(result!.display_name).toBe('Manipal, Udupi, Karnataka');
    expect(result!.address?.town).toBe('Manipal');
  });

  it('returns null when display_name is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ lat: '0', lon: '0', display_name: '' }),
      }),
    );

    const result = await reverseGeocode(0, 0);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Throttle behaviour
// ---------------------------------------------------------------------------

describe('throttle', () => {
  beforeEach(() => {
    _clearCache();
    _resetThrottle();
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays second request to respect MIN_INTERVAL_MS', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    // First call — immediate
    const p1 = searchNominatim('query1');
    await vi.advanceTimersByTimeAsync(0);
    await p1;

    // Second call — should be delayed (different query to avoid cache)
    const p2 = searchNominatim('query2');

    // Before MIN_INTERVAL_MS, second fetch should not have fired
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance past the throttle
    await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS);
    await p2;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
