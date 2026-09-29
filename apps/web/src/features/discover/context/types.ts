import type { DiscoverUrlActions, DiscoverUrlState, DiscoverViewport } from '@/hooks/useDiscoverUrlState';

/**
 * DiscoverNavContext value — every canonical URL-derived field EXCEPT the
 * high-frequency `viewport`, which lives in its own context (see
 * DiscoverContext.tsx for the re-render-storm rationale). Using `Omit` over
 * urlState (rather than hand-picking a subset of keys) guarantees every
 * field consumers may need in a future prop-migration is present — nothing
 * is silently missing because it wasn't top-of-mind when this file was
 * written.
 */
export type DiscoverNavContextValue = Omit<DiscoverUrlState, 'viewport'>;

/**
 * Wrapped in an object (rather than exporting `DiscoverViewport | null`
 * directly) so the "no provider above me" case (missing context, a bug) can
 * be distinguished from the legitimate "provider present, no viewport in the
 * URL yet" case (`{ viewport: null }`).
 */
export interface DiscoverViewportContextValue {
  viewport: DiscoverViewport | null;
}

/** The full DiscoverUrlActions surface, exposed with a stable identity that never changes. */
export type DiscoverActionsContextValue = DiscoverUrlActions;

export type MobileView = 'LIST' | 'MAP';

/**
 * Issue #2017 (Fit all / focus-one) — the live, camera-only actions for a
 * committed AREA_SET, registered by whichever controller owns map data
 * (useDiscoverMapDataController — the same place that already
 * auto-publishes the union camera intent on commit; see that effect's doc).
 * Presentation only: neither action may mutate `rareas` / the committed
 * result scope.
 */
export interface AreaSetCameraActions {
  /** Republishes the union camera framing for the currently committed AREA_SET areaKeys. */
  fitAreaSet: () => void;
  /** Frames the camera on ONE committed area's own bounds, leaving the committed result scope untouched. */
  focusAreaSetMember: (areaKey: string) => void;
  /**
   * Issue #2419 (PR-2) — "Draw search area". Registered here for the same
   * reason the two camera actions above are: the panel owns the button, the
   * page/map side owns the action, and this ref indirection is this file's
   * established answer to that split rather than threading a handler down
   * through every panel layer.
   *
   * Unlike its siblings this one is NOT camera-only — it enters draw mode.
   * It still commits nothing: a scope is only written after the shopper
   * finishes a shape AND it passes #2420 validation.
   */
  startDrawSearchArea: () => void;
}

/**
 * Issue #2480 — a one-shot "restore camera to this single committed AREA_SET
 * area" request. Bound to the `areaKey` it was issued for so a consumer can
 * detect (and drop) a request whose committed scope has since changed out
 * from under it (e.g. browser Back after the Return-PUSH per #2015 AC7, or
 * an immediate second `selectArea()`/Return).
 *
 * `bounds`/`center` are RESOLVED AT ISSUE TIME (by `AreaSelectedPanel`, from
 * its own already-loaded `previousAreas` geometry) rather than recomputed
 * later against whatever `discoverAreasData` happens to be current when the
 * consuming effect runs. This closes a deferred #2017 no-double-fire hole:
 * a request left pending because areas hadn't loaded yet used to be retried
 * on every later `discoverAreasData` identity change, including one caused
 * by an unrelated intervening commit that happened to land on the same
 * `areaKey` — producing a second, spurious camera snap after that flow's
 * own (correct) camera intent had already published. Resolving the target
 * up front means the request is always immediately actionable: the
 * consumer clears it unconditionally on every run, so it can never survive
 * to collide with a later unrelated commit.
 */
export interface AreaSetCameraRestoreRequest {
  areaKey: string;
  bounds: [[number, number], [number, number]] | null;
  center: [number, number];
}

