import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { PropertyFilters, LocalityOption } from '@/hooks/usePropertyListings';
import { isAtCap, toggleLocality } from '@/lib/localityUtils';
import { ChevronDown, MapPin, X } from 'lucide-react';

interface LocalityFilterProps {
  filters: PropertyFilters;
  onFiltersChange: (filters: PropertyFilters) => void;
  localityOptions: LocalityOption[];
  nearbyLocalities: string[];
}

export function LocalityFilter({
  filters,
  onFiltersChange,
  localityOptions,
  nearbyLocalities,
}: LocalityFilterProps) {
  const [localityOpen, setLocalityOpen] = useState(false);

  const handleSelect = (locality: string) => {
    const result = toggleLocality(filters.localities, locality);
    if (result === null) return; // at cap, toast already shown
    onFiltersChange({ ...filters, localities: result });
  };

  return (
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
                {localityOptions.map(({ locality }) => (
                  <CommandItem
                    key={locality}
                    value={locality}
                    disabled={isAtCap(filters.localities) && !filters.localities?.includes(locality)}
                    onSelect={() => handleSelect(locality)}
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
              className="text-xs cursor-pointer bg-blue-100 text-blue-700 hover:bg-blue-200 border-0"
              onClick={() => handleSelect(locality)}
            >
              {locality}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
        </div>
      )}

      {filters.localities && filters.localities.length > 0 && nearbyLocalities.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground mb-1">Suggested areas</p>
          <div className="flex flex-wrap gap-1">
            {nearbyLocalities.map((loc) => (
              <Button
                key={loc}
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                disabled={isAtCap(filters.localities)}
                onClick={() => handleSelect(loc)}
              >
                {loc}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
