import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PossessionChip, type PossessionChipProps } from './PossessionChip';

export type PropertyFamily = 'residential' | 'commercial';

export interface FamilyRowProps {
  activeFamily: PropertyFamily;
  onSelectFamily: (family: PropertyFamily) => void;
  /**
   * Issue #2729 R3 fix — `null` renders no possession chip at all (a genuine "no-render" option,
   * not a disabled/decorative one). Added for the compact desktop toolbar, where the possession
   * toggle moves to "More filters" instead of sitting inside this pill's popover — every
   * pre-existing caller keeps passing a real object here and is completely unaffected.
   */
  possession: PossessionChipProps | null;
}

/**
 * Issue #2658 (C3) — extracted verbatim from PropertyFilterGroups.tsx (Issue
 * #2450 TYPE family row + Issue #2555 mock parity: the label sits INLINE at
 * the left of its own chips ("TYPE  Residential Commercial") rather than
 * stacked above them, trailing the possession chip on the right of the
 * same row).
 *
 * Rendered by the caller ONLY when the calling surface can actually consume
 * a Commercial subtype (`isCommercialSubtypeSupported`) — while the
 * capability is off the owner ruling is that today's buyer surface is
 * preserved unchanged, so there is no family row at all rather than a
 * one-option Residential selector. That gating stays the caller's
 * responsibility (PropertyFilterGroups), not this component's.
 *
 * Structurally, the Commercial chip is IDENTICAL to the Residential chip —
 * that is the ruling expressed in markup rather than asserted in a comment:
 * same browsing posture for both families, no auth condition, no disabled
 * branch, no gate copy.
 *
 * THE MOCK'S SECOND TRAILING CHIP ("Broker identity verified") IS
 * DELIBERATELY ABSENT — `PropertyFilters` carries no broker-identity field,
 * so the control could not narrow anything. Raised with the owner rather
 * than resolved here; see PropertyFilterGroups.tsx's own history for the
 * full reasoning this component does not repeat.
 */
export function FamilyRow({ activeFamily, onSelectFamily, possession }: FamilyRowProps) {
  return (
    <div
      className="flex flex-col gap-[7px] md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-[9px] md:items-start"
      data-testid="quick-family-row"
    >
      <span className="pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-[1.25]">
        Type
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
            activeFamily === 'residential'
              ? 'border-copper bg-copper text-copper-foreground shadow-sm hover:bg-copper-hover'
              : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
          )}
          onClick={() => onSelectFamily('residential')}
          data-testid="quick-chip-family-residential"
          aria-pressed={activeFamily === 'residential'}
        >
          Residential
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
            activeFamily === 'commercial'
              ? 'border-gold bg-gold text-gold-foreground shadow-sm hover:bg-gold/90'
              : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
          )}
          onClick={() => onSelectFamily('commercial')}
          data-testid="quick-chip-family-commercial"
          aria-pressed={activeFamily === 'commercial'}
        >
          Commercial
        </Button>
        {possession && <PossessionChip {...possession} />}
      </div>
    </div>
  );
}
