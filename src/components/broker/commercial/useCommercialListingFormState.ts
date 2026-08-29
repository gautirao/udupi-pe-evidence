import { useState } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import { commercialTypeFromPropertyType } from '@/lib/demandPrefill';
import type { CommercialPropertyType, ExplicitSubtype, CommercialPurpose } from './commercialListingTypes';

/**
 * #2348 — inverse of intOrUndef/floatOrUndef, for hydrating the form's
 * string-typed numeric inputs from a persisted ListingResponse's typed
 * number|null fields. Mirrors ResidentialListingForm.tsx's numToStr.
 */
function numToStr(n: number | null | undefined): string {
  return n != null ? String(n) : '';
}

export interface UseCommercialListingFormStateParams {
  initialPropertyType: CommercialPropertyType;
  /** #1748 — optional demand-gap prefill; only the shared 'sale'|'rent' vocabulary
   *  is forwarded (never 'lease'). Defaults to 'sale' when absent. */
  initialListingPurpose?: 'sale' | 'rent';
}

/**
 * #2388 — single owner of the typed commercial form field state and its
 * one-shot hydration from a persisted draft. Draft persistence/recovery
 * orchestration (id, mode, in-flight guards) lives in
 * useCommercialListingDraft, which invokes `hydrateFrom` exactly once when a
 * URL-seeded draft settles.
 */
