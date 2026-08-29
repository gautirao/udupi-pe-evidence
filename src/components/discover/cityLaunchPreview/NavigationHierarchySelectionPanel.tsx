import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { NavigationOverrideKind, NavigationTreeNode } from '@/lib/schemas/navigationHierarchy';
import {
  buildPrefillForKind,
  getValidOverrideKindsForNode,
  type OverridePrefillInput,
} from './navigationHierarchyOverrideRules';

const OVERRIDE_ACTION_LABELS: Record<NavigationOverrideKind, string> = {
  EXCLUDE_AREA: 'Exclude this area',
  REASSIGN_AREA_REGION: 'Reassign to another region',
  MOVE_AREA: 'Move to another parent',
  RELABEL: 'Relabel',
  SET_REPRESENTATIVES: 'Change representative areas',
};

export interface NavigationHierarchySelectionPanelProps {
  node: NavigationTreeNode;
  /** Informational listing count for AREA nodes; undefined when unavailable (matches the inline row badge). */
  listingCount?: number;
  /** True only when the revision's lifecycle_status === 'PREPARED' — mirrors NavigationOverridesPanel's `editable` gating. */
  overridesEditable: boolean;
  /** Requests that the given override be started elsewhere (NavigationOverridesPanel), prefilled with this selection. */
  onRequestOverride?: (prefill: OverridePrefillInput) => void;
}

/**
 * Issue #2207 — the "contextual details/actions" surface for whichever
 * hierarchy node is currently selected. Additive alongside the existing
 * per-row Info popover (NavigationHierarchyTreeNode) rather than replacing
 * it: the popover is a row-scoped technical-details lookup, this panel is a
 * persistent, selection-scoped surface that can launch an override — a
 * different job, so it gets its own component instead of being crammed into
 * the popover.
 */
export function NavigationHierarchySelectionPanel({
  node,
  listingCount,
  overridesEditable,
  onRequestOverride,
}: NavigationHierarchySelectionPanelProps) {
  const validKinds = getValidOverrideKindsForNode(node.nodeType);
  const subjectKey = node.nodeType === 'AREA' && node.areaKey != null ? node.areaKey : node.nodeKey;

  return (
    <div
      className="w-72 flex-none space-y-4 border-l p-3 text-sm"
      data-testid="hierarchy-selection-panel"
      aria-label={`Selected item: ${node.displayLabel}`}
    >
      <div>
        <p className="font-semibold" data-testid="hierarchy-selection-label">
          {node.displayLabel}
        </p>
        <Badge variant={node.nodeType === 'CLUSTER' ? 'secondary' : 'outline'} className="mt-1">
          {node.nodeType}
        </Badge>
      </div>

      <dl className="space-y-1 text-xs">
        <div>
          <dt className="inline font-medium">Key: </dt>
          <dd className="inline text-muted-foreground">{subjectKey}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Direct children: </dt>
          <dd className="inline text-muted-foreground">{node.children.length}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Descendant areas: </dt>
          <dd className="inline text-muted-foreground">{node.descendantAreaCount}</dd>
        </div>
        {listingCount !== undefined && (
          <div>
            <dt className="inline font-medium">Listings: </dt>
            <dd className="inline text-muted-foreground">{listingCount}</dd>
          </div>
        )}
      </dl>

      <div className="space-y-1.5 border-t pt-3">
        <p className="text-xs font-medium text-muted-foreground">
          {overridesEditable ? 'Start an override' : 'Overrides unavailable — revision is not PREPARED'}
        </p>
        {validKinds.map((kind) => (
          <Button
            key={kind}
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled={!overridesEditable}
            onClick={() => onRequestOverride?.(buildPrefillForKind(node, kind))}
            data-testid={`hierarchy-selection-action-${kind}`}
          >
            {OVERRIDE_ACTION_LABELS[kind]}
          </Button>
        ))}
      </div>
    </div>
  );
}
