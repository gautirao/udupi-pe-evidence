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
  /** Registers (or, with `null`, clears) the live camera-action implementations. */
  registerAreaSetCameraActions: (actions: AreaSetCameraActions | null) => void;
}
