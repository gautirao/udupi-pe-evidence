/**
 * Pure helpers over the flat-cursor navigation model — Issue #1956 PR 1 (FE-2).
 *
 * The model is ONE resolved node plus its already-flat `ancestry` / `children` /
 * `descendantAreaKeys` arrays per resolve call. This is NOT a materialised
 * client-side tree and nothing here recurses over one.
 *
 * Two responsibilities beyond the area-key accessor:
 *   • AC1.6 — DETECT AND REPORT an invalid hierarchy. This layer never repairs,
 *     never flattens, never re-parents. It hands the caller a structured report
 *     and leaves the input exactly as it found it.
 *   • AC1.5 — the stale-node ladder: an unresolvable `node=` walks to the nearest
 *     valid ancestor, and failing that to the city root, carrying a NON-BLOCKING
 *     notice signal the (PR-2-owned) notice component will consume.
 *
 * Pure. No React, no I/O.
 */
import {
  CITY_ROOT_DEPTH,
  DIRECTION_DEPTH,
  MAX_PUBLIC_DEPTH,
  PERSISTED_NODE_TYPES,
  ROOT_NODE_KEY,
  type NavigationNodeResponse,
  type NavigationNodeType,
  type NavigationResolution,
} from './types';

/**
 * The listing-query area-key set for a resolved node.
 *
 * An AREA leaf's OWN `areaKey` is the query key — never its
 * `descendantAreaKeys`, which the backend explicitly overrides to `[]` for
 * exactly that node type. A structural node has no `areaKey` and contributes its
 * `descendantAreaKeys` instead (`null` for the synthetic root, normalised to
 * `[]` here so callers never null-check the return).
 */
export function listingAreaKeys(
  node: Pick<NavigationNodeResponse, 'areaKey' | 'descendantAreaKeys'>,
): string[] {
  if (node.areaKey) {
    return [node.areaKey];
  }
  return node.descendantAreaKeys ?? [];
}

/* ────────────────────────── AC1.6 — detect and report ───────────────────────── */

/**
 * The minimum a client can see of a node for shape validation. Deliberately
 * structural-only: no counts, no bounds, no labels.
 */
export interface HierarchyNodeShape {
  nodeKey: string;
  nodeType: NavigationNodeType;
  depth: number;
  /** `null` for a root-of-tree node (a DIRECTION under the synthetic city root). */
  parentNodeKey: string | null;
}

/**
 * Problem codes, named to match the server's `ValidationError` codes so an
 * operator reading a frontend report and a server validation run sees the same
 * vocabulary.
 */
export type HierarchyProblemCode =
  | 'INVALID_HIERARCHY_SHAPE'
  | 'MISSING_DIRECTION_ANCESTOR'
  | 'MAX_DEPTH_VIOLATION'
  | 'ONE_CHILD_CLUSTER'
  | 'ORPHAN_NODE';

export interface HierarchyProblem {
  code: HierarchyProblemCode;
  /** The node the problem is attributed to, when attributable. */
  nodeKey: string | null;
  /** Operator-facing detail. Not user copy — the caller decides what to render. */
  message: string;
}

export interface HierarchyReport {
  valid: boolean;
  problems: HierarchyProblem[];
}

export interface ValidateHierarchyOptions {
  /**
   * Operator-configurable ceiling on how many CLUSTER levels may nest beneath a
   * Direction (server invariant #11). Depth 0 is always the DIRECTION level, so
   * the allowed depth is `maxSafetyDepth + 1`. Omitted = this check is skipped,
   * mirroring the server's `null` short-circuit.
   *
   * INDEPENDENT of the fixed contract ceiling (`MAX_PUBLIC_DEPTH`, invariant
   * #14(e)): a tree can satisfy a generous `maxSafetyDepth` and STILL be an
   * invalid public shape.
   */
  maxSafetyDepth?: number;
}

const VALID_NODE_KINDS = new Set<string>(PERSISTED_NODE_TYPES);

