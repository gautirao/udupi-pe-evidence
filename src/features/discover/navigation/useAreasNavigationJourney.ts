/**
 * useAreasNavigationJourney — Issue #1956 PR 2 (Slice 3, AC3.1-AC3.10).
 *
 * The journey hook for the canonical Areas hierarchy surface: resolves the
 * CURRENT node (from the `node=` URL cursor, or the synthetic city root when
 * absent), exposes its direct children as a typed destination model, and owns
 * the single selection action every card/marker click funnels through.
 *
 * ── ONE RESOLVED NODE, ONE REFERENCE (AC3.4 / AC3.9 / T3) ──
 * `node` below is the literal object this hook's `useQuery` returned — never a
 * `useMemo` projection of it. Any caller that needs "the same node the map is
 * showing" must consume THIS hook's `node`, not re-derive one, or the map/panel
 * identity guarantee (`Object.is(mapNode, panelNode)`) breaks. This hook is
 * meant to be called ONCE per view and its output threaded to both the map and
 * the panel — it does not itself render anything.
 *
 * ── THE FRONTEND NEVER CONSTRUCTS NODE KEYS ──
 * The requested key comes from the URL (`rawNodeParam`, already trimmed) or
 * defaults to the literal `ROOT_NODE_KEY`. Every child key rendered downstream
 * is copied verbatim from the server's `NavigationChildSummary.nodeKey` — this
 * module and its consumers never concatenate a `d:`/`c:`/`a:` prefix.
 *
 * ── RESOLVE, THEN COUNTS — TWO REQUESTS, NOT A FAN-OUT ──
 * `GET .../navigation/resolve?node=<key>` resolves the cursor (server-side
 * EXACT -> ANCESTOR -> CITY_ROOT ladder, see `navigationModel.ts`). Once a
 * node key is known, `useDiscoverNavigationCounts` (PR 1, unchanged) fetches
 * that node's own + every direct child's rolled-up totals in ONE further
 * request (AC1.11). Neither call loops per child.
 *
 * ── SELECTION IS THE ONE ACTION (AC3.9) ──
 * `selectNode` is the INJECTED `goToNode`-shaped writer (owned by
 * `state/url/navigation.ts`), passed through unchanged — this hook does not
 * wrap it in a new closure per render, so a map marker and a panel card that
 * both receive this same reference are provably dispatching the identical
 * function, not two call sites that happen to behave alike today.
 *
 * ── ALL SERVER CHILDREN RENDER, SORTED (Issue #2086) ──
 * `children` renders every child the server returns for the resolved node,
 * sorted by `displayOrder` — no client-side cap. The former 5/6 defensive
 * truncation (`MAX_DIRECTION_DESTINATIONS`/`MAX_LOCAL_DESTINATIONS`) was a
 * client-side workaround for a server that could not yet guarantee a bound;
 * the server now enforces <=15 children per node fail-closed
 * (`NavigationTreeValidationService`), so a client-side cap could only ever
 * hide a valid destination. A long list is handled purely visually — a
 * scrollable container — not by dropping data. See `navigationModel.ts` for
 * the dev-only over-15 warning that is the new safety net.
 *
 * Pure data + one React Query pair. No fetch fan-out, no client-side node-key
 * construction, no camera side effect — camera fitting is owned by
 * `useDiscoverCameraOrchestration.ts` (T2), which reads this hook's `node` via
 * its own injected params.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { normalizeNavigationResolveResponse } from './normalize';
import {
  ROOT_NODE_KEY,
  type NavigationBounds,
  type NavigationNodeResponse,
  type NavigationNodeType,
  type NavigationResolveResponse,
  type NavigationResolveResponseWire,
} from './types';
import {
  nodeCursorOutcomeFromResolution,
  warnIfChildrenExceedServerCap,
  type StaleNodeNotice,
} from './navigationModel';
import { nodeLevelKind, type NodeLevelKind } from './nodeLevelKind';
import {
  useDiscoverNavigationCounts,
  readDestinationCounts,
  listingEligibilityAccessor,
  NAVIGATION_COUNTS_QUERY_KEY_BASE,
  type DiscoverNavigationCountsFilters,
} from '@/hooks/useDiscoverNavigationCounts';

/**
 * Shared journey-aware LISTING count copy — "N listings" / "1 listing" / the
 * honest zero literal "No listings yet". This is a SEPARATE line from the
 * structural "N areas with matches" caption (`presentStructuralLevel` in
 * `journeyVisibility.ts`): a Direction/Local Destination shows BOTH lines
 * when its matching-area count is derivable, and shows ONLY this listing
 * line when it is not (`matchingAreaCount == null`) — never suppressing a
 * real, available count for want of the other (count_display_defect_2026_07_29
 * follow-up, pass 4). An AREA leaf shows only this line, as before. Exported
 * so `NavigationChildCard`, `AreaMarkerLayer.makeDestinationCard` and
 * `NavigationLevelPanel`'s heading all read the identical singular/plural
 * rule rather than each reimplementing it.
 */
