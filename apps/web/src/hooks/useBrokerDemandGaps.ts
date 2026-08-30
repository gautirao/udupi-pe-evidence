import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// ── DTO interfaces (verbatim #1534 contract) ─────────────────────────────────

/**
 * A metric that may be suppressed for k-anonymity.
 * value===null means suppressed — render confidenceLabel, NEVER 0/undefined.
 */
export interface Metric<T> {
  value: T | null;
  confidenceLabel: string;
}

export type SignalType = 'supply_gap' | 'information_gap' | 'price_signal' | 'possible_gap';
export type ActionType = 'add_listing' | 'improve_listing' | 'review_gap';

export interface GapItem {
  /** null means no server-side record exists yet — omit dismiss/read controls */
  id: string | null;
  areaKey: string;
  propertyType: string;
  listingPurpose: string;
  budgetBand: string;
  /** ISO date string YYYY-MM-DD */
  week: string;
  gapScore: Metric<number | null>;
  signalType: SignalType;
  /** Server-provided — render CTA keyed off this, do NOT re-derive from signalType */
  actionType: ActionType;
  confidence: Metric<string | null>;
  buyerEnquiries: Metric<number | null>;
  brokerLiveCount: number;
  readAt: string | null;
  dismissedAt: string | null;
}

export interface CaptureDemandListing {
  listingId: string;
  title: string;
  areaKey: string;
  propertyType: string;
  listingPurpose: string;
  /** Paise (integer). null = not set; render honest empty, never 0 */
  pricePaise: number | null;
  /** null = not yet scored */
  qualityScore: number | null;
}

export interface DemandGapSummary {
  buyerSearches: Metric<number | null>;
  buyerEnquiries: Metric<number | null>;
  /** Always present — broker-own data */
  demandGapsFound: number;
  /** Always present — broker-own data */
  brokerMatchingListings: number;
  /** Always present — broker-own data */
  opportunitiesToAct: number;
}

export interface DemandGapsResponse {
  summary: DemandGapSummary;
  topGaps: GapItem[];
  allGaps: GapItem[];
  captureDemandListings: CaptureDemandListing[];
}

// ── Query key ─────────────────────────────────────────────────────────────────

export const DEMAND_GAPS_QUERY_KEY = ['broker', 'demand-gaps'] as const;

// ── Query hook ────────────────────────────────────────────────────────────────

/**
 * Fetches the broker demand-gaps analysis.
 * Auth: JWT auto-attached by api.ts.
 * NEVER sends a broker_id — it is JWT-derived server-side.
 *
 * The query is gated on auth resolution: it will not fire while the auth
 * session is still loading, or if the caller is neither a broker nor an admin.
 * This avoids a wasted 403 round-trip before the role guard has evaluated.
 */
export function useBrokerDemandGaps() {
  const { isLoading: authLoading, isBroker, isAdmin } = useAuth();
  return useQuery({
    queryKey: DEMAND_GAPS_QUERY_KEY,
    queryFn: () => api.get<DemandGapsResponse>('/api/broker/demand-gaps'),
    staleTime: 5 * 60_000, // 5 min — signals change infrequently
    // Only fetch once auth is resolved AND caller is authorized for this endpoint
    enabled: !authLoading && (isBroker || isAdmin),
  });
}

// ── Mutation hooks ────────────────────────────────────────────────────────────

/**
 * Mark a gap alert as read (POST /api/broker/alerts/{id}/read).
 * Only call when GapItem.id !== null.
 */
export function useMarkGapRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<void>(`/api/broker/alerts/${id}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: DEMAND_GAPS_QUERY_KEY });
    },
  });
}

/**
 * Dismiss a gap alert (POST /api/broker/alerts/{id}/dismiss).
 * Only call when GapItem.id !== null.
 */
export function useDismissGap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<void>(`/api/broker/alerts/${id}/dismiss`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: DEMAND_GAPS_QUERY_KEY });
    },
  });
}
