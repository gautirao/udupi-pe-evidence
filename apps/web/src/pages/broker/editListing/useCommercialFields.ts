import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import { boolToTriState } from '@/lib/editListing/valueMappers';

// Issue #1838 slice-5b — pure state-ownership extraction of the 5
// commercial-exclusive fields from EditListingForm. No behaviour change:
// same useState('') defaults, same prefill assignments (verbatim from the
// removed prefill effect lines).
//
// carpetArea/carpetAreaUnit/floorNumber/totalFloors/furnishingStatus are
// SHARED with residential/apartment (see listingFieldConfig.ts CONFIG_MAP)
// and stay component-owned — they are NOT part of this hook.
//
// numberOfUnits is a commercial subset: per CONFIG_MAP it renders only for
// commercial_building and warehouse (not the base 'commercial' or
// commercial_land types), but it is still commercial-exclusive — no
// non-commercial propertyType renders it.
//
// #2281 — extended to carry the 28 #1684 subtype-gated commercial fields
// (previously modeled ONLY by CommercialListingForm.tsx / Create). See
// listingFieldConfig.ts:447-499 for the full field-to-subtype mapping this
// hook's hydrate() and this file's state mirror exactly.
//
// `explicitSubtype` is the broker's own SHOP/OFFICE choice for propertyType
// 'commercial' (never set for commercial_building/warehouse/commercial_land,
// which derive their subtype from propertyType — see
// listingFieldConfig.deriveCommercialSubtype). It is intentionally SEPARATE
// from the derived CommercialSubtype the parent computes for isListingFieldVisible
// — EditListingForm.tsx must never read listing.commercialSubtype raw (F1).
//
// `utilities`/`suitableUses` are `string[] | undefined` (never default to `[]`)
// with a paired `*Touched` flag — F3: the backend REPLACEs these child sets on
// any non-null PUT value, so the payload builder must be able to tell "never
// touched this session" (omit the key, leave stored rows intact) apart from
// "user cleared everything" (send `[]`, backend deletes) or "user selected a
// set" (send the complete array). Touched is set to false again by hydrate()
// (a new listing load), and to true only by the wrapped setUtilities/
// setSuitableUses setters below.

export interface CommercialFieldValues {
  washrooms: string;
  parkingCount: string;
  roadFrontageFt: string;
  commercialUsage: string;
  numberOfUnits: string;
  // #2281 [#1684 parity] — explicit SHOP/OFFICE choice (propertyType 'commercial' only)
  explicitSubtype: '' | 'SHOP' | 'OFFICE';
  commercialAreaUnit: string;
  // SHOP / OFFICE
  floorChoice: string;
  hubType: string;
  // BUILDING
  floorMode: string;
  powerLoadKva: string;
  // SHOP + BUILDING
  occupancyStatus: string;
  // OFFICE
  officeSeats: string;
  officeCabins: string;
  officeMeetingRooms: string;
  // WAREHOUSE
  warehouseClearHeightFt: string;
  warehouseLoadingBays: string;
  warehouseTruckAccess: string;
  warehouseFlooring: string;
  // LAND
  commercialZoning: string;
  commercialOwnership: string;
  commercialApprovals: string;
  // Any resolved subtype except LAND
  washroomsPublic: string;
  washroomsPrivate: string;
  parkingPublicCount: string;
  parkingPrivateCount: string;
  commercialFurnishingStatus: string;
  utilities: string[] | undefined;
  utilitiesTouched: boolean;
  // Any resolved subtype
  suitableUses: string[] | undefined;
  suitableUsesTouched: boolean;
  commercialAvailability: string;
  // Purpose-gated financials
  expectedRentalYieldPct: string;
  currentMonthlyIncomePaise: string;
  leaseTermMonths: string;
  leaseEscalationPct: string;
}

