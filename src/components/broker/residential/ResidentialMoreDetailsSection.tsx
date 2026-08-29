import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SingleChipGroup, MultiChipGroup } from '@/components/broker/ChipGroup';
import {
  RESIDENTIAL_OWNERSHIP_OPTIONS,
  CONVERSION_STATUS_OPTIONS,
  SPECIAL_LOCATION_VIEW_OPTIONS,
  APARTMENT_AMENITY_OPTIONS,
  HOUSE_VILLA_AMENITY_OPTIONS,
} from '@/lib/listing-constants';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import { Field, SectionHeader, BoolSwitch } from './ResidentialFormPrimitives';
import { PARKING_CHIP_OPTIONS } from './residentialFormConstants';

interface ResidentialMoreDetailsSectionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isApartment: boolean;
  isPlot: boolean;
  fieldVisible: (key: ListingFieldKey) => boolean;

  superBuiltArea: string;
  onSuperBuiltAreaChange: (value: string) => void;
  parking2wCount: string;
  onParking2wCountChange: (value: string) => void;
  parking4wCount: string;
  onParking4wCountChange: (value: string) => void;
  isGated: boolean | null;
  onIsGatedChange: (value: boolean) => void;
  builderName: string;
  onBuilderNameChange: (value: string) => void;
  hasLift: boolean | null;
  onHasLiftChange: (value: boolean) => void;
  hasPowerBackup: boolean | null;
  onHasPowerBackupChange: (value: boolean) => void;
  hasGarden: boolean | null;
  onHasGardenChange: (value: boolean) => void;
  hasTerrace: boolean | null;
  onHasTerraceChange: (value: boolean) => void;
  hasCompound: boolean | null;
  onHasCompoundChange: (value: boolean) => void;
  hasServantRoom: boolean | null;
  onHasServantRoomChange: (value: boolean) => void;
  amenities: string[];
  onAmenitiesChange: (value: string[]) => void;
  specialLocationViews: string[];
  onSpecialLocationViewsChange: (value: string[]) => void;
  ownershipType: string;
  onOwnershipTypeChange: (value: string) => void;
  conversionStatus: string;
  onConversionStatusChange: (value: string) => void;
  khataNumber: string;
  onKhataNumberChange: (value: string) => void;
  propertyTaxPid: string;
  onPropertyTaxPidChange: (value: string) => void;
  approvingAuthority: string;
  onApprovingAuthorityChange: (value: string) => void;
  surveyNumber: string;
  onSurveyNumberChange: (value: string) => void;
}