export function formatListingCount(count: number): string {
  return count > 0 ? `${count} listing${count === 1 ? '' : 's'}` : 'No listings yet';
}

/** Query-key base for the resolve fetch. Never an inline string at the call site. */
export const AREAS_NAVIGATION_RESOLVE_QUERY_KEY_BASE = ['discover', 'navigation', 'resolve'] as const;

/**
 * Fix-verify cycle 3 (`user_rulings_2026_07_29_cycle3_grant`) — the app-managed
 * history-adjacency log powering `HierarchyBackButton`'s guarded POP decision.
 *
 * ── WHY THIS LIVES HERE, NOT IN HierarchyBackButton ──
 * The real-browser defect this cycle fixes: `HierarchyBackButton` used to keep
 * this log in its OWN `useRef`. A ref is per component INSTANCE — and this
 * component is NOT stably mounted across a navigation. `DiscoverAreasJourneyPanel`
 * has separate early-return branches for `journey.isLoading` (skeleton, no
 * button), `journey.isError`, and `!journey.node`, none of which render
 * `HierarchyBackButton` at all; only the "resolved, has/lacks children" branches
 * do. Every drill-down goes through a `resolveQuery`/`countsResult` refetch for
 * the new node key, which flips `isLoading` true for at least one commit before
 * the resolved content re-renders — so `HierarchyBackButton` UNMOUNTS during
 * that gap and REMOUNTS fresh once the new node resolves, wiping a
 * component-local ref back to `[]` on literally every hop. That is why the
 * guard always saw an empty log and always chose REPLACE in the real browser,
 * even though the exact same log/guard logic passed every `MemoryRouter`
 * component test (those tests never modelled the loading-branch unmount/remount
 * cycle — they kept one Harness instance mounted for the whole scenario).
 *
 * `useAreasNavigationJourney` is called EXACTLY ONCE per view, unconditionally
 * (rules of hooks — see the module doc), and never itself unmounts across a
 * node navigation. Owning the log here — not in the button that flickers in
 * and out of the tree — makes it survive precisely the transition that broke
 * it, while remaining the single history-adjacency model in the app (the
 * button no longer keeps any competing copy of its own).
 *
 * Exported (not a private helper) so tests can exercise the SAME
 * implementation a `MapDiscovery`-shaped owner would use, without having to
 * stand up the whole network-backed `useAreasNavigationJourney` hook just to
 * prove the log survives a consumer remounting.
 *
 * ── FIX-VERIFY CYCLE 4 — IDENTITY IS THE HISTORY SLOT, NOT `location.key` ──
 * Cycle 3's guard logic (below) was sound but this log's DEDUP key was not:
 * it recognised "already logged" only by an EXACT `location.key` match. An
 * async CAMERA-FIT REPLACE (AC5.11 requires camera fits to create no new
 * hierarchy entry) fires ~650-900ms after every navigation and mints a NEW
 * `location.key` for the SAME history-stack slot — react-router generates a
 * fresh key on every `replace()` even though the slot itself does not move.
 * The old key-based dedup therefore mis-recognised that replace as a brand
 * new logical entry and PUSHED a duplicate, corrupting the very lookup
 * `decideHierarchyBackMechanism` depends on at real human-reaction-time
 * timing (Playwright's scripted clicks race ahead of the ~700ms window and
 * never observe it — this is why 5/5 automated E2E PASS coexisted with a
 * real, reproducible defect; see `rework-request-inner-cycle4-history-index.toml`).
 *
 * The fix: identity is the BROWSER HISTORY SLOT
 * (`window.history.state.idx` — see `readBrowserHistoryIndex` below), never
 * `location.key` and never a repeated `nodeKey`. Same slot + location changed
 * => REPLACE the existing logical entry in place (covers the camera-fit
 * case). A genuinely new slot => a new logical entry (an ordinary PUSH, or a
 * cold/non-adjacent REPLACE to a DIFFERENT node — which must still get its
 * own distinct entry: the same canonical node can legitimately occupy
 * different history slots, so "have we seen this nodeKey before" is exactly
 * as wrong a dedup key as `location.key` was, in the opposite direction). If
 * the browser's history index is unavailable, this module fails closed to
 * REPLACE rather than guessing a POP is safe (ruling item 4).
 */
