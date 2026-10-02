import React, { useCallback, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverJourney, DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { useDiscoverNav, useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { AreaSetTwoTileRow } from './AreaSetSelectedExtras';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { resolveAreaSetTitle } from '@/features/discover/area-selected/selectors/areaSetTitle';
import { usePropertyFilterGroups } from '@/features/discover/buyer-filters/controllers/usePropertyFilterGroups';
import { PropertyFilterGroups } from '@/features/discover/buyer-filters/sections/PropertyFilterGroups';
import { withoutCommercialFamilyTokens } from '@/features/discover/buyer-filters/selectors/familyTokens';
import { useResultScopeController } from '@/features/discover/area-selected/controllers/useResultScopeController';
import { useAreaSetScopeCommands } from '@/features/discover/area-selected/controllers/useAreaSetScopeCommands';
import { resolveAreasCity } from '@/features/discover/area-selected/selectors/areaCityResolution';
import { useListingCardFocus } from '@/features/discover/area-selected/controllers/useListingCardFocus';
import { Breadcrumb } from '@/features/discover/area-selected/sections/Breadcrumb';
import { Toolbar } from '@/features/discover/area-selected/sections/Toolbar';
import { ViewportSchoolCta } from '@/features/discover/area-selected/sections/ViewportSchoolCta';
import { ResultHeading } from '@/features/discover/area-selected/sections/ResultHeading';
import { CompactResultsHeader } from '@/features/discover/area-selected/sections/CompactResultsHeader';
import { WorkflowGroup } from '@/features/discover/area-selected/sections/WorkflowGroup';
import { TrustStrip } from '@/features/discover/area-selected/sections/TrustStrip';
import { ListingsBody } from '@/features/discover/area-selected/sections/ListingsBody';
import { useDiscoverHeaderHostsControls } from '@/features/discover/state/useDiscoverHeaderHostsControls';

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

/**
 * Issue #2658 (C5) — the binding "Prop modelling / component-contract"
 * directive: this panel's external surface collapses from ~40 flat props to
 * TWO, `view` and `commands`, each a small set of cohesive,
 * one-sentence-describable capability groups. Internally this changes
 * NOTHING — every group below is destructured back into the exact same
 * local names (`selectedArea`, `onFiltersChange`, etc.) the ~500-line
 * function body already used, so C2/C3's controllers/sections are
 * untouched; only the BOUNDARY shape changed.
 *
 * Every field, default and doc comment here is carried over VERBATIM from
 * the flat interface this replaces — grouped, not rewritten. See git
 * history for this file (pre-C5) for the full per-field reasoning that
 * would otherwise be repeated here.
 */
export interface AreaSelectedPanelViewProps {
  /** The selected area itself, plus the breadcrumb/city-selector identity around it. */
  area: {
    point: AreaPoint;
    /** Human-readable city label (e.g. "Udupi") for the breadcrumb + controls card. */
    cityLabel?: string;
    /** Selected group display name (e.g. "University Belt"); null when group-less. */
    groupName?: string | null;
    /** Region/scope name (e.g. "North Bangalore"); null when scope-less. */
    regionName?: string | null;
    /** City slug — drives the in-panel city selector. */
    city?: string;
    journey?: DiscoverJourney | null;
    /**
     * Issue #2729 V2b — an optional compact hierarchy-back control rendered on
     * the breadcrumb row (≥1366 only) instead of a redundant standalone row
     * above this panel. See `Breadcrumb.tsx`'s `backButton` doc for why this
     * is a slot, not a derived-here action: only the node-hierarchy journey
     * (`AreaLeafListingsSurface`) has a canonical parent NODE distinct from
     * the breadcrumb's own crumbs, and only it can build the real POP/REPLACE
     * `<HierarchyBackButton compact />` for it.
     */
    hierarchyBackButton?: ReactNode;
  };
  /** The listings result set this panel is rendering, and its loading/error/scope state. */
  results: {
    listings?: DiscoverCityListingItem[];
    /**
     * Issue #1817 (code-review follow-up, AC5) — precomputed via the SAME
     * formatDiscoverBadgeCopy(discoverBadge, ...) call the map badge pill renders
     * from, so this panel's result-summary stat can never diverge from the map
     * badge. Optional: falls back to a lightweight local default when omitted.
     */
    summaryText?: string | null;
    isLoading?: boolean;
    isFetching?: boolean;
    isInitialLoading?: boolean;
    /**
     * Issue #2018 requirement A ("error is not empty") — true when the listings
     * request this panel is rendering FAILED, as opposed to succeeding with
     * zero rows. See the flat-interface history for the full load-bearing
     * reasoning this default-false field carries.
     */
    isError?: boolean;
    /**
     * Issue #2015 — true when the panel is displaying a committed VIEWPORT
     * `resultScope` ("Search this area") rather than the selected AREA_SET.
     */
    isViewportScope?: boolean;
  };
  /** Current property filters + the capability flags/content that shape the quick-filter card. */
  filters: {
    filters?: PropertyFilters;
    /** Issue #1494 — current buy/rent intent for summary/empty-state copy. Default 'buy'. */
    intent?: DiscoverIntent;
    /**
     * Issue #2023 code-review follow-up — whether the "Ready to move" quick
     * filter chip has any effect on the listings actually shown by the calling
     * surface. See the flat-interface history for the full per-caller reasoning.
     */
    isReadyToMoveSupported?: boolean;
    /**
     * Issue #2450/#2572 — whether the calling surface's listings hook can
     * actually consume a Commercial SUBTYPE narrowing. See the flat-interface
     * history for the full multi-revision reasoning this field carries — it
     * has been wrong 3 times and gone stale a 4th; re-derive before trusting
     * any summary of it, including this one.
     */
    isCommercialSubtypeSupported?: boolean;
    /** The filter-sheet content rendered inside the Toolbar's mobile Sheet trigger. */
    content?: React.ReactNode;
    /** Active context chips forwarded below the header (seller/date/boolean filters). */
    activeContextChips?: React.ReactNode;
  };
  /** The in-panel search box's current value. */
  search: {
    query?: string;
  };
  /** Per-card selection/hover/auth state for the listings grid. */
  listingCards: {
    isAuthenticated?: boolean;
    /**
     * Issue #1547 — id of the currently selected listing (URL/parent-derived).
     * Drives the copper selected card frame + scroll-into-view.
     */
    selectedListingId?: string | null;
    /**
     * Issue #2616 — ephemeral hover/focus id driven from the map marker side.
     */
    hoveredListingId?: string | null;
  };
  /** External navigation targets this panel links out to. */
  links: {
    trendsHref?: string;
  };
}

export interface AreaSelectedPanelCommandsProps {
  /** Breadcrumb/back/start-over/journey/city/intent/school-CTA navigation actions. */
  navigation: {
    onBack?: () => void;
    onStartOver?: () => void;
    /** Called for genuine journey switches (kept for non-CTA usage). */
    onSelectJourney?: (journey: DiscoverJourney) => void;
    /**
     * Issue #1157 — enters the area-first school-picking sub-step WITHOUT
     * flipping the journey, so Back returns to area-selected instead of
     * deleting the area.
     */
    onAddSchool?: () => void;
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
  };
  /** Writes to the canonical property-filter state. */
  filters: {
    change?: (filters: PropertyFilters) => void;
  };
  /** Writes to the in-panel search query. */
  search: {
    change?: (query: string) => void;
  };
  /** Per-card select/hover, plus the failed-request retry action. */
  listings: {
    /** Issue #1547 — called when a card is activated, to sync the selected marker. */
    select?: (id: string) => void;
    /** Issue #1547 — ephemeral hover/focus signal for card→marker highlight. */
    hover?: (id: string | null) => void;
    /**
     * Re-issues the failed listings request. Omitted renders the error states
     * without a Retry button rather than a dead one.
     */
    retry?: () => void;
  };
  /** Result-scope adjustment — currently just the zero-result "Adjust boundary" redraw. */
  scope: {
    /**
     * Issue #2018 slice 3 — starts a NEW polygon drawing for the zero-result
     * "Adjust boundary" action. Commits nothing on its own. Omitted renders no
     * row rather than a dead control.
     */
    redrawPolygon?: () => void;
  };
}

interface AreaSelectedPanelProps {
  view: AreaSelectedPanelViewProps;
  commands: AreaSelectedPanelCommandsProps;
}

export function AreaSelectedPanel({ view, commands }: AreaSelectedPanelProps) {
  const {
    area: { point: selectedArea, cityLabel, groupName, regionName, city, journey, hierarchyBackButton },
    results: {
      listings: areaListings,
      summaryText: areaResultSummaryText,
      isLoading: isLoadingListings,
      isFetching = false,
      isInitialLoading = false,
      isError: isListingsError = false,
      isViewportScope = false,
    },
    filters: {
      filters = {},
      intent = 'buy',
      isReadyToMoveSupported = true,
      isCommercialSubtypeSupported = false,
      content: filtersContent,
      activeContextChips,
    },
    search: { query: searchQuery = '' },
    listingCards: { isAuthenticated = false, selectedListingId = null, hoveredListingId = null },
    links: { trendsHref },
  } = view;
  const {
    navigation: {
      onBack,
      onStartOver,
      onSelectJourney,
      onAddSchool,
      onCityChange,
      onIntentChange,
      onCrumbHome,
      onCrumbCity,
      onCrumbRegion,
      onCrumbGroup,
    },
    filters: { change: onFiltersChange },
    search: { change: onSearchChange },
    listings: { select: onSelectListing, hover: onHoverListing, retry: onRetryListings },
    scope: { redrawPolygon: onRedrawPolygon },
  } = commands;
  const navigate = useNavigate();
  const areaLabel = selectedArea.areaLabel;
  const intentNoun = intent === 'rent' ? 'rent' : 'sale';

  // Issue #2658 (C2) — the Issue #1547 scroll-into-view behavior now lives
  // in useListingCardFocus; see that controller's own comment for why
  // `hoveredListingId` has no counterpart here.
  const { registerCardRef } = useListingCardFocus({ selectedListingId });

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

  // Issue #2552 — WRAPPED, not forwarded raw, and this was the last path by which a
  // stale family override could resurrect. `AreaZeroResultRecovery` (rendered inside
  // `ListingsBody`) emits through this callback directly, so a relaxation click bypassed
  // every `setFamilyOverride` the family controls make. `applyRelaxationPreview`'s empty
  // PROPERTY_TYPES offer returns `propertyTypes: undefined` — a DESIGNED offer, shown to
  // the buyer as "Include every property type" — which makes the filters family-silent
  // and hands the family back to whatever override was last set. A relaxation expresses
  // no family intent, so it clears the override exactly like `handleClearPropertyFilters`.
  //
  // Issue #2555 (re-review finding) — the memories go with the override, for the
  // identical reason. The empty PROPERTY_TYPES offer is a DELIBERATE clear by the buyer,
  // so banking it is what stops the cleared selection returning on the next family
  // switch.
  //
  // FOURTH-CYCLE FINDING — this wrapper banked `next.propertyTypes` UNFILTERED, and it
  // is a door this issue itself opened. `applyRelaxationPreview` spreads `filters` and
  // overwrites exactly ONE key, so `propertyTypes` passes through untouched on the
  // PRICE_MAX / READY_TO_MOVE / BEDROOMS offers — a buyer on `?type=warehouse` accepting
  // any of them banked a Commercial token as the RESIDENTIAL memory. Filtered here so
  // the banked value is clean at the point of action; the read side in
  // `handleSelectFamily` is what makes that guarantee complete.
  //
  // `undefined` when there is no filter owner — `ListingsBody`/`AreaZeroResultRecovery`
  // gate their entire relaxation block on this being defined, so a panel with no filter
  // owner never renders a control that cannot do anything (the dead-control class this
  // panel refuses elsewhere: `onRetryListings`, `onAddSchool`).
  const handleApplyRelaxationFilters = onFiltersChange
    ? (next: PropertyFilters) => {
        setFamilyOverride(null);
        residentialMemoryRef.current = withoutCommercialFamilyTokens(next.propertyTypes);
        commercialMemoryRef.current = next.commercialSubtypes;
        onFiltersChange(next);
      }
    : undefined;

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
  // AREA_SET result scope. A single-area AREA_SET commit (or no AREA_SET
  // commit at all) leaves `multiAreaKeys` null and this file's existing
  // single-area JSX renders completely unchanged.
  const nav = useDiscoverNav();
  const shell = useDiscoverShell();
  // Issue #2729 — the SAME desktop-reskin signal #2728's shared header already gates on
  // (`useDiscoverHeaderHostsControls`, ≥1366px, "no second breakpoint"). Drives the compact
  // Results header/menu/toolbar/grid; every branch below falls back to the pre-#2729 layout when
  // this is false, which is also this hook's real value in every existing test (the shared test
  // setup's `matchMedia` stub always reports `matches: false`).
  const isDesktopReskin = useDiscoverHeaderHostsControls(shell.isMobileShell);

  // Issue #2658 (C2) — activeScope / resultScopeKind (Issue #2018 slice 3) /
  // previousAreas / returnLabel (Issue #2478 step 1) / multiAreaKeys, plus
  // the returnToPrevious (Issue #2480 one-shot camera-restore-request) and
  // clearAreas commands, now live in useResultScopeController; see that
  // controller's own comment for the full #2016/#2017/#2018/#2478/#2480
  // reasoning this preserves verbatim.
  const resultScope = useResultScopeController({ city, isViewportScope });
  const { activeScope, resultScopeKind, returnLabel, multiAreaKeys } = resultScope;
  const handleReturnToPreviousScope = resultScope.commands.returnToPrevious;
  const handleClearAreas = resultScope.commands.clearAreas;

  // Issue #2729 R1/R5 fix — resolve the committed AREA_SET's joined title using the SAME pure
  // `resolveAreaSetTitle` function `CompactResultsHeader` calls, off a self-sourced
  // `useDiscoverAreas` call at the SAME cache key `AreaSetTwoTileRow`/`AreaSetSelectedHeader`/
  // `CompactResultsHeader` already use for this city (never a second request). Single-area (and
  // every non-AREA_SET) scope uses `areaLabel` — already exactly what the Results heading itself
  // renders for those cases.
  const { data: areaSetAreasForLabel } = useDiscoverAreas(
    multiAreaKeys ? resolveAreasCity(city, nav.city, DEFAULT_CITY) : '',
  );
  const canonicalScopeLabel = multiAreaKeys
    ? resolveAreaSetTitle(multiAreaKeys, areaSetAreasForLabel?.areas ?? [])
    : areaLabel;

  // Broadcasts the EXACT string the Results heading renders so the global area search
  // (`DiscoverControlBar`) shows the SAME value when idle instead of independently re-deriving it
  // from a URL param that can diverge from the current hierarchy position — see
  // `DiscoverShellContextValue.canonicalScopeLabel`'s doc for the full R1 reasoning. Cleared on
  // unmount so a stale label never survives navigating away from every AreaSelectedPanel render
  // site (school-first/agri-first/journey-less correctly show no canonical value).
  useEffect(() => {
    shell.setCanonicalScopeLabel(canonicalScopeLabel);
    return () => shell.setCanonicalScopeLabel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setCanonicalScopeLabel is a stable useState setter (see DiscoverContext.tsx)
  }, [canonicalScopeLabel, shell.setCanonicalScopeLabel]);

  // Issue #2658 (C2) — the AREA_SET draft/edit/remove-area commands (Issues
  // #2017, #2596) now live in useAreaSetScopeCommands.
  const areaSetScopeCommands = useAreaSetScopeCommands({ multiAreaKeys });
  const handleEditAreas = areaSetScopeCommands.commands.editAreas;
  const handleRemoveCommittedArea = areaSetScopeCommands.commands.removeCommittedArea;
  const handleAddNearbyAreas = areaSetScopeCommands.commands.addNearbyAreas;

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
        // Same `resolveAreasCity` resolution the plural header above uses,
        // for the same reason: `AreaLeafListingsSurface` passes `cityLabel`
        // but not `city`, and at a bare `/discover` URL `nav.city` is itself
        // `''`. See that prop's comment for the full rationale.
        city={resolveAreasCity(city, nav.city, DEFAULT_CITY)}
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
      <ViewportSchoolCta onAddSchool={handleAddSchool} />
    ) : null;

  return (
    <div className="discover-panel-container flex flex-1 flex-col overflow-y-auto">
      {/* Breadcrumb — sticky, area-first hierarchy: Home › City › Group › Area (Issue #1606) */}
      <Breadcrumb
        cityLabel={resolvedCityLabel || areaLabel}
        regionName={regionName}
        groupName={groupName}
        areaLabel={areaLabel}
        onHome={onCrumbHome}
        onCity={onCrumbCity}
        onRegion={regionName ? onCrumbRegion : undefined}
        onGroup={groupName ? onCrumbGroup : undefined}
        backButton={hierarchyBackButton}
      />

      {/* Toolbar — journey pill + Trends / Filters / Back / Start over.
          Issue #2596: this row is the app's counterpart to the kit's
          `ExpModeBar`, which sits in the panel's FIXED top section directly
          above the filters (ExpPanel.jsx L884-887). The headline, count and
          sub-copy that used to share this container now render BELOW the
          quick-filter card, matching the kit's scrolling body — see the
          heading section further down. */}
      <Toolbar
        journey={journey}
        // Issue #2729 D5 — at the desktop-reskin floor Trends moves into CompactResultsHeader's
        // right cluster (same href, same destination) so this row's separate ~45px Trends link
        // is not ALSO shown, doubling the control.
        trendsHref={isDesktopReskin ? undefined : trendsHref}
        filtersContent={filtersContent}
        // Issue #2729 V2 fix — the compact sticky toolbar already shows every filter group
        // inline at this floor, so the mobile Sheet here would be dead weight, never reachable
        // filter capability being removed.
        hideFiltersSheet={isDesktopReskin}
        onBack={onBack}
        onStartOver={onStartOver}
        cityLabel={resolvedCityLabel || areaLabel}
      />

      {/* Issue #2729 D2 fix — ORDER now branches with `isDesktopReskin`. Real-browser verification
          against the mock found the filter toolbar rendering ABOVE "Properties in …" at ≥1366; the
          mock's order is results header (title/count/scope-menu) -> sticky filter toolbar ->
          shortcuts -> verified line -> grid. Below the reskin floor the ORIGINAL #2596 order
          (filters BEFORE the heading — "filters must never trail the search/recommendation
          workflow") is completely unchanged; `filterToolbarNode`/`headerNode` below are the exact
          same elements either way, just sequenced differently. */}
      {(() => {
        // Issue #2729 (post-merge fix-verify) — the sticky wrapper is now CONDITIONAL on
        // `isDesktopReskin`, not merely CSS-inert below it. A getComputedStyle probe (real
        // Playwright, BEFORE 3dd9e26f vs AFTER 768b4591 at 1365×768/900×768) proved that even
        // though every `min-[1366px]:*` class on the wrapper is inert below that floor, the
        // wrapper DIV ITSELF was always mounted — so below 1366 `PropertyFilterGroups` gained a
        // new parent (`display:block`, no longer a direct flex item of `.discover-panel-container`),
        // which changed its computed `min-height`/`min-width` from `auto` to `0px` and shifted a
        // sibling's sub-pixel rasterisation. Below 1366 this branch now renders
        // `PropertyFilterGroups` as the direct child again — byte-for-byte the merge-base
        // structure, not merely visually inert styling on an extra node.
        const filterToolbarNode = isDesktopReskin ? (
          // Issue #2729 §4 — compact sticky filter toolbar, LISTING RESULTS ONLY, ≥1366 only. This
          // wrapper exists only in AreaSelectedPanel — MapFilterSheet.tsx (the filter-owner's other
          // production consumer) renders `PropertyFilterGroups` completely unwrapped, so sticky
          // positioning can never leak onto the map filter sheet or any non-Results surface
          // (issue §7). `top-11` (44px) matches the sticky Breadcrumb's height — GUARANTEED, not
          // approximated: `Breadcrumb.tsx` forces `min-[1366px]:h-11` at this same floor (P3).
          <div
            className="sticky top-11 z-10 bg-background"
            data-testid="area-filters-sticky"
          >
            <PropertyFilterGroups
              filters={filters}
              isCommercialSubtypeSupported={isCommercialSubtypeSupported}
              isReadyToMoveSupported={isReadyToMoveSupported}
              layout="compact"
              {...propertyFilterGroups}
            />
          </div>
        ) : (
          <PropertyFilterGroups
            filters={filters}
            isCommercialSubtypeSupported={isCommercialSubtypeSupported}
            isReadyToMoveSupported={isReadyToMoveSupported}
            layout="stacked"
            {...propertyFilterGroups}
          />
        );

        const headerNode = isDesktopReskin ? (
          <CompactResultsHeader
            multiAreaKeys={multiAreaKeys}
            resolvedAreasCity={resolveAreasCity(city, nav.city, DEFAULT_CITY)}
            count={count}
            isLoadingListings={isLoadingListings}
            headingNoun={headingNoun}
            countNoun={countNoun}
            areaLabel={areaLabel}
            resultScopeKind={resultScopeKind}
            isViewportScope={isViewportScope}
            search={onSearchChange ? { query: searchQuery, onChange: onSearchChange } : undefined}
            trendsHref={trendsHref}
            onRemoveArea={handleRemoveCommittedArea}
            scopeActions={{
              onEditAreas: handleEditAreas,
              onClearAreas: handleClearAreas,
              onFitAll: shell.fitAreaSet,
              onDrawSearchArea: shell.startDrawSearchArea,
              onRevealMap: shell.isMobileShell ? () => shell.setMobileView('MAP') : undefined,
              onRedrawPolygon,
              returnLabel,
              onReturn: handleReturnToPreviousScope,
            }}
          />
        ) : (
          <ResultHeading
            multiAreaKeys={multiAreaKeys}
            resolvedAreasCity={resolveAreasCity(city, nav.city, DEFAULT_CITY)}
            count={count}
            intentNoun={intentNoun}
            isLoadingListings={isLoadingListings}
            onEditAreas={handleEditAreas}
            onClearAreas={handleClearAreas}
            onRemoveArea={handleRemoveCommittedArea}
            shell={shell}
            isViewportScope={isViewportScope}
            resultScopeKind={resultScopeKind}
            headingNoun={headingNoun}
            countNoun={countNoun}
            areaLabel={areaLabel}
            returnLabel={returnLabel}
            onReturn={handleReturnToPreviousScope}
            onRedrawPolygon={onRedrawPolygon}
            activeContextChips={activeContextChips}
          />
        );

        return isDesktopReskin ? (
          <>
            {headerNode}
            {filterToolbarNode}
          </>
        ) : (
          <>
            {filterToolbarNode}
            {headerNode}
          </>
        );
      })()}

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
      {/* Issue #2729 §2 — at the desktop-reskin floor the in-scope search box now lives in
          `CompactResultsHeader` (same `searchQuery`/`onSearchChange`, one input, never two);
          `onSearchChange` is omitted here so `WorkflowGroup` renders its recommendation tiles
          only (its own "no search handler -> no search box" branch), not a duplicate input. */}
      <WorkflowGroup
        areaLabel={areaLabel}
        searchQuery={searchQuery}
        onSearchChange={isDesktopReskin ? undefined : onSearchChange}
        areaRecommendationTiles={areaRecommendationTiles}
      />

      {/* Listings body */}
      <ListingsBody
        isFetching={isFetching}
        isInitialLoading={isInitialLoading}
        isLoadingListings={isLoadingListings}
        areaListings={areaListings}
        isListingsError={isListingsError}
        onRetryListings={onRetryListings}
        hasPropertyFilters={hasPropertyFilters}
        searchQuery={searchQuery}
        listingCount={selectedArea.listingCount}
        areaLabel={areaLabel}
        resolvedCityLabel={resolvedCityLabel}
        commercialFromFilters={commercialFromFilters}
        intentNoun={intentNoun}
        multiAreaKeys={multiAreaKeys}
        fallbackAreaKey={selectedArea.areaKey}
        resolvedAreasCity={resolveAreasCity(city, nav.city, DEFAULT_CITY)}
        filters={filters}
        intent={intent}
        activeScope={activeScope}
        resultScopeKind={resultScopeKind}
        onRedrawPolygon={onRedrawPolygon}
        onClearFilters={hasPropertyFilters ? handleClearPropertyFilters : undefined}
        onSearchChange={onSearchChange}
        onApplyFilters={handleApplyRelaxationFilters}
        areaResultSummaryText={areaResultSummaryText}
        count={count}
        isViewportScope={isViewportScope}
        isAuthenticated={isAuthenticated}
        onNavigateToListing={(listingId) => navigate(`/listing/${listingId}`)}
        selectedListingId={selectedListingId}
        hoveredListingId={hoveredListingId}
        onSelectListing={onSelectListing}
        onHoverListing={onHoverListing}
        registerCardRef={registerCardRef}
      />

      {/* Trust strip — verification reassurance footer (Issue #1606, mock parity) */}
      <TrustStrip />
    </div>
  );
}
