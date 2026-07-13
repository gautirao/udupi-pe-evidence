import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';

// Issue #1838 slice-5e — pure state-ownership extraction of the 7
// shared-across-domains fields from EditListingForm, mirroring
// useAgriFields/useCommercialFields/useRentFields/useResidentialFields.
// No behaviour change: same useState defaults, same prefill assignments
// (verbatim from the removed prefill effect lines).
//
// These 7 fields are shared between residential/apartment and commercial
// (carpetArea, carpetAreaUnit, floorNumber, totalFloors, furnishingStatus),
// or between residential and agri (facing, ownershipType — facing is
// agri-visible via AGRI_FACING_FIELD, #1627, in listingFieldConfig.ts's
// CONFIG_MAP, so both are genuinely shared residential∩agri fields).
// hydrate() is unconditional (no fieldVisible gate) — the same as the other
// domain hooks.
//
// EXCLUDED (component-owned, untouched): bedrooms, builtArea, builtAreaUnit,
// landArea, landAreaUnit (+ companion state landAreaUnitError/
// builtAreaUnitError, showLandArea/showBuiltArea, the propertyType-dependent
// landAreaUnit default), all base scalars, wizard/UI/image state.

export interface SharedFieldValues {
  carpetArea: number | null;
  carpetAreaUnit: string;
  floorNumber: string;
  totalFloors: string;
  furnishingStatus: string;
  facing: string;
  ownershipType: string;
}

export interface SharedFieldSetters {
  setCarpetArea: Dispatch<SetStateAction<number | null>>;
  setCarpetAreaUnit: Dispatch<SetStateAction<string>>;
  setFloorNumber: Dispatch<SetStateAction<string>>;
  setTotalFloors: Dispatch<SetStateAction<string>>;
  setFurnishingStatus: Dispatch<SetStateAction<string>>;
  setFacing: Dispatch<SetStateAction<string>>;
  setOwnershipType: Dispatch<SetStateAction<string>>;
}

export interface UseSharedFieldsResult {
  values: SharedFieldValues;
  setters: SharedFieldSetters;
  hydrate: (listing: ListingResponse) => void;
}

export function useSharedFields(): UseSharedFieldsResult {
  const [carpetArea, setCarpetArea] = useState<number | null>(null);
  const [carpetAreaUnit, setCarpetAreaUnit] = useState('sqft');
  const [floorNumber, setFloorNumber] = useState('');
  const [totalFloors, setTotalFloors] = useState('');
  const [furnishingStatus, setFurnishingStatus] = useState('');
  const [facing, setFacing] = useState('');
  const [ownershipType, setOwnershipType] = useState('');

  // Stable across renders — setState setters are stable, deps array is empty.
  const hydrate = useCallback((listing: ListingResponse) => {
    setCarpetArea(listing.carpetArea);
    setCarpetAreaUnit(listing.carpetAreaUnit ?? 'sqft');
    setFloorNumber(listing.floorNumber != null ? String(listing.floorNumber) : '');
    setTotalFloors(listing.totalFloors != null ? String(listing.totalFloors) : '');
    setFurnishingStatus(listing.furnishingStatus ?? '');
    setFacing(listing.facing ?? '');
    setOwnershipType(listing.ownershipType ?? '');
  }, []);

  return {
    values: {
      carpetArea,
      carpetAreaUnit,
      floorNumber,
      totalFloors,
      furnishingStatus,
      facing,
      ownershipType,
    },
    setters: {
      setCarpetArea,
      setCarpetAreaUnit,
      setFloorNumber,
      setTotalFloors,
      setFurnishingStatus,
      setFacing,
      setOwnershipType,
    },
    hydrate,
  };
}
