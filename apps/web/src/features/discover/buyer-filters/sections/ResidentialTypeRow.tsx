import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PossessionChip, type PossessionChipProps } from './PossessionChip';

export interface ResidentialTypeChoice {
  value: string;
  label: string;
}

export interface ResidentialTypeRowProps {
  types: readonly ResidentialTypeChoice[];
  activeTypes: ReadonlySet<string>;
  allTypesActive: boolean;
  onSelectAllTypes: () => void;
  onToggleType: (type: string) => void;
  /**
   * Issue #2555 — while the Commercial-capability is OFF there is no
   * separate TYPE/family row, so today's buyer surface re-renders the
   * possession chip HERE, trailing the type chips, instead. Omit this prop
   * (or pass undefined) when the capability is on — the caller
   * (PropertyFilterGroups) already renders it once, on FamilyRow, and
   * rendering it twice would be the exact duplication this extraction
   * exists to prevent.
   */
  possession?: PossessionChipProps;
}

/**
 * Issue #2658 (C3) — extracted verbatim from PropertyFilterGroups.tsx: the
 * Residential type chip row ("All" + QUICK_PROPERTY_TYPES), rendered only
 * while the Commercial subtype row is not showing (`!showSubtypeRow` — the
 * caller's gate, unchanged).
 */
export function ResidentialTypeRow({
  types,
  activeTypes,
  allTypesActive,
  onSelectAllTypes,
  onToggleType,
  possession,
}: ResidentialTypeRowProps) {
  return (
    <div className="flex flex-col gap-[7px] md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-[9px] md:items-start">
      <span className="pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-[1.25]">
        Residential type
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
            allTypesActive
              ? 'border-copper bg-copper text-copper-foreground shadow-sm hover:bg-copper-hover'
              : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
          )}
          onClick={onSelectAllTypes}
          data-testid="quick-chip-all"
          aria-pressed={allTypesActive}
        >
          All
        </Button>
        {types.map((type) => (
          <Button
            key={type.value}
            variant="outline"
            size="sm"
            className={cn(
              'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
              activeTypes.has(type.value)
                ? 'border-copper bg-copper text-copper-foreground shadow-sm hover:bg-copper-hover'
                : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
            )}
            onClick={() => onToggleType(type.value)}
            data-testid={`quick-chip-${type.value}`}
            aria-pressed={activeTypes.has(type.value)}
          >
            {type.label}
          </Button>
        ))}
        {possession && <PossessionChip {...possession} />}
      </div>
    </div>
  );
}