export interface HistoryAdjacencyEntry {
  /**
   * The browser history-stack slot this logical entry occupies —
   * `window.history.state.idx` (or the router-equivalent index) at the
   * moment this entry was observed. `null` when no trustworthy index was
   * available at observation time; an entry recorded with a `null` index can
   * never be proven adjacent to anything (see `decideHierarchyBackMechanism`
   * below), so it can only ever force a REPLACE, never a POP.
   */
  historyIndex: number | null;
  /** The resolved node's `nodeKey` at that history slot. */
  nodeKey: string;
}

export type HierarchyBackMechanism = 'pop' | 'replace';

/**
 * Reads the browser's current history-stack index. `window.history.state.idx`
 * is the field react-router's own `createBrowserHistory` (`@remix-run/router`)
 * stamps onto every push/replace — the SAME field a plain `BrowserRouter` app
 * relies on internally, so reading it here observes exactly what the router
 * itself just did, with no separate bookkeeping to drift out of sync.
 *
 * Returns `null` (never throws, never guesses) when no trustworthy index is
 * available — no `window`, no `history.state`, or a non-numeric `idx` — so
 * every caller can fail closed to REPLACE per the ruling, rather than
 * inferring a POP is safe from an untrustworthy signal.
 */
export function readBrowserHistoryIndex(): number | null {
  if (typeof window === 'undefined' || !window.history) return null;
  const state = window.history.state as { idx?: unknown } | null | undefined;
  const idx = state?.idx;
  return typeof idx === 'number' && Number.isFinite(idx) ? idx : null;
}

/**
 * Cap: the maximum meaningful hierarchy depth (AC5.1 — City > Direction >
 * Local Destination > Area = 4 levels). A straight drill-down logs exactly
 * one entry per level, so a full ancestor chain never exceeds this many
 * distinct entries and eviction never has to remove an entry a SUBSEQUENT
 * consecutive Back press still needs to prove adjacency against.
 */
export const MAX_ADJACENCY_LOG_LENGTH = 4;

/**
 * Pure guard decision. `log` must be entries observed being committed by the
 * journey owner, oldest-first, deduplicated by `historyIndex` — the browser
 * history SLOT (never `location.key`, never a "last node seen"/repeated-key
 * scalar — see this module's doc above for why both of those are wrong).
 * `currentHistoryIndex` is the CURRENT render's `readBrowserHistoryIndex()`
 * result; `parentNodeKey` is the canonical parent from `node.ancestry`, never
 * anything derived from history itself.
 *
 * Returns `'pop'` ONLY when the log entry immediately preceding "current" has
 * a known `historyIndex` AND `nodeKey === parentNodeKey` — i.e. the
 * immediately-preceding APP-MANAGED history slot is independently known to be
 * the same-city canonical parent. Returns `'replace'` for every other case:
 * an empty log (cold deep link, refresh, a freshly (re)mounted journey), a
 * preceding entry that does not match (a non-adjacent jump, a different
 * city), a log whose only entry IS the current slot (no predecessor observed
 * yet), or — the fail-closed rule (ruling item 4) — an untrustworthy
 * `currentHistoryIndex` (`null`), which can never be proven adjacent to
 * anything.
 */
