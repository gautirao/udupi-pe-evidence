import { MapPin, PenTool, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDiscoverActions, useDiscoverNav } from '@/features/discover/context/useDiscoverContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { computeGroupBounds } from '@/utils/discoverGroupBounds';
import { SCOPE_TITLE } from '@/features/discover/presentation/scopeTitles';

/**
 * Issue #2015 AC6 — active-scope chip + "Return to <Area>" for a committed
 * VIEWPORT result scope.
 *
 * Reads `resultScope` off useDiscoverNav() and calls commitResultScope via
 * useDiscoverActions() directly (matches the existing convention for other
 * nav-reading discover leaf components) — but the MUST-HAVE #3 fix (PR
 * review 5085561270) needs two pieces of data that live outside
 * DiscoverNavContextValue: the area-name/geometry lookup and the camera-fit
 * producer used everywhere else in the map half. Those are threaded in as
 * props from DiscoverMapCanvas: the camera-fit producer is the existing
 * `publishCameraIntent` prop, and the area lookup is `discoverAreas` — the
 * root-level all-areas list (`useDiscoverMapLayerController`'s
 * `discoverAreas` passthrough), NOT `overviewAreas`. `overviewAreas` is
 * derived from the CURRENT nav state and goes empty (`[]`) whenever
 * `urlState.areaKey` is set — which is exactly the case throughout this
 * VIEWPORT flow, since VIEWPORT layers on top of an already-selected
 * AREA_SET nav node. Resolving `previous.areaKeys` against `overviewAreas`
 * therefore always missed, silently falling back to the generic "Return to
 * previous area" label instead of "Return to Koramangala" (Issue #2015
 * MUST-HAVE #3 root cause). `discoverAreas` stays populated regardless of
 * nav state, so the lookup actually resolves.
 *
 * Renders nothing unless the ACTIVE committed scope is VIEWPORT or POLYGON.
 * AREA_SET has its own selection UX (#2017's chip strip) and is not this
 * component's concern.
 *
 * Issue #2419 (PR-1) — the POLYGON branch. Before this issue a committed
 * POLYGON had NO scope chip here at all; its only indicator was
 * `MapStatsBar`'s "Area search / Clear area" card, which was gated on
 * `isAuthenticated` and so left the state completely unlabelled for anonymous
 * shoppers. That card is retired (see MapStatsBar.tsx) and this chip is now
 * the single committed-POLYGON surface, matching the mock's own POLYGON
 * treatment (`ExpPanel.jsx` `EPResultHead`, `kind === 'POLYGON'`): the chip
 * names the scope "Drawn area" and offers the return action.
 *
 * PARITY NOTE (recorded on PR #2441): in the mock this scope bar is a PANEL
 * block, not a map overlay. PR-1 adds the POLYGON branch HERE because that
 * reuses the existing `previous`-restore logic and the already-threaded
 * `publishCameraIntent` without touching the map canvas (owned by another
 * lane). Placement parity with the mock's single panel scope bar is a
 * lane-wide question, deliberately not settled by this PR.
 *
 * There is deliberately NO "Redraw"/"Edit boundary" action here yet: nothing
 * in the app can currently enter draw mode programmatically (`DrawControl`
 * mounts `L.Control.Draw` with no external start handle), so a Redraw button
 * in PR-1 would be a control that does nothing. PR-2 wires draw-mode entry
 * and adds it. Note also that the mock's own "Edit boundary" label is
 * data-only — `ExpPanel.jsx` never renders it, and `Experience.jsx`'s
 * `drawArea` action is a REDRAW, not vertex editing.
 *
 * "Return to <Area>" restores `resultScope.previous` by committing it back
 * as the active scope AND re-fits the camera to that previous area (single
 * area: the matching AreaPoint; multiple areas: `computeGroupBounds` union
 * bbox, the same helper #2017 uses for multi-area AREA_SET camera fits).
 * Per AC7, the scope restore is a scope-boundary transition, so it
 * intentionally omits `{ history: 'replace' }` and keeps the default PUSH
 * behavior (undoable via the browser back button).
 */
