// Extracted verbatim from DescribeStep.tsx:1398-1440 — no gate logic changed.
// Issue #1838 PR D — internal split of DescribeStep into per-domain sections.
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import type { RentFieldValues, RentFieldSetters } from '../../useRentFields';
import type { FieldSlice } from '../stepContracts';

type RentDetailsValueKeys = 'monthlyRent' | 'securityDepositMonths' | 'lockInMonths';

interface RentDetailsSectionProps {
  rent: FieldSlice<RentFieldValues, RentFieldSetters, RentDetailsValueKeys>;
  fieldVisible: (key: ListingFieldKey) => boolean;
}

/** Rent fields — Monthly Rent, Security Deposit, Lock-in Period. */
export function RentDetailsSection({ rent, fieldVisible }: RentDetailsSectionProps) {
  const { monthlyRent, securityDepositMonths, lockInMonths } = rent.values;
  const { setMonthlyRent, setSecurityDepositMonths, setLockInMonths } = rent.setters;

  return (
    <>
      {fieldVisible('monthlyRent') && (
        <div className="space-y-4 rounded-md border p-4 bg-muted/30">
          <p className="text-sm font-medium">Rent Details</p>
          <div className="space-y-2">
            <Label htmlFor="monthlyRent">Monthly Rent (₹) *</Label>
            <Input
              id="monthlyRent"
              type="number"
              min="1"
              placeholder="e.g. 15000"
              value={monthlyRent}
              onChange={(e) => setMonthlyRent(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="securityDepositMonths">Security Deposit (months) *</Label>
              <Input
                id="securityDepositMonths"
                type="number"
                min="0"
                max="24"
                placeholder="e.g. 10"
                value={securityDepositMonths}
                onChange={(e) => setSecurityDepositMonths(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lockInMonths">Lock-in Period (months)</Label>
              <Input
                id="lockInMonths"
                type="number"
                min="0"
                max="60"
                placeholder="e.g. 12"
                value={lockInMonths}
                onChange={(e) => setLockInMonths(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