export function decideHierarchyBackMechanism(
  log: readonly HistoryAdjacencyEntry[],
  currentHistoryIndex: number | null,
  parentNodeKey: string,
): HierarchyBackMechanism {
  if (currentHistoryIndex == null) {
    // Fail closed: an untrustworthy index can never be proven adjacent to
    // anything logged, so guessing POP is safe is exactly what the ruling
    // forbids.
    return 'replace';
  }
  const lastLogged = log[log.length - 1];
  // If the log's most recent entry IS the current slot, the true predecessor
  // is one further back; otherwise the log hasn't recorded the current slot
  // yet (typical mid-render case) and its last entry already IS the true
  // predecessor.
  const previous =
    lastLogged?.historyIndex === currentHistoryIndex ? log[log.length - 2] : lastLogged;
  if (previous != null && previous.historyIndex != null && previous.nodeKey === parentNodeKey) {
    return 'pop';
  }
  return 'replace';
}

/**
 * Journey-owned history-adjacency log. See the module doc above for why this
 * is NOT `HierarchyBackButton`'s own state. Called unconditionally from
 * `useAreasNavigationJourney`'s body (one call site in production); exported
 * so a test can call it directly against a stable wrapper while mounting/
 * unmounting a `HierarchyBackButton`-shaped consumer around it.
 */
export function useHierarchyBackAdjacencyLog(
  node: NavigationNodeResponse | null,
): readonly HistoryAdjacencyEntry[] {
  const location = useLocation();
  const logRef = useRef<HistoryAdjacencyEntry[]>([]);

  // Record THIS history slot as an app-observed entry, strictly AFTER the
  // render that used the log to decide that render's own mechanism — so a
  // decision always sees the log as of the PRECEDING commit, never a
  // self-referential "did I just log myself" state. `location.key` is used
  // ONLY to trigger this effect on every navigation commit (push, replace,
  // or a real browser Back/Forward all produce a new `location` object) —
  // fix-verify cycle 4 moved the log's IDENTITY off `location.key` entirely;
  // see the module doc above for why.
  useEffect(() => {
    if (!node) return;
    const log = logRef.current;
    const historyIndex = readBrowserHistoryIndex();

    if (historyIndex == null) {
      // Fail closed (ruling item 4): without a trustworthy index this entry
      // can never be proven adjacent to anything, so it is recorded
      // standalone — it can only ever force a REPLACE decision downstream,
      // never a POP.
      log.push({ historyIndex: null, nodeKey: node.nodeKey });
      if (log.length > MAX_ADJACENCY_LOG_LENGTH) {
        log.shift();
      }
      return;
    }

    // Search the WHOLE log, not just its last entry — a real POP/Forward
    // restores the ORIGINAL history slot of the entry being returned to, so
    // returning to an ancestor already logged several hops back must be
    // recognised as "already known", not appended as a fresh duplicate.
    const matchIndex = log.findIndex((entry) => entry.historyIndex === historyIndex);
    if (matchIndex !== -1) {
      // Same SLOT as an already-logged entry. Three cases land here, all
      // handled identically:
      //  - the async camera-fit REPLACE for the entry just logged (matchIndex
      //    is the last entry, `location.key` changed, `historyIndex` did
      //    not) — THIS is the cycle-4 fix: update in place, never append.
      //  - the RESOLVED node settling asynchronously (resolve/counts fetch)
      //    after this same slot was logged on an earlier, in-flight render.
      //  - a real POP/Forward that has returned to a slot logged several
      //    hops back — truncate everything logged after it, the same way a
      //    genuine POP/REPLACE discards the forward stack, so the log keeps
      //    modelling "what is actually behind current", never accumulating a
      //    duplicate for a slot already known.
      log.splice(matchIndex + 1);
      log[matchIndex] = { historyIndex, nodeKey: node.nodeKey };
    } else {
      // A genuinely new SLOT — an ordinary PUSH (higher index), or a
      // cold/non-adjacent REPLACE to a DIFFERENT node. Do NOT infer identity
      // from a repeated `nodeKey`: the same canonical node can legitimately
      // occupy a different history slot, so a guard-issued REPLACE to a
      // genuinely different node must still produce its own distinct
      // logical entry here, never be swallowed into a prior one.
      log.push({ historyIndex, nodeKey: node.nodeKey });
      if (log.length > MAX_ADJACENCY_LOG_LENGTH) {
        log.shift();
      }
    }
  }, [location.key, node]);

  return logRef.current;
}

