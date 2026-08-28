/**
 * Navigation URL domain — Issue #1956 PR 1 (FE-1) read side, PR 2 write side,
 * PR 6 final cutover.
 *
 * Owns the `node` param that carries the canonical Areas hierarchy cursor
 * (AC1.4). PR 6 removed the `areasPreview` deployment-preview opt-in flag —
 * the canonical Areas journey is now the default for `journey==='area-first'`
 * with no URL opt-in required.
 *
 * The 8th capability domain, wired into the useDiscoverUrlState facade alongside
 * viewport/city/filters/school/area/agricultural/compatibility. See
 * useDiscoverUrlState.ts's module doc for the full param contract.
 *
 * ── WHAT CHANGED IN PR 2 ──
 * PR 1 shipped this domain deliberately READ-ONLY (`actions: {}`) because nothing
 * navigated yet. PR 2 adds the WRITE layer — and only the write layer; no UI
 * consumes it in this pass. The writers are:
 *   • `goToNode`          — drill into a child node (PUSH)
 *   • `goToAncestorNode`  — jump to an ancestry crumb, incl. the city root (PUSH)
 *   • `clearNode`         — leave the hierarchy cursor entirely (PUSH)
 *   • `enterAreasJourney` — ATOMIC journey+node entry (ONE PUSH, see below)
 *   • `buildNodeHref`     — pure data, writes nothing (see the differential test)
 *
 * ── ONE `setUrlParams` CALL PER DOMAIN ACTION (the double-push rule) ──
 * `setUrlParams` is react-router's `setSearchParams`, which NAVIGATES on each
 * invocation. Two invocations in one handler are two history entries in one tick,
 * and the second's functional `prev` may not observe the first. Two real bugs of
 * exactly this shape were already found in this area (the salvage worktree's
 * "D-2 sibling sweep", and a breadcrumb crumb that pushed twice so the user had
 * to press Back TWICE to undo one click).
 *
 * Therefore every action below performs EXACTLY ONE `setUrlParams` call, or ZERO
 * for a genuine no-op — never two. That specifically forces `enterAreasJourney`
 * to exist: entering the journey means writing `journey` AND `node`, and doing it
 * by calling `area.ts`'s `setJourney` (itself a PUSH — area.ts:133) followed by a
 * node write would be two pushes in one tick. The invocation COUNT for every
 * action is pinned by `__tests__/navigationCommandMatrix.test.ts`.
 *
 * ── THE FRONTEND NEVER CONSTRUCTS NODE KEYS ──
 * The formulae happen to be `"a:" + area_key`, `"d:" + slug(region_key)` and
 * `"c:" + slug + ":" + slug` (backend `NavigationKeys.java`), and hardcoding any
 * of them client-side is the exact antipattern that produced the
 * `macroRegionResolver` problem. Node keys originate ONLY from the server. The
 * shape validator below RECOGNISES those prefixes; it never MINTS a key, and
 * `buildNodeHref` only ever consumes a key it was handed. PR 1's static sweep
 * enforces the distinction.
 */
