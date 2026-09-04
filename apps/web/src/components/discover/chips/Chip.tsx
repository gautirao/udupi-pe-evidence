import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Issue #2017 — extracted verbatim from ActiveContextChips.tsx so the multi-area
// AREA_SET chip strip (AreaSetChips.tsx) can reuse the same roving-focus chip
// primitive without reopening ActiveContextChips.tsx's own prop surface (guarded
// by a `@ts-expect-error` contract test asserting `selectedArea` is NOT part of
// its props — see ActiveContextChips.test.tsx). ActiveContextChips.tsx now
// imports Chip/ChipSpec from here unchanged.

/** One clearable chip's rendering spec, built before roving-focus indices are assigned. */
export interface ChipSpec {
  id: string;
  icon: React.ReactNode;
  label: string;
  onClear: () => void;
  testId?: string;
  dismissTestId?: string;
  emphasis?: boolean;
}

export interface RovingChipProps extends ChipSpec {
  tabIndex: number;
  onFocus: () => void;
  onArrow: (delta: number) => void;
  chipRef: React.Ref<HTMLDivElement>;
}

/** A single dismissable chip with roving-focus keyboard support (design §10). */
export function Chip({
  icon,
  label,
  onClear,
  testId,
  dismissTestId,
  emphasis,
  tabIndex,
  onFocus,
  onArrow,
  chipRef,
}: RovingChipProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onArrow(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onArrow(-1);
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      onClear();
    }
  };

  return (
    <div
      ref={chipRef}
      role="group"
      aria-label={`Active filter: ${label}`}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        'focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
        emphasis
          ? 'border border-[hsl(var(--copper))]/60 bg-secondary text-secondary-foreground'
          : 'bg-secondary text-secondary-foreground',
      )}
      data-testid={testId}
    >
      {icon}
      <span className="max-w-[160px] truncate">{label}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-3.5 w-3.5 p-0 ml-0.5 hover:bg-transparent hover:text-foreground text-muted-foreground flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        tabIndex={-1}
        aria-label={`Remove ${label}`}
        data-testid={dismissTestId}
      >
        <X className="h-2.5 w-2.5" />
      </Button>
    </div>
  );
}
