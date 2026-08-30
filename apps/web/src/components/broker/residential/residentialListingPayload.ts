import type { BuyerPreviewSpecChip } from '@/components/broker/BuyerPreviewCard';
import type { ListingStrengthChecklist } from '@/components/broker/ListingStrengthMeter';
import type { ListingStrengthInput } from '@/lib/listingStrength';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import type { DescriptionFacts } from '@/lib/listingDescriptionBuilder';
import { intOrUndef, floatOrUndef } from '@/lib/listing-utils';
import { triStateToBool, boolToTriState } from '@/components/broker/ChipGroup';
import { FURNISHING_OPTIONS } from '@/lib/listing-constants';
import type { ResidentialPropertyType } from './useResidentialListingFormState';

/**
 * #2387 — single owner of residential create/update payload construction.
 * Pure/testable: given a form-state snapshot, returns exactly the payload
 * ResidentialListingForm previously built inline.
 */
export interface ResidentialPayloadInputs {
  propertyType: ResidentialPropertyType;
  title: string;
  locality: string;
  priceRupees: number | null;
  description: string;
  listingPurpose: 'sale' | 'rent';
  isRent: boolean;
  isPlot: boolean;
  isHouseOrVilla: boolean;
  isApartment: boolean;
  landArea: number | null;
  landAreaUnit: string;
  builtArea: number | null;
  builtAreaUnit: string;
  carpetArea: number | null;
  carpetAreaUnit: string;
  bedrooms: string;
  bathrooms: string;
  balconies: string;
  furnishingStatus: string;
  facing: string;
  floorNumber: string;
  totalFloors: string;
  superBuiltArea: string;
  propertyAge: string;
  residentialWaterSource: string;
  parking2wCount: string;
  parking4wCount: string;
  isGated: boolean | null;
  projectName: string;
  builderName: string;
  amenities: string[];
  specialLocationViews: string[];
  hasLift: boolean | null;
  hasPowerBackup: boolean | null;
  hasGarden: boolean | null;
  hasTerrace: boolean | null;
  hasCompound: boolean | null;
  hasServantRoom: boolean | null;
  plotDimensions: string;
  roadWidthFt: string;
  isCornerPlot: boolean | null;
  hasBoundaryWall: boolean | null;
  isGatedLayout: boolean | null;
  hasWaterConnection: boolean | null;
  hasElectricityConnection: boolean | null;
  hasDrainage: boolean | null;
  priceNegotiable: boolean | null;
  maintenancePaise: string;
  possessionStatus: string;
  monthlyRent: string;
  securityDepositMonths: string;
  lockInMonths: string;
  maintenanceIncluded: boolean | null;
  rentNegotiable: boolean | null;
  petsAllowed: boolean | null;
  availabilityTimeline: string;
  preferredTenants: string[];
  ownershipType: string;
  conversionStatus: string;
  khataNumber: string;
  propertyTaxPid: string;
  approvingAuthority: string;
  surveyNumber: string;
  fieldVisible: (key: ListingFieldKey) => boolean;
}

export type ResidentialListingPayload = ReturnType<typeof buildResidentialListingPayload>;

