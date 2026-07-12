import { useCallback, useRef, useState } from 'react';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import type { DiscoverUrlActions, DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

/**
 * Issue #1824 Slice S5 — EARLY marker-selection cluster extracted verbatim
 * out of MapDiscovery (selectedMarkerListing/markerPixelPos useState pair,
 * the markerListingCtxRef stable-identity pattern, and the three
 * useCallback([]) handlers: handleSelectMarkerListing,
 * handleMarkerClickWithPosition, handlePopoverDismiss).
 *
 * Also consolidates the two LATE-cluster URL writes (previously inline in
 * MapDiscovery's handleStepMarkerListing / handleShowMarkerInList) into
 * selectMarkerSibling / showMarkerInList so every write to the shared
 * `listing` URL param lives in one place. The LATE cluster itself
 * (currentMapMarkerListings, isMarkerPopoverEligible, the stepper IIFE,
 * handleStepMarkerListing) STAYS in the page per the S5 design — see
 * docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s5-design.md
 * §1 (Option A) for why: currentMapMarkerListings never crosses the hook
 * boundary, so the stepper's findIndex keeps closing over the same
 * page-scoped array with zero reference-identity risk.
 *
 * The hook does NOT import useDiscoverUrlState — URL ownership stays
 * single-owner in the page. It takes the WHOLE urlActions/urlState objects
 * as injected params (verbatim mirror of the pre-S5 ctxRef, which bundled
 * the same two objects) rather than narrow fields, because the three
 * handlers collectively read six urlState fields and two actions — narrow
 * injection here would just be a larger, easier-to-drift param list for the
 * same fidelity.
 *
 * Issue #1466 pattern (PRESERVED, load-bearing): urlActions gets a new
 * object identity every render, but PropertyMap/MarkerClusterLayer capture
 * onSelectListing/onMarkerClickWithPosition and must not see the handler
 * identity churn on every keystroke/render. The internal ctxRef is mutated
 * UNCONDITIONALLY at the top of every hook call so the three handlers can
 * stay useCallback([]) (stable identity) while still reading the latest
 * injected urlActions/urlState via ctxRef.current. Do NOT convert these to
 * normal-deps useCallback — that reintroduces the churn this ref exists to
 * avoid.
 *
 * Issue #1738 / #1798 (PRESERVED, verbatim): the area-first area+school
 * combined-state gating clause `(schoolId == null || journey ===
 * 'area-first')` appears in handleSelectMarkerListing and
 * handleMarkerClickWithPosition exactly as it did pre-extraction. The same
 * clause also lives in MapDiscovery's page-level isMarkerPopoverEligible
 * (LATE cluster, not moved) — pinned by
 * tests/discover/marker-popover-1738-gating.test.ts and
 * src/pages/__tests__/MapDiscovery.issue1798.markerPopup.test.tsx. Any edit
 * to either copy is a behaviour change, not a refactor.
 *
 * Issue #1547 (PRESERVED, verbatim): all URL writes below use the same
 * conditions/params as before, including the clear-vs-no-clear asymmetry —
 * handlePopoverDismiss clears the URL `listing` param (so the copper
 * card↔marker highlight clears), showMarkerInList does NOT (so the
 * highlight it just set does not immediately clear again).
 */
export interface UseMarkerSelectionParams {
  urlActions: DiscoverUrlActions;
  urlState: DiscoverUrlState;
}

export interface UseMarkerSelectionResult {
  selectedMarkerListing: PropertyListingWithImages | null;
  markerPixelPos: { x: number; y: number } | null;
  handleSelectMarkerListing: (listing: PropertyListingWithImages | null) => void;
  handleMarkerClickWithPosition: (pos: { x: number; y: number }) => void;
  handlePopoverDismiss: () => void;
  selectMarkerSibling: (listing: PropertyListingWithImages) => void;
  showMarkerInList: (id: string) => void;
  /**
   * Clears ONLY the local selectedMarkerListing state (no URL write). Not
   * part of the marker-popup click/step/dismiss flow — used by the agri
   * polygon-selection "clear" affordance (DiscoverRightPanel
   * onClearAgriSelection), which pre-extraction called the bare
   * setSelectedMarkerListing(null) setter directly. Kept minimal/verbatim:
   * same effect, just routed through the hook now that the raw setter is
   * no longer exposed to the page.
   */
  clearSelectedMarkerListing: () => void;
}

export function useMarkerSelection({
  urlActions,
  urlState,
}: UseMarkerSelectionParams): UseMarkerSelectionResult {
  // Issue #1373 — selected agri polygon listing for right-panel stub (#1374 content).
  const [selectedMarkerListing, setSelectedMarkerListing] =
    useState<PropertyListingWithImages | null>(null);

  // a3 — pixel position of the most recently clicked marker relative to the
  // map container. Set on marker click (handleSelectMarkerListing wiring
  // below), cleared on dismiss.
  const [markerPixelPos, setMarkerPixelPos] = useState<{ x: number; y: number } | null>(null);

  // Issue #1466 — stable ref bundle so handleSelectMarkerListing's useCallback dep array
  // stays empty (stable identity). urlActions changes every render; urlState.selectedRegion
  // and journey are needed inside the callback. The ref is mutated on every render so the
  // callback always reads the latest values.
  const ctxRef = useRef({ urlActions, urlState });
  ctxRef.current = { urlActions, urlState };

  const handleSelectMarkerListing = useCallback(
    (listing: PropertyListingWithImages | null) => {
      setSelectedMarkerListing(listing);
      // Issue #1466: In agri-group-selected context (corridor + distance tier chosen,
      // no specific area), a marker click must write listing=<uuid> to the URL so
      // derivePanelContent routes to 'agri-group-peek'. The agri-detail override
      // (resolvedPanelContent in the page) uses local selectedMarkerListing state and only
      // fires when panelContent==='agri-selected' (areaKey present) — no conflict here.
      const { urlActions: actions, urlState: state } = ctxRef.current;
      if (
        listing != null &&
        state.journey === 'agri-first' &&
        state.selectedRegion != null &&
        state.selectedMaxKm != null
      ) {
        actions.setSelectedListing(listing.id);
        return;
      }
      // Issue #1547 — residential area-first card↔marker sync. A residential marker
      // click in the area-selected state writes the shared `listing` URL param so the
      // matching result card highlights (copper selected state) and scrolls into view.
      // This is scoped to area-first (lowest marker/list desync); school-first markers
      // come from three desynced tier sources and are intentionally NOT wired here.
      // derivePanelContent only routes on `listing` when an agri region+maxKm are set,
      // so writing it here does NOT change residential panel routing.
      // Issue #1738 — area-first area+school combined state: derivePanelContent routes
      // BOTH area-first and school-first area+school selections to the same
      // 'area-school-combined' panelContent, so schoolId/panelContent alone can't
      // distinguish them. We must check journey explicitly to keep writing `listing`
      // (and thus populating selectedMarkerListing for the popover) once a school is
      // also selected in area-first, while still excluding school-first (its own
      // tiered/peek marker flows own that state).
      if (
        listing != null &&
        state.journey !== 'agri-first' &&
        state.areaKey != null &&
        (state.schoolId == null || state.journey === 'area-first')
      ) {
        actions.setSelectedListing(listing.id);
      }
    },
    [],
  );

  // a3 — callback for MarkerClusterLayer to report the pixel position of a marker click.
  // Gated to area-first residential path: areaKey set, journey !== agri-first, and either
  // no school selected yet OR (Issue #1738) a school IS selected but the journey is
  // area-first — derivePanelContent routes area-first area+school selections to the same
  // 'area-school-combined' panel content as school-first, so we must check journey
  // explicitly here rather than inferring from schoolId/panelContent alone. School-first
  // marker click positions are still NOT captured (that flow owns its own tiered/peek UI).
  const handleMarkerClickWithPosition = useCallback(
    (pos: { x: number; y: number }) => {
      const { urlState: state } = ctxRef.current;
      if (
        state.journey !== 'agri-first' &&
        state.areaKey != null &&
        (state.schoolId == null || state.journey === 'area-first')
      ) {
        setMarkerPixelPos(pos);
      }
    },
    [],
  );

  // a3 — dismiss the popover and clear both local state + the URL `listing` param.
  // Clearing the URL listing param keeps the #1547 copper card↔marker highlight in sync.
  const handlePopoverDismiss = useCallback(() => {
    setMarkerPixelPos(null);
    setSelectedMarkerListing(null);
    // Clear the URL listing param so the copper card highlight clears too (#1547 sync).
    const { urlActions: actions } = ctxRef.current;
    actions.clearSelectedListing?.();
  }, []);

  // Issue #1810 (Stage 2A) — steps the popup to a sibling within the page's
  // ratified MODEL A marker set. Updates selectedMarkerListing + the shared
  // `listing` URL param (so the panel card highlight/scroll follows). The
  // page's handleStepMarkerListing computes the sibling (index±1 within
  // currentMapMarkerListings, which never crosses this hook boundary) and
  // delegates the write here.
  const selectMarkerSibling = useCallback((listing: PropertyListingWithImages) => {
    setSelectedMarkerListing(listing);
    ctxRef.current.urlActions.setSelectedListing(listing.id);
  }, []);

  // Issue #1810 (Stage 2A) — "Show in list": re-drives setSelectedListing(id)
  // (idempotent re-scroll+highlight, consumed by AreaSelectedPanel) and closes
  // ONLY the popup overlay (clearing local markerPixelPos/selectedMarkerListing
  // state) WITHOUT calling clearSelectedListing — unlike handlePopoverDismiss,
  // this must NOT clear the URL `listing` param, or the panel highlight it just
  // set would immediately clear too.
  const showMarkerInList = useCallback((id: string) => {
    setMarkerPixelPos(null);
    setSelectedMarkerListing(null);
    ctxRef.current.urlActions.setSelectedListing(id);
  }, []);

  const clearSelectedMarkerListing = useCallback(() => {
    setSelectedMarkerListing(null);
  }, []);

  return {
    selectedMarkerListing,
    markerPixelPos,
    handleSelectMarkerListing,
    handleMarkerClickWithPosition,
    handlePopoverDismiss,
    selectMarkerSibling,
    showMarkerInList,
    clearSelectedMarkerListing,
  };
}
