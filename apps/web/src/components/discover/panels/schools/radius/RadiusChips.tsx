/**
 * RadiusChips — moved verbatim from SchoolJourneyPanels.tsx (Issue #2661 commit 3,
 * no logic/JSX changes).
 */
import { cn } from '@/lib/utils';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { RADIUS_OPTIONS } from './radiusOptions';

export interface RadiusChipsProps {
  effectiveRadius: number;
  listingCount: number;
  intent: DiscoverIntent;
  onRadiusChange: (km: number) => void;
  /** testid prefix — "radius-btn" for SchoolSelectedPanel, "combined-radius-btn" for AreaSchoolCombinedPanel */
  testIdPrefix?: string;
  /**
   * Issue #2770 — bounded compaction below the desktop reskin: the visible "Search radius" caption
   * becomes screen-reader-only (the group keeps its aria-label) and the row sheds its top padding
   * (the band above supplies the 24px gap). Chips keep >=44px touch targets.
   */
  compact?: boolean;
  /** Issue #1793 SR-024 (R1) — result loading/failed: omit the active chip's count rather than show "0". */
  countPending?: boolean;
}

export function RadiusChips({
  effectiveRadius,
  listingCount,
  intent,
  onRadiusChange,
  testIdPrefix = 'radius-btn',
  compact = false,
  countPending = false,
}: RadiusChipsProps) {
  const noun = intent === 'rent' ? 'rental' : 'home';
  return (
    <div className={cn('px-4 border-b border-border', compact ? 'pb-3' : 'py-3')}>
      <p className={cn('text-xs font-bold uppercase tracking-wide text-muted-foreground', compact ? 'sr-only' : 'mb-2')}>
        Search radius
      </p>
      {/* Three equal-width buttons (mock parity, cycle 2) — active chip = strong plum
          border + tinted plum fill (not a solid plum block), count stacked under the
          label. Counts on the two non-active chips are never fabricated — a per-radius
          count would need a separate fetch per radius, which does not exist. */}
      <div className="flex gap-2" role="group" aria-label="Select search radius">
        {RADIUS_OPTIONS.map((km) => {
          const isActive = effectiveRadius === km;
          return (
            <button
              key={km}
              type="button"
              aria-pressed={isActive}
              data-testid={`${testIdPrefix}-${km}`}
              onClick={() => onRadiusChange(km)}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-all',
                compact && 'min-h-11 justify-center',
                isActive
                  ? 'border-[hsl(var(--plum))] bg-[hsl(var(--plum-tint))] text-[hsl(var(--plum))] shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:border-[hsl(var(--plum))]/50 hover:text-foreground',
              )}
            >
              <span>{km} km</span>
              {isActive && !countPending && (
                <span className="text-xs font-medium tabular-nums opacity-80">
                  {listingCount} {listingCount === 1 ? noun : `${noun}s`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