export function buildResidentialListingPayload(inputs: ResidentialPayloadInputs) {
  const { isRent, isPlot, isHouseOrVilla, isApartment, fieldVisible } = inputs;
  return {
    propertyType: inputs.propertyType,
    title: inputs.title.trim() || undefined,
    locality: inputs.locality.trim() || undefined,
    price: isRent ? undefined : inputs.priceRupees ?? undefined,
    description: inputs.description.trim() || undefined,
    listingPurpose: inputs.listingPurpose,
    landArea: isPlot && inputs.landArea != null && inputs.landArea > 0 ? inputs.landArea : undefined,
    landAreaUnit: isPlot && inputs.landArea != null && inputs.landArea > 0 ? inputs.landAreaUnit : undefined,
    // Issue #2040 — apartment also collects builtArea in Section 3 (Property
    // details, next to its primary carpetArea) — the backend submit gate
    // requires it (ListingTransitionPolicy.validateFields() case "apartment").
    // Payload gating below is keyed on (isHouseOrVilla || isApartment)
    // independent of section placement — do not drop the isApartment arm.
    builtArea: (isHouseOrVilla || isApartment) && inputs.builtArea != null && inputs.builtArea > 0 ? inputs.builtArea : undefined,
    builtAreaUnit: (isHouseOrVilla || isApartment) && inputs.builtArea != null && inputs.builtArea > 0 ? inputs.builtAreaUnit : undefined,
    carpetArea: isApartment && inputs.carpetArea != null && inputs.carpetArea > 0 ? inputs.carpetArea : undefined,
    carpetAreaUnit: isApartment && inputs.carpetArea != null && inputs.carpetArea > 0 ? inputs.carpetAreaUnit : undefined,
    bedrooms: fieldVisible('bedrooms') ? intOrUndef(inputs.bedrooms) : undefined,
    bathrooms: fieldVisible('bathrooms') ? intOrUndef(inputs.bathrooms) : undefined,
    balconies: fieldVisible('balconies') ? intOrUndef(inputs.balconies) : undefined,
    furnishingStatus: fieldVisible('furnishingStatus') ? (inputs.furnishingStatus || undefined) : undefined,
    facing: fieldVisible('facing') ? (inputs.facing || undefined) : undefined,
    floorNumber: fieldVisible('floorNumber') ? intOrUndef(inputs.floorNumber) : undefined,
    totalFloors: fieldVisible('totalFloors') ? intOrUndef(inputs.totalFloors) : undefined,
    superBuiltArea: fieldVisible('superBuiltArea') ? floatOrUndef(inputs.superBuiltArea) : undefined,
    superBuiltAreaUnit: fieldVisible('superBuiltArea') && floatOrUndef(inputs.superBuiltArea) != null ? 'sqft' : undefined,
    propertyAge: fieldVisible('propertyAge') ? (inputs.propertyAge || undefined) : undefined,
    residentialWaterSource: fieldVisible('residentialWaterSource') ? (inputs.residentialWaterSource || undefined) : undefined,
    parking2wCount: fieldVisible('parking2wCount') ? intOrUndef(inputs.parking2wCount) : undefined,
    parking4wCount: fieldVisible('parking4wCount') ? intOrUndef(inputs.parking4wCount) : undefined,
    isGated: fieldVisible('isGated') ? triStateToBool(boolToTriState(inputs.isGated)) : undefined,
    projectName: fieldVisible('projectName') ? (inputs.projectName.trim() || undefined) : undefined,
    builderName: fieldVisible('builderName') ? (inputs.builderName.trim() || undefined) : undefined,
    amenities: fieldVisible('amenities') && inputs.amenities.length > 0 ? inputs.amenities : undefined,
    specialLocationViews: fieldVisible('specialLocationViews') && inputs.specialLocationViews.length > 0 ? inputs.specialLocationViews : undefined,
    hasLift: fieldVisible('hasLift') ? triStateToBool(boolToTriState(inputs.hasLift)) : undefined,
    hasPowerBackup: fieldVisible('hasPowerBackup') ? triStateToBool(boolToTriState(inputs.hasPowerBackup)) : undefined,
    hasGarden: fieldVisible('hasGarden') ? triStateToBool(boolToTriState(inputs.hasGarden)) : undefined,
    hasTerrace: fieldVisible('hasTerrace') ? triStateToBool(boolToTriState(inputs.hasTerrace)) : undefined,
    hasCompound: fieldVisible('hasCompound') ? triStateToBool(boolToTriState(inputs.hasCompound)) : undefined,
    hasServantRoom: fieldVisible('hasServantRoom') ? triStateToBool(boolToTriState(inputs.hasServantRoom)) : undefined,
    plotDimensions: fieldVisible('plotDimensions') ? (inputs.plotDimensions.trim() || undefined) : undefined,
    roadWidthFt: fieldVisible('roadWidthFt') ? floatOrUndef(inputs.roadWidthFt) : undefined,
    isCornerPlot: fieldVisible('isCornerPlot') ? triStateToBool(boolToTriState(inputs.isCornerPlot)) : undefined,
    hasBoundaryWall: fieldVisible('hasBoundaryWall') ? triStateToBool(boolToTriState(inputs.hasBoundaryWall)) : undefined,
    isGatedLayout: fieldVisible('isGatedLayout') ? triStateToBool(boolToTriState(inputs.isGatedLayout)) : undefined,
    hasWaterConnection: fieldVisible('hasWaterConnection') ? triStateToBool(boolToTriState(inputs.hasWaterConnection)) : undefined,
    hasElectricityConnection: fieldVisible('hasElectricityConnection') ? triStateToBool(boolToTriState(inputs.hasElectricityConnection)) : undefined,
    hasDrainage: fieldVisible('hasDrainage') ? triStateToBool(boolToTriState(inputs.hasDrainage)) : undefined,
    priceNegotiable: fieldVisible('priceNegotiable') ? triStateToBool(boolToTriState(inputs.priceNegotiable)) : undefined,
    maintenancePaise: fieldVisible('maintenancePaise') ? intOrUndef(inputs.maintenancePaise) : undefined,
    possessionStatus: fieldVisible('possessionStatus') ? (inputs.possessionStatus || undefined) : undefined,
    monthlyRent: isRent ? intOrUndef(inputs.monthlyRent) : undefined,
    securityDepositMonths: isRent ? intOrUndef(inputs.securityDepositMonths) : undefined,
    lockInMonths: isRent ? intOrUndef(inputs.lockInMonths) : undefined,
    maintenanceIncluded: fieldVisible('maintenanceIncluded') ? triStateToBool(boolToTriState(inputs.maintenanceIncluded)) : undefined,
    rentNegotiable: fieldVisible('rentNegotiable') ? triStateToBool(boolToTriState(inputs.rentNegotiable)) : undefined,
    petsAllowed: fieldVisible('petsAllowed') ? triStateToBool(boolToTriState(inputs.petsAllowed)) : undefined,
    availabilityTimeline: fieldVisible('availabilityTimeline') ? (inputs.availabilityTimeline || undefined) : undefined,
    preferredTenants: fieldVisible('preferredTenants') && inputs.preferredTenants.length > 0 ? inputs.preferredTenants : undefined,
    ownershipType: fieldVisible('ownershipType') ? (inputs.ownershipType || undefined) : undefined,
    conversionStatus: fieldVisible('conversionStatus') ? (inputs.conversionStatus || undefined) : undefined,
    khataNumber: fieldVisible('khataNumber') ? (inputs.khataNumber.trim() || undefined) : undefined,
    propertyTaxPid: fieldVisible('propertyTaxPid') ? (inputs.propertyTaxPid.trim() || undefined) : undefined,
    approvingAuthority: fieldVisible('approvingAuthority') ? (inputs.approvingAuthority.trim() || undefined) : undefined,
    surveyNumber: fieldVisible('surveyNumber') ? (inputs.surveyNumber.trim() || undefined) : undefined,
  };
}

