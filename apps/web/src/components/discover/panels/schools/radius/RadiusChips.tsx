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
}

export function RadiusChips({
  effectiveRadius,
  listingCount,
  intent,
  onRadiusChange,
  testIdPrefix = 'radius-btn',
}: RadiusChipsProps) {
  const noun = intent === 'rent' ? 'rental' : 'home';
  return (
    <div className="px-4 py-3 border-b border-border">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
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
                isActive
                  ? 'border-[hsl(var(--plum))] bg-[hsl(var(--plum-tint))] text-[hsl(var(--plum))] shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:border-[hsl(var(--plum))]/50 hover:text-foreground',
              )}
            >
              <span>{km} km</span>
              {isActive && (
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
