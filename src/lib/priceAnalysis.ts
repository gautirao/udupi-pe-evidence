import { PropertyListing } from '@/hooks/usePropertyListings';

function listingKey(locality: string, propertyType: string, bedrooms: number | null): string {
  return `${locality}:${propertyType}:${bedrooms ?? 'null'}`;
}

function computeRate(listing: PropertyListing): number | null {
  if (!['apartment', 'house', 'commercial'].includes(listing.property_type)) {
    return listing.price_per_cent_paise ? listing.price_per_cent_paise / 100 : null;
  }
  if (
    listing.built_area &&
    listing.built_area > 0 &&
    listing.built_area_unit === 'sqft' &&
    listing.price
  ) {
    return Math.round(listing.price / listing.built_area);
  }
  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Groups listings by locality:propertyType:bedrooms and returns a Map of median price-per-unit.
 * Only listings with a computable rate are included in each group's median.
 * Groups with fewer than 5 comps are excluded (insufficient data).
 */
export function computeAreaMedians(listings: PropertyListing[]): Map<string, number> {
  const groups = new Map<string, number[]>();

  for (const listing of listings) {
    if (!listing.locality) continue;
    const rate = computeRate(listing);
    if (rate === null) continue;
    const key = listingKey(listing.locality, listing.property_type, listing.bedrooms ?? null);
    const arr = groups.get(key) ?? [];
    arr.push(rate);
    groups.set(key, arr);
  }

  const medians = new Map<string, number>();
  for (const [key, rates] of groups) {
    if (rates.length >= 5) {
      medians.set(key, median(rates));
    }
  }
  return medians;
}

export type MarketSignal = {
  signal: 'good_value' | 'great_deal';
  percent: number;
  rate: number;
  basis: 'per_sqft' | 'per_cent';
};

/**
 * Returns the market signal for a listing relative to its area median.
 * Returns null if the listing has no computable rate or fewer than 5 area comps.
 */
export function getMarketSignal(
  listing: PropertyListing,
  medians: Map<string, number>
): MarketSignal | null {
  if (!listing.locality) return null;
  const rate = computeRate(listing);
  if (rate === null) return null;

  const key = listingKey(listing.locality, listing.property_type, listing.bedrooms ?? null);
  const areaMedian = medians.get(key);
  if (areaMedian === undefined) return null;

  const ratio = rate / areaMedian;
  const basis: 'per_sqft' | 'per_cent' = ['apartment', 'house', 'commercial'].includes(
    listing.property_type
  )
    ? 'per_sqft'
    : 'per_cent';

  if (ratio <= 0.7) {
    return { signal: 'great_deal', percent: Math.round((1 - ratio) * 100), rate, basis };
  }
  if (ratio <= 0.85) {
    return { signal: 'good_value', percent: Math.round((1 - ratio) * 100), rate, basis };
  }
  return null;
}
