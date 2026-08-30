/**
 * The ONE depth-generic level switch for the canonical Areas navigation model —
 * Issue #1956 PR 1 (FE-2).
 *
 * Every consumer that needs to know "what kind of level am I looking at" MUST
 * come through here. Nothing may branch level KIND on `node.depth`, on the city
 * slug, or on `node.children.length`.
 *
 * Dispatch is on node TYPE (`nextLevelType` / `nodeType`), which is exactly why
 * this survives the live shape being `City -> DIRECTION -> AREA` today and a
 * `City -> DIRECTION -> CLUSTER -> AREA` tree tomorrow with no edit: a Local
 * Destination level appearing under a Direction changes `nextLevelType` from
 * `'AREA'` to `'CLUSTER'` and nothing else. Hardcoding "depth 1 == AREA" would
 * silently mislabel that tree.
 *
 * Pure. No React, no I/O.
 */
import type { NavigationNodeResponse, NavigationNodeType } from './types';

/**
 * What the level BELOW the current node contains.
 *
 * `'empty'` is a REAL, DESIGNED level (a childless CLUSTER, or a city root with
 * no children yet) and is genuinely reachable — callers render the empty-level
 * UI for it, never a 404/error state.
 */
export type NodeLevelKind = 'directions' | 'clusters' | 'areas' | 'listings' | 'empty';

/**
 * Maps a resolved node's `nextLevelType` to the depth-generic level kind.
 *
 * The parameter type deliberately does NOT expose `depth`, so a depth-based
 * branch cannot be written inside this function even by accident.
 *
 * The `default` arm is NOT dead code. The switch is exhaustive over the CURRENT
 * `NavigationNodeType` union, so TypeScript is satisfied at compile time — but the
 * value arrives over the wire, and a server that starts emitting a level type this
 * build has never heard of would otherwise fall off the end and return
 * `undefined` while the signature promises `NodeLevelKind`. Every downstream
 * consumer would then branch on a value that is not in the union. `'empty'` is the
 * safe landing: it is a real designed level whose UI is a normal empty state, so
 * an unknown type degrades to "nothing to show here" rather than to a crash.
 */
export function nodeLevelKind(
  node: Pick<NavigationNodeResponse, 'nextLevelType'>,
): NodeLevelKind {
  switch (node.nextLevelType) {
    case 'DIRECTION':
      return 'directions';
    case 'CLUSTER':
      return 'clusters';
    case 'AREA':
      return 'areas';
    case 'LISTINGS':
      return 'listings';
    case null:
      return 'empty';
    default:
      return 'empty';
  }
}

/**
 * STRUCTURAL levels are the ones that exist to organise the city:
 * the synthetic city root, DIRECTION, and CLUSTER ("Local Destination").
 *
 * AC1.8/AC1.9 hang off this distinction: journey-aware visibility applies to
 * FINAL AREA PRESENTATION ONLY. A structural level is never hidden, removed or
 * re-parented — it keeps its stable canonical name and position and renders the
 * zero literal instead of disappearing.
 */
export function isStructuralNodeType(nodeType: NavigationNodeType): boolean {
  return nodeType !== 'AREA';
}

/**
 * True for the one node type that represents final AREA presentation — the only
 * level journey-aware visibility may remove a member from.
 */
export function isFinalAreaNodeType(nodeType: NavigationNodeType): boolean {
  return nodeType === 'AREA';
}
