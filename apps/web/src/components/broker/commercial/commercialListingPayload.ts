import type { BuyerPreviewSpecChip } from '@/components/broker/BuyerPreviewCard';
import type { ListingStrengthChecklist } from '@/components/broker/ListingStrengthMeter';
import type { ListingStrengthResult, ListingStrengthGate } from '@/lib/listingStrength';
import type { ListingFieldKey, CommercialSubtype } from '@/lib/listingFieldConfig';
import type { CommercialDescriptionFacts } from '@/components/broker/commercial/commercialDescriptionBuilder';
import { intOrUndef, floatOrUndef } from '@/lib/listing-utils';
import { COMMERCIAL_FLOOR_CHOICE_OPTIONS, COMMERCIAL_FURNISHING_STATUS_OPTIONS } from '@/lib/listing-constants';
import type { CommercialPropertyType, ExplicitSubtype, CommercialPurpose } from './commercialListingTypes';

export interface CommercialPayloadInputs {
  propertyType: CommercialPropertyType;
  title: string;
  locality: string;
  priceRupees: number | null;
  description: string;
  listingPurpose: CommercialPurpose;
  landArea: number | null;
  landAreaUnit: string;
  builtArea: number | null;
  builtAreaUnit: string;
  monthlyRent: string;
  securityDepositMonths: string;
  lockInMonths: string;
  explicitSubtype: ExplicitSubtype;
  floorChoice: string;
  hubType: string;
  floorMode: string;
  powerLoadKva: string;
  occupancyStatus: string;
  officeSeats: string;
  officeCabins: string;
  officeMeetingRooms: string;
  warehouseClearHeightFt: string;
  warehouseLoadingBays: string;
  warehouseTruckAccess: boolean | null;
  warehouseFlooring: string;
  commercialZoning: string;
  commercialOwnership: string;
  commercialApprovalsText: string;
  washroomsPublic: string;
  washroomsPrivate: string;
  parkingPublicCount: string;
  parkingPrivateCount: string;
  commercialFurnishingStatus: string;
  utilities: string[];
  suitableUses: string[];
  commercialAvailability: string;
  commercialAreaUnit: string;
  expectedRentalYieldPct: string;
  currentMonthlyIncomePaise: string;
  leaseTermMonths: string;
  leaseEscalationPct: string;
  isLand: boolean;
  isRentOrLease: boolean;
  fieldVisible: (key: ListingFieldKey) => boolean;
}

/**
 * #2388 — single owner of commercial create/update payload construction.
 * Pure/testable: given a form-state snapshot, returns exactly the payload
 * CommercialListingForm previously built inline. Every field is gated by
 * fieldVisible() so the payload never sends a field the server's
 * validateCommercialFields would 400 on.
 *
 * #2348 — propertyType/listingPurpose (unlike ~30 other fields below) are
 * sent unconditionally with no `?? undefined` fallback, so a PUT fired
 * before the draft finished loading would silently overwrite these two on
 * the server with local defaults. Safe only because the isRecoveringDraft
 * fieldset/button guards in the composition root make that PUT unreachable
 * while a URL-seeded draft is still resolving — do not remove those guards.
 */
export type CommercialListingPayload = ReturnType<typeof buildCommercialListingPayload>;

