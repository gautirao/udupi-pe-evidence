import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';

// Issue #1838 slice-5c — pure state-ownership extraction of the 3
// rent-exclusive fields from EditListingForm. No behaviour change: same
// useState('') defaults, same prefill assignments (verbatim from the
// removed prefill effect lines).
//
// monthlyRent/securityDepositMonths/lockInMonths are gated PURELY by
// listingPurpose === 'rent' (isListingFieldVisible in listingFieldConfig.ts),
// not by propertyType. The 5 dual-gated fields (maintenanceIncluded,
// rentNegotiable, petsAllowed, availabilityTimeline, preferredTenants) are
// gated by BOTH residential family AND listingPurpose === 'rent' — they stay
// component-owned (deferred to slice 5d), NOT part of this hook.

export interface RentFieldValues {
  monthlyRent: string;
  securityDepositMonths: string;
  lockInMonths: string;
}

export interface RentFieldSetters {
  setMonthlyRent: Dispatch<SetStateAction<string>>;
  setSecurityDepositMonths: Dispatch<SetStateAction<string>>;
  setLockInMonths: Dispatch<SetStateAction<string>>;
}

export interface UseRentFieldsResult {
  values: RentFieldValues;
  setters: RentFieldSetters;
  hydrate: (listing: ListingResponse) => void;
}

export function useRentFields(): UseRentFieldsResult {
  const [monthlyRent, setMonthlyRent] = useState('');
  const [securityDepositMonths, setSecurityDepositMonths] = useState('');
  const [lockInMonths, setLockInMonths] = useState('');

  // Stable across renders — setState setters are stable, deps array is empty.
  const hydrate = useCallback((listing: ListingResponse) => {
    setMonthlyRent(listing.monthlyRent != null ? String(listing.monthlyRent) : '');
    setSecurityDepositMonths(listing.securityDepositMonths != null ? String(listing.securityDepositMonths) : '');
    setLockInMonths(listing.lockInMonths != null ? String(listing.lockInMonths) : '');
  }, []);

  return {
    values: {
      monthlyRent,
      securityDepositMonths,
      lockInMonths,
    },
    setters: {
      setMonthlyRent,
      setSecurityDepositMonths,
      setLockInMonths,
    },
    hydrate,
  };
}
