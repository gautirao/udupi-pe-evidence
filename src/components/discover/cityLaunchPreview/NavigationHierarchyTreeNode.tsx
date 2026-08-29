import type { KeyboardEvent, MouseEvent } from 'react';
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
  /** Issue #2207 — nodeKey of the single selected item, or null when nothing is selected. */
  selectedNodeKey: string | null;
  /** Issue #2207 — selects this node. Independent of expand/collapse (`onToggle`). */
  onSelect: (node: NavigationTreeNode) => void;
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
 *
 * Issue #2207 — the `role="treeitem"` element itself is the single
 * focusable/selectable target (`tabIndex`, `aria-selected`, the
 * click/keydown handlers all live on it), so a screen reader announces
 * "selected" on the exact element that owns keyboard focus, per the ARIA
 * Tree View pattern (code-review follow-up on the initial cut, which put
 * `aria-selected` on this element but the interaction handlers one level
 * deeper on a nested `role="button"` div — a focus/state mismatch). The
 * inner content div stays purely a visual/flex wrapper. The expand toggle
 * and Info-popover trigger both stop propagation so neither one doubles as
 * a selection click, and vice versa (selecting never touches `onToggle`);
 * the row's own keydown handler ignores any keydown that bubbled up from
 * those nested buttons (`event.target !== event.currentTarget`) so their
 * native Enter/Space-triggered click still fires.
 *
 * A subtlety of making the treeitem itself the click target: an expanded
 * node's children render INSIDE its own treeitem div (the nested
 * `role="group"` below), so a click on a descendant node bubbles up through
 * every ancestor treeitem's identical onClick. The row's click handler
 * therefore also stops propagation, or a click on a deeply-nested node would
 * re-fire `onSelect` for every ancestor on the way up and the topmost one
 * would win, silently overriding the actual click target's selection.
 */
export function NavigationHierarchyTreeNode({
  node,
  expandedKeys,
  onToggle,
  listingCountByAreaKey,
  matchTerm,
  selectedNodeKey,
  onSelect,
}: NavigationHierarchyTreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = hasChildren && expandedKeys.has(node.nodeKey);
  const isMatch = matchTerm.length > 0 && node.displayLabel.toLowerCase().includes(matchTerm);
  const isSelected = node.nodeKey === selectedNodeKey;
  const listingCount =
    node.nodeType === 'AREA' && node.areaKey != null ? listingCountByAreaKey.get(node.areaKey) : undefined;

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Only handle a keydown that originated on the row itself — one that
    // bubbled up from the nested expand-toggle or Info-popover button must
    // be left alone, otherwise preventDefault() here would suppress THEIR
    // native Enter/Space-triggered click before it fires.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      onSelect(node);
    }
  }

  function handleToggleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onToggle(node.nodeKey);
  }

  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={isSelected}
      aria-level={node.depth + 1}
      aria-label={`Select ${node.displayLabel}`}
      onClick={(event) => {
        // A child's `role="treeitem"` renders INSIDE its parent's own
        // treeitem div (the nested `role="group"` below), so a click on a
        // child bubbles up through every ancestor treeitem — each of which
        // has this exact same handler. Without stopping it here, the
        // ancestor's handler would also fire and overwrite the child's
        // selection with its own nodeKey.
        event.stopPropagation();
        onSelect(node);
      }}
      onKeyDown={handleRowKeyDown}
      data-testid={`nav-node-${node.nodeKey}`}
      className="rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className={`flex items-center gap-2 rounded px-1 py-1 text-sm ${
          isSelected ? 'bg-accent' : isMatch ? 'bg-primary/10' : ''
        }`}
        style={{ paddingLeft: `${node.depth * 20 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={handleToggleClick}
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
              onClick={(event) => event.stopPropagation()}
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
              selectedNodeKey={selectedNodeKey}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