interface ActiveScopeChipProps {
  /** Area key -> name/geometry lookup, used to interpolate the "Return to
   * <Area>" label and to resolve the AreaPoint(s) to camera-fit to. Must be
   * a nav-state-independent list (stays populated once an area is selected)
   * — see the component doc comment for why `overviewAreas` is unsuitable
   * here (Issue #2015 MUST-HAVE #3). */
  discoverAreas: AreaPoint[];
  /** The existing camera-fit producer (DiscoverMapCanvas's
   * `publishCameraIntent` prop), reused verbatim for the Return action. */
  publishCameraIntent: (area: AreaPoint) => void;
  /**
   * Issue #2419 (PR-2) — top offset (px) from the map container, from the
   * SAME measured stack #2426 built for `SearchThisAreaCta`
   * (`useSearchThisAreaCtaOffset`).
   *
   * PR-1 positioned this chip with hard-coded `top-14`/`top-24` because that
   * measured stack did not exist on its base. It does now, and leaving the
   * chip outside it was a real collision, not a tidiness point: the offset
   * measures the breadcrumb and the `AreaSetChips` wrapper, and that wrapper
   * collapses to zero height exactly when this chip is visible (POLYGON or
   * VIEWPORT committed means the AREA_SET draft is empty). A committed
   * POLYGON plus a dirty viewport therefore put the "Search this area" CTA
   * on top of this chip. Optional so fixtures that predate it keep compiling.
   */
  topOffsetPx?: number;
  /**
   * Issue #2419 (PR-2) — "Redraw", offered only for a committed POLYGON.
   * Absent hides the action, which is what leaves the VIEWPORT branch
   * unchanged.
   *
   * The mock labels this "Edit boundary" (`transitions-data.js:293`) but
   * never renders it in any JSX, and its own `Experience.jsx:264` action
   * fabricates a fresh shape rather than editing vertices — so Redraw is
   * behaviourally faithful and only the wording differs.
   */
  onRedraw?: () => void;
  /**
   * Issue #2419 (PR-2) — attached to the chip's own element so
   * `useSearchThisAreaCtaOffset` can measure its real height and place the
   * CTA below it. Measured rather than assumed a constant because the chip
   * grows a second line when its "Return to <long area names>" label wraps,
   * which is routine on the narrow viewport.
   */
  measureRef?: React.Ref<HTMLDivElement>;
}

/** Matches PR-1's `top-14`; used only until the first real measurement lands. */
const FALLBACK_TOP_OFFSET_PX = 56;

export function ActiveScopeChip({
  discoverAreas,
  publishCameraIntent,
  topOffsetPx,
  onRedraw,
  measureRef,
}: ActiveScopeChipProps) {
  const { resultScope } = useDiscoverNav();
  const { commitResultScope } = useDiscoverActions();

  // `resultScope` is optional on DiscoverUrlState (see its doc comment:
  // "Consumers must treat an absent value the same as { active: null,
  // previous: null }") — partial state literals in tests/callers may omit
  // it entirely, so this reads defensively rather than assuming it's set.
  const activeKind = resultScope?.active?.kind;
  if (activeKind !== 'VIEWPORT' && activeKind !== 'POLYGON') return null;

  const { previous } = resultScope;

  const previousAreas =
    previous?.kind === 'AREA_SET'
      ? previous.areaKeys
          .map((key) => discoverAreas.find((area) => area.areaKey === key))
          .filter((area): area is AreaPoint => area != null)
      : [];

  const returnLabel = previous
    ? previous.kind === 'AREA_SET'
      ? previousAreas.length === 1
        ? `Return to ${previousAreas[0].areaLabel}`
        : previousAreas.length > 1
          ? `Return to ${previousAreas.map((area) => area.areaLabel).join(', ')}`
          : 'Return to previous area'
      : previous.kind === 'POLYGON'
        ? 'Return to previous search area'
        : 'Return to previous area'
    : null;

  const handleReturn = () => {
    commitResultScope(previous);

    if (previous?.kind === 'AREA_SET') {
      const cameraTarget =
        previousAreas.length === 1 ? previousAreas[0] : computeGroupBounds(previousAreas);
      if (cameraTarget) {
        publishCameraIntent(cameraTarget);
      }
    }
  };

  const isPolygon = activeKind === 'POLYGON';
  const ScopeIcon = isPolygon ? PenTool : MapPin;

  return (
    // Issue #2419 (PR-1) — positioning added here after real-browser evidence
    // at 1366x768 showed the chip rendering IN NORMAL FLOW inside the map
    // container, where it landed underneath DiscoverMapContextOverlay's
    // top-left city chip and was partially unreadable. (Pre-existing for the
    // VIEWPORT branch, but VIEWPORT is rarely reachable, so it went unseen;
    // a committed POLYGON makes it routine.) The canvas that composes these
    // overlays belongs to another lane, so the fix lives here.
    //
    // Issue #2419 (PR-2) — the hard-coded `top-14`/`top-24` is replaced by
    // the MEASURED offset #2426 introduced for SearchThisAreaCta. PR-1's
    // reasoning ("AreaSetChips renders null whenever this chip shows, so the
    // row is free") was right about AreaSetChips and wrong about the CTA:
    // that same collapse-to-zero is why the measured offset stopped
    // reserving this row, so the CTA could land on top of this chip.
    <div
      ref={measureRef}
      className="absolute left-4 z-[999] inline-flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm shadow-sm"
      style={{ top: topOffsetPx ?? FALLBACK_TOP_OFFSET_PX }}
      data-testid={isPolygon ? 'active-scope-chip-polygon' : 'active-scope-chip-viewport'}
    >
      <ScopeIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span>{SCOPE_TITLE[activeKind]}</span>
      {isPolygon && onRedraw && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRedraw}
          className="h-auto gap-1 px-1.5 py-0.5 text-xs"
          data-testid="active-scope-chip-redraw"
        >
          <PenTool className="h-3 w-3" aria-hidden="true" />
          Redraw
        </Button>
      )}
      {returnLabel && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReturn}
          className="h-auto gap-1 px-1.5 py-0.5 text-xs"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          {returnLabel}
        </Button>
      )}
    </div>
  );
}
