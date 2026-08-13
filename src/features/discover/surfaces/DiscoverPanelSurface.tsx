import { AreaFirstJourneyPanel } from './panel/AreaFirstJourneyPanel';
import { SchoolFirstJourneyPanel } from './panel/SchoolFirstJourneyPanel';
import { LegacyRightPanelBridge } from './panel/LegacyRightPanelBridge';
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
 * The branch order below is load-bearing and unchanged: area-first pre-empts
 * everything, then the school-first node level, then the legacy panel. Exactly
 * one panel is ever mounted (see `discoverPanelState.ts` for why the canonical
 * branches deliberately pre-empt the legacy `panelContent` switch rather than
 * extending its union).
 */
export interface DiscoverPanelSurfaceProps {
  view: DiscoverPanelSurfaceView;
  commands: DiscoverPanelSurfaceCommands;
}

export function DiscoverPanelSurface({ view, commands }: DiscoverPanelSurfaceProps) {
  const { isAreaFirstJourneyActive, isSchoolsNavNodeLevel } = view.navigation;

  if (isAreaFirstJourneyActive) {
    return <AreaFirstJourneyPanel view={view} commands={commands} />;
  }

  if (isSchoolsNavNodeLevel) {
    return <SchoolFirstJourneyPanel view={view} commands={commands} />;
  }

  return <LegacyRightPanelBridge view={view} commands={commands} />;
}
