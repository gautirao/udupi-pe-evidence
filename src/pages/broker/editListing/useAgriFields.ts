import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';

// Issue #1838 slice-5a — pure state-ownership extraction of the 8 agri-only
// fields from EditListingForm. No behaviour change: same useState('') defaults,
// same prefill assignments (verbatim from the removed prefill effect lines).

export interface AgriFieldValues {
  waterSource: string;
  soilType: string;
  roadAccess: string;
  cultivationStatus: string;
  surveyNumber: string;
  landCategory: string;
  farmhouseAvailable: string;
  fencingDone: string;
}

export interface AgriFieldSetters {
  setWaterSource: Dispatch<SetStateAction<string>>;
  setSoilType: Dispatch<SetStateAction<string>>;
  setRoadAccess: Dispatch<SetStateAction<string>>;
  setCultivationStatus: Dispatch<SetStateAction<string>>;
  setSurveyNumber: Dispatch<SetStateAction<string>>;
  setLandCategory: Dispatch<SetStateAction<string>>;
  setFarmhouseAvailable: Dispatch<SetStateAction<string>>;
  setFencingDone: Dispatch<SetStateAction<string>>;
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
  // '' = not specified; 'true'/'false' for Select binding
  const [farmhouseAvailable, setFarmhouseAvailable] = useState('');
  const [fencingDone, setFencingDone] = useState('');

  // Stable across renders — setState setters are stable, deps array is empty.
  const hydrate = useCallback((listing: ListingResponse) => {
    setWaterSource(listing.waterSource ?? '');
    setSoilType(listing.soilType ?? '');
    setRoadAccess(listing.roadAccess ?? '');
    setCultivationStatus(listing.cultivationStatus ?? '');
    setSurveyNumber(listing.surveyNumber ?? '');
    // Issue #1458 — pre-populate new structured agri fields
    setLandCategory(listing.landCategory ?? '');
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
  }, []);

  return {
    values: {
      waterSource,
      soilType,
      roadAccess,
      cultivationStatus,
      surveyNumber,
      landCategory,
      farmhouseAvailable,
      fencingDone,
    },
    setters: {
      setWaterSource,
      setSoilType,
      setRoadAccess,
      setCultivationStatus,
      setSurveyNumber,
      setLandCategory,
      setFarmhouseAvailable,
      setFencingDone,
    },
    hydrate,
  };
}
