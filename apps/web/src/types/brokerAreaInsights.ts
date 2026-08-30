/**
 * Types for GET /api/broker/areas/{citySlug}/{areaKey}/insights
 *
 * Two-category suppression model (from approved-plan.toml [suppression_model]):
 *   (a) Shared aggregates — Metric<T>: value may be null (k-anon / absent /
 *       insufficient_data). Render the confidenceLabel when value is null.
 *       NEVER render 0 for a null.
 *   (b) Broker-own counts — primitive number, always present. A true 0 IS a
 *       real zero with distinct broker-action framing (not "unavailable").
 */

/** Category (a): shared area aggregate — value=null means suppressed/absent. */
export interface Metric<T> {
  value: T | null;
  confidenceLabel: string;
}

/** Category (a): all shared area aggregates. */
export interface AreaAggregates {
  medianPricePaise: Metric<number>;
  dominantPropertyType: Metric<string>;
  activeListingCount: Metric<number>;
  freshListingCount: Metric<number>;
  avgListingQuality: Metric<number>;
  topBuyerNeedSignalCount: Metric<number>;
}

/** Category (b): broker-own first-party counts — always primitive number. */
export interface BrokerCounts {
  liveListingsInArea: number;
  listingsNeedingAttention: number;
  enquiriesOnBrokerListings: number;
  opportunitiesToAct: number;
}

/** Full DTO returned by the backend. */
export interface BrokerAreaInsightsResponse {
  citySlug: string;
  areaKey: string;
  /** null when no snapshot exists (available===false: buildUnavailableResponse returns null) */
  areaLabel: string | null;
  /** false = coherent limited-data state (missing snapshot), NOT an error */
  available: boolean;
  /** Overall confidence label, e.g. "Enough data" / "Limited data" / "Not enough data yet" */
  confidenceLabel: string;
  area: AreaAggregates;
  broker: BrokerCounts;
}
