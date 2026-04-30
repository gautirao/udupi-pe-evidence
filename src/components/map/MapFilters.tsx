import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PropertyFilters, PropertyListing, LocalityOption, useLocalities } from '@/hooks/usePropertyListings';
import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { computeNearbyLocalities } from '@/lib/localityUtils';
import { formatPrice } from '@/lib/formatters';
import { Filter, Search, TrendingUp, X } from 'lucide-react';
import { SchoolSearchFilter } from '@/components/map/SchoolSearchFilter';
import { SchoolResult } from '@/hooks/useSchoolSearch';
import { PropertyTypeFilter } from './filters/PropertyTypeFilter';
import { BedroomFilter } from './filters/BedroomFilter';
import { SellerTypeFilter } from './filters/SellerTypeFilter';
import { LocalityFilter } from './filters/LocalityFilter';
import { PriceRangeFilter } from './filters/PriceRangeFilter';
import { ListingStatusFilter } from './filters/ListingStatusFilter';
import { DateRangeFilter } from './filters/DateRangeFilter';

interface MapFiltersProps {
  filters: PropertyFilters;
  onFiltersChange: (filters: PropertyFilters) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedSchool: SchoolResult | null;
  onSchoolSelect: (school: SchoolResult | null) => void;
  schoolBoardFilter: string[];
  onSchoolBoardFilterChange: (boards: string[]) => void;
  city: string;
  allListings: PropertyListing[];
  /** areaKey values for selected localities. Controls "View Trends" button visibility. */
  trendsAreaKeys?: string[];
}

export function MapFilters({
  filters,
  onFiltersChange,
  searchQuery,
  onSearchChange,
  selectedSchool,
  onSchoolSelect,
  schoolBoardFilter,
  onSchoolBoardFilterChange,
  city,
  allListings,
  trendsAreaKeys = [],
}: MapFiltersProps) {
  const navigate = useNavigate();
  const { data: localityOptions = [] as LocalityOption[] } = useLocalities(city);
  const { data: trendsOpts } = useTrendsOptions(city, true, 50);

  const localityToAreaKey = useMemo(() => {
    const m = new Map<string, string>();
    trendsOpts?.defaultAreas.forEach((a) => m.set(a.areaLabel, a.areaKey));
    localityOptions.forEach((o) => { if (o.areaKey && !m.has(o.locality)) m.set(o.locality, o.areaKey); });
    return m;
  }, [trendsOpts, localityOptions]);

  const localityNames = useMemo(() => localityOptions.map((o) => o.locality), [localityOptions]);

  const selectedAreaKeys = useMemo(
    () => (filters.localities ?? []).flatMap((loc) => { const k = localityToAreaKey.get(loc); return k ? [k] : []; }),
    [filters.localities, localityToAreaKey],
  );

  const nearbyLocalities = useMemo(() => {
    if (!filters.localities || filters.localities.length === 0) return [];
    const lastSelected = filters.localities[filters.localities.length - 1];
    const nearby = computeNearbyLocalities(allListings, lastSelected, 30).filter(
      (loc) => !filters.localities?.includes(loc),
    );
    if (nearby.length > 0) return nearby;
    return localityNames.filter((loc) => !filters.localities?.includes(loc)).slice(0, 5);
  }, [filters.localities, allListings, localityNames]);

  // 16-condition predicate — kept centralized so the polygon check is never silently lost.
  const hasActiveFilters =
    !!searchQuery ||
    (filters.propertyTypes && filters.propertyTypes.length > 0) ||
    (filters.localities && filters.localities.length > 0) ||
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

  (filters.localities ?? []).forEach((loc) => {
    chips.push({
      key: `loc-${loc}`,
      label: loc,
      onRemove: () => onFiltersChange({ ...filters, localities: filters.localities!.filter((l) => l !== loc) }),
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

  if (searchQuery) chips.push({ key: 'search', label: `"${searchQuery}"`, onRemove: () => onSearchChange('') });

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
          </CardTitle>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={() => { onFiltersChange({}); onSearchChange(''); onSchoolSelect(null); onSchoolBoardFilterChange([]); }} className="h-8 px-2">
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>
        {(selectedAreaKeys.length > 0 || trendsAreaKeys.length > 0) && (
          <Button size="sm" className="w-full mt-2 gap-1.5 text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => {
              const keysToUse = selectedAreaKeys.length > 0 ? selectedAreaKeys : trendsAreaKeys;
              const params = new URLSearchParams({ city });
              keysToUse.slice(0, 3).forEach((k) => params.append('areaKey', k));
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

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search listings..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} className="pl-8 h-9 text-sm" />
          {searchQuery && (
            <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6" onClick={() => onSearchChange('')}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <SchoolSearchFilter
          selectedSchool={selectedSchool}
          onSchoolSelect={onSchoolSelect}
          radiusKm={filters.schoolRadiusKm ?? 2}
          onRadiusChange={(radius) => onFiltersChange({ ...filters, schoolRadiusKm: radius })}
          boardFilter={schoolBoardFilter}
          onBoardFilterChange={onSchoolBoardFilterChange}
        />

        <PropertyTypeFilter filters={filters} onFiltersChange={onFiltersChange} />
        <BedroomFilter filters={filters} onFiltersChange={onFiltersChange} />
        <SellerTypeFilter filters={filters} onFiltersChange={onFiltersChange} />
        <LocalityFilter filters={filters} onFiltersChange={onFiltersChange} localityOptions={localityOptions} nearbyLocalities={nearbyLocalities} />
        <PriceRangeFilter filters={filters} onFiltersChange={onFiltersChange} />
        <ListingStatusFilter filters={filters} onFiltersChange={onFiltersChange} />
        <DateRangeFilter filters={filters} onFiltersChange={onFiltersChange} />
      </CardContent>
    </Card>
  );
}
