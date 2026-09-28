import type { useToast } from '@/hooks/use-toast';
import type { useUpdateListing } from '@/hooks/useBrokerListings';
import { buildListingUpdatePayload, type UpdatePayloadCtx } from '@/lib/editListing/buildUpdatePayload';
import type { PropertyType } from '@/lib/listing-constants';
import type { DescribeStepCommands } from './steps/stepContracts';
import type { useBaseFields } from './useBaseFields';
import type { useSharedFields } from './useSharedFields';
import type { useCommercialFields } from './useCommercialFields';
import type { useRentFields } from './useRentFields';
import type { useAgriFields } from './useAgriFields';
import type { useResidentialFields } from './useResidentialFields';

// Issue #1838 PR F — describe-step (step 1) save workflow + the
// DescribeStepCommands wiring, split out of the former
// useEditListingCommands.ts "God controller". VERBATIM logic move — every
// handler below is copied exactly as it read there, no unifying, no
// "cleanup" of similar-looking predicates. Preserve-exactly list this file
// must not violate:
//   - explicitSubtype stays the RAW explicit choice in the payload's
//     `commercialSubtype` key, never the derived commercialSubtype.
//   - the crops merge stays guarded by isAgriListing, applied AFTER the main
//     payload build.
//   - zero useCallback/useMemo in this file — plain per-render closures.
//   - no onError added to the step-1 mutate call (the hook-level onError in
//     useUpdateListing already toasts; adding another would double-toast).

export interface UseDescribeStepCommandsParams {
  base: ReturnType<typeof useBaseFields>;
  shared: ReturnType<typeof useSharedFields>;
  commercial: ReturnType<typeof useCommercialFields>;
  rent: ReturnType<typeof useRentFields>;
  agri: ReturnType<typeof useAgriFields>;
  residential: ReturnType<typeof useResidentialFields>;
  ui: {
    setLandAreaUnitError: (v: string) => void;
    setBuiltAreaUnitError: (v: string) => void;
    setTitleManuallyEdited: (v: boolean) => void;
  };
  editCtxFull: UpdatePayloadCtx;
  isAgriListing: boolean;
  advanceAfterSave: (sequentialNext: number) => void;
  updateListing: ReturnType<typeof useUpdateListing>;
  toast: ReturnType<typeof useToast>['toast'];
}

