import type { FC } from 'react';
import { Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PropertyFilters } from '@/hooks/usePropertyListings';

interface MapStatsBarProps {
  filters: PropertyFilters;
  onPolygonClear: () => void;
}

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

/**
 * RETIRED — Issue #2419 (PR-1). Renders nothing.
 *
 * This was a floating top-centre card that surfaced the committed-POLYGON
 * state as "Area search" with a "Clear area" button. #2419 requires ONE
 * POLYGON scope surface, and that surface is now the canonical result-scope
 * chip (`features/discover/components/map/ActiveScopeChip.tsx`), which names
 * the scope "Drawn area" using the same `SCOPE_TITLE` vocabulary as every
 * other scope kind and offers the #2016 return action.
 *
 * Keeping both would have meant two owners of the same state disagreeing in
 * two visible ways: this card said "Area search" where the chip says "Drawn
 * area", and its mount site gated it on `isAuthenticated`, so anonymous
 * shoppers saw no committed-POLYGON indicator at all while authenticated ones
 * saw two.
 *
 * The component and its props are retained ONLY so its existing mount site in
 * `features/discover/views/DiscoverMapCanvas.tsx` keeps compiling — that file
 * belongs to the #2426 map-canvas lane and is out of bounds for this PR.
 * **Follow-up: delete this component and its mount together** once that lane
 * lands (tracked on PR #2441). `MarkersTruncationNotice`, exported from this
 * same file, is unaffected and still in active use.
 */
/* Typed via FC so the existing call site's props still type-check while the
   implementation reads none of them. */
export const MapStatsBar: FC<MapStatsBarProps> = () => null;