export interface ResidentialChecklistInputs {
  locality: string;
  primaryAreaSqft: number | null;
  priceValid: boolean;
  title: string;
  isPlot: boolean;
  plotDimensions: string;
  bedrooms: string;
  imageCount: number;
  addressConfirmed: boolean;
  description: string;
}

/** #2387 — pure mapping for the lightweight (pre-draft) ListingStrengthMeter checklist. */
export function computeResidentialChecklist(inputs: ResidentialChecklistInputs): ListingStrengthChecklist {
  return {
    // propertyType is always set in this component (one of the 4 residential values).
    hasType: true,
    // listingPurpose always defaults to 'sale' — this row is trivially satisfied
    // (kept in the checklist type for readability/parity with the design spec).
    hasPurpose: true,
    hasLocality: inputs.locality.trim() !== '',
    hasArea: inputs.primaryAreaSqft != null && inputs.primaryAreaSqft > 0,
    hasPrice: inputs.priceValid,
    hasTitle: inputs.title.trim() !== '',
    hasConfigDetails: inputs.isPlot ? inputs.plotDimensions.trim() !== '' : inputs.bedrooms !== '',
    hasPhotos: inputs.imageCount > 0,
    isPinned: inputs.addressConfirmed,
    hasDescription: inputs.description.trim().length >= 20,
  };
}

export interface ResidentialStrengthInputInputs {
  propertyType: ResidentialPropertyType;
  listingPurpose: 'sale' | 'rent';
  priceRupees: number | null;
  monthlyRent: string;
  securityDepositMonths: string;
  locality: string;
  imageCount: number;
  addressConfirmed: boolean;
  locationResolved: boolean;
  bedrooms: string;
  builtArea: number | null;
  builtAreaUnit: string;
  landArea: number | null;
  landAreaUnit: string;
}

/**
 * #2387 — single owner of the mapping into the real submit-gate strength
 * input. Mirrors ListingTransitionPolicy.validateFields() (see
 * src/lib/listingStrength.ts, which computeListingStrength() delegates to
 * unchanged) — never re-implemented, only assembled here.
 */