export function buildCommercialListingPayload(inputs: CommercialPayloadInputs) {
  const { isLand, isRentOrLease, fieldVisible } = inputs;
  return {
    propertyType: inputs.propertyType,
    title: inputs.title.trim() || undefined,
    locality: inputs.locality.trim() || undefined,
    price: isRentOrLease ? undefined : inputs.priceRupees ?? undefined,
    description: inputs.description.trim() || undefined,
    listingPurpose: inputs.listingPurpose,
    landArea: isLand && inputs.landArea != null && inputs.landArea > 0 ? inputs.landArea : undefined,
    landAreaUnit: isLand && inputs.landArea != null && inputs.landArea > 0 ? inputs.landAreaUnit : undefined,
    builtArea: !isLand && inputs.builtArea != null && inputs.builtArea > 0 ? inputs.builtArea : undefined,
    builtAreaUnit: !isLand && inputs.builtArea != null && inputs.builtArea > 0 ? inputs.builtAreaUnit : undefined,
    monthlyRent: isRentOrLease ? intOrUndef(inputs.monthlyRent) : undefined,
    securityDepositMonths: isRentOrLease ? intOrUndef(inputs.securityDepositMonths) : undefined,
    lockInMonths: isRentOrLease ? intOrUndef(inputs.lockInMonths) : undefined,
    // #1684 typed commercial fields
    commercialSubtype: fieldVisible('commercialSubtype') ? (inputs.explicitSubtype || undefined) : undefined,
    floorChoice: fieldVisible('floorChoice') ? (inputs.floorChoice || undefined) : undefined,
    hubType: fieldVisible('hubType') ? (inputs.hubType || undefined) : undefined,
    floorMode: fieldVisible('floorMode') ? (inputs.floorMode || undefined) : undefined,
    powerLoadKva: fieldVisible('powerLoadKva') ? floatOrUndef(inputs.powerLoadKva) : undefined,
    occupancyStatus: fieldVisible('occupancyStatus') ? (inputs.occupancyStatus || undefined) : undefined,
    officeSeats: fieldVisible('officeSeats') ? intOrUndef(inputs.officeSeats) : undefined,
    officeCabins: fieldVisible('officeCabins') ? intOrUndef(inputs.officeCabins) : undefined,
    officeMeetingRooms: fieldVisible('officeMeetingRooms') ? intOrUndef(inputs.officeMeetingRooms) : undefined,
    warehouseClearHeightFt: fieldVisible('warehouseClearHeightFt') ? floatOrUndef(inputs.warehouseClearHeightFt) : undefined,
    warehouseLoadingBays: fieldVisible('warehouseLoadingBays') ? intOrUndef(inputs.warehouseLoadingBays) : undefined,
    warehouseTruckAccess: fieldVisible('warehouseTruckAccess') ? inputs.warehouseTruckAccess ?? undefined : undefined,
    warehouseFlooring: fieldVisible('warehouseFlooring') ? (inputs.warehouseFlooring || undefined) : undefined,
    commercialZoning: fieldVisible('commercialZoning') ? (inputs.commercialZoning.trim() || undefined) : undefined,
    commercialOwnership: fieldVisible('commercialOwnership') ? (inputs.commercialOwnership || undefined) : undefined,
    // #1730 backend contract: commercialApprovals is a single free-text String
    // (same shape as commercialZoning/commercialOwnership), NOT a string array.
    commercialApprovals: fieldVisible('commercialApprovals') ? (inputs.commercialApprovalsText.trim() || undefined) : undefined,
    washroomsPublic: fieldVisible('washroomsPublic') ? intOrUndef(inputs.washroomsPublic) : undefined,
    washroomsPrivate: fieldVisible('washroomsPrivate') ? intOrUndef(inputs.washroomsPrivate) : undefined,
    parkingPublicCount: fieldVisible('parkingPublicCount') ? intOrUndef(inputs.parkingPublicCount) : undefined,
    parkingPrivateCount: fieldVisible('parkingPrivateCount') ? intOrUndef(inputs.parkingPrivateCount) : undefined,
    commercialFurnishingStatus: fieldVisible('commercialFurnishingStatus') ? (inputs.commercialFurnishingStatus || undefined) : undefined,
    utilities: fieldVisible('utilities') && inputs.utilities.length > 0 ? inputs.utilities : undefined,
    suitableUses: fieldVisible('suitableUses') && inputs.suitableUses.length > 0 ? inputs.suitableUses : undefined,
    commercialAvailability: fieldVisible('commercialAvailability') ? (inputs.commercialAvailability || undefined) : undefined,
    commercialAreaUnit: fieldVisible('commercialAreaUnit') ? (inputs.commercialAreaUnit || undefined) : undefined,
    expectedRentalYieldPct: fieldVisible('expectedRentalYieldPct') ? floatOrUndef(inputs.expectedRentalYieldPct) : undefined,
    currentMonthlyIncomePaise: fieldVisible('currentMonthlyIncomePaise') ? intOrUndef(inputs.currentMonthlyIncomePaise) : undefined,
    leaseTermMonths: fieldVisible('leaseTermMonths') ? intOrUndef(inputs.leaseTermMonths) : undefined,
    leaseEscalationPct: fieldVisible('leaseEscalationPct') ? floatOrUndef(inputs.leaseEscalationPct) : undefined,
  };
}

