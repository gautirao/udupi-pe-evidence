import type { BuyerPreviewSpecChip } from '@/components/broker/BuyerPreviewCard';
import type { ListingStrengthChecklist } from '@/components/broker/ListingStrengthMeter';
import type { ListingStrengthResult, ListingStrengthGate } from '@/lib/listingStrength';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import type { AgriculturalDescriptionFacts } from '@/lib/agriculturalDescriptionBuilder';
import { FACING_OPTIONS } from '@/lib/listing-constants';
import type { AgriculturalPropertyType } from './useAgriculturalListingFormState';

/**
 * #2398 — single owner of agricultural create/update payload construction,
 * the lightweight (pre-draft) checklist, the real submit-gate strength
 * mapping, description-facts assembly, and buyer-preview spec chips. Pure/
 * testable: given a form-state snapshot, returns exactly what
 * AgriculturalListingForm previously built inline. Mirrors
 * residentialListingPayload.ts (#2387) / commercialListingPayload.ts
 * (#2388).
 *
 * HONESTY (issue #2398 guardrail, carried over from #2044) — `crops` IS
 * persisted (canonical machine values); `features` and `rtc` remain FE-only
 * and are DELIBERATELY OMITTED from the payload (no backend write path).
 * Do not add them here without a corresponding backend contract change.
 */
export interface AgriculturalPayloadInputs {
  propertyType: AgriculturalPropertyType;
  title: string;
  locality: string;
  priceRupees: number | null;
  description: string;
  landArea: number | null;
  landAreaUnit: string;
  facing: string;
  waterSource: string;
  soilType: string;
  roadAccess: string;
  cultivationStatus: string;
  ownershipType: string;
  surveyNumber: string;
  landCategory: string;
  agriConversionStatus: string;
  farmhouseAvailable: string;
  fencingDone: string;
  crops: string[];
  fieldVisible: (key: ListingFieldKey) => boolean;
}

export type AgriculturalListingPayload = ReturnType<typeof buildAgriculturalListingPayload>;

export function buildAgriculturalListingPayload(inputs: AgriculturalPayloadInputs) {
  const { fieldVisible } = inputs;
  return {
    propertyType: inputs.propertyType,
    title: inputs.title.trim() || undefined,
    locality: inputs.locality.trim() || undefined,
    price: inputs.priceRupees ?? undefined,
    description: inputs.description.trim() || undefined,
    listingPurpose: 'sale' as const,
    landArea: inputs.landArea != null && inputs.landArea > 0 ? inputs.landArea : undefined,
    landAreaUnit: inputs.landArea != null && inputs.landArea > 0 ? inputs.landAreaUnit : undefined,
    facing: fieldVisible('facing') ? (inputs.facing || undefined) : undefined,
    waterSource: inputs.waterSource || undefined,
    soilType: inputs.soilType || undefined,
    roadAccess: inputs.roadAccess || undefined,
    cultivationStatus: inputs.cultivationStatus || undefined,
    ownershipType: inputs.ownershipType || undefined,
    surveyNumber: inputs.surveyNumber.trim() || undefined,
    landCategory: inputs.landCategory || undefined,
    agriConversionStatus: fieldVisible('agriConversionStatus') ? (inputs.agriConversionStatus || undefined) : undefined,
    farmhouseAvailable: inputs.farmhouseAvailable === 'true' ? true : inputs.farmhouseAvailable === 'false' ? false : undefined,
    fencingDone: inputs.fencingDone === 'true' ? true : inputs.fencingDone === 'false' ? false : undefined,
    // Issue #2044 — crops ARE persisted (canonical machine values). Always sent
    // as the full current set (not a delta) so removing a crop clears it too.
    crops: inputs.crops,
    // NOTE: rtc/features are DELIBERATELY OMITTED — no backend write path
    // exists for them yet (see AgriculturalListingForm.tsx class doc). They
    // are folded into `description` only.
  };
}

export interface AgriculturalChecklistInputs {
  locality: string;
  landArea: number | null;
  priceValid: boolean;
  title: string;
  waterSource: string;
  soilType: string;
  imageCount: number;
  addressConfirmed: boolean;
  description: string;
}

