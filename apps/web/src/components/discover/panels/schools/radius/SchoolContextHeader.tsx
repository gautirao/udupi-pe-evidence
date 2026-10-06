/**
 * SchoolContextHeader — Issue #2770. The ONE compact context block for the selected-school state
 * on the desktop reskin (>=1366px): school name + board badge + "Change school" on row 1, the
 * 3/5/10 km radius chips + "N homes within X km" on row 2. Replaces the hero-sized
 * SchoolSummaryBand + the separate "Search radius" chip block (~270px) with a block <=107px, so
 * the first property card surfaces sooner. Below the reskin the panels keep SchoolSummaryBand
 * (bounded compaction) + RadiusChips; this component is desktop-only by construction.
 *
 * Every testid it owns (school-summary-band, school-summary-name, change-school-btn,
 * school-summary-count, <prefix>-{3,5,10}) is the same one the stacked layout exposes.
 */
import { GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { RADIUS_OPTIONS } from './radiusOptions';

export interface SchoolContextHeaderProps {
  school: SchoolResult;
  /** Current result count for the radius (same figure the stacked band's stat shows). */
  listingCount: number;
  intent: DiscoverIntent;
  effectiveRadius: number;
  onRadiusChange: (km: number) => void;
  /** Called when the user clicks "Change school" (unchanged behaviour: clears the school). */
  onChangeSchool: () => void;
  /** "radius-btn" for SchoolSelectedPanel, "combined-radius-btn" for AreaSchoolCombinedPanel. */
  radiusTestIdPrefix: string;
  /**
   * Issue #1793 SR-024 (R1) — the school-radius result is loading or failed, so `listingCount` is
   * not a real count: omit the "N homes within X km" stat instead of rendering "0".
   */
  countPending?: boolean;
}

export function SchoolContextHeader({
  school,
  listingCount,
  intent,
  effectiveRadius,
  onRadiusChange,
  onChangeSchool,
  radiusTestIdPrefix,
  countPending = false,
}: SchoolContextHeaderProps) {
  const boardDisplay = school.board ?? school.boardType ?? null;
  const noun = intent === 'rent' ? 'rental' : 'home';

  return (
    <div className="mx-4 mt-4 mb-3">
      <div
        className="flex flex-col gap-1.5 rounded-2xl border border-slate-800 bg-[#0F172A] p-3 text-white shadow-lg"
        data-testid="school-summary-band"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--plum-tint))] text-[hsl(var(--plum))]">
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
            </span>
            <h3
              className="min-w-0 truncate font-['Fraunces',_ui-serif,_Georgia,_serif] text-lg font-bold tracking-tight text-white"
              data-testid="school-summary-name"
              title={school.name}
            >
              {school.name}
            </h3>
            {boardDisplay && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-plum-tint px-2.5 py-0.5 text-[11px] font-semibold text-plum">
                {boardDisplay}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onChangeSchool}
            data-testid="change-school-btn"
            className="h-8 shrink-0 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            Change school
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex shrink-0 items-center gap-2" role="group" aria-label="Select search radius">
            {RADIUS_OPTIONS.map((km) => {
              const isActive = effectiveRadius === km;
              return (
                <button
                  key={km}
                  type="button"
                  aria-pressed={isActive}
                  data-testid={`${radiusTestIdPrefix}-${km}`}
                  onClick={() => onRadiusChange(km)}
                  className={cn(
                    'h-8 whitespace-nowrap rounded-lg border-2 px-3.5 text-sm font-semibold transition-colors',
                    isActive
                      ? 'border-[hsl(var(--plum))] bg-[hsl(var(--plum-tint))] text-[hsl(var(--plum))]'
                      : 'border-white/25 bg-transparent text-slate-200 hover:border-white/50 hover:text-white',
                  )}
                >
                  {km} km
                </button>
              );
            })}
          </div>
          {!countPending && (
            <p
              className="min-w-0 truncate text-right font-mono text-sm font-semibold tabular-nums text-slate-200"
              data-testid="school-summary-count"
            >
              {listingCount} {listingCount === 1 ? noun : `${noun}s`} within {effectiveRadius} km
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
