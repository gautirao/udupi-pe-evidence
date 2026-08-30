import { useEffect, useMemo } from 'react';
import { resolveMarkerPopover } from '@/features/discover/map/resolveMarkerPopover';
import { isMarkerPopoverEligible as computeMarkerPopoverEligible } from '@/features/discover/navigation/markerPopoverEligibility';
import {
  toLayerInput,
  selectDiscoverMapLayer,
  type DiscoverMapLayerKind,
} from '@/features/discover/selectors/mapLayerCategory';
import { AREA_LAYER_MAX_ZOOM } from '@/lib/map/zoomPolicy';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import type { useDiscoverMarkerController } from '@/features/discover/controllers/useDiscoverMarkerController';

export interface UseDiscoverMarkerPopoverControllerParams {
  nav: DiscoverNavContextValue;
  viewport: DiscoverUrlState['viewport'];
  /** Issue #1956 PR-4 — the ONE leaf-identity boolean, shared with useMarkerSelection's capture gate. */
  isNodeAreaLeafActive: boolean;
  mapLayerCategory: DiscoverMapLayerKind;
  effectiveSelectedArea: AreaPoint | null;
  isGroupResultsState: boolean;
  isNodeListingsState: boolean;
  mapZoom: number;
  mapReady: boolean;
  isAuthenticated: boolean;
  groupResultsMarkers: PropertyListingWithImages[];
  nodeListingsMarkers: PropertyListingWithImages[];
  markerListings: PropertyListingWithImages[];
  areaMarkerListings: PropertyListingWithImages[];
  schoolRadiusFallbackMarkers: PropertyListingWithImages[];
  isLoadingAreaListings: boolean;
  isErrorAreaListings: boolean;
  markersLoading: boolean;
  /** The marker-selection controller's outputs — the local click/URL state this reconciles against. */
  markerSelection: Pick<
    ReturnType<typeof useDiscoverMarkerController>,
    | 'selectedMarkerListing'
    | 'selectMarkerSibling'
    | 'clearMarkerPopoverFromUrl'
    | 'isMarkerPopoverUrlBacked'
    | 'hydrateSelectedMarkerFromUrl'
  >;
}

/**
 * Issue #2142 (correction pass) — THE MARKER POPOVER, moved verbatim off
 * MapDiscovery.tsx.
 *
 * Owns, as one capability, everything that decides whether a listing-marker
 * popover exists, which ordered marker set it steps through, and how it
 * reconciles with the `listing=` URL param:
 *   - the eligibility gate (issue #1798 PR-C / #1973 / #1956 PR-4 AREA-leaf arm)
 *   - `effectiveMapLayerCategory`, the node-leaf-aware layer recompute used
 *     ONLY by resolveMarkerPopover
 *   - `resolveMarkerPopover` (issue #1810 Stage 2A MODEL A) — SOLE OWNER of
 *     the #2139 coincident-marker separation ORDERING, since
 *     `currentMapMarkerListings` is the one ordered set both the map render
 *     and the stepper index into
 *   - the issue #1939 URL <-> popover reconciliation effect (all three
 *     branches: hydrate / reverse-clear / stale-different-id clear)
 *   - `handleStepMarkerListing` (issue #1810) — must never gain a camera call
 *
 * LOCK-STEP INVARIANT (risk R1): `isMarkerPopoverEligible` here and the
 * click-CAPTURE gate in useMarkerSelection.ts import the SAME
 * `markerPopoverEligibility` function and are fed the SAME
 * `isNodeAreaLeafActive`. They must never drift — that drift WAS bug #1798.
 */
