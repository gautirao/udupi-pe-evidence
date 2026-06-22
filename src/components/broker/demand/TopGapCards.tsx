/**
 * TopGapCards — renders the top-priority demand gap cards (from topGaps[]).
 *
 * AC3: One CTA chosen by actionType (server-provided). signalType shown as tag only.
 * AC6: Honest empty state via EmptyState component.
 * AC8: CTA routing —
 *       add_listing     → /broker/listings/new with prefill params
 *       improve_listing → in-page scroll to CaptureDemandSection (GapItem has no listingId)
 *       review_gap      → in-page scroll to AllGapsTable
 * AC10: dismiss/read UI only when id !== null.
 */

import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrendingUp, Plus, Edit, Eye, X, CheckCheck, AlertCircle } from 'lucide-react';
import type { GapItem, ActionType, SignalType } from '@/hooks/useBrokerDemandGaps';
import { useMarkGapRead, useDismissGap } from '@/hooks/useBrokerDemandGaps';

// ── Label helpers ─────────────────────────────────────────────────────────────

const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  supply_gap: 'Supply Gap',
  information_gap: 'Info Gap',
  price_signal: 'Price Signal',
  possible_gap: 'Possible Gap',
};

const SIGNAL_TYPE_BADGE_CLASS: Record<SignalType, string> = {
  supply_gap: 'bg-destructive/10 text-destructive border-destructive/20',
  information_gap: 'bg-secondary text-secondary-foreground border-secondary',
  price_signal: 'bg-copper-tint text-copper border-copper/20',
  possible_gap: 'bg-muted text-muted-foreground border-muted',
};

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  add_listing: 'Add Listing',
  improve_listing: 'Improve Listing',
  review_gap: 'Review Gap',
};

// ── Single card ───────────────────────────────────────────────────────────────

interface TopGapCardProps {
  gap: GapItem;
  /** Called when actionType === 'review_gap' — scrolls to the all-gaps table */
  onAllGapsAnchorClick?: () => void;
  /** Called when actionType === 'improve_listing' — scrolls to the capture-demand section */
  onCaptureDemandAnchorClick?: () => void;
}

function TopGapCard({ gap, onAllGapsAnchorClick, onCaptureDemandAnchorClick }: TopGapCardProps) {
  const navigate = useNavigate();
  const markRead = useMarkGapRead();
  const dismiss = useDismissGap();

  const hasId = gap.id !== null;
  const isRead = gap.readAt !== null;

  function handleCta() {
    // Mark as read if id exists and not yet read
    if (hasId && !isRead) {
      markRead.mutate(gap.id as string);
    }
    if (gap.actionType === 'review_gap') {
      onAllGapsAnchorClick?.();
      return;
    }
    if (gap.actionType === 'improve_listing') {
      // GapItem has no listingId by contract — scroll to the CaptureDemandSection
      // which shows the broker's own improvable listings for this demand signal.
      onCaptureDemandAnchorClick?.();
      return;
    }
    // add_listing → new listing pre-filled with gap context
    const params = new URLSearchParams({
      areaKey: gap.areaKey,
      propertyType: gap.propertyType,
      listingPurpose: gap.listingPurpose,
    });
    void navigate(`/broker/listings/new?${params.toString()}`);
  }

  function handleDismiss() {
    if (hasId) {
      dismiss.mutate(gap.id as string);
    }
  }

  const ctaIcon =
    gap.actionType === 'add_listing' ? <Plus className="h-3.5 w-3.5 mr-1" /> :
    gap.actionType === 'improve_listing' ? <Edit className="h-3.5 w-3.5 mr-1" /> :
    <Eye className="h-3.5 w-3.5 mr-1" />;

  const gapScoreDisplay =
    gap.gapScore.value !== null
      ? gap.gapScore.value.toFixed(1)
      : gap.gapScore.confidenceLabel;

  return (
    <Card className={`relative transition-shadow hover:shadow-md ${isRead ? 'opacity-75' : ''}`}>
      <CardContent className="p-4">
        {/* Dismiss button — only when id exists */}
        {hasId && (
          <button
            type="button"
            aria-label="Dismiss gap"
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
            disabled={dismiss.isPending}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Read indicator — role="img" + aria-label on outer span is the single SR announcement */}
        {isRead && (
          <span className="absolute top-3 right-8 text-muted-foreground" role="img" aria-label="Already read">
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}

        {/* Signal type tag */}
        <Badge
          variant="outline"
          className={`text-xs mb-2 ${SIGNAL_TYPE_BADGE_CLASS[gap.signalType]}`}
        >
          {SIGNAL_TYPE_LABELS[gap.signalType]}
        </Badge>

        {/* Area + property context */}
        <p className="text-sm font-semibold text-foreground leading-snug mb-1">
          {gap.areaKey}
        </p>
        <p className="text-xs text-muted-foreground mb-2">
          {gap.propertyType} · {gap.listingPurpose} · {gap.budgetBand}
        </p>

        {/* Gap score */}
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-3.5 w-3.5 text-copper" />
          <span className="text-xs text-muted-foreground">
            Gap score:{' '}
            <span className="font-medium text-foreground">{gapScoreDisplay}</span>
          </span>
        </div>

        {/* Confidence */}
        {gap.confidence.value !== null ? (
          <p className="text-xs text-muted-foreground mb-3">
            Confidence: <span className="font-medium">{gap.confidence.value}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic mb-3">
            {gap.confidence.confidenceLabel}
          </p>
        )}

        {/* Buyer enquiries */}
        {gap.buyerEnquiries.value !== null ? (
          <p className="text-xs text-muted-foreground mb-3">
            {gap.buyerEnquiries.value} buyer enquiries this week
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic mb-3">
            {gap.buyerEnquiries.confidenceLabel}
          </p>
        )}

        {/* CTA — single button keyed off actionType */}
        <Button
          size="sm"
          className="w-full bg-primary hover:bg-primary/90"
          onClick={handleCta}
          disabled={markRead.isPending || dismiss.isPending}
          aria-label={ACTION_TYPE_LABELS[gap.actionType]}
        >
          {ctaIcon}
          {ACTION_TYPE_LABELS[gap.actionType]}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Container ─────────────────────────────────────────────────────────────────

interface TopGapCardsProps {
  gaps: GapItem[];
  isLoading: boolean;
  /** When true, shows a fetch-failure alert rather than the empty/blank state */
  isError?: boolean;
  onRetry?: () => void;
  onAllGapsAnchorClick?: () => void;
  onCaptureDemandAnchorClick?: () => void;
}

export function TopGapCards({ gaps, isLoading, isError, onRetry, onAllGapsAnchorClick, onCaptureDemandAnchorClick }: TopGapCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-8 w-full mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>Couldn't load demand gaps. Check your connection and try again.</span>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              className="ml-4 flex-shrink-0 border-destructive text-destructive hover:bg-destructive/10"
              onClick={onRetry}
            >
              Retry
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (gaps.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-7 w-7 text-muted-foreground" />}
        heading="No priority gaps right now"
        description="You're well-positioned in your areas. Check back as buyer demand evolves."
        size="sm"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {gaps.map((gap, idx) => (
        <TopGapCard
          key={gap.id ?? `gap-${idx}`}
          gap={gap}
          onAllGapsAnchorClick={onAllGapsAnchorClick}
          onCaptureDemandAnchorClick={onCaptureDemandAnchorClick}
        />
      ))}
    </div>
  );
}
