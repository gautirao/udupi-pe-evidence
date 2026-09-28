import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface BedroomsRowProps {
  bedroomOptions: readonly number[];
  activeBedrooms: ReadonlySet<number>;
  onToggleBedroom: (bed: number) => void;
}

/**
 * Issue #2658 (C3) — extracted verbatim from PropertyFilterGroups.tsx. Issue
 * #2555 / #2459 AC2 — Bedrooms is RESIDENTIAL-ONLY; the caller renders this
 * only while `showBedroomsRow` is true (a commercial or plot-only selection
 * carries `bedrooms` NULL, so this control could only ever narrow results to
 * nothing there — see `bedroomApplicability.ts`). That gate stays the
 * caller's responsibility, unchanged by this extraction.
 */
export function BedroomsRow({ bedroomOptions, activeBedrooms, onToggleBedroom }: BedroomsRowProps) {
  return (
    <div
      className="flex flex-col gap-[7px] md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-[9px] md:items-start"
      data-testid="quick-bedrooms-row"
    >
      <span className="pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-[1.25]">
        Bedrooms
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {bedroomOptions.map((bed) => (
          <Button
            key={bed}
            variant="outline"
            size="sm"
            className={cn(
              'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
              activeBedrooms.has(bed)
                ? 'border-copper bg-copper text-copper-foreground shadow-sm hover:bg-copper-hover'
                : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
            )}
            onClick={() => onToggleBedroom(bed)}
            data-testid={`quick-chip-${bed}-bhk`}
            aria-pressed={activeBedrooms.has(bed)}
          >
            {bed} BHK
          </Button>
        ))}
      </div>
    </div>
  );
}
