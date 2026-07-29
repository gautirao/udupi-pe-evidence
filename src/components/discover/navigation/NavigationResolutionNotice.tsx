/**
 * NavigationResolutionNotice — Issue #1956 PR 2 (Slice 3).
 *
 * Non-blocking notice surface consuming PR 1's `StaleNodeNotice` (see
 * `navigationModel.ts`). Renders nothing when `notice` is null — an exact
 * hit never shows this. `blocking` is always literally `false` on the input
 * type; this component never gates rendering of the destination surface
 * beneath it, it only sits alongside it.
 */
import { Info } from 'lucide-react';
import type { StaleNodeNotice } from '@/features/discover/navigation/navigationModel';

export interface NavigationResolutionNoticeProps {
  notice: StaleNodeNotice | null;
}

export function NavigationResolutionNotice({ notice }: NavigationResolutionNoticeProps) {
  if (!notice) return null;

  const message =
    notice.rung === 'city-root'
      ? "That destination isn't available anymore — showing the city instead."
      : "That destination isn't available anymore — showing its nearest parent instead.";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="navigation-resolution-notice"
      className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
    >
      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
