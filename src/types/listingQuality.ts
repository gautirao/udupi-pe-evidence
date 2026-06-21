/**
 * Types for the M28 Listing Quality API response.
 * Mirror the backend contract verbatim — do not add frontend-only fields here.
 * GET /api/broker/listing-quality (JWT required; broker/dealer/admin only)
 */

export type QualityBand = 'BUYER_READY' | 'NEEDS_IMPROVEMENT' | 'PRIORITY_FIX' | 'UNSCORED';
export type ScoreStatus = 'SCORED' | 'NOT_SCORED';
export type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type EngagementStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'LIMITED';

export interface QualityFinding {
  component: string;
  score: number;
  applied: boolean;
  finding: string;
}

export interface QualityFixPlanItem {
  component: string;
  impact: ImpactLevel;
  /** e.g. /broker/listings/{id}/edit */
  action: string;
  editDeepLink: string;
}

export interface ListingEngagement {
  status: EngagementStatus;
  /** null when UNAVAILABLE/LIMITED */
  views: number | null;
  /** null when UNAVAILABLE/LIMITED */
  enquiries: number | null;
  /** null when UNAVAILABLE/LIMITED */
  enquiryRate: number | null;
}

export interface QualityListing {
  listingId: string;
  /** null for incomplete drafts */
  title: string | null;
  status: string;
  scoreStatus: ScoreStatus;
  /** null when NOT_SCORED */
  qualityScore: number | null;
  band: QualityBand;
  /** ISO instant; null when NOT_SCORED */
  computedAt: string | null;
  /** empty when NOT_SCORED */
  findings: QualityFinding[];
  /** empty when NOT_SCORED; editDeepLink = /broker/listings/{id}/edit */
  fixPlan: QualityFixPlanItem[];
  engagement: ListingEngagement;
}

export interface ListingQualityAggregates {
  /** null when zero listings are scored — render honest "—", NEVER 0 */
  averageQuality: number | null;
  buyerReadyCount: number;
  needImprovementCount: number;
  /** DISTINCT count: band==PRIORITY_FIX OR >=1 HIGH-impact fix */
  priorityFixesCount: number;
  filterCounts: {
    all: number;
    buyerReady: number;
    needImprovement: number;
    priorityFix: number;
    notScored: number;
  };
}

export interface ListingQualityResponse {
  /** ISO instant */
  generatedAt: string;
  backfill: {
    status: 'COMPLETE' | 'INCOMPLETE';
    scoredCount: number;
    totalCount: number;
  };
  aggregates: ListingQualityAggregates;
  listings: QualityListing[];
}
