import { useState } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import { isListingFieldVisible, type ListingFieldKey } from '@/lib/listingFieldConfig';
import { residentialSubtypeFromPropertyType } from '@/lib/demandPrefill';

export type ResidentialPropertyType = 'apartment' | 'house' | 'villa' | 'residential_plot';

/**
 * Issue #2039 — inverse of intOrUndef/floatOrUndef, for hydrating the form's
 * string-typed numeric inputs from a persisted ListingResponse's typed
 * number|null fields.
 */
function numToStr(n: number | null | undefined): string {
  return n != null ? String(n) : '';
}

export interface UseResidentialListingFormStateParams {
  initialPropertyType: ResidentialPropertyType;
  /** #1748 — optional demand-gap prefill; defaults to 'sale' when absent. */
  initialListingPurpose?: 'sale' | 'rent';
}

/**
 * #2387 — single owner of the typed residential form field state, its
 * subtype/purpose-derived visibility, and its one-shot hydration from a
 * persisted draft. Draft persistence/recovery orchestration (id, mode,
 * in-flight guards) lives in useResidentialListingDraft, which invokes
 * `hydrateFrom` exactly once when a URL-seeded draft settles. Mirrors
 * useCommercialListingFormState (#2388).
 *
 * Deliberately does NOT own `locality` in isolation from the location flow:
 * `locality` state lives here (it feeds buildPayload/checklist same as every
 * other field), but it is only ever SET via the composition root wiring
 * `setLocality` into useResidentialLocation's onPublicLoc callback — see
 * ResidentialListingForm.tsx and Issue #1722 correction #4. hydrateFrom below
 * deliberately does NOT touch it for the same reason as Commercial's
 * equivalent hook.
 */
