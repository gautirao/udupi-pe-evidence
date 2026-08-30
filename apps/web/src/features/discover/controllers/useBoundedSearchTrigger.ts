import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';

export interface UseBoundedSearchTriggerResult {
  boundedSearchTriggered: boolean;
  setBoundedSearchTriggered: Dispatch<SetStateAction<boolean>>;
  handleBoundedSearch: () => void;
}

/**
 * Issue #2142 Commit 3 — moved verbatim out of MapDiscovery.tsx.
 *
 * Issue #1824 Slice S6 deviation — kept as a standalone controller (not
 * folded into useDiscoverJourneyTransitions) because that hook's own
 * moved effects need useDiscoverMapData's OUTPUTS, and useDiscoverMapData
 * itself reads `boundedSearchTriggered` synchronously in its markersEnabled
 * param — folding it into the journey hook would create a circular
 * dependency. `setBoundedSearchTriggered` is exposed as a raw setter
 * because every WRITE SITE for this flag (the journey hook's internal
 * resets via an injected setter, MapDiscovery's own handleAreaFirstBack
 * reset) lives outside this hook — only the useState pair and the single
 * user-triggered `true` setter (`handleBoundedSearch`, the bounded-search
 * CTA's stable callback) are owned here.
 *
 * Issue #1115 — `handleBoundedSearch` is the stable callback for the
 * bounded-search CTA; it is the ONLY call site that sets the flag `true`
 * (verified statically in MapDiscovery.architecture.baseline.test.ts /
 * controllerOrdering.contract.test.ts) — the flag never auto-fires on
 * school select.
 */
export function useBoundedSearchTrigger(): UseBoundedSearchTriggerResult {
  const [boundedSearchTriggered, setBoundedSearchTriggered] = useState(false);

  const handleBoundedSearch = useCallback(() => {
    setBoundedSearchTriggered(true);
  }, [setBoundedSearchTriggered]);

  return { boundedSearchTriggered, setBoundedSearchTriggered, handleBoundedSearch };
}
