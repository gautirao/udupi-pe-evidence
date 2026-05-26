import React, { useMemo } from 'react';
import { Building2, GraduationCap, Home, IndianRupee, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatters';
import type { DiscoverUrlFilters } from '@/hooks/useDiscoverUrlState';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartment',
  villa: 'Villa',
  land: 'Plot / Land',
  commercial: 'Commercial',
  house: 'House',
  plot: 'Plot / Land',
};

const SELLER_LABELS: Record<string, string> = {
  owner: 'Owner',
  broker: 'Broker',
  builder: 'Builder',
};

/** Ordered list of boolean filter keys rendered as chips (render order = declaration order). */
const BOOLEAN_FILTER_LABELS: ReadonlyArray<{
  key: keyof Pick<DiscoverUrlFilters, 'backOnMarket' | 'newToMarket' | 'reraRegistered' | 'readyToMove'>;
  label: string;
  testId: string;
}> = [
  { key: 'backOnMarket', label: 'Back on Market', testId: 'chip-bool-bom' },
  { key: 'newToMarket', label: 'New to Market', testId: 'chip-bool-ntm' },
  { key: 'reraRegistered', label: 'RERA Registered', testId: 'chip-bool-rera' },
  { key: 'readyToMove', label: 'Ready to Move', testId: 'chip-bool-rtm' },
];

/** Mirror of MapFilters.tsx date formatter — co-located here, do NOT import from map/. */
function formatFilterDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

function humanizePropertyType(raw: string): string {
  return PROPERTY_TYPE_LABELS[raw.toLowerCase()] ?? raw;
}

interface ActiveContextChipsCallbacks {
  onClearArea: () => void;
  onClearSchool: () => void;
  onClearPropertyType: () => void;
  onClearBhk: () => void;
  onClearPrice: () => void;
  onClearBoard?: (board: string) => void;
  onClearCategory?: (category: string) => void;
  /** Clear the seller type filter entirely (all values). */
  onClearSeller?: () => void;
  /** Clear both dateFrom and dateTo atomically. */
  onClearDateRange?: () => void;
  /** Clear a single boolean filter by its DiscoverUrlFilters key. */
  onClearBoolean?: (key: keyof Pick<DiscoverUrlFilters, 'backOnMarket' | 'newToMarket' | 'reraRegistered' | 'readyToMove'>) => void;
}

interface ActiveContextChipsProps extends ActiveContextChipsCallbacks {
  selectedArea?: AreaPoint | null;
  selectedSchool?: SchoolResult | null;
  radiusKm?: number | null;
  filters: DiscoverUrlFilters;
  /**
   * Free-text search query (the `q` URL-state field; NOT part of DiscoverUrlFilters).
   * Optional so existing callers/tests need no change. The Search chip renders ONLY
   * when this is non-empty (after trim) AND a valid result context exists (area or school).
   */
  searchQuery?: string;
  /** Clear the free-text search query (clears only `q`, never sibling filters). */
  onClearSearch?: () => void;
}

interface ChipProps {
  icon: React.ReactNode;
  label: string;
  onClear: () => void;
  testId?: string;
  dismissTestId?: string;
}

function Chip({ icon, label, onClear, testId, dismissTestId }: ChipProps) {
  return (
    <div
      role="group"
      aria-label={`Active filter: ${label}`}
      className={cn(
        'inline-flex items-center gap-1 bg-secondary text-secondary-foreground',
        'rounded-full px-2.5 py-1 text-xs font-medium',
      )}
      data-testid={testId}
    >
      {icon}
      <span className="max-w-[120px] truncate">{label}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-3.5 w-3.5 p-0 ml-0.5 hover:bg-transparent hover:text-foreground text-muted-foreground flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        aria-label={`Clear ${label}`}
        data-testid={dismissTestId}
      >
        <X className="h-2.5 w-2.5" />
      </Button>
    </div>
  );
}

/**
 * Horizontal row of dismissable context chips.
 * Each chip appears only when its corresponding filter dimension is active.
 * Returns null when no chips are active (renders nothing).
 */
