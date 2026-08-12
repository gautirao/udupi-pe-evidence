import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

/**
 * Issue #2083 cycle 4 (code-review BLOCKING fix, 4th recurrence of this bug
 * class) — the area-first selected-GROUP drill-down guard. Moved from
 * MapDiscovery.tsx (issue #2142) unchanged — see
 * MapDiscovery.issue2083.selectedGroupState.test.ts for the original
 * regression proof, now import-path-repointed here.
 *
 * Must be gated on `effectiveSelectedArea` (the node+legacy bridge from
 * `resolveEffectiveSelectedArea`), never the bare legacy value. A pure
 * canonical node journey (`?journey=area-first&groupId=<group>&node=<AREA
 * leaf in that group>`, no legacy areaKey) reaches
 * `resolvedPanelContent === 'area-groups-landing'` with `focusedGroup`
 * truthy AND an area resolved via `nodeAreaPoint` — gating on the bare
 * legacy value would wrongly report "no area selected yet" and surface
 * group-overview map chrome for a user who has already drilled into a
 * specific area.
 */
export function resolveIsSelectedGroupState(
  resolvedPanelContent: DiscoverPanelContent,
  focusedGroup: AreaGroup | null | undefined,
  effectiveSelectedArea: AreaPoint | null | undefined,
): boolean {
  return resolvedPanelContent === 'area-groups-landing' && !!focusedGroup && !effectiveSelectedArea;
}