export function useCommercialListingFormState({ initialPropertyType, initialListingPurpose }: UseCommercialListingFormStateParams) {
  const [propertyType, setPropertyType] = useState<CommercialPropertyType>(initialPropertyType);
  const [explicitSubtype, setExplicitSubtype] = useState<ExplicitSubtype>('');
  const [listingPurpose, setListingPurpose] = useState<CommercialPurpose>(initialListingPurpose ?? 'sale');

  const [locality, setLocality] = useState('');
  const [title, setTitle] = useState('');

  // Area
  const [landArea, setLandArea] = useState<number | null>(null);
  const [landAreaUnit, setLandAreaUnit] = useState('cent');
  const [builtArea, setBuiltArea] = useState<number | null>(null);
  const [builtAreaUnit, setBuiltAreaUnit] = useState('sqft');
  const [commercialAreaUnit, setCommercialAreaUnit] = useState('');

  // SHOP/OFFICE
  const [floorChoice, setFloorChoice] = useState('');
  const [hubType, setHubType] = useState('');

  // BUILDING
  const [floorMode, setFloorMode] = useState('');
  const [powerLoadKva, setPowerLoadKva] = useState('');
  const [occupancyStatus, setOccupancyStatus] = useState('');

  // OFFICE
  const [officeSeats, setOfficeSeats] = useState('');
  const [officeCabins, setOfficeCabins] = useState('');
  const [officeMeetingRooms, setOfficeMeetingRooms] = useState('');

  // WAREHOUSE
  const [warehouseClearHeightFt, setWarehouseClearHeightFt] = useState('');
  const [warehouseLoadingBays, setWarehouseLoadingBays] = useState('');
  const [warehouseTruckAccess, setWarehouseTruckAccess] = useState<boolean | null>(null);
  const [warehouseFlooring, setWarehouseFlooring] = useState('');

  // LAND
  const [commercialZoning, setCommercialZoning] = useState('');
  const [commercialOwnership, setCommercialOwnership] = useState('');
  const [commercialApprovalsText, setCommercialApprovalsText] = useState('');

  // Built-space (all subtypes except LAND)
  const [washroomsPublic, setWashroomsPublic] = useState('');
  const [washroomsPrivate, setWashroomsPrivate] = useState('');
  const [parkingPublicCount, setParkingPublicCount] = useState('');
  const [parkingPrivateCount, setParkingPrivateCount] = useState('');
  const [commercialFurnishingStatus, setCommercialFurnishingStatus] = useState('');
  const [utilities, setUtilities] = useState<string[]>([]);

  // All subtypes
  const [suitableUses, setSuitableUses] = useState<string[]>([]);
  const [commercialAvailability, setCommercialAvailability] = useState('');

  // Terms
  const [priceRupees, setPriceRupees] = useState<number | null>(null);
  const [monthlyRent, setMonthlyRent] = useState('');
  const [securityDepositMonths, setSecurityDepositMonths] = useState('');
  const [lockInMonths, setLockInMonths] = useState('');
  const [expectedRentalYieldPct, setExpectedRentalYieldPct] = useState('');
  const [currentMonthlyIncomePaise, setCurrentMonthlyIncomePaise] = useState('');
  const [leaseTermMonths, setLeaseTermMonths] = useState('');
  const [leaseEscalationPct, setLeaseEscalationPct] = useState('');

  const [description, setDescription] = useState('');

  // #2348 — PriceField is deliberately uncontrolled (its own onChange never
  // feeds back into `initialRupees`, or every keystroke would fight the
  // user by reformatting the text mid-typing). This separate seed only
  // changes ONCE, from the one-shot hydrate below, so it can safely be
  // wired into `initialRupees` to sync the widget from a loaded draft
  // without ever re-syncing off the user's own subsequent edits.
  const [priceHydrationSeed, setPriceHydrationSeed] = useState<number | null>(null);

  // #2348 — one-shot hydrate of the form from a URL-seeded draft. Called by
  // useCommercialListingDraft exactly once, only once the draft query has
  // actually settled with data. Deliberately does NOT touch `locality` —
  // useResidentialLocation (via ResidentialLocationBridge) already owns
  // that seeding from draftListing. Mirrors ResidentialListingForm.tsx's
  // hydrate effect (issue #2039).
  const hydrateFrom = (draftListing: ListingResponse) => {
    // Hydration wins over the initialPropertyType/initialListingPurpose
    // prefill seeding; only overrides when the persisted type/purpose is a
    // valid, recognised value — an unrecognized propertyType/subtype/purpose
    // leaves the current in-flight UI state untouched rather than corrupting it.
    const hydratedType = commercialTypeFromPropertyType(draftListing.propertyType);
    if (hydratedType) setPropertyType(hydratedType);
    if (draftListing.commercialSubtype === 'SHOP' || draftListing.commercialSubtype === 'OFFICE') {
      setExplicitSubtype(draftListing.commercialSubtype);
    }
    if (draftListing.listingPurpose === 'sale' || draftListing.listingPurpose === 'rent' || draftListing.listingPurpose === 'lease') {
      setListingPurpose(draftListing.listingPurpose);
    }

    setTitle(draftListing.title ?? '');
    setDescription(draftListing.description ?? '');

    setLandArea(draftListing.landArea ?? null);
    setLandAreaUnit(draftListing.landAreaUnit ?? 'cent');
    setBuiltArea(draftListing.builtArea ?? null);
    setBuiltAreaUnit(draftListing.builtAreaUnit ?? 'sqft');
    setCommercialAreaUnit(draftListing.commercialAreaUnit ?? '');

    // SHOP/OFFICE
    setFloorChoice(draftListing.floorChoice ?? '');
    setHubType(draftListing.hubType ?? '');

    // BUILDING
    setFloorMode(draftListing.floorMode ?? '');
    setPowerLoadKva(numToStr(draftListing.powerLoadKva));
    setOccupancyStatus(draftListing.occupancyStatus ?? '');

    // OFFICE
    setOfficeSeats(numToStr(draftListing.officeSeats));
    setOfficeCabins(numToStr(draftListing.officeCabins));
    setOfficeMeetingRooms(numToStr(draftListing.officeMeetingRooms));

    // WAREHOUSE
    setWarehouseClearHeightFt(numToStr(draftListing.warehouseClearHeightFt));
    setWarehouseLoadingBays(numToStr(draftListing.warehouseLoadingBays));
    setWarehouseTruckAccess(draftListing.warehouseTruckAccess ?? null);
    setWarehouseFlooring(draftListing.warehouseFlooring ?? '');

    // LAND
    setCommercialZoning(draftListing.commercialZoning ?? '');
    setCommercialOwnership(draftListing.commercialOwnership ?? '');
    setCommercialApprovalsText(draftListing.commercialApprovals ?? '');

    // Built-space (all subtypes except LAND)
    setWashroomsPublic(numToStr(draftListing.washroomsPublic));
    setWashroomsPrivate(numToStr(draftListing.washroomsPrivate));
    setParkingPublicCount(numToStr(draftListing.parkingPublicCount));
    setParkingPrivateCount(numToStr(draftListing.parkingPrivateCount));
    setCommercialFurnishingStatus(draftListing.commercialFurnishingStatus ?? '');
    setUtilities(draftListing.utilities ?? []);

    // All subtypes
    setSuitableUses(draftListing.suitableUses ?? []);
    setCommercialAvailability(draftListing.commercialAvailability ?? '');

    // Terms
    setPriceRupees(draftListing.price ?? null);
    setPriceHydrationSeed(draftListing.price ?? null);
    setMonthlyRent(numToStr(draftListing.monthlyRent));
    setSecurityDepositMonths(numToStr(draftListing.securityDepositMonths));
    setLockInMonths(numToStr(draftListing.lockInMonths));
    setExpectedRentalYieldPct(numToStr(draftListing.expectedRentalYieldPct));
    setCurrentMonthlyIncomePaise(numToStr(draftListing.currentMonthlyIncomePaise));
    setLeaseTermMonths(numToStr(draftListing.leaseTermMonths));
    setLeaseEscalationPct(numToStr(draftListing.leaseEscalationPct));
  };

  return {
    propertyType, setPropertyType,
    explicitSubtype, setExplicitSubtype,
    listingPurpose, setListingPurpose,
    locality, setLocality,
    title, setTitle,
    landArea, setLandArea,
    landAreaUnit, setLandAreaUnit,
    builtArea, setBuiltArea,
    builtAreaUnit, setBuiltAreaUnit,
    commercialAreaUnit, setCommercialAreaUnit,
    floorChoice, setFloorChoice,
    hubType, setHubType,
    floorMode, setFloorMode,
    powerLoadKva, setPowerLoadKva,
    occupancyStatus, setOccupancyStatus,
    officeSeats, setOfficeSeats,
    officeCabins, setOfficeCabins,
    officeMeetingRooms, setOfficeMeetingRooms,
    warehouseClearHeightFt, setWarehouseClearHeightFt,
    warehouseLoadingBays, setWarehouseLoadingBays,
    warehouseTruckAccess, setWarehouseTruckAccess,
    warehouseFlooring, setWarehouseFlooring,
    commercialZoning, setCommercialZoning,
    commercialOwnership, setCommercialOwnership,
    commercialApprovalsText, setCommercialApprovalsText,
    washroomsPublic, setWashroomsPublic,
    washroomsPrivate, setWashroomsPrivate,
    parkingPublicCount, setParkingPublicCount,
    parkingPrivateCount, setParkingPrivateCount,
    commercialFurnishingStatus, setCommercialFurnishingStatus,
    utilities, setUtilities,
    suitableUses, setSuitableUses,
    commercialAvailability, setCommercialAvailability,
    priceRupees, setPriceRupees,
    monthlyRent, setMonthlyRent,
    securityDepositMonths, setSecurityDepositMonths,
    lockInMonths, setLockInMonths,
    expectedRentalYieldPct, setExpectedRentalYieldPct,
    currentMonthlyIncomePaise, setCurrentMonthlyIncomePaise,
    leaseTermMonths, setLeaseTermMonths,
    leaseEscalationPct, setLeaseEscalationPct,
    description, setDescription,
    priceHydrationSeed,
    hydrateFrom,
  };
}

export type UseCommercialListingFormStateResult = ReturnType<typeof useCommercialListingFormState>;
