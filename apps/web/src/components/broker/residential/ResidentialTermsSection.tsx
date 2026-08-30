import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PriceField } from '@/components/broker/PriceField';
import { MultiChipGroup, boolToTriState, triStateToBool } from '@/components/broker/ChipGroup';
import {
  PROPERTY_STATUS_OPTIONS,
  MAINTENANCE_INCLUDED_OPTIONS,
  AVAILABILITY_OPTIONS,
  PREFERRED_TENANT_OPTIONS,
} from '@/lib/listing-constants';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import { Field, Section, BoolSwitch } from './ResidentialFormPrimitives';

interface ResidentialTermsSectionProps {
  isRent: boolean;
  fieldVisible: (key: ListingFieldKey) => boolean;
  hasAttempted: boolean;

  priceRupees: number | null;
  onPriceChange: (value: number | null) => void;
  priceNegotiable: boolean | null;
  onPriceNegotiableChange: (value: boolean) => void;
  maintenancePaise: string;
  onMaintenancePaiseChange: (value: string) => void;
  possessionStatus: string;
  onPossessionStatusChange: (value: string) => void;
  reraNumberDraft: string;
  onReraNumberDraftChange: (value: string) => void;

  monthlyRent: string;
  onMonthlyRentChange: (value: string) => void;
  securityDepositMonths: string;
  onSecurityDepositMonthsChange: (value: string) => void;
  lockInMonths: string;
  onLockInMonthsChange: (value: string) => void;
  maintenanceIncluded: boolean | null;
  onMaintenanceIncludedChange: (value: boolean | null) => void;
  availabilityTimeline: string;
  onAvailabilityTimelineChange: (value: string) => void;
  preferredTenants: string[];
  onPreferredTenantsChange: (value: string[]) => void;
  petsAllowed: boolean | null;
  onPetsAllowedChange: (value: boolean) => void;
  rentNegotiable: boolean | null;
  onRentNegotiableChange: (value: boolean) => void;
}

/** #2387 — Section 4: Sale / Rent terms. Verbatim extraction, no behaviour change. */
export function ResidentialTermsSection(props: ResidentialTermsSectionProps) {
  const { isRent, fieldVisible, hasAttempted } = props;
  return (
    <Section number={4} title={isRent ? 'Rent terms' : 'Sale terms'}>
      {!isRent && fieldVisible('price') && (
        <div>
          <PriceField id="price" initialRupees={null} onChange={props.onPriceChange} required />
          {hasAttempted && (props.priceRupees == null || props.priceRupees <= 0) && (
            <p className="mt-1 text-sm text-destructive">A valid price greater than 0 is required.</p>
          )}
        </div>
      )}
      {!isRent && fieldVisible('priceNegotiable') && (
        <BoolSwitch id="priceNegotiable" label="Price negotiable" value={props.priceNegotiable} onChange={props.onPriceNegotiableChange} />
      )}
      {!isRent && fieldVisible('maintenancePaise') && (
        <Field id="maintenancePaise" label="Monthly maintenance (₹)">
          <Input id="maintenancePaise" type="number" min="0" className="h-11 font-mono" value={props.maintenancePaise} onChange={(e) => props.onMaintenancePaiseChange(e.target.value)} />
        </Field>
      )}
      {!isRent && fieldVisible('possessionStatus') && (
        <Field id="possessionStatus" label="Property status">
          <Select value={props.possessionStatus} onValueChange={props.onPossessionStatusChange}>
            <SelectTrigger id="possessionStatus" className="h-11"><SelectValue placeholder="Select status" /></SelectTrigger>
            <SelectContent>
              {PROPERTY_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
      {!isRent && (
        <Field id="reraNumber" label="RERA number" hint="Added after the draft is created — see the listing's Describe step.">
          <Input id="reraNumber" placeholder="Optional" value={props.reraNumberDraft} onChange={(e) => props.onReraNumberDraftChange(e.target.value)} className="h-11" disabled />
        </Field>
      )}

      {isRent && fieldVisible('monthlyRent') && (
        <div>
          <Field id="monthlyRent" label="Monthly rent (₹) *">
            <Input id="monthlyRent" type="number" min="1" className="h-12 font-mono text-[17px] font-semibold" value={props.monthlyRent} onChange={(e) => props.onMonthlyRentChange(e.target.value)} />
          </Field>
          {hasAttempted && (!props.monthlyRent || parseInt(props.monthlyRent, 10) <= 0) && (
            <p className="mt-1 text-sm text-destructive">Monthly rent must be greater than 0.</p>
          )}
        </div>
      )}
      {isRent && fieldVisible('securityDepositMonths') && (
        <Field id="securityDepositMonths" label="Security deposit (months)">
          <Input id="securityDepositMonths" type="number" min="0" max="24" className="h-11 font-mono" value={props.securityDepositMonths} onChange={(e) => props.onSecurityDepositMonthsChange(e.target.value)} />
        </Field>
      )}
      {isRent && fieldVisible('lockInMonths') && (
        <Field id="lockInMonths" label="Lock-in period (months)">
          <Input id="lockInMonths" type="number" min="0" max="60" className="h-11 font-mono" value={props.lockInMonths} onChange={(e) => props.onLockInMonthsChange(e.target.value)} />
        </Field>
      )}
      {isRent && fieldVisible('maintenanceIncluded') && (
        <Field id="maintenanceIncluded" label="Maintenance">
          <Select value={boolToTriState(props.maintenanceIncluded)} onValueChange={(v) => props.onMaintenanceIncludedChange(triStateToBool(v) ?? null)}>
            <SelectTrigger id="maintenanceIncluded" className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {MAINTENANCE_INCLUDED_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value === 'INCLUDED' ? 'true' : 'false'}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
      {isRent && fieldVisible('availabilityTimeline') && (
        <Field id="availabilityTimeline" label="Availability">
          <Select value={props.availabilityTimeline} onValueChange={props.onAvailabilityTimelineChange}>
            <SelectTrigger id="availabilityTimeline" className="h-11"><SelectValue placeholder="Select availability" /></SelectTrigger>
            <SelectContent>
              {AVAILABILITY_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
      {isRent && fieldVisible('preferredTenants') && (
        <MultiChipGroup testId="chip-group-preferred-tenants" label="Preferred tenants" options={PREFERRED_TENANT_OPTIONS} value={props.preferredTenants} onValueChange={props.onPreferredTenantsChange} />
      )}
      {isRent && fieldVisible('petsAllowed') && (
        <BoolSwitch id="petsAllowed" label="Pets allowed" value={props.petsAllowed} onChange={props.onPetsAllowedChange} />
      )}
      {isRent && fieldVisible('rentNegotiable') && (
        <BoolSwitch id="rentNegotiable" label="Rent negotiable" value={props.rentNegotiable} onChange={props.onRentNegotiableChange} />
      )}
    </Section>
  );
}
