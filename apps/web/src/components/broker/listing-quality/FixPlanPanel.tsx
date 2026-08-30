import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { QualityListing } from '@/types/listingQuality';
import { bandBadgeClass, bandLabel, impactBadgeClass, safeEditLink } from '@/pages/broker/listingQualityModel';

interface FixPlanPanelProps {
  listing: QualityListing;
  onClose: () => void;
}

export function FixPlanPanel({ listing, onClose }: FixPlanPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate">
            {listing.title ?? 'Untitled listing'}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={bandBadgeClass(listing.band)} variant="outline">
              {bandLabel(listing.band)}
            </Badge>
            {listing.qualityScore !== null ? (
              <span className="text-sm text-muted-foreground">Score: {listing.qualityScore}</span>
            ) : (
              <span className="text-sm text-muted-foreground" data-testid="score-unavailable">
                Not yet scored
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close fix plan panel">
          ✕
        </Button>
      </div>

      {/* Engagement */}
      <div className="mb-4 p-3 rounded-lg bg-muted/50">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Engagement
        </p>
        {listing.engagement.status === 'AVAILABLE' ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold">{listing.engagement.views ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Views</p>
            </div>
            <div>
              <p className="text-lg font-bold">{listing.engagement.enquiries ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Enquiries</p>
            </div>
            <div>
              <p className="text-lg font-bold">
                {listing.engagement.enquiryRate !== null
                  ? `${(listing.engagement.enquiryRate * 100).toFixed(1)}%`
                  : '—'}
              </p>
              <p className="text-xs text-muted-foreground">Rate</p>
            </div>
          </div>
        ) : (
          <p
            className="text-sm text-muted-foreground"
            data-testid="engagement-unavailable"
          >
            {listing.engagement.status === 'LIMITED'
              ? 'Engagement data limited'
              : 'Engagement data unavailable — available after listing goes live'}
          </p>
        )}
      </div>

      {/* Score breakdown */}
      {listing.scoreStatus === 'NOT_SCORED' ? (
        <div className="mb-4 p-3 rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground" data-testid="not-scored-message">
            This listing has not been scored yet. Scores are computed periodically.
          </p>
        </div>
      ) : listing.findings.length > 0 ? (
        <div className="mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Score Breakdown
          </p>
          <div className="space-y-1.5">
            {listing.findings.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${f.applied ? 'bg-green-500' : 'bg-gray-300'}`}
                />
                <div className="min-w-0">
                  <span className="font-medium">{f.component}</span>
                  <span className="text-muted-foreground"> · {f.finding}</span>
                </div>
                <span className="shrink-0 text-muted-foreground ml-auto">{f.score}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Fix plan */}
      {listing.fixPlan.length > 0 && (
        <div className="flex-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Fix Plan
          </p>
          <div className="space-y-2">
            {listing.fixPlan.map((fix, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card"
              >
                <Badge className={impactBadgeClass(fix.impact)} variant="outline">
                  {fix.impact}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">{fix.component}</p>
                  <p className="text-sm">{fix.action}</p>
                </div>
                <Link
                  to={safeEditLink(listing.listingId, fix.editDeepLink)}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  aria-label={`Edit listing for: ${fix.action}`}
                >
                  Edit
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {listing.fixPlan.length === 0 && listing.scoreStatus === 'SCORED' && (
        <div className="p-3 rounded-lg bg-green-50 text-green-800 text-sm">
          <CheckCircle2 className="h-4 w-4 inline mr-1.5" />
          No fixes required — this listing is buyer ready.
        </div>
      )}

      {listing.computedAt && (
        <p className="text-xs text-muted-foreground mt-4">
          Scored {formatDistanceToNow(new Date(listing.computedAt), { addSuffix: true })}
        </p>
      )}
    </div>
  );
}
