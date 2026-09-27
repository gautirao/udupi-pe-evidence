// Extracted verbatim from DescribeStep.tsx:1443-1539 — no gate logic changed.
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
import {
  PROPERTY_STATUS_OPTIONS,
  MAINTENANCE_INCLUDED_OPTIONS,
  AVAILABILITY_OPTIONS,
  PREFERRED_TENANT_OPTIONS,
} from '@/lib/listing-constants';
import { SingleChipGroup, MultiChipGroup } from '../../chipGroups';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import type { ResidentialFieldValues, ResidentialFieldSetters } from '../../useResidentialFields';
import type { FieldSlice } from '../stepContracts';

type ResidentialTermsValueKeys =
  | 'maintenancePaise' | 'possessionStatus' | 'availabilityTimeline' | 'priceNegotiable'
  | 'maintenanceIncluded' | 'rentNegotiable' | 'petsAllowed' | 'preferredTenants';

interface ResidentialTermsSectionProps {
  residential: FieldSlice<ResidentialFieldValues, ResidentialFieldSetters, ResidentialTermsValueKeys>;
  fieldVisible: (key: ListingFieldKey) => boolean;
}

/** M38-13A (#1626) — sale vs rent conditional terms (design §4). */
export function ResidentialTermsSection({ residential, fieldVisible }: ResidentialTermsSectionProps) {
  const {
    maintenancePaise, possessionStatus,
    availabilityTimeline, priceNegotiable,
    maintenanceIncluded, rentNegotiable, petsAllowed, preferredTenants,
  } = residential.values;
  const {
    setMaintenancePaise, setPossessionStatus,
    setAvailabilityTimeline, setPriceNegotiable,
    setMaintenanceIncluded, setRentNegotiable, setPetsAllowed, setPreferredTenants,
  } = residential.setters;

  return (
    <>
      {fieldVisible('possessionStatus') && (
        <SingleChipGroup
          id="possessionStatus"
          label="Property status"
          variant="segmented"
          options={PROPERTY_STATUS_OPTIONS}
          value={possessionStatus}
          onValueChange={setPossessionStatus}
        />
      )}

      {fieldVisible('maintenancePaise') && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="maintenancePaise">Maintenance (₹/mo)</Label>
            <Input
              id="maintenancePaise"
              type="number"
              min="0"
              placeholder="e.g. 2000"
              value={maintenancePaise}
              onChange={(e) => setMaintenancePaise(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="priceNegotiable">Negotiable</Label>
            <Select value={priceNegotiable} onValueChange={setPriceNegotiable}>
              <SelectTrigger id="priceNegotiable">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {fieldVisible('maintenanceIncluded') && (
        <div className="grid grid-cols-2 gap-4">
          <SingleChipGroup
            id="maintenanceIncluded"
            label="Maintenance"
            variant="segmented"
            options={MAINTENANCE_INCLUDED_OPTIONS}
            value={maintenanceIncluded === 'true' ? 'INCLUDED' : maintenanceIncluded === 'false' ? 'EXCLUDED' : ''}
            onValueChange={(v) => setMaintenanceIncluded(v === 'INCLUDED' ? 'true' : 'false')}
          />
          <div className="space-y-2">
            <Label htmlFor="rentNegotiable">Negotiable</Label>
            <Select value={rentNegotiable} onValueChange={setRentNegotiable}>
              <SelectTrigger id="rentNegotiable">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {fieldVisible('availabilityTimeline') && (
        <SingleChipGroup
          id="availabilityTimeline"
          label="Availability"
          options={AVAILABILITY_OPTIONS}
          value={availabilityTimeline}
          onValueChange={setAvailabilityTimeline}
        />
      )}

      {fieldVisible('petsAllowed') && (
        <div className="space-y-2">
          <Label htmlFor="petsAllowed">Pets allowed</Label>
          <Select value={petsAllowed} onValueChange={setPetsAllowed}>
            <SelectTrigger id="petsAllowed">
              <SelectValue placeholder="Not specified" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {fieldVisible('preferredTenants') && (
        <MultiChipGroup
          label="Preferred tenants"
          options={PREFERRED_TENANT_OPTIONS}
          value={preferredTenants}
          onValueChange={setPreferredTenants}
        />
      )}
    </>
  );
}
