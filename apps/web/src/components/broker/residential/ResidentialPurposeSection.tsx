import { Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { PropertyTypeCardSelector } from '@/components/broker/PropertyTypeCardSelector';
import { ListingPurposeToggle } from '@/components/broker/ListingPurposeToggle';
import { Section } from './ResidentialFormPrimitives';
import type { ResidentialPropertyType } from './useResidentialListingFormState';

interface ResidentialPurposeSectionProps {
  propertyType: ResidentialPropertyType;
  onPropertyTypeChange: (value: ResidentialPropertyType) => void;
  listingPurpose: 'sale' | 'rent';
  onListingPurposeChange: (value: 'sale' | 'rent') => void;
  onSwitchToGenericFlow: () => void;
}

/** #2387 — Section 1: property type & purpose. Verbatim extraction, no behaviour change. */
export function ResidentialPurposeSection({ propertyType, onPropertyTypeChange, listingPurpose, onListingPurposeChange, onSwitchToGenericFlow }: ResidentialPurposeSectionProps) {
  return (
    <Section number={1} title="Property type & purpose">
      <PropertyTypeCardSelector
        id="residential-property-type"
        value={propertyType}
        onChange={(v) => onPropertyTypeChange(v as ResidentialPropertyType)}
        residentialOnly
      />

      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Commercial &amp; agricultural listings use a separate flow.</span>
        <button
          type="button"
          onClick={onSwitchToGenericFlow}
          className="ml-auto shrink-0 font-semibold text-primary underline-offset-2 hover:underline"
        >
          Switch flow
        </button>
      </div>

      <div className="space-y-2">
        <Label className="text-[13px] font-semibold">Listing purpose</Label>
        <ListingPurposeToggle value={listingPurpose} onChange={onListingPurposeChange} />
      </div>
    </Section>
  );
}
