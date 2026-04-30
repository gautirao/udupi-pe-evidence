import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PropertyFilters, PropertyListing, LocalityOption, useLocalities } from '@/hooks/usePropertyListings';
import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { computeNearbyLocalities, CITY_CONFIG } from '@/lib/localityUtils';
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

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
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