export interface AreasNavigationChild {
  nodeKey: string;
  nodeType: NavigationNodeType;
  displayLabel: string;
  displayOrder: number;
  /** PRIMARY metric. Server-computed, never re-summed here. 0 while counts are still loading. */
  listingCount: number;
  /** SECONDARY metadata. `null` while counts are loading or the server supplied none. */
  schoolCount: number | null;
  /** True for an AREA child — selecting it is a leaf/listings destination, not a further drill-down. */
  isLeafArea: boolean;
  /**
   * The count `presentStructuralLevel`'s `matchingAreaCount` parameter needs — the
   * number of this (non-leaf) child's MEMBER AREAS that have an eligible listing
   * under the current filters. `null` for an AREA leaf child (not applicable — a
   * leaf shows its own `listingCount` instead, never this field).
   *
   * SERVER-COMPUTED, straight off `NavigationNodeCount.matchingAreaCount` (see
   * `types.ts`) — this is an AREA count, never the listing total, and `0` is a
   * real, meaningful value (this child has no eligible member area), not an
   * absent/unknown signal. This replaces the former "entailed-zero-or-null"
   * client-side compromise (count_display_defect_2026_07_29): that compromise
   * could only assert `0` when the child's own listing total was 0, and had to
   * fall back to `null` — silently hiding the structural line — for every child
   * with a positive listing total, which is exactly the common case (e.g. a
   * Direction with 1,736 listings across 12 eligible areas). The backend now
   * exposes the exact figure for every child, so no entailment/fallback logic
   * remains here.
   */
  matchingAreaCount: number | null;
  /**
   * Canonical descendant AREA count under this child, INCLUDING zero-listing
   * areas — distinct from {@link matchingAreaCount}, which is listing-derived
   * and moves with filters. Never conflate the two. `null` when the server
   * omitted it. Typed seam only — issue #2088 is the first consumer of this.
   */
  descendantAreaCount: number | null;
  /** Never null on the wire (may be empty). Typed seam only — see `descendantAreaCount`. */
  representativeAreaKeys: string[];
  /** Same shape as the outer node's bounds. Typed seam only — see `descendantAreaCount`. */
  bounds: NavigationBounds | null;
  /**
   * Bearing in degrees [0,360) from the PARENT node's centre to this child's
   * centre — never relative to the user or camera. `null` for depth-0
   * children (Directions under ROOT). Typed seam only — see `descendantAreaCount`.
   */
  bearingDegrees: number | null;
}

export interface UseAreasNavigationJourneyParams {
  city: string;
  /**
   * The RAW trimmed `node=` URL value (`DiscoverUrlState.rawNodeParam`) — NOT
   * the shape-validated `node` field. A malformed-but-present value is still
   * forwarded to the server's resolve ladder rather than silently defaulting
   * to root, so the resolution notice can explain what happened; `null`
   * (genuinely absent) resolves to the synthetic city root.
   */
  requestedNodeKey: string | null;
  /**
   * The ONE write path for a destination selection (`urlActions.goToNode`),
   * passed through unchanged — see the module doc's AC3.9 note.
   */
  onSelectNode: (nodeKey: string) => void;
  filters?: DiscoverNavigationCountsFilters;
  /** Gate — false while the canonical Areas journey is not mounted. */
  enabled?: boolean;
}

