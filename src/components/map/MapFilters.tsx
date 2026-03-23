import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PropertyFilters, PropertyType, useLocalities, usePriceRange } from '@/hooks/usePropertyListings';
import { formatPrice } from '@/lib/formatters';
import { CalendarIcon, Filter, MapPin, Search, X, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { SchoolSearchFilter } from '@/components/map/SchoolSearchFilter';
import { SchoolResult } from '@/hooks/useSchoolSearch';

interface MapFiltersProps {
  filters: PropertyFilters;
  onFiltersChange: (filters: PropertyFilters) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedSchool: SchoolResult | null;
  onSchoolSelect: (school: SchoolResult | null) => void;
  schoolBoardFilter: string[];
  onSchoolBoardFilterChange: (boards: string[]) => void;
}

const propertyTypes: { value: PropertyType; label: string }[] = [
  { value: 'land', label: 'Land' },
  { value: 'house', label: 'House' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'commercial_building', label: 'Comm. Building' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'commercial_land', label: 'Comm. Land' },
  { value: 'other', label: 'Other' },
];

export function MapFilters({
  filters,
  onFiltersChange,
  searchQuery,
  onSearchChange,
  selectedSchool,
  onSchoolSelect,
  schoolBoardFilter,
  onSchoolBoardFilterChange,
}: MapFiltersProps) {
  const { data: localities = [] } = useLocalities();
  const { data: priceRange } = usePriceRange();
  const [localityOpen, setLocalityOpen] = useState(false);

  const handlePropertyTypeChange = (type: PropertyType, checked: boolean) => {
    const currentTypes = filters.propertyTypes || [];
    const newTypes = checked
      ? [...currentTypes, type]
      : currentTypes.filter((t) => t !== type);
    onFiltersChange({ ...filters, propertyTypes: newTypes.length > 0 ? newTypes : undefined });
  };

  const handleLocalitySelect = (locality: string) => {
    const currentLocalities = filters.localities || [];
    const newLocalities = currentLocalities.includes(locality)
      ? currentLocalities.filter((l) => l !== locality)
      : [...currentLocalities, locality];
    onFiltersChange({ ...filters, localities: newLocalities.length > 0 ? newLocalities : undefined });
  };

  const handlePriceChange = (values: number[]) => {
    onFiltersChange({
      ...filters,
      priceMin: values[0] > (priceRange?.min || 0) ? values[0] : undefined,
      priceMax: values[1] < (priceRange?.max || 10000000) ? values[1] : undefined,
    });
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  const handleBedroomToggle = (value: number) => {
    const current = filters.bedrooms || [];
    const next = current.includes(value) ? current.filter((b) => b !== value) : [...current, value];
    onFiltersChange({ ...filters, bedrooms: next.length > 0 ? next : undefined });
  };

  const handleSellerTypeToggle = (value: string) => {
    const current = filters.sellerTypes || [];
    // "Broker" toggle controls both 'broker' and 'builder' seller types
    const valuesToToggle = value === 'broker' ? ['broker', 'builder'] : [value];
    const isActive = valuesToToggle.some((v) => current.includes(v));
    const next = isActive
      ? current.filter((s) => !valuesToToggle.includes(s))
      : [...current, ...valuesToToggle];
    onFiltersChange({ ...filters, sellerTypes: next.length > 0 ? next : undefined });
  };

  const handleListingStatusToggle = (key: 'backOnMarket' | 'newToMarket' | 'reraRegistered' | 'readyToMove') => {
    onFiltersChange({ ...filters, [key]: filters[key] ? undefined : true });
  };

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
            <Button variant="ghost" size="sm" onClick={() => { clearFilters(); onSearchChange(''); onSchoolSelect(null); onSchoolBoardFilterChange([]); }} className="h-8 px-2">
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto scrollbar-thin space-y-6">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search listings..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => onSearchChange('')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* School Search */}
        <SchoolSearchFilter
          selectedSchool={selectedSchool}
          onSchoolSelect={onSchoolSelect}
          radiusKm={filters.schoolRadiusKm ?? 2}
          onRadiusChange={(radius) =>
            onFiltersChange({ ...filters, schoolRadiusKm: radius })
          }
          boardFilter={schoolBoardFilter}
          onBoardFilterChange={onSchoolBoardFilterChange}
        />

        {/* Property Type */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Property Type</Label>
          <div className="grid grid-cols-2 gap-2">
            {propertyTypes.map((type) => (
              <div key={type.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`type-${type.value}`}
                  checked={filters.propertyTypes?.includes(type.value) || false}
                  onCheckedChange={(checked) =>
                    handlePropertyTypeChange(type.value, checked as boolean)
                  }
                />
                <Label
                  htmlFor={`type-${type.value}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {type.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Bedrooms (BHK) */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Bedrooms (BHK)</Label>
          <div className="flex gap-2 flex-wrap">
            {[{ label: '1', value: 1 }, { label: '2', value: 2 }, { label: '3', value: 3 }, { label: '4+', value: 4 }].map(({ label, value }) => {
              const active = filters.bedrooms?.includes(value) || false;
              return (
                <Button
                  key={value}
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 px-3 text-sm"
                  onClick={() => handleBedroomToggle(value)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Listed By */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Listed By</Label>
          <div className="flex gap-2 flex-wrap">
            {[{ label: 'Owner', value: 'owner' }, { label: 'Broker', value: 'broker' }].map(({ label, value }) => {
              const active = value === 'broker'
                ? (filters.sellerTypes?.includes('broker') || filters.sellerTypes?.includes('dealer') || false)
                : (filters.sellerTypes?.includes(value) || false);
              return (
                <Button
                  key={value}
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 px-3 text-sm"
                  aria-pressed={active}
                  onClick={() => handleSellerTypeToggle(value)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Locality */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Locality</Label>
          <Popover open={localityOpen} onOpenChange={setLocalityOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between h-9 text-sm"
              >
                <span className="truncate">
                  {filters.localities && filters.localities.length > 0
                    ? `${filters.localities.length} selected`
                    : 'Select localities'}
                </span>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[250px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search localities..." className="h-9" />
                <CommandList>
                  <CommandEmpty>No locality found.</CommandEmpty>
                  <CommandGroup>
                    {localities.map((locality) => (
                      <CommandItem
                        key={locality}
                        value={locality}
                        onSelect={() => handleLocalitySelect(locality)}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={filters.localities?.includes(locality) || false}
                            className="pointer-events-none"
                          />
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate">{locality}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {filters.localities && filters.localities.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {filters.localities.map((locality) => (
                <Badge
                  key={locality}
                  variant="secondary"
                  className="text-xs cursor-pointer"
                  onClick={() => handleLocalitySelect(locality)}
                >
                  {locality}
                  <X className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Price Range */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Price Range</Label>
          {priceRange && (
            <>
              <Slider
                min={priceRange.min}
                max={priceRange.max}
                step={Math.max(1, Math.floor((priceRange.max - priceRange.min) / 100))}
                value={[filters.priceMin ?? priceRange.min, filters.priceMax ?? priceRange.max]}
                onValueChange={handlePriceChange}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatPrice(filters.priceMin ?? priceRange.min)}</span>
                <span>{formatPrice(filters.priceMax ?? priceRange.max)}</span>
              </div>
            </>
          )}
        </div>

        {/* Listing Status */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Listing Status</Label>
          <div className="flex gap-2 flex-wrap">
            {([
              { key: 'newToMarket' as const, label: 'New to Market' },
              { key: 'backOnMarket' as const, label: 'Back on Market' },
              { key: 'reraRegistered' as const, label: 'RERA Registered' },
              { key: 'readyToMove' as const, label: 'Ready to Move' },
            ]).map(({ key, label }) => {
              const active = !!filters[key];
              return (
                <Button
                  key={key}
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 px-3 text-sm"
                  aria-pressed={active}
                  onClick={() => handleListingStatusToggle(key)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Date Range */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Date Posted</Label>
          <div className="grid grid-cols-2 gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'h-9 text-xs justify-start text-left font-normal',
                    !filters.dateFrom && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {filters.dateFrom ? format(filters.dateFrom, 'MMM d') : 'From'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.dateFrom}
                  onSelect={(date) => onFiltersChange({ ...filters, dateFrom: date })}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'h-9 text-xs justify-start text-left font-normal',
                    !filters.dateTo && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {filters.dateTo ? format(filters.dateTo, 'MMM d') : 'To'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.dateTo}
                  onSelect={(date) => onFiltersChange({ ...filters, dateTo: date })}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}