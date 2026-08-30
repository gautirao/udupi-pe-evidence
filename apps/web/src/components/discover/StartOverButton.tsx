import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface StartOverButtonProps {
  /** Resets journey/selection/filters/search, preserving city + Buy/Rent mode (design §8). */
  onStartOver: () => void;
  /**
   * True when there is substantial state to lose: selection deeper than a region
   * (group/area/school selected), OR any filter/search active. Gates the confirm
   * popover — design §8: "only when only a region (or nothing) is selected, skip
   * the confirm and just reset."
   */
  hasSubstantialState: boolean;
  /** City display label used in the confirm copy ("You'll return to {city}."). */
  cityLabel: string;
  /**
   * Mirrors the prefersReducedMotion signal already threaded through MapDiscovery →
   * DiscoverRightPanel (matchMedia('(prefers-reduced-motion: reduce)')) — passed
   * through rather than re-derived, so there is one source of truth for the app.
   * Collapses the confirm popover's open/close transition to instant (design §10).
   */
  prefersReducedMotion?: boolean;
  /** Optional className override for layout composition at each call-site. */
  className?: string;
}

/**
 * Issue #1817 (AC8) — the single shared "Start over" control. Promoted from an
 * unlabelled ghost link to a clearly-labelled ghost button with a rotate-ccw icon.
 * Shows a lightweight confirm popover only when there is substantial state to lose;
 * skips the confirm (resets immediately) when only a region — or nothing — is
 * selected. Every "Start over" render site in Discover should use this component
 * rather than a bespoke button, so the confirm-gating logic lives in exactly one
 * place (design §8; qa-fast R3).
 */
export function StartOverButton({
  onStartOver,
  hasSubstantialState,
  cityLabel,
  prefersReducedMotion = false,
  className,
}: StartOverButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleTriggerClick = () => {
    if (!hasSubstantialState) {
      // Nothing substantial to lose — reset directly, no confirm (design §8).
      onStartOver();
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    onStartOver();
  };

  const buttonClassName =
    className ??
    'h-7 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground';

  if (!hasSubstantialState) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={buttonClassName}
        onClick={handleTriggerClick}
        aria-label="Start over and return to journey selection"
        data-testid="start-over-button"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        Start over
      </Button>
    );
  }

  return (
    <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={buttonClassName}
          onClick={handleTriggerClick}
          aria-label="Start over and return to journey selection"
          data-testid="start-over-button"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Start over
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={prefersReducedMotion ? 'w-72 p-3.5 data-[state=open]:animate-none data-[state=closed]:animate-none' : 'w-72 p-3.5'}
        data-testid="start-over-confirm-popover"
      >
        <p className="mb-3 text-sm text-foreground">
          Start over? This clears your filters, search and selection. You&rsquo;ll return to {cityLabel}.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)} data-testid="start-over-cancel">
            Cancel
          </Button>
          <Button variant="default" size="sm" onClick={handleConfirm} data-testid="start-over-confirm">
            Start over
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
