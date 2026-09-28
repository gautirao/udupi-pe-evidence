import React from 'react';
import { JourneySwitcher } from '@/components/discover/JourneySwitcher';
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
 * Issue #2657 C7 — the VERBATIM DRP root (architect plan §2/§3). Owns: the
 * root div classes + testid, the desktop-only DiscoverControlBar gate, the
 * persistent JourneySwitcher (compact derivation, activeJourney inference,
 * region-guide ring/nonce/reduced-motion), the top chip strip
 * (PANELS_WITH_INLINE_CHIPS), and the footer slot. Renders `children` for
 * the journey body — it never decides WHICH journey panel to render (that
 * stays in DiscoverRightPanel's dispatcher).
 *
 * Does NOT reuse DiscoverJourneyPanelShell — see architect plan §2 for the
 * visual-diff rationale (different root classes, no region-guide props, no
 * chip strip, no footer slot there).
 */
export function RightPanelFrame({ view, context, chrome, onSelectJourney, children }: RightPanelFrameProps) {
  const { panelContent, isMobileShell, footer } = view.layout;

  const showTopChipStrip = chrome.activeContextChips != null && !PANELS_WITH_INLINE_CHIPS.has(panelContent);

  return (
    <div
      className="flex flex-col lg:w-1/2 border-l border-border bg-background overflow-hidden order-2 lg:order-2"
      data-testid="discover-right-panel"
    >
      <div className="flex flex-col gap-3 px-4 pt-4 pb-2 shrink-0">
        {/* Issue #2108 (shell fix) — DESKTOP-ONLY render of the shared city +
            Buy/Rent + area-search control bar; gated on the real
            `isMobileShell` prop (not a Tailwind breakpoint) so it and
            MapDiscovery.tsx's own mobile-only control-bar row stay mutually
            exclusive in both a real browser and jsdom. */}
        {!isMobileShell && <DiscoverControlBar />}
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
