import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useUpdateListing, useSubmitListing } from '@/hooks/useBrokerListings';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useListingImages } from '@/hooks/useListingImages';
import { StepIndicator } from '@/components/broker/StepIndicator';
import { ApiError } from '@/lib/api';
import { formatListingId } from '@/lib/listing-id';
import { buildListingUpdatePayload } from '@/lib/editListing/buildUpdatePayload';
import { COMMERCIAL_TYPES } from '@/lib/listing-constants';
import type { PropertyType } from '@/lib/listing-constants';
import { fromGeoJsonString, toGeoJsonString } from '@/lib/geoJsonUtils';
import { isListingFieldVisible } from '@/lib/listingFieldConfig';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import { validateVideoUrl } from '@/lib/editListing/valueMappers';
import { useAgriFields } from './useAgriFields';
import { useCommercialFields } from './useCommercialFields';
import { useRentFields } from './useRentFields';
import { useResidentialFields } from './useResidentialFields';
import { useSharedFields } from './useSharedFields';
import { useEditListingNavigation } from './useEditListingNavigation';
import { DescribeStep } from './steps/DescribeStep';
import { PhotosStep } from './steps/PhotosStep';
import { LocationStep } from './steps/LocationStep';
import { BoundaryStep } from './steps/BoundaryStep';
import { ReviewStep } from './steps/ReviewStep';

const SUBMITTABLE_STATUSES = ['DRAFT', 'REJECTED'];

interface EditListingFormProps {
  listing: ListingResponse;
}

