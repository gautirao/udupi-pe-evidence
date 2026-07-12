import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import { boolToTriState } from '@/lib/editListing/valueMappers';

// Issue #1838 slice-5d — pure state-ownership extraction of the ~39
// residential-family-exclusive fields (M38-13A #1626) from EditListingForm,
// mirroring useAgriFields/useCommercialFields/useRentFields. No behaviour
// change: same useState defaults, same prefill assignments (verbatim from
// the removed prefill effect lines).
//
// Includes the 5 dual-gated fields (maintenanceIncluded, rentNegotiable,
// petsAllowed, availabilityTimeline, preferredTenants) — gated by BOTH
// residential family AND listingPurpose === 'rent' in isListingFieldVisible,
// but this hook hydrates them UNCONDITIONALLY (no isRent param); their
// isRent gating stays in buildUpdatePayload.ts + the JSX, unchanged.
//
// EXCLUDED (component-owned, untouched): facing, ownershipType, surveyNumber
// (shared with agri / base fields), carpetArea/carpetAreaUnit, floorNumber,
// totalFloors, furnishingStatus (shared with commercial), bedrooms,
// builtArea/builtAreaUnit, landArea/landAreaUnit (base fields).

export interface ResidentialFieldValues {
  bathrooms: string;
  balconies: string;
  parking2wCount: string;
  parking4wCount: string;
  roadWidthFt: string;
  maintenancePaise: string;
  propertyAge: string;
  residentialWaterSource: string;
  plotDimensions: string;
  conversionStatus: string;
  khataNumber: string;
  propertyTaxPid: string;
  approvingAuthority: string;
  projectName: string;
  builderName: string;
  possessionStatus: string;
  availabilityTimeline: string;
  priceNegotiable: string;
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
  maintenanceIncluded: string;
  rentNegotiable: string;
  petsAllowed: string;
  amenities: string[];
  specialLocationViews: string[];
  preferredTenants: string[];
  superBuiltArea: number | null;
  superBuiltAreaUnit: string;
}

export interface ResidentialFieldSetters {
  setBathrooms: Dispatch<SetStateAction<string>>;
  setBalconies: Dispatch<SetStateAction<string>>;
  setParking2wCount: Dispatch<SetStateAction<string>>;
  setParking4wCount: Dispatch<SetStateAction<string>>;
  setRoadWidthFt: Dispatch<SetStateAction<string>>;
  setMaintenancePaise: Dispatch<SetStateAction<string>>;
  setPropertyAge: Dispatch<SetStateAction<string>>;
  setResidentialWaterSource: Dispatch<SetStateAction<string>>;
  setPlotDimensions: Dispatch<SetStateAction<string>>;
  setConversionStatus: Dispatch<SetStateAction<string>>;
  setKhataNumber: Dispatch<SetStateAction<string>>;
  setPropertyTaxPid: Dispatch<SetStateAction<string>>;
  setApprovingAuthority: Dispatch<SetStateAction<string>>;
  setProjectName: Dispatch<SetStateAction<string>>;
  setBuilderName: Dispatch<SetStateAction<string>>;
  setPossessionStatus: Dispatch<SetStateAction<string>>;
  setAvailabilityTimeline: Dispatch<SetStateAction<string>>;
  setPriceNegotiable: Dispatch<SetStateAction<string>>;
  setHasLift: Dispatch<SetStateAction<string>>;
  setHasPowerBackup: Dispatch<SetStateAction<string>>;
  setIsGated: Dispatch<SetStateAction<string>>;
  setHasGarden: Dispatch<SetStateAction<string>>;
  setHasTerrace: Dispatch<SetStateAction<string>>;
  setHasCompound: Dispatch<SetStateAction<string>>;
  setHasServantRoom: Dispatch<SetStateAction<string>>;
  setIsCornerPlot: Dispatch<SetStateAction<string>>;
  setHasBoundaryWall: Dispatch<SetStateAction<string>>;
  setIsGatedLayout: Dispatch<SetStateAction<string>>;
  setHasWaterConnection: Dispatch<SetStateAction<string>>;
  setHasElectricityConnection: Dispatch<SetStateAction<string>>;
  setHasDrainage: Dispatch<SetStateAction<string>>;
  setMaintenanceIncluded: Dispatch<SetStateAction<string>>;
  setRentNegotiable: Dispatch<SetStateAction<string>>;
  setPetsAllowed: Dispatch<SetStateAction<string>>;
  setAmenities: Dispatch<SetStateAction<string[]>>;
  setSpecialLocationViews: Dispatch<SetStateAction<string[]>>;
  setPreferredTenants: Dispatch<SetStateAction<string[]>>;
  setSuperBuiltArea: Dispatch<SetStateAction<number | null>>;
  setSuperBuiltAreaUnit: Dispatch<SetStateAction<string>>;
}

