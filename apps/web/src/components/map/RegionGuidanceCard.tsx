import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Issue #1808 — marker-accurate overview kind for the region-overview state.
 * 'zones'  → the map renders zone/group bubbles (multi-group region).
 * 'areas'  → the map renders full area pins (single-group region — the region
 *            IS one area group, e.g. the Udupi 3-level "south-udupi" case).
 * null     → overview markers have not resolved yet (loading); render the
 *            literally-accurate generic fallback (never a withholding phrase).
 */
export type RegionOverviewMarkerKind = 'zones' | 'areas' | null;

export interface RegionGuidanceCardProps {
  /** Full region display name, e.g. "East Bangalore". */
  regionName: string;
  /** Marker-accurate variant per user decision q1 — see REGION_SELECTION_GUIDANCE.md §7/§9. */
  markerKind: RegionOverviewMarkerKind;
  /**
   * True only when this region pick originated from a map/panel click (not a
   * deep-link/cold-load). Gates the directional arrow nudge — the card itself
   * always renders regardless of source (Issue #1808 AC5).
   */
  pulseEligible: boolean;
  /** True when the user has `prefers-reduced-motion: reduce` — suppresses the arrow nudge (§8). */
  prefersReducedMotion: boolean;
  onDismiss: () => void;
}

const TITLE_ID = 'region-guidance-card-title';

function bodyFor(regionName: string, markerKind: RegionOverviewMarkerKind): string {
  if (markerKind === 'zones') return `Showing the zones of ${regionName} — pick one to see its areas.`;
  if (markerKind === 'areas') return `Showing the areas of ${regionName}.`;
  return `Showing an overview of ${regionName}.`;
}

/**
 * Issue #1808 — presentational map guidance card shown ONLY at the
 * region-overview state (scope set, journey/groupId/areaKey/schoolId all
 * null). Never covers the map centre or the zoom/summary controls (top-right
 * on desktop / top-of-map on mobile, avoiding both the top-left breadcrumb
 * and the bottom map chrome). Purely presentational — no URL/camera writes.
 */
export function RegionGuidanceCard({
  regionName,
  markerKind,
  pulseEligible,
  prefersReducedMotion,
  onDismiss,
}: RegionGuidanceCardProps) {
  const nudge = pulseEligible && !prefersReducedMotion;
  return (
    <div
      role="note"
      aria-labelledby={TITLE_ID}
      data-testid="region-guidance-card"
      className="absolute z-[1000] top-14 inset-x-3 lg:top-4 lg:inset-x-auto lg:right-4 lg:w-72 rounded-xl border border-border border-l-[3px] border-l-[hsl(var(--copper))] bg-card/95 px-4 py-3 shadow-md backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            Region selected
          </span>
          <h2 id={TITLE_ID} className="mt-0.5 truncate text-[15px] font-bold text-foreground">
            {regionName}
          </h2>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss region guidance"
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
        {bodyFor(regionName, markerKind)}
      </p>
      <p className="mt-2 text-[12.5px] font-semibold text-[hsl(var(--copper))]">
        <span className="lg:hidden">
          Choose how to search below{' '}
          <span className={cn('dp-cue-arrow inline-block', nudge && 'dp-cue-arrow--nudge-y')}>
            ↓
          </span>
        </span>
        <span className="hidden lg:inline">
          Choose how to continue on the right{' '}
          <span className={cn('dp-cue-arrow inline-block', nudge && 'dp-cue-arrow--nudge-x')}>
            →
          </span>
        </span>
      </p>
    </div>
  );
}
