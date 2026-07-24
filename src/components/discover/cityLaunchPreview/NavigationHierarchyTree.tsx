import { AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useNavigationTree } from '@/hooks/useCityLaunchNavigation';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { buildNavigationForest, flattenNavigationForest } from '@/features/discover/state/navigationTreeUtils';
import type { NavigationBounds } from '@/lib/schemas/navigationHierarchy';

/** `min, max` lat/lon rounded for a compact table cell; the full precision centre is left in the tooltip title. */
function formatBoundsCell(bounds: NavigationBounds): string {
  return `${bounds.minLat.toFixed(3)}, ${bounds.minLon.toFixed(3)} — ${bounds.maxLat.toFixed(3)}, ${bounds.maxLon.toFixed(3)}`;
}

function formatBoundsTitle(bounds: NavigationBounds): string {
  return `centre ${bounds.centreLat}, ${bounds.centreLon}`;
}

/**
 * Issue #1955 (Areas PR A) item 2 — the sandbox hierarchy TREE view. Renders
 * every node from GET .../navigation/tree flattened depth-first with visual
 * indent, plus (item 5) an informational per-area listing count merged in
 * from the SAME already-preview-aware `useDiscoverAreas` hook the reused
 * Discover components use — never from the structural tree/diff response,
 * so it can never leak into a checksum/structural comparison.
 *
 * The server sends a FLAT node list (NavigationPreviewTreeResponse) keyed by
 * `parentNodeKey`, never a nested tree. Each node carries its own `bounds`
 * (rendered as a compact min/max lat-lon cell below), but never a per-node
 * `validationStatus` field — `buildNavigationForest` builds the display tree
 * client-side; the revision-level `validationStatus`/`validationErrors` are
 * shown as a single banner above the table.
 */
export function NavigationHierarchyTree() {
  const tree = useNavigationTree();
  // The `city` argument only feeds the LIVE-mode path string, which
  // discoverPath ignores entirely in preview mode (see DiscoverDataSourceContext) —
  // this hook is only ever enabled here when the surrounding source is a
  // preview, so the placeholder value is never sent to the server.
  const areaCounts = useDiscoverAreas('preview-informational-counts');

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

  const forest = buildNavigationForest(tree.data.nodes);
  const rows = flattenNavigationForest(forest);
  // AREA nodes carry the raw area key in `areaKey` — `nodeKey` is the
  // derived "a:" + areaKey identity (NavigationKeys.areaNodeKey), never the
  // bare area key itself, so the informational count must be joined on
  // `areaKey`, not `nodeKey`.
  const listingCountByAreaKey = new Map(
    (areaCounts.data?.areas ?? []).map((area) => [area.areaKey, area.listingCount]),
  );

  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        This revision has no navigation nodes yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="navigation-hierarchy-tree">
      <div className="flex items-center gap-2 px-2 pb-2 text-xs">
        <span className="text-muted-foreground">Validation:</span>
        <Badge variant={tree.data.validationStatus === 'VALID' ? 'default' : 'destructive'}>
          {tree.data.validationStatus}
        </Badge>
        {tree.data.validationErrors.length > 0 && (
          <span className="text-destructive">{tree.data.validationErrors.join('; ')}</span>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Node</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Children</TableHead>
            <TableHead>Descendant areas</TableHead>
            <TableHead>Bounds</TableHead>
            <TableHead>Representatives</TableHead>
            <TableHead className="text-muted-foreground">Listings (informational)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((node) => (
            <TableRow key={node.nodeKey} data-testid={`nav-node-${node.nodeKey}`}>
              <TableCell style={{ paddingLeft: `${node.depth * 16 + 8}px` }}>{node.displayLabel}</TableCell>
              <TableCell>
                <Badge variant={node.nodeType === 'CLUSTER' ? 'secondary' : 'outline'}>{node.nodeType}</Badge>
              </TableCell>
              <TableCell>{node.children.length}</TableCell>
              <TableCell>{node.descendantAreaCount}</TableCell>
              <TableCell
                className="whitespace-nowrap text-xs text-muted-foreground"
                title={formatBoundsTitle(node.bounds)}
                data-testid={`nav-node-bounds-${node.nodeKey}`}
              >
                {formatBoundsCell(node.bounds)}
              </TableCell>
              <TableCell
                className="max-w-[220px] truncate"
                title={node.representativeAreaKeys.join(', ')}
              >
                {node.representativeAreaKeys.length > 0 ? node.representativeAreaKeys.join(', ') : '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {node.nodeType === 'AREA' && node.areaKey !== null && listingCountByAreaKey.has(node.areaKey)
                  ? listingCountByAreaKey.get(node.areaKey)
                  : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