export function buildResidentialStrengthInput(inputs: ResidentialStrengthInputInputs): ListingStrengthInput {
  return {
    propertyType: inputs.propertyType,
    listingPurpose: inputs.listingPurpose,
    priceRupees: inputs.priceRupees,
    monthlyRent: intOrUndef(inputs.monthlyRent) ?? null,
    securityDepositMonths: inputs.securityDepositMonths,
    locality: inputs.locality,
    imageCount: inputs.imageCount,
    addressConfirmed: inputs.addressConfirmed,
    locationResolved: inputs.locationResolved,
    bedrooms: inputs.bedrooms,
    builtArea: inputs.builtArea,
    builtAreaUnit: inputs.builtAreaUnit,
    landArea: inputs.landArea,
    landAreaUnit: inputs.landAreaUnit,
  };
}

export interface ResidentialDescriptionFactsInputs {
  propertyType: ResidentialPropertyType;
  listingPurpose: 'sale' | 'rent';
  locality: string;
  projectName: string;
  bedrooms: string;
  bathrooms: string;
  primaryAreaSqft: number | null;
  furnishingStatus: string;
  facing: string;
  floorNumber: string;
  totalFloors: string;
  hasLift: boolean | null;
  hasPowerBackup: boolean | null;
  isGated: boolean | null;
  hasGarden: boolean | null;
  amenities: string[];
  possessionStatus: string;
  availabilityTimeline: string;
  priceRupees: number | null;
  monthlyRent: string;
  securityDepositMonths: string;
  priceNegotiable: boolean | null;
  roadWidthFt: string;
  plotDimensions: string;
}

export function computeResidentialDescriptionFacts(inputs: ResidentialDescriptionFactsInputs): DescriptionFacts {
  return {
    propertyType: inputs.propertyType,
    listingPurpose: inputs.listingPurpose,
    locality: inputs.locality,
    projectName: inputs.projectName,
    bedrooms: inputs.bedrooms,
    bathrooms: inputs.bathrooms,
    primaryAreaSqft: inputs.primaryAreaSqft,
    furnishingStatus: inputs.furnishingStatus,
    facing: inputs.facing,
    floorNumber: inputs.floorNumber,
    totalFloors: inputs.totalFloors,
    hasLift: inputs.hasLift,
    hasPowerBackup: inputs.hasPowerBackup,
    isGated: inputs.isGated,
    hasGarden: inputs.hasGarden,
    amenities: inputs.amenities,
    possessionStatus: inputs.possessionStatus,
    availabilityTimeline: inputs.availabilityTimeline,
    priceRupees: inputs.priceRupees,
    monthlyRent: intOrUndef(inputs.monthlyRent) ?? null,
    securityDepositMonths: inputs.securityDepositMonths,
    priceNegotiable: inputs.priceNegotiable,
    roadWidthFt: inputs.roadWidthFt,
    plotDimensions: inputs.plotDimensions,
  };
}

export interface ResidentialSpecChipsInputs {
  fieldVisible: (key: ListingFieldKey) => boolean;
  bedrooms: string;
  bathrooms: string;
  primaryAreaFieldKey: ListingFieldKey;
  primaryAreaSqft: number | null;
  furnishingStatus: string;
}

/**
 * #2387 — gates every chip by fieldVisible() for the CURRENT
 * propertyType/listingPurpose — bedrooms/bathrooms/furnishingStatus/area are
 * raw form state and are not reset on a mid-flow property-type switch (e.g.
 * Apartment -> Plot), so an ungated chip would keep showing a stale "3 BHK"
 * for a type that has no bedroom field. This enforces the honest-null
 * requirement: never fabricate a preview chip for a field the current
 * type/purpose doesn't collect.
 */
export function computeResidentialSpecChips(inputs: ResidentialSpecChipsInputs): BuyerPreviewSpecChip[] {
  const specChips: BuyerPreviewSpecChip[] = [];
  if (inputs.fieldVisible('bedrooms') && inputs.bedrooms) specChips.push({ label: `${inputs.bedrooms} BHK` });
  if (inputs.fieldVisible('bathrooms') && inputs.bathrooms) specChips.push({ label: `${inputs.bathrooms} Bath` });
  if (inputs.fieldVisible(inputs.primaryAreaFieldKey) && inputs.primaryAreaSqft) {
    specChips.push({ label: `${inputs.primaryAreaSqft} sqft` });
  }
  if (inputs.fieldVisible('furnishingStatus') && inputs.furnishingStatus) {
    const opt = FURNISHING_OPTIONS.find((o) => o.value === inputs.furnishingStatus);
    if (opt) specChips.push({ label: opt.label });
  }
  return specChips;
}
