import { PenTool, X, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
 * Floating stats bar shown at the top-center of the map for authenticated users.
 * Displays polygon search indicator, selected school, on-map count, and total listing count.
 */
export function MapStatsBar({
  filters,
  onPolygonClear,
}: MapStatsBarProps) {
  // School context is intentionally NOT shown here — the selected-school journey
  // breadcrumb (name) and the radius legend (km) already cover it on the map, so a
  // duplicate school chip was removed. This bar now only surfaces polygon (area-draw)
  // search state + its clear action.
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]">
      <Card className="px-3 py-2 bg-card/95 backdrop-blur">
        <div className="flex items-center gap-4 text-sm">
          {filters.polygon && (
            <>
              <div className="flex items-center gap-1.5 text-primary">
                <PenTool className="h-4 w-4" />
                <span className="font-medium">Area search</span>
              </div>
              <div className="text-muted-foreground">|</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                onClick={onPolygonClear}
                aria-label="Clear polygon search"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear area
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
