import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
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
  /**
   * Issue #1939 — the SAME map-half container ref MapDiscovery passes to
   * DiscoverMapCanvas/DiscoverMapMarkerPopover for popover positioning/clamp.
   * Used ONLY by hydrateSelectedMarkerFromUrl below to locate the target
   * marker's DOM node (data-listing-id attribute, set by MarkerClusterLayer
   * in PropertyMap.tsx) and derive its on-screen pixel position. No Leaflet
   * map-instance/projection access is available at this layer — PropertyMap
   * does not expose one — so this deliberately reads the DOM instead of
   * calling latLngToContainerPoint. Optional so existing callers/tests that
   * predate #1939 (no map-container ref, no hydration need) keep compiling
   * unchanged — hydrateSelectedMarkerFromUrl safely no-ops without it.
   */
  mapContainerRef?: RefObject<HTMLDivElement | null>;
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
  /**
   * Issue #1939 code-review F1 — local-state-only popover close for the
   * URL→UI REVERSE sync (Back navigation, or any other transition that
   * removes `listing` from the URL). Clears BOTH selectedMarkerListing and
   * markerPixelPos WITHOUT writing the URL — unlike handlePopoverDismiss,
   * which also clears the URL `listing` param, this is called precisely
   * because the URL has already lost the param (via history navigation), so
   * writing it again would be redundant at best and fight an in-flight
   * Back/Forward transition at worst. Idempotent: calling it when both are
   * already null costs a bailed-out setState (React skips the re-render).
   *
   * Issue #1939 rework F3 — ALSO cancels any in-flight hydration retry
   * (see cancelHydrationRetry in the implementation) before clearing local
   * state, so MapDiscovery's third URL-reconciliation branch (URL moved to
   * a different, currently-unresolvable id while a DIFFERENT listing's
   * popover is still showing) can call this single method to both stop a
   * stale retry for the OLD id and close the stale popover, atomically.
   */
  clearMarkerPopoverFromUrl: () => void;
  /**
   * Issue #1939 — URL → popover restore. Call with the listing already
   * resolved (by the caller) from urlState.selectedListing against the same
   * ordered marker set PropertyMap renders (currentMapMarkerListings). Safe
   * to call repeatedly / on every eligible render — idempotent (no-op if
   * this listing is already selected) and PERSISTENTLY suppressed (not just
   * for one cycle) for as long as urlState.selectedListing stays equal to
   * the id showMarkerInList most recently dismissed-to-list. See the
   * function body for the full LEAVE_PARAM_NO_POPOVER contract.
   */
  hydrateSelectedMarkerFromUrl: (listing: PropertyListingWithImages) => void;
}

