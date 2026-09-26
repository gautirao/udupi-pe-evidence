import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type { DiscoverBadgeResult } from '@/features/discover/presentation/discoverBadge';

/**
 * Issue #2724 (Finding 1, pass 3 code review) — the SAME visibility rule the
 * drill-down pill's own render gate uses (see DiscoverMapCountBadge's JSX
 * condition just above the pill's `<div>`), extracted so DiscoverMapCanvas's
 * `isDesktopBadgePaired` can call this instead of re-deriving (and, as
 * flagged in code review, silently drifting from) the pill's real gates.
 * `journey` is typed `string | null` rather than `DiscoverJourney | null` so
 * both callers — DiscoverMapCountBadge's own `journey: DiscoverJourney | null`
 * prop and buildMapSurfaceModel.tsx's plain `navJourney: string` local — can
 * pass their value directly with no cast.
 *
 * Pass 3 lint hygiene: moved out of DiscoverMapCountBadge.tsx (a component
 * file) into this sibling non-component module, so exporting these pure
 * predicates no longer trips react-refresh/only-export-components.
 */
export interface DrillDownCountBadgeVisibilityParams {
  discoverBadge: DiscoverBadgeResult;
  resolvedPanelContent: DiscoverPanelContent;
  isAreaFirstCityLanding: boolean;
  journey: string | null;
  hideDrillDownBadge?: boolean;
}

export function isDrillDownCountBadgeVisible({
  discoverBadge,
  resolvedPanelContent,
  isAreaFirstCityLanding,
  journey,
  hideDrillDownBadge = false,
}: DrillDownCountBadgeVisibilityParams): boolean {
  return (
    !hideDrillDownBadge &&
    resolvedPanelContent !== 'guided-entry' &&
    !isAreaFirstCityLanding &&
    journey !== 'agri-first' &&
    discoverBadge.visible &&
    (discoverBadge.count != null || discoverBadge.state === 'stale')
  );
}

/**
 * Issue #2724 (Finding 1) — companion to `isDrillDownCountBadgeVisible` for
 * the public-landing summary pill's render gate. Same rationale for the
 * widened `journey` type.
 */
export interface LandingCountBadgeVisibilityParams {
  resolvedPanelContent: DiscoverPanelContent;
  isAreaFirstCityLanding: boolean;
  journey: string | null;
  cityTotal: number;
}

export function isLandingCountBadgeVisible({
  resolvedPanelContent,
  isAreaFirstCityLanding,
  journey,
  cityTotal,
}: LandingCountBadgeVisibilityParams): boolean {
  return (
    (resolvedPanelContent === 'guided-entry' || isAreaFirstCityLanding) &&
    journey !== 'agri-first' &&
    cityTotal > 0
  );
}
