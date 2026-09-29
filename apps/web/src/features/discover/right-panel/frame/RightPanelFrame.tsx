import React from 'react';
import { JourneySwitcher } from '@/components/discover/JourneySwitcher';
import { JourneySummaryStrip } from '@/components/discover/JourneySummaryStrip';
import { DiscoverControlBar } from '@/components/discover/DiscoverControlBar';
import { inferJourneyFromPanelContent } from '@/features/discover/utils/discoverPanelState';
// Issue #2657 R2 — this file only needs the panelContent union; indexed off
// the authoritative type, never off DiscoverRightPanel's own props.
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type {
  RightPanelFrameView,
  SharedContextView,
  SharedChromeView,
  SharedChromeCommands,
} from '@/features/discover/right-panel/contracts';

/**
 * Panel states that already pass `activeContextChips` to their own
 * PanelHeader. For every OTHER state we render a top chip strip so
 * seller/date/boolean chips are visible even when no area or school is
 * selected (Issue #1151 AC5). Moved verbatim from DiscoverRightPanel.tsx
 * (Issue #2657 C7).
 */
const PANELS_WITH_INLINE_CHIPS = new Set<DiscoverPanelContent>([
  'area-selected',
  'agri-selected',
  'agri-group-selected',
  'agri-group-peek',
  'agri-group-locality',
  'agri-detail',
  'school-browse',
  'school-group-areas',
  'schools-in-area',
  'school-selected',
  'area-school-combined',
]);

export interface RightPanelFrameProps {
  view: RightPanelFrameView;
  /** Narrow shared slices — never the whole `shared` object (issue #2657 DoD). */
  context: Pick<SharedContextView, 'journey' | 'cityLabel' | 'city'>;
  chrome: Pick<SharedChromeView, 'activeContextChips'>;
  onSelectJourney: SharedChromeCommands['selectJourney'];
  /** The journey body — resolved by DiscoverRightPanel's dispatcher. */
  children: React.ReactNode;
}

/**
 * The DRP root. Owns: root div classes + testid, the persistent JourneySwitcher, the top
 * chip strip (PANELS_WITH_INLINE_CHIPS), and the footer slot; renders `children` for the
 * journey body. `DiscoverControlBar` and the compact journey-tab strip live in the shared
 * desktop header once it's wide enough to host them (`useDiscoverHeaderHostsControls`);
 * below that width (including mobile) this panel renders its own copy of both, exactly as
 * before the header owned them. Does NOT reuse DiscoverJourneyPanelShell (different root
 * classes, no region-guide props, no chip strip, no footer slot there).
 */
export function RightPanelFrame({ view, context, chrome, onSelectJourney, children }: RightPanelFrameProps) {
  const { panelContent, isMobileShell, hostsHeaderControls, headerHostsJourneyTabs, footer } = view.layout;

  const showTopChipStrip = chrome.activeContextChips != null && !PANELS_WITH_INLINE_CHIPS.has(panelContent);
  // The header is the sole journey selector — including guided-entry — whenever it actually RENDERS the journey tabs (headerHostsJourneyTabs). Below that width, or while an admin city-launch preview leaves the header's tabs suppressed, the panel shows its own copy, for every panel state — see useDiscoverPageContext.ts's headerHostsJourneyTabs doc comment.
  const showJourneySwitcher = !headerHostsJourneyTabs;
  // Same "header doesn't have room" condition, minus guided-entry (that state never showed the control bar here even on desktop pre-header). Keyed on hostsHeaderControls (not headerHostsJourneyTabs): the control bar stays in the header even while an unresolved preview suppresses the header's journey tabs.
  const showControlBarInPanel = !isMobileShell && !hostsHeaderControls;

  return (
    <div
      className="flex flex-col lg:w-1/2 border-l border-border bg-background overflow-hidden order-2 lg:order-2"
      data-testid="discover-right-panel"
    >
      {showJourneySwitcher && (
        <div className="flex flex-col gap-3 px-4 pt-4 pb-2 shrink-0">
          {showControlBarInPanel && <DiscoverControlBar hostsHeaderControls={hostsHeaderControls} />}
          <JourneySwitcher
            // Density tracks the ACTUAL rendered panel state, not the raw
            // `journey` URL param — see DiscoverRightPanel's pre-C7 history for
            // the full rationale (Issue #1953 follow-up, Issue #2408 mobile).
            compact={isMobileShell || panelContent !== 'guided-entry'}
            // `journey` still wins when present; otherwise infer the
            // equivalent journey from panelContent (Issue #1953 density fix).
            activeJourney={context.journey ?? inferJourneyFromPanelContent(panelContent)}
            onSelectJourney={onSelectJourney}
            cityLabel={context.cityLabel ?? context.city}
            totalProperties={view.counts.totalProperties}
            areasCount={view.counts.areasCount}
            regionGuideRingActive={view.regionGuide.ringActive}
            regionGuideHelperText={view.regionGuide.helperText}
            regionGuideNonce={view.regionGuide.nonce}
            prefersReducedMotion={view.regionGuide.prefersReducedMotion}
          />
        </div>
      )}
      {/* The header hosting the switcher does not host the summary strip too — restore it here alone, in the same density condition (`guided-entry`, non-mobile) the hidden switcher would have shown it under. Keyed on headerHostsJourneyTabs, not hostsHeaderControls: while an unresolved preview suppresses the header's tabs the switcher above is shown instead, so this standalone strip must stay hidden (its content already lives inside that switcher). */}
      {headerHostsJourneyTabs && !isMobileShell && panelContent === 'guided-entry' && (
        <div className="flex flex-col px-4 pb-2 shrink-0">
          <JourneySummaryStrip
            journey={context.journey ?? inferJourneyFromPanelContent(panelContent) ?? 'area-first'}
            totalProperties={view.counts.totalProperties}
            areasCount={view.counts.areasCount}
          />
        </div>
      )}
      {showTopChipStrip && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-border shrink-0">
          {chrome.activeContextChips}
        </div>
      )}
      {children}
      {footer}
    </div>
  );
}
