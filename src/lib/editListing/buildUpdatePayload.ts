// Issue #1838 (slice-3-payload-builder) — extracted verbatim from
// EditListing.tsx's handleStep1Save. Pure PUT-payload construction: no
// React/hooks, no setState/mutate/toast. Behaviour-preserving extraction —
// the returned object literal is character-for-character identical to the
// inline literal previously built in EditListing.tsx:486-582.
import { intOrUndef, floatOrUndef } from '@/lib/listing-utils';
import { triStateToBool } from '@/lib/editListing/valueMappers';
import { isListingFieldVisible } from '@/lib/listingFieldConfig';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import type { PropertyType } from '@/lib/listing-constants';
import type { UpdateListingRequest } from '@/hooks/useBrokerListings';

/**
 * All raw form values consumed by buildListingUpdatePayload. Fields are
 * NON-OPTIONAL so a dropped field surfaces as a compile error at the call
 * site — the compile-time safeguard for this extraction (see design doc).
 */
export interface ListingFormState {
  title: string;
  description: string;
  priceRupees: number | null;
  propertyType: PropertyType | '';
  locality: string;
  landArea: number | null;
  landAreaUnit: string;
  bedrooms: string;
  builtArea: number | null;
  builtAreaUnit: string;
  reraNumber: string;
  listingPurpose: 'sale' | 'rent';
  carpetArea: number | null;
  carpetAreaUnit: string;
  floorNumber: string;
  totalFloors: string;
  furnishingStatus: string;
  washrooms: string;
  parkingCount: string;
  roadFrontageFt: string;
  commercialUsage: string;
  numberOfUnits: string;
  monthlyRent: string;
  securityDepositMonths: string;
  lockInMonths: string;
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
  bathrooms: string;
  balconies: string;
  facing: string;
  availabilityTimeline: string;
  superBuiltArea: number | null;
  superBuiltAreaUnit: string;
  propertyAge: string;
  residentialWaterSource: string;
  parking2wCount: string;
  parking4wCount: string;
  roadWidthFt: string;
  plotDimensions: string;
  conversionStatus: string;
  khataNumber: string;
  propertyTaxPid: string;
  approvingAuthority: string;
  projectName: string;
  builderName: string;
  maintenancePaise: string;
  possessionStatus: string;
  maintenanceIncluded: string;
  priceNegotiable: string;
  rentNegotiable: string;
  petsAllowed: string;
  hasLift: string;
  hasPowerBackup: string;
  isGated: string;
  hasGarden: string;
  hasTerrace: string;
  hasCompound: string;
  hasServantRoom: string;
  isCornerPlot: string;
  hasBoundaryWall: string;
  isGatedLayout: string;
  hasWaterConnection: string;
  hasElectricityConnection: string;
  hasDrainage: string;
  amenities: string[];
  specialLocationViews: string[];
  preferredTenants: string[];
}

/** Render-visibility predicates the payload builder needs, mirrored from EditListing.tsx render scope. */
export interface UpdatePayloadCtx {
  isRent: boolean;
  showLandArea: boolean;
  showBuiltArea: boolean;
  fieldVisible: (key: ListingFieldKey) => boolean;
}

/**
 * Reproduces EditListing.tsx's render-scope predicates (~448-466) verbatim.
 */
export function makeUpdatePayloadCtx(
  propertyType: PropertyType | '',
  listingPurpose: string,
): UpdatePayloadCtx {
  const isRent = listingPurpose === 'rent';
  const showLandArea = propertyType === 'land' || propertyType === 'commercial_land'
    || propertyType === 'commercial_building' || propertyType === 'warehouse'
    || propertyType === 'agricultural_land'
    // M38-13A (#1626) — house/villa (optional plot area) + residential_plot (primary plot area)
    || propertyType === 'house' || propertyType === 'villa' || propertyType === 'residential_plot';
  const showBuiltArea = propertyType === 'apartment' || propertyType === 'house'
    || propertyType === 'commercial_building' || propertyType === 'warehouse'
    // M38-13A (#1626)
    || propertyType === 'villa';

  const fieldVisible = (key: ListingFieldKey): boolean =>
    propertyType !== '' && isListingFieldVisible(key, propertyType, listingPurpose as 'sale' | 'rent' | 'lease');

  return { isRent, showLandArea, showBuiltArea, fieldVisible };
}

