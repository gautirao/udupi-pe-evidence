import { useState } from 'react';
import { isListingFieldVisible, type ListingFieldKey } from '@/lib/listingFieldConfig';

export type AgriculturalPropertyType = 'agricultural_land';

/**
 * #2398 — single owner of the typed agricultural form field state and its
 * sale-only field visibility. Mirrors useResidentialListingFormState (#2387)
 * / useCommercialListingFormState (#2388), but derives its own (much
 * smaller) field set from agricultural's own current behaviour — no
 * subtype/purpose model, no draft-recovery hydration (issue #2398 guardrail:
 * "Do not add URL draft recovery unless current product behaviour already
 * supports it" — the current AgriculturalListingForm has none).
 *
 * Deliberately does NOT own `locality` in isolation from the location flow:
 * `locality` state lives here (it feeds buildPayload/checklist same as every
 * other field), but it is only ever SET via the composition root wiring
 * `setLocality` into useAgriculturalListingLocation's onPublicLoc callback —
 * same pattern as Residential/Commercial.
 */
export function useAgriculturalListingFormState() {
  const propertyType: AgriculturalPropertyType = 'agricultural_land';

  const [locality, setLocality] = useState('');
  const [title, setTitle] = useState('');

  // Area + price
  const [landArea, setLandArea] = useState<number | null>(null);
  const [landAreaUnit, setLandAreaUnit] = useState('acre');
  const [priceRupees, setPriceRupees] = useState<number | null>(null);

  // Agricultural land fields (all 9 in-scope + facing, all real write paths)
  const [facing, setFacing] = useState('');
  const [waterSource, setWaterSource] = useState('');
  const [soilType, setSoilType] = useState('');
  const [roadAccess, setRoadAccess] = useState('');
  const [cultivationStatus, setCultivationStatus] = useState('');
  const [landCategory, setLandCategory] = useState('');
  const [agriConversionStatus, setAgriConversionStatus] = useState('');
  const [ownershipType, setOwnershipType] = useState('');
  const [surveyNumber, setSurveyNumber] = useState('');
  const [farmhouseAvailable, setFarmhouseAvailable] = useState(''); // '' | 'true' | 'false'
  const [fencingDone, setFencingDone] = useState('');

  // FE-only fields — never sent to the backend (see AgriculturalListingForm.tsx class doc)
  const [rtc, setRtc] = useState('');
  const [crops, setCrops] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);

  const [description, setDescription] = useState('');

  const fieldVisible = (key: ListingFieldKey): boolean => isListingFieldVisible(key, propertyType, 'sale');

  return {
    propertyType,
    locality, setLocality,
    title, setTitle,
    landArea, setLandArea,
    landAreaUnit, setLandAreaUnit,
    priceRupees, setPriceRupees,
    facing, setFacing,
    waterSource, setWaterSource,
    soilType, setSoilType,
    roadAccess, setRoadAccess,
    cultivationStatus, setCultivationStatus,
    landCategory, setLandCategory,
    agriConversionStatus, setAgriConversionStatus,
    ownershipType, setOwnershipType,
    surveyNumber, setSurveyNumber,
    farmhouseAvailable, setFarmhouseAvailable,
    fencingDone, setFencingDone,
    rtc, setRtc,
    crops, setCrops,
    features, setFeatures,
    description, setDescription,
    fieldVisible,
  };
}

export type UseAgriculturalListingFormStateResult = ReturnType<typeof useAgriculturalListingFormState>;