export interface CommercialFieldSetters {
  setWashrooms: Dispatch<SetStateAction<string>>;
  setParkingCount: Dispatch<SetStateAction<string>>;
  setRoadFrontageFt: Dispatch<SetStateAction<string>>;
  setCommercialUsage: Dispatch<SetStateAction<string>>;
  setNumberOfUnits: Dispatch<SetStateAction<string>>;
  setExplicitSubtype: Dispatch<SetStateAction<'' | 'SHOP' | 'OFFICE'>>;
  setCommercialAreaUnit: Dispatch<SetStateAction<string>>;
  setFloorChoice: Dispatch<SetStateAction<string>>;
  setHubType: Dispatch<SetStateAction<string>>;
  setFloorMode: Dispatch<SetStateAction<string>>;
  setPowerLoadKva: Dispatch<SetStateAction<string>>;
  setOccupancyStatus: Dispatch<SetStateAction<string>>;
  setOfficeSeats: Dispatch<SetStateAction<string>>;
  setOfficeCabins: Dispatch<SetStateAction<string>>;
  setOfficeMeetingRooms: Dispatch<SetStateAction<string>>;
  setWarehouseClearHeightFt: Dispatch<SetStateAction<string>>;
  setWarehouseLoadingBays: Dispatch<SetStateAction<string>>;
  setWarehouseTruckAccess: Dispatch<SetStateAction<string>>;
  setWarehouseFlooring: Dispatch<SetStateAction<string>>;
  setCommercialZoning: Dispatch<SetStateAction<string>>;
  setCommercialOwnership: Dispatch<SetStateAction<string>>;
  setCommercialApprovals: Dispatch<SetStateAction<string>>;
  setWashroomsPublic: Dispatch<SetStateAction<string>>;
  setWashroomsPrivate: Dispatch<SetStateAction<string>>;
  setParkingPublicCount: Dispatch<SetStateAction<string>>;
  setParkingPrivateCount: Dispatch<SetStateAction<string>>;
  setCommercialFurnishingStatus: Dispatch<SetStateAction<string>>;
  /** F3 — wrapped setter: updates the array AND marks utilitiesTouched=true. */
  setUtilities: (value: string[]) => void;
  /** F3 — wrapped setter: updates the array AND marks suitableUsesTouched=true. */
  setSuitableUses: (value: string[]) => void;
  setCommercialAvailability: Dispatch<SetStateAction<string>>;
  setExpectedRentalYieldPct: Dispatch<SetStateAction<string>>;
  setCurrentMonthlyIncomePaise: Dispatch<SetStateAction<string>>;
  setLeaseTermMonths: Dispatch<SetStateAction<string>>;
  setLeaseEscalationPct: Dispatch<SetStateAction<string>>;
}

export interface UseCommercialFieldsResult {
  values: CommercialFieldValues;
  setters: CommercialFieldSetters;
  hydrate: (listing: ListingResponse) => void;
}