import { useCallback } from 'react';
import type { UrlDomainCtx, UrlDomainModule } from './_shared';
import type { DiscoverUrlActions, DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { clearClusterFocusParam } from './clusterFocus';
import { PARAM_DEST_KEY, PARAM_LOCALITY } from './agricultural';

type NavigationState = Pick<DiscoverUrlState, 'node' | 'rawNodeParam' | 'nodeListings'>;
type NavigationActions = Pick<
  DiscoverUrlActions,
  | 'goToNode'
  | 'goToNodeReplacingCurrent'
  | 'goToAncestorNode'
  | 'clearNode'
  | 'enterAreasJourney'
  | 'enterSchoolsJourney'
  | 'enterSchoolsJourneyAtArea'
  | 'buildNodeHref'
  | 'enterNodeListings'
  | 'clearNodeListings'
  | 'goToNodeAndClearSchoolSelection'
  | 'goToNodeAndClearAgriculturalLocality'
>;

/**
 * Mirrors the backend's `MAX_RESOLVE_NODE_PARAM_BYTES`
 * (`NavigationController.java`, #1956 R10) — a `node=` value over this many UTF-8
 * BYTES is a guaranteed 400 from the resolve endpoint, so it is never written and
 * never read as a valid key. This is UX/link-injection hardening against an
 * unrecoverable URL, not an auth gate: `node=` values originate from the server's
 * own responses.
 *
 * `.length` counts UTF-16 code units, NOT bytes — a multi-byte string (a Kannada
 * or Devanagari place name, which real `area_key`s legitimately contain) can be
 * short in `.length` and long in UTF-8, so byte length is measured explicitly.
 */
export const MAX_NODE_KEY_BYTES = 256;

/**
 * A UTF-16 `.length` above this can never fit in `MAX_NODE_KEY_BYTES` bytes
 * (UTF-8 encodes every code unit as AT LEAST one byte), so this short-circuits
 * the real byte measurement without ever under-counting. The Discover facade
 * re-renders on every debounced viewport commit and filter keystroke; this hot
 * path must not allocate a `TextEncoder`/`Blob` on every render for the
 * overwhelmingly common case of a key nowhere near the cap.
 */
const MAX_POSSIBLE_NODE_KEY_LENGTH = MAX_NODE_KEY_BYTES;

const UTF8_ENCODER = new TextEncoder();

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).length;
}

/**
 * SHAPE allowlist for a `node=` value, applied inside `isWritableNodeKey` so both
 * the write path and any caller pre-validating a server-supplied key inherit it.
 *
 * ── THE PREFIXES, VERIFIED AGAINST THE SERVER, NOT ASSUMED ──
 * The authority is `backend/.../navigation/NavigationKeys.java` plus
 * `NavigationController.java:57-59`, read on this branch:
 *   • `root`  — `NavigationController.ROOT_NODE_KEY`, the synthetic city top level
 *   • `a:`    — `NavigationKeys.areaNodeKey`      = `"a:" + area_key`
 *   • `c:`    — `NavigationKeys.clusterNodeKeyBase` = `"c:" + slug + ":" + slug`
 *   • `d:`    — `NavigationKeys.directionNodeKey` = `"d:" + slug(region_key)`
 *
 * `d:` IS LOAD-BEARING AND WAS THE SALVAGE'S BUG. The salvage worktree's regex
 * was `/^(?:root|[ac]:...)$/` — it predates #1956 D1, which introduced the
 * DIRECTION level. Live Bangalore's tree is `City → DIRECTION (d:central, d:n,
 * d:e, d:s, d:w) → AREA`, so under the salvaged regex EVERY Direction key is
 * "malformed", `writeNode` SILENTLY DELETES the param, and a Direction-first
 * journey cannot navigate at all. Salvaging that regex verbatim would have broken
 * the entire feature in a way no type error would catch.
 *
 * ── WHY THE BODY IS PERMISSIVE ──
 * Only the prefix is asserted, plus "no control characters" and "no `..`
 * traversal". Deliberately NOT the tighter `[^\s]{1,250}` shape, for two reasons
 * verified against real data rather than assumed:
 *   1. `[^\s]` would REJECT real AREA keys. `area_key` is pipe-delimited and
 *      embeds real place names WITH SPACES and MIXED CASE — V106 seeds
 *      `IN|KA|Bengaluru|Electronic City`. Banning whitespace would make every
 *      multi-word area unreachable: a navigation-breaking over-tightening.
 *   2. A `{1,250}` bound would introduce a SECOND, disagreeing length authority
 *      (250 UTF-16 code units vs 256 UTF-8 bytes), so a legitimate 256-byte key
 *      could pass the byte cap and fail the shape. Length stays owned solely by
 *      `MAX_NODE_KEY_BYTES`.
 * For the same reason no character denylist beyond control characters is applied:
 * place names legitimately contain punctuation (`St John's Road`,
 * `Kumara Park (West)`), and guessing at DB content trades a latent hazard for a
 * real navigation outage.
 *
 * This is a LATENT-hazard guard, not a live vulnerability fix: no current sink
 * treats the value as structure (it is `encodeURIComponent`-encoded into every
 * request, `buildNodeHrefFromParams` unconditionally `?`-prefixes its output, and
 * labels come from the server's `displayLabel` and are JSX-escaped). It rejects
 * `javascript:alert(1)` and `<img onerror=...>` (no prefix) and `c:../../x` (`..`).
 */
