import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import type { ListingResponse, useUpdateListing, useSubmitListing } from '@/hooks/useBrokerListings';
import { ApiError } from '@/lib/api';
import { buildListingUpdatePayload, makeUpdatePayloadCtx } from '@/lib/editListing/buildUpdatePayload';
import { COMMERCIAL_TYPES } from '@/lib/listing-constants';
import type { PropertyType } from '@/lib/listing-constants';
import { toGeoJsonString } from '@/lib/geoJsonUtils';
import { deriveCommercialSubtype } from '@/lib/listingFieldConfig';
import type { CommercialSubtype } from '@/lib/listingFieldConfig';
import { validateVideoUrl } from '@/lib/editListing/valueMappers';
import type { AddressPickerValue } from '@/components/broker/AddressPicker';
import type { useBaseFields } from './useBaseFields';
import type { useSharedFields } from './useSharedFields';
import type { useCommercialFields } from './useCommercialFields';
import type { useRentFields } from './useRentFields';
import type { useAgriFields } from './useAgriFields';
import type { useResidentialFields } from './useResidentialFields';
import type { useEditListingUiState } from './useEditListingUiState';
import type { useEditListingNavigation } from './useEditListingNavigation';

// Issue #1838 PR C — extraction of EditListingForm's save/submit command
// handlers + derived values into a single hook. VERBATIM logic move: every
// handler below is copied exactly as it read in EditListingForm.tsx before
// this extraction — no unifying, no "cleanup" of similar-looking predicates.
// See approved-plan.toml (PR C) for the specific preserve-exactly list this
// file must not violate:
//   - commercialSubtype: explicitSubtype in the payload stays the RAW
//     explicit choice, never the derived commercialSubtype.
//   - step1Complete keeps using listingPurpose === 'rent' directly;
//     requiredFieldsComplete is the one that uses editCtx.isRent. Not unified.
//   - the crops merge stays guarded by isAgriListing, applied AFTER the main
//     payload build.
//   - zero useCallback/useMemo in this file — plain per-render closures.
//   - no onError added to step-2/step-4 continue (the hook-level onError in
//     useUpdateListing already toasts; adding another would double-toast).
//   - setBoundaryCoords still runs BEFORE mutate in the step-4 handler.

const SUBMITTABLE_STATUSES = ['DRAFT', 'REJECTED'];

export interface UseEditListingCommandsParams {
  listing: ListingResponse;
  fields: {
    base: ReturnType<typeof useBaseFields>;
    shared: ReturnType<typeof useSharedFields>;
    commercial: ReturnType<typeof useCommercialFields>;
    rent: ReturnType<typeof useRentFields>;
    agri: ReturnType<typeof useAgriFields>;
    residential: ReturnType<typeof useResidentialFields>;
  };
  ui: ReturnType<typeof useEditListingUiState>;
  nav: ReturnType<typeof useEditListingNavigation>;
  mutations: {
    updateListing: ReturnType<typeof useUpdateListing>;
    submitListing: ReturnType<typeof useSubmitListing>;
  };
}