export function useMarkerSelection({
  urlActions,
  urlState,
  mapContainerRef,
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

  // Issue #1939 (fix-up, code-review finding) — PERSISTENT id suppression
  // written by showMarkerInList below and consumed by
  // hydrateSelectedMarkerFromUrl further down. Originally one-shot (cleared
  // itself on the very next hydration check), which was NOT enough:
  // resolveMarkerPopover/currentMapMarkerListings intentionally returns a
  // fresh array/object on every render (never memoized), so a background
  // refetch/mapZoom/filter recompute after showMarkerInList produces a new
  // urlHydratedMarkerListing object for the SAME id and re-fires the
  // hydration effect a second (or Nth) time — by then the one-shot flag had
  // already been spent, so the popover the user just dismissed via "Show in
  // list" would silently reopen. Now this ref stays armed for the id across
  // any number of re-fires, and is only cleared/re-armed by the effect below
  // when urlState.selectedListing genuinely changes away from that id (a
  // real navigation to another marker, or a clear) — see that effect's
  // comment. Because the ref resets to null on every fresh mount (useRef's
  // initial value), a hard refresh or deep link to `?listing=<id>` is
  // unaffected: there is no dismissed-to-list memory to suppress it.
  const listTransitionSuppressIdRef = useRef<string | null>(null);

  // Issue #1939 (fix-up) — re-arms hydration once the URL's `listing` id
  // genuinely moves away from the one showMarkerInList suppressed. Runs on
  // every urlState.selectedListing change (a real user navigation — clicking
  // a different marker/sibling, or handlePopoverDismiss clearing the param —
  // never a same-id re-render, since the effect dep is the scalar id, not an
  // object). Deliberately does NOT gate on the current ref value having
  // matched the new id — it always re-syncs to null unless the incoming id is
  // still the suppressed one, so Back/Forward navigation that lands back on
  // the SAME dismissed-to-list id via a genuinely different history entry
  // still re-arms nothing (id unchanged → suppression correctly holds), while
  // navigating to a different id (or clearing) always clears it, letting a
  // later return to that id (fresh navigation, deep link, or Back/Forward)
  // open normally.
  useEffect(() => {
    if (
      listTransitionSuppressIdRef.current != null &&
      listTransitionSuppressIdRef.current !== urlState.selectedListing
    ) {
      listTransitionSuppressIdRef.current = null;
    }
  }, [urlState.selectedListing]);

  // Issue #1810 (Stage 2A) — "Show in list": re-drives setSelectedListing(id)
  // (idempotent re-scroll+highlight, consumed by AreaSelectedPanel) and closes
  // ONLY the popup overlay (clearing local markerPixelPos/selectedMarkerListing
  // state) WITHOUT calling clearSelectedListing — unlike handlePopoverDismiss,
  // this must NOT clear the URL `listing` param, or the panel highlight it just
  // set would immediately clear too.
  const showMarkerInList = useCallback((id: string) => {
    setMarkerPixelPos(null);
    setSelectedMarkerListing(null);
    // Issue #1939 — persistent suppression (see listTransitionSuppressIdRef's
    // declaration above) so the URL-hydration effect (driven from
    // MapDiscovery) does not re-open the card this call is intentionally
    // closing, no matter how many times it re-fires while this same id
    // remains the URL's `listing` param. setSelectedListing(id) below
    // re-drives the SAME id already in the URL for the panel highlight/scroll
    // (see the JSDoc above).
    listTransitionSuppressIdRef.current = id;
    ctxRef.current.urlActions.setSelectedListing(id);
  }, []);

  const clearSelectedMarkerListing = useCallback(() => {
    setSelectedMarkerListing(null);
  }, []);

  // Issue #1939 code-review F2 — bounded rAF-based readiness retry state for
  // hydrateSelectedMarkerFromUrl below. A single requestAnimationFrame id
  // (never more than one in flight) plus the listing id it is polling for,
  // so a fresh call to hydrateSelectedMarkerFromUrl (new id, or a re-fire
  // for the same id) can always cancel any stale attempt before starting.
  // Declared HERE, ahead of clearMarkerPopoverFromUrl, because the F3 rework
  // below folds cancelHydrationRetry into clearMarkerPopoverFromUrl's own
  // useCallback dependency array — that array is evaluated at declaration
  // time, so cancelHydrationRetry must already exist by then.
  const hydrationRetryRef = useRef<{ rafId: number; listingId: string } | null>(null);

  const cancelHydrationRetry = useCallback(() => {
    if (hydrationRetryRef.current != null) {
      cancelAnimationFrame(hydrationRetryRef.current.rafId);
      hydrationRetryRef.current = null;
    }
  }, []);

  // Issue #1939 code-review F2 — cancel any pending retry on unmount so a
  // late rAF callback never calls setState after the hook's owning
  // component has gone away.
  useEffect(() => {
    return () => {
      cancelHydrationRetry();
    };
  }, [cancelHydrationRetry]);

  // Issue #1939 code-review F1 — see clearMarkerPopoverFromUrl's JSDoc above.
  // Does NOT touch listTransitionSuppressIdRef: that ref is owned entirely
  // by the urlState.selectedListing-keyed effect above, which already nulls
  // it out whenever the id changes away (including a genuine id → null
  // transition), so a later Forward navigation back to the same id is not
  // left stuck suppressed by this call.
  //
  // Issue #1939 rework F3 — also cancels any in-flight hydration retry
  // (cancelHydrationRetry, BEFORE clearing local state below). This method
  // is only ever called when the caller wants NO popover showing for the
  // CURRENT local id, so a retry still polling for that id (or a stale one
  // left over from a prior id) must never be allowed to survive and later
  // reopen a popover this call just closed. Folding the cancel in here
  // (rather than exposing the raw hydrationRetryRef/cancelHydrationRetry up
  // to MapDiscovery) keeps retry-cancellation entirely hook-owned:
  // MapDiscovery's F3 reconciliation branch calls this one method — the
  // same one F1 already uses for the reverse-sync clear — so cancel + clear
  // always happen together, atomically, with no way for a caller to invoke
  // one without the other.
  const clearMarkerPopoverFromUrl = useCallback(() => {
    cancelHydrationRetry();
    setMarkerPixelPos(null);
    setSelectedMarkerListing(null);
  }, [cancelHydrationRetry]);

  // Issue #1939 — URL-driven hydration for Back/Forward/hard-refresh/deep-link
  // restore of the marker popover (the marker HIGHLIGHT already restores on
  // its own — DiscoverMapCanvas passes urlState.selectedListing straight
  // through to PropertyMap's selectedListingId prop, no local state involved
  // — only the popover card was missing this path). The caller (MapDiscovery)
  // resolves the target listing from currentMapMarkerListings and calls this
  // only when isMarkerPopoverEligible && mapReady, so the atomic
  // journey-gate (never set one state without the other, never set either
  // when ineligible) is enforced by the caller never invoking this function
  // in the ineligible case, rather than by a check duplicated in here.
  //
  // markerPixelPos is derived from the DOM, not Leaflet's latLngToContainerPoint:
  // no Leaflet map instance is reachable from this hook (or from MapDiscovery)
  // — PropertyMap/MarkerClusterLayer are the only components inside the
  // react-leaflet MapContainer context (useMap()), and neither exposes the
  // instance upward. Every residential marker's DOM element already carries a
  // data-listing-id attribute (MarkerClusterLayer's marker.on('add', ...) in
  // PropertyMap.tsx, added for E2E selectors) — reused here as the lookup
  // key. getBoundingClientRect() of that element, relative to the SAME
  // mapContainerRef DiscoverMapMarkerPopover clamps against, gives the same
  // "pixel position relative to the map container" contract the click path's
  // e.containerPoint produces.
  // Issue #1939 code-review F2 — bounded readiness-retry cap. ~30 rAF
  // frames ≈ 500ms at 60fps; a hard ceiling, not a timer-based timeout, so
  // slow/throttled frames just take longer wall-clock time rather than
  // firing extra checks.
  const MAX_HYDRATION_RETRY_FRAMES = 30;

  const hydrateSelectedMarkerFromUrl = useCallback(
    (listing: PropertyListingWithImages) => {
      // Issue #1939 code-review (rework, advisory fix) — cancel any
      // in-flight retry from a prior call FIRST, before any early-return
      // guard below. A stale rAF retry left running past an early return
      // (e.g. this call bails on the idempotent check because a click
      // handler already selected this exact listing) could later fire and
      // call setMarkerPixelPos with a DOM-rect-derived position, overwriting
      // the more precise click-computed position — the exact flicker the
      // idempotent check exists to prevent. Unconditional placement here
      // guarantees at most one retry loop is ever in flight regardless of
      // which branch below this call takes.
      cancelHydrationRetry();

      // Issue #1939 (fix-up) — PERSISTENT suppression, not one-shot. Stays a
      // no-op for every re-fire (fresh currentMapMarkerListings reference on
      // background refetch/mapZoom/filter recompute included) for as long as
      // listTransitionSuppressIdRef holds this exact id. Do NOT clear the ref
      // here — clearing/re-arming is owned entirely by the
      // urlState.selectedListing-keyed effect above, which only fires on a
      // genuine URL change (real navigation away from this id, or a clear),
      // never on an object-identity-only re-render.
      if (listTransitionSuppressIdRef.current === listing.id) {
        return;
      }
      // Idempotent — a click/sibling-step handler may already have set this
      // exact listing selected (same render or a prior one). Re-deriving
      // markerPixelPos from a DOM query here would fight that: a slightly
      // different pixel value than the click's own e.containerPoint,
      // producing a visible flicker/jump for zero benefit.
      if (selectedMarkerListing?.id === listing.id) return;
      const container = mapContainerRef?.current;
      if (!container) return; // not mounted yet — LEAVE_PARAM_NO_POPOVER

      const attemptHydration = (framesLeft: number) => {
        // Issue #1939 code-review F2(a) — abort if the URL's target id moved
        // on mid-retry (Back/Forward, a new marker click, a sibling step) —
        // never hydrate a listing the URL no longer names.
        if (ctxRef.current.urlState.selectedListing !== listing.id) {
          hydrationRetryRef.current = null;
          return;
        }
        // Issue #1939 code-review F2(e) — a dismissed/suppressed id must not
        // be reopened by a retry that was already in flight when
        // showMarkerInList armed suppression for it.
        if (listTransitionSuppressIdRef.current === listing.id) {
          hydrationRetryRef.current = null;
          return;
        }
        const el = mapContainerRef?.current;
        if (!el) {
          hydrationRetryRef.current = null;
          return; // unmounted mid-retry — LEAVE_PARAM_NO_POPOVER
        }
        const markerEl = el.querySelector<HTMLElement>(
          `[data-listing-id="${CSS.escape(listing.id)}"]`,
        );
        if (markerEl) {
          const markerRect = markerEl.getBoundingClientRect();
          const containerRect = el.getBoundingClientRect();
          setSelectedMarkerListing(listing);
          setMarkerPixelPos({
            x: markerRect.left - containerRect.left + markerRect.width / 2,
            y: markerRect.top - containerRect.top + markerRect.height / 2,
          });
          hydrationRetryRef.current = null;
          return;
        }
        // LEAVE_PARAM_NO_POPOVER — marker not (yet) painted by Leaflet's own
        // effect-driven render pass, currently clustered/spiderfied away, or
        // filtered off the map. Never throws, never clears the URL
        // `listing` param, never toasts; the URL/panel highlight are
        // unaffected. Issue #1939 code-review F2(d) — once framesLeft is
        // exhausted, stop silently instead of retrying forever.
        if (framesLeft <= 0) {
          hydrationRetryRef.current = null;
          return;
        }
        const rafId = requestAnimationFrame(() => attemptHydration(framesLeft - 1));
        hydrationRetryRef.current = { rafId, listingId: listing.id };
      };

      attemptHydration(MAX_HYDRATION_RETRY_FRAMES);
    },
    [selectedMarkerListing, mapContainerRef, cancelHydrationRetry],
  );

  return {
    selectedMarkerListing,
    markerPixelPos,
    handleSelectMarkerListing,
    handleMarkerClickWithPosition,
    handlePopoverDismiss,
    selectMarkerSibling,
    showMarkerInList,
    clearSelectedMarkerListing,
    clearMarkerPopoverFromUrl,
    hydrateSelectedMarkerFromUrl,
  };
}
