import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { formatPrice } from '@/lib/formatters';
import { Filter, Loader2, TrendingUp, X } from 'lucide-react';
import { SchoolResult } from '@/hooks/useSchoolSearch';
import { PropertyTypeFilter } from './filters/PropertyTypeFilter';
import { BedroomFilter } from './filters/BedroomFilter';
import { SellerTypeFilter } from './filters/SellerTypeFilter';
import { PriceRangeFilter } from './filters/PriceRangeFilter';
import { ListingStatusFilter } from './filters/ListingStatusFilter';
import { DateRangeFilter } from './filters/DateRangeFilter';

interface MapFiltersProps {
  filters: PropertyFilters;
  onFiltersChange: (filters: PropertyFilters) => void;
  selectedSchool: SchoolResult | null;
  onSchoolSelect: (school: SchoolResult | null) => void;
  schoolBoardFilter: string[];
  onSchoolBoardFilterChange: (boards: string[]) => void;
  city: string;
  /** areaKey values for the selected area. Controls "View Trends" button visibility. */
  trendsAreaKeys?: string[];
  /** True while a filter-change refetch is in-flight. Shows a loading indicator near the header. */
  isFetching?: boolean;
}

export function MapFilters({
  filters,
  onFiltersChange,
  selectedSchool,
  onSchoolSelect,
  schoolBoardFilter,
  onSchoolBoardFilterChange,
  city,
  trendsAreaKeys = [],
  isFetching = false,
}: MapFiltersProps) {
  const navigate = useNavigate();

  // 14-condition predicate — kept centralized so the polygon check is never silently lost.
  const hasActiveFilters =
    (filters.propertyTypes && filters.propertyTypes.length > 0) ||
    (filters.bedrooms && filters.bedrooms.length > 0) ||
    (filters.sellerTypes && filters.sellerTypes.length > 0) ||
    filters.priceMin !== undefined ||
    filters.priceMax !== undefined ||
    filters.dateFrom !== undefined ||
    filters.dateTo !== undefined ||
    !!filters.backOnMarket ||
    !!filters.newToMarket ||
    !!filters.reraRegistered ||
    !!filters.readyToMove ||
    (filters.polygon && filters.polygon.length > 0) ||
    filters.schoolLat !== undefined;

  const chips: { key: string; label: string; onRemove: () => void }[] = [];

  (filters.propertyTypes ?? []).forEach((type) => {
    chips.push({
      key: `pt-${type}`,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      onRemove: () => onFiltersChange({ ...filters, propertyTypes: filters.propertyTypes!.filter((t) => t !== type) }),
    });
  });

  (filters.bedrooms ?? []).forEach((b) => {
    chips.push({
      key: `bed-${b}`,
      label: b === 4 ? '4+ BHK' : `${b} BHK`,
      onRemove: () => onFiltersChange({ ...filters, bedrooms: filters.bedrooms!.filter((v) => v !== b) }),
    });
  });

  (filters.sellerTypes ?? []).forEach((s) => {
    chips.push({
      key: `st-${s}`,
      label: s.charAt(0).toUpperCase() + s.slice(1),
      onRemove: () => onFiltersChange({ ...filters, sellerTypes: filters.sellerTypes!.filter((v) => v !== s) }),
    });
  });

  if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
    const min = filters.priceMin !== undefined ? formatPrice(filters.priceMin) : null;
    const max = filters.priceMax !== undefined ? formatPrice(filters.priceMax) : null;
    const label = min && max ? `${min} – ${max}` : min ? `${min}+` : `Up to ${max!}`;
    chips.push({ key: 'price', label, onRemove: () => onFiltersChange({ ...filters, priceMin: undefined, priceMax: undefined }) });
  }

  if (filters.dateFrom !== undefined || filters.dateTo !== undefined) {
    const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
    const from = filters.dateFrom ? fmt(filters.dateFrom) : null;
    const to = filters.dateTo ? fmt(filters.dateTo) : null;
    const label = from && to ? `${from} – ${to}` : from ? `From ${from}` : `Until ${to!}`;
    chips.push({ key: 'date', label, onRemove: () => onFiltersChange({ ...filters, dateFrom: undefined, dateTo: undefined }) });
  }

  if (filters.backOnMarket) chips.push({ key: 'bom', label: 'Back on Market', onRemove: () => onFiltersChange({ ...filters, backOnMarket: undefined }) });
  if (filters.newToMarket) chips.push({ key: 'ntm', label: 'New to Market', onRemove: () => onFiltersChange({ ...filters, newToMarket: undefined }) });
  if (filters.reraRegistered) chips.push({ key: 'rera', label: 'RERA Registered', onRemove: () => onFiltersChange({ ...filters, reraRegistered: undefined }) });
  if (filters.readyToMove) chips.push({ key: 'rtm', label: 'Ready to Move', onRemove: () => onFiltersChange({ ...filters, readyToMove: undefined }) });

  if (filters.schoolLat !== undefined) {
    chips.push({
      key: 'school',
      label: 'Near school',
      onRemove: () => {
        onSchoolSelect(null);
        onFiltersChange({ ...filters, schoolLat: undefined, schoolLon: undefined, schoolRadiusKm: undefined });
      },
    });
  }

  if (filters.polygon && filters.polygon.length > 0) {
    chips.push({ key: 'polygon', label: 'Polygon', onRemove: () => onFiltersChange({ ...filters, polygon: [] }) });
  }

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
            {chips.length > 0 && (
              <span data-testid="filter-count-badge" className="rounded-full bg-primary text-primary-foreground text-[10px] font-semibold px-1.5 py-0.5 leading-none">
                {chips.length}
              </span>
            )}
            {isFetching && (
              <Loader2
                data-testid="filter-fetching-indicator"
                className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                aria-label="Loading results"
              />
            )}
          </CardTitle>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={() => { onFiltersChange({}); onSchoolSelect(null); onSchoolBoardFilterChange([]); }} className="h-8 px-2">
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>
        {trendsAreaKeys.length > 0 && (
          <Button size="sm" className="w-full mt-2 gap-1.5 text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => {
              const params = new URLSearchParams({ city });
              trendsAreaKeys.slice(0, 3).forEach((k) => params.append('areaKey', k));
              navigate(`/trends?${params.toString()}`);
            }}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            View Trends
          </Button>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto scrollbar-thin space-y-6">
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="rounded-full hover:bg-primary/20 flex items-center"
                  aria-label={`Remove ${chip.label} filter`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <PropertyTypeFilter filters={filters} onFiltersChange={onFiltersChange} />
        <BedroomFilter filters={filters} onFiltersChange={onFiltersChange} />
        <SellerTypeFilter filters={filters} onFiltersChange={onFiltersChange} />
        <PriceRangeFilter filters={filters} onFiltersChange={onFiltersChange} />
        <ListingStatusFilter filters={filters} onFiltersChange={onFiltersChange} />
        <DateRangeFilter filters={filters} onFiltersChange={onFiltersChange} />
      </CardContent>
    </Card>
  );
}
