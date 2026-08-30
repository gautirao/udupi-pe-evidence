/**
 * BrokerDemandGaps — /broker/demand-gaps
 *
 * AC1:  Page behind ProtectedRoute, calls GET /api/broker/demand-gaps with JWT.
 *       broker_id is NEVER sent — it is JWT-derived server-side.
 * AC2:  Summary metric cards render value when non-null else confidenceLabel.
 * AC3:  Top priority cards from topGaps[] tagged by signalType, one CTA by actionType.
 * AC4:  All-gaps table, client-side sort + filter.
 * AC5:  Capture-demand section, no related-searches count, honest null states.
 * AC6:  Honest empty / limited / insufficient states.
 * AC7:  'About these signals' caveat + confidence legend.
 * AC8:  CTAs route correctly.
 * AC9:  Loading skeleton / error Alert / empty / limited states.
 * AC10: Dismiss/read UI only when id !== null.
 * AC11: Design-system fidelity: navy+copper tokens, Card/Table/Badge/Skeleton/Alert/EmptyState.
 */

import { useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBrokerDemandGaps } from '@/hooks/useBrokerDemandGaps';
import { DemandSummaryCardsContainer } from '@/components/broker/demand/DemandSummaryCards';
import { TopGapCards } from '@/components/broker/demand/TopGapCards';
import { AllGapsTable } from '@/components/broker/demand/AllGapsTable';
import { CaptureDemandSection } from '@/components/broker/demand/CaptureDemandSection';
import { SignalLegend } from '@/components/broker/demand/SignalLegend';

export default function BrokerDemandGaps() {
  const { isBroker, isAdmin, isLoading: authLoading } = useAuth();
  const allGapsRef = useRef<HTMLDivElement>(null);
  const captureDemandRef = useRef<HTMLElement>(null);

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useBrokerDemandGaps();

  // ── Auth guard ────────────────────────────────────────────────────────────
  if (authLoading) {
    // AppLayout handles its own loading; return minimal shell
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-6 max-w-7xl">
          <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
        </div>
      </AppLayout>
    );
  }

  if (!isBroker && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // ── Scroll to all-gaps section for review_gap CTA ────────────────────────
  function scrollToAllGaps() {
    allGapsRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  // ── Scroll to capture-demand section for improve_listing CTA ────────────
  function scrollToCaptureDemand() {
    captureDemandRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-7xl">

        {/* Header */}
        <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
              <TrendingUp className="h-7 w-7 text-copper" />
              Demand Gaps
            </h1>
            <p className="text-muted-foreground mt-1">
              Buyer demand signals in your areas — act before competitors do.
            </p>
          </div>
        </div>

        {/* Summary metric cards — AC2 */}
        {isLoading ? (
          <DemandSummaryCardsContainer isLoading />
        ) : isError ? (
          <DemandSummaryCardsContainer isError onRetry={() => void refetch()} />
        ) : (
          <DemandSummaryCardsContainer summary={data!.summary} />
        )}

        {/* Global error state — AC9 */}
        {isError && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>Failed to load demand gap signals. Check your connection and try again.</span>
              <Button
                variant="outline"
                size="sm"
                className="ml-4 flex-shrink-0 border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => void refetch()}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Top priority gaps — AC3 */}
        <section className="mb-8" aria-labelledby="top-gaps-heading">
          <h2 id="top-gaps-heading" className="text-lg font-semibold text-primary mb-3">
            Priority Signals
          </h2>
          <TopGapCards
            gaps={data?.topGaps ?? []}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            onAllGapsAnchorClick={scrollToAllGaps}
            onCaptureDemandAnchorClick={scrollToCaptureDemand}
          />
        </section>

        {/* All gaps table — AC4 */}
        <section
          ref={allGapsRef}
          id="all-gaps-section"
          className="mb-8"
          aria-labelledby="all-gaps-heading"
        >
          <h2 id="all-gaps-heading" className="text-lg font-semibold text-primary mb-3">
            All Demand Gaps
          </h2>
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded" />
              ))}
            </div>
          )}
          {!isLoading && (
            <AllGapsTable
              gaps={data?.allGaps ?? []}
              isError={isError}
              onRetry={() => void refetch()}
            />
          )}
        </section>

        {/* Capture-demand listings — AC5 */}
        {!isLoading && !isError && (data?.captureDemandListings.length ?? 0) > 0 && (
          <section ref={captureDemandRef} id="capture-demand-section" className="mb-8" aria-labelledby="capture-demand-heading">
            <h2 id="capture-demand-heading" className="text-lg font-semibold text-primary mb-1">
              Your Matching Listings — Improve to Capture Demand
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              These listings match current buyer demand signals. Improving their quality may
              increase enquiries.
            </p>
            <CaptureDemandSection listings={data!.captureDemandListings} />
          </section>
        )}

        {/* About these signals + confidence legend — AC7 */}
        <section aria-labelledby="signal-legend-heading" className="mb-6">
          <h2 id="signal-legend-heading" className="sr-only">About these signals</h2>
          <SignalLegend />
        </section>

      </div>
    </AppLayout>
  );
}