// eslint-disable-next-line no-control-regex -- excluding C0/C1 control characters IS the point
const NODE_KEY_PREFIXED_SHAPE = /^(?:root|[acd]:[^\u0000-\u001f\u007f]+)$/;

function hasNodeKeyShape(value: string): boolean {
  return NODE_KEY_PREFIXED_SHAPE.test(value) && !value.includes('..');
}

/**
 * True when `value` is safe to write/send as a `node=` value: non-blank, correctly
 * prefixed, and within the byte cap.
 *
 * EXPORTED so a caller that receives a SERVER-SUPPLIED nodeKey (e.g. from a
 * `navigation-path` response) can pre-validate it against the SAME predicate the
 * writers apply, instead of discovering the rejection as a silent `node=` DELETE:
 * without that, a blank or oversized `nodeKey` makes the writer strip `node=` and
 * still PUSH — no throw, so no fallback fires, and the user lands silently on the
 * legacy flat landing with their navigation apparently working and going nowhere.
 */
export function isWritableNodeKey(value: string | null | undefined): value is string {
  if (value == null || value === '') {
    return false;
  }
  if (value.length > MAX_POSSIBLE_NODE_KEY_LENGTH) {
    // `.length` alone already exceeds the byte cap (each UTF-16 code unit is >= 1
    // UTF-8 byte) — skip the encode, this is guaranteed oversized.
    return false;
  }
  // Shape BEFORE the byte measurement: a malformed value is rejected without
  // paying for the encode, and the cheap size short-circuit above still runs first.
  if (!hasNodeKeyShape(value)) {
    return false;
  }
  return utf8ByteLength(value) <= MAX_NODE_KEY_BYTES;
}

/**
 * Reads the `node` param as a VALIDATED hierarchy identity — null when absent,
 * empty (`?node=` round-trips to `''`), whitespace-only, malformed, or oversized.
 *
 * The `?.trim()` discipline is the SAME one the existing panel-state branches
 * apply to `groupId`. A whitespace-only value is truthy as a string, so without
 * the trim a stray `?node=%20%20` would read as the literal `'   '` and any later
 * `if (node)` check would treat it as a real hierarchy identity.
 */
function readNodeParam(urlParams: URLSearchParams): string | null {
  const trimmed = urlParams.get('node')?.trim();
  return isWritableNodeKey(trimmed) ? trimmed : null;
}

/**
 * The RAW trimmed `node` param, independent of `isWritableNodeKey`'s shape/size
 * gate. THIS EXPORT IS NOT OPTIONAL — it must land with the validation or not at
 * all, and here is why.
 *
 * `readNodeParam` above now reads a malformed-shape or oversized value as `null`,
 * so it is never treated as a valid hierarchy identity for navigation or hrefs.
 * But that same `null` is what a mount gate reads to decide whether to route into
 * the canonical Areas journey at all. Left unaddressed, a malformed `node=` (one
 * that will never match any real node, but is not itself a link-injection concern)
 * becomes INDISTINGUISHABLE from "no `node=` at all", so the gate falls straight
 * through to the legacy flat landing SILENTLY — no hierarchy-unavailable notice,
 * no resolution notice. Adding shape validation WITHOUT this read creates that
 * hole; that is exactly the trade the salvage documented.
 *
 * The backend's resolve ladder is explicitly designed to absorb a malformed or
 * unknown `requested` key (EXACT → ANCESTOR → CITY_ROOT — see
 * `NavigationResolution` in navigation/types.ts), so a consumer can mount on the
 * RAW value and let the server classify it into a graceful fallback or a genuine
 * error, rather than showing the silent legacy landing.
 *
 * READ-ONLY: this changes nothing about what any writer ever puts in the URL.
 */
