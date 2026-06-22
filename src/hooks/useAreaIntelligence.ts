import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Types — mirror BuyerAreaIntelligenceResponse exactly (AC1) ──────────────

/**
 * Metric<T> wrapper — mirrors the Java DTO shape.
 * value is null when suppressed/unavailable; confidenceLabel carries the honest state.
 * RULE: render value only when non-null; else render confidenceLabel. null NEVER renders as 0.
 */
export interface Metric<T> {
  value: T | null;
  confidenceLabel: string;
}

export interface AreaIntelligenceMetrics {
  /** nullable; null => 'Not enough data yet'. Value in paise — convert to ₹ for display. */
  medianPricePaise: Metric<number>;
  /** nullable; maps to area character signal. */
  dominantPropertyType: Metric<string>;
  /** nullable; also k-anon-suppressed to null below threshold. */
  activeListingCount: Metric<number>;
  /** nullable; also k-anon-suppressed below threshold. Listings in last 30 days. */
  freshListingCount: Metric<number>;
  /** nullable; null => 'Not enough data yet'. e.g. 74.00 */
  avgListingQuality: Metric<number>;
  /**
   * Structurally ALWAYS null — Metric<Void>.
   * Service hardcodes value=null, confidenceLabel='Not enough data yet' in all paths.
   * NEVER derive/invent a value from listing prices.
   */
  mostSearchedBudget: Metric<null>;
}

export interface PriceComparison {
  supported: boolean;
  /** null when supported=false. Render verbatim when present — no above/below hardening. */
  wording: string | null;
}

export interface ListingsCta {
  areaKey: string;
  /** Server-built: 'View listings in {label}' (populated) or 'View listings in this area' (no-row). */
  label: string;
}

/**
 * Mirrors BuyerAreaIntelligenceResponse.
 * available=false means no snapshot row (HTTP 200) — NOT an API error.
 * available=true means a snapshot exists with real metric values (some may still be null/suppressed).
 */
export interface AreaIntelligenceResponse {
  citySlug: string;
  areaKey: string;
  /** null in the no-row case. */
  areaLabel: string | null;
  /** true = snapshot exists; false = no-row (200). */
  available: boolean;
  /** Top-level: 'Enough data' | 'Limited data' | 'Not enough data yet' */
  confidenceLabel: string;
  metrics: AreaIntelligenceMetrics;
  priceComparison: PriceComparison;
  listingsCta: ListingsCta;
}

// ─── Query key ───────────────────────────────────────────────────────────────

export const AREA_INTELLIGENCE_QUERY_KEY_BASE = ['area-intelligence'] as const;

// ─── Hook (AC1) ──────────────────────────────────────────────────────────────

/**
 * Fetch buyer area intelligence for a city + full pipe areaKey.
 * Mirrors useAreaOverview: public skipAuth GET, encodeURIComponent(areaKey).
 * available=false (HTTP 200) is returned as data, not an error.
 */
export function useAreaIntelligence(citySlug: string, areaKey: string) {
  const enabled = citySlug.length > 0 && areaKey.length > 0;
  return useQuery<AreaIntelligenceResponse>({
    queryKey: [...AREA_INTELLIGENCE_QUERY_KEY_BASE, citySlug, areaKey],
    queryFn: () =>
      api.get<AreaIntelligenceResponse>(
        `/api/trends/area-intelligence?city=${encodeURIComponent(citySlug)}&areaKey=${encodeURIComponent(areaKey)}`,
        { skipAuth: true },
      ),
    enabled,
    staleTime: 300_000,
  });
}
