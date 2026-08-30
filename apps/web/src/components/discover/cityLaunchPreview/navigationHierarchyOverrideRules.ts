import type { NavigationOverrideKind, NavigationTreeNode } from '@/lib/schemas/navigationHierarchy';

/**
 * Issue #2207 — the minimal payload needed to seed NavigationOverridesPanel's
 * form from a hierarchy selection. Intentionally NOT the full FormState (it
 * only ever supplies `kind` + whichever single subject field applies) so this
 * type stays decoupled from that panel's internal field set.
 */
export interface OverridePrefillInput {
  kind: NavigationOverrideKind;
  subjectAreaKey?: string;
  subjectNodeKey?: string;
}

/**
 * Issue #2207 — override kinds valid for a given node type. The three
 * Area-subject kinds (`subjectAreaKey`) only make product sense against an
 * AREA leaf; the two Node-subject kinds (`subjectNodeKey`) only make sense
 * against an intermediate DIRECTION/CLUSTER node (an Area is already a single
 * leaf, so "representative areas" and relabeling the Node — as opposed to the
 * Area itself, which the tree doesn't expose an override for — don't apply to
 * it). This mirrors the issue's "Area-only actions must not appear for a
 * non-Area node" requirement in both directions.
 */
export function getValidOverrideKindsForNode(
  nodeType: NavigationTreeNode['nodeType'],
): NavigationOverrideKind[] {
  return nodeType === 'AREA'
    ? ['EXCLUDE_AREA', 'REASSIGN_AREA_REGION', 'MOVE_AREA']
    : ['RELABEL', 'SET_REPRESENTATIVES'];
}

export function buildPrefillForKind(
  node: NavigationTreeNode,
  kind: NavigationOverrideKind,
): OverridePrefillInput {
  if (node.nodeType === 'AREA' && node.areaKey != null) {
    return { kind, subjectAreaKey: node.areaKey };
  }
  return { kind, subjectNodeKey: node.nodeKey };
}