export function useCommercialFields(): UseCommercialFieldsResult {
  const [washrooms, setWashrooms] = useState('');
  const [parkingCount, setParkingCount] = useState('');
  const [roadFrontageFt, setRoadFrontageFt] = useState('');
  const [commercialUsage, setCommercialUsage] = useState('');
  const [numberOfUnits, setNumberOfUnits] = useState('');

  // #2281 [#1684 parity] — 28 subtype-gated fields, mirroring CommercialListingForm.tsx.
  const [explicitSubtype, setExplicitSubtype] = useState<'' | 'SHOP' | 'OFFICE'>('');
  const [commercialAreaUnit, setCommercialAreaUnit] = useState('');
  const [floorChoice, setFloorChoice] = useState('');
  const [hubType, setHubType] = useState('');
  const [floorMode, setFloorMode] = useState('');
  const [powerLoadKva, setPowerLoadKva] = useState('');
  const [occupancyStatus, setOccupancyStatus] = useState('');
  const [officeSeats, setOfficeSeats] = useState('');
  const [officeCabins, setOfficeCabins] = useState('');
  const [officeMeetingRooms, setOfficeMeetingRooms] = useState('');
  const [warehouseClearHeightFt, setWarehouseClearHeightFt] = useState('');
  const [warehouseLoadingBays, setWarehouseLoadingBays] = useState('');
  const [warehouseTruckAccess, setWarehouseTruckAccess] = useState('');
  const [warehouseFlooring, setWarehouseFlooring] = useState('');
  const [commercialZoning, setCommercialZoning] = useState('');
  const [commercialOwnership, setCommercialOwnership] = useState('');
  const [commercialApprovals, setCommercialApprovals] = useState('');
  const [washroomsPublic, setWashroomsPublic] = useState('');
  const [washroomsPrivate, setWashroomsPrivate] = useState('');
  const [parkingPublicCount, setParkingPublicCount] = useState('');
  const [parkingPrivateCount, setParkingPrivateCount] = useState('');
  const [commercialFurnishingStatus, setCommercialFurnishingStatus] = useState('');
  // F3 — never default to []; undefined means "no hydrated/touched value yet".
  const [utilities, setUtilitiesRaw] = useState<string[] | undefined>(undefined);
  const [utilitiesTouched, setUtilitiesTouched] = useState(false);
  const [suitableUses, setSuitableUsesRaw] = useState<string[] | undefined>(undefined);
  const [suitableUsesTouched, setSuitableUsesTouched] = useState(false);
  const [commercialAvailability, setCommercialAvailability] = useState('');
  const [expectedRentalYieldPct, setExpectedRentalYieldPct] = useState('');
  const [currentMonthlyIncomePaise, setCurrentMonthlyIncomePaise] = useState('');
  const [leaseTermMonths, setLeaseTermMonths] = useState('');
  const [leaseEscalationPct, setLeaseEscalationPct] = useState('');

  // F3 — the ONLY way utilities/suitableUses become "touched" is a real user
  // interaction with the chip control. hydrate() below sets the raw value
  // directly (bypassing these wrappers) so loading a listing never marks
  // either set as touched.
  const setUtilities = useCallback((value: string[]) => {
    setUtilitiesRaw(value);
    setUtilitiesTouched(true);
  }, []);
  const setSuitableUses = useCallback((value: string[]) => {
    setSuitableUsesRaw(value);
    setSuitableUsesTouched(true);
  }, []);

  // Stable across renders — setState setters are stable, deps array is empty.
  const hydrate = useCallback((listing: ListingResponse) => {
    setWashrooms(listing.washrooms != null ? String(listing.washrooms) : '');
    setParkingCount(listing.parkingCount != null ? String(listing.parkingCount) : '');
    setRoadFrontageFt(listing.roadFrontageFt != null ? String(listing.roadFrontageFt) : '');
    setCommercialUsage(listing.commercialUsage ?? '');
    setNumberOfUnits(listing.numberOfUnits != null ? String(listing.numberOfUnits) : '');

    // #2281 [#1684 parity] — F2: normalise the stored (possibly null/legacy/
    // unrecognized) commercialSubtype to the explicit-choice vocabulary. Any
    // value other than 'SHOP'/'OFFICE' (null, 'BUILDING', 'WAREHOUSE', 'LAND',
    // an unknown legacy string) becomes '' — the safe "not chosen yet" default.
    setExplicitSubtype(
      listing.commercialSubtype === 'SHOP' || listing.commercialSubtype === 'OFFICE'
        ? listing.commercialSubtype
        : '',
    );
    setCommercialAreaUnit(listing.commercialAreaUnit ?? '');
    setFloorChoice(listing.floorChoice ?? '');
    setHubType(listing.hubType ?? '');
    setFloorMode(listing.floorMode ?? '');
    setPowerLoadKva(listing.powerLoadKva != null ? String(listing.powerLoadKva) : '');
    setOccupancyStatus(listing.occupancyStatus ?? '');
    setOfficeSeats(listing.officeSeats != null ? String(listing.officeSeats) : '');
    setOfficeCabins(listing.officeCabins != null ? String(listing.officeCabins) : '');
    setOfficeMeetingRooms(listing.officeMeetingRooms != null ? String(listing.officeMeetingRooms) : '');
    setWarehouseClearHeightFt(listing.warehouseClearHeightFt != null ? String(listing.warehouseClearHeightFt) : '');
    setWarehouseLoadingBays(listing.warehouseLoadingBays != null ? String(listing.warehouseLoadingBays) : '');
    setWarehouseTruckAccess(boolToTriState(listing.warehouseTruckAccess));
    setWarehouseFlooring(listing.warehouseFlooring ?? '');
    setCommercialZoning(listing.commercialZoning ?? '');
    setCommercialOwnership(listing.commercialOwnership ?? '');
    setCommercialApprovals(listing.commercialApprovals ?? '');
    setWashroomsPublic(listing.washroomsPublic != null ? String(listing.washroomsPublic) : '');
    setWashroomsPrivate(listing.washroomsPrivate != null ? String(listing.washroomsPrivate) : '');
    setParkingPublicCount(listing.parkingPublicCount != null ? String(listing.parkingPublicCount) : '');
    setParkingPrivateCount(listing.parkingPrivateCount != null ? String(listing.parkingPrivateCount) : '');
    setCommercialFurnishingStatus(listing.commercialFurnishingStatus ?? '');
    // F3 — hydration is NOT a user touch: set the raw state directly (never
    // through setUtilities/setSuitableUses) and reset touched to false so a
    // freshly loaded listing always starts in the "omit unless touched" state.
    setUtilitiesRaw(listing.utilities ?? undefined);
    setUtilitiesTouched(false);
    setSuitableUsesRaw(listing.suitableUses ?? undefined);
    setSuitableUsesTouched(false);
    setCommercialAvailability(listing.commercialAvailability ?? '');
    setExpectedRentalYieldPct(listing.expectedRentalYieldPct != null ? String(listing.expectedRentalYieldPct) : '');
    setCurrentMonthlyIncomePaise(
      listing.currentMonthlyIncomePaise != null ? String(listing.currentMonthlyIncomePaise) : '',
    );
    setLeaseTermMonths(listing.leaseTermMonths != null ? String(listing.leaseTermMonths) : '');
    setLeaseEscalationPct(listing.leaseEscalationPct != null ? String(listing.leaseEscalationPct) : '');
  }, []);

  return {
    values: {
      washrooms,
      parkingCount,
      roadFrontageFt,
      commercialUsage,
      numberOfUnits,
      explicitSubtype,
      commercialAreaUnit,
      floorChoice,
      hubType,
      floorMode,
      powerLoadKva,
      occupancyStatus,
      officeSeats,
      officeCabins,
      officeMeetingRooms,
      warehouseClearHeightFt,
      warehouseLoadingBays,
      warehouseTruckAccess,
      warehouseFlooring,
      commercialZoning,
      commercialOwnership,
      commercialApprovals,
      washroomsPublic,
      washroomsPrivate,
      parkingPublicCount,
      parkingPrivateCount,
      commercialFurnishingStatus,
      utilities,
      utilitiesTouched,
      suitableUses,
      suitableUsesTouched,
      commercialAvailability,
      expectedRentalYieldPct,
      currentMonthlyIncomePaise,
      leaseTermMonths,
      leaseEscalationPct,
    },
    setters: {
      setWashrooms,
      setParkingCount,
      setRoadFrontageFt,
      setCommercialUsage,
      setNumberOfUnits,
      setExplicitSubtype,
      setCommercialAreaUnit,
      setFloorChoice,
      setHubType,
      setFloorMode,
      setPowerLoadKva,
      setOccupancyStatus,
      setOfficeSeats,
      setOfficeCabins,
      setOfficeMeetingRooms,
      setWarehouseClearHeightFt,
      setWarehouseLoadingBays,
      setWarehouseTruckAccess,
      setWarehouseFlooring,
      setCommercialZoning,
      setCommercialOwnership,
      setCommercialApprovals,
      setWashroomsPublic,
      setWashroomsPrivate,
      setParkingPublicCount,
      setParkingPrivateCount,
      setCommercialFurnishingStatus,
      setUtilities,
      setSuitableUses,
      setCommercialAvailability,
      setExpectedRentalYieldPct,
      setCurrentMonthlyIncomePaise,
      setLeaseTermMonths,
      setLeaseEscalationPct,
    },
    hydrate,
  };
}
