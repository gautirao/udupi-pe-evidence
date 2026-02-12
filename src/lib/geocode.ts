// Nominatim OSM geocoding wrapper with rate limiting (1 req/sec).
// https://nominatim.org/release-docs/develop/api/Search/

export interface NominatimResult {
  lat: number;
  lon: number;
  display_name: string;
}

interface RawNominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const MIN_INTERVAL_MS = 1_000; // 1 req/sec per Nominatim usage policy

let lastRequestTime = 0;

async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
  return fn();
}

/**
 * Forward geocode: search for a place name and return matching locations.
 * Bounded to India with a viewbox around coastal Karnataka for relevance.
 */
export async function searchNominatim(
  query: string,
  limit = 5,
): Promise<NominatimResult[]> {
  if (!query.trim()) return [];

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: String(limit),
    countrycodes: 'in',
    // Viewbox: roughly coastal Karnataka (Udupi district + surrounds)
    viewbox: '74.5,13.0,75.1,13.7',
    bounded: '0', // prefer but don't restrict to viewbox
  });

  const data = await throttled(async () => {
    const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) throw new Error(`Nominatim search failed: ${res.status}`);
    return res.json() as Promise<RawNominatimResult[]>;
  });

  return data.map((r) => ({
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    display_name: r.display_name,
  }));
}

/**
 * Reverse geocode: get a display name for a lat/lon pair.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<NominatimResult | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'json',
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
  };
}
