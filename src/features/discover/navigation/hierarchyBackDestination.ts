/**
 * resolveHierarchyBackDestination — pure hierarchy-Back destination policy.
 *
 * The ONE authoritative rule for where the in-app "hierarchy Back" affordance
 * points. `HierarchyBackButton` (presentation + the existing guarded
 * POP/REPLACE navigation mechanism) and any future caller must go through
 * this function rather than re-deriving the rule inline.
 *
 * ── WHY `node.ancestry.length === 0` ALONE CANNOT MEAN "city root" ──
 * The synthetic city ROOT (`ROOT_NODE_KEY`) is never backed by a persisted
 * `NavigationNode` row, so it is the only node the server itself has no
 * parent to declare — its `ancestry` is empty because there is truly nowhere
 * to go. A top-level DIRECTION (depth 0) is also `ancestry: []` on the wire
 * (confirmed live: `GET .../navigation/resolve?node=d:central` returns an
 * empty ancestry), but it is NOT the city root — its canonical parent is the
 * synthetic root, which the server simply has no row to name. Treating an
 * empty ancestry as "no parent" for every node conflates these two distinct
 * cases and silently drops the Back control at every top-level Direction.
 *
 * ── THE RULE ──
 *   • `nodeKey === ROOT_NODE_KEY`        → no destination (true city root).
 *   • `ancestry` names a parent          → that server-declared parent,
 *                                           verbatim (never re-derived).
 *   • `nodeType === 'DIRECTION'` with no
 *     ancestry entry                     → the synthetic city root, labelled
 *                                           with the caller-supplied city name
 *                                           (the one structural gap the
 *                                           server cannot itself express).
 *   • anything else with no ancestry     → no destination.
 *
 * Server-declared ancestry is authoritative whenever present; this function
 * never fabricates an ancestry record or mutates the node — it only fills the
 * single gap above with the known synthetic-root exception.
 */
import { ROOT_NODE_KEY, type NavigationNodeResponse, type NavigationNodeType } from './types';

export interface HierarchyBackDestination {
  nodeKey: string;
  displayLabel: string;
}

/**
 * Narrow input — deliberately not the full `NavigationNodeResponse` context,
 * so this pure policy cannot be tempted to reach for unrelated app state.
 */
export interface HierarchyBackDestinationNode {
  nodeKey: string;
  nodeType: NavigationNodeType;
  ancestry: Pick<NavigationNodeResponse['ancestry'][number], 'nodeKey' | 'displayLabel'>[];
}

export function resolveHierarchyBackDestination(
  node: HierarchyBackDestinationNode,
  cityLabel: string,
): HierarchyBackDestination | null {
  if (node.nodeKey === ROOT_NODE_KEY) {
    return null;
  }

  const parent = node.ancestry[node.ancestry.length - 1];
  if (parent) {
    return { nodeKey: parent.nodeKey, displayLabel: parent.displayLabel };
  }

  if (node.nodeType === 'DIRECTION') {
    return { nodeKey: ROOT_NODE_KEY, displayLabel: cityLabel };
  }

  return null;
}
