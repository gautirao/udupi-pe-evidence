import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { AdminListingRow } from '@/hooks/useAdminData';
import {
  QUALITY_BUCKET_LABELS,
  canTogglePublish,
  getQualityBucket,
  needsAttention,
} from '@/lib/listingInventory';
import { AlertTriangle, Archive, ArchiveRestore, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** quality_breakdown may be a canonical shape or {status:"insufficient_data", missing:[...]}. Parse defensively. */
function QualityBreakdown({ breakdown }: { breakdown: unknown }) {
  if (breakdown == null) {
    return <p className="text-xs text-muted-foreground">Breakdown unavailable.</p>;
  }

  if (typeof breakdown === 'object' && breakdown !== null) {
    const obj = breakdown as Record<string, unknown>;
    if (obj.status === 'insufficient_data' && Array.isArray(obj.missing)) {
      return (
        <p className="text-xs text-muted-foreground">
          Insufficient data to score. Missing: {obj.missing.filter((m) => typeof m === 'string').join(', ') || '—'}
        </p>
      );
    }
    const entries = Object.entries(obj).filter(([, v]) => typeof v === 'number');
    if (entries.length > 0) {
      return (
        <ul className={cn('text-xs text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-0.5')}>
          {entries.map(([k, v]) => (
            <li key={k}>
              {k.replace(/_/g, ' ')}: {String(v)}
            </li>
          ))}
        </ul>
      );
    }
  }

  return <p className="text-xs text-muted-foreground">Breakdown unavailable.</p>;
}

interface ListingEditorLifecyclePanelProps {
  listing: AdminListingRow;
  isPublishTogglePending: boolean;
  onTogglePublish: (nextChecked: boolean) => void;
  onArchiveRequested: () => void;
  onRestoreRequested: () => void;
  onApproveScrapedRequested: () => void;
  onRestoreRejectedRequested: () => void;
}

export function ListingEditorLifecyclePanel({
  listing,
  isPublishTogglePending,
  onTogglePublish,
  onArchiveRequested,
  onRestoreRequested,
  onApproveScrapedRequested,
  onRestoreRejectedRequested,
}: ListingEditorLifecyclePanelProps) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Publication &amp; lifecycle
      </h3>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label>Public visibility</Label>
          <p className="text-sm text-muted-foreground">
            {canTogglePublish(listing)
              ? 'Controls whether this LIVE listing is visible to the public.'
              : `Only LIVE listings can be published/unpublished. This listing is ${listing.status}.`}
          </p>
        </div>
        <Switch
          checked={listing.is_valid}
          disabled={!canTogglePublish(listing) || isPublishTogglePending}
          onCheckedChange={onTogglePublish}
          aria-label="Toggle public visibility"
        />
      </div>

      {needsAttention(listing) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>This listing is flagged as needing attention.</span>
        </div>
      )}

      <div className="rounded-lg border p-3 space-y-2">
        <p className="text-sm font-medium">
          Quality score: {listing.quality_score ?? 'Not scored'}
          {listing.quality_score != null && (
            <span className="text-muted-foreground font-normal">
              {' '}
              ({QUALITY_BUCKET_LABELS[getQualityBucket(listing.quality_score)]})
            </span>
          )}
        </p>
        <QualityBreakdown breakdown={listing.quality_breakdown} />
      </div>

      <div className="flex flex-wrap gap-2">
        {listing.status !== 'ARCHIVED' ? (
          <Button type="button" variant="outline" onClick={onArchiveRequested}>
            <Archive className="h-4 w-4 mr-2" />
            Archive
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onRestoreRequested}>
            <ArchiveRestore className="h-4 w-4 mr-2" />
            Restore to draft
          </Button>
        )}

        {listing.status === 'SCRAPED' && (
          <Button
            type="button"
            variant="outline"
            className="text-green-600 border-green-200 hover:bg-green-50"
            onClick={onApproveScrapedRequested}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Approve as live
          </Button>
        )}
        {listing.status === 'REJECTED' && (
          <Button
            type="button"
            variant="outline"
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
            onClick={onRestoreRejectedRequested}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Restore to live
          </Button>
        )}
      </div>
    </section>
  );
}
