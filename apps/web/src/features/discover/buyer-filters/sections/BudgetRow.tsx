import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface BudgetBandChoice {
  max: number;
  label: string;
}

export interface BudgetRowProps {
  /** "Monthly rent" for rent intent, "Budget" for buy — the caller's `budgetIntent` label. */
  label: string;
  bands: readonly BudgetBandChoice[];
  activePriceMax: number | undefined;
  onSelectBudget: (max: number | undefined) => void;
}

/**
 * Issue #2658 (C3) — extracted verbatim from PropertyFilterGroups.tsx: the
 * purpose- and family-aware budget band row (Issue #2555 item 3; see
 * QUICK_BUDGET_BANDS at the call site). Budget chips are single-select
 * (max-only bands); "Any price" is active precisely when no `priceMax` is
 * set.
 */
export function BudgetRow({ label, bands, activePriceMax, onSelectBudget }: BudgetRowProps) {
  return (
    <div
      className="flex flex-col gap-[7px] md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-[9px] md:items-start"
      data-testid="quick-budget-row"
    >
      <span className="pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-[1.25]">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
            activePriceMax == null
              ? 'border-copper bg-copper text-copper-foreground shadow-sm hover:bg-copper-hover'
              : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
          )}
          onClick={() => onSelectBudget(undefined)}
          data-testid="quick-chip-budget-any"
          aria-pressed={activePriceMax == null}
        >
          Any price
        </Button>
        {bands.map((budget) => (
          <Button
            key={budget.max}
            variant="outline"
            size="sm"
            className={cn(
              'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
              activePriceMax === budget.max
                ? 'border-copper bg-copper text-copper-foreground shadow-sm hover:bg-copper-hover'
                : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
            )}
            onClick={() => onSelectBudget(budget.max)}
            data-testid={`quick-chip-budget-${budget.max}`}
            aria-pressed={activePriceMax === budget.max}
          >
            {budget.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
