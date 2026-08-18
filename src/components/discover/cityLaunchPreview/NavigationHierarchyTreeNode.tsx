import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { NavigationTreeNode } from '@/lib/schemas/navigationHierarchy';
import { formatBoundsCell } from './navigationHierarchyFormat';

interface NavigationHierarchyTreeNodeProps {
  node: NavigationTreeNode;
  expandedKeys: ReadonlySet<string>;
  onToggle: (nodeKey: string) => void;
  listingCountByAreaKey: ReadonlyMap<string, number>;
  /** Lowercased, trimmed search term; empty string means "no active search". */
  matchTerm: string;
}

/**
 * Issue #2121 — one recursive tree row plus its (conditionally rendered)
 * children. This is the ONLY place that renders a `NavigationTreeNode`'s
 * markup, so the top-level NavigationHierarchyTree container stays a thin
 * data/state shell rather than growing into a catch-all component.
 *
 * Node-key/bounds/representative-area-keys — the "technical" fields the
 * issue asks to keep out of the main tree — live behind the details popover
 * below, not inline in the row.
 */
export function NavigationHierarchyTreeNode({
  node,
  expandedKeys,
  onToggle,
  listingCountByAreaKey,
  matchTerm,
}: NavigationHierarchyTreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = hasChildren && expandedKeys.has(node.nodeKey);
  const isMatch = matchTerm.length > 0 && node.displayLabel.toLowerCase().includes(matchTerm);
  const listingCount =
    node.nodeType === 'AREA' && node.areaKey != null ? listingCountByAreaKey.get(node.areaKey) : undefined;

  return (
    <div
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-level={node.depth + 1}
      data-testid={`nav-node-${node.nodeKey}`}
    >
      <div
        className={`flex items-center gap-2 rounded px-1 py-1 text-sm ${isMatch ? 'bg-primary/10' : ''}`}
        style={{ paddingLeft: `${node.depth * 20 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.nodeKey)}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.displayLabel}`}
            data-testid={`nav-node-toggle-${node.nodeKey}`}
            className="flex h-5 w-5 flex-none items-center justify-center rounded text-muted-foreground hover:bg-muted"
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="h-5 w-5 flex-none" aria-hidden="true" />
        )}

        <span className="truncate font-medium">{node.displayLabel}</span>
        <Badge variant={node.nodeType === 'CLUSTER' ? 'secondary' : 'outline'} className="flex-none">
          {node.nodeType}
        </Badge>
        <span className="flex-none text-xs text-muted-foreground">
          {node.children.length} {node.children.length === 1 ? 'child' : 'children'}
        </span>
        <span className="flex-none text-xs text-muted-foreground">
          {node.descendantAreaCount} {node.descendantAreaCount === 1 ? 'area' : 'areas'}
        </span>
        {listingCount !== undefined && (
          <span className="flex-none text-xs text-muted-foreground">
            {listingCount} {listingCount === 1 ? 'listing' : 'listings'}
          </span>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Technical details for ${node.displayLabel}`}
              data-testid={`nav-node-details-${node.nodeKey}`}
              className="ml-auto flex h-5 w-5 flex-none items-center justify-center rounded text-muted-foreground hover:bg-muted"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 text-xs">
            <dl className="space-y-1">
              <div>
                <dt className="inline font-medium">Node key: </dt>
                <dd className="inline">{node.nodeKey}</dd>
              </div>
              <div>
                <dt className="inline font-medium">Bounds: </dt>
                <dd className="inline" data-testid={`nav-node-bounds-${node.nodeKey}`}>
                  {formatBoundsCell(node.bounds)}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium">Representatives: </dt>
                <dd className="inline">
                  {node.representativeAreaKeys && node.representativeAreaKeys.length > 0
                    ? node.representativeAreaKeys.join(', ')
                    : '—'}
                </dd>
              </div>
            </dl>
          </PopoverContent>
        </Popover>
      </div>

      {hasChildren && isExpanded && (
        <div role="group">
          {node.children.map((child) => (
            <NavigationHierarchyTreeNode
              key={child.nodeKey}
              node={child}
              expandedKeys={expandedKeys}
              onToggle={onToggle}
              listingCountByAreaKey={listingCountByAreaKey}
              matchTerm={matchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
}
