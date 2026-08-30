import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SingleChipGroup, MultiChipGroup, type ChipOption } from '@/components/broker/ChipGroup';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import { COMMERCIAL_UTILITY_OPTIONS, COMMERCIAL_FURNISHING_STATUS_OPTIONS, COMMERCIAL_AVAILABILITY_OPTIONS } from '@/lib/listing-constants';
import { Field, SectionHeader } from './CommercialFormPrimitives';

const WASHROOM_PARKING_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3+' },
];

export interface CommercialMoreDetailsSectionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldVisible: (key: ListingFieldKey) => boolean;
  suitableUseOptions: readonly ChipOption[];

  washroomsPublic: string;
  onWashroomsPublicChange: (v: string) => void;
  washroomsPrivate: string;
  onWashroomsPrivateChange: (v: string) => void;
  parkingPublicCount: string;
  onParkingPublicCountChange: (v: string) => void;
  parkingPrivateCount: string;
  onParkingPrivateCountChange: (v: string) => void;
  commercialFurnishingStatus: string;
  onCommercialFurnishingStatusChange: (v: string) => void;
  utilities: string[];
  onUtilitiesChange: (v: string[]) => void;
  suitableUses: string[];
  onSuitableUsesChange: (v: string[]) => void;
  commercialAvailability: string;
  onCommercialAvailabilityChange: (v: string) => void;
}

/** #2388 — Section 5: collapsible "more details" (washrooms, parking, furnishing, utilities, suitable uses, availability). */
export function CommercialMoreDetailsSection(props: CommercialMoreDetailsSectionProps) {
  const { fieldVisible } = props;

  return (
    <Collapsible open={props.open} onOpenChange={props.onOpenChange}>
      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between text-left">
            <SectionHeader number={5} title="More details" />
            <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${props.open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-1">
          {(fieldVisible('washroomsPublic') || fieldVisible('washroomsPrivate')) && (
            <div className="grid grid-cols-2 gap-4">
              {fieldVisible('washroomsPublic') && (
                <SingleChipGroup id="washroomsPublic" label="Public washrooms" options={WASHROOM_PARKING_CHIP_OPTIONS} value={props.washroomsPublic} onValueChange={props.onWashroomsPublicChange} />
              )}
              {fieldVisible('washroomsPrivate') && (
                <SingleChipGroup id="washroomsPrivate" label="Private washrooms" options={WASHROOM_PARKING_CHIP_OPTIONS} value={props.washroomsPrivate} onValueChange={props.onWashroomsPrivateChange} />
              )}
            </div>
          )}
          {(fieldVisible('parkingPublicCount') || fieldVisible('parkingPrivateCount')) && (
            <div className="grid grid-cols-2 gap-4">
              {fieldVisible('parkingPublicCount') && (
                <SingleChipGroup id="parkingPublicCount" label="Public parking" options={WASHROOM_PARKING_CHIP_OPTIONS} value={props.parkingPublicCount} onValueChange={props.onParkingPublicCountChange} />
              )}
              {fieldVisible('parkingPrivateCount') && (
                <SingleChipGroup id="parkingPrivateCount" label="Private parking" options={WASHROOM_PARKING_CHIP_OPTIONS} value={props.parkingPrivateCount} onValueChange={props.onParkingPrivateCountChange} />
              )}
            </div>
          )}
          {fieldVisible('commercialFurnishingStatus') && (
            <SingleChipGroup id="commercialFurnishingStatus" label="Furnishing" variant="segmented" options={COMMERCIAL_FURNISHING_STATUS_OPTIONS} value={props.commercialFurnishingStatus} onValueChange={props.onCommercialFurnishingStatusChange} />
          )}
          {fieldVisible('utilities') && (
            <MultiChipGroup testId="chip-group-utilities" label="Utilities" options={COMMERCIAL_UTILITY_OPTIONS} value={props.utilities} onValueChange={props.onUtilitiesChange} />
          )}
          {fieldVisible('suitableUses') && (
            <MultiChipGroup testId="chip-group-suitable-uses" label="Suitable for" options={props.suitableUseOptions} value={props.suitableUses} onValueChange={props.onSuitableUsesChange} />
          )}
          {fieldVisible('commercialAvailability') && (
            <Field id="commercialAvailability" label="Availability">
              <Select value={props.commercialAvailability} onValueChange={props.onCommercialAvailabilityChange}>
                <SelectTrigger id="commercialAvailability" className="h-11"><SelectValue placeholder="Select availability" /></SelectTrigger>
                <SelectContent>
                  {COMMERCIAL_AVAILABILITY_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
