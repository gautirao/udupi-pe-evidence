/**
 * NavigationChildList — Issue #1956 PR 2 (Slice 3).
 *
 * Renders the bounded set of destination cards for one level (Direction or
 * Local Destination or AREA children). This component does not decide
 * bounds/copy itself — `useAreasNavigationJourney` already truncated
 * `children` per AC3.5, and `NavigationChildCard` owns the locked per-card
 * copy. This is purely a layout + selection/hover-forwarding shell so
 * `NavigationLevelPanel` stays a thin dispatcher.
 *
 * Issue #2108 — reskinned from a 2-column card grid to a single-column list
 * of compact rows, matching the approved mock's `directional-card` row
 * grammar (VISUAL_RULES.md § Panel navigation row / § Density rules —
 * "Compact single-line panel navigation cards/rows", DESIGN_INTENT.md frozen
 * decision #8). Applied uniformly to every level this component renders
 * (Direction/Local-Destination/AREA), not just Direction: VISUAL_RULES.md
 * explicitly documents "Area rows … and town rows … follow the same 60–82px
 * single-line row grammar" and DESIGN_STATE_MANIFEST.json's `directional-card`
 * component appears in region, cluster AND area-level states alike — there is
 * no separate two-column grid treatment anywhere in the approved mock.
 */
import type { AreasNavigationChild } from '@/features/discover/navigation/useAreasNavigationJourney';
import { NavigationChildCard } from './NavigationChildCard';

export interface NavigationChildListProps {
  children: AreasNavigationChild[];
  /** Optional representative-area-name lookup, keyed by child nodeKey. */
  representativeAreaNamesByNodeKey?: ReadonlyMap<string, string[]>;
  selectedNodeKey?: string | null;
  hoveredNodeKey?: string | null;
  onSelect: (nodeKey: string) => void;
  onHoverChange?: (nodeKey: string | null) => void;
}

export function NavigationChildList({
  children,
  representativeAreaNamesByNodeKey,
  selectedNodeKey = null,
  hoveredNodeKey = null,
  onSelect,
  onHoverChange,
}: NavigationChildListProps) {
  return (
    <div
      className="flex flex-col gap-2"
      data-testid="navigation-child-list"
      role="list"
    >
      {children.map((child) => (
        <div key={child.nodeKey} role="listitem">
          <NavigationChildCard
            child={child}
            representativeAreaNames={representativeAreaNamesByNodeKey?.get(child.nodeKey)}
            isSelected={selectedNodeKey === child.nodeKey}
            isHighlighted={hoveredNodeKey === child.nodeKey}
            onSelect={onSelect}
            onHoverChange={onHoverChange}
          />
        </div>
      ))}
    </div>
  );
}
