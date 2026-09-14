import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Issue #2450 — the two TYPE families a buyer chooses between.
 *
 * `QUICK_PROPERTY_TYPES` above is the Residential family's membership; Commercial rides the
 * SUBTYPE axis alone (see `COMMERCIAL_SUBTYPE_CHOICES`), which is why there is no
 * `QUICK_COMMERCIAL_TYPES` counterpart.
 */
type PropertyFamily = 'residential' | 'commercial';

/**
 * Stored `property_type` tokens that mean "this selection is in the Commercial family".
 *
 * Used ONLY to DERIVE which family chip reads as active from inbound URL/filter state. It is
 * deliberately never used to WRITE: emitting one of these alongside a subtype is the auto-add
 * contradiction #2450 exists to remove (`type=commercial&subtype=WAREHOUSE` asks for a set no
 * row is in, because `commercial` rows never carry WAREHOUSE). Mirrors the server's
 * `DiscoverFilterNormalizer.BUYER_SUBTYPE_TO_PROPERTY_TYPE` value set.
 */
const COMMERCIAL_FAMILY_TOKENS: readonly string[] = [
  'commercial',
  'commercial_building',
  'warehouse',
  'commercial_land',
];

/**
 * #2450's approved buyer wording for the Commercial subtype row.
 *
 * DELIBERATELY NOT `COMMERCIAL_SUBTYPE_LABELS` from propertyTypeConfig.ts, which renders SHOP as
 * "Commercial Shop" and OFFICE as "Commercial Office". That is correct on a result CARD, where a
 * bare "Shop" would read as a different property family. Inside a row already scoped to Commercial
 * the family context is established by the control itself, so #2450 specifies the shorter wording.
 * The mismatch is recorded on PR #2500 as a focused follow-up — it is not a second private label
 * map, and it does not change #2430's card labels.
 *
 * `value: null` is the "All commercial" chip: it clears the subtype narrowing WITHOUT leaving the
 * family, so it is a virtual choice rather than a sixth subtype.
 */
