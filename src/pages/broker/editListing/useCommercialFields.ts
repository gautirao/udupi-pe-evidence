import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';

// Issue #1838 slice-5b — pure state-ownership extraction of the 5
// commercial-exclusive fields from EditListingForm. No behaviour change:
// same useState('') defaults, same prefill assignments (verbatim from the
// removed prefill effect lines).
//
// carpetArea/carpetAreaUnit/floorNumber/totalFloors/furnishingStatus are
// SHARED with residential/apartment (see listingFieldConfig.ts CONFIG_MAP)
// and stay component-owned — they are NOT part of this hook.
//
// numberOfUnits is a commercial subset: per CONFIG_MAP it renders only for
// commercial_building and warehouse (not the base 'commercial' or
// commercial_land types), but it is still commercial-exclusive — no
// non-commercial propertyType renders it.

export interface CommercialFieldValues {
  washrooms: string;
  parkingCount: string;
  roadFrontageFt: string;
  commercialUsage: string;
  numberOfUnits: string;
}

export interface CommercialFieldSetters {
  setWashrooms: Dispatch<SetStateAction<string>>;
  setParkingCount: Dispatch<SetStateAction<string>>;
  setRoadFrontageFt: Dispatch<SetStateAction<string>>;
  setCommercialUsage: Dispatch<SetStateAction<string>>;
  setNumberOfUnits: Dispatch<SetStateAction<string>>;
}

export interface UseCommercialFieldsResult {
  values: CommercialFieldValues;
  setters: CommercialFieldSetters;
  hydrate: (listing: ListingResponse) => void;
}

export function useCommercialFields(): UseCommercialFieldsResult {
  const [washrooms, setWashrooms] = useState('');
  const [parkingCount, setParkingCount] = useState('');
  const [roadFrontageFt, setRoadFrontageFt] = useState('');
  const [commercialUsage, setCommercialUsage] = useState('');
  const [numberOfUnits, setNumberOfUnits] = useState('');

  // Stable across renders — setState setters are stable, deps array is empty.
  const hydrate = useCallback((listing: ListingResponse) => {
    setWashrooms(listing.washrooms != null ? String(listing.washrooms) : '');
    setParkingCount(listing.parkingCount != null ? String(listing.parkingCount) : '');
    setRoadFrontageFt(listing.roadFrontageFt != null ? String(listing.roadFrontageFt) : '');
    setCommercialUsage(listing.commercialUsage ?? '');
    setNumberOfUnits(listing.numberOfUnits != null ? String(listing.numberOfUnits) : '');
  }, []);

  return {
    values: {
      washrooms,
      parkingCount,
      roadFrontageFt,
      commercialUsage,
      numberOfUnits,
    },
    setters: {
      setWashrooms,
      setParkingCount,
      setRoadFrontageFt,
      setCommercialUsage,
      setNumberOfUnits,
    },
    hydrate,
  };
}