export interface UseResidentialFieldsResult {
  values: ResidentialFieldValues;
  setters: ResidentialFieldSetters;
  hydrate: (listing: ListingResponse) => void;
}

export function useResidentialFields(): UseResidentialFieldsResult {
  // Group N — useState(''), hydrate `listing.X != null ? String(listing.X) : ''`
  const [bathrooms, setBathrooms] = useState('');
  const [balconies, setBalconies] = useState('');
  const [parking2wCount, setParking2wCount] = useState('');
  const [parking4wCount, setParking4wCount] = useState('');
  const [roadWidthFt, setRoadWidthFt] = useState('');
  const [maintenancePaise, setMaintenancePaise] = useState('');

  // Group E — useState(''), hydrate `listing.X ?? ''`
  const [propertyAge, setPropertyAge] = useState('');
  const [residentialWaterSource, setResidentialWaterSource] = useState('');
  const [plotDimensions, setPlotDimensions] = useState('');
  const [conversionStatus, setConversionStatus] = useState('');
  const [khataNumber, setKhataNumber] = useState('');
  const [propertyTaxPid, setPropertyTaxPid] = useState('');
  const [approvingAuthority, setApprovingAuthority] = useState('');
  const [projectName, setProjectName] = useState('');
  const [builderName, setBuilderName] = useState('');
  const [possessionStatus, setPossessionStatus] = useState('');
  const [availabilityTimeline, setAvailabilityTimeline] = useState('');

  // Group T — useState(''), hydrate `boolToTriState(listing.X)`
  const [priceNegotiable, setPriceNegotiable] = useState('');
  const [hasLift, setHasLift] = useState('');
  const [hasPowerBackup, setHasPowerBackup] = useState('');
  const [isGated, setIsGated] = useState('');
  const [hasGarden, setHasGarden] = useState('');
  const [hasTerrace, setHasTerrace] = useState('');
  const [hasCompound, setHasCompound] = useState('');
  const [hasServantRoom, setHasServantRoom] = useState('');
  const [isCornerPlot, setIsCornerPlot] = useState('');
  const [hasBoundaryWall, setHasBoundaryWall] = useState('');
  const [isGatedLayout, setIsGatedLayout] = useState('');
  const [hasWaterConnection, setHasWaterConnection] = useState('');
  const [hasElectricityConnection, setHasElectricityConnection] = useState('');
  const [hasDrainage, setHasDrainage] = useState('');
  const [maintenanceIncluded, setMaintenanceIncluded] = useState('');
  const [rentNegotiable, setRentNegotiable] = useState('');
  const [petsAllowed, setPetsAllowed] = useState('');

  // Group A — useState<string[]>([]), hydrate `listing.X ?? []`
  const [amenities, setAmenities] = useState<string[]>([]);
  const [specialLocationViews, setSpecialLocationViews] = useState<string[]>([]);
  const [preferredTenants, setPreferredTenants] = useState<string[]>([]);

  // Group X — special, not stringified
  const [superBuiltArea, setSuperBuiltArea] = useState<number | null>(null);
  const [superBuiltAreaUnit, setSuperBuiltAreaUnit] = useState('SQ_FT');

  // Stable across renders — setState setters are stable, deps array is empty.
  const hydrate = useCallback((listing: ListingResponse) => {
    setBathrooms(listing.bathrooms != null ? String(listing.bathrooms) : '');
    setBalconies(listing.balconies != null ? String(listing.balconies) : '');
    setParking2wCount(listing.parking2wCount != null ? String(listing.parking2wCount) : '');
    setParking4wCount(listing.parking4wCount != null ? String(listing.parking4wCount) : '');
    setRoadWidthFt(listing.roadWidthFt != null ? String(listing.roadWidthFt) : '');
    setMaintenancePaise(listing.maintenancePaise != null ? String(listing.maintenancePaise) : '');

    setPropertyAge(listing.propertyAge ?? '');
    setResidentialWaterSource(listing.residentialWaterSource ?? '');
    setPlotDimensions(listing.plotDimensions ?? '');
    setConversionStatus(listing.conversionStatus ?? '');
    setKhataNumber(listing.khataNumber ?? '');
    setPropertyTaxPid(listing.propertyTaxPid ?? '');
    setApprovingAuthority(listing.approvingAuthority ?? '');
    setProjectName(listing.projectName ?? '');
    setBuilderName(listing.builderName ?? '');
    setPossessionStatus(listing.possessionStatus ?? '');
    setAvailabilityTimeline(listing.availabilityTimeline ?? '');

    setPriceNegotiable(boolToTriState(listing.priceNegotiable));
    setHasLift(boolToTriState(listing.hasLift));
    setHasPowerBackup(boolToTriState(listing.hasPowerBackup));
    setIsGated(boolToTriState(listing.isGated));
    setHasGarden(boolToTriState(listing.hasGarden));
    setHasTerrace(boolToTriState(listing.hasTerrace));
    setHasCompound(boolToTriState(listing.hasCompound));
    setHasServantRoom(boolToTriState(listing.hasServantRoom));
    setIsCornerPlot(boolToTriState(listing.isCornerPlot));
    setHasBoundaryWall(boolToTriState(listing.hasBoundaryWall));
    setIsGatedLayout(boolToTriState(listing.isGatedLayout));
    setHasWaterConnection(boolToTriState(listing.hasWaterConnection));
    setHasElectricityConnection(boolToTriState(listing.hasElectricityConnection));
    setHasDrainage(boolToTriState(listing.hasDrainage));
    setMaintenanceIncluded(boolToTriState(listing.maintenanceIncluded));
    setRentNegotiable(boolToTriState(listing.rentNegotiable));
    setPetsAllowed(boolToTriState(listing.petsAllowed));

    setAmenities(listing.amenities ?? []);
    setSpecialLocationViews(listing.specialLocationViews ?? []);
    setPreferredTenants(listing.preferredTenants ?? []);

    setSuperBuiltArea(listing.superBuiltArea ?? null);
    setSuperBuiltAreaUnit(listing.superBuiltAreaUnit ?? 'SQ_FT');
  }, []);

  return {
    values: {
      bathrooms,
      balconies,
      parking2wCount,
      parking4wCount,
      roadWidthFt,
      maintenancePaise,
      propertyAge,
      residentialWaterSource,
      plotDimensions,
      conversionStatus,
      khataNumber,
      propertyTaxPid,
      approvingAuthority,
      projectName,
      builderName,
      possessionStatus,
      availabilityTimeline,
      priceNegotiable,
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
      maintenanceIncluded,
      rentNegotiable,
      petsAllowed,
      amenities,
      specialLocationViews,
      preferredTenants,
      superBuiltArea,
      superBuiltAreaUnit,
    },
    setters: {
      setBathrooms,
      setBalconies,
      setParking2wCount,
      setParking4wCount,
      setRoadWidthFt,
      setMaintenancePaise,
      setPropertyAge,
      setResidentialWaterSource,
      setPlotDimensions,
      setConversionStatus,
      setKhataNumber,
      setPropertyTaxPid,
      setApprovingAuthority,
      setProjectName,
      setBuilderName,
      setPossessionStatus,
      setAvailabilityTimeline,
      setPriceNegotiable,
      setHasLift,
      setHasPowerBackup,
      setIsGated,
      setHasGarden,
      setHasTerrace,
      setHasCompound,
      setHasServantRoom,
      setIsCornerPlot,
      setHasBoundaryWall,
      setIsGatedLayout,
      setHasWaterConnection,
      setHasElectricityConnection,
      setHasDrainage,
      setMaintenanceIncluded,
      setRentNegotiable,
      setPetsAllowed,
      setAmenities,
      setSpecialLocationViews,
      setPreferredTenants,
      setSuperBuiltArea,
      setSuperBuiltAreaUnit,
    },
    hydrate,
  };
}
