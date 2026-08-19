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
 * `'areas'` is the LEGACY #1597 group-scope producer. It is dead on the
 * canonical node path (rule 5 always wins there) in BOTH live and preview
 * mode (rule 1's own node-then-group precedence, mirroring rules 4/5, makes
 * it dead on preview's node path too as of #2202/#2215). It is NOT dead
 * overall. It is reachable via two disjoint routes:
 *   1. Preview mode, when no node is resolved (rule 1's fallback) — preview's
 *      `/markers` endpoint now understands `?node=` as well as `?areaKeys=`
 *      (#2202/PR #2210, consumed here by #2215), so a resolved node in
 *      preview mode takes precedence over `groupAreaKeys`, exactly as it does
 *      in live mode. The legacy group-scoped path stays live in preview only
 *      when no node is resolved (see #2188) — it must not be dropped to an
 *      unscoped city-wide fetch (regressed by #2192, fixed by #2185-S2b).
 *   2. Live mode when `journey === 'school-first' && schoolId == null &&
 *      groupId != null` (reaches rule 6). Both school-first guards — rule 2
 *      here and useDiscoverAreaGroupsController.ts:89 — are keyed on
 *      `schoolId`, not on the journey, so the shipped school-browse /
 *      school-group-areas states (schoolId null; see
 *      discoverPanelState.ts:118-120) fire neither guard and fall through
 *      to rule 6.
 *
 *      Issue #2216 — this route's WRITER side is now dead: all three
 *      school-first "area not yet loaded in discoverAreas" fallback call
 *      sites (useDiscoverOverviewNavigationController.ts, SchoolFirstJourneyPanel.tsx,
 *      LegacyRightPanelBridge.tsx) that used to write the legacy
 *      `actions.selectArea(areaKey)` param no longer do so under any
 *      resolution outcome: each writes the canonical journey-preserving
 *      `actions.goToNodeAndClearSchoolSelection(nodeKey)` when the reverse
 *      `areaKey -> nodeKey` lookup resolves, and fails closed (no-op — no
 *      URL write at all) when it does not, rather than falling back to the
 *      legacy param. So a fresh school-first selection can no longer PRODUCE
 *      the `groupId != null` state this route reads. This does not delete the
 *      route itself (still reachable from a pre-existing/deep-linked legacy
 *      `areaKey=`+`groupId=` URL, out of scope here) — see #2205 for the
 *      re-audit that determines whether the READ side can be removed.
 * agri-first can never reach rule 6 — rule 3 returns `{ kind: 'city' }`
 * unconditionally. The arm dies only when BOTH preview node-scoping (#2202)
 * and the school-first group taxonomy migration (#2201) have landed — never
 * on one alone; deleting it before then reintroduces the #1806 map/panel
 * scope mismatch. Legacy removal is tracked as #2205.
 */
export type DiscoverMarkerScope =
  | { kind: 'city' }
  | { kind: 'node'; nodeKey: string }
  | { kind: 'areas'; areaKeys: string[] }
  | { kind: 'unresolved'; reason: 'group-cold-load' | 'node-resolving' };

export interface DiscoverMarkerScopeInput {
  /**
   * `useDiscoverSource().mode`. Preview's `/markers` endpoint understands
   * both `?node=` and `?areaKeys=` (#2202/PR #2210) — preview mode applies
   * the same node-then-group precedence as live mode's rules 4/5/6, just
   * without live-only rules 2/3 (school-first/agri-first city force), which
   * do not apply to preview's admin-only surface.
   */
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
 *  1. preview mode -> applies the SAME node-then-group precedence as rules
 *     4/5/6 below (a `node=` present but not yet classified -> unresolved; a
 *     resolved non-root node -> node), THEN falls back to the legacy #1597
 *     group-scope producer (`groupAreaKeys`) when no node is resolved: a
 *     resolved non-empty group -> areas, a cold-loading group ([]) ->
 *     unresolved, and no group at all (undefined) -> city. Preview's
 *     `/markers` endpoint now understands `?node=` as well as `?areaKeys=`
 *     (#2202/PR #2210, consumed by #2215) — a resolved node in preview wins
 *     over `groupAreaKeys`, exactly as it does in live mode. Live-only rules
 *     2/3 below (school-first/agri-first city force) are NOT applied to
 *     preview — preview's admin-only surface has no schoolId/journey radius
 *     concept, so there is no radius-clipping risk to guard against (verified
 *     against the preview backend contract, not assumed). The legacy
 *     group-scoped path is still live in preview when no node is resolved
 *     (see #2188) and must not be dropped to an unscoped city-wide fetch
 *     (regressed by #2192, fixed by #2185-S2b).
 *  2. school-first + schoolId -> city (live mode only). The backend ANDs
 *     `schoolLat/schoolLon/schoolRadiusKm` with `effectiveAreaKeys` in the
 *     SAME predicate object (`DiscoverMarkersController.java:118-140`), so a
 *     node/areas scope during an active school radius would AREA-CLIP the
 *     radius results — the exact regression the issue forbids.
 *  3. agri-first -> city. Byte-identical to pre-existing behaviour.
 *  4. a `node=` is present but not yet classified -> unresolved. Must run
 *     BEFORE rule 5 so a query never fires with an undefined nodeKey
 *     mid-resolution.
 *  5. a node has resolved (and is not the synthetic city root) -> node. Must
 *     run BEFORE rule 6 — this is what makes the legacy `'areas'` arm dead on
 *     the canonical node= path specifically (not overall — see rule 1 and
 *     #2188 for its remaining live producers).
 *  6. legacy #1597 group-scope producer -> areas (or unresolved while its
 *     own cold-load race is in flight).
 *  7. otherwise -> city (deliberately unscoped).
 */
export function resolveDiscoverMarkerScope(input: DiscoverMarkerScopeInput): DiscoverMarkerScope {
  const { sourceMode, journey, schoolId, rawNodeParam, resolvedNodeKey, groupAreaKeys } = input;

  if (sourceMode === 'preview') {
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
