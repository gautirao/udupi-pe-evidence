import { MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDiscoverActions, useDiscoverNav } from '@/features/discover/context/useDiscoverContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { computeGroupBounds } from '@/utils/discoverGroupBounds';

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
 * Renders nothing unless the ACTIVE committed scope is VIEWPORT — AREA_SET
 * and POLYGON scopes have their own selection UX (#2017's chip strip /
 * boundary-draw affordances) and are not this component's concern.
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
}

export function ActiveScopeChip({ discoverAreas, publishCameraIntent }: ActiveScopeChipProps) {
  const { resultScope } = useDiscoverNav();
  const { commitResultScope } = useDiscoverActions();

  // `resultScope` is optional on DiscoverUrlState (see its doc comment:
  // "Consumers must treat an absent value the same as { active: null,
  // previous: null }") — partial state literals in tests/callers may omit
  // it entirely, so this reads defensively rather than assuming it's set.
  if (resultScope?.active?.kind !== 'VIEWPORT') return null;

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

  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm shadow-sm">
      <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span>Visible map area</span>
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