export function useEditListingCommands({
  listing,
  fields: { base, shared, commercial, rent, agri, residential },
  ui,
  nav,
  mutations: { updateListing, submitListing },
}: UseEditListingCommandsParams) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const {
    title, description, priceRupees, propertyType, locality, landArea, landAreaUnit,
    bedrooms, builtArea, builtAreaUnit, reraNumber, videoUrl, listingPurpose,
  } = base.values;
  const { setTitle, setPropertyType, setVideoUrl, setBoundaryCoords } = base.setters;

  const {
    carpetArea, carpetAreaUnit, floorNumber, totalFloors, furnishingStatus, facing, ownershipType,
  } = shared.values;

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

  const { canSubmitImages, titleManuallyEdited, confirmedLocality } = ui.values;
  const {
    setLandAreaUnitError, setBuiltAreaUnitError, setVideoUrlError,
    setTitleManuallyEdited, setConfirmedLocality,
  } = ui.setters;

  const {
    currentStep, setCurrentStep, setCameFromReview,
    wizardSteps: WIZARD_STEPS, reviewStep, boundaryStep, isAgriListing, advanceAfterSave,
  } = nav;

  // Step 1 is complete when required fields match the submit gate (requiredFieldsComplete).
  // For rent listings: propertyType + monthlyRent + locality. For sale: propertyType + price + locality.
  const step1Complete = listingPurpose === 'rent'
    ? (!!propertyType && monthlyRent !== '' && parseInt(monthlyRent, 10) > 0 && !!locality)
    : (!!propertyType && (priceRupees ?? 0) > 0 && !!locality);
  // Step 2 is complete when >= 3 images have been uploaded (tracked by canSubmitImages)
  const step2Complete = canSubmitImages;
  // Step 3 is complete when address has been confirmed
  const step3Complete = listing.addressConfirmed === true;

  const steps = isAgriListing
    ? [
        { label: WIZARD_STEPS[0], isComplete: step1Complete },
        { label: WIZARD_STEPS[1], isComplete: step2Complete },
        { label: WIZARD_STEPS[2], isComplete: step3Complete },
        { label: WIZARD_STEPS[3], isComplete: false }, // Draw Boundary — not tracked as gate
        { label: WIZARD_STEPS[4], isComplete: false }, // terminal step
      ]
    : [
        { label: WIZARD_STEPS[0], isComplete: step1Complete },
        { label: WIZARD_STEPS[1], isComplete: step2Complete },
        { label: WIZARD_STEPS[2], isComplete: step3Complete },
        { label: WIZARD_STEPS[3], isComplete: false }, // terminal step
      ];

  const handleStepClick = (n: number) => {
    // Allow: step 1 always, any completed step, or any step before current
    if (n === 1 || steps[n - 1]?.isComplete || n < currentStep) {
      setCurrentStep(n);
    }
  };

  // Derived visibility flags — declared before handlers that reference them
  const isCommercialType = COMMERCIAL_TYPES.has(propertyType);

  /**
   * #2281 [#1684 parity] — F1: derive the effective commercial subtype from
   * LIVE form state (current propertyType + the broker's own SHOP/OFFICE
   * choice), exactly as CommercialListingForm.tsx:300 does for Create. NEVER
   * read listing.commercialSubtype raw here — five isListingFieldVisible
   * branches test commercialSubtype without an isCommercialFamily guard, so a
   * stale stored value would leak wrong-subtype fields into view after a
   * mid-edit propertyType switch (see approved-plan.toml footgun F1).
   */
  const commercialSubtype: CommercialSubtype | undefined =
    propertyType === '' ? undefined : deriveCommercialSubtype(propertyType, explicitSubtype);

  /**
   * #2281 cycle-2 hardening — render AND the Step-1 payload build share the
   * SAME `makeUpdatePayloadCtx` helper (buildUpdatePayload.ts).
   */
  const editCtxFull = makeUpdatePayloadCtx(propertyType, listingPurpose, commercialSubtype);
  const { isRent, fieldVisible } = editCtxFull;

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
    setLandAreaUnitError('');
    setBuiltAreaUnitError('');

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

  const handleVideoUrlChange = (value: string) => {
    setVideoUrl(value);
    const error = validateVideoUrl(value);
    setVideoUrlError(error ?? '');
  };

  const handleStep2Continue = () => {
    // Persist video URL before advancing; hook-level onError toast handles failures
    updateListing.mutate(
      { videoUrl: videoUrl.trim() || null, applyVideoUrl: true },
      {
        onSuccess: () => {
          advanceAfterSave(3);
        },
      },
    );
  };

  const handleStep3Continue = () => {
    setCameFromReview(false);
    // For agri listings, step 4 = Draw Boundary; for others, step 4 = Review & Submit.
    // Using isAgriListing ? 4 : reviewStep makes this safe if BASE_STEPS ever changes.
    setCurrentStep(isAgriListing ? 4 : reviewStep);
  };

  // Step 4 handlers — only reached for agricultural_land listings
  const handleStep4Continue = (coords: [number, number][]) => {
    setBoundaryCoords(coords);
    // Persist boundary to backend immediately (mirrors how step 3 saves location)
    updateListing.mutate(
      { boundary: toGeoJsonString(coords) },
      {
        onSuccess: () => {
          setCurrentStep(reviewStep);
        },
      },
    );
  };

  const handleStep4Skip = () => {
    // Boundary remains whatever it was (may be empty); advance to review
    setCurrentStep(reviewStep);
  };

  /**
   * AC5 / D1 hybrid — called by AddressPicker after broker confirms a pin.
   * Auto-regenerates the title from the confirmed locality when the broker
   * has not yet manually edited the title field.
   */
  const handleLocalityConfirmed = (locality: string, _lat: number, _lng: number) => {
    setConfirmedLocality(locality);
    if (!titleManuallyEdited) {
      // Generate a sensible default title from the confirmed locality.
      // Extract the first meaningful segment (everything up to the first comma)
      // to keep the title concise.
      const shortLocality = locality.split(',')[0].trim();
      if (shortLocality) {
        setTitle(`Property in ${shortLocality}`);
      }
    }
  };

  const handleSubmitForReview = () => {
    submitListing.mutate(undefined, {
      onSuccess: () => {
        toast({ title: 'Listing submitted for review' });
        navigate('/broker/listings');
      },
      onError: (error: Error) => {
        const apiErr = error as ApiError;
        const body = apiErr.body as Record<string, unknown> | undefined;
        const message =
          (body?.message as string | undefined) ??
          (body?.error as string | undefined) ??
          error.message;
        toast({
          title: 'Submit failed',
          description: message,
          variant: 'destructive',
        });
      },
    });
  };

  const isSubmittable = SUBMITTABLE_STATUSES.includes(listing.status);

  /**
   * D1 hybrid — Step 4 title/locality consistency gate.
   * Show the non-dismissible warning banner when:
   *   1. A locality has been confirmed via AddressPicker (confirmedLocality set), AND
   *   2. The broker has manually edited the title (titleManuallyEdited = true), AND
   *   3. The current title does NOT include the confirmed locality's first segment.
   *
   * When titleManuallyEdited is false, the title was auto-regenerated and will
   * always be consistent — no banner needed.
   */
  const confirmedLocalityShort = confirmedLocality.split(',')[0].trim().toLowerCase();
  const titleIncludesLocality =
    !confirmedLocalityShort || title.toLowerCase().includes(confirmedLocalityShort);
  const showTitleLocalityWarning =
    titleManuallyEdited &&
    !!confirmedLocality &&
    !titleIncludesLocality;

  const statusBadgeVariant = listing.status === 'REJECTED'
    ? 'destructive'
    : listing.status === 'DRAFT'
    ? 'secondary'
    : 'outline';

  const requiredFieldsComplete = isRent
    ? (monthlyRent !== '' && parseInt(monthlyRent, 10) > 0 && !!propertyType && !!locality)
    : (priceRupees != null && priceRupees > 0 && !!propertyType && !!locality);
  const allConditionsMet =
    canSubmitImages &&
    !!listing.addressConfirmed &&
    requiredFieldsComplete &&
    !showTitleLocalityWarning;

  return {
    derived: {
      step1Complete,
      step2Complete,
      step3Complete,
      steps,
      isCommercialType,
      commercialSubtype,
      editCtx: { isRent, fieldVisible },
      isSubmittable,
      confirmedLocalityShort,
      titleIncludesLocality,
      showTitleLocalityWarning,
      statusBadgeVariant,
      requiredFieldsComplete,
      allConditionsMet,
    },
    commands: {
      stepper: {
        stepClick: handleStepClick,
      },
      describe: {
        save: handleStep1Save,
        changePropertyType: handlePropertyTypeChange,
      },
      photos: {
        changeVideoUrl: handleVideoUrlChange,
        continue: handleStep2Continue,
      },
      location: {
        confirmAddress: (addr: AddressPickerValue) => {
          if (!updateListing.isPending) {
            updateListing.mutate({ latitude: addr.lat, longitude: addr.lng, addressConfirmed: true });
          }
        },
        unconfirmAddress: () => {
          if (!updateListing.isPending) {
            updateListing.mutate({ addressConfirmed: false });
          }
        },
        confirmLocality: handleLocalityConfirmed,
        saveAndContinue: handleStep3Continue,
      },
      boundary: {
        continue: handleStep4Continue,
        skip: handleStep4Skip,
      },
      review: {
        submitForReview: handleSubmitForReview,
        editStepFromReview: (step: number) => {
          setCameFromReview(true);
          setCurrentStep(step);
        },
        editBoundary: () => {
          setCameFromReview(false);
          setCurrentStep(boundaryStep);
        },
        resetTitleToLocality: () => {
          const shortLocality = confirmedLocality.split(',')[0].trim();
          if (shortLocality) {
            setTitle(`Property in ${shortLocality}`);
            setTitleManuallyEdited(false);
          }
        },
      },
    },
  };
}
