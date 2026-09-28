import React from 'react';
// Issue #1531 — additive PANEL_OPEN telemetry wiring (fire-and-forget; no existing behaviour changed).
import { useDiscoverTelemetry } from '@/hooks/useDiscoverTelemetry';
import { useMountEffect } from '@/hooks/useMountEffect';
// Issue #2657 C2b — buildAreaNameIndex moved with CorridorLandingPanel.
// formatMemberAreaSummary was ALREADY unused here before C2 (pre-existing,
// out of this commit's scope — left untouched).
import { formatMemberAreaSummary } from '@/utils/areaNameSummary';
import { resolveRightPanelRoute } from '@/features/discover/selectors/rightPanelRoute';
import type { RightPanelView, RightPanelCommands } from '@/features/discover/right-panel/contracts';

import { RightPanelFrame } from '@/features/discover/right-panel/frame/RightPanelFrame';
// Issue #2657 C7 — every guided-entry panelContent state, moved verbatim.
import { GuidedEntryJourneyPanel } from '@/features/discover/right-panel/entry/GuidedEntryJourneyPanel';
import { AreaHydrating, AreaNotFound } from '@/features/discover/right-panel/shared/AreaHydrationStates';
// Issue #2657 C4 — every agri-first panelContent state, moved verbatim.
import { AgriJourneyPanel } from '@/features/discover/right-panel/agri/AgriJourneyPanel';
// Issue #2657 C5 — every school-first / area-first school panelContent state, moved verbatim.
import { SchoolJourneyPanel } from '@/features/discover/right-panel/school/SchoolJourneyPanel';
// Issue #2657 C6 — every area-first panelContent state, moved verbatim.
import { AreaJourneyPanel } from '@/features/discover/right-panel/area/AreaJourneyPanel';

// Issue #2657 R2 (code-review Finding 2 fix) — the PRE-C8 flat prop surface
// (`LegacyFlatRightPanelProps`) that used to live here has MOVED to
// `right-panel/testing/flatPropsRightPanel.ts`, the only legitimate consumer
// of the flat shape (the ~12 `DiscoverRightPanel.*.test.tsx` suites still
// rendering pre-C8 fixtures). `contracts.ts` and the journey-panel files now
// index their types off `DiscoverPanelSurfaceView`/`Commands`
// (surfaces/buildPanelSurfaceModel.ts) and `DiscoverPanelContent`
// (@/utils/discoverPanelState) directly — never off this component's props.

/**
 * Issue #2657 C8 — the flipped public contract (architect plan §2/§3 C8).
 * `DiscoverRightPanel` no longer accepts ~148 flat props; its ONE caller
 * (`LegacyRightPanelBridge`) builds the two nested objects via
 * `surfaces/panel/rightPanelContract.ts`'s pure `buildRightPanelView`/
 * `buildRightPanelCommands`.
 */
export interface DiscoverRightPanelProps {
  view: RightPanelView;
  commands: RightPanelCommands;
}

