import type { NavigationTreeNode, PreviewNode } from '@/lib/schemas/navigationHierarchy';

/**
 * Issue #1955 (Areas PR A) — the single, pure traversal implementation over
 * the sandbox navigation tree. GET .../navigation/tree returns a FLAT
 * `PreviewNode[]` list (see NavigationPreviewTreeResponse) keyed by
 * `parentNodeKey`, never a nested tree — `buildNavigationForest` is the ONE
 * place that flat list is turned into `NavigationTreeNode` parent/child
 * linkage. NavigationHierarchyTree (item 2) and the guided
 * City→Region→Cluster→Sub-cluster→Area journey (item 3) both consume the
 * result instead of writing their own recursive walk, per the "no
 * duplicated traversal" guardrail.
 *
 * A city can have multiple region-scoped top-level nodes (parentNodeKey ===
 * null, one per region — there is no single synthetic "city" root in the
 * backend contract), so the tree is a FOREST, not a single-root tree. Every
 * forest-level helper below just iterates `roots` and delegates to the
 * single-root helper — the single-root recursion is the only traversal
 * logic that exists.
 */

/**
 * Builds the parent→children forest from the flat `PreviewNode[]` the
 * server sends. A node whose `parentNodeKey` doesn't resolve to another
 * node in this list (shouldn't happen for a structurally valid tree, but
 * the sandbox tree can be mid-edit) is treated as its own root rather than
 * silently dropped.
 */
export function buildNavigationForest(nodes: readonly PreviewNode[]): NavigationTreeNode[] {
  const byKey = new Map<string, NavigationTreeNode>();
  for (const node of nodes) {
    byKey.set(node.nodeKey, { ...node, children: [] });
  }

  const roots: NavigationTreeNode[] = [];
  for (const node of nodes) {
    const wrapped = byKey.get(node.nodeKey);
    if (!wrapped) continue; // unreachable: every node above was just inserted under its own key

    const parent = node.parentNodeKey != null ? byKey.get(node.parentNodeKey) : undefined;
    if (parent) {
      parent.children.push(wrapped);
    } else {
      roots.push(wrapped);
    }
  }

  const byDisplayOrder = (a: NavigationTreeNode, b: NavigationTreeNode) => a.displayOrder - b.displayOrder;
  roots.sort(byDisplayOrder);
  for (const node of byKey.values()) {
    node.children.sort(byDisplayOrder);
  }

  return roots;
}

/** Depth-first pre-order walk of every node under `root`, root first. */
export function flattenNavigationTree(root: NavigationTreeNode): NavigationTreeNode[] {
  const out: NavigationTreeNode[] = [root];
  for (const child of root.children) {
    out.push(...flattenNavigationTree(child));
  }
  return out;
}

/** Depth-first pre-order walk of an entire forest (every root, then its descendants). */
export function flattenNavigationForest(roots: readonly NavigationTreeNode[]): NavigationTreeNode[] {
  return roots.flatMap(flattenNavigationTree);
}

/** First node (pre-order) whose `nodeKey` matches, or null if absent. */
export function findNavigationNode(
  root: NavigationTreeNode,
  nodeKey: string,
): NavigationTreeNode | null {
  if (root.nodeKey === nodeKey) return root;
  for (const child of root.children) {
    const found = findNavigationNode(child, nodeKey);
    if (found) return found;
  }
  return null;
}

/** `findNavigationNode` across every root in a forest. */
export function findNavigationNodeInForest(
  roots: readonly NavigationTreeNode[],
  nodeKey: string,
): NavigationTreeNode | null {
  for (const root of roots) {
    const found = findNavigationNode(root, nodeKey);
    if (found) return found;
  }
  return null;
}

/**
 * The ancestry chain from `root` down to (and including) `nodeKey`, e.g.
 * [Region, Cluster, Sub-cluster, Area] — powers the guided journey's
 * breadcrumb and the "which level am I at" step indicator. Returns `[]` if
 * `nodeKey` is not present in this subtree.
 */
export function getNavigationAncestryPath(
  root: NavigationTreeNode,
  nodeKey: string,
): NavigationTreeNode[] {
  if (root.nodeKey === nodeKey) return [root];
  for (const child of root.children) {
    const childPath = getNavigationAncestryPath(child, nodeKey);
    if (childPath.length > 0) return [root, ...childPath];
  }
  return [];
}

/** `getNavigationAncestryPath` across every root in a forest. */
export function getNavigationAncestryPathInForest(
  roots: readonly NavigationTreeNode[],
  nodeKey: string,
): NavigationTreeNode[] {
  for (const root of roots) {
    const path = getNavigationAncestryPath(root, nodeKey);
    if (path.length > 0) return path;
  }
  return [];
}

/** Direct children of `nodeKey`, or `[]` if the node is absent or a leaf. */
export function getNavigationChildren(
  root: NavigationTreeNode,
  nodeKey: string,
): NavigationTreeNode[] {
  const node = findNavigationNode(root, nodeKey);
  return node ? node.children : [];
}

/** `getNavigationChildren` across every root in a forest. */
export function getNavigationChildrenInForest(
  roots: readonly NavigationTreeNode[],
  nodeKey: string,
): NavigationTreeNode[] {
  const node = findNavigationNodeInForest(roots, nodeKey);
  return node ? node.children : [];
}
