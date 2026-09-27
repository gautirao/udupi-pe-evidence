// Extracted verbatim from DescribeStep.tsx:900-977 — no gate logic changed.
// Issue #1838 PR D — internal split of DescribeStep into per-domain sections.
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FURNISHING_OPTIONS } from '@/lib/listing-constants';
import type { PropertyType } from '@/lib/listing-constants';
import { SingleChipGroup, FLOORS_CHIP_OPTIONS } from '../../chipGroups';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import type { SharedFieldValues, SharedFieldSetters } from '../../useSharedFields';
import type { FieldSlice } from '../stepContracts';

type FloorsAndFurnishingValueKeys = 'floorNumber' | 'totalFloors' | 'furnishingStatus';

interface FloorsAndFurnishingFieldsProps {
  shared: FieldSlice<SharedFieldValues, SharedFieldSetters, FloorsAndFurnishingValueKeys>;
  propertyType: PropertyType | '';
  isCommercialType: boolean;
  fieldVisible: (key: ListingFieldKey) => boolean;
}

/** Floor Number / Total Floors / Furnishing — shared by commercial and
 * residential (apartment/house/villa, M38-13A #1626). */
export function FloorsAndFurnishingFields({
  shared, propertyType, isCommercialType, fieldVisible,
}: FloorsAndFurnishingFieldsProps) {
  const { floorNumber, totalFloors, furnishingStatus } = shared.values;
  const { setFloorNumber, setTotalFloors, setFurnishingStatus } = shared.setters;

  return (
    <>
      {/* Floor Number — commercial */}
      {fieldVisible('floorNumber') && (
        <div className="space-y-2">
          <Label htmlFor="floorNumber">Floor Number *</Label>
          <Input
            id="floorNumber"
            type="number"
            min="0"
            max="100"
            placeholder="e.g. 2"
            value={floorNumber}
            onChange={(e) => setFloorNumber(e.target.value)}
          />
        </div>
      )}

      {/* Total Floors — commercial_building, apartment (total floors in building):
          plain numeric input (free count, not a small enumerable set).
          House/villa (Number of floors — M38-13A #1626, reuses the same column):
          Ground/G+1/G+2/G+3/G+4+ chip control per design §1. */}
      {fieldVisible('totalFloors') && (propertyType === 'house' || propertyType === 'villa') ? (
        <SingleChipGroup
          id="totalFloors"
          label="Number of floors"
          options={FLOORS_CHIP_OPTIONS}
          value={totalFloors}
          onValueChange={setTotalFloors}
        />
      ) : fieldVisible('totalFloors') ? (
        <div className="space-y-2">
          <Label htmlFor="totalFloors">Total Floors *</Label>
          <Input
            id="totalFloors"
            type="number"
            min="1"
            max="100"
            placeholder="e.g. 5"
            value={totalFloors}
            onChange={(e) => setTotalFloors(e.target.value)}
          />
        </div>
      ) : null}

      {/* Furnishing — shared by commercial AND residential (apartment/house/villa,
          M38-13A #1626). Residential renders it as a segmented control (design §1);
          commercial keeps the existing Select. Bug fix: washrooms/parkingCount below
          are now gated on their OWN fieldVisible() (commercial-only in CONFIG_MAP) —
          previously both were nested under fieldVisible('furnishingStatus'), which
          would have incorrectly shown "Washrooms"/"Parking Spots" plain inputs for
          apartment/house/villa now that furnishingStatus is also residential-shared. */}
      {fieldVisible('furnishingStatus') && (
        isCommercialType ? (
          <div className="space-y-2">
            <Label htmlFor="furnishingStatus">Furnishing Status</Label>
            <Select value={furnishingStatus} onValueChange={setFurnishingStatus}>
              <SelectTrigger id="furnishingStatus">
                <SelectValue placeholder="Select furnishing" />
              </SelectTrigger>
              <SelectContent>
                {FURNISHING_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <SingleChipGroup
            id="furnishingStatus"
            label="Furnishing"
            variant="segmented"
            options={FURNISHING_OPTIONS}
            value={furnishingStatus}
            onValueChange={setFurnishingStatus}
          />
        )
      )}
    </>
  );
}
