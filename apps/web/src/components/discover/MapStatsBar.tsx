import { Info } from 'lucide-react';
import { Card } from '@/components/ui/card';

/**
 * `MapStatsBar` lived here until Issue #2419 (PR-2) deleted it.
 *
 * It was a floating top-centre card that labelled the committed-POLYGON state
 * "Area search" with a "Clear area" button. #2419 requires ONE POLYGON scope
 * surface, and that surface is `ActiveScopeChip`, which names the scope
 * "Drawn area" from the shared `SCOPE_TITLE` vocabulary and carries the
 * #2016 return action plus PR-2's Redraw.
 *
 * Keeping both meant two owners of one state disagreeing in two visible ways:
 * different wording for the same thing, and a mount gated on
 * `isAuthenticated` — by accident of ownership rather than policy — so
 * anonymous shoppers saw no committed-POLYGON indicator while authenticated
 * ones saw two. PR-1 emptied the component but could not remove its mount,
 * which lived in a file another lane owned; PR-2 legitimately touches that
 * file, so the component and its mount go together.
 *
 * `MarkersTruncationNotice` below is unrelated and still in active use — it
 * shares this file only by history.
 */
interface MarkersTruncationNoticeProps {
  /** Whether the backend capped the marker result set. When false the notice is hidden. */
  truncated: boolean;
  /** Number of markers returned (= active cap when truncated). */
  returnedElements: number | undefined;
  /** Viewport-scoped total count of matching markers. */
  totalFilteredElements: number | undefined;
}

/**
 * Non-blocking notice shown at the bottom-center of the map when the backend capped
 * the marker result set. Disappears when truncated is false. aria-live="polite" so
 * screen-readers announce the update without interrupting the user.
 */
export function MarkersTruncationNotice({
  truncated,
  returnedElements,
  totalFilteredElements,
}: MarkersTruncationNoticeProps) {
  const shown =
    returnedElements != null
      ? returnedElements.toLocaleString()
      : '—';
  const total =
    totalFilteredElements != null
      ? totalFilteredElements.toLocaleString()
      : '—';

  // The aria-live container stays persistently mounted so screen readers reliably
  // announce the notice when truncated transitions false → true. Content is rendered
  // conditionally inside it; the container itself is always in the DOM.
  return (
    <div
      className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000]"
      aria-live="polite"
      aria-atomic="true"
    >
      {truncated && (
        <Card className="px-3 py-2 bg-card/95 backdrop-blur">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Showing {shown} of {total} pins in this map area — zoom in to refine
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}

