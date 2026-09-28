import React from 'react';
import { AreaSelectionPanel } from '@/components/discover/panels/AreaSelectionPanel';
import { AreaSelectedPanel } from '@/components/discover/panels/AreaSelectedPanel';
import { AreaSetDraftPanel } from '@/features/discover/components/AreaSetDraftPanel';
// Issue #2657 R2 — this file only needs the panelContent union; indexed off
// the authoritative type, never off DiscoverRightPanel's own props.
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type {
  RightPanelAreaView,
  RightPanelAreaCommands,
  SharedContextView,
  SharedAreaView,
  SharedChromeView,
  SharedCardsView,
  SharedRefreshView,
  SharedChromeCommands,
  SharedCardsCommands,
  SharedMarketCommands,
} from '@/features/discover/right-panel/contracts';

/** The 4 panelContent values this component owns (architect plan §2/§3 C6). */
export type AreaJourneyPanelContent = Extract<
  DiscoverPanelContent,
  'area-groups-landing' | 'area-group-results' | 'area-selection' | 'area-selected'
>;

export interface AreaJourneyPanelProps {
  panelContent: AreaJourneyPanelContent;
  view: RightPanelAreaView;
  commands: RightPanelAreaCommands;
  /** Narrow shared slices — never the whole `shared` object (issue #2657 DoD). */
  context: Pick<SharedContextView, 'city' | 'cityLabel' | 'journey' | 'intent' | 'isAuthenticated'>;
  /**
   * Resolved selected area. For 'area-selected', DiscoverRightPanel
   * guarantees this is non-null BEFORE delegating here — the Issue #1064 AC3
   * hydrating/not-found/guided-entry-fallback gate (and the C1
   * resolveAreaSelectedFallbackRoute selector it uses) stays in
   * DiscoverRightPanel unchanged; this component never renders that
   * fallback. Unused by the other 3 panelContent values.
   */
  area: Pick<SharedAreaView, 'point'>;
  chrome: Pick<SharedChromeView, 'activeContextChips'>;
  cards: Pick<SharedCardsView, 'selectedListingId' | 'hoveredListingId'>;
  refresh: Pick<SharedRefreshView, 'isFetching' | 'isInitialLoading'>;
  onStartOver: SharedChromeCommands['startOver'];
  onBack: SharedChromeCommands['back'];
  onSelectJourney: SharedChromeCommands['selectJourney'];
  onSelectResultListing: SharedCardsCommands['select'];
  onHoverResultListing: SharedCardsCommands['hover'];
  onCityChange: SharedMarketCommands['changeCity'];
  onIntentChange: SharedMarketCommands['changeIntent'];
}

/**
 * Issue #2657 C6 — owns every area-first panel-content state (moved verbatim
 * from DiscoverRightPanel's `renderPanel` switch), including the AREA_SET
 * draft in-panel view and the Issue #2596 COMMERCIAL CAPABILITY gate
 * (`isCommercialSubtypeSupported: true` — verified end-to-end in a browser on
 * this exact route BEFORE this move; see AreaSelectedPanel.tsx's own history
 * for the full incident this fixed).
 *
 * `view.results` / `commands.results.retry` / `view.selection.regionName`
 * arrive ALREADY COMPUTED (DiscoverRightPanel's slice builder calls the C1
 * `resolveAreaRegionName` / `resolveAreaSelectedResults` selectors — pure
 * functions, so where they are called has no behavioural effect; they stay
 * in DiscoverRightPanel alongside the raw viewport/polygon/area-group props
 * they read, which are NOT part of this component's narrow contract).
 *
 * Does NOT reuse #2660's `toAreaLeafScopeSource` — that mapper's viewport
 * variant has no error field, which would silently drop the auth-viewport
 * error this panel's `results.isError` depends on.
 */
