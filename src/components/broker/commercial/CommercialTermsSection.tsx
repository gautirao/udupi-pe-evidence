import { Input } from '@/components/ui/input';
import { PriceField } from '@/components/broker/PriceField';
import { FieldPairRow } from '@/components/broker/residential/FieldPairRow';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import type { CommercialPurpose } from './commercialListingTypes';
import { Field, Section } from './CommercialFormPrimitives';

export interface CommercialTermsSectionProps {
  listingPurpose: CommercialPurpose;
  isRentOrLease: boolean;
  fieldVisible: (key: ListingFieldKey) => boolean;
  hasAttempted: boolean;
  isRecoveringDraft: boolean;

  priceHydrationSeed: number | null;
  priceRupees: number | null;
  onPriceChange: (v: number | null) => void;

  expectedRentalYieldPct: string;
  onExpectedRentalYieldPctChange: (v: string) => void;
  currentMonthlyIncomePaise: string;
  onCurrentMonthlyIncomePaiseChange: (v: string) => void;

  monthlyRent: string;
  onMonthlyRentChange: (v: string) => void;
  securityDepositMonths: string;
  onSecurityDepositMonthsChange: (v: string) => void;
  lockInMonths: string;
  onLockInMonthsChange: (v: string) => void;
  leaseTermMonths: string;
  onLeaseTermMonthsChange: (v: string) => void;
  leaseEscalationPct: string;
  onLeaseEscalationPctChange: (v: string) => void;
}

/** #2388 — Section 4: Sale / Rent / Lease terms. */
export function CommercialTermsSection(props: CommercialTermsSectionProps) {
  const { fieldVisible, isRentOrLease } = props;

  return (
    <Section number={4} title={props.listingPurpose === 'sale' ? 'Sale terms' : props.listingPurpose === 'lease' ? 'Lease terms' : 'Rent terms'}>
      {!isRentOrLease && fieldVisible('price') && (
        <div>
          <PriceField id="price" initialRupees={props.priceHydrationSeed} onChange={props.onPriceChange} required disabled={props.isRecoveringDraft} />
          {props.hasAttempted && (props.priceRupees == null || props.priceRupees <= 0) && (
            <p className="mt-1 text-sm text-destructive">A valid price greater than 0 is required.</p>
          )}
        </div>
      )}
      {!isRentOrLease && fieldVisible('expectedRentalYieldPct') && (
        <FieldPairRow>
          <Field id="expectedRentalYieldPct" label="Expected rental yield (%)">
            <Input id="expectedRentalYieldPct" type="number" min="0" step="any" className="h-11 font-mono" value={props.expectedRentalYieldPct} onChange={(e) => props.onExpectedRentalYieldPctChange(e.target.value)} />
          </Field>
          {fieldVisible('currentMonthlyIncomePaise') && (
            <Field id="currentMonthlyIncomePaise" label="Current monthly income (₹)">
              <Input id="currentMonthlyIncomePaise" type="number" min="0" className="h-11 font-mono" value={props.currentMonthlyIncomePaise} onChange={(e) => props.onCurrentMonthlyIncomePaiseChange(e.target.value)} />
            </Field>
          )}
        </FieldPairRow>
      )}

      {isRentOrLease && fieldVisible('monthlyRent') && (
        <div>
          <Field id="monthlyRent" label="Monthly rent (₹) *">
            <Input id="monthlyRent" type="number" min="1" className="h-12 font-mono text-[17px] font-semibold" value={props.monthlyRent} onChange={(e) => props.onMonthlyRentChange(e.target.value)} />
          </Field>
          {props.hasAttempted && (!props.monthlyRent || parseInt(props.monthlyRent, 10) <= 0) && (
            <p className="mt-1 text-sm text-destructive">Monthly rent must be greater than 0.</p>
          )}
        </div>
      )}
      {isRentOrLease && fieldVisible('securityDepositMonths') && (
        <Field id="securityDepositMonths" label="Security deposit (months)">
          <Input id="securityDepositMonths" type="number" min="0" max="24" className="h-11 font-mono" value={props.securityDepositMonths} onChange={(e) => props.onSecurityDepositMonthsChange(e.target.value)} />
        </Field>
      )}
      {isRentOrLease && fieldVisible('lockInMonths') && (
        <Field id="lockInMonths" label="Lock-in period (months)">
          <Input id="lockInMonths" type="number" min="0" max="60" className="h-11 font-mono" value={props.lockInMonths} onChange={(e) => props.onLockInMonthsChange(e.target.value)} />
        </Field>
      )}
      {isRentOrLease && fieldVisible('leaseTermMonths') && (
        <FieldPairRow>
          <Field id="leaseTermMonths" label="Lease term (months)">
            <Input id="leaseTermMonths" type="number" min="0" className="h-11 font-mono" value={props.leaseTermMonths} onChange={(e) => props.onLeaseTermMonthsChange(e.target.value)} />
          </Field>
          {fieldVisible('leaseEscalationPct') && (
            <Field id="leaseEscalationPct" label="Lease escalation (%)">
              <Input id="leaseEscalationPct" type="number" min="0" step="any" className="h-11 font-mono" value={props.leaseEscalationPct} onChange={(e) => props.onLeaseEscalationPctChange(e.target.value)} />
            </Field>
          )}
        </FieldPairRow>
      )}
    </Section>
  );
}
