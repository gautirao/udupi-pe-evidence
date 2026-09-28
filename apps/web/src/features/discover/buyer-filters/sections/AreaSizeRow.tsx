import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AreaSizePreset {
  testId: string;
  label: string;
  min: number | undefined;
}

export interface AreaSizeRowProps {
  /** #2459's own resolved label — e.g. "PLOT SIZE (SQ FT)" for a plot-only selection. */
  label: string;
  /** #2459 D1 — non-null whenever more than one area "meaning" is in play; must render alongside the label, not instead of it. */
  disclosure: string | null;
  presets: readonly AreaSizePreset[];
  activeAreaMin: number | null | undefined;
  onSelectArea: (min: number | undefined) => void;
}

/**
 * Issue #2658 (C3) — extracted verbatim from PropertyFilterGroups.tsx: the
 * AREA (SQ FT) preset row (Issue #2555) plus its #2459 D1 disclosure line.
 * Each preset writes `areaMinSqft` through the caller's own
 * `applyAreaBound`-backed handler; "Any size" is active precisely when no
 * lower bound narrows the results.
 */
export function AreaSizeRow({ label, disclosure, presets, activeAreaMin, onSelectArea }: AreaSizeRowProps) {
  return (
    <>
      <div
        className="flex flex-col gap-[7px] md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-[9px] md:items-start"
        data-testid="quick-area-row"
      >
        <span className="pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-[1.25]">
          {label}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((preset) => {
            // "Any size" is active precisely when no lower bound narrows the results.
            const pressed = preset.min === undefined ? activeAreaMin == null : activeAreaMin === preset.min;
            return (
              <Button
                key={preset.testId}
                variant="outline"
                size="sm"
                className={cn(
                  'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
                  pressed
                    ? 'border-copper bg-copper text-copper-foreground shadow-sm hover:bg-copper-hover'
                    : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
                )}
                onClick={() => onSelectArea(preset.min)}
                data-testid={preset.testId}
                aria-pressed={pressed}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>
      </div>
      {disclosure !== null && (
        <p className="text-xs text-muted-foreground md:ml-[105px]" data-testid="quick-area-disclosure">
          {disclosure}
        </p>
      )}
    </>
  );
}
