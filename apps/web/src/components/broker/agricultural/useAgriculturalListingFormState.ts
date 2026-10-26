import { useState } from 'react';
import { isListingFieldVisible, type ListingFieldKey } from '@/lib/listingFieldConfig';
import type { ListingResponse } from '@/hooks/useBrokerListings';

export type AgriculturalPropertyType = 'agricultural_land';

/**
 * #2398 / #2811 — single owner of the typed agricultural form field state,
 * sale-only field visibility, and one-shot `hydrateFrom(listing)` draft
 * recovery. Mirrors useResidentialListingFormState (#2387) /
 * useCommercialListingFormState (#2388).
 *
 * Deliberately does NOT own `locality` in isolation from the location flow:
 * `locality` state lives here (it feeds buildPayload/checklist same as every
 * other field), and is set either by `useAgriculturalListingLocation`'s
 * `onPublicLoc` callback or one-shot by `hydrateFrom(listing)` during URL
 * draft recovery (#2811) — same pattern as Residential/Commercial.
 *
 * Honesty invariant (#1627 / #2044 / #2811): `rtc`, `crops`, and `features`
 * have no structured read-back column on `ListingResponse`, so `hydrateFrom`
 * restores only real server-persisted `ListingResponse` fields and never
 * fabricates structured persistence for UI-only state.
 */
export function useAgriculturalListingFormState() {
  const propertyType: AgriculturalPropertyType = 'agricultural_land';

  const [locality, setLocality] = useState('');
  const [title, setTitle] = useState('');

  // Area + price
  const [landArea, setLandArea] = useState<number | null>(null);
  const [landAreaUnit, setLandAreaUnit] = useState('acre');
  const [priceRupees, setPriceRupees] = useState<number | null>(null);
  // #2811 (mirrors #2843) — Separate one-shot hydration seed for <PriceField initialRupees>.
  // Passing live `priceRupees` into `initialRupees` would re-format the input on every
  // keystroke (`1.` -> `1`); updating this seed ONLY inside `hydrateFrom` lets PriceField
  // stay uncontrolled during typing while still syncing once when a URL-recovered draft loads,
  // and `handlePriceInput` clears the seed to `null` on the user's first price edit so a later
  // remount never overwrites user edits with a stale hydrated seed.
  const [priceHydrationSeed, setPriceHydrationSeed] = useState<number | null>(null);
  const handlePriceInput = (rupees: number | null) => {
    setPriceRupees(rupees);
    setPriceHydrationSeed(null);
  };

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

  /**
   * #2811 — one-shot hydration from a server-fetched `ListingResponse` when
   * the page mounts with `?draftId=<id>`. Mirrors Residential (#2053) and
   * Commercial (#2215/#2348). Only server-persisted `ListingResponse` fields
   * are restored; UI-only `rtc`, `crops`, and `features` have no structured
   * read-back columns on `ListingResponse` and are never fabricated here.
   */
  const hydrateFrom = (d: ListingResponse) => {
    if (d.title != null) setTitle(d.title);
    if (d.locality != null) setLocality(d.locality);
    if (d.description != null) setDescription(d.description);
    if (d.landArea != null) setLandArea(d.landArea);
    if (d.landAreaUnit != null && d.landAreaUnit !== '') setLandAreaUnit(d.landAreaUnit);
    if (d.price != null) {
      setPriceRupees(d.price);
      setPriceHydrationSeed(d.price);
    }
    if (d.facing != null) setFacing(d.facing);
    if (d.waterSource != null) setWaterSource(d.waterSource);
    if (d.soilType != null) setSoilType(d.soilType);
    if (d.roadAccess != null) setRoadAccess(d.roadAccess);
    if (d.cultivationStatus != null) setCultivationStatus(d.cultivationStatus);
    if (d.landCategory != null) setLandCategory(d.landCategory);
    if (d.agriConversionStatus != null) setAgriConversionStatus(d.agriConversionStatus);
    if (d.ownershipType != null) setOwnershipType(d.ownershipType);
    if (d.surveyNumber != null) setSurveyNumber(d.surveyNumber);
    if (d.farmhouseAvailable != null) setFarmhouseAvailable(String(d.farmhouseAvailable));
    if (d.fencingDone != null) setFencingDone(String(d.fencingDone));
  };

  return {
    propertyType,
    locality, setLocality,
    title, setTitle,
    landArea, setLandArea,
    landAreaUnit, setLandAreaUnit,
    priceRupees, setPriceRupees,
    priceHydrationSeed,
    handlePriceInput,
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
    hydrateFrom,
  };
}

export type UseAgriculturalListingFormStateResult = ReturnType<typeof useAgriculturalListingFormState>;
