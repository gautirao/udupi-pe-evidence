import type { DiscoverPanelContent } from '@/features/discover/utils/discoverPanelState';

/**
 * Suppresses the header's region-guide ring during guided-entry ONLY when the
 * panel still owns its own JourneySwitcher there (the header does not actually
 * render the journey tabs — either it's too narrow to host controls, or it's
 * wide enough but an unresolved admin city-launch preview suppresses the tabs
 * — see useDiscoverPageContext.ts's `headerHostsJourneyTabs`) — keeps exactly
 * one ring shown at a time. Once the header renders the journey tabs it is the
 * sole guided-entry selector, so the ring belongs to it.
 */
export function deriveShellRegionGuideRingActive(
  regionGuideRingActive: boolean,
  resolvedPanelContent: DiscoverPanelContent,
  headerHostsJourneyTabs: boolean,
): boolean {
  if (resolvedPanelContent === 'guided-entry' && !headerHostsJourneyTabs) return false;
  return regionGuideRingActive;
}
