import { Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PropertyTypeCardSelector } from '@/components/broker/PropertyTypeCardSelector';
import { COMMERCIAL_SUBTYPE_OPTIONS } from '@/lib/listing-constants';
import { Field, Section } from './CommercialFormPrimitives';
import type { CommercialPropertyType, ExplicitSubtype, CommercialPurpose } from './commercialListingTypes';

const PURPOSE_OPTIONS: readonly { value: CommercialPurpose; label: string }[] = [
  { value: 'sale', label: 'For Sale' },
  { value: 'rent', label: 'For Rent' },
  { value: 'lease', label: 'For Lease' },
];

const SUBTYPE_CHOICE_OPTIONS = COMMERCIAL_SUBTYPE_OPTIONS.filter((o) => o.value === 'SHOP' || o.value === 'OFFICE');

/** Local 3-way Sale/Rent/Lease segmented control — see CommercialListingForm's class doc for why ListingPurposeToggle isn't reused here. */
function CommercialPurposeToggle({ value, onChange }: { value: CommercialPurpose; onChange: (v: CommercialPurpose) => void }) {
  return (
    <div role="group" aria-label="Listing purpose" className="inline-flex rounded-lg bg-muted p-1">
      {PURPOSE_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-5 py-1.5 text-sm font-medium transition-colors ${selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export interface CommercialPurposeSectionProps {
  propertyType: CommercialPropertyType;
  onPropertyTypeChange: (v: CommercialPropertyType) => void;
  explicitSubtype: ExplicitSubtype;
  onExplicitSubtypeChange: (v: ExplicitSubtype) => void;
  listingPurpose: CommercialPurpose;
  onListingPurposeChange: (v: CommercialPurpose) => void;
  hasAttempted: boolean;
  onSwitchToGenericFlow: () => void;
}

/** #2388 — Section 1: property type & purpose. */
export function CommercialPurposeSection({
  propertyType,
  onPropertyTypeChange,
  explicitSubtype,
  onExplicitSubtypeChange,
  listingPurpose,
  onListingPurposeChange,
  hasAttempted,
  onSwitchToGenericFlow,
}: CommercialPurposeSectionProps) {
  return (
    <Section number={1} title="Property type & purpose">
      <PropertyTypeCardSelector
        id="commercial-property-type"
        value={propertyType}
        onChange={(v) => { onPropertyTypeChange(v as CommercialPropertyType); onExplicitSubtypeChange(''); }}
        commercialOnly
      />

      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Residential &amp; agricultural listings use a separate flow.</span>
        <button
          type="button"
          onClick={onSwitchToGenericFlow}
          className="ml-auto shrink-0 font-semibold text-primary underline-offset-2 hover:underline"
        >
          Switch flow
        </button>
      </div>

      {propertyType === 'commercial' && (
        <Field id="commercialSubtype" label="Is this a shop or an office? *">
          <Select value={explicitSubtype} onValueChange={(v) => onExplicitSubtypeChange(v as ExplicitSubtype)}>
            <SelectTrigger id="commercialSubtype" className="h-11"><SelectValue placeholder="Select subtype" /></SelectTrigger>
            <SelectContent>
              {SUBTYPE_CHOICE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasAttempted && !explicitSubtype && <p className="text-sm text-destructive">Choose shop or office to continue.</p>}
        </Field>
      )}

      <div className="space-y-2">
        <Label className="text-[13px] font-semibold">Listing purpose</Label>
        <CommercialPurposeToggle value={listingPurpose} onChange={onListingPurposeChange} />
      </div>
    </Section>
  );
}