/**
 * Validates a client-visible hierarchy slice and REPORTS what is wrong with it.
 *
 * AC1.6 contract, load-bearing: this function is a DETECTOR. It returns a report
 * and nothing else. It does not return a corrected node list, does not mutate the
 * input, and there is deliberately no sibling "normalise"/"repair"/"flatten"
 * export in this module — silently flattening a third CLUSTER level into
 * something renderable is precisely the failure this AC forbids, because the
 * resulting screen looks correct while lying about the tree.
 */
export function validateNavigationHierarchy(
  nodes: readonly HierarchyNodeShape[],
  options: ValidateHierarchyOptions = {},
): HierarchyReport {
  const problems: HierarchyProblem[] = [];
  const byKey = new Map<string, HierarchyNodeShape>();
  const childCountByParent = new Map<string, number>();

  for (const node of nodes) {
    byKey.set(node.nodeKey, node);
  }
  for (const node of nodes) {
    if (node.parentNodeKey !== null) {
      childCountByParent.set(
        node.parentNodeKey,
        (childCountByParent.get(node.parentNodeKey) ?? 0) + 1,
      );
    }
  }

  const { maxSafetyDepth } = options;
  const maxAllowedSafetyDepth = maxSafetyDepth === undefined ? null : maxSafetyDepth + 1;

  for (const node of nodes) {
    if (!VALID_NODE_KINDS.has(node.nodeType)) {
      problems.push({
        code: 'INVALID_HIERARCHY_SHAPE',
        nodeKey: node.nodeKey,
        message: `node ${node.nodeKey} has an unrecognized node_type=${node.nodeType} — only ${PERSISTED_NODE_TYPES.join(', ')} are valid`,
      });
      // An unknown kind cannot be reasoned about further — same short-circuit
      // the server's check #14 takes.
      continue;
    }

    // Invariant #11 — the operator-configurable safety ceiling.
    if (maxAllowedSafetyDepth !== null && node.depth > maxAllowedSafetyDepth) {
      problems.push({
        code: 'MAX_DEPTH_VIOLATION',
        nodeKey: node.nodeKey,
        message: `node ${node.nodeKey} has depth=${node.depth} exceeding max_safety_depth=${maxSafetyDepth} (allowed depth <= ${maxAllowedSafetyDepth})`,
      });
    }

    // Invariant #14(e)(i) — the fixed contract ceiling.
    if (node.depth > MAX_PUBLIC_DEPTH) {
      problems.push({
        code: 'INVALID_HIERARCHY_SHAPE',
        nodeKey: node.nodeKey,
        message: `node ${node.nodeKey} has depth=${node.depth} exceeding the max public depth of ${MAX_PUBLIC_DEPTH} (City -> Direction -> [Local Destination ->] AREA) — no third public CLUSTER level is permitted`,
      });
    }

    // Invariant #14(e)(ii) — a CLUSTER may only occupy depth 1.
    if (node.nodeType === 'CLUSTER' && node.depth >= MAX_PUBLIC_DEPTH) {
      problems.push({
        code: 'INVALID_HIERARCHY_SHAPE',
        nodeKey: node.nodeKey,
        message: `CLUSTER node ${node.nodeKey} is at depth=${node.depth} — a CLUSTER may only occupy depth 1 (the single Local Destination level); a CLUSTER at depth >= ${MAX_PUBLIC_DEPTH} would be a forbidden third public level`,
      });
    }

    const isRootOfTree = node.parentNodeKey === null;
    if (isRootOfTree && node.nodeType !== 'DIRECTION') {
      problems.push({
        code: 'MISSING_DIRECTION_ANCESTOR',
        nodeKey: node.nodeKey,
        message: `root node ${node.nodeKey} is a ${node.nodeType}, but every root of the public navigation tree must be a DIRECTION node (City -> Direction -> ...)`,
      });
    }

    if (node.nodeType === 'DIRECTION') {
      if (node.depth !== DIRECTION_DEPTH) {
        problems.push({
          code: 'INVALID_HIERARCHY_SHAPE',
          nodeKey: node.nodeKey,
          message: `DIRECTION node ${node.nodeKey} has depth=${node.depth}, expected ${DIRECTION_DEPTH}`,
        });
      }
      continue;
    }

    if (!isRootOfTree && !byKey.has(node.parentNodeKey)) {
      problems.push({
        code: 'ORPHAN_NODE',
        nodeKey: node.nodeKey,
        message: `node ${node.nodeKey} names parent ${node.parentNodeKey}, which is not present in this slice`,
      });
    }
  }

  // Invariant #4 — CLUSTER-SCOPED BY DESIGN. A CLUSTER exists only to
  // disambiguate multiple AREAs under a Local Destination label, so a one-child
  // CLUSTER is degenerate. A one-child DIRECTION is legitimate: a region may hold
  // exactly one canonical area (confirmed live on udupi's W region), and
  // rejecting it would make every single-area region unrepresentable.
  //
  // ASSUMES A COMPLETE SIBLING SET. `childCountByParent` is built ONLY from the
  // nodes in the slice handed to this function, so a CLUSTER whose siblings were
  // not fetched — a partial/paged slice, a single-branch fetch — can report
  // ONE_CHILD_CLUSTER spuriously. That is deliberate and left as-is: AC1.6 is
  // "report, never flatten", the report is non-blocking and changes no rendering,
  // and a false report on a partial slice is strictly safer than staying silent on
  // a genuinely degenerate cluster in a complete one. Callers wanting a
  // false-positive-free signal must pass a slice containing every child of every
  // CLUSTER it names.
  for (const node of nodes) {
    if (node.nodeType !== 'CLUSTER') {
      continue;
    }
    if (childCountByParent.get(node.nodeKey) === 1) {
      problems.push({
        code: 'ONE_CHILD_CLUSTER',
        nodeKey: node.nodeKey,
        message: `cluster ${node.nodeKey} has exactly one child`,
      });
    }
  }

  return { valid: problems.length === 0, problems };
}

