import { ROOT_NODE_KEY } from '@/features/discover/navigation/types';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

/**
 * Issue #2185 S2 — the single, load-bearing precedence for what geography a
 * Discover marker fetch is scoped to.
 *
 * Before this selector existed, the canonical `node=` journey never set
 * `nav.groupId`, so `groupAreaKeys` reaching `useDiscoverFilteredMarkers` was
 * always `undefined` — the marker query fired UNSCOPED CITY-WIDE at a
 * resolved AREA leaf, while the right panel fetched
 * `[selectedArea.areaKey]` via a different hook. That divergence is the
 * map/panel mismatch the issue reports.
 *
 * `'areas'` is the LEGACY #1597 group-scope producer — it is DEAD on the
 * canonical node path (rule 5 always wins there) and survives only because a
 * legacy `groupId=` producer still exists. Deleted in S3.
 */
export type DiscoverMarkerScope =
  | { kind: 'city' }
  | { kind: 'node'; nodeKey: string }
  | { kind: 'areas'; areaKeys: string[] }
  | { kind: 'unresolved'; reason: 'group-cold-load' | 'node-resolving' };

export interface DiscoverMarkerScopeInput {
  /** `useDiscoverSource().mode` — preview's `/markers` endpoint only understands `?areaKeys=`. */
  sourceMode: 'live' | 'preview';
  journey: DiscoverJourney | null;
  schoolId: string | null;
  /** The RAW trimmed `node=` URL value (`DiscoverUrlState.rawNodeParam`), before resolution. */
  rawNodeParam: string | null | undefined;
  /** `areasNavigationJourney.node?.nodeKey ?? null` — the SERVER-resolved node, once classified. */
  resolvedNodeKey: string | null;
  /**
   * Legacy #1597 group-scope producer (`groupAreaKeysForMapData`).
   * undefined = no group focused. [] = group focused, not yet resolved. [k1, k2..] = resolved.
   */
  groupAreaKeys: string[] | undefined;
}

/**
 * Precedence (load-bearing — encoded ONCE, here; every consumer defers to
 * this function rather than re-deriving the order):
 *
 *  1. preview mode -> city. Preview's `/markers` endpoint (E4) only
 *     understands `?areaKeys=` — a node scope has no wire representation
 *     there (D2, ruled: preview node-scoping is a deferred follow-up).
 *  2. school-first + schoolId -> city. The backend ANDs
 *     `schoolLat/schoolLon/schoolRadiusKm` with `effectiveAreaKeys` in the
 *     SAME predicate object (`DiscoverMarkersController.java:118-140`), so a
 *     node/areas scope during an active school radius would AREA-CLIP the
 *     radius results — the exact regression the issue forbids.
 *  3. agri-first -> city. Byte-identical to pre-existing behaviour.
 *  4. a `node=` is present but not yet classified -> unresolved. Must run
 *     BEFORE rule 5 so a query never fires with an undefined nodeKey
 *     mid-resolution.
 *  5. a node has resolved (and is not the synthetic city root) -> node. Must
 *     run BEFORE rule 6 — this is what makes the legacy `'areas'` arm DEAD on
 *     the canonical path (S3 deletes it rather than rewrites it).
 *  6. legacy #1597 group-scope producer -> areas (or unresolved while its
 *     own cold-load race is in flight).
 *  7. otherwise -> city (deliberately unscoped).
 */
export function resolveDiscoverMarkerScope(input: DiscoverMarkerScopeInput): DiscoverMarkerScope {
  const { sourceMode, journey, schoolId, rawNodeParam, resolvedNodeKey, groupAreaKeys } = input;

  if (sourceMode === 'preview') return { kind: 'city' };

  if (journey === 'school-first' && schoolId) return { kind: 'city' };

  if (journey === 'agri-first') return { kind: 'city' };

  if (rawNodeParam != null && resolvedNodeKey == null) {
    return { kind: 'unresolved', reason: 'node-resolving' };
  }

  if (resolvedNodeKey != null && resolvedNodeKey !== ROOT_NODE_KEY) {
    return { kind: 'node', nodeKey: resolvedNodeKey };
  }

  if (groupAreaKeys !== undefined) {
    return groupAreaKeys.length === 0
      ? { kind: 'unresolved', reason: 'group-cold-load' }
      : { kind: 'areas', areaKeys: groupAreaKeys };
  }

  return { kind: 'city' };
}