/**
 * PURE construction of the Step-1 PUT payload. Byte-identical to the object
 * literal previously inlined in EditListing.tsx's handleStep1Save
 * (lines 486-582 pre-extraction).
 */
export function buildListingUpdatePayload(
  state: ListingFormState,
  ctx: UpdatePayloadCtx,
): UpdateListingRequest {
  const {
    title,
    description,
    priceRupees,
    propertyType,
    locality,
    landArea,
    landAreaUnit,
    bedrooms,
    builtArea,
    builtAreaUnit,
    reraNumber,
    listingPurpose,
    carpetArea,
    carpetAreaUnit,
    floorNumber,
    totalFloors,
    furnishingStatus,
    washrooms,
    parkingCount,
    roadFrontageFt,
    commercialUsage,
    numberOfUnits,
    monthlyRent,
    securityDepositMonths,
    lockInMonths,
    waterSource,
    soilType,
    roadAccess,
    cultivationStatus,
    ownershipType,
    surveyNumber,
    landCategory,
    agriConversionStatus,
    farmhouseAvailable,
    fencingDone,
    bathrooms,
    balconies,
    facing,
    availabilityTimeline,
    superBuiltArea,
    superBuiltAreaUnit,
    propertyAge,
    residentialWaterSource,
    parking2wCount,
    parking4wCount,
    roadWidthFt,
    plotDimensions,
    conversionStatus,
    khataNumber,
    propertyTaxPid,
    approvingAuthority,
    projectName,
    builderName,
    maintenancePaise,
    possessionStatus,
    maintenanceIncluded,
    priceNegotiable,
    rentNegotiable,
    petsAllowed,
    hasLift,
    hasPowerBackup,
    isGated,
    hasGarden,
    hasTerrace,
    hasCompound,
    hasServantRoom,
    isCornerPlot,
    hasBoundaryWall,
    isGatedLayout,
    hasWaterConnection,
    hasElectricityConnection,
    hasDrainage,
    amenities,
    specialLocationViews,
    preferredTenants,
  } = state;
  const { isRent, showLandArea, showBuiltArea, fieldVisible } = ctx;

  const bedroomsNum = bedrooms !== '' ? parseInt(bedrooms, 10) : undefined;
  const landAreaVal = landArea != null && landArea > 0 ? landArea : undefined;
  const builtAreaVal = builtArea != null && builtArea > 0 ? builtArea : undefined;
  const carpetAreaVal = carpetArea != null && carpetArea > 0 ? carpetArea : undefined;

  return {
    title: title.trim() || undefined,
    description: description.trim() || undefined,
    price: isRent ? undefined : (priceRupees ?? undefined),
    propertyType: propertyType || undefined,
    locality: locality.trim() || undefined,
    landArea: landAreaVal,
    landAreaUnit: showLandArea && landAreaVal !== undefined ? landAreaUnit : undefined,
    // M38-13A (#1626) code-review follow-up: bedrooms and every field through
    // fencingDone below are PRE-EXISTING type-scoped fields (see listingFieldConfig
    // CONFIG_MAP) and must be gated the same way as the new M38-13A fields further
    // down — otherwise a mid-edit PropertyTypeCardSelector switch (e.g.
    // house→residential_plot, house→commercial) resends a stale prior-type value the
    // backend's validateFamilyFields/validateResidentialFieldSet rejects with 400.
    bedrooms: fieldVisible('bedrooms') ? bedroomsNum : undefined,
    builtArea: builtAreaVal,
    builtAreaUnit: showBuiltArea && builtAreaVal !== undefined ? builtAreaUnit : undefined,
    reraNumber: (propertyType === 'apartment' || propertyType === 'house' || propertyType === 'villa'
      || propertyType === 'residential_plot')
      ? (reraNumber.trim() || null)
      : undefined,
    listingPurpose,
    carpetArea: carpetAreaVal,
    carpetAreaUnit: carpetAreaVal !== undefined ? carpetAreaUnit : undefined,
    floorNumber: fieldVisible('floorNumber') ? intOrUndef(floorNumber) : undefined,
    totalFloors: fieldVisible('totalFloors') ? intOrUndef(totalFloors) : undefined,
    furnishingStatus: fieldVisible('furnishingStatus') ? (furnishingStatus || undefined) : undefined,
    washrooms: fieldVisible('washrooms') ? intOrUndef(washrooms) : undefined,
    parkingCount: fieldVisible('parkingCount') ? intOrUndef(parkingCount) : undefined,
    roadFrontageFt: fieldVisible('roadFrontageFt') ? floatOrUndef(roadFrontageFt) : undefined,
    commercialUsage: fieldVisible('commercialUsage') ? (commercialUsage.trim() || undefined) : undefined,
    numberOfUnits: fieldVisible('numberOfUnits') ? intOrUndef(numberOfUnits) : undefined,
    monthlyRent: isRent ? intOrUndef(monthlyRent) : undefined,
    securityDepositMonths: isRent ? intOrUndef(securityDepositMonths) : undefined,
    lockInMonths: isRent ? intOrUndef(lockInMonths) : undefined,
    waterSource: fieldVisible('waterSource') ? (waterSource.trim() || undefined) : undefined,
    soilType: fieldVisible('soilType') ? (soilType.trim() || undefined) : undefined,
    roadAccess: fieldVisible('roadAccess') ? (roadAccess.trim() || undefined) : undefined,
    cultivationStatus: fieldVisible('cultivationStatus') ? (cultivationStatus.trim() || undefined) : undefined,
    ownershipType: fieldVisible('ownershipType') ? (ownershipType.trim() || undefined) : undefined,
    surveyNumber: fieldVisible('surveyNumber') ? (surveyNumber.trim() || undefined) : undefined,
    // Issue #1458 — new structured agri fields
    landCategory: fieldVisible('landCategory') ? (landCategory || undefined) : undefined,
    agriConversionStatus: fieldVisible('agriConversionStatus') ? (agriConversionStatus || undefined) : undefined,
    farmhouseAvailable: fieldVisible('farmhouseAvailable')
      ? (farmhouseAvailable === 'true' ? true : farmhouseAvailable === 'false' ? false : undefined)
      : undefined,
    fencingDone: fieldVisible('fencingDone')
      ? (fencingDone === 'true' ? true : fencingDone === 'false' ? false : undefined)
      : undefined,
    // M38-13A (#1626) — residential typed-listing fields.
    // Every type-scoped field is gated behind fieldVisible('...') — the SAME predicate
    // that governs rendering — so that switching PropertyTypeCardSelector mid-edit
    // (e.g. house→apartment) never sends a stale prior-type value the backend's
    // validateResidentialFieldSet/validateFamilyFields would reject with 400. Code
    // review fix (post #1626 REQUEST_CHANGES): these were previously sent unconditionally.
    bathrooms: fieldVisible('bathrooms') ? intOrUndef(bathrooms) : undefined,
    balconies: fieldVisible('balconies') ? intOrUndef(balconies) : undefined,
    facing: fieldVisible('facing') ? (facing || undefined) : undefined,
    availabilityTimeline: fieldVisible('availabilityTimeline') ? (availabilityTimeline || undefined) : undefined,
    superBuiltArea: fieldVisible('superBuiltArea') ? floatOrUndef(String(superBuiltArea ?? '')) : undefined,
    superBuiltAreaUnit: fieldVisible('superBuiltArea') && superBuiltArea != null ? superBuiltAreaUnit : undefined,
    propertyAge: fieldVisible('propertyAge') ? (propertyAge || undefined) : undefined,
    residentialWaterSource: fieldVisible('residentialWaterSource') ? (residentialWaterSource || undefined) : undefined,
    parking2wCount: fieldVisible('parking2wCount') ? intOrUndef(parking2wCount) : undefined,
    parking4wCount: fieldVisible('parking4wCount') ? intOrUndef(parking4wCount) : undefined,
    roadWidthFt: fieldVisible('roadWidthFt') ? floatOrUndef(roadWidthFt) : undefined,
    plotDimensions: fieldVisible('plotDimensions') ? (plotDimensions.trim() || undefined) : undefined,
    conversionStatus: fieldVisible('conversionStatus') ? (conversionStatus || undefined) : undefined,
    khataNumber: fieldVisible('khataNumber') ? (khataNumber.trim() || undefined) : undefined,
    propertyTaxPid: fieldVisible('propertyTaxPid') ? (propertyTaxPid.trim() || undefined) : undefined,
    approvingAuthority: fieldVisible('approvingAuthority') ? (approvingAuthority.trim() || undefined) : undefined,
    projectName: fieldVisible('projectName') ? (projectName.trim() || undefined) : undefined,
    builderName: fieldVisible('builderName') ? (builderName.trim() || undefined) : undefined,
    maintenancePaise: fieldVisible('maintenancePaise') ? intOrUndef(maintenancePaise) : undefined,
    possessionStatus: fieldVisible('possessionStatus') ? (possessionStatus || undefined) : undefined,
    maintenanceIncluded: fieldVisible('maintenanceIncluded') ? triStateToBool(maintenanceIncluded) : undefined,
    priceNegotiable: fieldVisible('priceNegotiable') ? triStateToBool(priceNegotiable) : undefined,
    rentNegotiable: fieldVisible('rentNegotiable') ? triStateToBool(rentNegotiable) : undefined,
    petsAllowed: fieldVisible('petsAllowed') ? triStateToBool(petsAllowed) : undefined,
    hasLift: fieldVisible('hasLift') ? triStateToBool(hasLift) : undefined,
    hasPowerBackup: fieldVisible('hasPowerBackup') ? triStateToBool(hasPowerBackup) : undefined,
    isGated: fieldVisible('isGated') ? triStateToBool(isGated) : undefined,
    hasGarden: fieldVisible('hasGarden') ? triStateToBool(hasGarden) : undefined,
    hasTerrace: fieldVisible('hasTerrace') ? triStateToBool(hasTerrace) : undefined,
    hasCompound: fieldVisible('hasCompound') ? triStateToBool(hasCompound) : undefined,
    hasServantRoom: fieldVisible('hasServantRoom') ? triStateToBool(hasServantRoom) : undefined,
    isCornerPlot: fieldVisible('isCornerPlot') ? triStateToBool(isCornerPlot) : undefined,
    hasBoundaryWall: fieldVisible('hasBoundaryWall') ? triStateToBool(hasBoundaryWall) : undefined,
    isGatedLayout: fieldVisible('isGatedLayout') ? triStateToBool(isGatedLayout) : undefined,
    hasWaterConnection: fieldVisible('hasWaterConnection') ? triStateToBool(hasWaterConnection) : undefined,
    hasElectricityConnection: fieldVisible('hasElectricityConnection') ? triStateToBool(hasElectricityConnection) : undefined,
    hasDrainage: fieldVisible('hasDrainage') ? triStateToBool(hasDrainage) : undefined,
    // Multi-selects send the FINAL desired set (not a delta) — omitted when empty
    // so a type with no applicable section doesn't wipe unrelated child rows.
    // Also gated on fieldVisible so switching away from a type doesn't resend a
    // stale prior-type selection the backend would reject.
    amenities: fieldVisible('amenities') && amenities.length > 0 ? amenities : undefined,
    specialLocationViews: fieldVisible('specialLocationViews') && specialLocationViews.length > 0 ? specialLocationViews : undefined,
    preferredTenants: fieldVisible('preferredTenants') && preferredTenants.length > 0 ? preferredTenants : undefined,
  };
}
