/**
 * Wire-to-strict normalization for the navigation node shape — Issue #1956 PR 2.
 *
 * Ported from the `issue-1956-pr-b-frontend-areas-journey` worktree and conformed
 * field-by-field to PR 1's ACTUAL `./types.ts` (the salvage predates it). PR 1
 * already declares `NavigationNodeWire` / `NavigationResolveResponseWire` *for*
 * this module; without it those wire types have no consumer and the gap they
 * describe stays open.
 *
 * THE GAP: `NavigationNodeResponse` is annotated
 * `@JsonInclude(JsonInclude.Include.NON_NULL)` on the backend record with no
 * global `spring.jackson.default-property-inclusion` override, so a null-valued
 * field is OMITTED from the JSON entirely — it arrives as `undefined` after
 * `JSON.parse`, never `null`. Every strict type in `./types.ts` promises `null`.
 * A consumer writing `node.bounds === null` would therefore be false for a node
 * the server considers boundless.
 *
 * This is the ONE place that gap is closed. `normalizeNavigationNode` /
 * `normalizeNavigationResolveResponse` must run on every wire value BEFORE it
 * enters the TanStack Query cache, so every consumer and every `select` sees the
 * canonical strict-null `NavigationNodeResponse` shape — never the raw wire
 * shape, and never `undefined` in a field this app treats as `X | null`.
 *
 * `NavigationCountsResponse` and `NavigationPathResponse` have no nullable fields
 * (verified against their backend records — `NavigationCountsResponse`'s own doc
 * in ./types.ts states this explicitly), so they need no wire type and no
 * normalization: parsed JSON already matches their strict shape.
 *
 * Pure data mapping. No React, no fetch, no I/O — same discipline as every other
 * module in this directory.
 */
import type {
  NavigationNodeResponse,
  NavigationNodeWire,
  NavigationResolveResponse,
  NavigationResolveResponseWire,
} from './types';

/**
 * Maps each of the five possibly-omitted wire fields to a real `null` when absent.
 *
 * Written as an EXPLICIT field-by-field literal rather than a spread + patch, so
 * that adding a field to `NavigationNodeResponse` without deciding its wire
 * nullability is a compile error here rather than a silently-`undefined` field
 * at runtime. The five `?? null` sites are exactly the five `?:` fields on
 * `NavigationNodeWire`; the rest are non-null server-side.
 */
export function normalizeNavigationNode(wire: NavigationNodeWire): NavigationNodeResponse {
  return {
    nodeKey: wire.nodeKey,
    nodeType: wire.nodeType,
    displayLabel: wire.displayLabel,
    depth: wire.depth,
    regionKey: wire.regionKey ?? null,
    ancestry: wire.ancestry,
    nextLevelType: wire.nextLevelType ?? null,
    children: wire.children,
    revisionId: wire.revisionId,
    bounds: wire.bounds ?? null,
    descendantAreaKeys: wire.descendantAreaKeys ?? null,
    areaKey: wire.areaKey ?? null,
  };
}

/**
 * Normalizes the inlined `node` body of a resolve response; every other field on
 * `NavigationResolveResponse` is already strict (`requested`/`resolution`/
 * `revisionId` are always present on the wire).
 */
export function normalizeNavigationResolveResponse(
  wire: NavigationResolveResponseWire,
): NavigationResolveResponse {
  return {
    requested: wire.requested,
    resolution: wire.resolution,
    revisionId: wire.revisionId,
    node: normalizeNavigationNode(wire.node),
  };
}
