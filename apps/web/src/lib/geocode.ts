// Geocoding wrapper — proxies through backend to comply with Nominatim User-Agent requirements.
// The browser Fetch API cannot set the User-Agent header (forbidden header per spec).
// Backend endpoints: GET /api/geocode?q= and GET /api/geocode/reverse?lat=&lon=

import { api } from '@/lib/api';

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

// ---------------------------------------------------------------------------
// In-memory cache  (query string → results, capped at MAX_CACHE entries)
// ---------------------------------------------------------------------------

const MAX_CACHE = 50;
const searchCache = new Map<string, NominatimResult[]>();

/** Exported for testing — clear the search cache. */
export function _clearCache() {
  searchCache.clear();
}

/** Exported for testing compatibility (no-op: throttle is now server-side). */
export function _resetThrottle() { /* no-op */ }
/** Exported for testing compatibility. */
export const MIN_INTERVAL_MS = 1_000;

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
// Forward geocode (search) — via backend proxy
// ---------------------------------------------------------------------------

/**
 * Forward geocode: search for a place name via the backend Nominatim proxy.
 * Results are cached in memory to avoid duplicate requests.
 */
export async function searchNominatim(
  query: string,
  limit = 5,
): Promise<NominatimResult[]> {
  if (!query.trim()) return [];

  const key = cacheKey(query, limit);
  const cached = searchCache.get(key);
  if (cached) return cached;

  const results = await api.get<NominatimResult[]>(
    `/api/geocode?q=${encodeURIComponent(query)}&limit=${limit}`,
  );

  // Evict oldest entry when cache is full
  if (searchCache.size >= MAX_CACHE) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) searchCache.delete(oldest);
  }
  searchCache.set(key, results);

  return results;
}

// ---------------------------------------------------------------------------
// Reverse geocode — via backend proxy
// ---------------------------------------------------------------------------

/**
 * Reverse geocode: get a display name + structured address for a lat/lon pair
 * via the backend Nominatim proxy.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<NominatimResult | null> {
  const result = await api.get<NominatimResult | Record<string, never>>(
    `/api/geocode/reverse?lat=${lat}&lon=${lon}`,
  );

  // Backend returns {} when Nominatim returns no result
  if (!result || !('display_name' in result)) return null;
  return result as NominatimResult;
}