/* ─────────────────────── AC1.5 — the stale-node ladder ──────────────────────── */

/** Which rung of the ladder the cursor came to rest on. */
export type NodeCursorRung = 'exact' | 'ancestor' | 'city-root';

/**
 * The non-blocking signal a stale cursor raises. PR 1 exposes the STATE only —
 * the notice component itself is not this PR's and must not be built here.
 *
 * `blocking` is a literal `false`: this never gates rendering. The resolved
 * destination is shown normally and the notice sits alongside it.
 */
export interface StaleNodeNotice {
  readonly blocking: false;
  /** Which terminus was reached — drives which copy the notice renders. */
  rung: Exclude<NodeCursorRung, 'exact'>;
  requestedNodeKey: string;
  /** `null` when the ladder bottomed out at the city root. */
  resolvedNodeKey: string | null;
}

export interface NodeCursorOutcome {
  /** What the URL asked for. `null` when there was no `node=` at all. */
  requestedNodeKey: string | null;
  /** Where we came to rest. `null` means the city root. */
  resolvedNodeKey: string | null;
  rung: NodeCursorRung;
  /** `null` when nothing was stale (an exact hit, or no cursor at all). */
  notice: StaleNodeNotice | null;
}

export interface NodeCursorLadderInput {
  /** The raw `node=` value from the URL domain (already trimmed to null-if-empty). */
  requestedNodeKey: string | null;
  /** Whether a key names a node that exists in the CURRENT revision. */
  isKnownNode: (nodeKey: string) => boolean;
  /**
   * The requested key's ancestry, ROOT-FIRST, as best the client knows it (e.g.
   * from a cached `ancestry` array). Empty when nothing is known — which is the
   * normal case for a genuinely unknown key and lands on the city-root terminus.
   */
  ancestorKeysOf: (nodeKey: string) => readonly string[];
}

