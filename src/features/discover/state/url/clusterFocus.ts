/**
 * clusterFocus URL domain — Issue #2088 (commit 4/7).
 *
 * Owns ONE new, non-hierarchy presentation param: `clusterFocus`, the member
 * `areaKey`s of the dashed, client-side visual AREA cluster currently focused
 * on the canonical-Areas map (see `AreaDestinationMarkerLayer`'s
 * `focusedClusterMemberAreaKeys` prop). This is a one-domain-per-file module
 * (mirrors `viewport.ts`), and it satisfies eight owner-ruled binding
 * requirements (design_decisions.D2_binding_requirements, issue-2088
 * team-lead plan) — treated here as ONE exhaustive class, not eight
 * independently-satisfiable items:
 *
 *   BR1 — NEVER a hierarchy node key. Satisfied by construction: this param
 *         is `clusterFocus`, never `node`, and its values are AREA keys
 *         (pipe-delimited place names), never passed through
 *         `isWritableNodeKey` or the `a:`/`c:`/`d:` key grammar.
 *   BR2 — NEVER changes nodeKey/breadcrumb/canonical ancestry. Satisfied by
 *         construction: `applyClusterFocusDelta` only ever touches the
 *         `clusterFocus` param.
 *   BR3 — selecting a dashed cluster REPLACEs, never PUSHes (no hierarchy-
 *         history entry). Enforced by the caller (`useClusterFocusUrlParam`'s
 *         `setClusterFocus` always writes with `{ replace: true }`).
 *   BR4 — selecting an Area from WITHIN a cluster focus may then PUSH normal
 *         navigation, so Back restores the cluster-focused entry. Satisfied
 *         structurally: that Area selection goes through the ordinary
 *         `goToNode` PUSH (state/url/navigation.ts), which — via BR5 below —
 *         deletes `clusterFocus` in the SAME write, leaving the REPLACEd
 *         prior history entry (still carrying `clusterFocus`) exactly as the
 *         Back target.
 *   BR5 — CLEARED whenever the stable node changes. `navigation.ts`'s
 *         `applyNodeDelta` deletes `clusterFocus` via `clearClusterFocusParam`
 *         (this module) in its own delete-list, so EVERY node write —
 *         `goToNode`, `goToAncestorNode`, `clearNode`, `enterAreasJourney`,
 *         and `buildNodeHref`'s pure href — carries this deletion, not just
 *         one call site.
 *   BR6 — CLEARED when "Show all" is selected. `DiscoverAreasJourneyPanel`'s
 *         "Show all <n> areas" control calls `setClusterFocus(null)`, which
 *         `applyClusterFocusDelta` maps to a delete.
 *   BR7 — EXCLUDED from hierarchy API requests and from hierarchy
 *         static-sweep checks. Satisfied by construction: this file lives in
 *         `state/url/`, not `features/discover/navigation/` (the directory
 *         `staticSweep.test.ts` walks), and no hierarchy fetch
 *         (`useAreasNavigationJourney`'s resolve/counts calls) reads this
 *         param — `requestedNodeKey` comes from `rawNodeParam` only.
 *   BR8 — VALIDATED against the currently selected node; stale/invalid values
 *         are safely ignored and STRIPPED, never thrown, never rendered.
 *         Cardinality/shape validation happens HERE (`readClusterFocusParam`:
 *         malformed, empty, or over-cap values decode to `null`). Membership
 *         validation against the CURRENTLY resolved node's visible members
 *         happens in `AreaDestinationMarkerLayer`'s existing
 *         `stillAllVisible` effect (AreaMarkerLayer.tsx) — unchanged by this
 *         issue, and already exercised by that component's own tests — which
 *         clears focus (`onClusterFocusChange(null)`) the instant any focused
 *         member is no longer among the current node's visible children, so
 *         a focus carried over from a DIFFERENT parent (e.g. a stale/forged
 *         URL) can never re-apply.
 *
 * ── WHY react-router's `useSearchParams` DIRECTLY, NOT the `UrlDomainCtx`
 *    facade pattern ──
 * Every other domain module (`viewport.ts`, `navigation.ts`, ...) is wired
 * into the shared `useDiscoverUrlState` facade (`src/hooks/
 * useDiscoverUrlState.ts`) and its `UrlDomainCtx` (shared `urlParams`/
 * `setUrlParams`/`liveUrlParamsRef`). That facade file is OUTSIDE this
 * issue's approved edit boundary (`src/pages/MapDiscovery.tsx` may only
 * receive "cluster-focus wiring", not a facade change). `clusterFocus` is
 * therefore a SELF-CONTAINED domain: `useClusterFocusUrlParam` below calls
 * `useSearchParams()` itself. This is safe and standard — react-router's
 * search params are a SINGLE source of truth (the URL); multiple
 * `useSearchParams()` call sites across the tree all read/write the same
 * underlying location, exactly the way `MapDiscovery.tsx` already calls
 * several independent hooks that each read the URL. `MapDiscovery.tsx`
 * consumes ONLY this module's exported hook — never react-router's
 * `useSearchParams` directly — so the param contract stays owned in one
 * place.
 *
 * `applyClusterFocusDelta`'s writes are SYNCHRONOUS (no `setTimeout`), so the
 * classic #2083 stale-`prev`-closure race (a DELAYED write reading a stale
 * `setUrlParams` identity) does not literally apply here the way it does to
 * `viewport.ts`'s 300ms-debounced flush. `useClusterFocusUrlParam` still
 * mirrors the `liveUrlParamsRef` DISCIPLINE (a ref kept current every render,
 * read instead of a functional `prev`) for two reasons: (1) it costs nothing
 * and keeps this module's write path indistinguishable in shape from every
 * other domain's, so a future contributor adding a debounce here inherits the
 * safe pattern by default rather than having to remember to add it; (2) even
 * a synchronous write via the functional-updater `prev` form is a second,
 * independent closure over `searchParams` that a linter/reviewer cannot
 * easily prove is never delayed — reading the ref removes that class of
 * question entirely.
 */