export interface DiscoverShellContextValue {
  mobileView: MobileView;
  setMobileView: (view: MobileView) => void;
  /** True at <=820px — see the inclusive-boundary note on the useMediaQuery call site. */
  isMobileShell: boolean;
  /**
   * Issue #2017 — level-triggered, persistent "is the AREA_SET draft
   * open" state, shared across BOTH the map-surface tree (mobile's
   * `AreaSetChips` popover) and the right-panel tree (desktop's in-panel
   * `AreaSetDraftPanel`, owner-directed rework replacing the earlier
   * floating-popover-on-desktop approximation) — no context other than
   * `DiscoverShellContext` spans both trees, which is why this lives here
   * (the same reason `setMobileView` does).
   *
   * DELIBERATELY a level (boolean), not an edge (a one-shot request the
   * consumer must explicitly "consume"/clear) — on mobile, `AreaSetChips`
   * mounts lazily (Suspense) only AFTER `setMobileView('MAP')` reveals the
   * map surface, i.e. strictly AFTER `openAreaSetDraft()` was called. A
   * mount-time edge/ref-diff swallows that ordering; a level the consumer
   * checks on every render (including its very first) does not — whichever
   * order mount vs. open happens in, the consumer's next render sees `true`
   * and shows the draft UI. The same level also directly answers "should
   * DiscoverRightPanel render AreaSetDraftPanel instead of
   * AreaSelectedPanel" on desktop, with no separate open/close bookkeeping
   * needed there.
   */
  isAreaSetDraftOpen: boolean;
  /** Sets `isAreaSetDraftOpen` true. */
  openAreaSetDraft: () => void;
  /** Sets `isAreaSetDraftOpen` false. */
  closeAreaSetDraft: () => void;
  /**
   * Issue #2017 (Fit all / focus-one) — stable delegates that always call
   * through to whatever `AreaSetCameraActions` is currently registered (see
   * `registerAreaSetCameraActions` below). A safe no-op before
   * `useDiscoverMapDataController` mounts and registers, mirroring this
   * file's existing `stableActions`/`actionsRef` indirection in
   * DiscoverContext.tsx.
   */
  fitAreaSet: () => void;
  focusAreaSetMember: (areaKey: string) => void;
  /**
   * Issue #2419 (PR-2) — enters draw mode. Safe no-op until the map data
   * controller registers, exactly like its siblings above.
   */
  startDrawSearchArea: () => void;
  /** Registers (or, with `null`, clears) the live camera-action implementations. */
  registerAreaSetCameraActions: (actions: AreaSetCameraActions | null) => void;
  /**
   * Issue #2480 — the "Return to previous scope" fix for the single-area
   * (N=1) AREA_SET case. `AreaSelectedPanel`'s `handleReturnToPreviousScope`
   * cannot safely call `focusAreaSetMember`/`fitAreaSet` above synchronously
   * right after `commitResultScope(previous)`: those stable delegates call
   * through to whatever `AreaSetCameraActions` was registered as of the
   * LAST render before the commit, i.e. they still close over the PRE-commit
   * `resultScope` — so a synchronous call reads the old scope and silently
   * no-ops. Calling them is explicitly wrong here for that reason.
   *
   * Instead, Return records a one-shot request here, and a POST-COMMIT
   * effect in `useDiscoverMapDataController` (which only re-runs once the
   * committed scope has actually changed) consumes it and publishes the
   * camera intent directly.
   *
   * DELIBERATELY an EDGE (one-shot, explicitly consumed/cleared via
   * `setAreaSetCameraRestoreRequest(null)`), NOT a level like
   * `isAreaSetDraftOpen` above. `isAreaSetDraftOpen` must be a level because
   * its mobile consumer (`AreaSetChips`) mounts lazily, AFTER the level is
   * already set — an edge would be missed by that late mount. That race does
   * not exist here: `useDiscoverMapDataController` (the sole consumer of
   * this request) is already mounted before Return is ever clickable. Using
   * a level here would instead cause the camera to re-fire on every
   * subsequent scope change, not just the one Return issued it for — the
   * `areaKey` binding plus one-shot consumption is what prevents that.
   */
  getAreaSetCameraRestoreRequest: () => AreaSetCameraRestoreRequest | null;
  /** Sets (or, with `null`, clears) the pending restore request above. */
  setAreaSetCameraRestoreRequest: (request: AreaSetCameraRestoreRequest | null) => void;
  /**
   * Issue #2729 (R1 fix) — the EXACT scope-name string the Results heading is currently
   * rendering ("Properties in {this}", or the joined AREA_SET names), broadcast by
   * `AreaSelectedPanel` (the single production writer) so the global area search
   * (`DiscoverControlBar`) can show the SAME value when idle instead of independently
   * re-deriving it from a possibly-stale URL param (the bug: `node=` can move — e.g. picking a
   * new area from the global search — while the committed `rscope`/`rareas` result-scope payload
   * stays behind, a PRE-EXISTING divergence this field does not fix, only stops the search field
   * from contradicting the title about it). `null` whenever no AreaSelectedPanel is mounted
   * (school-first/agri-first/journey-less/landing), matching the pre-existing "no canonical value
   * there" behaviour for those journeys.
   *
   * DELIBERATELY a level (like `isAreaSetDraftOpen` above), not an edge — the header and the
   * panel can mount/remount independently across navigations, so a level the consumer reads on
   * every render (rather than a one-shot event) is what keeps the two from ever going stale
   * relative to each other.
   */
  canonicalScopeLabel: string | null;
  /** Sets (or, with `null`, clears) the label above. `AreaSelectedPanel` is the only writer. */
  setCanonicalScopeLabel: (label: string | null) => void;
}
