import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PanelColumnProps {
  children: ReactNode;
  className?: string;
}

/**
 * Shared centered-reading-column primitive (Issue #1745 Batch B).
 *
 * Extracted from the `mx-auto max-w-[560px]` wrapper established by
 * GuidedEntryPanel / AreaGroupsLandingPanel (Batch A). Wrapping a panel's
 * body content in this keeps every journey's landing/selected panels at the
 * same reading-column width, so the three journeys read as one system.
 *
 * Presentational only — no data, no behaviour. Does not own scrolling; the
 * caller's outer container still owns `overflow-y-auto` (this stays a pure
 * width/centering primitive so it composes with any existing scroll shell).
 */
export function PanelColumn({ children, className }: PanelColumnProps) {
  return <div className={cn('mx-auto max-w-[560px]', className)}>{children}</div>;
}