import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/** The URL param name. Never confused with `node` — see BR1/BR7 above. */
export const CLUSTER_FOCUS_PARAM = 'clusterFocus';

/**
 * Hard cap on cluster-focus membership. The dashed-cluster grouping is a
 * presentation-density affordance (design-spec AREA_MARKER_UX.md), never a
 * bulk-selection mechanism — a value this large can only be a
 * malformed/forged URL, never a real map-driven cluster (real clusters are
 * capped far lower by `areaClustering.ts`'s own grouping geometry). BR8:
 * exceeding this cap is treated as invalid and the WHOLE value is stripped
 * (never silently truncated to a partial, misleading subset).
 */
export const MAX_CLUSTER_FOCUS_KEYS = 64;

const DELIMITER = ',';

function encodeClusterFocusValue(areaKeys: readonly string[]): string {
  // Each areaKey is `encodeURIComponent`-escaped BEFORE joining, so a
  // pipe-delimited, space-containing real area_key (`IN|KA|Bengaluru|Locality
  // Name`) can never be confused with the `,` delimiter — `encodeURIComponent`
  // always escapes a literal comma to `%2C`, so a joined segment never
  // contains a raw `,` of its own.
  return areaKeys.map((key) => encodeURIComponent(key)).join(DELIMITER);
}

/**
 * BR8 ("never throws") — `decodeURIComponent` throws a `URIError` on a
 * malformed percent-encoding (a hand-edited/forged `clusterFocus=` value, or
 * URL corruption in transit). A single malformed segment invalidates the
 * WHOLE value here (returns `null`, mirroring `readClusterFocusParam`'s
 * other strip cases) rather than silently dropping just that one segment,
 * which could otherwise leave a member set that looks complete but silently
 * lost an entry.
 */