export interface CommercialChecklistInputs {
  subtypeResolved: boolean;
  locality: string;
  primaryAreaSqft: number | null;
  priceValid: boolean;
  title: string;
  commercialSubtype: CommercialSubtype | undefined;
  floorChoice: string;
  floorMode: string;
  warehouseFlooring: string;
  commercialZoning: string;
  imageCount: number;
  addressConfirmed: boolean;
  description: string;
}

/** #2388 — pure mapping for the lightweight ListingStrengthMeter checklist. */
export function computeCommercialChecklist(inputs: CommercialChecklistInputs): ListingStrengthChecklist {
  return {
    hasType: inputs.subtypeResolved,
    hasPurpose: true,
    hasLocality: inputs.locality.trim() !== '',
    hasArea: inputs.primaryAreaSqft != null && inputs.primaryAreaSqft > 0,
    hasPrice: inputs.priceValid,
    hasTitle: inputs.title.trim() !== '',
    hasConfigDetails:
      inputs.commercialSubtype === 'SHOP' || inputs.commercialSubtype === 'OFFICE' ? inputs.floorChoice !== ''
        : inputs.commercialSubtype === 'BUILDING' ? inputs.floorMode !== ''
          : inputs.commercialSubtype === 'WAREHOUSE' ? inputs.warehouseFlooring !== ''
            : inputs.commercialSubtype === 'LAND' ? inputs.commercialZoning.trim() !== ''
              : false,
    hasPhotos: inputs.imageCount > 0,
    isPinned: inputs.addressConfirmed,
    hasDescription: inputs.description.trim().length >= 20,
  };
}

export interface CommercialStrengthResultInputs {
  subtypeResolved: boolean;
  isRentOrLease: boolean;
  priceValid: boolean;
  locality: string;
  imageCount: number;
  locationResolved: boolean;
  addressConfirmed: boolean;
  commercialSubtype: CommercialSubtype | undefined;
  builtArea: number | null;
  builtAreaUnit: string;
  floorChoice: string;
  floorMode: string;
  landArea: number | null;
  landAreaUnit: string;
}

/**
 * #2388 — single owner of the real submit-gate strength (isSubmittable,
 * percent, gates, missingItems). LOCAL to the commercial form (not
 * listingStrength.ts, which is typed strictly to the 4 residential property
 * types).
 *
 * #2341 — per-subtype required-field gate, byte-for-byte mirroring
 * ListingTransitionPolicy.validateFields()'s commercial/commercial_building/
 * warehouse/commercial_land cases. See listingFieldConfig.ts's
 * commercialSubtype switch for why floorChoice/floorMode are the real
 * persisted fields here.
 */
export function computeCommercialStrengthResult(inputs: CommercialStrengthResultInputs): ListingStrengthResult {
  const priceOk = inputs.priceValid;
  const imagesOk = inputs.imageCount >= 3;
  const locationEnteredOk = inputs.locationResolved || inputs.addressConfirmed;
  const pinConfirmedOk = inputs.addressConfirmed;
  const localityOk = inputs.locality.trim() !== '';

  const typeSpecificOk =
    inputs.commercialSubtype === 'SHOP' || inputs.commercialSubtype === 'OFFICE'
      ? inputs.builtArea != null && inputs.builtArea > 0 && inputs.builtAreaUnit !== '' && inputs.floorChoice !== ''
      : inputs.commercialSubtype === 'BUILDING'
        ? inputs.builtArea != null && inputs.builtArea > 0 && inputs.builtAreaUnit !== '' && inputs.floorMode !== ''
        : inputs.commercialSubtype === 'WAREHOUSE'
          ? inputs.builtArea != null && inputs.builtArea > 0
          : inputs.commercialSubtype === 'LAND'
            ? inputs.landArea != null && inputs.landArea > 0 && inputs.landAreaUnit !== ''
            : true;
  const typeSpecificLabel =
    inputs.commercialSubtype === 'SHOP' || inputs.commercialSubtype === 'OFFICE'
      ? 'Add the built area and floor'
      : inputs.commercialSubtype === 'BUILDING'
        ? 'Add the built area and floors available'
        : inputs.commercialSubtype === 'WAREHOUSE'
          ? 'Add the built area'
          : inputs.commercialSubtype === 'LAND'
            ? 'Add the land area'
            : '';

  const gates: ListingStrengthGate[] = [
    { key: 'type', label: 'Choose a commercial subtype', met: inputs.subtypeResolved },
    { key: 'price', label: inputs.isRentOrLease ? 'Add the monthly rent' : 'Add the total price', met: priceOk },
    { key: 'locality', label: 'Add the locality', met: localityOk },
    { key: 'images', label: `Add at least 3 photos (${Math.min(inputs.imageCount, 3)}/3)`, met: imagesOk },
    { key: 'locationEntered', label: 'Location entered', met: locationEnteredOk },
    { key: 'pinConfirmed', label: 'Map pin confirmed', met: pinConfirmedOk },
  ];
  if (inputs.subtypeResolved) {
    gates.push({ key: 'typeSpecific', label: typeSpecificLabel, met: typeSpecificOk });
  }
  const metCount = gates.filter((g) => g.met).length;

  return {
    isSubmittable: gates.every((g) => g.met),
    percent: Math.round((metCount / gates.length) * 100),
    gates,
    missingItems: gates.filter((g) => !g.met).map((g) => g.label),
  };
}