export function EditListingForm({ listing }: EditListingFormProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const updateListing = useUpdateListing(id ?? '');
  const submitListing = useSubmitListing(id);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceRupees, setPriceRupees] = useState<number | null>(null);
  const [propertyType, setPropertyType] = useState<PropertyType | ''>('');

  // Issue #1838 slice-7 — wizard step-navigation state (currentStep,
  // cameFromReview, wizardSteps, reviewStep, boundaryStep, isAgriListing,
  // advanceAfterSave) extracted into useEditListingNavigation(). listingPurpose
  // is not passed — wizardSteps/reviewStep/boundaryStep depend only on
  // propertyType, so it would be a dead parameter.
  const nav = useEditListingNavigation(propertyType);
  const {
    currentStep, setCurrentStep, cameFromReview, setCameFromReview,
    wizardSteps: WIZARD_STEPS, reviewStep, boundaryStep, isAgriListing, advanceAfterSave,
  } = nav;
  const [locality, setLocality] = useState('');
  const [landArea, setLandArea] = useState<number | null>(null);
  // Unit for land area; default 'cent' (dominant Udupi/Karnataka unit).
  const [landAreaUnit, setLandAreaUnit] = useState('cent');
  const [bedrooms, setBedrooms] = useState('');
  const [builtArea, setBuiltArea] = useState<number | null>(null);
  // Unit for built area; default 'sqft'.
  const [builtAreaUnit, setBuiltAreaUnit] = useState('sqft');
  // Inline unit-validation errors (only shown when area has a value but unit is missing)
  const [landAreaUnitError, setLandAreaUnitError] = useState('');
  const [builtAreaUnitError, setBuiltAreaUnitError] = useState('');
  // Tracks whether image uploader has >= 3 images (drives step 2 completion + submit gate)
  const [canSubmitImages, setCanSubmitImages] = useState(false);
  const [reraNumber, setReraNumber] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoUrlError, setVideoUrlError] = useState('');

  /**
   * D1 hybrid — Title auto-regen from confirmed locality.
   * `titleManuallyEdited` is set the first time the broker manually types in
   * the title field. While false, onLocalityConfirmed auto-updates the title.
   */
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  /**
   * The last locality string that was confirmed via AddressPicker pin confirm
   * (AC5). Used in Step 4 to detect title/locality disagreement.
   */
  const [confirmedLocality, setConfirmedLocality] = useState('');

  // Listing purpose
  const [listingPurpose, setListingPurpose] = useState<'sale' | 'rent'>('sale');

  // Shared fields — Issue #1838 slice-5e: 7 fields shared across two or more
  // domains (carpetArea/carpetAreaUnit/floorNumber/totalFloors/
  // furnishingStatus shared between residential/apartment and commercial;
  // facing/ownershipType shared between residential and agri) extracted into
  // useSharedFields().
  const shared = useSharedFields();
  const {
    carpetArea, carpetAreaUnit, floorNumber, totalFloors, furnishingStatus, facing, ownershipType,
  } = shared.values;
  const {
    setCarpetArea, setCarpetAreaUnit, setFloorNumber, setTotalFloors, setFurnishingStatus, setFacing, setOwnershipType,
  } = shared.setters;

  // Commercial-exclusive fields — Issue #1838 slice-5b: 5 commercial-only
  // fields extracted into useCommercialFields(). carpetArea/carpetAreaUnit/
  // floorNumber/totalFloors/furnishingStatus above are shared with
  // residential/apartment and stay component-owned.
  const commercial = useCommercialFields();
  const {
    washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits,
  } = commercial.values;
  const {
    setWashrooms, setParkingCount, setRoadFrontageFt, setCommercialUsage, setNumberOfUnits,
  } = commercial.setters;

  // Rent-exclusive fields — Issue #1838 slice-5c: 3 rent-only fields
  // extracted into useRentFields(). Gated purely by isRent (listingPurpose
  // === 'rent'), independent of propertyType.
  const rent = useRentFields();
  const {
    monthlyRent, securityDepositMonths, lockInMonths,
  } = rent.values;
  const {
    setMonthlyRent, setSecurityDepositMonths, setLockInMonths,
  } = rent.setters;

  // Agricultural land fields — Issue #1838 slice-5a: 8 agri-only fields extracted
  // into useAgriFields(). ownershipType is shared with residential and stays here.
  const agri = useAgriFields();
  const {
    waterSource, soilType, roadAccess, cultivationStatus,
    surveyNumber, landCategory, agriConversionStatus, farmhouseAvailable, fencingDone,
  } = agri.values;
  const {
    setWaterSource, setSoilType, setRoadAccess, setCultivationStatus,
    setSurveyNumber, setLandCategory, setAgriConversionStatus, setFarmhouseAvailable, setFencingDone,
  } = agri.setters;
  // ownershipType is shared with residential — see useSharedFields() above.
  // Agricultural plot boundary — [lat, lng][] coords from DrawControl
  const [boundaryCoords, setBoundaryCoords] = useState<[number, number][]>([]);

  // M38-13A (#1626) — residential typed-listing fields.
  // facing is shared with agri — see useSharedFields() above.

  // Residential-exclusive fields — Issue #1838 slice-5d: ~39 residential-only
  // fields (including the 5 dual-gated fields maintenanceIncluded/
  // rentNegotiable/petsAllowed/availabilityTimeline/preferredTenants, which
  // hydrate unconditionally here — their isRent gating stays in
  // buildUpdatePayload.ts + the JSX below) extracted into useResidentialFields().
  // facing/ownershipType/surveyNumber/carpetArea/floorNumber/totalFloors/
  // furnishingStatus/bedrooms/builtArea/landArea are shared with agri/commercial
  // or are base fields and stay component-owned.
  const residential = useResidentialFields();
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
  const {
    setBathrooms, setBalconies, setParking2wCount, setParking4wCount, setRoadWidthFt,
    setMaintenancePaise, setPropertyAge, setResidentialWaterSource, setPlotDimensions,
    setConversionStatus, setKhataNumber, setPropertyTaxPid, setApprovingAuthority,
    setProjectName, setBuilderName, setPossessionStatus, setAvailabilityTimeline,
    setPriceNegotiable, setHasLift, setHasPowerBackup, setIsGated, setHasGarden,
    setHasTerrace, setHasCompound, setHasServantRoom, setIsCornerPlot, setHasBoundaryWall,
    setIsGatedLayout, setHasWaterConnection, setHasElectricityConnection, setHasDrainage,
    setMaintenanceIncluded, setRentNegotiable, setPetsAllowed, setAmenities,
    setSpecialLocationViews, setPreferredTenants, setSuperBuiltArea, setSuperBuiltAreaUnit,
  } = residential.setters;

  // Images for thumbnail strip in step 4 review
  const { images: listingImages } = useListingImages(id);

  // Pre-populate form once listing loads
  useEffect(() => {
    if (!listing) return;
    setTitle(listing.title ?? '');
    setDescription(listing.description ?? '');
    setPriceRupees(listing.price ?? null);
    setPropertyType((listing.propertyType as PropertyType) ?? '');
    setLocality(listing.locality ?? '');
    setLandArea(listing.landArea);
    // Existing listings saved before unit support have null unit — fall back to 'cent'
    // (dominant Udupi/Karnataka unit, matches NewListing default).
    // For agricultural_land, fall back to 'acre' (dominant unit for that type).
    setLandAreaUnit(listing.landAreaUnit ?? (listing.propertyType === 'agricultural_land' ? 'acre' : 'cent'));
    setBedrooms(listing.bedrooms != null ? String(listing.bedrooms) : '');
    setBuiltArea(listing.builtArea);
    setBuiltAreaUnit(listing.builtAreaUnit ?? 'sqft');
    setVideoUrl(listing.videoUrl ?? '');
    setReraNumber(listing.reraNumber ?? '');
    setListingPurpose((listing.listingPurpose as 'sale' | 'rent') ?? 'sale');
    shared.hydrate(listing);
    commercial.hydrate(listing);
    rent.hydrate(listing);
    agri.hydrate(listing);
    // Pre-populate boundary coords from existing agri listing
    if (listing.boundary) {
      setBoundaryCoords(fromGeoJsonString(listing.boundary));
    }

    // M38-13A (#1626) — residential typed-listing field prefill. All new columns are
    // nullable (legacy pre-V103 rows and non-residential types read null); nulls stay
    // '' / [] (neutral), never fabricated as a default value.
    residential.hydrate(listing);
  }, [listing, agri.hydrate, commercial.hydrate, rent.hydrate, residential.hydrate, shared.hydrate]);

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

  /**
   * Shorthand render-visibility predicate for the current propertyType +
   * listingPurpose. The `propertyType !== ''` guard keeps TypeScript happy
   * (state type is PropertyType | '') and returns false when no type is selected.
   */
  const fieldVisible = (key: ListingFieldKey): boolean =>
    propertyType !== '' && isListingFieldVisible(key, propertyType, listingPurpose);

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
      },
      { isRent, showLandArea, showBuiltArea, fieldVisible },
    );

    updateListing.mutate(payload, {
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

  return (
    <div className="container max-w-2xl py-8 px-4 space-y-6">

      {/* Page header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold">
            {listing.status === 'REJECTED' ? 'Fix & Resubmit Listing' : 'Edit Listing'}
          </h1>
          <Badge variant={statusBadgeVariant}>{listing.status}</Badge>
          {listing.listingNumber != null && (
            <span className="text-xs text-muted-foreground font-mono">
              {formatListingId(listing.listingNumber)}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Complete all sections below before submitting for review.
        </p>
      </div>

      {/* Rejection reason alert — only shown for REJECTED listings with a reason */}
      {listing.status === 'REJECTED' && listing.rejectionReason && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-medium">Rejection reason: </span>
            {listing.rejectionReason}
          </AlertDescription>
        </Alert>
      )}

      {/* Step indicator */}
      <StepIndicator
        steps={steps}
        currentStep={currentStep}
        onStepClick={handleStepClick}
      />

      {/* ── Step 1: Describe ── */}
      <div data-testid="step-1-panel" style={{ display: currentStep === 1 ? 'block' : 'none' }}>
        <DescribeStep
          agri={agri}
          commercial={commercial}
          rent={rent}
          residential={residential}
          shared={shared}
          title={title}
          setTitle={setTitle}
          setTitleManuallyEdited={setTitleManuallyEdited}
          description={description}
          setDescription={setDescription}
          priceRupees={priceRupees}
          setPriceRupees={setPriceRupees}
          propertyType={propertyType}
          setPropertyType={setPropertyType}
          locality={locality}
          setLocality={setLocality}
          landArea={landArea}
          setLandArea={setLandArea}
          landAreaUnit={landAreaUnit}
          setLandAreaUnit={setLandAreaUnit}
          bedrooms={bedrooms}
          setBedrooms={setBedrooms}
          builtArea={builtArea}
          setBuiltArea={setBuiltArea}
          builtAreaUnit={builtAreaUnit}
          setBuiltAreaUnit={setBuiltAreaUnit}
          reraNumber={reraNumber}
          setReraNumber={setReraNumber}
          listingPurpose={listingPurpose}
          setListingPurpose={setListingPurpose}
          fieldVisible={fieldVisible}
          isCommercialType={isCommercialType}
          handleStep1Save={handleStep1Save}
          updateListing={updateListing}
        />
      </div>

      {/* ── Step 2: Add Photos ── */}
      {/* CRITICAL: always-mounted (display:none toggle, not conditional currentStep===2 &&)
          so ImageUploader's in-flight upload state survives step navigation. Issue #1838
          slice 6a — see steps/PhotosStep.tsx. */}
      <div data-testid="step-2-panel" style={{ display: currentStep === 2 ? 'block' : 'none' }}>
        <PhotosStep
          id={id}
          isSubmittable={isSubmittable}
          videoUrl={videoUrl}
          videoUrlError={videoUrlError}
          canSubmitImages={canSubmitImages}
          setCanSubmitImages={setCanSubmitImages}
          handleVideoUrlChange={handleVideoUrlChange}
          handleStep2Continue={handleStep2Continue}
        />
      </div>

      {/* ── Step 3: Pin Location ── */}
      {/* CRITICAL: always-mounted (display:none toggle, not conditional currentStep===3 &&)
          so AddressPicker's in-flight map state survives step navigation. Issue #1838
          slice 6a — see steps/LocationStep.tsx. */}
      <div data-testid="step-3-panel" style={{ display: currentStep === 3 ? 'block' : 'none' }}>
        <LocationStep
          isSubmittable={isSubmittable}
          listing={listing}
          updateListing={updateListing}
          handleLocalityConfirmed={handleLocalityConfirmed}
          handleStep3Continue={handleStep3Continue}
          currentStep={currentStep}
        />
      </div>

      {/* ── Step 4: Draw Boundary (agricultural_land only) ── */}
      {currentStep === 4 && isAgriListing && (
        <div data-testid="step-4-panel">
          <BoundaryStep
            boundaryCoords={boundaryCoords}
            listing={listing}
            handleStep4Continue={handleStep4Continue}
            handleStep4Skip={handleStep4Skip}
          />
        </div>
      )}

      {/* ── Step 4 (non-agri) / Step 5 (agri): Review & Submit ── */}
      {currentStep === reviewStep && (
      <div data-testid="step-review-panel">
        <ReviewStep
          showTitleLocalityWarning={showTitleLocalityWarning}
          confirmedLocality={confirmedLocality}
          setTitle={setTitle}
          setTitleManuallyEdited={setTitleManuallyEdited}
          listing={listing}
          listingImages={listingImages}
          canSubmitImages={canSubmitImages}
          setCameFromReview={setCameFromReview}
          setCurrentStep={setCurrentStep}
          isAgriListing={isAgriListing}
          boundaryCoords={boundaryCoords}
          boundaryStep={boundaryStep}
          id={id}
          isSubmittable={isSubmittable}
          requiredFieldsComplete={requiredFieldsComplete}
          isRent={isRent}
          submitListing={submitListing}
          updateListing={updateListing}
          allConditionsMet={allConditionsMet}
          handleSubmitForReview={handleSubmitForReview}
        />
      </div>
      )}

    </div>
  );
}