function decodeClusterFocusValue(raw: string): string[] | null {
  if (raw === '') return [];
  try {
    return raw.split(DELIMITER).map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
}

/**
 * Reads `clusterFocus` off a param set, applying BR8's shape/cardinality
 * validation. Returns `null` — NEVER `[]` — whenever there is no focus: an
 * absent param, an empty value, a value containing only empty segments, or a
 * value exceeding `MAX_CLUSTER_FOCUS_KEYS`. Representing "no focus" as `null`
 * ONLY (never the empty array) closes the classic `if (clusterFocus)` gap —
 * `[]` is truthy in JS, so a caller guarding on plain truthiness would
 * otherwise treat an empty-but-present param as "focused on nothing" instead
 * of "not focused" — this function makes that state unreachable rather than
 * relying on every caller to remember the `.length > 0` check.
 *
 * Membership validation against the currently-selected node (BR8's other
 * half) is NOT this function's job — see the module doc's BR8 entry for
 * where that already happens.
 */
export function readClusterFocusParam(urlParams: URLSearchParams): readonly string[] | null {
  const raw = urlParams.get(CLUSTER_FOCUS_PARAM);
  if (raw == null) return null;
  const decoded = decodeClusterFocusValue(raw);
  if (decoded == null) return null; // malformed percent-encoding — BR8, never throw
  const nonEmpty = decoded.filter((key) => key.length > 0);
  if (nonEmpty.length === 0) return null;
  if (nonEmpty.length > MAX_CLUSTER_FOCUS_KEYS) return null;
  return nonEmpty;
}

/**
 * THE ONE `clusterFocus=` delete point (BR5/BR6), mirroring
 * `navigation.ts`'s `clearNodeParam` exactly. Exported so `navigation.ts`'s
 * `applyNodeDelta` can route its own deletion through here (BR5) instead of
 * growing a second, independently-spelled `next.delete('clusterFocus')` that
 * could drift out of sync with this module's own param name constant.
 */
export function clearClusterFocusParam(next: URLSearchParams): URLSearchParams {
  next.delete(CLUSTER_FOCUS_PARAM);
  return next;
}

/**
 * Pure delta — mirrors `navigation.ts`'s `applyNodeDelta` shape. `null`,
 * `[]`, or an over-cap value all delete the param (never write a
 * degenerate/oversized one); a real, in-range member set is written encoded.
 */
export function applyClusterFocusDelta(
  currentParams: URLSearchParams,
  areaKeys: readonly string[] | null,
): URLSearchParams {
  const next = new URLSearchParams(currentParams);
  if (areaKeys == null || areaKeys.length === 0 || areaKeys.length > MAX_CLUSTER_FOCUS_KEYS) {
    return clearClusterFocusParam(next);
  }
  next.set(CLUSTER_FOCUS_PARAM, encodeClusterFocusValue(areaKeys));
  return next;
}

export interface UseClusterFocusUrlParamResult {
  /** `null` when no cluster is focused — never `[]` (see `readClusterFocusParam`'s doc). */
  clusterFocus: readonly string[] | null;
  /**
   * BR3 (select) / BR6 (clear via `null`) — ALWAYS a `{ replace: true }`
   * write, so this can never itself add a hierarchy-history entry.
   */
  setClusterFocus: (areaKeys: readonly string[] | null) => void;
}

/**
 * The clusterFocus domain's ONE public hook — see the module doc for why
 * this calls `useSearchParams()` directly rather than threading through the
 * shared `UrlDomainCtx` facade.
 */
export function useClusterFocusUrlParam(): UseClusterFocusUrlParamResult {
  const [searchParams, setSearchParams] = useSearchParams();

  // liveParamsRef discipline — see the module doc's rationale. Updated
  // synchronously in the render body (never inside an effect), so it is
  // current by the time `setClusterFocus` is invoked from any handler
  // scheduled during or after this render.
  const liveParamsRef = useRef(searchParams);
  liveParamsRef.current = searchParams;

  const clusterFocus = useMemo(() => readClusterFocusParam(searchParams), [searchParams]);

  const setClusterFocus = useCallback(
    (areaKeys: readonly string[] | null) => {
      const next = applyClusterFocusDelta(liveParamsRef.current, areaKeys);
      setSearchParams(next, { replace: true });
    },
    [setSearchParams],
  );

  return { clusterFocus, setClusterFocus };
}
