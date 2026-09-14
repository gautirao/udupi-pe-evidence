import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
// SUBTYPE_BEARING_PROPERTY_TYPE is deliberately no longer imported here: both handlers now key
// off each subtype's OWN implied type via BUYER_SUBTYPE_TO_PROPERTY_TYPE, so a single hardcoded
// bearing token has no remaining role in this control. The constant still exists for the places
// that legitimately need to know which stored type the subtype axis disambiguates.
import {
  DISCOVER_COMMERCIAL_SUBTYPE_OPTIONS,
  type CommercialSubtype,
} from '@/lib/listing-constants';
import { BUYER_SUBTYPE_TO_PROPERTY_TYPE } from '@/lib/propertyTypeConfig';
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

  const handleTypeChange = (type: PropertyType, checked: boolean) => {
    const newTypes = checked
      ? [...selectedTypes, type]
      : selectedTypes.filter((t) => t !== type);

    // Issue #2431 — leaving a Commercial family CLEARS the subtypes that lived in it. Carrying
    // them would leave an invisible filter applied: the checkboxes that expressed them are no
    // longer on screen, but the query would still narrow by subtype. Clearing here (rather than
    // in a useEffect watching propertyTypes) keeps it one atomic change with one URL write.
    //
    // The relationship is PER SUBTYPE, exactly as `handleSubtypeChange` below now treats it.
    // Keying the clear on the bearing token alone was wrong in BOTH directions once a subtype
    // implies its own type:
    //
    //   - it stranded a subtype without its type. Tick Apartment, tick the WAREHOUSE subtype
    //     (which selects `warehouse` for you), then untick the Warehouse box: the old rule kept
    //     `commercialSubtypes=['WAREHOUSE']` alongside `propertyTypes=['apartment']`. The server
    //     intersects `nonBearing` with `namedBySubtypes`, gets nothing, and emits literal
    //     `AND FALSE` — silent zero results, the very class this file exists to remove.
    //   - it cleared subtypes that never lived in the type being left. Unticking `commercial`
    //     also dropped BUILDING / WAREHOUSE / LAND, losing a selection the buyer never touched.
    //
    // Filtering by each subtype's own implied type fixes both, rather than trading one for the
    // other. A subtype whose implying type is gone is still cleared, so #2431's no-invisible-
    // filter intent is preserved.
    const nextSubtypes = checked
      ? selectedSubtypes
      : selectedSubtypes.filter((s) => BUYER_SUBTYPE_TO_PROPERTY_TYPE[s] !== type);

    onFiltersChange({
      ...filters,
      propertyTypes: newTypes.length > 0 ? newTypes : undefined,
      commercialSubtypes: nextSubtypes.length > 0 ? nextSubtypes : undefined,
    });
  };

  const handleSubtypeChange = (subtype: CommercialSubtype, checked: boolean) => {
    const newSubtypes = checked
      ? [...selectedSubtypes, subtype]
      : selectedSubtypes.filter((s) => s !== subtype);

    // Picking a subtype implies its property type. Without this, a buyer who ticks "Shop" while
    // no type is selected would get zero results — the subtype filter is applied literally by the
    // server, and no apartment or plot has a commercial subtype. Selecting the type for them is
    // what the click plainly means.
    //
    // The implied type is PER SUBTYPE, not a fixed 'commercial'. Only SHOP and OFFICE live in
    // `property_type='commercial'`; BUILDING, WAREHOUSE and LAND are self-describing types
    // (`commercial_building`, `warehouse`, `commercial_land`). Hardcoding the bearing token sent
    // `type=commercial&subtype=WAREHOUSE`, which the server's family/subtype union reads as
    // "property_type IN ('commercial') AND has subtype WAREHOUSE" — a set no row can be in,
    // because warehouse rows are not `property_type='commercial'`. Zero results, HTTP 200, no
    // error. Same for Building and Commercial Land.
    //
    // Mapping through BUYER_SUBTYPE_TO_PROPERTY_TYPE is what puts the request on the canonical
    // #2458 implied-property-type path: it is the TS half of
    // `DiscoverFilterNormalizer.BUYER_SUBTYPE_TO_PROPERTY_TYPE`, held in cross-language parity by
    // contracts/commercial-subtype-mapping.json, so this cannot drift from the server's own
    // `impliedPropertyTypes`.
    //
    // Union rather than replace, so a MIXED selection works: Shop + Warehouse/Godown implies
    // BOTH 'commercial' and 'warehouse', which the server's union then matches on the only axis
    // each can be matched on — the warehouse row by property_type, the shop row by subtype. A fix
    // that merely stopped appending the family token would leave Shop-alone correct and silently
    // break as soon as a bearing and a self-describing subtype were selected together.
    // Issue #2532 — the implied type is RELEASED when nothing implies it any more. Union alone
    // was only half the relationship: a type a subtype selected for the buyer outlived that
    // subtype's removal, so unticking Warehouse/Godown left `warehouse` applied.
    //
    // That orphan WIDENS results rather than emptying them, which is why it reads as a different
    // defect from the stranded-subtype case above:
    //
    //   - map markers — `buildDiscoverSearchParams` emits every selected type, so
    //     `type=commercial,warehouse&subtype=SHOP` keeps matching warehouse rows by property_type;
    //     the buyer unticked Warehouse and still receives warehouses.
    //   - result cards — worse at the time of writing. `useDiscoverMapData`'s
    //     `discoverPropertyType` derivation sends a property type only when EXACTLY ONE is
    //     selected, so a stranded second token drops the type filter ALTOGETHER and a Commercial
    //     selection shows apartments, houses and land. Collapsing back to one token restores it.
    //     Cited by symbol, not by line: #2533/#2559 are reworking that collapse, so this bullet
    //     is CONDITIONAL on it still existing. The fix does not depend on it — releasing an
    //     orphaned implied type is correct either way, and the marker bullet above holds.
    //
    // THE RULE: keep every selected type that NO subtype can imply, plus the implied types of the
    // subtypes that REMAIN. Stated as a recompute rather than a subtraction, which is what makes
    // it safe in both directions:
    //
    //   - `impliedNow` is unioned in unconditionally, so a surviving subtype can never lose the
    //     type that carries it. That is the `AND FALSE` silent-zero class the #2530 hotfix
    //     removed, and a naive "drop the departing subtype's type" subtraction would reintroduce
    //     it the moment SHOP and OFFICE — which share `commercial` — were both selected.
    //   - it is the exact mirror of `handleTypeChange`, which drops the subtypes whose implied
    //     type is leaving. Both handlers now read the same per-subtype relationship from the same
    //     map, from opposite ends; keying either on a fixed bearing token is what let them
    //     disagree before.
    //
    // KNOWN COLLATERAL, accepted deliberately. A type the buyer ticked in the grid that a
    // selected subtype ALSO implies is released with that subtype. State cannot tell the two
    // apart: `PropertyFilters` carries no origin field and the URL contract serialises no origin
    // param, so `['warehouse']` is one value with two possible histories. Separating them needs
    // provenance in state AND in the URL (it must survive reload and back/forward), which belongs
    // to #2458's canonical URL-contract domain, not here. It is visible (the checkbox unticks)
    // and recoverable (re-tick it), and it is pinned by a test so a future provenance change has
    // something to flip.
    const impliedNow = new Set<PropertyType>(
      newSubtypes.map((s) => BUYER_SUBTYPE_TO_PROPERTY_TYPE[s] as PropertyType),
    );
    const everImplied = new Set<string>(Object.values(BUYER_SUBTYPE_TO_PROPERTY_TYPE));
    const nextTypes: PropertyType[] = Array.from(
      new Set<PropertyType>([
        ...selectedTypes.filter((t) => !everImplied.has(t) || impliedNow.has(t)),
        ...impliedNow,
      ]),
    );

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
