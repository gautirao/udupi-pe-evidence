/**
 * NavigationChildList — Issue #1956 PR 2 (Slice 3).
 *
 * Renders the bounded set of destination cards for one level (Direction or
 * Local Destination or AREA children) as a simple responsive grid. This
 * component does not decide bounds/copy itself — `useAreasNavigationJourney`
 * already truncated `children` per AC3.5, and `NavigationChildCard` owns the
 * locked per-card copy. This is purely a layout + selection/hover-forwarding
 * shell so `NavigationLevelPanel` stays a thin dispatcher.
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
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
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