export interface UseAreasNavigationJourneyResult {
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  /**
   * The ONE resolved node object, by reference (AC3.4/AC3.9/T3). `null` while
   * loading, on error, or when disabled.
   */
  node: NavigationNodeResponse | null;
  /** What the level BELOW `node` contains — dispatch on this, never on depth. */
  levelKind: NodeLevelKind;
  /** `node`'s direct children as the typed destination model — every server child, sorted by `displayOrder`, no client-side cap. */
  children: AreasNavigationChild[];
  /** Non-blocking stale/invalid-node recovery signal — AC "resolution notice". */
  resolutionNotice: StaleNodeNotice | null;
  /**
   * `node`'s OWN rolled-up totals (AC3.4 — the panel heading's count must be
   * the SAME number the map's destination card for this node shows). `null`
   * while counts are loading; server-computed, never summed from `children`.
   */
  nodeCount: { listingCount: number; schoolCount: number; matchingAreaCount: number | null } | null;
  /** The single selection action — same reference every render (AC3.9). */
  selectNode: (nodeKey: string) => void;
  /** Retries BOTH the resolve and (once resolved) the counts fetch. */
  refetch: () => void;
  /**
   * Fix-verify cycle 3 — the app-managed history-adjacency log
   * `HierarchyBackButton`'s guarded POP decision (`decideHierarchyBackMechanism`)
   * is computed against. Owned by THIS hook (`useHierarchyBackAdjacencyLog`
   * above) so it survives `HierarchyBackButton` unmounting/remounting across
   * the loading/resolved branch swap in `DiscoverAreasJourneyPanel` — never
   * `HierarchyBackButton`'s own component-local state. See that hook's doc
   * comment for the full defect writeup.
   */
  historyAdjacencyLog: readonly HistoryAdjacencyEntry[];
}

