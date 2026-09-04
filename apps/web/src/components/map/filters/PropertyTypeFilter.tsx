import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  DISCOVER_COMMERCIAL_SUBTYPE_OPTIONS,
  SUBTYPE_BEARING_PROPERTY_TYPE,
  type CommercialSubtype,
} from '@/lib/listing-constants';
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
  const selectedTypes = filters.propertyTypes ?? [];
  const selectedSubtypes = filters.commercialSubtypes ?? [];
  const commercialSelected = selectedTypes.includes(SUBTYPE_BEARING_PROPERTY_TYPE);

  const handleTypeChange = (type: PropertyType, checked: boolean) => {
    const newTypes = checked
      ? [...selectedTypes, type]
      : selectedTypes.filter((t) => t !== type);

    // Issue #2431 — leaving the generic Commercial family CLEARS any Shop/Office selection.
    // Carrying it would leave an invisible filter applied: the checkboxes that expressed it are
    // no longer on screen, but the query would still narrow to a subtype, so the buyer would see
    // fewer results than the visible controls account for. Clearing here (rather than in a
    // useEffect watching propertyTypes) keeps it a single atomic change with one URL write.
    const keepSubtypes = type === SUBTYPE_BEARING_PROPERTY_TYPE && !checked ? false : true;

    onFiltersChange({
      ...filters,
      propertyTypes: newTypes.length > 0 ? newTypes : undefined,
      commercialSubtypes: keepSubtypes && selectedSubtypes.length > 0 ? selectedSubtypes : undefined,
    });
  };

  const handleSubtypeChange = (subtype: CommercialSubtype, checked: boolean) => {
    const newSubtypes = checked
      ? [...selectedSubtypes, subtype]
      : selectedSubtypes.filter((s) => s !== subtype);

    // Picking a subtype implies the Commercial family. Without this, a buyer who ticks "Shop"
    // while Commercial is unticked would get zero results — the subtype filter is applied
    // literally by the server, and no apartment or plot has a commercial subtype. Selecting the
    // family for them is what the click plainly means.
    const nextTypes: PropertyType[] =
      newSubtypes.length > 0 && !commercialSelected
        ? [...selectedTypes, SUBTYPE_BEARING_PROPERTY_TYPE]
        : selectedTypes;

    onFiltersChange({
      ...filters,
      propertyTypes: nextTypes.length > 0 ? nextTypes : undefined,
      commercialSubtypes: newSubtypes.length > 0 ? newSubtypes : undefined,
    });
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Property Type</Label>
      <div className="grid grid-cols-2 gap-2">
        {propertyTypes.map((type) => (
          <div key={type.value} className="flex items-center space-x-2">
            <Checkbox
              id={`type-${type.value}`}
              checked={selectedTypes.includes(type.value)}
              onCheckedChange={(checked) => handleTypeChange(type.value, checked as boolean)}
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

      {/*
        Issue #2431 — Shop/Office refinement, nested under the Commercial family it refines.
        Rendered unconditionally rather than only when Commercial is ticked: a buyer restoring a
        `?type=commercial&subtype=SHOP` link must SEE which subtype is active, and hiding the
        control behind a parent checkbox is also how a selection becomes invisible-but-applied.
        The indent and the caption carry the parent/child relationship instead.

        No new visual variants — the same Checkbox and Label primitives, the same text sizes and
        the same spacing scale as the type grid above.
      */}
      <div className="space-y-2 border-l-2 border-border pl-3 ml-1">
        <Label className="text-xs font-medium text-muted-foreground">
          Commercial type
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {DISCOVER_COMMERCIAL_SUBTYPE_OPTIONS.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <Checkbox
                id={`subtype-${option.value}`}
                checked={selectedSubtypes.includes(option.value)}
                onCheckedChange={(checked) =>
                  handleSubtypeChange(option.value, checked as boolean)
                }
              />
              <Label
                htmlFor={`subtype-${option.value}`}
                className="text-sm font-normal cursor-pointer"
              >
                {option.label}
              </Label>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Older commercial listings may not say whether they are a shop or an office. Those are
          hidden while a commercial type is selected.
        </p>
      </div>
    </div>
  );
}
