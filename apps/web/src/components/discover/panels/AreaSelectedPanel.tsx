import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ChevronLeft,
  Layers,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  X,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { PropertyCard } from '../PropertyCard';
import { AreaFirstBreadcrumb } from '../AreaFirstBreadcrumb';
import type { DiscoverJourney, DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { deriveDiscoverEmptyStateCopy } from '../emptyStateCopy';
import { StartOverButton } from '../StartOverButton';
import { useDiscoverActions, useDiscoverNav, useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { AreaSetSelectedHeader, AreaSetTwoTileRow, DrawSearchAreaEntry } from './AreaSetSelectedExtras';
import { AreaZeroResultRecovery } from './AreaZeroResultRecovery';
import { AreaSelectedPanelScopeBar } from './AreaSelectedPanelScopeBar';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import { SCOPE_TITLE } from '@/features/discover/presentation/scopeTitles';
import type { CommercialSubtype } from '@/lib/listing-constants';
import {
  usePropertyFilterGroups,
  PropertyFilterGroups,
  withoutCommercialFamilyTokens,
} from './PropertyFilterGroups';

// Quick filter options (hardcoded MVP). 'All' is a virtual chip that clears the
// property-type selection — it is not a property_type value.
//
// Issue #2605 — this chip's token is `residential_plot`, NOT the generic `land` stored type.
// `land` and `residential_plot` are distinct, independently-allowlisted values in
// `PropertyType.java` / `DiscoverFilterNormalizer.ALLOWED_PROPERTY_TYPES`; the buyer-facing
// inventory this chip is meant to surface is stored as `residential_plot` (see V103), so
// emitting `land` filtered to a canonical type with no matching rows and returned zero results
// against inventory that exists. `resolvePrimaryAreaMeaning`/`isPlotOnlySelection`
// (primaryAreaLabels.ts / bedroomApplicability.ts) already treat both tokens as PLOT, so this
// change needed no change on that side.

interface AreaSelectedPanelProps {
  selectedArea: AreaPoint;
  areaListings?: DiscoverCityListingItem[];
  /**
   * Issue #1817 (code-review follow-up, AC5) — precomputed via the SAME
   * formatDiscoverBadgeCopy(discoverBadge, ...) call the map badge pill renders from
   * (MapDiscovery.tsx), so this panel's result-summary stat can never diverge from the
   * map badge (design §6 "Area selected + filters" → `M of N match in {scope}`).
   * Optional: falls back to a lightweight local "{count} verified properties in {area}"
   * default when omitted, so existing callers/tests that don't wire the full selector
   * keep working unchanged.
   */
  areaResultSummaryText?: string | null;
  isLoadingListings?: boolean;
  isAuthenticated?: boolean;
  onBack?: () => void;
  onStartOver?: () => void;
  journey?: DiscoverJourney | null;
  filtersContent?: React.ReactNode;
  trendsHref?: string;
  isFetching?: boolean;
  isInitialLoading?: boolean;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  /** Active context chips forwarded below the header (seller/date/boolean filters). */
  activeContextChips?: React.ReactNode;
  /** Current property filters. */
  filters?: PropertyFilters;
  /** Called when property filters change (from quick chips or clear action). */
  onFiltersChange?: (filters: PropertyFilters) => void;
  /** Called for genuine journey switches (kept for non-CTA usage). */
  onSelectJourney?: (journey: DiscoverJourney) => void;
  /**
   * Called when the user clicks the "Add a school in this area" CTA (Issue #1157).
   * Enters the area-first school-picking sub-step WITHOUT flipping the journey, so
   * Back returns to area-selected instead of deleting the area.
   */
  onAddSchool?: () => void;
  /** Issue #1494 — current buy/rent intent for summary/empty-state copy. Default 'buy'. */
  intent?: DiscoverIntent;
  /**
   * Issue #1547 — id of the currently selected listing (URL/parent-derived, from the
   * `listing` URL param). Drives the copper selected card frame + scroll-into-view.
   * Null/undefined = no selection.
   */
  selectedListingId?: string | null;
  /**
   * Issue #2616 — ephemeral hover/focus id driven from the map marker side.
   * When set, the card matching this ID receives the hover highlight state.
   */
  hoveredListingId?: string | null;
  /** Issue #1547 — called when a card is activated, to sync the selected marker. */
  onSelectListing?: (id: string) => void;
  /**
   * Issue #1547 — ephemeral hover/focus signal for card→marker highlight.
   * Called with the listing id on card mouseenter/focus, null on mouseleave/blur.
   */
  onHoverListing?: (id: string | null) => void;
  // ── Issue #1606 — area-first results redesign ──────────────────────────────
  /** Human-readable city label (e.g. "Udupi") for the breadcrumb + controls card. */
  cityLabel?: string;
  /** Selected group display name (e.g. "University Belt"); null when group-less. */
  groupName?: string | null;
  /** Region/scope name (e.g. "North Bangalore"); null when scope-less. */
  regionName?: string | null;
  /** City slug — drives the in-panel city selector. */
  city?: string;
  /** Called when the user changes city from the in-panel controls card. */
  onCityChange?: (city: string) => void;
  /** Called when the user changes buy/rent intent from the in-panel controls card. */
  onIntentChange?: (intent: DiscoverIntent) => void;
  /** Breadcrumb: navigate to the Discover landing (Home crumb). */
  onCrumbHome?: () => void;
  /** Breadcrumb: navigate to the city's area-first landing (city crumb). */
  onCrumbCity?: () => void;
  /** Breadcrumb: navigate back to the region's landing (region crumb). */
  onCrumbRegion?: () => void;
  /** Breadcrumb: navigate back to the selected group's drill-down (group crumb). */
  onCrumbGroup?: () => void;
  /**
   * Issue #2023 code-review follow-up — whether the "Ready to move" quick
   * filter chip has any effect on the listings actually shown by the calling
   * surface. Defaults to `true` so existing callers (e.g. NodeListingsSurface,
   * which forwards `readyToMove` to useDiscoverListings via
   * buildDiscoverSearchParams) keep their current behavior unchanged. Callers
   * whose listings hook has no readyToMove/possessionStatus param (e.g. the
   * default area-leaf surface backed by useDiscoverCityListings) must pass
   * `false` — the chip then renders visually disabled and inert instead of
   * silently toggling active with no effect on the results.
   */
  isReadyToMoveSupported?: boolean;
  /**
   * Issue #2450 — whether the calling surface's listings hook can actually consume a Commercial
   * SUBTYPE narrowing. Follows the `isReadyToMoveSupported` precedent directly above, and for the
   * same honesty reason, but **defaults FALSE** where that one defaults true.
   *
   * WHY FALSE WAS THE RIGHT DEFAULT, AND WHY BOTH PRODUCTION SITES NOW PASS IT TRUE (#2572). The
   * original reasoning: this panel's card list is fed by `useDiscoverCityListings`, which carried
   * no `commercialSubtypes` param at all, so a buyer picking Commercial → Warehouse would see
   * results **unchanged** — worse than an empty list, because zero at least signals that something
   * happened while unchanged results signal a control that did nothing.
   *
   * BOTH HALVES OF THAT PREMISE HAVE SINCE GONE, and this is the block a reader consults to decide
   * whether the flag may be passed, so it must not keep arguing against the answer:
   *   - #2533 removed the singular-`propertyType` half: the hook now accepts and sends the full
   *     multi-value selection.
   *   - #2509 removed the subtype half. `useDiscoverCityListings` DOES carry `commercialSubtypes`
   *     (a repeated param, and in the react-query key), and `CityAreaListingsController` binds,
   *     validates and forwards it. The sentence that stood here — "the subtype gap above is what
   *     still keeps this flag false" — described a gap that no longer exists.
   *
   * So shipping it reachable now AVOIDS the inert-control class #2450 exists to remove, rather
   * than pinning it: the control narrows. The DEFAULT stays false, because a surface whose hook
   * cannot consume the axis must still be able to say so; what changed is that the two production
   * call sites (`NodeListingsSurface`, `DiscoverAreasJourneyPanel`) pass it true.
   *
   * GATE-OFF IS "NO FAMILY ROW", NOT "RESIDENTIAL ALONE" (owner ruling on PR #2500, Option A).
   * While this is false the panel renders NO family row and NO Commercial subtype control — no
   * family chips, no subtype row, and no subtype entry in the selected-filter chip row. A
   * one-option Residential-only selector was explicitly REJECTED: a lone Residential chip is
   * indistinguishable from "this product has no commercial inventory", which is a claim about the
   * catalogue that the capability flag is not making.
   *
   * THIS CLAIM WAS NARROWED IN #2555, and the correction is recorded rather than silently applied.
   * It previously said today's buyer surface is preserved "byte-for-byte". That is no longer true
   * and must not be read as a guarantee. #2555 changes the capability-OFF surface in SEVEN ways.
   * Items 4 and 5 need a derived-Commercial selection, which is reachable because `activeFamily` is
   * DERIVED from filters independently of this flag (see `commercialFromFilters`) — an inbound
   * `?subtype=SHOP` or `?type=warehouse` reads as Commercial even while no Commercial control
   * renders. Items 1, 2, 3, 6 and 7 need no such URL:
   *
   *   1. a removable selected-filter chip row, rendered on ANY filtered state;
   *   2. the AREA (SQ FT) preset row, which is ungated and so renders for every buyer, and which
   *      is LIVE on both surfaces as of `65b5dc7c`. Until that commit it DIVERGED: the two
   *      projections feeding this panel's `filters` prop omitted the area keys and
   *      `useDiscoverCityListings` had no area param, so the chip could not latch and the CARDS did
   *      not narrow — while `useDiscoverMapData` forwarded `filters` WHOLESALE to
   *      `useDiscoverFilteredMarkers`, which hands them to `buildDiscoverSearchParams`, which DOES
   *      emit `areaMinSqft`, so a signed-in buyer's MAP narrowed against a list that ignored the
   *      bound. `65b5dc7c` added the keys to both branches of `resolveEffectiveAreaLeafFilters`, to
   *      `NodeListingsSurface`'s inline twin and its memo deps, to the `cityListingsQueryParams`
   *      `Pick<>` union and return object, and to `useDiscoverCityListings`' params, react-query key
   *      and URL append. The divergence is closed; this is still the ONE part of #2555 that
   *      "dormant behind the capability" does not cover. See the row's own comment for the chain;
   *   3. family/intent-aware Budget bands, which change the band labels where one fixed list
   *      stood — BUY as well as RENT: `?type=warehouse` with `intent=buy` renders the Commercial
   *      buy bands (≤ ₹1 Cr / ≤ ₹2.5 Cr / ≤ ₹5 Cr) where the merge base showed ≤ ₹50L / ≤ ₹80L /
   *      ≤ ₹1.2Cr;
   *   4. the Bedrooms row, previously UNCONDITIONAL, is now hidden under a derived-Commercial
   *      selection — the departure with the most behaviour behind it, since such a buyer loses a
   *      control they have in production today. The value stays visible and removable via the
   *      Bedrooms chip in the row named in (1), which is why that chip renders regardless of
   *      `showBedroomsRow`;
   *   5. the possession chip's copy, previously the literal "Ready to move", now reads
   *      "Ready to occupy" under a derived-Commercial selection; and
   *   6. the EXISTING Budget chips are restyled and their label moves: active state navy
   *      (`bg-primary`) → copper, square (`px-3`) → pill (`rounded-full px-3.5`), and the `Budget`
   *      label leaves its own block for the trailing edge of the AREA row. Visual only — but it is
   *      UNCONDITIONAL, needing neither a derived-Commercial URL nor any filter at all, so it is
   *      the departure that reaches the most buyers; and
   *   7. an area-only narrowing now COUNTS as an active filter. `hasPropertyFilters` and
   *      `handleClearPropertyFilters` both gained the area bounds, so the zero-result state
   *      routes to the filtered cause and offers "Clear filters" where the merge base — which
   *      ignored the axis in both readers — claimed "a real area with nothing listed today, not a
   *      filtered-out result" and offered nothing. A behaviour change on the capability-OFF
   *      surface, and a fix rather than a regression: it is (2)'s tail, since the ungated AREA row
   *      is what makes an area-only narrowing reachable in one click.
   *
   *      RECONCILED AFTER `65b5dc7c`. This item was written while (2) still diverged, and it was
   *      accurate then for a narrower reason than it reads now: the row made an area-only state
   *      REACHABLE, so classifying it as filtered was right, but on the card surface no such state
   *      was actually PRODUCED — the projection dropped the bound before it could empty a list. Now
   *      that the projections forward it, the same sentence describes a real narrowing: an
   *      area-only zero-result is genuinely produced by this row, and the reader routing that sends
   *      it to the filtered cause is load-bearing rather than anticipatory. The item did not become
   *      true; it became true for the stronger reason.
   *
   * What the gate still guarantees is the sentence above — no Commercial *control* is reachable:
   * no family row, no subtype row, no subtype chip. It does NOT guarantee an unchanged surface.
   *
   * TREAT THIS LIST AS VERIFIED-AT-A-HEAD, NOT AS SELF-EVIDENTLY COMPLETE. It has now been wrong
   * THREE times: the first attempt named only (1); the second declared itself "deliberate" while
   * missing (4) and (5); the third said FIVE and missed (6), the most reachable of them all. Every
   * miss was found the same way — by diffing what actually renders with the flag off against the
   * merge base — and every miss was produced the same way, by reasoning about intent instead. If
   * you are relying on this for the flag-flip decision, re-derive it; do not trust this paragraph.
   *
   * AND A FOURTH FAILURE MODE, distinct from the three above: an item can be VERIFIED-CORRECT when
   * written and go false later without anyone touching it. (2) and (7) both did, overtaken by
   * `65b5dc7c` two commits into this same branch — not by a distant lane. Incompleteness is caught
   * by re-deriving the list; STALENESS is not, because re-deriving a list you believe is settled is
   * exactly the step a reader skips. Nothing in the typechecker, the linter or the suite fails when
   * a comment stops describing the code. The only defence is to treat a behaviour change and its
   * comment as one edit, which is why the fix commit and these corrections are recorded together.
   *
   * IT HAS NOW FLIPPED (Issue #2572). This previously read "It flips to true once the card path
   * can consume a subtype — which is #2533's multi-value narrowing work. #2533 must land before
   * this is ENABLED". #2533 landed, #2509 landed, and #2552 / #2553 / #2555 closed the enablement
   * gate, so both production call sites now pass this true and the Commercial family is reachable.
   * The paragraph is kept in its corrected form rather than deleted because the CONDITION it named
   * is the right one to re-check if anyone adds a third call site: pass this true only from a
   * surface whose listings hook actually consumes the subtype.
   */
  isCommercialSubtypeSupported?: boolean;
  /**
   * Issue #2015 — true when the panel is displaying a committed VIEWPORT
   * `resultScope` ("Search this area") rather than the selected AREA_SET.
   * `selectedArea`/`areaLabel` stay populated in this state (the area chip
   * still shows "Return to {area}" elsewhere), but the headline/sub-copy
   * below must not claim the listings are scoped to that area anymore —
   * they're scoped to the panned/zoomed map viewport instead. Defaults to
   * false so every existing AREA_SET caller/test is unaffected.
   */
  isViewportScope?: boolean;
  /**
   * Issue #2018 requirement A ("error is not empty") — true when the listings
   * request this panel is rendering FAILED (5xx/timeout/network), as opposed
   * to succeeding with zero rows.
   *
   * The distinction is load-bearing, not cosmetic: the zero-result recovery
   * state states "no matching listings in {scope}" as a fact about the
   * marketplace and offers nearby areas that "have matches" — claims this
   * panel cannot make about a query that never came back. So when this is
   * true the panel renders an error treatment instead:
   *   - with no results to fall back on -> the explicit request-failure state
   *     + Retry (`area-listings-error`);
   *   - with a retained last-good set (`useDiscoverCityListings` uses
   *     `keepPreviousData`, so a refetch failure commonly leaves one) -> the
   *     cards stay and an inline banner + Retry appears above them
   *     (`area-listings-retry-banner`).
   *
   * Defaults false, so every existing caller behaves exactly as before.
   */
  /**
   * Issue #2018 slice 3 — starts a NEW polygon drawing for the zero-result
   * "Adjust boundary" action. Threaded from `useDiscoverPageState`'s
   * `handleRedrawPolygon` (#2419 PR-1) through the panel surface model.
   * Commits nothing on its own. Omitted renders no row rather than a dead
   * control.
   */
  onRedrawPolygon?: () => void;
  isListingsError?: boolean;
  /**
   * Re-issues the failed listings request. Omitted renders the error states
   * without a Retry button rather than a dead one — the same honesty rule
   * `isReadyToMoveSupported` follows above.
   */
  onRetryListings?: () => void;
}

export function AreaSelectedPanel({
  selectedArea,
  areaListings,
  areaResultSummaryText,
  isLoadingListings,
  isAuthenticated = false,
  onBack,
  onStartOver,
  journey,
  filtersContent,
  trendsHref,
  isFetching = false,
  isInitialLoading = false,
  searchQuery = '',
  onSearchChange,
  activeContextChips,
  filters = {},
  onFiltersChange,
  onSelectJourney,
  onAddSchool,
  intent = 'buy',
  selectedListingId = null,
  hoveredListingId = null,
  onSelectListing,
  onHoverListing,
  cityLabel,
  groupName,
  regionName,
  city,
  onCityChange,
  onIntentChange,
  onCrumbHome,
  onCrumbCity,
  onCrumbRegion,
  onCrumbGroup,
  isReadyToMoveSupported = true,
  isCommercialSubtypeSupported = false,
  isViewportScope = false,
  onRedrawPolygon,
  isListingsError = false,
  onRetryListings,
}: AreaSelectedPanelProps) {
  const navigate = useNavigate();
  const areaLabel = selectedArea.areaLabel;
  const intentNoun = intent === 'rent' ? 'rent' : 'sale';

  // Issue #1547 — scroll the selected card into view when selection is driven from the
  // map marker side. Guards the missing-ref case so a marker click never crashes.
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  useEffect(() => {
    if (!selectedListingId) return;
    const node = cardRefs.current.get(selectedListingId);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedListingId]);

  const handleAddSchool = useCallback(() => {
    onAddSchool?.();
  }, [onAddSchool]);

  // Issue #2628 — SINGLE canonical hook instance. AreaSelectedPanel needs `activeFamily` /
  // `hasPropertyFilters` / `handleClearPropertyFilters` / `commercialFromFilters` for its own
  // heading and zero-result-recovery UI below, and `setFamilyOverride` / the memory refs for the
  // zero-result relaxation wrapper further down — so this is the ONE call, and every value the
  // rest of this component needs comes off it rather than a second, independent call (see the
  // file-header note in PropertyFilterGroups.tsx on why two calls would split-brain).
  const propertyFilterGroups = usePropertyFilterGroups({
    filters,
    onFiltersChange,
    intent,
    isReadyToMoveSupported,
    isCommercialSubtypeSupported,
  });
  const {
    activeFamily,
    hasPropertyFilters,
    handleClearPropertyFilters,
    commercialFromFilters,
    setFamilyOverride,
    residentialMemoryRef,
    commercialMemoryRef,
  } = propertyFilterGroups;

  const resolvedCityLabel = cityLabel ?? city ?? '';
  const count = areaListings?.length ?? 0;

  // Issue #2596 — result language follows the family, per the updated kit's §Result language:
  // Commercial reads "Commercial properties in X" with the count noun "commercial listings",
  // and never borrows a Residential noun.
  //
  // STRINGS ONLY, deliberately. `count` is still `areaListings.length` and nothing about how it
  // is computed, fetched or filtered changes here — this renames what the buyer reads, not what
  // the number means.
  //
  // ONE FAMILY AUTHORITY PER RENDER (review 5210279153, F2). These previously keyed off
  // `commercialFromFilters` while `showSubtypeRow` keys off `activeFamily`. Those are NOT the
  // same predicate: `activeFamily` is Commercial the moment the buyer CLICKS the chip (via
  // `familyOverride`), whereas `commercialFromFilters` only becomes true once that emission
  // round-trips back as props. The two could therefore disagree inside a single render — an open
  // Commercial subtype row with the chip pressed, above a heading still reading
  // "Properties in {area}".
  //
  // CONVERGED RATHER THAN DOCUMENTED. The alternative was to pin the divergence with a test, but
  // that would promote an incoherent frame into the contract. Keying both off `activeFamily`
  // makes the heading, the count noun and the subtype row describe the same family by
  // construction, which is the property actually wanted.
  //
  // This is not only a test-shape concern. Both production call sites are controlled, so the
  // emission does round-trip — but not until the NEXT render, and the old predicate made that one
  // render say Residential over an already-open Commercial subtype row.
  //
  // The empty-state and zero-result nouns still read `commercialFromFilters`, deliberately: they
  // describe a result set already FETCHED under the emitted filters, so the filters are the honest
  // source there, while these two describe the control surface the buyer is looking at right now.
  // They agree in every state a production call site can reach.
  //
  // The Residential wording is untouched, so the existing heading and hero assertions (which all
  // render the Residential default) keep passing on their own terms.
  const commercialFamilyActive = activeFamily === 'commercial';
  const headingNoun = commercialFamilyActive ? 'Commercial properties' : 'Properties';
  const countNoun = commercialFamilyActive
    ? count === 1
      ? 'commercial listing'
      : 'commercial listings'
    : intentNoun === 'rent'
      ? 'shown for rent'
      : 'shown for sale';

  // Issue #2017 — plural committed-header/two-tile-row for a multi-area
  // AREA_SET result scope. `nav.resultScope?.active` is the confirmed real
  // access pattern for the #2016 committed scope (see useDiscoverMapDataController,
  // AreaSetDraftContext, DiscoverMapCanvas for the same idiom). A single-area
  // AREA_SET commit (or no AREA_SET commit at all) leaves `multiAreaKeys` null
  // and this file's existing single-area JSX renders completely unchanged.
  const nav = useDiscoverNav();
  const actions = useDiscoverActions();
  const shell = useDiscoverShell();
  const activeScope = nav.resultScope?.active ?? null;
  const multiAreaKeys =
    activeScope?.kind === 'AREA_SET' && activeScope.areaKeys.length > 1 ? activeScope.areaKeys : null;

  // Issue #2018 slice 3 — which KIND of scope owns these results, derived from
  // the committed scope this component already reads. Purely additive: it is
  // consumed only by the zero-result recovery, so every populated-results
  // render path is untouched.
  //
  // POLYGON is read straight off `activeScope` because, unlike VIEWPORT, it
  // has no `isPolygonScope` prop anywhere to thread — both flags in
  // useDiscoverMapData are gated on `kind === 'VIEWPORT'`, which is exactly
  // why a committed polygon previously fell through to the area-shaped path.
  // `isViewportScope` stays the source of truth for VIEWPORT so this cannot
  // disagree with the heading/sub-copy above, which already key off it.
  const resultScopeKind: 'AREA' | 'POLYGON' | 'VIEWPORT' = isViewportScope
    ? 'VIEWPORT'
    : activeScope?.kind === 'POLYGON'
      ? 'POLYGON'
      : 'AREA';

  // Issue #2478 (step 1) — panel-side scope bar for a committed VIEWPORT or
  // POLYGON result scope, mirroring ActiveScopeChip's "Return to <Area>"
  // logic verbatim (see that component's doc comment for the full
  // reasoning).
  //
  // AREA_SET `previous` area-name resolution (`previousAreas` below) comes
  // from a dedicated `useDiscoverAreas` call keyed on
  // `city || nav.city || DEFAULT_CITY` — the same idiom already used twice
  // further down (AreaSetSelectedHeader, AreaZeroResultRecovery); see that
  // doc comment for why `||` (not `??`) is required. This was previously
  // hardcoded to `[]`, which silently fell back to the generic "Return to
  // previous area" label for every AREA_SET previous scope — the exact bug
  // class #2015 MUST-HAVE #3 fixed in ActiveScopeChip. This closes the
  // panel-side regression to match.
  //
  // Camera-fit on Return (ActiveScopeChip's `publishCameraIntent` /
  // `computeGroupBounds` branch):
  //   - `previous.kind === 'VIEWPORT' | 'POLYGON'`: ActiveScopeChip's own
  //     `handleReturn` has no camera-fit branch for these kinds either —
  //     this is reference parity, not a gap.
  //   - `previous.kind === 'AREA_SET'` with 2+ areas: already covered
  //     ambiently by useDiscoverMapDataController's multi-area AREA_SET
  //     auto-fit effect, which re-fires on any `resultScope` change
  //     regardless of which UI triggered it.
  //   - `previous.kind === 'AREA_SET'` with exactly 1 area: Issue #2480.
  //     `handleReturnToPreviousScope` below CANNOT safely call
  //     `shell.focusAreaSetMember`/`shell.fitAreaSet` synchronously right
  //     after `actions.commitResultScope(previous)` — those stable delegates
  //     close over whatever `AreaSetCameraActions` was registered as of the
  //     LAST render before the commit, i.e. they still read the PRE-commit
  //     `resultScope`, so a synchronous call would silently no-op against
  //     stale state. Instead, Return records a one-shot restore request via
  //     `shell.setAreaSetCameraRestoreRequest` (bound to the single areaKey
  //     it was issued for), which a POST-COMMIT effect in
  //     `useDiscoverMapDataController` consumes once the committed scope has
  //     actually changed, publishing the camera intent directly. See that
  //     effect's doc, and `DiscoverShellContextValue.getAreaSetCameraRestoreRequest`
  //     in context/types.ts, for the full reasoning.
  const resolvedAreasCity = city || nav.city || DEFAULT_CITY;
  const { data: discoverAreasData } = useDiscoverAreas(resolvedAreasCity);
  const previousResultScope = nav.resultScope?.previous ?? null;
  const previousAreas: AreaPoint[] =
    previousResultScope?.kind === 'AREA_SET'
      ? previousResultScope.areaKeys
          .map((key) => discoverAreasData?.areas.find((area) => area.areaKey === key))
          .filter((area): area is NonNullable<typeof area> => area != null)
          .map((area) => ({
            areaKey: area.areaKey,
            areaLabel: area.name,
            geo_center_lat: area.geoCenterLat,
            geo_center_lon: area.geoCenterLon,
            bbox:
              area.minLat != null && area.minLon != null && area.maxLat != null && area.maxLon != null
                ? ([
                    [area.minLat, area.minLon],
                    [area.maxLat, area.maxLon],
                  ] as [[number, number], [number, number]])
                : null,
            listingCount: area.listingCount,
          }))
      : [];
  const returnLabel = previousResultScope
    ? previousResultScope.kind === 'AREA_SET'
      ? previousAreas.length === 1
        ? `Return to ${previousAreas[0].areaLabel}`
        : previousAreas.length > 1
          ? `Return to ${previousAreas.map((area) => area.areaLabel).join(', ')}`
          : 'Return to previous area'
      : previousResultScope.kind === 'POLYGON'
        ? 'Return to previous search area'
        : 'Return to previous area'
    : null;
  const handleReturnToPreviousScope = useCallback(() => {
    // Per #2015 AC7, a scope-boundary restore is a PUSH transition (browser
    // back stays undoable) — intentionally no `{ history: 'replace' }`.
    actions.commitResultScope(previousResultScope);
    // Issue #2480 — single-area (N=1) AREA_SET camera restore. Cannot call
    // `shell.focusAreaSetMember`/`shell.fitAreaSet` synchronously here — see
    // the doc comment above. Instead, record a one-shot request that the
    // post-commit effect in useDiscoverMapDataController will consume once
    // the commit above has actually landed. N>1 AREA_SET and non-AREA_SET
    // previous scopes are intentionally left alone (see doc comment above).
    //
    // The target is resolved HERE, from `previousAreas` (already loaded by
    // this panel for the Return label above), not left for the consuming
    // effect to recompute later — see `AreaSetCameraRestoreRequest`'s doc in
    // context/types.ts for why that matters (deferred #2017 double-fire).
    // If the single area doesn't actually resolve in `previousAreas` (e.g.
    // areas data not loaded here either), issue no request at all — an
    // honest degradation, since the Return label already falls back to the
    // generic "Return to previous area" in that case too.
    if (
      previousResultScope?.kind === 'AREA_SET' &&
      previousResultScope.areaKeys.length === 1 &&
      previousAreas.length === 1
    ) {
      shell.setAreaSetCameraRestoreRequest({
        areaKey: previousAreas[0].areaKey,
        bounds: previousAreas[0].bbox,
        center: [previousAreas[0].geo_center_lat, previousAreas[0].geo_center_lon],
      });
    }
  }, [actions, previousAreas, previousResultScope, shell]);

  // "Edit areas" / "Add nearby areas" open the AREA_SET draft (Issue #2017;
  // Issue #2596 owner-directed rework) — `openAreaSetDraft()` is the single
  // cross-tree open signal all surfaces read to swap to AreaSetDraftPanel in-panel.
  const handleEditAreas = useCallback(() => {
    shell.openAreaSetDraft();
  }, [shell]);
  const handleClearAreas = useCallback(() => {
    actions.commitResultScope(null);
  }, [actions]);

  /**
   * Issue #2596 — remove ONE committed area from the right panel's chips.
   *
   * Commits the REMAINING keys, so the panel's chips, heading and count update immediately. This
   * is deliberately NOT the map overlay's behaviour: those chips edit the uncommitted DRAFT via
   * `commands.remove` and take effect only on "Show listings". Both read the same AREA_SET state,
   * so this introduces no second selection state — it acts at the committed layer rather than the
   * draft layer.
   *
   * Removing the LAST area clears the scope instead of committing an empty AREA_SET, which is not
   * a state the rest of the app models — the same call `handleClearAreas` makes above.
   */
  const handleRemoveCommittedArea = useCallback(
    (areaKey: string) => {
      const remaining = (multiAreaKeys ?? []).filter((key) => key !== areaKey);
      if (remaining.length === 0) {
        actions.commitResultScope(null);
        return;
      }
      actions.commitResultScope({ kind: 'AREA_SET', areaKeys: remaining });
    },
    [multiAreaKeys, actions],
  );

  const handleAddNearbyAreas = useCallback(() => {
    shell.openAreaSetDraft();
  }, [shell]);

  /**
   * The recommendation tiles that ride under the property search (Issue #2596).
   * Extracted to a local rather than inlined so the workflow group below can
   * ask whether it has ANY child before rendering its bordered container —
   * otherwise a caller that supplies neither `onSearchChange` nor a tile state
   * would paint an empty hairlined strip.
   *
   * AREA_SET (single committed area) ONLY. VIEWPORT scope renders the separate
   * CTA below instead — see that constant for why it is not in this group.
   */
  const areaRecommendationTiles: ReactNode =
    multiAreaKeys || isViewportScope ? null : (
      <AreaSetTwoTileRow
        primaryAreaName={selectedArea.areaLabel}
        primaryAreaKey={selectedArea.areaKey}
        // Same `city || nav.city || DEFAULT_CITY` resolution the plural header
        // above uses, for the same reason: `AreaLeafListingsSurface` passes
        // `cityLabel` but not `city`, and at a bare `/discover` URL `nav.city`
        // is itself `''`. See that prop's comment for the full rationale.
        city={city || nav.city || DEFAULT_CITY}
        // The AreaPoint the map journey supplies already carries the count;
        // `deriveAreaPointFromNode` (the node journey) does not. Passed as a
        // fallback so the tile can render a count on the very first paint,
        // before the shared areas query this row self-sources has resolved.
        fallbackSchoolCount={selectedArea.schoolCount}
        onAddSchool={onAddSchool ? handleAddSchool : undefined}
        onAddNearbyAreas={handleAddNearbyAreas}
      />
    );

  /**
   * VIEWPORT-scope "Add a school in this area" CTA (Issue #2015), kept at its
   * MERGE-BASE presentation — own bordered/padded wrapper, sitting directly
   * below the heading and above the property search.
   *
   * WHY THIS IS DELIBERATELY NOT IN THE WORKFLOW GROUP (#2601, owner ruling
   * "option D"). An earlier revision folded this CTA into the shared search +
   * tiles group, which stripped its standalone wrapper and moved it below the
   * search. That is a user-visible change to a surface NOBODY HAS BEEN ABLE TO
   * WITNESS: three gates independently failed to find any reachable route to
   * VIEWPORT scope, at either viewport, in either arm. Code review 5219381573
   * put the choice plainly — preserve the prior presentation, or owner-scope
   * the changed surface out; do not certify a PASS on a surface no one has
   * seen. The owner chose preserve.
   *
   * So this branch carries NO visual delta in this PR by construction, and
   * whoever fixes VIEWPORT reachability can re-open the question against a
   * surface that is still where they left it. The wrapper below is restored
   * byte-for-byte from `cdb3c7d0`.
   *
   * `isViewportScope` and `multiAreaKeys` are mutually exclusive in practice,
   * but the `!multiAreaKeys` guard is kept explicit so this can never
   * double-render alongside the plural header's own action row.
   */
  const viewportSchoolCta: ReactNode =
    !multiAreaKeys && isViewportScope && onAddSchool ? (
      <div className="border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={handleAddSchool}
          data-testid="add-school-cta"
          className="flex w-full items-center gap-3 rounded-xl border border-plum/20 bg-plum-tint p-3 text-left shadow-sm transition-colors hover:border-plum/50"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-plum text-plum-foreground">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex-1 text-sm font-semibold text-foreground">Add a school in this area</span>
          <span className="shrink-0 text-xs text-muted-foreground">Optional</span>
        </button>
      </div>
    ) : null;

  return (
    <div className="area-panel-container flex flex-1 flex-col overflow-y-auto">
      {/* Breadcrumb — sticky, area-first hierarchy: Home › City › Group › Area (Issue #1606) */}
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <AreaFirstBreadcrumb
          cityLabel={resolvedCityLabel || areaLabel}
          regionName={regionName}
          groupName={groupName}
          areaLabel={areaLabel}
          onHome={onCrumbHome}
          onCity={onCrumbCity}
          onRegion={regionName ? onCrumbRegion : undefined}
          onGroup={groupName ? onCrumbGroup : undefined}
        />
      </div>

      {/* Toolbar — journey pill + Trends / Filters / Back / Start over.
          Issue #2596: this row is the app's counterpart to the kit's
          `ExpModeBar`, which sits in the panel's FIXED top section directly
          above the filters (ExpPanel.jsx L884-887). The headline, count and
          sub-copy that used to share this container now render BELOW the
          quick-filter card, matching the kit's scrolling body — see the
          heading section further down. */}
      <div className="px-4 pb-2 pt-3.5">
        {/* No `mb-*` here any more: this row is now the section's only child,
            so the container's own `pb-3` supplies the whole gap. */}
        <div className="flex items-center justify-between gap-2">
          {journey === 'area-first' ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary-foreground">
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              Area-first
            </span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1.5">
            {trendsHref && (
              <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
                <Link to={trendsHref}>
                  <TrendingUp className="h-3.5 w-3.5" />
                  Trends
                </Link>
              </Button>
            )}
            {filtersContent && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="h-7 w-7">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span className="sr-only">Filters</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80 p-0">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  {filtersContent}
                </SheetContent>
              </Sheet>
            )}
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onBack}
                aria-label="Back to areas"
                data-testid="back-button"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            {journey != null && onStartOver != null && (
              // Issue #1817 (AC8) — an area is selected here (deeper than a region),
              // so this site always confirms before resetting.
              <StartOverButton
                onStartOver={onStartOver}
                hasSubstantialState
                cityLabel={resolvedCityLabel || areaLabel}
                className="h-7 gap-1.5 rounded-full border border-input px-2 text-xs text-muted-foreground hover:text-foreground"
              />
            )}
          </div>
        </div>
      </div>

      <PropertyFilterGroups
        filters={filters}
        isCommercialSubtypeSupported={isCommercialSubtypeSupported}
        isReadyToMoveSupported={isReadyToMoveSupported}
        {...propertyFilterGroups}
      />

      {/* Heading section — result-scope eyebrow, headline, count, sub-copy.
          Issue #2596 FILTER PLACEMENT: this block now renders AFTER the
          quick-filter card, not before it. The kit puts the filters in the
          panel's fixed top section on desktop (ExpPanel.jsx L886) and at the
          very top of the scrolling body on mobile (L894-898); in BOTH cases
          they precede `EPHeading`. The filters must never trail the
          search/recommendation workflow, which is what this file did before.

          RESIDUAL DEVIATION, disclosed rather than papered over: this panel is
          a SINGLE scroll column (`area-panel-container ... overflow-y-auto`),
          so the DESKTOP treatment reproduced here is the kit's ORDERING, not
          its PINNING. The kit's desktop filters sit in a `flex: none` header
          that does not scroll away; ours scroll with the body. Making them
          genuinely sticky means restructuring this panel into fixed + scroll
          regions, which is app-shell work this issue does not own. */}
      {/* Issue #2596 density (owner follow-up) — `pb-4 pt-3.5` -> `pb-2.5 pt-2.5`. MEASURED at
          1366×768: this section rendered 152px against the kit's 64px `scope-bar`. Most of that
          difference is CONTENT this surface carries and the kit does not (the sub-copy line and
          the intent helper), which a spacing-only pass must not delete — so what is reclaimed
          here is the section padding and the two dead margins above, not the copy. */}
      <div className="border-b border-border px-4 pb-2.5 pt-2.5">
        {/* Issue #2159 reskin — mock density rule (VISUAL_RULES §3): the scope
            eyebrow, area title and result count read as ONE compact block
            instead of a full-bleed hero headline. Count sits outside the <h1>
            (a sibling, not a child) so the heading's accessible name stays
            exactly "Properties in {areaLabel}" for existing tests/consumers.

            PR #2180 review fix — `count` is areaListings.length, the length
            of the bounded per-area fetch slice (caller wires
            useDiscoverCityListings with limitPerArea: 50), NOT an
            authoritative total. The evergreen result-summary strip further
            below gets to say "X verified properties" safely because it has
            an escape hatch to the caller-precomputed `areaResultSummaryText`
            (same formatDiscoverBadgeCopy(...) call the map badge uses — see
            the prop's own JSDoc above). This hero block does not have that
            wiring, so for any area with >50 matches, labelling this number
            "for sale"/"for rent" would silently understate the true total.
            Labelled "shown" instead — true regardless of whether the area
            has more matches than the fetch limit. */}
        {multiAreaKeys ? (
          <AreaSetSelectedHeader
            areaKeys={multiAreaKeys}
            // Issue #2017 — fall back to the authoritative `nav.city` slug
            // (already read above for `activeScope`/`multiAreaKeys`) when the
            // caller omits the `city` prop entirely. `DiscoverAreasJourneyPanel`'s
            // `AreaLeafListingsSurface` (the default AREA-leaf render path — the
            // component this panel most commonly mounts under) passes
            // `cityLabel` but not `city`, which otherwise silently collapsed to
            // `''` here and sat below `useDiscoverAreas`'s `enabled: city.length
            // > 0` guard inside AreaSetSelectedHeader — the areas query never
            // fired, so the plural header always rendered its generic
            // "N areas" fallback instead of resolved names/counts, even once
            // listings had loaded. `nav.city` is the same city slug every
            // caller (this one included) already derives `cityLabel` from via
            // `CITY_CONFIG[nav.city]`, so this cannot diverge from what the
            // panel is actually displaying. Explicit `city` props (e.g.
            // NodeListingsSurface's `city={nav.city}`) still take precedence.
            //
            // Uses `||` (not `??`) and falls back through to DEFAULT_CITY, matching
            // the established `nav.city || DEFAULT_CITY` idiom used everywhere else
            // in Discover (see useDiscoverPageComposition.ts,
            // useDiscoverAreaGroupsController.ts, useDiscoverJourneySwitchController.ts,
            // useDiscoverNavigationController.ts). At a plain `/discover` URL with no
            // `?city=` param, `nav.city` itself is `''` (documented in
            // useDiscoverAgriController.ts and CityLaunchPreview.test.tsx) — a `??`
            // fallback never catches that empty string, so it silently reached
            // `useDiscoverAreas('')` and sat below its `enabled: city.length > 0`
            // guard, same failure mode as the missing-prop case above.
            city={city || nav.city || DEFAULT_CITY}
            count={count}
            intentNoun={intentNoun}
            isLoadingListings={isLoadingListings}
            onEditAreas={handleEditAreas}
            onClearAreas={handleClearAreas}
            onRemoveArea={handleRemoveCommittedArea}
            // Issue #2017 (Fit all / focus-one) — camera-only actions
            // registered by useDiscoverMapDataController; see
            // DiscoverShellContextValue's AreaSetCameraActions doc. Neither
            // call touches `resultScope`/`rareas`.
            onFitAll={shell.fitAreaSet}
            onFocusArea={shell.focusAreaSetMember}
            // Issue #2419 (PR-2) — "Draw search area". Same shell-registered
            // indirection as the two camera actions above; unlike them it
            // enters draw mode rather than moving the camera, and still
            // commits nothing on its own.
            onDrawSearchArea={shell.startDrawSearchArea}
            // Below the mobile breakpoint the map canvas is not mounted until
            // the Map view is open, so the draw tool must have a surface to
            // arm on. A no-op on desktop, where the map is always present.
            onRevealMap={shell.isMobileShell ? () => shell.setMobileView('MAP') : undefined}
          />
        ) : (
          <>
            {/* Issue #2419 (PR-2) — the draw entry belongs in EVERY eligible
                residential listing state, not only the multi-area one. It
                previously lived inline in AreaSetSelectedHeader above, so a
                SINGLE committed area — much the more common state, and the
                one the #2016 contract spec reaches — had no entry at all.
                Hidden by its own eligibility rule for VIEWPORT scope, agri
                and anonymous shoppers, so this placement adds a control only
                where drawing genuinely applies. */}
            {/* Issue #2596 density — `empty:hidden`. MEASURED, not guessed: at 1366×768 this row
                renders at height 0 (its `DrawSearchAreaEntry` child is hidden by its own
                eligibility rule on this route) while its `mb-2` still applies, so it contributed
                8px of whitespace for nothing. `:empty` matches precisely when the child rendered
                null, so the margin survives wherever the row actually has content. */}
            {/* Issue #2419 (remaining gap) — also exclude committed POLYGON scope.
                AreaSelectedPanelScopeBar already renders its own "Redraw" CTA for
                resultScopeKind === 'POLYGON' below; without this exclusion, that
                Redraw button and this "Draw search area" entry render side by side
                for the same committed polygon — two competing redraw/start-draw
                controls. `resolveDrawSearchAreaEligibility` has no POLYGON awareness
                by design (it governs auth/journey/hierarchy, not scope), so the
                exclusion belongs at this call site, mirroring the VIEWPORT one. */}
            {!isViewportScope && resultScopeKind !== 'POLYGON' && (
              <div
                className="mb-2 flex flex-wrap items-center gap-1.5 empty:hidden"
                data-testid="area-single-action-row"
              >
                <DrawSearchAreaEntry
                  hasResidentialListingScope
                  onDrawSearchArea={shell.startDrawSearchArea}
                  onRevealMap={
                    shell.isMobileShell ? () => shell.setMobileView('MAP') : undefined
                  }
                />
              </div>
            )}
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {isViewportScope
                    ? `Result scope — ${SCOPE_TITLE.VIEWPORT}`
                    : resultScopeKind === 'POLYGON'
                      ? 'Result scope — Drawn area'
                      : 'Result scope — Selected area'}
                </p>
                <h1 className="mt-0.5 font-['Fraunces',_ui-serif,_Georgia,_serif] text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
                  {/* Issue #2461 — a committed POLYGON now renders the
                      polygon-scoped card list, so the heading must stop
                      attributing those results to the previously-selected
                      area. Keyed off the same `resultScopeKind` the
                      zero-result recovery already reads. */}
                  {isViewportScope
                    ? 'On screen right now'
                    : resultScopeKind === 'POLYGON'
                      ? `${headingNoun} in your drawn area`
                      : `${headingNoun} in ${areaLabel}`}
                </h1>
              </div>
              {!isLoadingListings && (
                <div className="shrink-0 text-right" data-testid="area-header-count">
                  <p className="font-mono text-2xl font-semibold leading-none tabular-nums text-foreground">
                    {count}
                  </p>
                  <p
                    className="mt-0.5 text-[11px] text-muted-foreground"
                    data-testid="area-header-count-noun"
                  >
                    {countNoun}
                  </p>
                </div>
              )}
            </div>
            {/* R-C — sub-copy: 15px, 1.55 line-height, --text-body colour. */}
            <p className="mt-1.5 text-[15px] leading-[1.55] text-[hsl(var(--text-body))]">
              {isViewportScope
                ? 'Explore verified listings in this map area, with map context and area-first filters.'
                : resultScopeKind === 'POLYGON'
                  ? 'Explore verified listings inside the area you drew, with map context and area-first filters.'
                  : `Explore verified listings around ${areaLabel}, with map context and area-first filters.`}
            </p>
            <AreaSelectedPanelScopeBar
              resultScopeKind={resultScopeKind}
              returnLabel={returnLabel}
              onReturn={handleReturnToPreviousScope}
              onRedrawPolygon={onRedrawPolygon}
            />
          </>
        )}

        {/* Controls card — REMOVED (product-owner ruling, #1953 follow-up).
            City was already removed from this card in build step 6, leaving
            Buy/Rent as its only occupant; now that Buy/Rent is ALSO removed
            (the persistent DiscoverControlBar is the SOLE Buy/Rent control
            on /discover, same ownership rationale as the prior city
            removal), the `onIntentChange &&`-gated card has nothing left to
            hold and is retired with it — leaving it in place would render
            an empty bordered "Looking to" box whenever `onIntentChange` is
            supplied, which is worse than not rendering at all. The intent-
            aware price helper directly below is UNCHANGED (it was already a
            separate, unconditional element, not part of this gate).
            `intent`/`onIntentChange` remain accepted (now JSX-unused) props
            — kept threaded through unchanged, mirroring the existing
            `onCityChange` convention already established on this exact
            component, so no prop-interface churn ripples into
            DiscoverRightPanel / DiscoverRightPanelContainer for this file. */}

        <p className="mt-2.5 text-xs text-muted-foreground" data-testid="area-intent-helper">
          {isViewportScope
            ? `Showing ${intentNoun} prices in ₹ for this area.`
            : resultScopeKind === 'POLYGON'
              ? `Showing ${intentNoun} prices in ₹ for your drawn area.`
              : `Showing ${intentNoun} prices in ₹ for ${areaLabel}.`}
        </p>

        {/* Issue #2596 density — same `empty:hidden` reasoning as the action row above, and the
            same measurement: `activeContextChips` is frequently a non-null node that renders
            nothing, so the `!= null` guard passes and this div contributed 10px of top margin
            around zero content. */}
        {activeContextChips != null && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 empty:hidden">
            {activeContextChips}
          </div>
        )}
      </div>

      {/* VIEWPORT-scope school CTA — its own bordered strip, directly below the
          heading and ABOVE the search, exactly as at the merge base. Rendered
          here rather than inside the group below so this PR carries no visual
          delta on a surface no gate has been able to reach (#2601 option D);
          see the constant's own comment for the full reasoning. Null in every
          AREA_SET state, so the certified single-area path is untouched. */}
      {viewportSchoolCta}

      {/* Workflow group (Issue #2596) — property search FIRST, then the two
          compact recommendation tiles, read as ONE group.

          THIS ORDERING SUPERSEDES ISSUE #2084 AC8, deliberately. AC8 ruled
          "heading -> school CTA -> search -> filters". The approved kit puts
          the search box first and the tiles beneath it: `EPAreaActions`
          (ExpPanel.jsx L371) is a single flex column, `gap: 8px`, holding the
          `property-search` box (L379) and only then the `1fr 1fr` tile grid
          (L385). The product owner ruled this order for #2596 with AC8 in
          view, so AC8's ordering clause is superseded here rather than
          accidentally contradicted. AC8's other clause — that the school
          shortcut is its own modest row and not a hero block — still holds.

          ONE SEPARATION, NOT TWO. The kit has no divider between the search
          box and the tile grid; they are one workflow separated by spacing.
          This group therefore owns the section's single bottom hairline and
          its own padding, and the children inside carry neither.

          Issue #2017 — the mock's state machine (Experience.jsx: `single =
          scopeKind === "AREA_SET" && committed.length === 1`, `v.areaActions =
          single`) gates the two-tile row on exactly ONE committed area. The
          committed multi-area state's own action surface is the ghost-button
          row inside `AreaSetSelectedHeader` above (Edit areas / Clear selected
          areas / Draw search area / Create alert), matching the mock's
          `EPScopeBar` AREA_SET row, so nothing else is needed there.

          Issue #2596 density (owner follow-up) — `py-3` -> `py-2.5`. The kit's `EPAreaActions`
          carries NO padding of its own; its separation comes from the scrolling body's 12px
          column gap. This panel has no container gap (measured: `gap: normal`, every
          inter-section gap 0), so the section keeps padding rather than losing its separation
          entirely. The inner `gap-2` is the kit's own 8px and is unchanged, as is the tile
          height — those were measured to parity in the density pass and are not to regress. */}
      {(onSearchChange != null || areaRecommendationTiles != null) && (
        <div className="flex flex-col gap-2 border-b border-border px-4 py-2.5">
          {onSearchChange && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              {/* `h-10` = 40px (Issue #2596, owner-authorised kit parity). The kit's
                  `property-search` box declares `minHeight: "40px"` (ExpPanel.jsx L379);
                  this was `h-9` = 36px. No custom height scale is configured, so the
                  Tailwind default applies and `h-10` is 2.5rem = 40px exactly. The
                  absolutely-positioned search icon and clear button both centre on
                  `top-1/2 -translate-y-1/2`, so neither needs adjusting. */}
              <Input
                placeholder={`Search properties in ${areaLabel}`}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="h-10 pl-8 pr-8 text-sm"
                data-testid="area-search-input"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                  onClick={() => onSearchChange('')}
                  aria-label="Clear search"
                  data-testid="area-search-clear"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
          {areaRecommendationTiles}
        </div>
      )}

      {/* Listings body */}
      <div
        className={cn(
          'transition-opacity duration-150',
          isFetching && !isInitialLoading ? 'pointer-events-none opacity-50' : 'opacity-100',
        )}
      >
        {isLoadingListings ? (
          <div className="space-y-3 p-4">
            {/* a4 — rounded-xl skeleton cards for consistency with PropertyCard corners. */}
            {[0, 1, 2].map((i) => (
              <div key={i} data-testid="listing-skeleton" className="rounded-xl border border-border p-3">
                <Skeleton className="mb-3 h-40 w-full rounded-lg" />
                <Skeleton className="mb-2 h-4 w-2/3" />
                <Skeleton className="mb-2 h-3 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : isListingsError && (!areaListings || areaListings.length === 0) ? (
          // Issue #2018 requirement A — "error is not empty". A settled request
          // failure with nothing to fall back on gets the explicit
          // request-failure state, NEVER the zero-result recovery below: that
          // recovery asserts "no matching listings in {scope}" as a fact about
          // the marketplace, and this request never successfully asked it.
          //
          // Copy follows the frozen mock's own error state (ExpPanel.jsx
          // L566-572): name it a request failure and say the search is
          // untouched. Structure mirrors the #2015 anon-viewport first-load
          // failure branch in DiscoverRightPanel.tsx.
          <div
            className="m-4 flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-12 text-center"
            data-testid="area-listings-error"
          >
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">We could not load these results</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              This is a request failure, not an empty market. Your scope and filters are unchanged.
            </p>
            {onRetryListings && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetryListings}
                data-testid="area-listings-error-retry"
              >
                Retry
              </Button>
            )}
          </div>
        ) : !areaListings || areaListings.length === 0 ? (
          (() => {
            // Issue #1817 (AC7) — cause-routed empty state, sourced from the SAME
            // hasPropertyFilters/hasSearch signal the badge's zero-filters/zero-search/
            // zero-empty states use, so the panel and badge never disagree about why
            // the list is empty (design §7).
            const copy = deriveDiscoverEmptyStateCopy({
              hasPropertyFilters,
              hasSearch: !!searchQuery,
              searchQuery,
              n: selectedArea.listingCount ?? null,
              scopeLabel: areaLabel,
              cityLabel: resolvedCityLabel || areaLabel,
              isCityScope: false, // an area is always narrower than its city
              // #2450 copy truth — "homes" is a Residential word. A Commercial selection must not
              // have its zero-result state described as homes, whatever the intent.
              noun: commercialFromFilters
                ? 'properties'
                : intentNoun === 'rent'
                  ? 'rentals'
                  : 'homes',
            });
            const onClearFilters = hasPropertyFilters ? handleClearPropertyFilters : undefined;
            const onClearSearch = searchQuery && onSearchChange ? () => onSearchChange('') : undefined;

            // Issue #2018 (slice 1) — an AREA / AREA_SET zero result is not a
            // dead end: it gets the mock's `EPZero` recovery stack (scope +
            // filter summary, "kept exactly as it is", and nearby areas that
            // DO have matches under the same filters) instead of the generic
            // cause-routed EmptyState. `deriveDiscoverEmptyStateCopy` above is
            // still the single owner of the CAUSE — the recovery banner reads
            // it so this panel and the map badge cannot disagree about why the
            // list is empty (design §7, unchanged).
            //
            // Issue #2018 slice 3 — every scope kind now reaches the recovery
            // stack, which says only what is true of the ACTIVE scope (see
            // AreaZeroResultRecovery's `scopeKind` doc).
            //
            // Slice 1 excluded VIEWPORT here and left POLYGON unconsidered.
            // That was a truthfulness bug for POLYGON specifically: no
            // `isPolygonScope` equivalent exists anywhere (both flags in
            // useDiscoverMapData are gated on `kind === 'VIEWPORT'`), so a
            // committed polygon fell through to the single-canonical-AREA
            // path and this banner named an AREA that is not the scope, then
            // offered nearby areas measured from it. Both statements were
            // false about a drawn search.
            return (
              <AreaZeroResultRecovery
                scopeAreaKeys={multiAreaKeys ?? [selectedArea.areaKey]}
                fallbackScopeName={areaLabel}
                city={city || nav.city || DEFAULT_CITY}
                filters={filters}
                intent={intent}
                searchQuery={searchQuery}
                // #2450 copy truth — see the matching derivation on the empty-state copy above.
                noun={
                  commercialFromFilters
                    ? 'properties'
                    : intentNoun === 'rent'
                      ? 'rentals'
                      : 'homes'
                }
                cause={copy.cause}
                scopeKind={resultScopeKind}
                resultScope={activeScope}
                onAdjustBoundary={onRedrawPolygon}
                // Issue #2552 — WRAPPED, not forwarded raw, and this was the last path by which a
                // stale family override could resurrect. `AreaZeroResultRecovery` emits through
                // this prop directly, so a relaxation click bypassed every `setFamilyOverride` the
                // family controls make. `applyRelaxationPreview`'s empty PROPERTY_TYPES offer
                // returns `propertyTypes: undefined` — a DESIGNED offer, shown to the buyer as
                // "Include every property type" — which makes the filters family-silent and hands
                // the family back to whatever override was last set. A relaxation expresses no
                // family intent, so it clears the override exactly like `handleClearPropertyFilters`.
                //
                // The ternary preserves the prop's OPTIONALITY deliberately: that component gates
                // its entire relaxation block on `onApplyFilters` being defined, so wrapping
                // unconditionally would offer a relaxation on a panel with no filter owner — a
                // control that cannot do anything, which is the dead-control class this panel
                // refuses elsewhere (`onRetryListings`, `onAddSchool`).
                // Issue #2555 (re-review finding) — the memories go with the override, for the
                // identical reason. The empty PROPERTY_TYPES offer is a DELIBERATE clear by the
                // buyer, so banking it is what stops the cleared selection returning on the next
                // family switch. The effect above now banks unconditionally and would cover this
                // on the following render anyway; clearing here as well states the intent at the
                // point of action, exactly as the handlers do.
                //
                // FOURTH-CYCLE FINDING — this wrapper banked `next.propertyTypes` UNFILTERED, and
                // it is a door this issue itself opened. `applyRelaxationPreview` spreads `filters`
                // and overwrites exactly ONE key, so `propertyTypes` passes through untouched on
                // the PRICE_MAX / READY_TO_MOVE / BEDROOMS offers — a buyer on `?type=warehouse`
                // accepting any of them banked a Commercial token as the RESIDENTIAL memory.
                // Filtered here so the banked value is clean at the point of action; the read side
                // in `handleSelectFamily` is what makes that guarantee complete.
                onApplyFilters={
                  onFiltersChange
                    ? (next) => {
                        setFamilyOverride(null);
                        residentialMemoryRef.current = withoutCommercialFamilyTokens(
                          next.propertyTypes,
                        );
                        commercialMemoryRef.current = next.commercialSubtypes;
                        onFiltersChange(next);
                      }
                    : undefined
                }
                onClearFilters={onClearFilters}
                onClearSearch={onClearSearch}
              />
            );
          })()
        ) : (
          <>
            {isListingsError && (
              // Issue #2018 requirement A — a transient failure AFTER a
              // successful load keeps the last good result set on screen
              // (the issue: "the last successful results preserved where
              // available") and surfaces the error as an inline banner
              // instead of wiping the cards. Same two-branch shape and same
              // copy register as the #2015 anon-viewport retry banner in
              // DiscoverRightPanel.tsx — one error treatment, two surfaces.
              <div
                className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                data-testid="area-listings-retry-banner"
                aria-live="polite"
              >
                <p className="text-sm text-muted-foreground">
                  Couldn&apos;t refresh these results. Showing the last ones we loaded.
                </p>
                {onRetryListings && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRetryListings}
                    data-testid="area-listings-retry-banner-btn"
                  >
                    Retry
                  </Button>
                )}
              </div>
            )}
            {/* Intent-aware verified result summary (Issue #1494 / #1606) */}
            {/* a4 — warm evergreen-tint/60 strip instead of near-invisible bg-muted/20 */}
            <div className="flex items-center gap-1.5 border-b border-border bg-evergreen-tint/60 px-4 py-2" data-testid="area-result-summary">
              <ShieldCheck className="h-4 w-4 shrink-0 text-evergreen" aria-hidden="true" />
              <p className="text-xs font-medium text-foreground" data-testid="area-result-summary-text">
                {areaResultSummaryText ??
                  `${count} verified ${count === 1 ? 'property' : 'properties'} for ${intentNoun}${
                    isViewportScope
                      ? ' in this area'
                      : resultScopeKind === 'POLYGON'
                        ? ' in your drawn area'
                        : ` in ${areaLabel}`
                  }`}
              </p>
            </div>
            {/* Issue #2159 reskin — the desktop 2-column grid target (mock's dense
                card grid) needs the PANEL's own width, not the viewport's: at the
                1366×768 desktop target the panel column is well under Tailwind's
                1536px `2xl` viewport breakpoint, so `2xl:grid-cols-2` never fired
                and this always rendered single-column on desktop. Tailwind 3.4
                doesn't ship container-query variants without the (uninstalled)
                `@tailwindcss/container-queries` plugin, so a plain native CSS
                container query does the job instead — see `.area-panel-container`
                / `.area-listings-grid` in src/index.css. */}
            {/* Issue #2596 — close the dead band between the controls and the results.
                Measured at the merge base: 66px from the filter card's bottom edge to the first
                card's top, accumulated from three separate paddings (the filter section's py-3,
                this grid's uniform p-4, and the summary strip between them). #2596 asks for
                "meaningful results high in the desktop viewport" and no "unexplained dead band
                between filters and results". The grid keeps its full side and bottom padding and
                only loses the redundant top inset, so card spacing itself is unchanged. */}
            <div className="area-listings-grid grid grid-cols-1 gap-3 px-4 pb-4 pt-2">
              {areaListings.map((listing) => (
                <div
                  key={listing.id}
                  ref={(node) => {
                    if (node) cardRefs.current.set(listing.id, node);
                    else cardRefs.current.delete(listing.id);
                  }}
                >
                  <PropertyCard
                    listing={listing}
                    isAuthenticated={isAuthenticated}
                    onNavigate={() => navigate(`/listing/${listing.id}`)}
                    isSelected={selectedListingId === listing.id}
                    isHovered={hoveredListingId === listing.id}
                    onSelect={onSelectListing}
                    onHover={onHoverListing}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Trust strip — verification reassurance footer (Issue #1606, mock parity) */}
      <div className="mt-auto flex items-start gap-2.5 border-t border-border bg-evergreen-tint/40 px-4 py-3.5" data-testid="area-trust-strip">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-evergreen" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Every listing is verified.</span>{' '}
          Documents checked, RERA registered, broker confirmed — before it reaches you.
        </p>
      </div>
    </div>
  );
}