/** #2398 — pure mapping for the lightweight (pre-draft) ListingStrengthMeter checklist. */
export function computeAgriculturalChecklist(inputs: AgriculturalChecklistInputs): ListingStrengthChecklist {
  return {
    hasType: true,
    hasPurpose: true,
    hasLocality: inputs.locality.trim() !== '',
    hasArea: inputs.landArea != null && inputs.landArea > 0,
    hasPrice: inputs.priceValid,
    hasTitle: inputs.title.trim() !== '',
    hasConfigDetails: inputs.waterSource !== '' || inputs.soilType !== '',
    hasPhotos: inputs.imageCount > 0,
    isPinned: inputs.addressConfirmed,
    hasDescription: inputs.description.trim().length >= 20,
  };
}

export interface AgriculturalStrengthInputs {
  priceValid: boolean;
  locality: string;
  landArea: number | null;
  landAreaUnit: string;
  imageCount: number;
  locationEntered: boolean;
  addressConfirmed: boolean;
}

/**
 * #2398 — single owner of the real submit-gate strength mapping. Mirrors
 * ListingTransitionPolicy.validateFields' agricultural_land case EXACTLY:
 * price>0, locality, addressConfirmed, >=3 images, landArea + landAreaUnit.
 * LOCAL to agricultural (listingStrength.ts's computeListingStrength() is
 * typed strictly to the 4 residential property types, so this hook computes
 * the ListingStrengthResult directly rather than delegating to it — same as
 * the pre-decomposition inline logic).
 */
export function computeAgriculturalStrengthResult(inputs: AgriculturalStrengthInputs): ListingStrengthResult {
  const priceOk = inputs.priceValid;
  const imagesOk = inputs.imageCount >= 3;
  const locationEnteredOk = inputs.locationEntered || inputs.addressConfirmed;
  const pinConfirmedOk = inputs.addressConfirmed;
  const localityOk = inputs.locality.trim() !== '';
  const areaOk = inputs.landArea != null && inputs.landArea > 0 && inputs.landAreaUnit !== '';
  const gates: ListingStrengthGate[] = [
    { key: 'price', label: 'Add the total price', met: priceOk },
    { key: 'locality', label: 'Add the locality', met: localityOk },
    { key: 'area', label: 'Add the land area', met: areaOk },
    { key: 'images', label: `Add at least 3 photos (${Math.min(inputs.imageCount, 3)}/3)`, met: imagesOk },
    { key: 'locationEntered', label: 'Location entered', met: locationEnteredOk },
    { key: 'pinConfirmed', label: 'Map pin confirmed', met: pinConfirmedOk },
  ];
  const metCount = gates.filter((g) => g.met).length;
  return {
    isSubmittable: gates.every((g) => g.met),
    percent: Math.round((metCount / gates.length) * 100),
    gates,
    missingItems: gates.filter((g) => !g.met).map((g) => g.label),
  };
}

export interface AgriculturalDescriptionFactsInputs {
  locality: string;
  landArea: number | null;
  landAreaUnit: string;
  facing: string;
  waterSource: string;
  soilType: string;
  roadAccess: string;
  cultivationStatus: string;
  landCategory: string;
  farmhouseAvailable: string;
  fencingDone: string;
  crops: string[];
  features: string[];
  priceRupees: number | null;
}

export function computeAgriculturalDescriptionFacts(inputs: AgriculturalDescriptionFactsInputs): AgriculturalDescriptionFacts {
  return {
    locality: inputs.locality,
    landArea: inputs.landArea,
    landAreaUnit: inputs.landAreaUnit,
    facing: inputs.facing,
    waterSource: inputs.waterSource,
    soilType: inputs.soilType,
    roadAccess: inputs.roadAccess,
    cultivationStatus: inputs.cultivationStatus,
    landCategory: inputs.landCategory,
    farmhouseAvailable: inputs.farmhouseAvailable,
    fencingDone: inputs.fencingDone,
    crops: inputs.crops,
    features: inputs.features,
    priceRupees: inputs.priceRupees,
  };
}

export interface AgriculturalSpecChipsInputs {
  landArea: number | null;
  landAreaUnit: string;
  facing: string;
}

export function computeAgriculturalSpecChips(inputs: AgriculturalSpecChipsInputs): BuyerPreviewSpecChip[] {
  const specChips: BuyerPreviewSpecChip[] = [];
  if (inputs.landArea) specChips.push({ label: `${inputs.landArea} ${inputs.landAreaUnit}` });
  const facingLabel = FACING_OPTIONS.find((o) => o.value === inputs.facing)?.label;
  if (facingLabel) specChips.push({ label: `${facingLabel} facing` });
  return specChips;
}