function readRawTrimmedNodeParam(urlParams: URLSearchParams): string | null {
  const trimmed = urlParams.get('node')?.trim();
  return trimmed ? trimmed : null;
}

/**
 * THE ONE `node=` DELETE POINT for a SECONDARY clear — a clear that is incidental
 * to some other navigation rather than a node navigation in its own right.
 *
 * Exported so that when later passes make city/journey switches drop the cursor,
 * they route through here instead of each growing a bare `next.delete('node')`
 * that no sweep can see. SCOPE, stated precisely rather than overclaimed: this
 * owns the `node` delete ONLY. It deliberately does NOT also strip
 * `lat`/`lon`/`zoom`/`listing` the way the node writers do, because at those call
 * sites those params are governed by their own established, separately-tested
 * contracts (a journey switch deliberately PRESERVES the viewport; a city change
 * deliberately preserves `listing`). The stale-debounced-viewport race is handled
 * at those sites by `cancelPendingViewportCommit` instead, which is the part that
 * is genuinely a race defence rather than a param-semantics choice.
 */
export function clearNodeParam(next: URLSearchParams): URLSearchParams {
  next.delete('node');
  return next;
}

/**
 * The race half of the node writers' defence, extracted so secondary clears can
 * perform it too.
 *
 * The viewport debounce is armed in `viewport.ts` and commits 300 ms later with
 * `replace: true`. An in-flight timer landing AFTER a node write re-adds stale
 * `lat`/`lon`/`zoom` — silently teleporting the map back to where the user was
 * before they navigated. `area.ts`'s `deselectArea` documents the same race.
 *
 * Idempotent and safe to call when no timer is armed.
 */
export function cancelPendingViewportCommit(timers: UrlDomainCtx['timers']): void {
  if (timers.viewport.current) {
    clearTimeout(timers.viewport.current);
    timers.viewport.current = null;
  }
}

/**
 * Applies the node writers' EXACT param delta to a copy of `currentParams`.
 *
 * The single shared definition of "what a node navigation does to the URL", so
 * the click affordance (`goToNode`) and the copy-link/middle-click affordance
 * (`buildNodeHref`) cannot drift apart. A differential test in
 * `__tests__/navigationCommandMatrix.test.ts` asserts the two produce
 * byte-identical query strings from the same starting params.
 *
 * A non-writable `nextNodeKey` DELETES the param rather than ever writing
 * `node=` (empty) or a value the resolve endpoint would guaranteed-400 on.
 *
 * `lat`/`lon`/`zoom` go because the new node owns the camera — carrying the old
 * node's viewport into a new level shows the wrong place. `listing` goes because
 * a peek panel pinned to the previous context must not survive a level change.
 *
 * Issue #2088 (commit 4) — `clusterFocus` ALSO goes, via `clearClusterFocusParam`
 * (state/url/clusterFocus.ts), satisfying D2_binding_requirements.BR5 ("cluster
 * focus is cleared whenever the stable node changes") for EVERY node write —
 * `goToNode`, `goToAncestorNode`, `clearNode`, `enterAreasJourney`, and
 * `buildNodeHref`'s pure href — through this ONE shared delta function, rather
 * than one call site remembering to clear it and another silently not.
 * `clusterFocus` is never a hierarchy node key and never read here as one
 * (BR1/BR7) — this is purely a delete, mirroring `lat`/`lon`/`zoom`/`listing`
 * above.
 */
function applyNodeDelta(currentParams: URLSearchParams, nextNodeKey: string | null): URLSearchParams {
  const next = new URLSearchParams(currentParams);
  if (isWritableNodeKey(nextNodeKey)) {
    next.set('node', nextNodeKey);
  } else {
    clearNodeParam(next);
  }
  next.delete('lat');
  next.delete('lon');
  next.delete('zoom');
  next.delete('listing');
  next.delete('nodeListings');
  clearClusterFocusParam(next);
  return next;
}