export function AreaJourneyPanel({
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
  onCityChange,
  onIntentChange,
}: AreaJourneyPanelProps): React.ReactNode {
  switch (panelContent) {
    case 'area-groups-landing':
    case 'area-group-results':
    case 'area-selection':
      // Issue #1956 PR-6 (final cutover, Step 3) — AreaGroupsLandingPanel and
      // AreaGroupResultsPanel are deleted. Canonical Areas navigation
      // (DiscoverAreasJourneyPanel) mounts unconditionally for
      // journey==='area-first' upstream, before this component is ever
      // reached, so 'area-group-results' is unreachable here in the live
      // app. 'area-groups-landing' IS still reachable (journey-less groupId
      // inference). AreaSelectionPanel is the pre-existing area-first
      // placeholder panel reused here as the safe, non-blank destination.
      return <AreaSelectionPanel onStartOver={onStartOver} />;

    case 'area-selected': {
      // Issue #1064 AC3 — DiscoverRightPanel already guarded `!selectedArea`
      // (hydrating/not-found/guided-entry) before delegating here; this is a
      // defensive net only (R6 style), never reachable in the live app.
      if (!area.point) return null;
      const resolvedArea = area.point;
      // Issue #2017 / Issue #2596 (owner-directed selected-area workflow) — an
      // open AREA_SET draft renders IN-PANEL across all viewports (matching
      // the design mock's right-panel structure) instead of AreaSelectedPanel.
      if (view.selection.isDraftOpen) {
        return <AreaSetDraftPanel />;
      }
      const regionName = view.selection.regionName;
      return (
        <AreaSelectedPanel
          // Issue #2658 (C5) — the binding prop-modelling contract: view/commands,
          // not 40 flat props. Every value/expression below is carried over
          // VERBATIM from the flat call this replaces; only the grouping changed.
          view={{
            area: {
              point: resolvedArea,
              // Issue #1606 / Issue #1798 PR-B1 — area-first results redesign: breadcrumb + in-panel controls.
              cityLabel: context.cityLabel ?? context.city,
              regionName,
              groupName: view.selection.groupName,
              city: context.city,
              journey: context.journey,
            },
            results: {
              listings: view.results.listings,
              summaryText: view.results.summaryText,
              isLoading: view.results.isLoading,
              isFetching: refresh.isFetching,
              isInitialLoading: refresh.isInitialLoading,
              // Issue #2018 requirement A — a failed request renders the
              // explicit request-failure state, or keeps the last good cards
              // behind an inline retry banner, instead of the zero-result
              // recovery, which would assert "no matching listings" about a
              // query that never returned. See selectors/areaSelectedResults.ts.
              isError: view.results.isError,
              isViewportScope: view.results.isViewportScope,
            },
            filters: {
              filters: view.filters.filters,
              intent: context.intent,
              // Issue #2596 — COMMERCIAL CAPABILITY. This is the THIRD production
              // render site of AreaSelectedPanel, and the one the live selected-area
              // route actually uses. NOT A BLIND DEFAULT FLIP: the data path was
              // verified end-to-end in a browser on this exact route before enabling
              // it (see AreaSelectedPanel.tsx / DiscoverRightPanel's own history).
              isCommercialSubtypeSupported: true,
              // Issue #2596 — `content` is DELIBERATELY NOT PASSED HERE (see
              // DiscoverRightPanel's own pre-C6 comment for the full rationale:
              // mounting MapFilters here would create a second buyer filter owner).
              activeContextChips: chrome.activeContextChips,
            },
            search: { query: view.filters.searchQuery },
            listingCards: {
              isAuthenticated: context.isAuthenticated,
              selectedListingId: cards.selectedListingId,
              hoveredListingId: cards.hoveredListingId,
            },
            links: { trendsHref: view.filters.trendsHref },
          }}
          commands={{
            navigation: {
              onBack,
              onStartOver,
              onSelectJourney,
              onAddSchool: commands.navigation.addSchool,
              onCityChange,
              onIntentChange,
              onCrumbHome: onStartOver,
              onCrumbCity: commands.navigation.crumbCity,
              onCrumbRegion:
                regionName && commands.navigation.crumbRegion
                  ? () => commands.navigation.crumbRegion?.(regionName)
                  : undefined,
              onCrumbGroup: onBack,
            },
            filters: { change: commands.filters.change },
            search: { change: commands.filters.changeSearch },
            listings: {
              select: onSelectResultListing,
              hover: onHoverResultListing,
              retry: commands.results.retry,
            },
            scope: {},
          }}
        />
      );
    }

    default: {
      // Exhaustiveness net (R6, mirrors DiscoverRightPanel's own): forces
      // every AreaJourneyPanelContent member to be handled.
      const _exhaustive: never = panelContent;
      return _exhaustive;
    }
  }
}
