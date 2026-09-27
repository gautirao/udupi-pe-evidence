// Extracted verbatim from DescribeStep.tsx:979-1047 — no gate logic changed.
// Issue #1838 PR D — internal split of DescribeStep into per-domain sections.
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import type { CommercialFieldValues, CommercialFieldSetters } from '../../useCommercialFields';
import type { FieldSlice } from '../stepContracts';

type CommercialBasicsValueKeys =
  'washrooms' | 'parkingCount' | 'roadFrontageFt' | 'commercialUsage' | 'numberOfUnits';

interface CommercialBasicsSectionProps {
  commercial: FieldSlice<CommercialFieldValues, CommercialFieldSetters, CommercialBasicsValueKeys>;
  fieldVisible: (key: ListingFieldKey) => boolean;
}

/** Washrooms/parking counts + road frontage / usage / number-of-units. */
export function CommercialBasicsSection({ commercial, fieldVisible }: CommercialBasicsSectionProps) {
  const {
    washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits,
  } = commercial.values;
  const {
    setWashrooms, setParkingCount, setRoadFrontageFt, setCommercialUsage, setNumberOfUnits,
  } = commercial.setters;

  return (
    <>
      {(fieldVisible('washrooms') || fieldVisible('parkingCount')) && (
        <div className="grid grid-cols-2 gap-4">
          {fieldVisible('washrooms') && (
            <div className="space-y-2">
              <Label htmlFor="washrooms">Washrooms</Label>
              <Input
                id="washrooms"
                type="number"
                min="0"
                placeholder="e.g. 2"
                value={washrooms}
                onChange={(e) => setWashrooms(e.target.value)}
              />
            </div>
          )}
          {fieldVisible('parkingCount') && (
            <div className="space-y-2">
              <Label htmlFor="parkingCount">Parking Spots</Label>
              <Input
                id="parkingCount"
                type="number"
                min="0"
                placeholder="e.g. 4"
                value={parkingCount}
                onChange={(e) => setParkingCount(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {fieldVisible('roadFrontageFt') && (
        <>
          <div className="space-y-2">
            <Label htmlFor="roadFrontageFt">Road Frontage (ft)</Label>
            <Input
              id="roadFrontageFt"
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 30"
              value={roadFrontageFt}
              onChange={(e) => setRoadFrontageFt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="commercialUsage">Usage / Business Type</Label>
            <Input
              id="commercialUsage"
              placeholder="e.g. Retail, Office, Restaurant"
              value={commercialUsage}
              onChange={(e) => setCommercialUsage(e.target.value)}
            />
          </div>
          {fieldVisible('numberOfUnits') && (
            <div className="space-y-2">
              <Label htmlFor="numberOfUnits">Number of Units</Label>
              <Input
                id="numberOfUnits"
                type="number"
                min="1"
                placeholder="e.g. 8"
                value={numberOfUnits}
                onChange={(e) => setNumberOfUnits(e.target.value)}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
