import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface WorkflowGroupProps {
  areaLabel: string;
  searchQuery: string;
  onSearchChange?: (value: string) => void;
  /** Already-built recommendation tiles (AreaSetTwoTileRow) or null — this component does not derive them. */
  areaRecommendationTiles?: ReactNode;
}

/**
 * Issue #2658 (C3) — extracted verbatim from AreaSelectedPanel.tsx (Issue
 * #2596): the property-search box FIRST, then the two compact
 * recommendation tiles, read as ONE group with a single bottom hairline and
 * no divider between them (the kit's `EPAreaActions` has none either — see
 * the source's own doc comment for the full #2084 AC8 supersession
 * reasoning this preserves).
 *
 * Renders nothing (not an empty bordered strip) when the caller supplies
 * neither a search handler nor recommendation tiles — the same
 * "nothing selected renders nothing" contract `SelectedFilterChips` and
 * `AreaSizeRow`'s disclosure line already follow.
 */
export function WorkflowGroup({ areaLabel, searchQuery, onSearchChange, areaRecommendationTiles }: WorkflowGroupProps) {
  if (onSearchChange == null && areaRecommendationTiles == null) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-2.5">
      {onSearchChange && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          {/* `h-10` = 40px (Issue #2596, owner-authorised kit parity). */}
          <Input
            placeholder={`Search properties in ${areaLabel}`}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 pl-8 pr-8 text-sm"
            data-testid="area-search-input"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              data-testid="area-search-clear"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
      {areaRecommendationTiles}
    </div>
  );
}
