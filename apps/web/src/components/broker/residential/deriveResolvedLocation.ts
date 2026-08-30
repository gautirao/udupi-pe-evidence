import type { NominatimResult } from '@/lib/geocode';

// ---------------------------------------------------------------------------
// Issue #1722 correction #4 — PRIVACY deriver.
//
// The full Nominatim `display_name` (and exact pin lat/lng) are PRIVATE —
// they only ever live in useResidentialLocation's hook state (map/pin/POI
// use). Buyer-facing surfaces (BuyerPreviewCard, the persisted `locality`
// column) must only ever see the coarse `publicLoc` this module derives.
//
// publicLoc = structured Nominatim address fields (suburb/neighbourhood/
// village + city/town/county) when available; otherwise falls back to the
// first <=2 comma-separated segments of display_name, excluding any
// all-numeric segment (drops PIN codes). NEVER emits postcode, state,
// country, road, or house_number.
// ---------------------------------------------------------------------------

/** Minimal shape this deriver needs — matches NominatimResult's fields. */
export type DerivableResult = Pick<NominatimResult, 'display_name' | 'address'>;

function dedupe(parts: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.trim().toLowerCase();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(p.trim());
  }
  return out;
}

/** True when a comma-separated segment is entirely numeric (a PIN code). */
function isNumericSegment(segment: string): boolean {
  return /^\d+$/.test(segment.trim());
}

/**
 * Derive the buyer-facing publicLoc string from a Nominatim search/reverse
 * result. PURE — no network, no state.
 */
export function derivePublicLoc(result: DerivableResult): string {
  const addr = result.address;
  if (addr) {
    const locality = addr.suburb || addr.neighbourhood || addr.village;
    const city = addr.city || addr.town || addr.county;
    const parts = dedupe([locality, city].filter((p): p is string => !!p));
    if (parts.length > 0) {
      return parts.join(', ');
    }
  }

  // Fallback — first <=2 comma segments of display_name, dropping any
  // all-numeric segment (PIN code) and empty segments.
  const segments = result.display_name
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !isNumericSegment(s));

  return segments.slice(0, 2).join(', ');
}