/**
 * Walks the stale-node ladder: exact hit -> nearest valid ancestor -> city root.
 *
 * "Nearest" means the LAST entry of the root-first ancestry that is still a known
 * node, so a partially-stale ancestry lands as deep as it legitimately can rather
 * than jumping straight to the root.
 *
 * The city-root terminus is not a failure state: `resolvedNodeKey` is `null`, the
 * rung is `'city-root'`, and the notice still fires. Nothing throws and nothing is
 * blocked — a shopper with a months-old link sees the city with an explanation,
 * never an error page.
 */
export function resolveNodeCursor(input: NodeCursorLadderInput): NodeCursorOutcome {
  const { requestedNodeKey, isKnownNode, ancestorKeysOf } = input;

  if (requestedNodeKey === null) {
    return { requestedNodeKey: null, resolvedNodeKey: null, rung: 'city-root', notice: null };
  }

  // The literal synthetic root key IS the city root, and asking for it is exact.
  if (requestedNodeKey === ROOT_NODE_KEY) {
    return {
      requestedNodeKey,
      resolvedNodeKey: null,
      rung: 'exact',
      notice: null,
    };
  }

  if (isKnownNode(requestedNodeKey)) {
    return {
      requestedNodeKey,
      resolvedNodeKey: requestedNodeKey,
      rung: 'exact',
      notice: null,
    };
  }

  const ancestors = ancestorKeysOf(requestedNodeKey);
  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const candidate = ancestors[i];
    if (candidate !== ROOT_NODE_KEY && isKnownNode(candidate)) {
      return {
        requestedNodeKey,
        resolvedNodeKey: candidate,
        rung: 'ancestor',
        notice: {
          blocking: false,
          rung: 'ancestor',
          requestedNodeKey,
          resolvedNodeKey: candidate,
        },
      };
    }
  }

  return {
    requestedNodeKey,
    resolvedNodeKey: null,
    rung: 'city-root',
    notice: {
      blocking: false,
      rung: 'city-root',
      requestedNodeKey,
      resolvedNodeKey: null,
    },
  };
}

/**
 * The same outcome shape, derived from a SERVER `resolve` response instead of a
 * client-side walk.
 *
 * The server already climbs the identical ladder (EXACT -> ANCESTOR -> CITY_ROOT)
 * and always answers 200 for an active city, so when a resolve response is in
 * hand this is the authority and {@link resolveNodeCursor} is not re-run over it.
 * Both funnel into ONE outcome type so the notice state has a single shape
 * regardless of which path produced it.
 *
 * `ALIAS` is a reserved rung no server path currently returns; it is treated as
 * an exact hit (an alias IS the node the user asked for) rather than as staleness.
 */
export function nodeCursorOutcomeFromResolution(
  requestedNodeKey: string,
  resolution: NavigationResolution,
  resolvedNode: Pick<NavigationNodeResponse, 'nodeKey' | 'depth'>,
): NodeCursorOutcome {
  const isCityRoot =
    resolution === 'CITY_ROOT' ||
    resolvedNode.nodeKey === ROOT_NODE_KEY ||
    resolvedNode.depth === CITY_ROOT_DEPTH;

  if (resolution === 'EXACT' || resolution === 'ALIAS') {
    return {
      requestedNodeKey,
      resolvedNodeKey: isCityRoot ? null : resolvedNode.nodeKey,
      rung: 'exact',
      notice: null,
    };
  }

  const rung: Exclude<NodeCursorRung, 'exact'> = isCityRoot ? 'city-root' : 'ancestor';
  const resolvedNodeKey = isCityRoot ? null : resolvedNode.nodeKey;
  return {
    requestedNodeKey,
    resolvedNodeKey,
    rung,
    notice: { blocking: false, rung, requestedNodeKey, resolvedNodeKey },
  };
}
