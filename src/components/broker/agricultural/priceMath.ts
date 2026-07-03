/**
 * priceMath.ts — issue #1627 (agricultural single-page create flow).
 *
 * Pure per-unit price derivation for the agricultural land price breakdown
 * (per-acre / per-cent / per-sq.ft), mirroring the design mock's "Price
 * breakdown" panel. Broker never types these — they are DERIVED from the
 * entered total price + land area + area unit.
 *
 * Conversion factors are copied verbatim from AreaField.tsx's internal
 * `toSqft()` (the authoritative unit-conversion source for this codebase —
 * see AreaField.tsx's agricultural_land unit options) so this module never
 * drifts from the same land-area math the AreaField input already uses:
 *   1 cent = 435.6 sqft, 1 gunta = 1089 sqft, 1 acre = 43560 sqft,
 *   1 sqm = 10.7639 sqft.
 */

const CENT_SQFT = 435.6;
const GUNTA_SQFT = 1089;
const SQM_SQFT = 10.7639;
const ACRE_SQFT = 43560;

/** Converts an area value in the given unit to square feet. Unknown/'sqft' units pass through unchanged. */
export function toSqft(value: number, unit: string): number {
  switch (unit) {
    case 'cent': return value * CENT_SQFT;
    case 'gunta': return value * GUNTA_SQFT;
    case 'sqm': return value * SQM_SQFT;
    case 'acre': return value * ACRE_SQFT;
    case 'sqft':
    default: return value;
  }
}

export interface AgriPriceBreakdown {
  perAcre: number | null;
  perCent: number | null;
  perSqft: number | null;
}

/**
 * Derives the per-acre / per-cent / per-sq.ft price breakdown from a total
 * rupee price and a land area + unit. Returns all-null (never NaN/Infinity)
 * when price or area is missing, zero, negative, or the converted area is
 * not a finite positive number.
 */
export function computeAgriPriceBreakdown(
  priceRupees: number | null,
  area: number | null,
  areaUnit: string,
): AgriPriceBreakdown {
  if (priceRupees == null || !Number.isFinite(priceRupees) || priceRupees <= 0) {
    return { perAcre: null, perCent: null, perSqft: null };
  }
  if (area == null || !Number.isFinite(area) || area <= 0) {
    return { perAcre: null, perCent: null, perSqft: null };
  }

  const areaSqft = toSqft(area, areaUnit);
  if (!Number.isFinite(areaSqft) || areaSqft <= 0) {
    return { perAcre: null, perCent: null, perSqft: null };
  }

  const perSqftRaw = priceRupees / areaSqft;
  return {
    perAcre: Math.round(perSqftRaw * ACRE_SQFT),
    perCent: Math.round(perSqftRaw * CENT_SQFT),
    perSqft: Math.round(perSqftRaw),
  };
}