const COMMERCIAL_SUBTYPE_CHOICES: readonly {
  testId: string;
  label: string;
  value: CommercialSubtype | null;
}[] = [
  { testId: 'quick-chip-subtype-all', label: 'All commercial', value: null },
  { testId: 'quick-chip-subtype-shop', label: 'Shop', value: 'SHOP' },
  { testId: 'quick-chip-subtype-office', label: 'Office', value: 'OFFICE' },
  { testId: 'quick-chip-subtype-building', label: 'Commercial Building', value: 'BUILDING' },
  { testId: 'quick-chip-subtype-warehouse', label: 'Warehouse / Godown', value: 'WAREHOUSE' },
  { testId: 'quick-chip-subtype-land', label: 'Commercial Land', value: 'LAND' },
];

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
   * Issue #2450 — whether the calling surface's listings hook can actually consume a Commercial
   * SUBTYPE narrowing. Follows the `isReadyToMoveSupported` precedent directly above, and for the
   * same honesty reason, but **defaults FALSE** where that one defaults true.
   *
   * WHY FALSE IS THE RIGHT DEFAULT HERE. This panel's card list is fed by
   * `useDiscoverCityListings`, which carries no `commercialSubtypes` param at all. So on
   * today's surfaces a buyer picking Commercial → Warehouse would see results **unchanged** —
   * not zero. That is worse than an empty list: zero at least signals that something happened,
   * whereas unchanged results signal a control that did nothing.
   *
   * Issue #2533 removed the OTHER half of this reasoning: that hook's `propertyType` was also
   * SINGULAR, so a multi-select dropped the type filter outright. It now accepts and sends the
   * full selection. The subtype gap above is what still keeps this flag false.
   * Shipping it reachable would pin exactly the inert-control class #2450 exists to remove.
   *
   * GATE-OFF IS "NO FAMILY ROW", NOT "RESIDENTIAL ALONE" (owner ruling on PR #2500, Option A).
   * While this is false the panel renders NO family row and today's buyer surface is preserved
   * byte-for-byte. A one-option Residential-only selector was explicitly REJECTED: a lone
   * Residential chip is indistinguishable from "this product has no commercial inventory", which
   * is a claim about the catalogue that the capability flag is not making.
   *
   * It flips to true once the card path can consume a subtype — which is #2533's multi-value
   * narrowing work. #2533 must land before this is ENABLED; it does not block this being built.
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
      // Issue #2450 — a subtype-only selection is a REAL narrowing under the one-axis contract
      // (it rides `commercialSubtypes` and sets no `propertyTypes`), so omitting it here would
      // hide the clear affordance from the only filter the buyer has actually applied and tell
      // the empty state that nothing is narrowing when something is.
      filters.commercialSubtypes?.length ||
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

  // ── Issue #2450 — Residential / Commercial family + Commercial subtype ─────────────────
  const activeCommercialSubtypes = useMemo(
    () => new Set<string>(filters.commercialSubtypes ?? []),
    [filters.commercialSubtypes],
  );

  // The family is DERIVED from filter state rather than stored separately. Under the one-axis
  // contract a selection rides `commercialSubtypes` alone and sets no `propertyTypes`, so a
  // restored link carrying only `subtype=WAREHOUSE` must still read as Commercial — otherwise the
  // buyer returns to their own link and sees Residential selected while Commercial results render.
  const commercialFromFilters =
    activeCommercialSubtypes.size > 0 ||
    (filters.propertyTypes ?? []).some((t) => COMMERCIAL_FAMILY_TOKENS.includes(t));

  // A click must switch the visible family before the emitted filters round-trip back as props:
  // on the FIRST Commercial click there is no subtype yet, so derivation alone would leave the row
  // closed and the chip unpressed. `null` means "no click yet — trust the filters".
  const [familyOverride, setFamilyOverride] = useState<PropertyFamily | null>(null);
  const activeFamily: PropertyFamily =
    familyOverride ?? (commercialFromFilters ? 'commercial' : 'residential');

  // ANON POSTURE — owner ruling on PR #2500. This SUPERSEDES the disabled-with-explanation posture
  // this panel previously implemented, and the earlier one is described below rather than deleted
  // because what changed was the mechanism, not the taste.
  //
  // ANONYMOUS BUYERS BROWSE AND FILTER COMMERCIAL EXACTLY AS THEY DO RESIDENTIAL: they switch
  // family, pick subtypes, and see the normal anonymous teaser result set. Sign-in is required only
  // for the protected listing detail Residential already gates, which `PropertyCard` owns via
  // `isAuthenticated` further down this file. There is deliberately NO Commercial-specific auth
  // condition here — reintroducing one would be a second, divergent anon posture, which the ruling
  // forbids in those words.
  //
  // WHY THE OLD GATE WENT. It rested on the anonymous endpoint matching property type by
  // single-value equality, so that the four-value Commercial family (`commercial`,
  // `commercial_building`, `warehouse`, `commercial_land`) was inexpressible and any anon
  // Commercial control would have silently excluded three of the four. #2550 removed that
  // impossibility: `CityAreaListingsService` now normalises a multi-value property-type list
  // through a shared `appendPropertyTypeClause` emitting `IN (...)` on both the areaKeys and
  // bbox-only paths. The premise is gone, so the gate built on it is gone with it.
  //
  // REACHABILITY IS GOVERNED BY THE CAPABILITY ALONE, and it defaults FALSE — see
  // `isCommercialSubtypeSupported`. Enablement additionally waits on #2509 making the anonymous
  // city-listings path express family/subtype/multi-select truthfully and cache-safely. Nothing
  // here is buyer-reachable today.
  const showSubtypeRow = isCommercialSubtypeSupported && activeFamily === 'commercial';

  const handleSelectFamily = useCallback(
    (family: PropertyFamily) => {
      // CAPABILITY guard only — auth is deliberately not consulted (see the anon-posture note
      // above). Mirrors `handleToggleReadyToMove`: bail out even if a click somehow reaches the
      // control while this surface cannot consume the axis, so no unconsumable request is emitted.
      if (family === 'commercial' && !isCommercialSubtypeSupported) return;
      setFamilyOverride(family);
      if (!onFiltersChange) return;
      onFiltersChange(
        family === 'commercial'
          ? // Residential types do not survive the switch, but everything else does: Budget and
            // Bedrooms are family-independent, and silently dropping them is its own defect.
            { ...filters, propertyTypes: undefined }
          : { ...filters, commercialSubtypes: undefined },
      );
    },
    [filters, onFiltersChange, isCommercialSubtypeSupported],
  );

  // ONE AXIS. The selection rides `commercialSubtypes` and nothing else — no family token is ever
  // auto-added. See `COMMERCIAL_FAMILY_TOKENS` for why doing so matches zero rows and fails
  // silently for BUILDING / WAREHOUSE / LAND.
  const handleToggleSubtype = useCallback(
    (value: CommercialSubtype | null) => {
      if (!onFiltersChange || !isCommercialSubtypeSupported) return;
      if (value === null) {
        // "All commercial" clears the narrowing WITHOUT leaving the family, so any inbound
        // `propertyTypes` is preserved exactly as it arrived rather than rewritten.
        onFiltersChange({ ...filters, commercialSubtypes: undefined });
        return;
      }
      const current = filters.commercialSubtypes ?? [];
      const updated = activeCommercialSubtypes.has(value)
        ? current.filter((s) => s !== value)
        : [...current, value];
      onFiltersChange({
        ...filters,
        commercialSubtypes: updated.length > 0 ? updated : undefined,
      });
    },
    [filters, activeCommercialSubtypes, onFiltersChange, isCommercialSubtypeSupported],
  );

  // Clear property-type filters only; preserve school, polygon, city, date, and other active filters
  const handleClearPropertyFilters = useCallback(() => {
    if (!onFiltersChange) return;
    onFiltersChange({
      ...filters,
      propertyTypes: undefined,
      // Issue #2450 — enumerated explicitly like every key above. "Clear" that leaves the
      // Commercial subtype narrowing in place is a clear affordance that does not clear.
      commercialSubtypes: undefined,
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
            {!isViewportScope && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5" data-testid="area-single-action-row">
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
                      ? 'Properties in your drawn area'
                      : `Properties in ${areaLabel}`}
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
            {/* Issue #2450 — TYPE family. Rendered ONLY when the calling surface can actually
                consume a Commercial subtype: while the capability is off the owner ruling is that
                today's buyer surface is preserved unchanged, so there is no family row at all
                rather than a one-option Residential selector. */}
            {isCommercialSubtypeSupported && (
              <div className="space-y-2" data-testid="quick-family-row">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  Property family
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-8 px-3 text-xs',
                      activeFamily === 'residential'
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                        : '',
                    )}
                    onClick={() => handleSelectFamily('residential')}
                    data-testid="quick-chip-family-residential"
                    aria-pressed={activeFamily === 'residential'}
                  >
                    Residential
                  </Button>
                  {/* Structurally identical to the Residential chip above, and that is the ruling
                      expressed in markup rather than asserted in a comment: same browsing posture
                      for both families, no auth condition, no disabled branch, no gate copy. */}
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-8 px-3 text-xs',
                      activeFamily === 'commercial'
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                        : '',
                    )}
                    onClick={() => handleSelectFamily('commercial')}
                    data-testid="quick-chip-family-commercial"
                    aria-pressed={activeFamily === 'commercial'}
                  >
                    Commercial
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                Property type
              </span>
              <div className="flex flex-wrap gap-1.5">
                {/* Issue #2450 — the Residential type chips and the Commercial subtype row are
                    MUTUALLY EXCLUSIVE, and this condition is what makes that true rather than a
                    comment claiming it. Rendered together, a buyer can hold
                    `propertyTypes:['apartment']` AND `commercialSubtypes:['SHOP']` at the same
                    time, which `DiscoverListingPredicateBuilder` ANDs into a query no row can
                    satisfy — the contradictory-selection class this issue exists to remove,
                    reintroduced through the UI instead of through emission.

                    Gated on `showSubtypeRow` (capability AND commercial family), NOT on
                    `activeFamily` alone. While the capability is off the family is still DERIVED
                    from an inbound `subtype=` URL, so keying off it there would hide the type
                    chips on the surface the owner ruled must stay exactly as it is today. Auth is
                    not a factor in either direction — signed-out and signed-in buyers get the
                    same row (see the anon-posture note above). */}
                {!showSubtypeRow && (
                  <>
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
                  </>
                )}
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

              {/* Commercial subtype row — family-local, so it appears only while Commercial is the
                  active family and never alongside the Residential type chips. The second half of
                  that sentence is enforced by the `!showSubtypeRow` guard on those chips above, on
                  this same condition; an earlier revision asserted it in prose while the two rows
                  rendered in the same block, which is how the contradictory selection stayed
                  reachable. */}
              {showSubtypeRow && (
                <div className="flex flex-wrap items-center gap-1.5" data-testid="quick-subtype-row">
                  {COMMERCIAL_SUBTYPE_CHOICES.map((choice) => {
                    // "All commercial" is the active chip precisely when no subtype narrows the
                    // family — it is the absence of a narrowing, not a sixth subtype.
                    const pressed =
                      choice.value === null
                        ? activeCommercialSubtypes.size === 0
                        : activeCommercialSubtypes.has(choice.value);
                    return (
                      <Button
                        key={choice.testId}
                        variant="outline"
                        size="sm"
                        className={cn(
                          'h-8 px-3 text-xs',
                          pressed
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                            : '',
                        )}
                        onClick={() => handleToggleSubtype(choice.value)}
                        data-testid={choice.testId}
                        aria-pressed={pressed}
                      >
                        {choice.label}
                      </Button>
                    );
                  })}
                </div>
              )}
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
                onApplyFilters={onFiltersChange}
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
            <div className="flex items-center gap-1.5 border-b border-border bg-evergreen-tint/60 px-4 py-2.5" data-testid="area-result-summary">
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
