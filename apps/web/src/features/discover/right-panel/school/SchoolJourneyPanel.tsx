import React from 'react';
import {
  SchoolBrowsePanel,
  SchoolsInAreaPanel,
  SchoolSelectedPanel,
  AreaSchoolCombinedPanel,
} from '@/components/discover/panels/SchoolJourneyPanels';
import { SchoolGroupAreasPanel } from '@/components/discover/panels/SchoolGroupAreasPanel';
// Issue #2657 R2 — this file only needs the panelContent union; indexed off
// the authoritative type, never off DiscoverRightPanel's own props.
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type {
  RightPanelSchoolView,
  RightPanelSchoolCommands,
  SharedContextView,
  SharedAreaView,
  SharedChromeView,
  SharedCardsView,
  SharedRefreshView,
  SharedChromeCommands,
  SharedCardsCommands,
} from '@/features/discover/right-panel/contracts';

/** The 5 panelContent values this component owns (architect plan §2/§3 C5). */
export type SchoolJourneyPanelContent = Extract<
  DiscoverPanelContent,
  'school-browse' | 'school-group-areas' | 'schools-in-area' | 'school-selected' | 'area-school-combined'
>;

export interface SchoolJourneyPanelProps {
  panelContent: SchoolJourneyPanelContent;
  view: RightPanelSchoolView;
  commands: RightPanelSchoolCommands;
  /** Narrow shared slices — never the whole `shared` object (issue #2657 DoD). */
  context: Pick<SharedContextView, 'city' | 'cityLabel' | 'journey' | 'intent' | 'isAuthenticated'>;
  /**
   * Resolved selected area. For 'schools-in-area', DiscoverRightPanel
   * guarantees this is non-null BEFORE delegating here — the Issue #1064 AC3
   * hydrating/not-found/guided-entry-fallback gate stays in DiscoverRightPanel
   * unchanged (this component never renders that fallback; see the C5 report).
   * 'area-school-combined' tolerates null (matches the pre-existing live wire).
   */
  area: Pick<SharedAreaView, 'point'>;
  chrome: Pick<SharedChromeView, 'activeContextChips' | 'filtersContent'>;
  cards: Pick<SharedCardsView, 'selectedListingId' | 'hoveredListingId'>;
  // Issue #1793 PR-C — the optional settled/hasMore pair feeds the "Request a property" card gate.
  refresh: Pick<SharedRefreshView, 'isFetching' | 'schoolRadiusSettled' | 'schoolRadiusHasMore'>;
  onStartOver: SharedChromeCommands['startOver'];
  onBack: SharedChromeCommands['back'];
  onSelectJourney: SharedChromeCommands['selectJourney'];
  onSelectResultListing: SharedCardsCommands['select'];
  onHoverResultListing: SharedCardsCommands['hover'];
  /**
   * Issue #2762 PR-B — the desktop-reskin signal for the shared compact FilterBar (per locked
   * OQ1, desktop only), forwarded straight through to SchoolSelectedPanel/AreaSchoolCombinedPanel.
   * Plain data threaded from RightPanelFrameLayoutView.hostsHeaderControls (DiscoverRightPanel's
   * own `view.frame.layout.hostsHeaderControls`) — never a hook call in this file. Default `false`
   * preserves every existing caller/test's behaviour unchanged.
   */
  isDesktop?: boolean;
}

/**
 * Issue #2657 C5 — owns every school-first / area-first school panel-content
 * state (moved verbatim from DiscoverRightPanel's `renderPanel` switch). The
 * 4 leaf panels (#2661/#2742) are reused unchanged, with their own
 * `{view, commands}` contracts.
 *
 * G9 quirk: `commands.schoolsInArea.select` is journey-gated by the CALLER
 * (DiscoverRightPanel's slice builder), never here — this component only
 * forwards whatever it is handed.
 * G10 quirk: the invalid/loading-group fallback for 'school-group-areas'
 * renders SchoolBrowsePanel WITHOUT `selectJourney` (only `startOver`).
 * G11 quirk: `boundedSearch` stays `undefined` (never a `{trigger: undefined}`
 * wrapper) when `commands.selected.boundedSearch` is absent.
 */
