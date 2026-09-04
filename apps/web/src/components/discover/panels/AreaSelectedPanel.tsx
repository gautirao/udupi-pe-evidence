import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ChevronLeft,
  Layers,
  MapPin,
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
import { PropertyCard } from '../PropertyCard';
import { AreaFirstBreadcrumb } from '../AreaFirstBreadcrumb';
import type { DiscoverJourney, DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { deriveDiscoverEmptyStateCopy } from '../emptyStateCopy';
import { StartOverButton } from '../StartOverButton';
import { useDiscoverActions, useDiscoverNav, useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { AreaSetSelectedHeader, AreaSetTwoTileRow } from './AreaSetSelectedExtras';
import { AreaZeroResultRecovery } from './AreaZeroResultRecovery';
import { DEFAULT_CITY } from '@/lib/localityUtils';

// Quick filter options (hardcoded MVP). 'All' is a virtual chip that clears the
// property-type selection — it is not a property_type value.
const QUICK_PROPERTY_TYPES = ['apartment', 'villa', 'land'] as const;
const QUICK_BEDROOMS = [2, 3] as const;

// Issue #2023 — fixed budget bands (rupees), matching the frozen mock
// (docs/design/retrends-design-system/ui_kits/new_discover/src/ExpPanel.jsx
// ~L55-72: "Any price" / "≤50L" / "≤80L" / "≤1.2Cr"). A max-only band; the
// "Any price" chip clears priceMin/priceMax entirely (there is no min-price
// control on this card).
const QUICK_BUDGETS = [
  { label: '≤ ₹50L', max: 5_000_000 },
  { label: '≤ ₹80L', max: 8_000_000 },
  { label: '≤ ₹1.2Cr', max: 12_000_000 },
] as const;

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartments',
  villa: 'Villas',
  land: 'Plots',
};

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
  isViewportScope = false,
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

  // Compute active property types and bedrooms from current filters
  const activePropertyTypes = useMemo(
    () => new Set(filters.propertyTypes || []),
    [filters.propertyTypes],
  );
  const activeBedrooms = useMemo(
    () => new Set(filters.bedrooms || []),
    [filters.bedrooms],
  );
  const allTypesActive = activePropertyTypes.size === 0;
  // Budget chips are single-select (max-only bands); "Any price" is active
  // when no priceMax is set.
  const activePriceMax = filters.priceMax;
  const activeReadyToMove = Boolean(filters.readyToMove);

  const hasPropertyFilters = Boolean(
    filters.propertyTypes?.length ||
      filters.bedrooms?.length ||
      filters.priceMin ||
      filters.priceMax ||
      // Issue #2023 code-review follow-up — a stale/URL-carried readyToMove
      // has no effect on this surface's listings when unsupported (see
      // `isReadyToMoveSupported` JSDoc), so it must not drive "filters are
      // active" copy/empty-state messaging here either — that would tell the
      // user filters are narrowing results when none actually are.
      (isReadyToMoveSupported && filters.readyToMove)
  );

  // Toggle property type: add if not present, remove if already active
  const handleTogglePropertyType = useCallback(
    (type: string) => {
      if (!onFiltersChange) return;
      const current = filters.propertyTypes || [];
      const updated = activePropertyTypes.has(type)
        ? current.filter((t) => t !== type)
        : [...current, type];
      onFiltersChange({ ...filters, propertyTypes: updated.length > 0 ? updated : undefined });
    },
    [filters, activePropertyTypes, onFiltersChange],
  );

  // "All" chip clears the property-type selection (does not touch bedrooms/price).
  const handleSelectAllTypes = useCallback(() => {
    if (!onFiltersChange) return;
    if (allTypesActive) return; // already all
    onFiltersChange({ ...filters, propertyTypes: undefined });
  }, [filters, allTypesActive, onFiltersChange]);

  // Toggle bedroom count: add if not present, remove if already active
  const handleToggleBedroom = useCallback(
    (bed: number) => {
      if (!onFiltersChange) return;
      const current = filters.bedrooms || [];
      const updated = activeBedrooms.has(bed)
        ? current.filter((b) => b !== bed)
        : [...current, bed];
      onFiltersChange({ ...filters, bedrooms: updated.length > 0 ? updated : undefined });
    },
    [filters, activeBedrooms, onFiltersChange],
  );

  // Budget chips are single-select: picking a band replaces priceMax (and
  // clears priceMin — this card has no min control). `undefined` = "Any price".
  const handleSelectBudget = useCallback(
    (max: number | undefined) => {
      if (!onFiltersChange) return;
      onFiltersChange({ ...filters, priceMin: undefined, priceMax: max });
    },
    [filters, onFiltersChange],
  );

  // "Ready to move" is a boolean toggle chip. Issue #2023 code-review follow-up —
  // when the calling surface's listings hook can't actually filter on this
  // (isReadyToMoveSupported === false), the chip must not be toggleable at all,
  // so this bails out even if a click somehow reaches it (e.g. programmatic).
  const handleToggleReadyToMove = useCallback(() => {
    if (!onFiltersChange || !isReadyToMoveSupported) return;
    onFiltersChange({ ...filters, readyToMove: activeReadyToMove ? undefined : true });
  }, [filters, activeReadyToMove, onFiltersChange, isReadyToMoveSupported]);

  // Clear property-type filters only; preserve school, polygon, city, date, and other active filters
  const handleClearPropertyFilters = useCallback(() => {
    if (!onFiltersChange) return;
    onFiltersChange({
      ...filters,
      propertyTypes: undefined,
      bedrooms: undefined,
      priceMin: undefined,
      priceMax: undefined,
      localities: undefined,
      sellerTypes: undefined,
      backOnMarket: undefined,
      newToMarket: undefined,
      reraRegistered: undefined,
      readyToMove: undefined,
    });
  }, [filters, onFiltersChange]);

  const handleAddSchool = useCallback(() => {
    onAddSchool?.();
  }, [onAddSchool]);

  const resolvedCityLabel = cityLabel ?? city ?? '';
  const count = areaListings?.length ?? 0;

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

  // "Edit areas" / "Add nearby areas" open the AREA_SET draft (Issue #2017;
  // desktop rework owner-directed) — `openAreaSetDraft()` is the single
  // cross-tree open signal both surfaces read: on mobile it drives
  // AreaSetChips's map-anchored popover (paired with `setMobileView('MAP')`
  // to reveal the map surface first); on desktop DiscoverRightPanel reads
  // the same flag directly to swap this panel for AreaSetDraftPanel in
  // place — `setMobileView('MAP')` is a no-op there since desktop already
  // shows map and panel together.
  const handleEditAreas = useCallback(() => {
    shell.setMobileView('MAP');
    shell.openAreaSetDraft();
  }, [shell]);
  const handleClearAreas = useCallback(() => {
    actions.commitResultScope(null);
  }, [actions]);
  const handleAddNearbyAreas = useCallback(() => {
    shell.setMobileView('MAP');
    shell.openAreaSetDraft();
  }, [shell]);

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

      {/* Header — journey pill row, headline, subcopy */}
      <div className="border-b border-border px-4 pb-4 pt-3.5">
        <div className="mb-2.5 flex items-center justify-between gap-2">
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
            // Issue #2017 (Fit all / focus-one) — camera-only actions
            // registered by useDiscoverMapDataController; see
            // DiscoverShellContextValue's AreaSetCameraActions doc. Neither
            // call touches `resultScope`/`rareas`.
            onFitAll={shell.fitAreaSet}
            onFocusArea={shell.focusAreaSetMember}
          />
        ) : (
          <>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {isViewportScope ? 'Result scope — Search this area' : 'Result scope — Selected area'}
                </p>
                <h1 className="mt-0.5 font-['Fraunces',_ui-serif,_Georgia,_serif] text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
                  {isViewportScope ? 'Properties in this area' : `Properties in ${areaLabel}`}
                </h1>
              </div>
              {!isLoadingListings && (
                <div className="shrink-0 text-right" data-testid="area-header-count">
                  <p className="font-mono text-2xl font-semibold leading-none tabular-nums text-foreground">
                    {count}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {intentNoun === 'rent' ? 'shown for rent' : 'shown for sale'}
                  </p>
                </div>
              )}
            </div>
            {/* R-C — sub-copy: 15px, 1.55 line-height, --text-body colour. */}
            <p className="mt-1.5 text-[15px] leading-[1.55] text-[hsl(var(--text-body))]">
              {isViewportScope
                ? 'Explore verified listings in this map area, with map context and area-first filters.'
                : `Explore verified listings around ${areaLabel}, with map context and area-first filters.`}
            </p>
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
            : `Showing ${intentNoun} prices in ₹ for ${areaLabel}.`}
        </p>

        {activeContextChips != null && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">{activeContextChips}</div>
        )}
      </div>

      {/* Issue #2084 (AC8) — school-shortcut CTA, promoted OUT of the quick-
          filter box below into its own full-width card, positioned directly
          under the header (before search/filters). A single modest button
          row (icon + label + "Optional" hint) — not a hero/image block — so
          it never competes with the listing list for visual weight.

          Issue #2017 (release-blocking fix) — the mock's own state machine
          (Experience.jsx: `single = scopeKind === "AREA_SET" && committed.length
          === 1`, `v.areaActions = single`) gates the two-tile "Schools in X /
          Add nearby areas" row on exactly ONE committed area, not on an
          already-committed multi-area set. The previous `multiAreaKeys ?
          <AreaSetTwoTileRow/> : <plain CTA/>` gate here was inverted relative
          to that: it only showed the two-tile row (and therefore the "Add
          nearby areas" entry point) once a 2-3 area AREA_SET was ALREADY
          committed — the single-Area state a shopper actually starts from
          had no path in at all (confirmed live: JP Nagar single-Area select
          showed only "Add a school in this area"). The committed multi-area
          state's own action surface is the ghost-button row already rendered
          inside `AreaSetSelectedHeader` above (Edit areas / Clear selected
          areas / Draw search area / Create alert) — matching the mock's
          `EPScopeBar` AREA_SET row — so nothing else is needed there.

          VIEWPORT scope (`isViewportScope`, Issue #2015) is deliberately
          excluded from the two-tile swap: "Add nearby areas" extends an
          AREA_SET chip selection, which is not what a viewport-bounds
          "Search this area" result represents. VIEWPORT keeps the original
          plain "Add a school" CTA unchanged — out of this fix's investigated
          scope (see PR #2424 STATE MAP/VISUAL CONTRACT comment). */}
      {multiAreaKeys ? null : !isViewportScope ? (
        <AreaSetTwoTileRow
          primaryAreaName={selectedArea.areaLabel}
          onAddSchool={onAddSchool ? handleAddSchool : undefined}
          onAddNearbyAreas={handleAddNearbyAreas}
        />
      ) : (
        onAddSchool && (
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
        )
      )}

      {/* Search — moved ABOVE the quick-filter card (Issue #2084 AC8: heading
          -> school CTA -> search -> filters -> result-count -> cards). */}
      {onSearchChange && (
        <div className="border-b border-border px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Search properties in ${areaLabel}`}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-9 pl-8 pr-8 text-sm"
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
        </div>
      )}

      {/* Quick filter card — property type + bedrooms (the school CTA above is
          now a separate, full-width card — see #2084 AC8). */}
      {/* F2 — outer section keeps border-b layout; inner white card matches the controls card surface. */}
      <div className="border-b border-border px-4 py-3">
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="space-y-3">
            <div className="space-y-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                Property type
              </span>
              <div className="flex flex-wrap gap-1.5">
                {/* R-C — "All" chip: NAVY (--primary) when active. Mock spec uses navy for property-type chips. */}
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-8 px-3 text-xs',
                    allTypesActive
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                      : '',
                  )}
                  onClick={handleSelectAllTypes}
                  data-testid="quick-chip-all"
                  aria-pressed={allTypesActive}
                >
                  All
                </Button>
                {QUICK_PROPERTY_TYPES.map((type) => (
                  <Button
                    key={type}
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-8 px-3 text-xs',
                      activePropertyTypes.has(type)
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                        : '',
                    )}
                    onClick={() => handleTogglePropertyType(type)}
                    data-testid={`quick-chip-${type}`}
                    aria-pressed={activePropertyTypes.has(type)}
                  >
                    {PROPERTY_TYPE_LABELS[type]}
                  </Button>
                ))}
                {/* Issue #2023 — "Ready to move" sits on the trailing edge of the Type
                    row per the frozen mock (ExpPanel.jsx ~L55-72). Evergreen-tint
                    active state, matching this file's existing trust/verified colour
                    convention (ShieldCheck / evergreen-tint result-summary strip
                    below), distinct from the navy property-type and copper bedroom
                    chips.

                    Code-review follow-up — not every calling surface can actually
                    filter on this (see `isReadyToMoveSupported` JSDoc above). When
                    unsupported the chip renders muted/disabled with an explanatory
                    title instead of toggling into an active state that has no
                    effect on the listings shown — an active-looking chip that does
                    nothing is a UX-honesty bug, not a cosmetic one. If a stale
                    `filters.readyToMove=true` arrives from a prior session/URL on
                    an unsupported surface, this deliberately still renders inert
                    (not visually active) rather than silently clearing the user's
                    URL state as a side effect. */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!isReadyToMoveSupported}
                  className={cn(
                    'h-8 px-3 text-xs ml-auto',
                    !isReadyToMoveSupported
                      ? 'cursor-not-allowed opacity-50'
                      : activeReadyToMove
                        ? 'border-evergreen bg-evergreen-tint text-evergreen shadow-sm hover:bg-evergreen-tint/80'
                        : '',
                  )}
                  onClick={isReadyToMoveSupported ? handleToggleReadyToMove : undefined}
                  data-testid="quick-chip-ready-to-move"
                  aria-pressed={isReadyToMoveSupported && activeReadyToMove}
                  title={
                    isReadyToMoveSupported
                      ? undefined
                      : "Ready-to-move filtering isn't available in this view yet — try Browse all listings"
                  }
                >
                  Ready to move
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Bedrooms
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {/* R-C — BHK chips: copper-tint active (mock uses copper-tint for BHK, navy for property-type). */}
                {QUICK_BEDROOMS.map((bed) => (
                  <Button
                    key={bed}
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-8 px-3 text-xs',
                      activeBedrooms.has(bed)
                        ? 'border-copper bg-copper-tint text-[hsl(var(--copper))] shadow-sm hover:bg-copper-tint/80'
                        : '',
                    )}
                    onClick={() => handleToggleBedroom(bed)}
                    data-testid={`quick-chip-${bed}-bhk`}
                    aria-pressed={activeBedrooms.has(bed)}
                  >
                    {bed} BHK
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Budget
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Fixed budget bands (mock parity) — navy active state, matching
                    the property-type chips (both are single-facet selections). */}
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-8 px-3 text-xs',
                    activePriceMax == null
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                      : '',
                  )}
                  onClick={() => handleSelectBudget(undefined)}
                  data-testid="quick-chip-budget-any"
                  aria-pressed={activePriceMax == null}
                >
                  Any price
                </Button>
                {QUICK_BUDGETS.map((budget) => (
                  <Button
                    key={budget.max}
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-8 px-3 text-xs',
                      activePriceMax === budget.max
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                        : '',
                    )}
                    onClick={() => handleSelectBudget(budget.max)}
                    data-testid={`quick-chip-budget-${budget.max}`}
                    aria-pressed={activePriceMax === budget.max}
                  >
                    {budget.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

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
              noun: intentNoun === 'rent' ? 'rentals' : 'homes',
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
            // A committed VIEWPORT scope ("Search this area") keeps the
            // existing EmptyState: its recovery is "expand the visible map
            // area" / "return to previous areas", a different scope-specific
            // stack that the mock defines separately (`EPZero` L300-310) and
            // that a later slice owns. Offering AREA-shaped nearby suggestions
            // there would answer a question the shopper did not ask.
            if (!isViewportScope) {
              return (
                <AreaZeroResultRecovery
                  scopeAreaKeys={multiAreaKeys ?? [selectedArea.areaKey]}
                  fallbackScopeName={areaLabel}
                  city={city || nav.city || DEFAULT_CITY}
                  filters={filters}
                  intent={intent}
                  searchQuery={searchQuery}
                  noun={intentNoun === 'rent' ? 'rentals' : 'homes'}
                  cause={copy.cause}
                  onApplyFilters={onFiltersChange}
                  onClearFilters={onClearFilters}
                  onClearSearch={onClearSearch}
                />
              );
            }

            const primaryAction =
              copy.primaryLabel === 'Clear filters' && onClearFilters
                ? { label: copy.primaryLabel, onClick: onClearFilters }
                : copy.primaryLabel === 'Clear search' && onClearSearch
                  ? { label: copy.primaryLabel, onClick: onClearSearch }
                  : undefined;
            const secondaryAction =
              copy.secondaryLabel == null
                ? undefined
                : copy.secondaryIsClearFilters && onClearFilters
                  ? { label: copy.secondaryLabel, onClick: onClearFilters }
                  : copy.cause === 'filters' && onClearFilters
                    ? { label: copy.secondaryLabel, onClick: onClearFilters } // "See all N in {scope}" == clear filters
                    : undefined;
            return (
              <div
                className="m-4 rounded-xl border border-border bg-muted/20 px-4 py-14 shadow-sm"
                data-testid="area-empty-state"
                data-empty-cause={copy.cause}
              >
                <EmptyState
                  icon={<MapPin className="h-8 w-8 text-muted-foreground/40" />}
                  heading={copy.heading}
                  description={copy.description}
                  primaryAction={primaryAction}
                  secondaryAction={secondaryAction}
                />
              </div>
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
            <div className="flex items-center gap-1.5 border-b border-border bg-evergreen-tint/60 px-4 py-2.5" data-testid="area-result-summary">
              <ShieldCheck className="h-4 w-4 shrink-0 text-evergreen" aria-hidden="true" />
              <p className="text-xs font-medium text-foreground" data-testid="area-result-summary-text">
                {areaResultSummaryText ??
                  `${count} verified ${count === 1 ? 'property' : 'properties'} for ${intentNoun}${
                    isViewportScope ? ' in this area' : ` in ${areaLabel}`
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
            <div className="area-listings-grid grid grid-cols-1 gap-3 p-4">
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
