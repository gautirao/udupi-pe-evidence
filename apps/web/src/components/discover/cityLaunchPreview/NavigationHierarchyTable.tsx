import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { NavigationTreeNode } from '@/lib/schemas/navigationHierarchy';
import { formatBoundsCell, formatBoundsTitle } from './navigationHierarchyFormat';

interface NavigationHierarchyTableProps {
  rows: readonly NavigationTreeNode[];
  listingCountByAreaKey: ReadonlyMap<string, number>;
}

/**
 * Issue #2121 — the pre-existing depth-flattened technical table, retained as
 * the "Table view" alongside the new tree inspector (NavigationHierarchyTree
 * renders exactly one of this or NavigationHierarchyTreeNode at a time).
 * `rows` is the same depth-first flatten of the SAME `buildNavigationForest`
 * result the tree view walks, so both views always agree.
 */
export function NavigationHierarchyTable({ rows, listingCountByAreaKey }: NavigationHierarchyTableProps) {
  return (
    <div className="overflow-x-auto" data-testid="navigation-hierarchy-table">
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
            <TableRow key={node.nodeKey} data-testid={`nav-table-row-${node.nodeKey}`}>
              <TableCell style={{ paddingLeft: `${node.depth * 16 + 8}px` }}>{node.displayLabel}</TableCell>
              <TableCell>
                <Badge variant={node.nodeType === 'CLUSTER' ? 'secondary' : 'outline'}>{node.nodeType}</Badge>
              </TableCell>
              <TableCell>{node.children.length}</TableCell>
              <TableCell>{node.descendantAreaCount}</TableCell>
              <TableCell
                className="whitespace-nowrap text-xs text-muted-foreground"
                title={formatBoundsTitle(node.bounds)}
                data-testid={`nav-table-bounds-${node.nodeKey}`}
              >
                {formatBoundsCell(node.bounds)}
              </TableCell>
              <TableCell
                className="max-w-[220px] truncate"
                title={node.representativeAreaKeys?.join(', ') ?? ''}
              >
                {node.representativeAreaKeys && node.representativeAreaKeys.length > 0
                  ? node.representativeAreaKeys.join(', ')
                  : '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {node.nodeType === 'AREA' && node.areaKey != null && listingCountByAreaKey.has(node.areaKey)
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