export function useAreasNavigationJourney({
  city,
  requestedNodeKey,
  onSelectNode,
  filters,
  enabled = true,
}: UseAreasNavigationJourneyParams): UseAreasNavigationJourneyResult {
  const queryClient = useQueryClient();
  const resolveKey = requestedNodeKey ?? ROOT_NODE_KEY;
  const isResolveEnabled = enabled && Boolean(city);

  const resolveQuery = useQuery<NavigationResolveResponse, ApiError>({
    queryKey: [...AREAS_NAVIGATION_RESOLVE_QUERY_KEY_BASE, city, resolveKey] as const,
    queryFn: async ({ signal }) => {
      const path = `/api/discover/cities/${encodeURIComponent(city)}/navigation/resolve?node=${encodeURIComponent(resolveKey)}`;
      const wire = await api.get<NavigationResolveResponseWire>(path, { signal });
      return normalizeNavigationResolveResponse(wire);
    },
    enabled: isResolveEnabled,
    staleTime: 30_000,
  });

  const resolved = isResolveEnabled ? resolveQuery.data ?? null : null;
  const node = resolved?.node ?? null;

  const countsResult = useDiscoverNavigationCounts({
    city,
    nodeKey: node?.nodeKey ?? null,
    filters,
    enabled: isResolveEnabled && node != null,
  });

  // Fix-verify cycle 3 — called unconditionally, every render, regardless of
  // whether a HierarchyBackButton is currently mounted anywhere downstream;
  // see useHierarchyBackAdjacencyLog's doc for why this must live here.
  const historyAdjacencyLog = useHierarchyBackAdjacencyLog(node);

  const levelKind = node ? nodeLevelKind(node) : 'empty';

  const children = useMemo(() => {
    if (!node) return [] as AreasNavigationChild[];
    warnIfChildrenExceedServerCap(node.nodeKey, node.children.length);
    const ordered = [...node.children].sort((a, b) => a.displayOrder - b.displayOrder);
    return ordered.map((child) => {
      const childCounts = countsResult.snapshot?.countsForChild(child.nodeKey);
      const childListingCount = childCounts?.count ?? 0;
      const isLeafArea = child.nodeType === 'AREA';
      return {
        nodeKey: child.nodeKey,
        nodeType: child.nodeType,
        displayLabel: child.displayLabel,
        displayOrder: child.displayOrder,
        listingCount: childListingCount,
        schoolCount: childCounts?.schoolCount ?? null,
        isLeafArea,
        // Server-computed AREA count (see the field doc on
        // AreasNavigationChild.matchingAreaCount) — not applicable to a leaf.
        matchingAreaCount: isLeafArea ? null : childCounts?.matchingAreaCount ?? null,
        descendantAreaCount: child.descendantAreaCount ?? null,
        representativeAreaKeys: child.representativeAreaKeys ?? [],
        bounds: child.bounds ?? null,
        bearingDegrees: child.bearingDegrees ?? null,
      };
    });
  }, [node, countsResult.snapshot]);

  const resolutionNotice = useMemo(() => {
    if (!resolved || !node) return null;
    return nodeCursorOutcomeFromResolution(resolved.requested, resolved.resolution, node).notice;
  }, [resolved, node]);

  /**
   * The CURRENT node's own matching-area count — unlike a child (see
   * `AreasNavigationChild.matchingAreaCount`), the currently-resolved node DOES
   * carry its own `descendantAreaKeys` (populated for DIRECTION/CLUSTER; `null`
   * for the synthetic city ROOT, which the backend does not populate it for).
   * Combined with the counts snapshot's whole-city per-area map, the real
   * Areas-journey visibility predicate (`readDestinationCounts` +
   * `listingEligibilityAccessor`, the SAME functions the map/panel
   * destination-count machinery already uses) gives an honest, non-invented
   * count.
   *
   * Issue #2084 clarification rev 2 — ROOT is NOT unknowable: the counts
   * snapshot's whole-city `areaListingCounts` map already carries every area
   * key in the city, so ROOT's member-area set is that map's key set, run
   * through the SAME predicate used for DIRECTION/CLUSTER below. This is the
   * only node type where the metrics chip (JourneySwitcher, mounted at the
   * city ROOT) actually renders, so resolving it here is what makes that
   * chip show a real number instead of a permanent loading state. `null`
   * remains for an AREA leaf (not a meaningful question for a single area).
   */
  const nodeMatchingAreaCount = useMemo(() => {
    if (!node || countsResult.snapshot == null) return null;
    if (node.nodeType === 'AREA') return null;
    const eligibleCountForArea = listingEligibilityAccessor(countsResult.snapshot);
    if (node.nodeType === 'ROOT') {
      const cityAreaKeys = Array.from(countsResult.snapshot.areaListingCounts.keys());
      return readDestinationCounts(countsResult.snapshot, cityAreaKeys, [], eligibleCountForArea)
        .visibleMemberCount;
    }
    if (node.nodeType !== 'DIRECTION' && node.nodeType !== 'CLUSTER') return null;
    if (node.descendantAreaKeys == null) return null;
    return readDestinationCounts(
      countsResult.snapshot,
      node.descendantAreaKeys,
      [],
      eligibleCountForArea,
    ).visibleMemberCount;
  }, [node, countsResult.snapshot]);

  return {
    isLoading: isResolveEnabled && (resolveQuery.isLoading || (node != null && countsResult.isLoading)),
    isError: isResolveEnabled && (resolveQuery.isError || countsResult.isError),
    error: resolveQuery.error ?? countsResult.error ?? null,
    node,
    levelKind,
    children,
    resolutionNotice,
    nodeCount:
      countsResult.snapshot != null
        ? {
            listingCount: countsResult.snapshot.listingCount,
            schoolCount: countsResult.snapshot.schoolCount,
            matchingAreaCount: nodeMatchingAreaCount,
          }
        : null,
    selectNode: onSelectNode,
    // Retries BOTH requests. resolveQuery.refetch() re-runs resolve
    // unconditionally. The resolve query key is UNCHANGED whether counts
    // failed or not, so refetching resolve alone can never re-trigger an
    // errored counts fetch — there is no key change for TanStack to notice.
    // Invalidating the counts query by its EXACT key (fingerprint mirrors
    // countsResult's own derivation) forces a genuine refetch for the
    // currently-mounted, currently-enabled counts observer, recovering a
    // journey stuck in a counts-error state.
    refetch: () => {
      void resolveQuery.refetch();
      if (countsResult.fingerprint != null) {
        void queryClient.invalidateQueries({
          queryKey: [...NAVIGATION_COUNTS_QUERY_KEY_BASE, countsResult.fingerprint],
        });
      }
    },
    historyAdjacencyLog,
  };
}