export function ActiveContextChips({
  selectedArea,
  selectedSchool,
  radiusKm,
  filters,
  searchQuery,
  onClearSearch,
  onClearArea,
  onClearSchool,
  onClearPropertyType,
  onClearBhk,
  onClearPrice,
  onClearBoard,
  onClearCategory,
  onClearSeller,
  onClearDateRange,
  onClearBoolean,
}: ActiveContextChipsProps) {
  const hasArea = selectedArea != null;
  const hasSchool = selectedSchool != null;
  // Context-gated search: trim BEFORE the gate so whitespace-only q never renders a
  // chip. The (hasArea || hasSchool) gate is the lynchpin — `q` at top-level/city/group
  // (no valid result context) must NOT show a chip even when present in the URL.
  const searchTerm = searchQuery?.trim() ?? '';
  const hasSearch = searchTerm !== '' && (hasArea || hasSchool);
  const boardFilters = filters.boardFilters ?? [];
  const categoryFilters = filters.categoryFilters ?? [];
  const hasType =
    filters.propertyTypes != null && filters.propertyTypes.length > 0;
  const hasBhk =
    filters.bedrooms != null && filters.bedrooms.length > 0;
  const hasPrice =
    filters.priceMin != null || filters.priceMax != null;

  // ── Seller ───────────────────────────────────────────────────────────────
  const sellerLabel = useMemo(() => {
    const types = (filters.sellerTypes ?? []).filter((s) => s.trim() !== '');
    if (types.length === 0) return null;
    const first = SELLER_LABELS[types[0].toLowerCase()] ?? types[0];
    return types.length > 1 ? `${first} +${types.length - 1}` : first;
  }, [filters.sellerTypes]);

  // ── Date range ───────────────────────────────────────────────────────────
  const dateLabel = useMemo(() => {
    const { dateFrom, dateTo } = filters;
    if (!dateFrom && !dateTo) return null;
    if (dateFrom && dateTo) {
      return `${formatFilterDate(dateFrom)} – ${formatFilterDate(dateTo)}`;
    }
    if (dateFrom) return `From ${formatFilterDate(dateFrom)}`;
    return `Until ${formatFilterDate(dateTo!)}`;
  }, [filters.dateFrom, filters.dateTo]);

  // ── Active booleans (ordered: bom → ntm → rera → rtm) ───────────────────
  const activeBooleans = useMemo(() => {
    return BOOLEAN_FILTER_LABELS.filter(({ key }) => !!filters[key]);
  }, [filters.backOnMarket, filters.newToMarket, filters.reraRegistered, filters.readyToMove]);

  const hasSeller = sellerLabel != null;
  const hasDate = dateLabel != null;
  const hasBooleans = activeBooleans.length > 0;

  if (
    !hasSearch &&
    !hasArea &&
    !hasSchool &&
    !hasType &&
    !hasBhk &&
    !hasPrice &&
    !hasSeller &&
    !hasDate &&
    !hasBooleans &&
    boardFilters.length === 0 &&
    categoryFilters.length === 0
  ) {
    return null;
  }

  // ── Property type label ──────────────────────────────────────────────────
  let typeLabel = '';
  if (hasType) {
    const types = filters.propertyTypes!;
    const firstLabel = humanizePropertyType(types[0]);
    const extra = types.length - 1;
    typeLabel = extra > 0 ? `${firstLabel} +${extra}` : firstLabel;
  }

  // ── BHK label ────────────────────────────────────────────────────────────
  let bhkLabel = '';
  if (hasBhk) {
    const beds = filters.bedrooms!;
    const sorted = [...beds].sort((a, b) => a - b);
    if (sorted.length === 1) {
      bhkLabel = `${sorted[0]} BHK`;
    } else if (sorted.length === 2) {
      bhkLabel = `${sorted[0]}, ${sorted[1]} BHK`;
    } else {
      bhkLabel = `${sorted[0]}, ${sorted[1]} BHK +${sorted.length - 2}`;
    }
  }

  // ── Price label ──────────────────────────────────────────────────────────
  let priceLabel = '';
  if (hasPrice) {
    const { priceMin, priceMax } = filters;
    if (priceMin != null && priceMax != null) {
      priceLabel = `${formatPrice(priceMin)} – ${formatPrice(priceMax)}`;
    } else if (priceMin != null) {
      priceLabel = `${formatPrice(priceMin)}+`;
    } else if (priceMax != null) {
      priceLabel = `Up to ${formatPrice(priceMax)}`;
    }
  }

  // ── School label ─────────────────────────────────────────────────────────
  let schoolLabel = '';
  if (hasSchool) {
    const r = radiusKm ?? 2;
    schoolLabel = `${selectedSchool!.name} (${r} km)`;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      data-testid="active-context-chips"
    >
      {hasSearch && (
        <Chip
          icon={<Search className="h-3 w-3 flex-shrink-0" />}
          label={searchTerm}
          onClear={() => onClearSearch?.()}
          testId="chip-search"
          dismissTestId="chip-search-dismiss"
        />
      )}
      {hasArea && (
        <Chip
          icon={<Building2 className="h-3 w-3 flex-shrink-0" />}
          label={selectedArea!.areaLabel}
          onClear={onClearArea}
          testId="chip-area"
        />
      )}
      {hasSchool && (
        <Chip
          icon={<GraduationCap className="h-3 w-3 flex-shrink-0" />}
          label={schoolLabel}
          onClear={onClearSchool}
          testId="chip-school"
        />
      )}
      {hasType && (
        <Chip
          icon={<Home className="h-3 w-3 flex-shrink-0" />}
          label={typeLabel}
          onClear={onClearPropertyType}
          testId="chip-type"
        />
      )}
      {hasBhk && (
        <Chip
          icon={<span className="text-[10px] font-bold leading-none">BHK</span>}
          label={bhkLabel}
          onClear={onClearBhk}
          testId="chip-bhk"
        />
      )}
      {hasPrice && (
        <Chip
          icon={<IndianRupee className="h-3 w-3 flex-shrink-0" />}
          label={priceLabel}
          onClear={onClearPrice}
          testId="chip-price"
        />
      )}
      {boardFilters.map((board) => {
        const key = board.toLowerCase();
        return (
          <Chip
            key={`board-${key}`}
            icon={<GraduationCap className="h-3 w-3 flex-shrink-0" />}
            label={board}
            onClear={() => onClearBoard?.(board)}
            testId={`active-chip-board-${key}`}
            dismissTestId={`active-chip-board-${key}-dismiss`}
          />
        );
      })}
      {categoryFilters.map((category) => {
        const key = category.toLowerCase();
        return (
          <Chip
            key={`category-${key}`}
            icon={<GraduationCap className="h-3 w-3 flex-shrink-0" />}
            label={category}
            onClear={() => onClearCategory?.(category)}
            testId={`active-chip-category-${key}`}
            dismissTestId={`active-chip-category-${key}-dismiss`}
          />
        );
      })}
      {hasSeller && (
        <Chip
          icon={<span className="text-[10px] font-bold leading-none">BY</span>}
          label={sellerLabel!}
          onClear={() => onClearSeller?.()}
          testId="chip-seller"
          dismissTestId="chip-seller-dismiss"
        />
      )}
      {hasDate && (
        <Chip
          icon={<span className="text-[10px] font-bold leading-none">📅</span>}
          label={dateLabel!}
          onClear={() => onClearDateRange?.()}
          testId="chip-date"
          dismissTestId="chip-date-dismiss"
        />
      )}
      {activeBooleans.map(({ key, label, testId }) => (
        <Chip
          key={key}
          icon={<span className="text-[10px] font-bold leading-none">✓</span>}
          label={label}
          onClear={() => onClearBoolean?.(key)}
          testId={testId}
          dismissTestId={`${testId}-dismiss`}
        />
      ))}
    </div>
  );
}
