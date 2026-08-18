import { useMemo, useState } from 'react';
import { AlertCircle, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigationTree } from '@/hooks/useCityLaunchNavigation';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import {
  buildNavigationForest,
  flattenNavigationForest,
  getNavigationAncestryPathInForest,
} from '@/features/discover/state/navigationTreeUtils';
import type { NavigationTreeNode } from '@/lib/schemas/navigationHierarchy';
import { NavigationHierarchyTreeNode } from './NavigationHierarchyTreeNode';
import { NavigationHierarchyTable } from './NavigationHierarchyTable';

type ViewMode = 'tree' | 'table';

/**
 * Issue #2121 — default expansion policy: only nodes at the shallowest depth
 * (0) start expanded, revealing their direct children. Everything deeper
 * starts collapsed, so a 300+ AREA-leaf revision doesn't paint every leaf on
 * first render.
 */
const DEFAULT_EXPANDED_MAX_DEPTH = 0;

function collectExpandableKeys(nodes: readonly NavigationTreeNode[], maxDepth?: number): Set<string> {
  const keys = new Set<string>();
  for (const node of flattenNavigationForest(nodes)) {
    if (node.children.length === 0) continue;
    if (maxDepth === undefined || node.depth <= maxDepth) keys.add(node.nodeKey);
  }
  return keys;
}

/**
 * Issue #1955 (Areas PR A) item 2, reworked by #2121 — the sandbox hierarchy
 * inspector. `buildNavigationForest` (navigationTreeUtils.ts) remains the
 * ONE place the server's FLAT `nodes` list (NavigationPreviewTreeResponse,
 * keyed by `parentNodeKey`) is turned into parent/child linkage; this
 * component only owns view state (expand/collapse, search, tree-vs-table)
 * on top of that result. Row rendering itself lives in
 * NavigationHierarchyTreeNode (tree) and NavigationHierarchyTable (table) so
 * this container doesn't become a catch-all.
 *
 * The per-area informational listing count (item 5) still comes from the
 * SAME already-preview-aware `useDiscoverAreas` hook the reused Discover
 * components use — never from the structural tree/diff response, so it can
 * never leak into a checksum/structural comparison.
 */
export function NavigationHierarchyTree() {
  const tree = useNavigationTree();
  // The `city` argument only feeds the LIVE-mode path string, which
  // discoverPath ignores entirely in preview mode (see DiscoverDataSourceContext) —
  // this hook is only ever enabled here when the surrounding source is a
  // preview, so the placeholder value is never sent to the server.
  const areaCounts = useDiscoverAreas('preview-informational-counts');

  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string> | null>(null);

  const forest = useMemo(() => (tree.data ? buildNavigationForest(tree.data.nodes) : []), [tree.data]);
  const rows = useMemo(() => flattenNavigationForest(forest), [forest]);
  const defaultExpandedKeys = useMemo(
    () => collectExpandableKeys(forest, DEFAULT_EXPANDED_MAX_DEPTH),
    [forest],
  );

  const matchTerm = searchTerm.trim().toLowerCase();

  // A search match reveals itself by having every ancestor auto-expanded,
  // on top of whatever the user already expanded/collapsed by hand.
  const searchAutoExpandedKeys = useMemo(() => {
    if (!matchTerm) return null;
    const auto = new Set<string>();
    for (const node of rows) {
      if (!node.displayLabel.toLowerCase().includes(matchTerm)) continue;
      for (const ancestor of getNavigationAncestryPathInForest(forest, node.nodeKey)) {
        if (ancestor.nodeKey !== node.nodeKey) auto.add(ancestor.nodeKey);
      }
    }
    return auto;
  }, [rows, forest, matchTerm]);

  const effectiveExpandedKeys = useMemo(() => {
    const base = expandedKeys ?? defaultExpandedKeys;
    if (!searchAutoExpandedKeys || searchAutoExpandedKeys.size === 0) return base;
    return new Set([...base, ...searchAutoExpandedKeys]);
  }, [expandedKeys, defaultExpandedKeys, searchAutoExpandedKeys]);

  function toggleNode(nodeKey: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev ?? defaultExpandedKeys);
      if (next.has(nodeKey)) {
        next.delete(nodeKey);
      } else {
        next.add(nodeKey);
      }
      return next;
    });
  }

  function expandAll() {
    setExpandedKeys(collectExpandableKeys(forest));
  }

  function collapseAll() {
    setExpandedKeys(new Set());
  }

  // AREA nodes carry the raw area key in `areaKey` — `nodeKey` is the
  // derived "a:" + areaKey identity (NavigationKeys.areaNodeKey), never the
  // bare area key itself, so the informational count must be joined on
  // `areaKey`, not `nodeKey`.
  const listingCountByAreaKey = useMemo(
    () => new Map((areaCounts.data?.areas ?? []).map((area) => [area.areaKey, area.listingCount])),
    [areaCounts.data],
  );

  if (tree.isLoading) {
    return (
      <div className="space-y-2 p-4" aria-live="polite">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (tree.isError || !tree.data) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-destructive" role="alert">
        <AlertCircle className="h-6 w-6" />
        <p className="text-sm font-medium">Failed to load the hierarchy tree.</p>
        <Button variant="outline" size="sm" onClick={() => tree.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        This revision has no navigation nodes yet.
      </div>
    );
  }

  return (
    <div data-testid="navigation-hierarchy-tree">
      <div className="flex flex-wrap items-center gap-3 border-b px-2 pb-3 pt-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Validation:</span>
          <Badge variant={tree.data.validationStatus === 'VALID' ? 'default' : 'destructive'}>
            {tree.data.validationStatus}
          </Badge>
          {tree.data.validationErrors.length > 0 && (
            <span className="text-destructive">{tree.data.validationErrors.join('; ')}</span>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by label…"
              aria-label="Search hierarchy by node label"
              className="h-8 w-48 pl-7 text-xs"
              data-testid="hierarchy-search-input"
            />
          </div>

          {viewMode === 'tree' && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={expandAll}
                data-testid="hierarchy-expand-all"
              >
                Expand all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={collapseAll}
                data-testid="hierarchy-collapse-all"
              >
                Collapse all
              </Button>
            </>
          )}

          <div className="flex overflow-hidden rounded-md border text-xs" role="group" aria-label="Hierarchy view">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              aria-pressed={viewMode === 'tree'}
              data-testid="hierarchy-view-tree"
              className={`px-2 py-1 ${viewMode === 'tree' ? 'bg-secondary font-medium' : 'text-muted-foreground'}`}
            >
              Tree view
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              data-testid="hierarchy-view-table"
              className={`border-l px-2 py-1 ${viewMode === 'table' ? 'bg-secondary font-medium' : 'text-muted-foreground'}`}
            >
              Table view
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'tree' ? (
        <div
          role="tree"
          aria-label="Revision navigation hierarchy"
          className="overflow-x-auto p-2"
          data-testid="navigation-hierarchy-tree-view"
        >
          {forest.map((root) => (
            <NavigationHierarchyTreeNode
              key={root.nodeKey}
              node={root}
              expandedKeys={effectiveExpandedKeys}
              onToggle={toggleNode}
              listingCountByAreaKey={listingCountByAreaKey}
              matchTerm={matchTerm}
            />
          ))}
        </div>
      ) : (
        <NavigationHierarchyTable rows={rows} listingCountByAreaKey={listingCountByAreaKey} />
      )}
    </div>
  );
}
