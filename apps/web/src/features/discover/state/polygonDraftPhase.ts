/**
 * Polygon draft state machine — Issue #2419 (PR-1).
 *
 * #2419 requires the shopper to always be able to tell these apart:
 *
 *   NOT DRAWING · DRAWING A DRAFT · REVIEWING A COMPLETED DRAFT ·
 *   INVALID DRAFT — NEEDS REDRAW · USING A COMMITTED POLYGON RESULT SCOPE
 *
 * Before this issue the same information was smeared across two unrelated
 * booleans in `useDiscoverPageState` (`draftPolygon != null` and
 * `isReplaceScopeConfirmOpen`), which between them could not express "the
 * draft was rejected" at all, and could represent nonsense combinations such
 * as "confirmation open with no draft". This union makes every legal state
 * explicit and every illegal one unrepresentable — the same structural
 * argument #2016 used for `ResultScope` itself.
 *
 * WHY `COMMITTED` IS DERIVED, NEVER STORED. The committed POLYGON scope has
 * exactly ONE owner: the URL, via `state/url/resultScope.ts` (#2016). Storing
 * a local `COMMITTED` flag would create a second source of truth that could
 * disagree with the URL after a Back/Forward navigation or a refresh. So the
 * hook stores only the DRAFT half (IDLE / DRAWING / REVIEWING / INVALID) and
 * folds in `COMMITTED` at read time from `resultScope.active.kind`. There is
 * no setter that can produce `COMMITTED` — committing is `commitResultScope`,
 * and the phase follows.
 */
import type { PolygonRejection } from './polygonRejection';

/**
 * Why a completed draft was not committed.
 *
 * Three kinds, deliberately not collapsed. `policy` is #2420 saying the shape
 * itself is unacceptable, and the honest instruction is "redraw".
 * `unverified` is the app saying it could not obtain a verdict at all — the
 * shape may be perfectly fine, so telling the shopper to redraw it would be a
 * lie; `retryable` separates a transient failure from one only signing in can
 * resolve (PR review at head 9f061dcc; see validatePolygonScope.ts).
 * `signed_in_required` is decided locally, before any request is made.
 */
export type PolygonDraftBlock =
  | { kind: 'policy'; rejection: PolygonRejection }
  | { kind: 'unverified'; retryable: boolean }
  /**
   * The shopper is not signed in. Drawn-area search is a signed-in capability
   * in PR-1 (Main Agent ruling, owner informed): the anonymous results path is
   * `useDiscoverCityListings`, which calls
   * `/api/discover/cities/{city}/listings` and never sends `polygon`, so an
   * anonymous POLYGON commit would render a "Drawn area" chip over results
   * that were never scoped to the drawn area.
   *
   * Raised BEFORE any validation request, so an anonymous draw makes no
   * network call at all and writes nothing to the URL or history. That
   * ordering is the point: probing first would leak a request for a
   * capability the shopper cannot use, and the 401 it returned would be
   * reported as a transport failure rather than the real reason.
   */
  | { kind: 'signed_in_required' };

/** The draft half — the only part that is local component state. */
export type PolygonDraftState =
  /** Nothing drawn and no draft pending. */
  | { status: 'IDLE' }
  /**
   * The shopper is placing points. PR-1 defines this state and the
   * transitions into and out of it; the map-side chrome that actually enters
   * it lives in the map canvas and is wired by PR-2 (issue #2419 PR-2, after
   * #2426). Nothing in PR-1 can set it, which is why no PR-1 UI claims the
   * shopper is drawing.
   */
  | { status: 'DRAWING' }
  /**
   * A completed draft, not yet committed. `isValidating` is true while the
   * #2420 pre-commit probe is in flight; `awaitingReplaceConfirm` is true
   * once the probe cleared the draft AND a scope was already committed, so
   * J3.3's replace dialog owns the final word.
   */
  | {
      status: 'REVIEWING';
      polygon: [number, number][];
      isValidating: boolean;
      awaitingReplaceConfirm: boolean;
    }
  /**
   * The draft was NOT committed — either #2420 rejected it or the verdict
   * could not be obtained. Either way the previous committed scope, its URL
   * and its history are untouched.
   */
  | { status: 'INVALID'; polygon: [number, number][]; block: PolygonDraftBlock };

/** The full phase the UI reads — the draft half plus the derived committed state. */
export type PolygonDraftPhase = PolygonDraftState | { status: 'COMMITTED' };

export const IDLE_POLYGON_DRAFT: PolygonDraftState = { status: 'IDLE' };

/**
 * Folds the locally-owned draft state together with the URL-owned committed
 * scope into the single phase the UI renders from.
 *
 * A live draft always wins over `COMMITTED`: while a shopper is redrawing
 * over an already-committed polygon, the honest thing to show is the draft
 * they are working on, not the scope still producing the results behind it.
 * The committed scope itself is untouched throughout — only the label changes.
 */
export function resolvePolygonDraftPhase(
  draft: PolygonDraftState,
  hasCommittedPolygonScope: boolean,
): PolygonDraftPhase {
  if (draft.status !== 'IDLE') return draft;
  return hasCommittedPolygonScope ? { status: 'COMMITTED' } : draft;
}