export function SchoolJourneyPanel({
  panelContent,
  view,
  commands,
  context,
  area,
  chrome,
  cards,
  refresh,
  onStartOver,
  onBack,
  onSelectJourney,
  onSelectResultListing,
  onHoverResultListing,
  isDesktop = false,
}: SchoolJourneyPanelProps): React.ReactNode {
  switch (panelContent) {
    case 'school-browse':
      return (
        <SchoolBrowsePanel
          view={{
            chrome: { journey: context.journey },
            city: { slug: context.city ?? '', label: context.cityLabel },
            scope: { key: view.scope.key, summaryRegions: view.scope.summaryRegions },
            zones: { groups: view.zones.groups, loading: view.zones.loading, discoverAreas: view.zones.discoverAreas },
          }}
          commands={{
            chrome: { startOver: onStartOver, selectJourney: onSelectJourney },
            scope: { clear: commands.zones.clearScope },
            navigation: {
              selectGroup: commands.zones.selectGroup,
              selectAreaKey: commands.zones.selectAreaKey ?? (() => undefined),
            },
          }}
        />
      );

    case 'school-group-areas': {
      // Issue #1485 — Level 2: selected group's areas.
      // groupId is guaranteed non-blank by derivePanelContent (trim guard).
      const resolvedGroup = view.zones.groups?.find((g) => g.id === view.zones.groupId);
      if (!resolvedGroup) {
        // Either still loading or invalid groupId — show loading skeletons when
        // view.zones.loading, otherwise gracefully degrade to school-browse.
        if (view.zones.loading) {
          return (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="px-4 pt-4 pb-2 space-y-3" data-testid="school-group-areas-loading-fallback">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border border-border p-4">
                    <div className="h-4 w-2/3 bg-muted animate-pulse rounded mb-2" />
                    <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
                  </div>
                ))}
              </div>
            </div>
          );
        }
        // Invalid/stale groupId — AC8 safe fallback: render school-browse.
        // G10 — no onSelectJourney here (matches the pre-existing quirk).
        return (
          <SchoolBrowsePanel
            view={{
              chrome: { journey: context.journey },
              city: { slug: context.city ?? '', label: context.cityLabel },
              scope: { key: view.scope.key, summaryRegions: view.scope.summaryRegions },
              zones: {
                groups: view.zones.groups,
                loading: view.zones.loading,
                discoverAreas: view.zones.discoverAreas,
              },
            }}
            commands={{
              chrome: { startOver: onStartOver },
              scope: { clear: commands.zones.clearScope },
              navigation: {
                selectGroup: commands.zones.selectGroup,
                selectAreaKey: commands.zones.selectAreaKey ?? (() => undefined),
              },
            }}
          />
        );
      }
      return (
        <SchoolGroupAreasPanel
          group={resolvedGroup}
          discoverAreas={view.zones.discoverAreas ?? []}
          isLoading={view.zones.loading ?? false}
          // Issue #1864 — use the journey-transition hook's schoolFirstOnBack
          // command (threaded in as `onBack`), not the shared onClearGroup prop.
          onBack={onBack ?? (() => undefined)}
          onSelectAreaKey={commands.zones.selectAreaKey ?? (() => undefined)}
          onStartOver={onStartOver}
          journey={context.journey}
          cityLabel={context.cityLabel ?? context.city}
        />
      );
    }

    case 'schools-in-area': {
      // Issue #1064 AC3 — DiscoverRightPanel already guarded `!selectedArea`
      // (hydrating/not-found/guided-entry) before delegating here; this is a
      // defensive net only (R6 style), never reachable in the live app.
      if (!area.point) return null;
      return (
        <SchoolsInAreaPanel
          view={{
            chrome: { journey: context.journey, activeContextChips: chrome.activeContextChips },
            viewer: { intent: context.intent, isAuthenticated: context.isAuthenticated },
            area: area.point,
            // Issue #1198 — thread the schools-in-area query's error/retry/fetching
            // signals so the (already-built) #1144 error state + #1170 retry feedback
            // are live in prop-owned mode, not only standalone.
            schools: view.schoolsInArea,
            homes: {
              data: view.homes.data,
              loading: view.homes.loading,
              // Card↔marker shared state for the school-first homes grid (parity with
              // AreaSelectedPanel). Hover highlights the matching home-marker; a home-marker
              // click drives selectedListingId → copper card frame + scroll-into-view.
              fetching: refresh.isFetching,
              selectedId: cards.selectedListingId,
            },
          }}
          commands={{
            chrome: { startOver: onStartOver, back: onBack },
            schools: {
              retry: commands.schoolsInArea.retry,
              // Journey gate (Issue #1157) is applied by the caller's slice
              // builder (G9) — this component only forwards it.
              select: commands.schoolsInArea.select,
            },
            homes: { select: onSelectResultListing, hover: onHoverResultListing },
          }}
        />
      );
    }

    case 'school-selected':
      return (
        <SchoolSelectedPanel
          isDesktop={isDesktop}
          view={{
            chrome: {
              journey: context.journey,
              activeContextChips: chrome.activeContextChips,
              filtersContent: chrome.filtersContent,
            },
            viewer: { intent: context.intent, isAuthenticated: context.isAuthenticated },
            school: view.selected.school ?? null,
            radius: { km: view.selected.radiusKm ?? null },
            listings: {
              data: view.selected.listings ?? [],
              loading: view.selected.listingsLoading ?? false,
              // Issue #1793 SR-024 — school-radius request failure (error block instead of empty state).
              error: view.selected.listingsError ?? false,
              fetching: refresh.isFetching,
              // Issue #1793 PR-C — the card source's OWN settled signal (not `fetching`) + page-cap flag.
              settled: refresh.schoolRadiusSettled,
              hasMore: refresh.schoolRadiusHasMore,
              selectedId: cards.selectedListingId,
            },
            propertyFilters: { value: view.propertyFilters.value },
            boundedSearch: { triggered: view.selected.boundedSearchTriggered },
          }}
          commands={{
            chrome: { startOver: onStartOver, back: onBack },
            radius: { change: commands.selected.changeRadius ?? (() => undefined) },
            listings: {
              select: onSelectResultListing,
              hover: onHoverResultListing,
              retry: commands.selected.retryListings,
            },
            propertyFilters: { replace: commands.propertyFilters.replace },
            // G11 — stays undefined (never `{trigger: undefined}`) when absent.
            boundedSearch: commands.selected.boundedSearch
              ? { trigger: commands.selected.boundedSearch }
              : undefined,
          }}
        />
      );

    case 'area-school-combined':
      return (
        <AreaSchoolCombinedPanel
          isDesktop={isDesktop}
          view={{
            chrome: {
              journey: context.journey,
              activeContextChips: chrome.activeContextChips,
              filtersContent: chrome.filtersContent,
            },
            viewer: { intent: context.intent, isAuthenticated: context.isAuthenticated },
            area: area.point ?? null,
            school: view.selected.school ?? null,
            radius: { km: view.selected.radiusKm ?? null },
            listings: {
              data: view.selected.listings ?? [],
              loading: view.selected.listingsLoading ?? false,
              // Issue #1793 SR-024 — school-radius request failure (error block instead of empty state).
              error: view.selected.listingsError ?? false,
              fetching: refresh.isFetching,
              // Issue #1793 PR-C — the card source's OWN settled signal (not `fetching`) + page-cap flag.
              settled: refresh.schoolRadiusSettled,
              hasMore: refresh.schoolRadiusHasMore,
              selectedId: cards.selectedListingId,
            },
            propertyFilters: { value: view.propertyFilters.value },
          }}
          commands={{
            chrome: { startOver: onStartOver, back: onBack },
            radius: { change: commands.selected.changeRadius ?? (() => undefined) },
            listings: {
              select: onSelectResultListing,
              hover: onHoverResultListing,
              retry: commands.selected.retryListings,
            },
            propertyFilters: { replace: commands.propertyFilters.replace },
            school: { clear: commands.selected.clearSchool ?? (() => undefined) },
          }}
        />
      );

    default: {
      // Exhaustiveness net (R6, mirrors DiscoverRightPanel's own): forces
      // every SchoolJourneyPanelContent member to be handled.
      const _exhaustive: never = panelContent;
      return _exhaustive;
    }
  }
}
