import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GuidedEntryPanel } from '@/components/discover/panels/GuidedEntryPanel';
import { AnonViewportListings } from '@/features/discover/right-panel/entry/AnonViewportListings';
import type {
  RightPanelEntryView,
  RightPanelEntryCommands,
  RightPanelFrameCountsView,
  RightPanelFrameRegionGuideView,
  SharedContextView,
  SharedCardsView,
  SharedChromeCommands,
  SharedMarketCommands,
  SharedCardsCommands,
} from '@/features/discover/right-panel/contracts';

export interface GuidedEntryJourneyPanelProps {
  view: RightPanelEntryView;
  commands: RightPanelEntryCommands;
  /** Narrow shared/frame slices — never the whole `frame`/`shared` object (issue #2657 DoD). */
  counts: Pick<RightPanelFrameCountsView, 'totalProperties' | 'areasCount'>;
  regionGuide: Pick<RightPanelFrameRegionGuideView, 'ringActive' | 'markerKind' | 'nonce' | 'prefersReducedMotion'>;
  context: Pick<SharedContextView, 'city' | 'intent'>;
  cards: Pick<SharedCardsView, 'selectedListingId' | 'hoveredListingId'>;
  onSelectJourney: SharedChromeCommands['selectJourney'];
  onCityChange: SharedMarketCommands['changeCity'];
  onIntentChange: SharedMarketCommands['changeIntent'];
  onSelectResultListing: SharedCardsCommands['select'];
  onHoverResultListing: SharedCardsCommands['hover'];
}

/**
 * Issue #2657 C7 — owns 'guided-entry' (moved verbatim from
 * DiscoverRightPanel's `renderPanel` 'guided-entry' case + its
 * `guidedEntryProps`/`renderAnonViewportListings` closures): the anon
 * "Search this area" viewport list (Issue #2015, via the C2
 * AnonViewportListings leaf) when `view.anonViewport.active`, otherwise the
 * public landing `GuidedEntryPanel`.
 *
 * PANEL_OPEN telemetry stays in DiscoverRightPanel (not moved here — G13).
 */
export function GuidedEntryJourneyPanel({
  view,
  commands,
  counts,
  regionGuide,
  context,
  cards,
  onSelectJourney,
  onCityChange,
  onIntentChange,
  onSelectResultListing,
  onHoverResultListing,
}: GuidedEntryJourneyPanelProps): React.ReactNode {
  const navigate = useNavigate();

  if (view.anonViewport.active) {
    return (
      <AnonViewportListings
        anonViewportListings={view.anonViewport.listings ?? []}
        anonViewportListingsLoading={view.anonViewport.loading ?? false}
        isErrorAnonViewport={view.anonViewport.error ?? false}
        onRetryAnonViewport={commands.anonViewport.retry}
        selectedListingId={cards.selectedListingId}
        hoveredListingId={cards.hoveredListingId}
        onSelectResultListing={onSelectResultListing}
        onHoverResultListing={onHoverResultListing}
        navigate={navigate}
      />
    );
  }

  return (
    <GuidedEntryPanel
      onSelectJourney={onSelectJourney}
      city={context.city ?? ''}
      onCityChange={onCityChange ?? (() => undefined)}
      intent={context.intent ?? 'buy'}
      onIntentChange={onIntentChange ?? (() => undefined)}
      totalProperties={counts.totalProperties ?? 0}
      areasCount={counts.areasCount ?? 0}
      isCityEmpty={view.landing.isCityEmpty}
      // Issue #1808 — region-overview guidance signal, forwarded verbatim.
      regionGuideRingActive={regionGuide.ringActive}
      regionGuideMarkerKind={regionGuide.markerKind}
      regionGuideNonce={regionGuide.nonce}
      prefersReducedMotion={regionGuide.prefersReducedMotion}
      onRegionSelectFromPanel={commands.landing.armRegionSelect}
    />
  );
}