export function useDescribeStepCommands({
  base, shared, commercial, rent, agri, residential,
  ui, editCtxFull, isAgriListing, advanceAfterSave, updateListing, toast,
}: UseDescribeStepCommandsParams): DescribeStepCommands {
  const {
    title, description, priceRupees, propertyType, locality, landArea, landAreaUnit,
    bedrooms, builtArea, builtAreaUnit, reraNumber, listingPurpose,
  } = base.values;
  const {
    setTitle, setPropertyType, setDescription, setLocality, setPriceRupees,
    setListingPurpose, setReraNumber, setLandArea, setLandAreaUnit, setBedrooms,
    setBuiltArea, setBuiltAreaUnit,
  } = base.setters;

  const {
    carpetArea, carpetAreaUnit, floorNumber, totalFloors, furnishingStatus, facing, ownershipType,
  } = shared.values;
  const { setCarpetArea, setCarpetAreaUnit } = shared.setters;

  const {
    washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits,
    explicitSubtype, commercialAreaUnit, floorChoice, hubType, floorMode, powerLoadKva,
    occupancyStatus, officeSeats, officeCabins, officeMeetingRooms,
    warehouseClearHeightFt, warehouseLoadingBays, warehouseTruckAccess, warehouseFlooring,
    commercialZoning, commercialOwnership, commercialApprovals,
    washroomsPublic, washroomsPrivate, parkingPublicCount, parkingPrivateCount,
    commercialFurnishingStatus, utilities, utilitiesTouched, suitableUses, suitableUsesTouched,
    commercialAvailability, expectedRentalYieldPct, currentMonthlyIncomePaise,
    leaseTermMonths, leaseEscalationPct,
  } = commercial.values;
  const { setExplicitSubtype } = commercial.setters;

  const { monthlyRent, securityDepositMonths, lockInMonths } = rent.values;

  const {
    waterSource, soilType, roadAccess, cultivationStatus,
    surveyNumber, landCategory, agriConversionStatus, farmhouseAvailable, fencingDone, crops,
  } = agri.values;

  const {
    bathrooms, balconies, parking2wCount, parking4wCount, roadWidthFt, maintenancePaise,
    propertyAge, residentialWaterSource, plotDimensions, conversionStatus, khataNumber,
    propertyTaxPid, approvingAuthority, projectName, builderName, possessionStatus,
    availabilityTimeline, priceNegotiable, hasLift, hasPowerBackup, isGated, hasGarden,
    hasTerrace, hasCompound, hasServantRoom, isCornerPlot, hasBoundaryWall, isGatedLayout,
    hasWaterConnection, hasElectricityConnection, hasDrainage, maintenanceIncluded,
    rentNegotiable, petsAllowed, amenities, specialLocationViews, preferredTenants,
    superBuiltArea, superBuiltAreaUnit,
  } = residential.values;

  /**
   * #2281 — resets the broker's explicit SHOP/OFFICE choice whenever
   * propertyType changes away from 'commercial'. Purely an in-memory FE
   * guard (never touches stored server data — clearing STALE STORED values
   * is #2289, out of scope here): without this, switching
   * commercial(SHOP) -> warehouse -> commercial would silently restore the
   * stale 'SHOP' choice instead of requiring the broker to re-pick it.
   */
  const handlePropertyTypeChange = (value: PropertyType | '') => {
    setPropertyType(value);
    if (value !== 'commercial') {
      setExplicitSubtype('');
    }
  };

  // Saves step 1 form fields, then advances to step 2 (or back to review)
  const handleStep1Save = (e: React.FormEvent) => {
    e.preventDefault();

    // Unit validation is now handled by AreaField (unit is always set via Select).
    // Clear any stale errors from before the AreaField migration.
    ui.setLandAreaUnitError('');
    ui.setBuiltAreaUnitError('');

    const payload = buildListingUpdatePayload(
      {
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
        // #2281 [#1684 parity] — the 28 commercial subtype-gated fields.
        commercialSubtype: explicitSubtype,
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
        commercialAreaUnit,
        expectedRentalYieldPct,
        currentMonthlyIncomePaise,
        leaseTermMonths,
        leaseEscalationPct,
      },
      editCtxFull,
    );

    // Issue #2044 — crops. buildListingUpdatePayload() (src/lib/editListing/
    // buildUpdatePayload.ts) is out of this issue's allowed-file scope, so
    // crops is merged onto its returned payload here rather than threaded
    // through that builder. Always sent as the full current set (not a
    // delta) so removing a crop clears it too; omitted entirely for non-agri
    // listings (backend: omitted = leave unchanged).
    const payloadWithCrops = isAgriListing ? { ...payload, crops } : payload;

    updateListing.mutate(payloadWithCrops, {
      onSuccess: () => {
        toast({ title: 'Listing updated', description: 'Your listing has been saved.' });
        advanceAfterSave(2);
      },
    });
  };

  return {
    workflow: {
      save: handleStep1Save,
    },
    basics: {
      setTitle,
      setDescription,
      setLocality,
      setPriceRupees,
      setListingPurpose,
      setReraNumber,
      changePropertyType: handlePropertyTypeChange,
      markTitleManuallyEdited: () => ui.setTitleManuallyEdited(true),
    },
    dimensions: {
      setLandArea: (value, unit) => {
        setLandArea(value);
        setLandAreaUnit(unit);
      },
      setBuiltArea: (value, unit) => {
        setBuiltArea(value);
        setBuiltAreaUnit(unit);
      },
      setCarpetArea: (value, unit) => {
        setCarpetArea(value);
        setCarpetAreaUnit(unit);
      },
      setBedrooms,
    },
    agri: agri.setters,
    commercial: commercial.setters,
    rent: rent.setters,
    residential: residential.setters,
    shared: shared.setters,
  };
}