export function useDiscoverMarkerPopoverController({
  nav,
  viewport,
  isNodeAreaLeafActive,
  mapLayerCategory,
  effectiveSelectedArea,
  isGroupResultsState,
  isNodeListingsState,
  mapZoom,
  mapReady,
  isAuthenticated,
  groupResultsMarkers,
  nodeListingsMarkers,
  markerListings,
  areaMarkerListings,
  schoolRadiusFallbackMarkers,
  isLoadingAreaListings,
  isErrorAreaListings,
  markersLoading,
  markerSelection,
}: UseDiscoverMarkerPopoverControllerParams) {
  const {
    selectedMarkerListing,
    selectMarkerSibling,
    clearMarkerPopoverFromUrl,
    isMarkerPopoverUrlBacked,
    hydrateSelectedMarkerFromUrl,
  } = markerSelection;

  // Issue #1956 PR-4 (gate 2) — useDiscoverJourneyPredicates derives
  // mapLayerCategory purely from URL state via toLayerInput/
  // selectDiscoverMapLayer internally, so it cannot see the in-memory node
  // bridge and still resolves 'area-group-bubbles' for a canonical AREA leaf
  // (legacy `areaKey` URL param null). Recomputes the SAME real
  // selectDiscoverMapLayer with the CONTAINED `nodeAreaLeaf` field
  // (discoverLayerRegistry.ts) set, used ONLY for the resolveMarkerPopover
  // call below — mapLayerKind/mapLayerCategory themselves are left untouched
  // for their other pre-existing consumers.
  const effectiveMapLayerCategory: DiscoverMapLayerKind = isNodeAreaLeafActive
    ? selectDiscoverMapLayer(
        { ...toLayerInput({ ...nav, viewport } satisfies DiscoverUrlState), nodeAreaLeaf: true },
        'overview',
      )
    : mapLayerCategory;

  // Issue #1798 PR-C — canonical listing-marker popover RENDER-eligibility predicate.
  // Previously this gate (formerly isAreaFirstPopoverEligible || isGroupResultsPopoverEligible)
  // required journey === 'area-first' plus specific panelContent values — strictly narrower
  // than the click-CAPTURE gate (handleMarkerClickWithPosition), which already permits
  // journeyless and other non-agri-first states. That drift meant a listing marker click
  // could already write markerPixelPos/selectedMarkerListing and drive the #1547 right-panel
  // scroll+highlight, yet the popup itself would silently never render — the reported #1798
  // "popup missing" bug. Fixed by reusing the SAME condition as the capture gate so the two
  // can no longer drift apart. Still excludes agri-first (own peek/panel flow).
  //
  // Issue #1973 — the pure school-first journey (a school + radius selected, no area) is
  // cross-area: areaKey is null in that state, so the original single-clause predicate
  // (which required areaKey != null) rejected it even after a naive schoolId/journey
  // clause flip. Extended to an additive OR: the ORIGINAL area-gated clause is unchanged
  // (still covers area-first, and area-first area+school combined per #1738), plus a new
  // areaKey-FREE branch admitting school-first once a school is selected. Area/cluster/count
  // marker clicks are unaffected: they never set markerPixelPos, so the
  // `selectedMarkerListing != null && markerPixelPos != null` conjunction at the render site
  // still keeps them popup-free regardless of this predicate. MUST stay byte-identical
  // to the capture-gate predicate in useMarkerSelection.ts's handleMarkerClickWithPosition —
  // see that function's comment — or the two can drift apart again (the exact #1798 bug).
  const isMarkerPopoverEligible = computeMarkerPopoverEligible({
    journey: nav.journey,
    areaKey: nav.areaKey,
    schoolId: nav.schoolId,
    isNodeAreaLeaf: isNodeAreaLeafActive,
  });

  // Issue #1824 Slice S10b — the marker-resolve + stepper cluster (Issue
  // #1810 Stage 2A, MODEL A user-locked model, see approved-plan.toml
  // [user_decision]) lives in the pure resolveMarkerPopover module. Issue
  // #1939 — it must be declared before the URL-hydration effect below, which
  // needs currentMapMarkerListings as a real reactive dependency.
  const { currentMapMarkerListings, markerPopoverStepper } = resolveMarkerPopover({
    mapLayerCategory: effectiveMapLayerCategory,
    selectedArea: effectiveSelectedArea,
    isGroupResultsState,
    isNodeListingsState,
    mapZoom,
    areaLayerMaxZoom: AREA_LAYER_MAX_ZOOM,
    isAuthenticated,
    journey: nav.journey,
    schoolId: nav.schoolId,
    groupResultsMarkers,
    nodeListingsMarkers,
    markerListings,
    areaMarkerListings,
    schoolRadiusFallbackMarkers,
    isLoadingAreaListings,
    isErrorAreaListings,
    markersLoading,
    isMarkerPopoverEligible,
    selectedMarkerListing,
  });

  // Issue #1939 — resolves the URL `listing` param against the SAME ordered
  // marker set PropertyMap renders (currentMapMarkerListings) and the panel
  // scroll/stepper already trust (Issue #1810 MODEL A). null whenever the id
  // is absent, not (yet) present in the loaded set, or filtered off the map
  // — the hydration effect below treats all of those as LEAVE_PARAM_NO_POPOVER
  // (safe no-op), never an error/toast. Gives the effect a stable,
  // identity-comparable dependency instead of the raw currentMapMarkerListings
  // array, which re-allocates on every filter/journey/area change (qa-fast
  // risk register item 3) — recomputing this memo on those changes is cheap
  // (an O(n) find over a small array); the EFFECT below only re-runs when the
  // *resolved result* actually changes.
  const urlHydratedMarkerListing = useMemo(
    () =>
      nav.selectedListing
        ? (currentMapMarkerListings.find((l) => l.id === nav.selectedListing) ?? null)
        : null,
    [nav.selectedListing, currentMapMarkerListings],
  );

  // Issue #1939 — URL → popover restore (Back/Forward/hard-refresh/deep-link).
  // The click/sibling/show-in-list handlers (useMarkerSelection) only ever
  // SET selectedMarkerListing/markerPixelPos from a user gesture; nothing
  // hydrated them from nav.selectedListing on mount or on a later
  // data/map-ready transition, so a deep-linked/refreshed `?listing=<uuid>`
  // restored the marker highlight (URL-driven — DiscoverMapCanvas passes
  // nav.selectedListing straight through to PropertyMap's
  // selectedListingId prop, no local state involved) but never the popover
  // card itself (gated on the two local states above).
  //
  // Reactive by construction: fires again whenever urlHydratedMarkerListing
  // (marker-data availability), isMarkerPopoverEligible (atomic journey
  // gate — school/agri-first never call hydrateSelectedMarkerFromUrl, so
  // neither local state is ever set for them), or mapReady flips — so a cold
  // hard-refresh where markers/area data resolve a render or two after mount
  // still restores the card once they do, instead of only checking once on
  // mount. hydrateSelectedMarkerFromUrl itself is idempotent (no-op if
  // already selected) and PERSISTENTLY suppressed (not just for one cycle)
  // right after showMarkerInList closes the card for the same id — including
  // across repeated re-fires of this effect caused by resolveMarkerPopover's
  // deliberately non-memoized currentMapMarkerListings — until
  // nav.selectedListing genuinely changes away from that id. See
  // useMarkerSelection's listTransitionSuppressIdRef for the full contract.
  //
  // Issue #1939 code-review F1 — REVERSE sync. When the URL genuinely no
  // longer carries a `listing` id (nav.selectedListing == null — e.g.
  // Back navigation past the point the id was pushed), the popover must
  // close even though nothing here ever called handlePopoverDismiss (which
  // owns the FORWARD direction: local state → URL). Deliberately keyed off
  // nav.selectedListing, not urlHydratedMarkerListing, so a same-id
  // marker that's momentarily absent from currentMapMarkerListings (e.g.
  // mid-filter-recompute) does NOT close a popover the URL still claims —
  // that transient-miss case is instead covered by
  // hydrateSelectedMarkerFromUrl's own bounded rAF retry (F2) for the DOM
  // node not being painted yet.
  //
  // Issue #1973 rev-2 (A1 fix) — this comment's original "cannot race the
  // click path" claim was WRONG for pure school-first: handleSelectMarkerListing
  // deliberately does NOT write the URL `listing` param there (the
  // #1547-deferred design), so a school-first click sets selectedMarkerListing
  // while nav.selectedListing stays null — landing exactly in this
  // branch and wiping the click-set popover (the reverse-sync clear-race).
  // The rev-1 gate fix (admitting pure school-first into isMarkerPopoverEligible)
  // is what made this branch reachable for that state at all; previously the
  // effect early-returned via the eligibility check above. Fixed by
  // isMarkerPopoverUrlBacked(): only clear here when the popover currently
  // tracked is URL-backed (source !== 'click') — i.e. skip the clear ONLY for
  // a pure click-set popover. Area-first (and agri-first/#1738 combined)
  // clicks ARE URL-backed (they write `listing`), so this guard does NOT
  // regress their Back-navigation close — see
  // MapDiscovery.issue1973.schoolFirstMarkerPopup.test.tsx AC11.
  //
  // Issue #1939 rework F3 — third reconciliation branch: the URL names a
  // listing id (nav.selectedListing != null) that is NOT (yet)
  // resolvable against the current marker set (urlHydratedMarkerListing ==
  // null), AND a DIFFERENT listing's popover is currently showing locally
  // (selectedMarkerListing != null && selectedMarkerListing.id !==
  // nav.selectedListing). Without this branch the effect did nothing
  // in this state, leaving the screen showing the OLD listing's popover
  // while the URL/selection had already moved to a new, unresolvable one.
  //
  // The `selectedMarkerListing?.id !== nav.selectedListing`
  // discriminator is what separates this (F3: a genuinely DIFFERENT id,
  // stale) from F2's bounded rAF retry (SAME id, still resolving/painting —
  // must be left alone to keep polling). Two sub-cases both correctly fall
  // out of requiring selectedMarkerListing to be non-null AND mismatched:
  //   - Same id mid-retry (F2): selectedMarkerListing is either still null
  //     (nothing painted yet) or already equals the target id once F2
  //     succeeds — this branch's `!= null` guard or id-equality guard skips
  //     it either way, so F2's retry is never torn down here.
  //   - Fresh deep-link to an unresolvable id with no popover open yet:
  //     selectedMarkerListing is null, so `selectedMarkerListing != null`
  //     is false and this branch is a no-op — it must NOT cancel a
  //     legitimately in-flight F2 retry for that same fresh id.
  // Only when a DIFFERENT listing is genuinely still displayed does this
  // branch fire, clearing it via clearMarkerPopoverFromUrl (which itself
  // cancels any in-flight retry for the OLD id FIRST, then clears local
  // state — see that method's JSDoc) while deliberately leaving the URL's
  // `listing` param untouched (no clearSelectedListing call) so that once
  // the new id resolves (urlHydratedMarkerListing becomes non-null on a
  // later render), the existing happy-path branch above hydrates it
  // normally, with its own F2 retry if needed.
  useEffect(() => {
    if (!isMarkerPopoverEligible || !mapReady) return;
    if (urlHydratedMarkerListing) {
      hydrateSelectedMarkerFromUrl(urlHydratedMarkerListing);
      return;
    }
    if (nav.selectedListing == null) {
      // Issue #1973 rev-2 (A1) — skip the clear ONLY for a pure click-set
      // (school-first) popover, which was never URL-backed to begin with.
      // A URL-backed popover (area-first/#1738 combined, or a hydrated
      // deep-link) still closes here, unconditionally.
      if (isMarkerPopoverUrlBacked()) {
        clearMarkerPopoverFromUrl();
      }
      return;
    }
    if (selectedMarkerListing != null && selectedMarkerListing.id !== nav.selectedListing) {
      clearMarkerPopoverFromUrl();
    }
  }, [
    isMarkerPopoverEligible,
    mapReady,
    urlHydratedMarkerListing,
    hydrateSelectedMarkerFromUrl,
    nav.selectedListing,
    clearMarkerPopoverFromUrl,
    isMarkerPopoverUrlBacked,
    selectedMarkerListing,
  ]);

  // Issue #1810 (Stage 2A) — steps the popup to the sibling at index±1 within
  // the ratified MODEL A set. Updates selectedMarkerListing + the shared
  // `listing` URL param (so the panel card highlight/scroll follows), and
  // makes NO camera call of any kind — MODEL B (on-map markers + panInside)
  // was explicitly rejected by the user; this function must never gain one.
  const handleStepMarkerListing = (direction: -1 | 1) => {
    if (markerPopoverStepper == null) return;
    const sibling = currentMapMarkerListings[markerPopoverStepper.index + direction];
    if (!sibling) return;
    selectMarkerSibling(sibling);
  };

  return {
    effectiveMapLayerCategory,
    isMarkerPopoverEligible,
    currentMapMarkerListings,
    markerPopoverStepper,
    urlHydratedMarkerListing,
    handleStepMarkerListing,
  };
}
