import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { PropertyFilters, PropertyType } from '@/hooks/usePropertyListings';

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

interface PropertyTypeFilterProps {
  filters: PropertyFilters;
  onFiltersChange: (filters: PropertyFilters) => void;
}

export function PropertyTypeFilter({ filters, onFiltersChange }: PropertyTypeFilterProps) {
  const handleChange = (type: PropertyType, checked: boolean) => {
    const currentTypes = filters.propertyTypes || [];
    const newTypes = checked
      ? [...currentTypes, type]
      : currentTypes.filter((t) => t !== type);
    onFiltersChange({ ...filters, propertyTypes: newTypes.length > 0 ? newTypes : undefined });
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Property Type</Label>
      <div className="grid grid-cols-2 gap-2">
        {propertyTypes.map((type) => (
          <div key={type.value} className="flex items-center space-x-2">
            <Checkbox
              id={`type-${type.value}`}
              checked={filters.propertyTypes?.includes(type.value) || false}
              onCheckedChange={(checked) => handleChange(type.value, checked as boolean)}
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
  );
}
