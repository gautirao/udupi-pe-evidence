/**
 * Runtime resolution of parity-matrix ROLE names to server-generated node
 * keys (issue #2076, Stage 1).
 *
 * WHY: node keys are minted server-side with opaque prefixes (`root`,
 * `a:...`, `c:...`, `d:...` — confirmed against real hosted-observation
 * evidence in docs/audit/issue-2076/discrepancy-register.md, e.g.
 * `node=d:w`, `node=a:IN|KA|Bengaluru|Kambipura`). A literal node key
 * embedded in a spec file would silently go stale the moment the
 * GEOMETRIC_BISECTION generator re-runs or a city's hierarchy is
 * regenerated (see issue #2033's locked depth contract). Specs must never
 * hardcode one.
 *
 * Instead, `docs/audit/issue-2076/parity-matrix.md` is authored in ROLE
 * terms:
 *   - cityRoot                        — the top-level `node=root` state
 *   - directionWithDirectAreas        — a DIRECTION node whose children are
 *                                        AREA nodes directly (no intermediate
 *                                        Local Destination / CLUSTER level)
 *   - directionWithLocalDestinations  — a DIRECTION node with at least one
 *                                        Local Destination (CLUSTER) child
 *   - localDestinationWithAreas       — a Local Destination (CLUSTER) node
 *                                        with AREA children
 *   - denseAreaDirection              — a DIRECTION (or Local Destination)
 *                                        node whose AREA children are dense
 *                                        enough to render as a visual
 *                                        cluster/chip rather than individual
 *                                        pins
 *
 * This module resolves those roles to real node keys AT RUNTIME by driving
 * the live app (never by querying the database directly — Stage 1 forbids
 * any SQL/db access) and caches the result to a GITIGNORED file so a whole
 * spec run only pays the resolution cost once.
 *
 * STAGE-1 HONESTY NOTE: this is a skeleton. Resolution today only proves out
 * `cityRoot` (trivial — it is the literal `node=root` starting URL, no
 * discovery needed). The other four roles require walking the live
 * navigation tree via DOM interaction (click each direction chip, inspect
 * whether its children render as "Local Destination" cluster cards vs. bare
 * area pins, etc.) — real classification logic depends on the Bangalore
 * hierarchy this run was told is hosted-only (see
 * fixture-environment-manifest.md) and, per the plan, tree SHAPE is an
 * OUTPUT of the Stage-2 GEOMETRIC_BISECTION seed that does not exist yet.
 * `resolveParityNodes()` below returns `null` for the four undiscovered
 * roles rather than fabricating a guess, and the pilot spec only ever
 * consumes `cityRoot`. Wiring the DOM-walk classification for the other
 * four roles is explicit Stage-2 follow-up work (tracked in
 * parity-fixture-spec.md).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Page } from '@playwright/test';

export type ParityNodeRole =
  | 'cityRoot'
  | 'directionWithDirectAreas'
  | 'directionWithLocalDestinations'
  | 'localDestinationWithAreas'
  | 'denseAreaDirection';

export type ParityNodeMap = Record<ParityNodeRole, string | null>;

/**
 * Gitignored cache file. Never commit resolved node keys — they are
 * environment-specific (differ between the hosted DB and whatever Stage-2
 * fixture eventually seeds locally) and would silently rot if committed.
 * See the `.gitignore` entry added alongside this file.
 */
export const PARITY_NODE_CACHE_PATH = path.resolve(
  process.cwd(),
  'e2e-parity/.parity-node-roles.json',
);

/** The only role resolvable without any live DOM walk — city root is always `node=root` (or the param omitted entirely). */
const CITY_ROOT_NODE_KEY = 'root';

/**
 * Resolves as many ROLE → node-key mappings as this Stage-1 skeleton can
 * prove without a seeded Bangalore-shaped local fixture. `page` must
 * already be navigated to a settled city-root Discover page (journey=area-first)
 * before calling this.
 *
 * Returns a full ParityNodeMap; unresolved roles are `null`, never a guess.
 */
export async function resolveParityNodes(_page: Page): Promise<ParityNodeMap> {
  // NOTE: `_page` is accepted (not yet used) so the Stage-2 DOM-walk
  // implementation for the remaining four roles has a stable call site to
  // fill in without changing every caller's signature. Marking it unused
  // rather than omitting it keeps that follow-up a small diff.
  return {
    cityRoot: CITY_ROOT_NODE_KEY,
    directionWithDirectAreas: null,
    directionWithLocalDestinations: null,
    localDestinationWithAreas: null,
    denseAreaDirection: null,
  };
}

/** Writes the resolved map to the gitignored cache file (pretty-printed for human debugging). */
export function writeParityNodeCache(map: ParityNodeMap): void {
  fs.mkdirSync(path.dirname(PARITY_NODE_CACHE_PATH), { recursive: true });
  fs.writeFileSync(PARITY_NODE_CACHE_PATH, JSON.stringify(map, null, 2), 'utf-8');
}

/** Reads a previously-written cache, or returns null if none exists yet. */
export function readParityNodeCache(): ParityNodeMap | null {
  if (!fs.existsSync(PARITY_NODE_CACHE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(PARITY_NODE_CACHE_PATH, 'utf-8')) as ParityNodeMap;
  } catch {
    return null;
  }
}

/**
 * Builds a deterministic starting URL for a given role, given the resolved
 * node map. Throws loudly (never returns a guessed URL) if the role has not
 * been resolved — a spec asking for an unresolved role has a bug or is
 * running before the Stage-2 fixture exists, and should fail fast rather
 * than silently testing the wrong state.
 */
export function urlForRole(
  role: ParityNodeRole,
  nodeMap: ParityNodeMap,
  params: { city: string; journey: string; extra?: Record<string, string> },
): string {
  const nodeKey = nodeMap[role];
  if (nodeKey === null || nodeKey === undefined) {
    throw new Error(
      `[parity-nodes] Role "${role}" has not been resolved to a node key. ` +
      'This role is BLOCKED pending the Stage-2 seed / DOM-walk classification — ' +
      'see e2e-parity/support/parity-nodes.ts and docs/audit/issue-2076/parity-fixture-spec.md. ' +
      'Do not hardcode a literal node key to work around this.',
    );
  }

  const search = new URLSearchParams({
    city: params.city,
    journey: params.journey,
    ...(nodeKey !== CITY_ROOT_NODE_KEY ? { node: nodeKey } : {}),
    ...(params.extra ?? {}),
  });

  return `/discover?${search.toString()}`;
}