export function useResidentialListingFormState({ initialPropertyType, initialListingPurpose }: UseResidentialListingFormStateParams) {
  const [propertyType, setPropertyType] = useState<ResidentialPropertyType>(initialPropertyType);
  const [listingPurpose, setListingPurpose] = useState<'sale' | 'rent'>(initialListingPurpose ?? 'sale');

  // Section 2 — Where is it?
  const [locality, setLocality] = useState('');
  const [projectName, setProjectName] = useState('');
  const [title, setTitle] = useState('');

  // Section 3 — Property details (primary area, per-type)
  const [carpetArea, setCarpetArea] = useState<number | null>(null);
  const [carpetAreaUnit, setCarpetAreaUnit] = useState('sqft');
  const [builtArea, setBuiltArea] = useState<number | null>(null);
  const [builtAreaUnit, setBuiltAreaUnit] = useState('sqft');
  const [landArea, setLandArea] = useState<number | null>(null);
  const [landAreaUnit, setLandAreaUnit] = useState('cent');

  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [balconies, setBalconies] = useState('');
  const [furnishingStatus, setFurnishingStatus] = useState('');
  const [facing, setFacing] = useState('');
  const [floorNumber, setFloorNumber] = useState('');
  const [totalFloors, setTotalFloors] = useState('');
  const [superBuiltArea, setSuperBuiltArea] = useState('');
  const [propertyAge, setPropertyAge] = useState('');
  const [residentialWaterSource, setResidentialWaterSource] = useState('');
  const [parking2wCount, setParking2wCount] = useState('');
  const [parking4wCount, setParking4wCount] = useState('');
  const [isGated, setIsGated] = useState<boolean | null>(null);
  const [builderName, setBuilderName] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);
  const [specialLocationViews, setSpecialLocationViews] = useState<string[]>([]);
  const [hasLift, setHasLift] = useState<boolean | null>(null);
  const [hasPowerBackup, setHasPowerBackup] = useState<boolean | null>(null);
  const [hasGarden, setHasGarden] = useState<boolean | null>(null);
  const [hasTerrace, setHasTerrace] = useState<boolean | null>(null);
  const [hasCompound, setHasCompound] = useState<boolean | null>(null);
  const [hasServantRoom, setHasServantRoom] = useState<boolean | null>(null);
  const [plotDimensions, setPlotDimensions] = useState('');
  const [roadWidthFt, setRoadWidthFt] = useState('');
  const [isCornerPlot, setIsCornerPlot] = useState<boolean | null>(null);
  const [hasBoundaryWall, setHasBoundaryWall] = useState<boolean | null>(null);
  const [isGatedLayout, setIsGatedLayout] = useState<boolean | null>(null);
  const [hasWaterConnection, setHasWaterConnection] = useState<boolean | null>(null);
  const [hasElectricityConnection, setHasElectricityConnection] = useState<boolean | null>(null);
  const [hasDrainage, setHasDrainage] = useState<boolean | null>(null);

  // Section 4 — Sale / Rent terms
  const [priceRupees, setPriceRupees] = useState<number | null>(null);
  const [priceNegotiable, setPriceNegotiable] = useState<boolean | null>(null);
  const [maintenancePaise, setMaintenancePaise] = useState('');
  const [possessionStatus, setPossessionStatus] = useState('');
  // Prototype-only (design-spec.md §prototype_only has no explicit "RERA" entry, but the
  // CreateListingRequest DTO has no `reraNumber` field — only UpdateListingRequest does.
  // Rendered for visual parity; NOT wired into the create payload (documented HARD
  // CONSTRAINT: no new payload key). Broker can add it on the EditListing step-1 form.
  const [reraNumberDraft, setReraNumberDraft] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [securityDepositMonths, setSecurityDepositMonths] = useState('');
  const [lockInMonths, setLockInMonths] = useState('');
  const [maintenanceIncluded, setMaintenanceIncluded] = useState<boolean | null>(null);
  const [rentNegotiable, setRentNegotiable] = useState<boolean | null>(null);
  const [petsAllowed, setPetsAllowed] = useState<boolean | null>(null);
  const [availabilityTimeline, setAvailabilityTimeline] = useState('');
  const [preferredTenants, setPreferredTenants] = useState<string[]>([]);

  // Section 5 — Ownership & document details
  const [ownershipType, setOwnershipType] = useState('');
  const [conversionStatus, setConversionStatus] = useState('');
  const [khataNumber, setKhataNumber] = useState('');
  const [propertyTaxPid, setPropertyTaxPid] = useState('');
  const [approvingAuthority, setApprovingAuthority] = useState('');
  const [surveyNumber, setSurveyNumber] = useState('');

  // Section 6 — Photos, video & location (prototype-only, see PhotoTileGrid.tsx)
  // design-spec.md §prototype_only "video_link": no create-payload field exists for a
  // video link — rendered disabled/deferred, its value is intentionally never read.
  const [videoLinkDraft, setVideoLinkDraft] = useState('');

  // Section 7 — Description
  const [description, setDescription] = useState('');

  const isRent = listingPurpose === 'rent';
  const isApartment = propertyType === 'apartment';
  const isHouseOrVilla = propertyType === 'house' || propertyType === 'villa';
  const isPlot = propertyType === 'residential_plot';

  const fieldVisible = (key: ListingFieldKey): boolean => isListingFieldVisible(key, propertyType, listingPurpose);

  /**
   * Issue #2039 (AC2/AC3/AC7) — one-shot hydrate of the form from a
   * URL-seeded draft. Called by useResidentialListingDraft exactly once,
   * only once the draft query has actually settled with data. Deliberately
   * does NOT touch `locality` — useResidentialLocation already owns that
   * seeding from draftListing via its own contract; calling setLocality()
   * here would fight the hook's internal state machine.
   */
  const hydrateFrom = (draftListing: ListingResponse) => {
    // AC7 — hydration wins over the initialPropertyType/initialListingPurpose
    // prefill seeding; only overrides when the persisted type/purpose is a
    // valid, recognised value.
    const hydratedType = residentialSubtypeFromPropertyType(draftListing.propertyType);
    if (hydratedType) setPropertyType(hydratedType);
    if (draftListing.listingPurpose === 'sale' || draftListing.listingPurpose === 'rent') {
      setListingPurpose(draftListing.listingPurpose);
    }

    setTitle(draftListing.title ?? '');
    setProjectName(draftListing.projectName ?? '');
    setDescription(draftListing.description ?? '');

    setCarpetArea(draftListing.carpetArea ?? null);
    setCarpetAreaUnit(draftListing.carpetAreaUnit ?? 'sqft');
    setBuiltArea(draftListing.builtArea ?? null);
    setBuiltAreaUnit(draftListing.builtAreaUnit ?? 'sqft');
    setLandArea(draftListing.landArea ?? null);
    setLandAreaUnit(draftListing.landAreaUnit ?? 'cent');

    setBedrooms(numToStr(draftListing.bedrooms));
    setBathrooms(numToStr(draftListing.bathrooms));
    setBalconies(numToStr(draftListing.balconies));
    setFurnishingStatus(draftListing.furnishingStatus ?? '');
    setFacing(draftListing.facing ?? '');
    setFloorNumber(numToStr(draftListing.floorNumber));
    setTotalFloors(numToStr(draftListing.totalFloors));
    setSuperBuiltArea(numToStr(draftListing.superBuiltArea));
    setPropertyAge(draftListing.propertyAge ?? '');
    setResidentialWaterSource(draftListing.residentialWaterSource ?? '');
    setParking2wCount(numToStr(draftListing.parking2wCount));
    setParking4wCount(numToStr(draftListing.parking4wCount));
    setIsGated(draftListing.isGated ?? null);
    setBuilderName(draftListing.builderName ?? '');
    setAmenities(draftListing.amenities ?? []);
    setSpecialLocationViews(draftListing.specialLocationViews ?? []);
    setHasLift(draftListing.hasLift ?? null);
    setHasPowerBackup(draftListing.hasPowerBackup ?? null);
    setHasGarden(draftListing.hasGarden ?? null);
    setHasTerrace(draftListing.hasTerrace ?? null);
    setHasCompound(draftListing.hasCompound ?? null);
    setHasServantRoom(draftListing.hasServantRoom ?? null);
    setPlotDimensions(draftListing.plotDimensions ?? '');
    setRoadWidthFt(numToStr(draftListing.roadWidthFt));
    setIsCornerPlot(draftListing.isCornerPlot ?? null);
    setHasBoundaryWall(draftListing.hasBoundaryWall ?? null);
    setIsGatedLayout(draftListing.isGatedLayout ?? null);
    setHasWaterConnection(draftListing.hasWaterConnection ?? null);
    setHasElectricityConnection(draftListing.hasElectricityConnection ?? null);
    setHasDrainage(draftListing.hasDrainage ?? null);

    setPriceRupees(draftListing.price ?? null);
    setPriceNegotiable(draftListing.priceNegotiable ?? null);
    setMaintenancePaise(numToStr(draftListing.maintenancePaise));
    setPossessionStatus(draftListing.possessionStatus ?? '');
    setMonthlyRent(numToStr(draftListing.monthlyRent));
    setSecurityDepositMonths(numToStr(draftListing.securityDepositMonths));
    setLockInMonths(numToStr(draftListing.lockInMonths));
    setMaintenanceIncluded(draftListing.maintenanceIncluded ?? null);
    setRentNegotiable(draftListing.rentNegotiable ?? null);
    setPetsAllowed(draftListing.petsAllowed ?? null);
    setAvailabilityTimeline(draftListing.availabilityTimeline ?? '');
    setPreferredTenants(draftListing.preferredTenants ?? []);

    setOwnershipType(draftListing.ownershipType ?? '');
    setConversionStatus(draftListing.conversionStatus ?? '');
    setKhataNumber(draftListing.khataNumber ?? '');
    setPropertyTaxPid(draftListing.propertyTaxPid ?? '');
    setApprovingAuthority(draftListing.approvingAuthority ?? '');
    setSurveyNumber(draftListing.surveyNumber ?? '');
  };

  return {
    propertyType, setPropertyType,
    listingPurpose, setListingPurpose,
    locality, setLocality,
    projectName, setProjectName,
    title, setTitle,
    carpetArea, setCarpetArea,
    carpetAreaUnit, setCarpetAreaUnit,
    builtArea, setBuiltArea,
    builtAreaUnit, setBuiltAreaUnit,
    landArea, setLandArea,
    landAreaUnit, setLandAreaUnit,
    bedrooms, setBedrooms,
    bathrooms, setBathrooms,
    balconies, setBalconies,
    furnishingStatus, setFurnishingStatus,
    facing, setFacing,
    floorNumber, setFloorNumber,
    totalFloors, setTotalFloors,
    superBuiltArea, setSuperBuiltArea,
    propertyAge, setPropertyAge,
    residentialWaterSource, setResidentialWaterSource,
    parking2wCount, setParking2wCount,
    parking4wCount, setParking4wCount,
    isGated, setIsGated,
    builderName, setBuilderName,
    amenities, setAmenities,
    specialLocationViews, setSpecialLocationViews,
    hasLift, setHasLift,
    hasPowerBackup, setHasPowerBackup,
    hasGarden, setHasGarden,
    hasTerrace, setHasTerrace,
    hasCompound, setHasCompound,
    hasServantRoom, setHasServantRoom,
    plotDimensions, setPlotDimensions,
    roadWidthFt, setRoadWidthFt,
    isCornerPlot, setIsCornerPlot,
    hasBoundaryWall, setHasBoundaryWall,
    isGatedLayout, setIsGatedLayout,
    hasWaterConnection, setHasWaterConnection,
    hasElectricityConnection, setHasElectricityConnection,
    hasDrainage, setHasDrainage,
    priceRupees, setPriceRupees,
    priceNegotiable, setPriceNegotiable,
    maintenancePaise, setMaintenancePaise,
    possessionStatus, setPossessionStatus,
    reraNumberDraft, setReraNumberDraft,
    monthlyRent, setMonthlyRent,
    securityDepositMonths, setSecurityDepositMonths,
    lockInMonths, setLockInMonths,
    maintenanceIncluded, setMaintenanceIncluded,
    rentNegotiable, setRentNegotiable,
    petsAllowed, setPetsAllowed,
    availabilityTimeline, setAvailabilityTimeline,
    preferredTenants, setPreferredTenants,
    ownershipType, setOwnershipType,
    conversionStatus, setConversionStatus,
    khataNumber, setKhataNumber,
    propertyTaxPid, setPropertyTaxPid,
    approvingAuthority, setApprovingAuthority,
    surveyNumber, setSurveyNumber,
    videoLinkDraft, setVideoLinkDraft,
    description, setDescription,
    isRent, isApartment, isHouseOrVilla, isPlot,
    fieldVisible,
    hydrateFrom,
  };
}

export type UseResidentialListingFormStateResult = ReturnType<typeof useResidentialListingFormState>;
