/**
 * AgriGroupLocalityPanel — Issue #1464, redesigned for Issue #1771 (mock parity).
 *
 * Renders the parcels for a single locality/town within an agri-group-selected
 * region. Activated when the user clicks a town card in AgriGroupSelectedPanel.
 *
 * Layout (matches the approved Bangalore agri mock):
 *   - "Back to towns" link
 *   - Dark navy locality hero: breadcrumb › Town/Locality label › title › stat row
 *   - Grouped inline filter block (Land size / Price range / Soil / access chips)
 *   - Image-led parcel cards in a responsive two-column grid
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Sprout,
  AlertCircle,
  Lock,
  MapPin,
  Route,
  Droplets,
  Layers,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice } from '@/lib/formatters';
import {
  LAND_CATEGORY_LABELS,
  WATER_SOURCE_LABELS,
  ROAD_ACCESS_LABELS,
  SOIL_TYPE_LABELS,
  CULTIVATION_STATUS_LABELS,
  OWNERSHIP_TYPE_LABELS,
} from '@/lib/agriFieldLabels';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { PanelColumn } from './_shared';
import { CompactFilterBar } from '@/features/discover/buyer-filters/sections/CompactFilterBar';
import type { FilterBarGroup } from '@/features/discover/buyer-filters/sections/CompactFilterBar';

const FRAUNCES = "font-['Fraunces',_ui-serif,_Georgia,_serif]";

function agriPriceLabel(pricePaise: number | null | undefined): string | null {
  if (pricePaise == null || pricePaise <= 0) return null;
  return formatPrice(Math.round(pricePaise / 100), 'INR');
}

/** Best-effort acreage for a listing: computed acres, else landArea when the unit is acres. */
function listingAcres(item: AgriMapListingItem): number | null {
  if (item.computedAreaAcres != null) return item.computedAreaAcres;
  if (item.landArea != null && item.landAreaUnit && /acre/i.test(item.landAreaUnit)) {
    return item.landArea;
  }
  return null;
}

// ─── Inline filter model (client-side, presentational — Issue #1771) ──────────
// These filter the already-fetched locality parcels locally; they do not touch
// URL state or refetch. The URL-backed advanced filters remain on the corridor
// panel's Filters drawer.

type SizeFilter = 'any' | 'lt1' | '1to3' | '3to5' | 'gte5';
type PriceFilter = 'any' | 'lt1cr' | '1to2cr' | 'gte2cr';

const SIZE_OPTIONS: { key: SizeFilter; label: string }[] = [
  { key: 'any', label: 'Any size' },
  { key: 'lt1', label: '< 1 ac' },
  { key: '1to3', label: '1–3 ac' },
  { key: '3to5', label: '3–5 ac' },
  { key: 'gte5', label: '5 ac+' },
];

const PRICE_OPTIONS: { key: PriceFilter; label: string }[] = [
  { key: 'any', label: 'Any price' },
  { key: 'lt1cr', label: '< ₹1 Cr' },
  { key: '1to2cr', label: '₹1–2 Cr' },
  { key: 'gte2cr', label: '₹2 Cr+' },
];

const CRORE_PAISE = 1_00_00_000 * 100; // ₹1 Cr in paise

function matchesSize(item: AgriMapListingItem, size: SizeFilter): boolean {
  if (size === 'any') return true;
  const acres = listingAcres(item);
  if (acres == null) return false;
  switch (size) {
    case 'lt1':
      return acres < 1;
    case '1to3':
      return acres >= 1 && acres <= 3;
    case '3to5':
      return acres >= 3 && acres <= 5;
    case 'gte5':
      return acres >= 5;
  }
}

