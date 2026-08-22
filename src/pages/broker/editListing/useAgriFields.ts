import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';

// Issue #1838 slice-5a — pure state-ownership extraction of the 8 agri-only
// fields from EditListingForm. No behaviour change: same useState('') defaults,
// same prefill assignments (verbatim from the removed prefill effect lines).
//
// Issue #2044 — added `crops` (canonical machine-value multi-select, AC8 edit
// hydration). `ListingResponse` (useBrokerListings.ts) is out of this issue's
// allowed-file scope, so `crops` is read via a local structural widening
// (`ListingWithCrops`) rather than editing that DTO mirror — safe because it
// only ADDS an optional field, so every existing `ListingResponse` caller
// remains assignable without a cast.
type ListingWithCrops = ListingResponse & { crops?: string[] | null };

export interface AgriFieldValues {
  waterSource: string;
  soilType: string;
  roadAccess: string;
  cultivationStatus: string;
  surveyNumber: string;
  landCategory: string;
  agriConversionStatus: string;
  farmhouseAvailable: string;
  fencingDone: string;
  crops: string[];
}

export interface AgriFieldSetters {
  setWaterSource: Dispatch<SetStateAction<string>>;
  setSoilType: Dispatch<SetStateAction<string>>;
  setRoadAccess: Dispatch<SetStateAction<string>>;
  setCultivationStatus: Dispatch<SetStateAction<string>>;
  setSurveyNumber: Dispatch<SetStateAction<string>>;
  setLandCategory: Dispatch<SetStateAction<string>>;
  setAgriConversionStatus: Dispatch<SetStateAction<string>>;
  setFarmhouseAvailable: Dispatch<SetStateAction<string>>;
  setFencingDone: Dispatch<SetStateAction<string>>;
  setCrops: Dispatch<SetStateAction<string[]>>;
}

export interface UseAgriFieldsResult {
  values: AgriFieldValues;
  setters: AgriFieldSetters;
  hydrate: (listing: ListingResponse) => void;
}

export function useAgriFields(): UseAgriFieldsResult {
  const [waterSource, setWaterSource] = useState('');
  const [soilType, setSoilType] = useState('');
  const [roadAccess, setRoadAccess] = useState('');
  const [cultivationStatus, setCultivationStatus] = useState('');
  const [surveyNumber, setSurveyNumber] = useState('');
  // Issue #1458 — new structured agri fields
  const [landCategory, setLandCategory] = useState('');
  // #2043 — declared conversion status; agricultural_land-only, not verified
  const [agriConversionStatus, setAgriConversionStatus] = useState('');
  // '' = not specified; 'true'/'false' for Select binding
  const [farmhouseAvailable, setFarmhouseAvailable] = useState('');
  const [fencingDone, setFencingDone] = useState('');
  // Issue #2044 — canonical machine-value crop codes (AC8 edit hydration).
  const [crops, setCrops] = useState<string[]>([]);

  // Stable across renders — setState setters are stable, deps array is empty.
  const hydrate = useCallback((listing: ListingWithCrops) => {
    setWaterSource(listing.waterSource ?? '');
    setSoilType(listing.soilType ?? '');
    setRoadAccess(listing.roadAccess ?? '');
    setCultivationStatus(listing.cultivationStatus ?? '');
    setSurveyNumber(listing.surveyNumber ?? '');
    // Issue #1458 — pre-populate new structured agri fields
    setLandCategory(listing.landCategory ?? '');
    setAgriConversionStatus(listing.agriConversionStatus ?? '');
    setFarmhouseAvailable(
      listing.farmhouseAvailable === true ? 'true'
        : listing.farmhouseAvailable === false ? 'false'
        : '',
    );
    setFencingDone(
      listing.fencingDone === true ? 'true'
        : listing.fencingDone === false ? 'false'
        : '',
    );
    // Issue #2044 — crops populate only on single-listing detail responses
    // (never on list/batch payloads); absent/null hydrates to [] (honest-empty,
    // never fabricated).
    setCrops(listing.crops ?? []);
  }, []);

  return {
    values: {
      waterSource,
      soilType,
      roadAccess,
      cultivationStatus,
      surveyNumber,
      landCategory,
      agriConversionStatus,
      farmhouseAvailable,
      fencingDone,
      crops,
    },
    setters: {
      setWaterSource,
      setSoilType,
      setRoadAccess,
      setCultivationStatus,
      setSurveyNumber,
      setLandCategory,
      setAgriConversionStatus,
      setFarmhouseAvailable,
      setFencingDone,
      setCrops,
    },
    hydrate,
  };
}
