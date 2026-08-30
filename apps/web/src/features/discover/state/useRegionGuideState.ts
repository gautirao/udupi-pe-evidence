import { useCallback, useMemo, useState } from 'react';
import type { ControllerResult } from '@/features/discover/state/useDiscoverInteractionState';

export interface RegionGuideView {
  /**
   * Issue #1808 — transient, NON-URL region-selection-source signal for the
   * region-overview guidance (map guidance card + region legend + panel
   * attention ring). Mirrors hoveredListingId/hoveredAreaKeyForMap in
   * useDiscoverInteractionState: ephemeral React state only, never written
   * to the URL, never persisted. Defaults to 'deeplink' so a fresh load with
   * `?scope=` already in the URL never fires the one-shot pulse (design
   * §5/§9) — the source only flips to 'map'/'panel' via an explicit click
   * (armRegionSelect below).
   */
  regionSelectSource: 'map' | 'panel' | 'deeplink';
  regionSelectNonce: number;
  /**
   * Card dismissal is local UI state only (no storage/backend writes) and
   * resets on the next region selection (design §5) — see armRegionSelect.
   */
  regionGuideDismissed: boolean;
}

export interface RegionGuideCommands {
  /** Atomic: sets source, increments the nonce, and clears dismissal. */
  armRegionSelect(source: 'map' | 'panel'): void;
  dismissRegionGuide(): void;
}

/**
 * Leaf controller hook for MapDiscovery's region-guide transient cluster
 * (Issue #1824 Slice S2b). None of this state is ever written to the URL;
 * it exists purely to drive the region-overview guidance card/ring one-shot
 * pulse. Derivations that also depend on external state (regionGuideVisible,
 * regionGuideRingActive) intentionally stay in MapDiscovery — they read
 * `isRegionOverview`, which does not belong to this cluster.
 */
export function useRegionGuideState(): ControllerResult<RegionGuideView, RegionGuideCommands> {
  const [regionSelectSource, setRegionSelectSource] = useState<'map' | 'panel' | 'deeplink'>('deeplink');
  const [regionSelectNonce, setRegionSelectNonce] = useState(0);
  const [regionGuideDismissed, setRegionGuideDismissed] = useState(false);

  const armRegionSelect = useCallback((source: 'map' | 'panel') => {
    setRegionSelectSource(source);
    setRegionSelectNonce((n) => n + 1);
    setRegionGuideDismissed(false);
  }, []);

  const dismissRegionGuide = useCallback(() => {
    setRegionGuideDismissed(true);
  }, []);

  // commands must be a referentially stable OBJECT (not just individually
  // stable functions) — see useDiscoverInteractionState for the S1 lesson:
  // an unmemoised literal here would churn consumer identity on every
  // unrelated re-render.
  const commands = useMemo(
    () => ({ armRegionSelect, dismissRegionGuide }),
    [armRegionSelect, dismissRegionGuide],
  );

  return {
    view: { regionSelectSource, regionSelectNonce, regionGuideDismissed },
    commands,
  };
}