function matchesPrice(item: AgriMapListingItem, price: PriceFilter): boolean {
  if (price === 'any') return true;
  const paise = item.pricePaise;
  if (paise == null || paise <= 0) return false;
  switch (price) {
    case 'lt1cr':
      return paise < CRORE_PAISE;
    case '1to2cr':
      return paise >= CRORE_PAISE && paise <= 2 * CRORE_PAISE;
    case 'gte2cr':
      return paise >= 2 * CRORE_PAISE;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgriGroupLocalityPanelProps {
  localityName: string;
  listings: AgriMapListingItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelectListing: (id: string) => void;
  onClose: () => void;
  /** Issue #1494 — current buy/rent intent for count label. Default 'buy'. */
  intent?: DiscoverIntent;
  /**
   * Issue #1547 — whether the viewer is authenticated. Drives the anon price gate on
   * the agri card rows (anon: "Sign in to view price" with a Lock; never a rupee value).
   * Defaults to false (safest: treats unknown viewers as anonymous).
   */
  isAuthenticated?: boolean;
  /**
   * Issue #1547 — id of the currently selected listing (URL/parent-derived, `listing`
   * URL param). Drives the copper selected card frame + scroll-into-view.
   */
  selectedListingId?: string | null;
  /** Issue #1771 — human-readable city label for the hero breadcrumb (e.g. "Udupi"). */
  cityLabel?: string;
  /** Issue #1771 — bearing label of the parent corridor (e.g. "North") for breadcrumb + back link. */
  regionLabel?: string | null;
  /** Issue #2762 — desktop renders filters in the shared CompactFilterBar; default keeps inline rows. */
  isDesktop?: boolean;
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function ListingSkeleton() {
  return (
    <div
      data-testid="agri-locality-listing-skeleton"
      className="rounded-xl border border-border overflow-hidden"
    >
      <Skeleton className="h-32 w-full rounded-none" />
      <div className="p-3.5 space-y-2">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

function FilterPill({
  label,
  selected,
  onClick,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-[#0F172A] bg-[#0F172A] text-white shadow-sm dark:border-evergreen dark:bg-evergreen dark:text-evergreen-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {label}
    </button>
  );
}

// ─── Panel ─────────────────────────────────────────────────────────────────────

export function AgriGroupLocalityPanel({
  localityName,
  listings,
  isLoading,
  isError,
  onRetry,
  onSelectListing,
  onClose,
  intent = 'buy',
  isAuthenticated = false,
  selectedListingId = null,
  cityLabel,
  regionLabel = null,
  isDesktop = false,
}: AgriGroupLocalityPanelProps) {
  // Sort by id ascending — stable, deterministic order across renders.
  // Spread first to avoid mutating the prop array.
  const sortedListings = [...listings].sort((a, b) => a.id.localeCompare(b.id));

  const count = sortedListings.length;
  const saleWord = intent === 'rent' ? 'rent' : 'sale';
  const displayCity = cityLabel && cityLabel.length > 0 ? cityLabel : 'this city';

  // ── Inline filters (local state, client-side — Issue #1771) ────────────────
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('any');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('any');
  const [soilFilter, setSoilFilter] = useState<string | null>(null); // null = any soil
  const [roadOnly, setRoadOnly] = useState(false);
  const [waterOnly, setWaterOnly] = useState(false);

  // Soil options derived from the data actually present in this locality.
  const soilOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const l of sortedListings) {
      if (l.soilType) seen.add(l.soilType);
    }
    return [...seen].sort();
  }, [sortedListings]);

  const filteredListings = useMemo(
    () =>
      sortedListings.filter(
        (l) =>
          matchesSize(l, sizeFilter) &&
          matchesPrice(l, priceFilter) &&
          (soilFilter == null || l.soilType === soilFilter) &&
          (!roadOnly || (l.roadAccess != null && l.roadAccess !== 'NO_ROAD_ACCESS')) &&
          (!waterOnly || (l.waterSource != null && l.waterSource !== 'NOT_AVAILABLE')),
      ),
    [sortedListings, sizeFilter, priceFilter, soilFilter, roadOnly, waterOnly],
  );

  const filtersActive =
    sizeFilter !== 'any' || priceFilter !== 'any' || soilFilter != null || roadOnly || waterOnly;

  const resetFilters = () => {
    setSizeFilter('any');
    setPriceFilter('any');
    setSoilFilter(null);
    setRoadOnly(false);
    setWaterOnly(false);
  };

  // Shared by the mobile inline block and the desktop CompactFilterBar popover (state is local to this panel).
  function renderFilterControls() {
    return (
      <>
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Land size
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Land size">
            {SIZE_OPTIONS.map((opt) => (
              <FilterPill
                key={opt.key}
                label={opt.label}
                selected={sizeFilter === opt.key}
                onClick={() => setSizeFilter(opt.key)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Price range
            {!isAuthenticated && <Lock className="h-3 w-3" aria-hidden="true" />}
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Price range">
            {PRICE_OPTIONS.map((opt) => (
              <FilterPill
                key={opt.key}
                label={opt.label}
                selected={priceFilter === opt.key}
                onClick={() => setPriceFilter(opt.key)}
                disabled={!isAuthenticated && opt.key !== 'any'}
              />
            ))}
          </div>
          {!isAuthenticated && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Sign in to filter by price.
            </p>
          )}
        </div>

        {soilOptions.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Soil / cultivation
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Soil type">
              <FilterPill
                label="Any soil"
                selected={soilFilter == null}
                onClick={() => setSoilFilter(null)}
              />
              {soilOptions.map((soil) => (
                <FilterPill
                  key={soil}
                  label={SOIL_TYPE_LABELS[soil] ?? soil}
                  selected={soilFilter === soil}
                  onClick={() => setSoilFilter(soilFilter === soil ? null : soil)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => setRoadOnly((v) => !v)}
            aria-pressed={roadOnly}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              roadOnly
                ? 'border-evergreen bg-evergreen-tint text-evergreen'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <Route className="h-3.5 w-3.5" aria-hidden="true" />
            Road access
          </button>
          <button
            type="button"
            onClick={() => setWaterOnly((v) => !v)}
            aria-pressed={waterOnly}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              waterOnly
                ? 'border-evergreen bg-evergreen-tint text-evergreen'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
            Water available
          </button>
          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              data-testid="agri-locality-filters-reset"
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors ml-1 self-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Clear all
            </button>
          )}
        </div>
      </>
    );
  }

  const localityFilterBarGroups: FilterBarGroup[] = [
    {
      id: 'agri-locality-filters',
      label: 'Land filters',
      isActive: filtersActive,
      testId: 'filter-pill-agri-locality-filters',
      renderPopover: () => <div className="space-y-3.5">{renderFilterControls()}</div>,
    },
  ];

  // Hero acreage total across the (unfiltered) locality parcels.
  const totalAcres = useMemo(() => {
    const values = sortedListings
      .map((l) => listingAcres(l))
      .filter((v): v is number => v != null);
    if (values.length === 0) return null;
    return Math.round(values.reduce((sum, v) => sum + v, 0) * 100) / 100;
  }, [sortedListings]);

  // Issue #1547 — scroll the selected agri card into view when selection is driven from
  // the map (marker→peek path #1466). Guards the missing-ref case (selected id not in the
  // rendered list, e.g. filtered out) so a marker click never crashes or scrolls nowhere.
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  useEffect(() => {
    if (!selectedListingId) return;
    const node = cardRefs.current.get(selectedListingId);
    // Guard: scrollIntoView is unavailable in some environments (jsdom) / older browsers.
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedListingId]);

  return (
    <div
      data-testid="agri-group-locality-panel"
      className="flex flex-col h-full bg-muted/20 overflow-y-auto"
    >
      <PanelColumn className="w-full max-w-[720px] px-4 pb-6 pt-4 space-y-4">
        {/* ── Back to towns ─────────────────────────────────────────────────── */}
        <button
          type="button"
          aria-label="Back to locality groups"
          data-testid="agri-locality-close-btn"
          onClick={onClose}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to towns{regionLabel ? ` in ${regionLabel}` : ''}
        </button>

        {/* ── Dark navy locality hero (mock parity, Issue #1771) ─────────────── */}
        <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-lg text-white">
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-400">
            <span>Discover {displayCity}</span>
            <span className="text-slate-600">›</span>
            <span>Agricultural land</span>
            {regionLabel && (
              <>
                <span className="text-slate-600">›</span>
                <span>{regionLabel}</span>
              </>
            )}
            <span className="text-slate-600">›</span>
            <span className="text-white">{localityName}</span>
          </div>

          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-evergreen text-white">
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Town / Locality
              </span>
              <h2
                data-testid="agri-locality-name"
                className={cn(FRAUNCES, 'mt-0.5 text-xl sm:text-2xl font-semibold leading-tight tracking-tight text-white')}
              >
                {localityName}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">
                Agricultural parcels for {saleWord} around {localityName}.
              </p>
            </div>
          </div>

          {!isLoading && !isError && (
            <div className="mt-5 grid grid-cols-2 border-t border-slate-800 pt-4" data-testid="agri-locality-count">
              <div className="flex min-w-0 flex-col">
                <span className="font-mono text-xl font-bold leading-none tracking-tight tabular-nums text-white">
                  {count}
                </span>
                <span className="mt-1.5 text-xs text-slate-400">
                  {count === 1 ? 'parcel' : 'parcels'} for {saleWord}
                </span>
              </div>
              <div className="flex min-w-0 flex-col border-l border-slate-800 pl-4">
                <span className="font-mono text-xl font-bold leading-none tracking-tight tabular-nums text-evergreen">
                  {totalAcres != null ? (totalAcres % 1 === 0 ? totalAcres : totalAcres.toFixed(1)) : '—'}
                </span>
                <span className="mt-1.5 text-xs text-slate-400">acres</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3" aria-busy="true">
            <ListingSkeleton />
            <ListingSkeleton />
            <ListingSkeleton />
            <ListingSkeleton />
          </div>
        ) : isError ? (
          <div
            data-testid="agri-locality-error-state"
            className="flex flex-col items-center justify-center p-6 gap-3 text-center"
          >
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Could not load listings for this locality.
            </p>
            <Button
              variant="outline"
              size="sm"
              data-testid="agri-locality-retry-btn"
              onClick={onRetry}
            >
              Retry
            </Button>
            <button
              type="button"
              data-testid="agri-locality-back-btn"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              onClick={onClose}
            >
              ← Back to all localities
            </button>
          </div>
        ) : sortedListings.length === 0 ? (
          <div
            data-testid="agri-locality-empty-state"
            className="flex flex-col items-center justify-center p-6 gap-3 text-center"
          >
            <Sprout className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              No listings found for {localityName}
            </p>
            <button
              type="button"
              data-testid="agri-locality-back-btn"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              onClick={onClose}
            >
              ← Back to all localities
            </button>
          </div>
        ) : (
          <>
            {/* Grouped filter block (mock parity, #1771); desktop uses shared bar (#2762) */}
            {isDesktop ? (
              <CompactFilterBar accent="agri" groups={localityFilterBarGroups} />
            ) : (
              <div
                data-testid="agri-locality-filters"
                className="rounded-xl border border-border bg-muted/60 p-4 space-y-3.5"
              >
                {renderFilterControls()}
              </div>
            )}

            {/* ── Parcels header ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <Layers className="h-3.5 w-3.5 text-evergreen" aria-hidden="true" />
                Parcels in {localityName}
              </p>
              <span className="text-xs font-medium text-muted-foreground">
                {filteredListings.length} shown
              </span>
            </div>

            {filteredListings.length === 0 ? (
              <div
                data-testid="agri-locality-filtered-empty"
                className="flex flex-col items-center justify-center p-6 gap-3 text-center rounded-xl border border-border bg-card"
              >
                <Sprout className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  No parcels match these filters.
                </p>
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              </div>
            ) : (
              <div
                data-testid="agri-locality-listings-list"
                className="grid grid-cols-1 xl:grid-cols-2 gap-3.5"
              >
                {filteredListings.map((item) => {
                  const isSelected = selectedListingId === item.id;
                  const priceLabel = agriPriceLabel(item.pricePaise);
                  const landArea =
                    item.landArea != null && item.landAreaUnit
                      ? `${item.landArea} ${item.landAreaUnit}`
                      : item.computedAreaAcres != null
                        ? `${item.computedAreaAcres.toFixed(2)} acres`
                        : null;
                  const categoryTag = item.landCategory
                    ? (LAND_CATEGORY_LABELS[item.landCategory] ?? item.landCategory)
                    : null;

                  // Metadata rows (2-col grid, mock parity). Only real data — fields
                  // absent from the public DTO (survey no., km out) are omitted.
                  const metaCells: { key: string; icon: typeof Route; label: string }[] = [];
                  if (item.roadAccess) {
                    metaCells.push({
                      key: 'road',
                      icon: Route,
                      label: ROAD_ACCESS_LABELS[item.roadAccess] ?? item.roadAccess,
                    });
                  }
                  if (item.waterSource && item.waterSource !== 'NOT_AVAILABLE') {
                    metaCells.push({
                      key: 'water',
                      icon: Droplets,
                      label: WATER_SOURCE_LABELS[item.waterSource] ?? item.waterSource,
                    });
                  }
                  if (item.soilType) {
                    metaCells.push({
                      key: 'soil',
                      icon: Layers,
                      label: SOIL_TYPE_LABELS[item.soilType] ?? item.soilType,
                    });
                  }
                  if (item.cultivationStatus) {
                    metaCells.push({
                      key: 'cultivation',
                      icon: Sprout,
                      label: CULTIVATION_STATUS_LABELS[item.cultivationStatus] ?? item.cultivationStatus,
                    });
                  }
                  if (item.ownershipType) {
                    metaCells.push({
                      key: 'ownership',
                      icon: FileText,
                      label: OWNERSHIP_TYPE_LABELS[item.ownershipType] ?? item.ownershipType,
                    });
                  }
                  if (item.farmhouseAvailable === true) {
                    metaCells.push({ key: 'farmhouse', icon: MapPin, label: 'Farmhouse' });
                  }
                  if (item.fencingDone === true) {
                    metaCells.push({ key: 'fencing', icon: FileText, label: 'Fenced' });
                  }

                  return (
                    <div
                      key={item.id}
                      ref={(node) => {
                        if (node) cardRefs.current.set(item.id, node);
                        else cardRefs.current.delete(item.id);
                      }}
                      data-testid="agri-locality-listing-row"
                      data-selected={isSelected ? 'true' : undefined}
                      className={cn(
                        'group flex flex-col overflow-hidden cursor-pointer scroll-mt-4 rounded-xl border bg-card',
                        'transition-[box-shadow,transform,border-color] duration-200',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-1',
                        isSelected
                          ? 'border-copper ring-2 ring-copper/[0.18] shadow-lg'
                          : 'border-border shadow-sm hover:shadow-lg hover:-translate-y-0.5',
                      )}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      onClick={() => onSelectListing(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectListing(item.id);
                        }
                      }}
                    >
                      {/* Image-led header — public agri DTO carries no photos, so this is a
                          deterministic field placeholder with the mock's land-size overlay. */}
                      <div className="relative h-32 w-full bg-gradient-to-br from-evergreen-tint via-evergreen-tint/60 to-evergreen/20">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Sprout className="h-10 w-10 text-evergreen/30" aria-hidden="true" />
                        </div>
                        {landArea && (
                          <span
                            data-testid="agri-locality-land-area"
                            className="absolute bottom-2 left-2 inline-flex items-center rounded-md bg-[#14532D]/90 px-2 py-1 font-mono text-xs font-bold text-white"
                          >
                            {landArea}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col flex-1 p-3.5">
                        {/* Price row + category tag (mock parity) */}
                        <div className="flex items-start justify-between gap-2">
                          {isAuthenticated ? (
                            priceLabel ? (
                              <p className="font-mono text-xl font-semibold tracking-tight text-foreground tabular-nums">
                                {priceLabel}
                              </p>
                            ) : (
                              <p className="text-sm text-muted-foreground">Price on request</p>
                            )
                          ) : (
                            <span
                              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                              data-testid="agri-locality-price-signin"
                            >
                              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              Sign in to view price
                            </span>
                          )}
                          {categoryTag && (
                            <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              {categoryTag}
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <p className="mt-1.5 text-[15px] font-bold leading-snug tracking-tight text-foreground">
                          {item.title ?? item.locality ?? item.areaKey ?? item.id}
                        </p>

                        {/* Metadata rows — 2-col grid */}
                        {metaCells.length > 0 && (
                          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                            {metaCells.map((cell) => {
                              const CellIcon = cell.icon;
                              return (
                                <span
                                  key={cell.key}
                                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground min-w-0"
                                >
                                  <CellIcon className="h-3.5 w-3.5 shrink-0 text-evergreen/70" aria-hidden="true" />
                                  <span className="truncate">{cell.label}</span>
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Tags + updated date */}
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          {item.listingPurpose != null && (
                            <span
                              className={cn(
                                'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold',
                                item.listingPurpose === 'rent'
                                  ? 'bg-copper-tint text-copper-hover dark:text-copper'
                                  : 'bg-evergreen-tint text-evergreen',
                              )}
                            >
                              {item.listingPurpose === 'rent' ? 'For Rent' : 'For Sale'}
                            </span>
                          )}
                          {/* Issue #1551 — compact updated date; omitted when absent */}
                          {item.updatedAt && (
                            <span
                              className="text-[11px] text-muted-foreground"
                              data-testid="agri-locality-updated-at"
                            >
                              Updated{' '}
                              {new Date(item.updatedAt).toLocaleDateString('en-IN', {
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          )}
                        </div>

                        {/* View parcel CTA — bottom-anchored (mock parity) */}
                        <div className="mt-auto pt-3">
                          <span
                            aria-hidden="true"
                            className="flex w-full items-center justify-center rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-semibold text-foreground transition-colors group-hover:border-evergreen/50 group-hover:text-evergreen"
                          >
                            View parcel
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </PanelColumn>
    </div>
  );
}