export interface CommercialDescriptionFactsInputs {
  commercialSubtype: CommercialSubtype | undefined;
  listingPurpose: CommercialPurpose;
  locality: string;
  primaryAreaSqft: number | null;
  isLand: boolean;
  landAreaUnit: string;
  builtAreaUnit: string;
  floorChoice: string;
  hubType: string;
  floorMode: string;
  officeSeats: string;
  officeCabins: string;
  officeMeetingRooms: string;
  warehouseClearHeightFt: string;
  warehouseFlooring: string;
  commercialZoning: string;
  commercialFurnishingStatus: string;
  suitableUses: string[];
  commercialAvailability: string;
  priceRupees: number | null;
  monthlyRent: string;
  leaseTermMonths: string;
}

export function computeCommercialDescriptionFacts(inputs: CommercialDescriptionFactsInputs): CommercialDescriptionFacts {
  return {
    commercialSubtype: inputs.commercialSubtype,
    listingPurpose: inputs.listingPurpose,
    locality: inputs.locality,
    primaryAreaSqft: inputs.primaryAreaSqft,
    areaUnit: inputs.isLand ? inputs.landAreaUnit : inputs.builtAreaUnit,
    floorChoice: inputs.floorChoice,
    hubType: inputs.hubType,
    floorMode: inputs.floorMode,
    officeSeats: inputs.officeSeats,
    officeCabins: inputs.officeCabins,
    officeMeetingRooms: inputs.officeMeetingRooms,
    warehouseClearHeightFt: inputs.warehouseClearHeightFt,
    warehouseFlooring: inputs.warehouseFlooring,
    commercialZoning: inputs.commercialZoning,
    commercialFurnishingStatus: inputs.commercialFurnishingStatus,
    suitableUses: inputs.suitableUses,
    commercialAvailability: inputs.commercialAvailability,
    priceRupees: inputs.priceRupees,
    monthlyRent: intOrUndef(inputs.monthlyRent) ?? null,
    leaseTermMonths: inputs.leaseTermMonths,
  };
}

export interface CommercialSpecChipsInputs {
  fieldVisible: (key: ListingFieldKey) => boolean;
  primaryAreaSqft: number | null;
  isLand: boolean;
  landAreaUnit: string;
  builtAreaUnit: string;
  floorChoice: string;
  commercialFurnishingStatus: string;
}

export function computeCommercialSpecChips(inputs: CommercialSpecChipsInputs): BuyerPreviewSpecChip[] {
  const specChips: BuyerPreviewSpecChip[] = [];
  if (inputs.fieldVisible('commercialAreaUnit') && inputs.primaryAreaSqft) {
    specChips.push({ label: `${inputs.primaryAreaSqft} ${inputs.isLand ? inputs.landAreaUnit : inputs.builtAreaUnit}` });
  }
  if (inputs.fieldVisible('floorChoice') && inputs.floorChoice) {
    const opt = COMMERCIAL_FLOOR_CHOICE_OPTIONS.find((o) => o.value === inputs.floorChoice);
    if (opt) specChips.push({ label: opt.label });
  }
  if (inputs.fieldVisible('commercialFurnishingStatus') && inputs.commercialFurnishingStatus) {
    const opt = COMMERCIAL_FURNISHING_STATUS_OPTIONS.find((o) => o.value === inputs.commercialFurnishingStatus);
    if (opt) specChips.push({ label: opt.label });
  }
  return specChips;
}
