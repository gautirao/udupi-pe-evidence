import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
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

// Quick filter options (hardcoded MVP). 'All' is a virtual chip that clears the
// property-type selection — it is not a property_type value.
const QUICK_PROPERTY_TYPES = ['apartment', 'villa', 'land'] as const;
const QUICK_BEDROOMS = [2, 3] as const;

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

  const hasPropertyFilters = Boolean(
    filters.propertyTypes?.length || filters.bedrooms?.length || filters.priceMin || filters.priceMax
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

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
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

        {/* R-C — Fraunces serif headline: 2.375rem (38px), design-source exact. */}
        <h1 className="font-['Fraunces',_ui-serif,_Georgia,_serif] text-[2.375rem] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground">
          Properties in {areaLabel}
        </h1>
        {/* R-C — sub-copy: 15px, 1.55 line-height, --text-body colour. */}
        <p className="mt-1.5 text-[15px] leading-[1.55] text-[hsl(var(--text-body))]">
          Explore verified listings around {areaLabel}, with map context and area-first filters.
        </p>

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
          Showing {intentNoun} prices in ₹ for {areaLabel}.
        </p>

        {activeContextChips != null && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">{activeContextChips}</div>
        )}
      </div>

      {/* Quick filter card — property type + bedrooms + add-school affordance */}
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
                {onAddSchool && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-8 gap-1.5 px-3 text-xs"
                    onClick={handleAddSchool}
                    data-testid="add-school-cta"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add a school in this area
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
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
            {/* Intent-aware verified result summary (Issue #1494 / #1606) */}
            {/* a4 — warm evergreen-tint/60 strip instead of near-invisible bg-muted/20 */}
            <div className="flex items-center gap-1.5 border-b border-border bg-evergreen-tint/60 px-4 py-2.5" data-testid="area-result-summary">
              <ShieldCheck className="h-4 w-4 shrink-0 text-evergreen" aria-hidden="true" />
              <p className="text-xs font-medium text-foreground" data-testid="area-result-summary-text">
                {areaResultSummaryText ??
                  `${count} verified ${count === 1 ? 'property' : 'properties'} for ${intentNoun} in ${areaLabel}`}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 2xl:grid-cols-2">
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
