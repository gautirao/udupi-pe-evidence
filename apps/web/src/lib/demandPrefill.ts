/**
 * demandPrefill — shared helpers for threading TopGapCards "add listing" prefill
 * context (areaKey / propertyType / listingPurpose) from the demand-gaps page,
 * through the /broker/listings/new journey selector, into the typed create routes
 * (Issue #1748, follow-up to #1719).
 *
 * Design contract (binding product decision on #1748):
 *  - propertyType is used ONLY to recommend/highlight the matching journey — never
 *    to auto-navigate. recommendJourney returns null for ambiguous/unknown values
 *    so no journey is highlighted rather than the wrong one.
 *  - Invalid / unknown / incompatible values are ignored safely: parse drops junk,
 *    the subtype resolvers return null (the typed form keeps its own default), and
 *    listingPurpose is narrowed to the shared 'sale' | 'rent' vocabulary.
 *
 * propertyType vocabulary mirrors area_demand_signal.property_type (V96), which is
 * the shared discover_event vocabulary. 'land' / 'other' are deliberately NOT mapped
 * to a journey — they are ambiguous across residential/agricultural, so no
 * recommendation is made.
 */

export type JourneyKey = 'residential' | 'commercial' | 'agricultural';

export type ListingPurpose = 'sale' | 'rent';

export interface DemandPrefill {
  areaKey?: string;
  /** Normalised (lowercased/trimmed) property_type token; may be unmapped. */
  propertyType?: string;
  listingPurpose?: ListingPurpose;
}

export type ResidentialSubtype = 'apartment' | 'house' | 'villa' | 'residential_plot';
export type CommercialType = 'commercial' | 'commercial_building' | 'warehouse' | 'commercial_land';

const RESIDENTIAL_TYPES: ReadonlySet<string> = new Set<ResidentialSubtype>([
  'apartment',
  'house',
  'villa',
  'residential_plot',
]);

const COMMERCIAL_TYPES: ReadonlySet<string> = new Set<CommercialType>([
  'commercial',
  'commercial_building',
  'warehouse',
  'commercial_land',
]);

const AGRICULTURAL_TYPES: ReadonlySet<string> = new Set<string>([
  'agricultural_land',
  'farmland',
  'plantation',
  'farm_plot',
  'agricultural_plot',
]);

function normalise(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Parse the prefill context from a URLSearchParams. Junk / empty values are
 * dropped; listingPurpose is narrowed to the shared 'sale' | 'rent' vocabulary
 * (anything else is ignored, leaving the typed form's own default in place).
 */
export function parseDemandPrefill(params: URLSearchParams): DemandPrefill {
  const out: DemandPrefill = {};

  const areaKey = normalise(params.get('areaKey'));
  if (areaKey) out.areaKey = areaKey;

  const propertyType = normalise(params.get('propertyType'))?.toLowerCase();
  if (propertyType) out.propertyType = propertyType;

  const listingPurpose = normalise(params.get('listingPurpose'))?.toLowerCase();
  if (listingPurpose === 'sale' || listingPurpose === 'rent') {
    out.listingPurpose = listingPurpose;
  }

  return out;
}

/**
 * Map a property_type token to the journey it belongs to, or null when the
 * value is ambiguous/unknown (e.g. 'land', 'other') so the caller highlights
 * nothing rather than the wrong journey.
 */
export function recommendJourney(propertyType: string | null | undefined): JourneyKey | null {
  const t = normalise(propertyType)?.toLowerCase();
  if (!t) return null;
  if (RESIDENTIAL_TYPES.has(t)) return 'residential';
  if (COMMERCIAL_TYPES.has(t)) return 'commercial';
  if (AGRICULTURAL_TYPES.has(t)) return 'agricultural';
  return null;
}

/**
 * Build the query-string suffix (including leading '?') to forward the prefill
 * context onto a typed create route. Returns '' when there is nothing to forward,
 * so callers can safely concatenate onto a bare path.
 */
export function buildPrefillSearch(prefill: DemandPrefill): string {
  const params = new URLSearchParams();
  if (prefill.areaKey) params.set('areaKey', prefill.areaKey);
  if (prefill.propertyType) params.set('propertyType', prefill.propertyType);
  if (prefill.listingPurpose) params.set('listingPurpose', prefill.listingPurpose);
  const search = params.toString();
  return search ? `?${search}` : '';
}

/**
 * Resolve a property_type token to a residential subtype the ResidentialListingForm
 * accepts, or null when it is not a residential type (form keeps its default).
 */
export function residentialSubtypeFromPropertyType(
  propertyType: string | null | undefined,
): ResidentialSubtype | null {
  const t = normalise(propertyType)?.toLowerCase();
  return t && RESIDENTIAL_TYPES.has(t) ? (t as ResidentialSubtype) : null;
}

/**
 * Resolve a property_type token to a commercial type the CommercialListingForm
 * accepts, or null when it is not a commercial type (form keeps its default).
 */
export function commercialTypeFromPropertyType(
  propertyType: string | null | undefined,
): CommercialType | null {
  const t = normalise(propertyType)?.toLowerCase();
  return t && COMMERCIAL_TYPES.has(t) ? (t as CommercialType) : null;
}
