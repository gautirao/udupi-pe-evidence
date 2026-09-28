import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface CommercialSubtypeChoice {
  testId: string;
  label: string;
  /** `null` is the "All commercial" choice — clears the subtype narrowing, not a sixth subtype. */
  value: string | null;
}

export interface CommercialSubtypeRowProps {
  choices: readonly CommercialSubtypeChoice[];
  activeSubtypes: ReadonlySet<string>;
  onToggleSubtype: (value: string | null) => void;
}

/**
 * Issue #2658 (C3) — extracted verbatim from PropertyFilterGroups.tsx: the
 * Commercial subtype chip row (Issue #2555 mock parity — "COMMERCIAL TYPE"
 * label inline at the left of its own chips). Family-local: the caller
 * renders this only while Commercial is the active family
 * (`showSubtypeRow`), never alongside the Residential type chips — that
 * mutual exclusion is the caller's gate, unchanged by this extraction.
 */
export function CommercialSubtypeRow({ choices, activeSubtypes, onToggleSubtype }: CommercialSubtypeRowProps) {
  return (
    <div
      className="flex flex-col gap-[7px] md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-[9px] md:items-start"
      data-testid="quick-subtype-row"
    >
      <span className="pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-[1.25]">
        Commercial type
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {choices.map((choice) => {
          // "All commercial" is the active chip precisely when no subtype narrows the
          // family — it is the absence of a narrowing, not a sixth subtype.
          const pressed =
            choice.value === null ? activeSubtypes.size === 0 : activeSubtypes.has(choice.value);
          return (
            <Button
              key={choice.testId}
              variant="outline"
              size="sm"
              className={cn(
                'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
                pressed
                  ? 'border-gold bg-gold text-gold-foreground shadow-sm hover:bg-gold/90'
                  : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
              )}
              onClick={() => onToggleSubtype(choice.value)}
              data-testid={choice.testId}
              aria-pressed={pressed}
            >
              {choice.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
