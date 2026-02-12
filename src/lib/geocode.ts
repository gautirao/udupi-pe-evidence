// Nominatim OSM geocoding wrapper with rate limiting (1 req/sec) and in-memory cache.
// https://nominatim.org/release-docs/develop/api/Search/

export interface NominatimAddress {
  road?: string;
  house_number?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

export interface NominatimResult {
  lat: number;
  lon: number;
  display_name: string;
  address?: NominatimAddress;
}

/** Structured address produced by parseAddress(). */
export interface ParsedAddress {
  address_line1: string;
  address_line2?: string;
  city?: string;
  county?: string;
  postcode?: string;
  country?: string;
}

interface RawNominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
export const MIN_INTERVAL_MS = 1_000; // 1 req/sec per Nominatim usage policy

let lastRequestTime = 0;

/** Exported for testing — reset the throttle timestamp. */
export function _resetThrottle() {
  lastRequestTime = 0;
}

async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
  return fn();
}

// ---------------------------------------------------------------------------
// In-memory cache  (query string → results, capped at MAX_CACHE entries)
// ---------------------------------------------------------------------------

const MAX_CACHE = 50;
const searchCache = new Map<string, NominatimResult[]>();

/** Exported for testing — clear the search cache. */
export function _clearCache() {
  searchCache.clear();
}

function cacheKey(query: string, limit: number): string {
  return `${query.trim().toLowerCase()}|${limit}`;
}

// ---------------------------------------------------------------------------
// Address parsing
// ---------------------------------------------------------------------------

/** Extract structured address fields from a Nominatim address object. */
export function parseAddress(addr?: NominatimAddress): ParsedAddress {
  if (!addr) return { address_line1: '' };

  const line1Parts: string[] = [];
  if (addr.house_number) line1Parts.push(addr.house_number);
  if (addr.road) line1Parts.push(addr.road);
  if (!line1Parts.length && addr.neighbourhood) line1Parts.push(addr.neighbourhood);

  const line2Parts: string[] = [];
  if (addr.suburb) line2Parts.push(addr.suburb);
  if (addr.neighbourhood && line1Parts.length > 0 && !line1Parts.includes(addr.neighbourhood)) {
    line2Parts.push(addr.neighbourhood);
  }

  return {
    address_line1: line1Parts.join(' ') || addr.suburb || addr.neighbourhood || '',
    address_line2: line2Parts.join(', ') || undefined,
    city: addr.city || addr.town || addr.village,
    county: addr.county,
    postcode: addr.postcode,
    country: addr.country,
  };
}

// ---------------------------------------------------------------------------
// Forward geocode (search)
// ---------------------------------------------------------------------------

/**
 * Forward geocode: search for a place name and return matching locations.
 * Bounded to India with a viewbox around coastal Karnataka for relevance.
 * Results are cached in memory to avoid redundant Nominatim calls.
 */
export async function searchNominatim(
  query: string,
  limit = 5,
): Promise<NominatimResult[]> {
  if (!query.trim()) return [];

  const key = cacheKey(query, limit);
  const cached = searchCache.get(key);
  if (cached) return cached;

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: String(limit),
    countrycodes: 'in',
    viewbox: '74.5,13.0,75.1,13.7',
    bounded: '0',
  });

  const data = await throttled(async () => {
    const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) throw new Error(`Nominatim search failed: ${res.status}`);
    return res.json() as Promise<RawNominatimResult[]>;
  });

  const results: NominatimResult[] = data.map((r) => ({
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    display_name: r.display_name,
    address: r.address,
  }));

  // Evict oldest entry when cache is full
  if (searchCache.size >= MAX_CACHE) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) searchCache.delete(oldest);
  }
  searchCache.set(key, results);

  return results;
}

// ---------------------------------------------------------------------------
// Reverse geocode
// ---------------------------------------------------------------------------

/**
 * Reverse geocode: get a display name + structured address for a lat/lon pair.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<NominatimResult | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'json',
    addressdetails: '1',
  });

  const data = await throttled(async () => {
    const res = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) throw new Error(`Nominatim reverse failed: ${res.status}`);
    return res.json() as Promise<RawNominatimResult>;
  });

  if (!data.display_name) return null;

  return {
    lat: parseFloat(data.lat),
    lon: parseFloat(data.lon),
    display_name: data.display_name,
    address: data.address,
  };
}
