/**
 * DemandSummaryCards — renders the 5 summary metric cards for the demand-gaps page.
 *
 * AC2: Metric.value===null → render confidenceLabel, NEVER 0.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Search, MessageSquare, TrendingUp, Building2, Zap } from 'lucide-react';
import type { DemandGapSummary } from '@/hooks/useBrokerDemandGaps';

interface MetricValueProps {
  value: number | null;
  confidenceLabel: string;
  className?: string;
}

/** Renders the metric value or the confidenceLabel if suppressed. Never renders 0 for null. */
function MetricValue({ value, confidenceLabel, className = 'text-3xl font-bold text-primary' }: MetricValueProps) {
  if (value === null) {
    return <p className="text-sm text-muted-foreground italic" data-testid="metric-null-state">{confidenceLabel}</p>;
  }
  return <p className={className}>{value.toLocaleString()}</p>;
}

export function DemandSummaryCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

interface DemandSummaryCardsProps {
  summary: DemandGapSummary;
}

export function DemandSummaryCards({ summary }: DemandSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6" aria-live="polite">
      {/* Buyer Searches — Metric (may be null/suppressed) */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Search className="h-4 w-4 text-primary" />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Buyer Searches
            </span>
          </div>
          <MetricValue
            value={summary.buyerSearches.value}
            confidenceLabel={summary.buyerSearches.confidenceLabel}
          />
          <p className="text-xs text-muted-foreground mt-0.5">in your areas</p>
        </CardContent>
      </Card>

      {/* Buyer Enquiries — Metric (may be null/suppressed) */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-md bg-copper-tint">
              <MessageSquare className="h-4 w-4 text-copper" />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Buyer Enquiries
            </span>
          </div>
          <MetricValue
            value={summary.buyerEnquiries.value}
            confidenceLabel={summary.buyerEnquiries.confidenceLabel}
          />
          <p className="text-xs text-muted-foreground mt-0.5">this week</p>
        </CardContent>
      </Card>

      {/* Demand Gaps Found — always present */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-md bg-copper-tint">
              <TrendingUp className="h-4 w-4 text-copper" />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Demand Gaps
            </span>
          </div>
          <p className="text-3xl font-bold text-copper">{summary.demandGapsFound}</p>
          <p className="text-xs text-muted-foreground mt-0.5">signals found</p>
        </CardContent>
      </Card>

      {/* Broker Matching Listings — always present */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-md bg-evergreen-tint">
              <Building2 className="h-4 w-4 text-evergreen" />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Your Listings
            </span>
          </div>
          <p className="text-3xl font-bold text-evergreen">{summary.brokerMatchingListings}</p>
          <p className="text-xs text-muted-foreground mt-0.5">matching these gaps</p>
        </CardContent>
      </Card>

      {/* Opportunities to Act — always present */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-md bg-destructive/10">
              <Zap className="h-4 w-4 text-destructive" />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Act Now
            </span>
          </div>
          <p className="text-3xl font-bold text-destructive">{summary.opportunitiesToAct}</p>
          <p className="text-xs text-muted-foreground mt-0.5">opportunities to act</p>
        </CardContent>
      </Card>
    </div>
  );
}

interface DemandSummaryCardsLoadingProps {
  isLoading: true;
  isError?: never;
  onRetry?: never;
  summary?: never;
}

interface DemandSummaryCardsErrorProps {
  isLoading?: never;
  isError: true;
  onRetry: () => void;
  summary?: never;
}

interface DemandSummaryCardsDataProps {
  isLoading?: never;
  isError?: never;
  onRetry?: never;
  summary: DemandGapSummary;
}

type DemandSummaryCardsContainerProps =
  | DemandSummaryCardsLoadingProps
  | DemandSummaryCardsErrorProps
  | DemandSummaryCardsDataProps;

export function DemandSummaryCardsContainer(props: DemandSummaryCardsContainerProps) {
  if (props.isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <DemandSummaryCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (props.isError) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="border-destructive/30">
            <CardContent className="p-4 flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="text-xs">Failed</span>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // At this point isLoading and isError are both falsy — summary is present
  const { summary } = props as DemandSummaryCardsDataProps;
  return <DemandSummaryCards summary={summary} />;
}