/**
 * PURE DATA href builder — exported so it can be unit-tested directly against the
 * exact param delta the writers produce, with no hook or component harness.
 *
 * Given the CURRENT full param set and a candidate `nextNodeKey`, returns the
 * query string a middle-click / cmd-click / "copy link address" on that
 * destination should resolve to — or `null` when `nextNodeKey` is not writable
 * (render no href rather than a link the resolve endpoint would 400 on).
 *
 * Shares `applyNodeDelta` with the writers, which is what makes the differential
 * assertion structural rather than a coincidence maintained by hand.
 */
export function buildNodeHrefFromParams(
  currentParams: URLSearchParams,
  nextNodeKey: string,
): string | null {
  if (!isWritableNodeKey(nextNodeKey)) {
    return null;
  }
  return `?${applyNodeDelta(currentParams, nextNodeKey).toString()}`;
}

export function useNavigationUrlDomain(
  ctx: UrlDomainCtx,
): UrlDomainModule<NavigationState, NavigationActions> {
  const { urlParams, setUrlParams, timers } = ctx;

  const node = readNodeParam(urlParams);
  const rawNodeParam = readRawTrimmedNodeParam(urlParams);
  const nodeListings = urlParams.get('nodeListings') === '1' ? true : undefined;

  /**
   * The shared write path for goToNode / goToAncestorNode / clearNode.
   *
   * EXACTLY ONE `setUrlParams` call, or zero on the no-op path. Never two.
   *
   * NO-OP GUARD: a navigation call for the node ALREADY ACTIVE (a stale double
   * invocation, or a caller re-issuing the same intent) must not burn a second
   * history PUSH — re-pushing an identical `node=` is indistinguishable from
   * history's perspective from a genuine second navigation, and the user would
   * have to press Back twice to undo one click. `node` is the CURRENT resolved
   * param, read once per render above, so this compares against what is actually
   * in the URL right now rather than a stale closure value.
   *
   * `cancelPendingViewportCommit` is HOISTED ABOVE the guard and therefore fires
   * even on the no-op path. That ordering is deliberate and load-bearing: a
   * viewport debounce armed a moment earlier (the user panned, then re-clicked
   * the node they were already on) must never be allowed to land after a
   * navigation call. The guard scopes to skipping ONLY the URL write, never the
   * race defence.
   */
  const writeNode = useCallback(
    (nextNodeKey: string | null, historyMode: 'push' | 'replace') => {
      cancelPendingViewportCommit(timers);
      if (nextNodeKey === node) {
        return;
      }
      setUrlParams(
        (prev) => applyNodeDelta(prev, nextNodeKey),
        { replace: historyMode === 'replace' },
      );
    },
    [setUrlParams, timers, node],
  );

  /** Drill into a direct child node (guided navigation). PUSH. */
  const goToNode = useCallback((nodeKey: string) => writeNode(nodeKey, 'push'), [writeNode]);

  /**
   * Issue #1943 (singleton auto-advance) — see this action's own doc on
   * `DiscoverUrlActions.goToNodeReplacingCurrent`. Same delta as `goToNode`,
   * REPLACE instead of PUSH.
   */
  const goToNodeReplacingCurrent = useCallback(
    (nodeKey: string) => writeNode(nodeKey, 'replace'),
    [writeNode],
  );

  /**
   * Jump to an ancestry crumb — including `'root'`, the synthetic city top level,
   * which is a REAL writable key (`NavigationController.ROOT_NODE_KEY`) and so
   * writes `node=root` rather than clearing the param. Same write shape as
   * `goToNode`, kept as a distinct named action so a breadcrumb click has a
   * semantically distinct call site even though today's URL delta is identical.
   */
  const goToAncestorNode = useCallback((nodeKey: string) => writeNode(nodeKey, 'push'), [writeNode]);

  /** Leave the hierarchy cursor entirely — deletes `node=`. PUSH. */
  const clearNode = useCallback(() => writeNode(null, 'push'), [writeNode]);

  /**
   * Issue #2203 (Option A') — School-first "pick a new Area from the shared
   * control-bar search" seam. Drills into the resolved child node (the
   * IDENTICAL `node=` URL delta `goToNode` writes — same `applyNodeDelta`)
   * AND clears the geography-dependent `schoolId` leaf selection, in the
   * SAME `setUrlParams` call — never a second, separate write/history entry.
   *
   * `journey` is NEVER touched here — unlike `enterAreasJourney`, this never
   * converts the active journey to `area-first`; the caller stays in
   * school-first the whole time. Mirrors `enterSchoolsJourney`'s existing
   * `next.delete('schoolId')` (that atomic journey-entry writer already
   * drops schoolId when (re-)entering school-first) — this is the same
   * clear, applied to an in-journey Area re-pick instead of journey entry.
   *
   * Only `schoolId` is deleted, not `radiusKm` — matching `enterSchoolsJourney`'s
   * own precedent (it clears schoolId only, not radiusKm) rather than
   * inventing a second clear-shape for the same leaf concept.
   *
   * Same no-op guard as `writeNode`: re-selecting the Area the node cursor is
   * already on burns zero history entries.
   *
   * Review follow-up (PR #2211, reviewer-bot @ 07c92a3b) — ALSO clears the
   * legacy `areaKey` param in this SAME write, mirroring `enterAreasJourney`'s
   * `next.delete('areaKey')`: a stale `areaKey` left over from a prior
   * area-first visit must disappear in the IDENTICAL transition that writes
   * the new canonical `node=`, never a second, separate clear. `groupId` is
   * deliberately NOT touched here — that's #2201's separate canonical
   * identity, out of scope for this leaf-selection seam.
   */
  const goToNodeAndClearSchoolSelection = useCallback(
    (nodeKey: string) => {
      cancelPendingViewportCommit(timers);
      if (nodeKey === node) {
        return;
      }
      setUrlParams(
        (prev) => {
          const next = applyNodeDelta(prev, nodeKey);
          next.delete('schoolId');
          next.delete('areaKey');
          return next;
        },
        { replace: false }, // PUSH — a genuine Area re-pick is a deliberate destination
      );
    },
    [setUrlParams, timers, node],
  );

  /**
   * Issue #2203 (Option A') — Agri-first "pick a new Area from the shared
   * control-bar search" seam. Same shape as
   * `goToNodeAndClearSchoolSelection` above, for the agri-first
   * geography-dependent leaf: the destKey-based `selectedLocality`
   * (agricultural.ts's `PARAM_DEST_KEY` plus its two legacy aliases,
   * `PARAM_LOCALITY` and `town` — mirrors `clearLocality`'s own delete set so
   * this can never leave a stale legacy alias behind). `journey` is never
   * touched. `selectedRegion`/`selectedMaxKm` (the corridor + radius
   * filters) are deliberately NOT cleared — they remain meaningful across
   * an Area change within the same corridor, unlike the destKey leaf.
   *
   * Review follow-up (PR #2211, reviewer-bot @ 07c92a3b) — ALSO clears the
   * legacy `areaKey` param in this SAME write, mirroring `enterAreasJourney`'s
   * `next.delete('areaKey')`: a stale `areaKey` left over from a prior
   * area-first visit must disappear in the IDENTICAL transition that writes
   * the new canonical `node=`, never a second, separate clear. `groupId` is
   * deliberately NOT touched here — that's #2201's separate canonical
   * identity, out of scope for this leaf-selection seam.
   */
  const goToNodeAndClearAgriculturalLocality = useCallback(
    (nodeKey: string) => {
      cancelPendingViewportCommit(timers);
      if (nodeKey === node) {
        return;
      }
      setUrlParams(
        (prev) => {
          const next = applyNodeDelta(prev, nodeKey);
          next.delete(PARAM_DEST_KEY);
          next.delete(PARAM_LOCALITY);
          next.delete('town');
          next.delete('areaKey');
          return next;
        },
        { replace: false }, // PUSH — a genuine Area re-pick is a deliberate destination
      );
    },
    [setUrlParams, timers, node],
  );

  /**
   * ATOMIC journey entry — sets `journey=area-first` AND `node=` in ONE
   * `setUrlParams` call, therefore ONE history entry.
   *
   * This action exists precisely so no caller has to compose `setJourney` (a PUSH
   * — area.ts:133) with a node write. That composition is TWO synchronous
   * navigations in one tick: two history entries for one user click, plus the
   * second updater's `prev` may not observe the first. Callers entering the
   * canonical Areas journey MUST use this rather than the pair.
   *
   * A non-writable `nodeKey` still enters the journey (journey is set) but leaves
   * the cursor absent, matching `applyNodeDelta`'s never-write-a-bad-key rule.
   *
   * Issue #1956 PR 6 rework ([rulings.oq_a_v2]) — ALSO clears the legacy
   * `groupId`/`areaKey` params in this SAME write. The canonical Areas
   * journey never reads those params, and the one production caller (the
   * JourneySwitcher conversion seam, `DiscoverRightPanelContainer.tsx`'s
   * `handleSelectJourney`) requires the legacy context to disappear in the
   * IDENTICAL transition that enters the resolved node — never a second,
   * separate clear.
   */
  const enterAreasJourney = useCallback(
    (nodeKey: string | null) => {
      cancelPendingViewportCommit(timers);
      setUrlParams(
        (prev) => {
          const next = applyNodeDelta(prev, nodeKey);
          next.set('journey', 'area-first');
          next.delete('groupId');
          next.delete('areaKey');
          return next;
        },
        { replace: false }, // PUSH — entering a journey is a deliberate destination
      );
    },
    [setUrlParams, timers],
  );

  const enterSchoolsJourney = useCallback(
    (nodeKey: string | null) => {
      cancelPendingViewportCommit(timers);
      setUrlParams(
        (prev) => {
          const next = applyNodeDelta(prev, nodeKey);
          next.set('journey', 'school-first');
          next.delete('groupId');
          next.delete('areaKey');
          next.delete('schoolId');
          return next;
        },
        { replace: false }, // PUSH — entering a journey is a deliberate destination
      );
    },
    [setUrlParams, timers],
  );

  const enterSchoolsJourneyAtArea = useCallback(
    (areaKey: string) => {
      cancelPendingViewportCommit(timers);
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('node');
          next.set('journey', 'school-first');
          next.set('areaKey', areaKey);
          next.delete('groupId');
          next.delete('schoolId');
          return next;
        },
        { replace: false }, // PUSH
      );
    },
    [setUrlParams, timers],
  );

  /**
   * Pure data, no navigation and no mutation. Delegates to
   * `buildNodeHrefFromParams` against the CURRENT `urlParams` (a dep, so it is
   * re-created whenever the params change) — a stale closure can never serve a
   * stale delta.
   */
  const buildNodeHref = useCallback(
    (nextNodeKey: string) => buildNodeHrefFromParams(urlParams, nextNodeKey),
    [urlParams],
  );

  const enterNodeListings = useCallback(() => {
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('nodeListings', '1');
        return next;
      },
      { replace: false }, // PUSH
    );
  }, [setUrlParams]);

  const clearNodeListings = useCallback(() => {
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('nodeListings');
        return next;
      },
      { replace: true }, // REPLACE
    );
  }, [setUrlParams]);

  return {
    state: { node, rawNodeParam, nodeListings },
    actions: {
      goToNode,
      goToNodeReplacingCurrent,
      goToAncestorNode,
      clearNode,
      enterAreasJourney,
      enterSchoolsJourney,
      enterSchoolsJourneyAtArea,
      buildNodeHref,
      enterNodeListings,
      clearNodeListings,
      goToNodeAndClearSchoolSelection,
      goToNodeAndClearAgriculturalLocality,
    },
  };
}
