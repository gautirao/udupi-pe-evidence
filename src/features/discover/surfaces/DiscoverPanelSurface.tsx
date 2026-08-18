import { AreaFirstJourneyPanel } from './panel/AreaFirstJourneyPanel';
import { SchoolFirstJourneyPanel } from './panel/SchoolFirstJourneyPanel';
import { LegacyRightPanelBridge } from './panel/LegacyRightPanelBridge';
import { AreaGroupFocusPanel } from './panel/AreaGroupFocusPanel';
import { resolveIsSelectedGroupState } from '@/features/discover/selectors/displayEligibility';
import type { DiscoverPanelSurfaceView, DiscoverPanelSurfaceCommands } from './buildPanelSurfaceModel';

/**
 * Issue #2142 SOLID follow-up (commit 2) — the Discover right panel's ROUTER,
 * and nothing else.
 *
 * WHAT THIS FILE USED TO BE. A ~720-line component holding three inlined
 * renderers (two of them carrying a byte-identical shell + JourneySwitcher
 * block), a ~90-prop legacy panel drill, and `handleSelectJourney` — a product
 * rule that resolved a legacy `areaKey` to a canonical node via a react-query
 * mutation and raised a toast on failure. That last one also forced this
 * surface to value-import `useDiscoverAreaNavigationPath` and `use-toast`,
 * which is a layering violation: a surface renders, it does not decide.
 *
 * WHERE EACH PIECE WENT.
 *   - `handleSelectJourney` -> `controllers/useDiscoverJourneySwitchController.ts`,
 *     reaching this file as the `commands.navigation.selectJourney` command.
 *   - The two journey branches -> `panel/AreaFirstJourneyPanel.tsx` and
 *     `panel/SchoolFirstJourneyPanel.tsx`, sharing `panel/DiscoverJourneyPanelShell.tsx`.
 *   - The legacy branch -> `panel/LegacyRightPanelBridge.tsx`.
 *   - The two journey predicates it recomputed off `useDiscoverNav()`
 *     (`journey === 'area-first'`, and the school-first node-level test) ->
 *     `useDiscoverNavigationController`, which already owned the composite
 *     `showAreasNavigationJourney` built from exactly these two.
 *
 * Every moved line — JSX, class strings, inline closures, doc comments — moved
 * VERBATIM. This is a reorganisation, not a rewrite: no product behaviour, URL
 * write, or rendered markup changes.
 *
 * The branch order below is load-bearing and unchanged: the group-focus state
 * (Issue #2213) pre-empts area-first, which pre-empts everything else, then
 * the school-first node level, then the legacy panel. Exactly one panel is
 * ever mounted (see `discoverPanelState.ts` for why the canonical branches
 * deliberately pre-empt the legacy `panelContent` switch rather than
 * extending its union).
 *
 * Issue #2213 — the group-focus branch. `resolveIsSelectedGroupState` is the
 * SAME pure predicate `useDiscoverJourneyChromeController` already computes
 * for the map's group-overview chrome signal (`isSelectedGroupState`):
 * `resolvedPanelContent === 'area-groups-landing' && !!focusedGroup &&
 * !selectedArea`. Before this fix, `isAreaFirstJourneyActive` (true whenever
 * `nav.journey === 'area-first'`, including the #2088 virtual default applied
 * to a bare `?groupId=<group>` URL with no literal `journey=`) always won
 * first, mounting the group-BLIND canonical `AreaFirstJourneyPanel`
 * (city-root Direction cards) while the map's marker fetch
 * (`groupAreaKeysForMapData`) had already narrowed to the group's member
 * areas — a real map/panel scope split (#2204 Flow 4). Placing this check
 * FIRST makes the panel consume the SAME group scope the map already does,
 * for every state that resolves to it, whether `journey=area-first` is
 * virtual-defaulted or literally present in the URL.
 */
export interface DiscoverPanelSurfaceProps {
  view: DiscoverPanelSurfaceView;
  commands: DiscoverPanelSurfaceCommands;
}

export function DiscoverPanelSurface({ view, commands }: DiscoverPanelSurfaceProps) {
  const { isAreaFirstJourneyActive, isSchoolsNavNodeLevel, resolvedPanelContent } = view.navigation;
  const { focusedGroup, selectedArea } = view.geography;

  if (resolveIsSelectedGroupState(resolvedPanelContent, focusedGroup, selectedArea)) {
    return (
      <AreaGroupFocusPanel
        group={focusedGroup!}
        discoverAreas={view.geography.discoverAreasForPanel}
        onSelectArea={commands.geography.selectGroupMemberArea}
        isResolvingArea={view.geography.isResolvingGroupMemberArea}
        onBack={() => commands.pageContext.actions.enterAreasJourney(null)}
      />
    );
  }

  if (isAreaFirstJourneyActive) {
    return <AreaFirstJourneyPanel view={view} commands={commands} />;
  }

  if (isSchoolsNavNodeLevel) {
    return <SchoolFirstJourneyPanel view={view} commands={commands} />;
  }

  return <LegacyRightPanelBridge view={view} commands={commands} />;
}