/** #2387 — Section 5: More details / Ownership & document details (collapsible). Verbatim extraction, no behaviour change. */
export function ResidentialMoreDetailsSection(props: ResidentialMoreDetailsSectionProps) {
  const { open, onOpenChange, isApartment, isPlot, fieldVisible } = props;
  const amenityOptions = isApartment ? APARTMENT_AMENITY_OPTIONS : HOUSE_VILLA_AMENITY_OPTIONS;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between text-left">
            <SectionHeader number={5} title="More details / Ownership & document details" />
            <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-1">
          {/* AC8 — optional/secondary Property Details fields regrouped here
              (JSX placement only; isListingFieldVisible still gates every
              field, so per-subtype visibility is unchanged).
              Issue #2040 — apartment builtArea moved OUT of this
              collapsed section into core Section 3 (it is submit-required,
              not optional); see ResidentialPropertyDetailsSection. */}
          {isApartment && fieldVisible('superBuiltArea') && (
            <Field id="superBuiltArea" label="Super built-up area (sqft)">
              <Input id="superBuiltArea" type="number" min="0" className="h-11 font-mono" value={props.superBuiltArea} onChange={(e) => props.onSuperBuiltAreaChange(e.target.value)} />
            </Field>
          )}
          {(fieldVisible('parking2wCount') || fieldVisible('parking4wCount')) && (
            <div className="grid grid-cols-2 gap-4">
              {fieldVisible('parking2wCount') && (
                <SingleChipGroup id="parking2wCount" label="2-wheeler parking" options={PARKING_CHIP_OPTIONS} value={props.parking2wCount} onValueChange={props.onParking2wCountChange} />
              )}
              {fieldVisible('parking4wCount') && (
                <SingleChipGroup id="parking4wCount" label="4-wheeler parking" options={PARKING_CHIP_OPTIONS} value={props.parking4wCount} onValueChange={props.onParking4wCountChange} />
              )}
            </div>
          )}
          {fieldVisible('isGated') && (
            <BoolSwitch id="isGated" label="Gated community" value={props.isGated} onChange={props.onIsGatedChange} />
          )}
          {fieldVisible('builderName') && (
            <Field id="builderName" label="Builder name">
              <Input id="builderName" value={props.builderName} onChange={(e) => props.onBuilderNameChange(e.target.value)} className="h-11" />
            </Field>
          )}
          {(fieldVisible('hasLift') || fieldVisible('hasPowerBackup')) && (
            <div className="grid grid-cols-2 gap-3">
              {fieldVisible('hasLift') && <BoolSwitch id="hasLift" label="Lift" value={props.hasLift} onChange={props.onHasLiftChange} />}
              {fieldVisible('hasPowerBackup') && <BoolSwitch id="hasPowerBackup" label="Power backup" value={props.hasPowerBackup} onChange={props.onHasPowerBackupChange} />}
            </div>
          )}
          {(fieldVisible('hasGarden') || fieldVisible('hasTerrace') || fieldVisible('hasCompound') || fieldVisible('hasServantRoom')) && (
            <div className="grid grid-cols-2 gap-3">
              {fieldVisible('hasGarden') && <BoolSwitch id="hasGarden" label="Garden" value={props.hasGarden} onChange={props.onHasGardenChange} />}
              {fieldVisible('hasTerrace') && <BoolSwitch id="hasTerrace" label="Terrace" value={props.hasTerrace} onChange={props.onHasTerraceChange} />}
              {fieldVisible('hasCompound') && <BoolSwitch id="hasCompound" label="Compound wall" value={props.hasCompound} onChange={props.onHasCompoundChange} />}
              {fieldVisible('hasServantRoom') && <BoolSwitch id="hasServantRoom" label="Servant room" value={props.hasServantRoom} onChange={props.onHasServantRoomChange} />}
            </div>
          )}
          {fieldVisible('amenities') && (
            <MultiChipGroup testId="chip-group-amenities" label="Amenities" options={amenityOptions} value={props.amenities} onValueChange={props.onAmenitiesChange} />
          )}
          {fieldVisible('specialLocationViews') && (
            <MultiChipGroup testId="chip-group-special-views" label="Special location / views" options={SPECIAL_LOCATION_VIEW_OPTIONS} value={props.specialLocationViews} onValueChange={props.onSpecialLocationViewsChange} />
          )}
          {fieldVisible('ownershipType') && (
            <Field id="ownershipType" label="Ownership type">
              <Select value={props.ownershipType} onValueChange={props.onOwnershipTypeChange}>
                <SelectTrigger id="ownershipType" className="h-11"><SelectValue placeholder="Select ownership type" /></SelectTrigger>
                <SelectContent>
                  {RESIDENTIAL_OWNERSHIP_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {isPlot && fieldVisible('conversionStatus') && (
            <Field id="conversionStatus" label="Conversion status">
              <Select value={props.conversionStatus} onValueChange={props.onConversionStatusChange}>
                <SelectTrigger id="conversionStatus" className="h-11"><SelectValue placeholder="Select conversion status" /></SelectTrigger>
                <SelectContent>
                  {CONVERSION_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {isPlot && fieldVisible('khataNumber') && (
            <Field id="khataNumber" label="Khata number">
              <Input id="khataNumber" value={props.khataNumber} onChange={(e) => props.onKhataNumberChange(e.target.value)} className="h-11" />
            </Field>
          )}
          {isPlot && fieldVisible('propertyTaxPid') && (
            <Field id="propertyTaxPid" label="Property tax PID">
              <Input id="propertyTaxPid" value={props.propertyTaxPid} onChange={(e) => props.onPropertyTaxPidChange(e.target.value)} className="h-11" />
            </Field>
          )}
          {isPlot && fieldVisible('approvingAuthority') && (
            <Field id="approvingAuthority" label="Approving authority">
              <Input id="approvingAuthority" value={props.approvingAuthority} onChange={(e) => props.onApprovingAuthorityChange(e.target.value)} className="h-11" />
            </Field>
          )}
          {isPlot && fieldVisible('surveyNumber') && (
            <Field id="surveyNumber" label="Survey number">
              <Input id="surveyNumber" placeholder="e.g. 123/4A" value={props.surveyNumber} onChange={(e) => props.onSurveyNumberChange(e.target.value)} className="h-11" />
            </Field>
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