export function DiscoverRightPanel({ view, commands }: DiscoverRightPanelProps) {
  // Issue #1531 — PANEL_OPEN telemetry on mount (additive; fire-and-forget; never throws).
  // Only coarse, non-PII fields. Runs once when the panel first renders — never on prop updates.
  // Issue #2657 C7 — stays HERE (not moved into any journey panel/frame): moving it would
  // change its mount lifetime (it must fire once per DiscoverRightPanel mount, not once
  // per journey-panel mount — see G13/M6).
  const { emitPanelOpen } = useDiscoverTelemetry();
  useMountEffect(() => {
    emitPanelOpen();
  });

  const panelContent = view.frame.layout.panelContent;

  // Issue #2657 C7 — the routing DECISION (architect plan §2 dispatcher),
  // extracted to selectors/rightPanelRoute.ts. Issue #2657 C8 — its inputs
  // now come off the composed `view` (already-built by
  // `rightPanelContract.ts`) rather than flat props; the selector itself is
  // unchanged.
  const route = resolveRightPanelRoute(panelContent, {
    hasArea: view.shared.area.point != null,
    urlAreaKey: view.shared.area.urlAreaKey,
    isLoadingAreas: view.shared.area.isLoading,
  });

  function renderJourney(): React.ReactNode {
    if (route.kind === 'area-hydrating') {
      return <AreaHydrating />;
    }
    if (route.kind === 'area-not-found') {
      return <AreaNotFound areaKey={route.areaKey} onStartOver={commands.shared.chrome.startOver} />;
    }
    if (route.kind === 'entry') {
      // Issue #2657 R1 (code-review Finding 1) — the 'hydration-fallback'
      // origin (area-selected/schools-in-area with no resolved area and no
      // urlAreaKey) pre-refactor rendered the bare GuidedEntryPanel
      // UNCONDITIONALLY (DiscoverRightPanel.tsx :1741-1750/:1983-1989 at
      // 659a8b72), never branching on the anon-viewport flag — a user who
      // lands here via a dead/absent areaKey was never inside that flow.
      // Force `anonViewport.active` off for that origin only so
      // GuidedEntryJourneyPanel's own `view.anonViewport.active` check keeps
      // rendering the same bare panel it did before this component split,
      // regardless of the caller's real anon-viewport state.
      const entryView =
        route.origin === 'hydration-fallback'
          ? { ...view.entry, anonViewport: { ...view.entry.anonViewport, active: false } }
          : view.entry;
      return (
        <GuidedEntryJourneyPanel
          view={entryView}
          commands={commands.entry}
          counts={view.frame.counts}
          regionGuide={view.frame.regionGuide}
          context={view.shared.context}
          cards={view.shared.cards}
          onSelectJourney={commands.shared.chrome.selectJourney}
          onCityChange={commands.shared.market.changeCity}
          onIntentChange={commands.shared.market.changeIntent}
          onSelectResultListing={commands.shared.cards.select}
          onHoverResultListing={commands.shared.cards.hover}
        />
      );
    }

    // route.kind === 'journey' from here on. The panelContent switch below
    // still narrows the TYPE for each journey panel's own narrow
    // `panelContent` union (Extract<..., 'agri-landing' | ...>) — reusing
    // `route.journey` directly here would need an unchecked cast, which the
    // repo's TypeScript-strict rule forbids; switching on `panelContent`
    // itself keeps the narrowing sound with no cast.
    switch (panelContent) {
      case 'agri-landing':
      case 'agri-selected':
      case 'agri-group-peek':
      case 'agri-group-locality':
      case 'agri-group-selected':
      case 'agri-detail':
        // Issue #2657 C4 — every agri-first panel-content state is owned by
        // AgriJourneyPanel (moved verbatim, single delegation point). Issue
        // #2657 C8 — the {view, commands} slice arrives ALREADY BUILT
        // (rightPanelContract.ts); this dispatcher only forwards it.
        return (
          <AgriJourneyPanel
            panelContent={panelContent}
            view={view.agri}
            commands={commands.agri}
            context={view.shared.context}
            area={view.shared.area}
            selectedListingId={view.shared.cards.selectedListingId}
            onStartOver={commands.shared.chrome.startOver}
          />
        );

      case 'area-groups-landing':
      case 'area-group-results':
      case 'area-selection':
      case 'area-selected':
        return (
          <AreaJourneyPanel
            panelContent={panelContent}
            view={view.area}
            commands={commands.area}
            context={view.shared.context}
            area={view.shared.area}
            chrome={view.shared.chrome}
            cards={view.shared.cards}
            refresh={view.shared.refresh}
            onStartOver={commands.shared.chrome.startOver}
            onBack={commands.shared.chrome.back}
            onSelectJourney={commands.shared.chrome.selectJourney}
            onSelectResultListing={commands.shared.cards.select}
            onHoverResultListing={commands.shared.cards.hover}
            onCityChange={commands.shared.market.changeCity}
            onIntentChange={commands.shared.market.changeIntent}
          />
        );

      case 'school-browse':
      case 'school-group-areas':
      case 'schools-in-area':
      case 'school-selected':
      case 'area-school-combined':
        return (
          <SchoolJourneyPanel
            panelContent={panelContent}
            view={view.school}
            commands={commands.school}
            context={view.shared.context}
            area={view.shared.area}
            chrome={view.shared.chrome}
            cards={view.shared.cards}
            refresh={view.shared.refresh}
            onStartOver={commands.shared.chrome.startOver}
            onBack={commands.shared.chrome.back}
            onSelectJourney={commands.shared.chrome.selectJourney}
            onSelectResultListing={commands.shared.cards.select}
            onHoverResultListing={commands.shared.cards.hover}
          />
        );

      case 'guided-entry':
        // Unreachable here: route.kind === 'entry' for 'guided-entry' always
        // returns above before this switch is reached.
        return null;

      default: {
        // Exhaustiveness net (R6): the switch had no default, so a future
        // DiscoverPanelContent member with no case would silently render nothing
        // with NO tsc error. This compile-time guard forces every member to be
        // handled — if a new member is added without a case, `panelContent` is no
        // longer `never` here and tsc fails.
        const _exhaustive: never = panelContent;
        return _exhaustive;
      }
    }
  }

  return (
    <RightPanelFrame
      view={view.frame}
      context={view.shared.context}
      chrome={view.shared.chrome}
      onSelectJourney={commands.shared.chrome.selectJourney}
    >
      {renderJourney()}
    </RightPanelFrame>
  );
}
