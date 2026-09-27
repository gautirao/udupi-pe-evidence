import { useParams } from 'react-router-dom';
import { useUpdateListing, useSubmitListing } from '@/hooks/useBrokerListings';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useListingImages } from '@/hooks/useListingImages';
import { StepIndicator } from '@/components/broker/StepIndicator';
import { formatListingId } from '@/lib/listing-id';
import { useAgriFields } from './useAgriFields';
import { useCommercialFields } from './useCommercialFields';
import { useRentFields } from './useRentFields';
import { useResidentialFields } from './useResidentialFields';
import { useSharedFields } from './useSharedFields';
import { useBaseFields } from './useBaseFields';
import { useEditListingUiState } from './useEditListingUiState';
import { useListingHydration } from './useListingHydration';
import { useEditListingNavigation } from './useEditListingNavigation';
import { useEditListingCommands } from './useEditListingCommands';
import { DescribeStep } from './steps/DescribeStep';
import { PhotosStep } from './steps/PhotosStep';
import { LocationStep } from './steps/LocationStep';
import { BoundaryStep } from './steps/BoundaryStep';
import { ReviewStep } from './steps/ReviewStep';

interface EditListingFormProps {
  listing: ListingResponse;
}

export function EditListingForm({ listing }: EditListingFormProps) {
  const { id } = useParams<{ id: string }>();

  const updateListing = useUpdateListing(id ?? '');
  const submitListing = useSubmitListing(id);

  // Base fields — Issue #1838 PR B: 14 hydrated base/scalar fields extracted
  // into useBaseFields().
  const base = useBaseFields();
  const {
    title, description, priceRupees, propertyType, locality, landArea, landAreaUnit,
    bedrooms, builtArea, builtAreaUnit, reraNumber, videoUrl, listingPurpose, boundaryCoords,
  } = base.values;

  // Issue #1838 slice-7 — wizard step-navigation state (currentStep,
  // cameFromReview, wizardSteps, reviewStep, boundaryStep, isAgriListing,
  // advanceAfterSave) extracted into useEditListingNavigation(). listingPurpose
  // is not passed — wizardSteps/reviewStep/boundaryStep depend only on
  // propertyType, so it would be a dead parameter.
  const nav = useEditListingNavigation(propertyType);
  const { currentStep, reviewStep, isAgriListing } = nav;

  // UI-only fields — Issue #1838 PR B: 6 never-hydrated fields extracted into
  // useEditListingUiState(). These must NOT reset when the listing id changes.
  const ui = useEditListingUiState();
  const { canSubmitImages, videoUrlError, confirmedLocality } = ui.values;
  const { setCanSubmitImages } = ui.setters;

  // Shared fields — Issue #1838 slice-5e: 7 fields shared across two or more
  // domains (carpetArea/carpetAreaUnit/floorNumber/totalFloors/
  // furnishingStatus shared between residential/apartment and commercial;
  // facing/ownershipType shared between residential and agri) extracted into
  // useSharedFields(). Issue #1838 PR C — Form no longer destructures the
  // individual values/setters; DescribeStep receives the whole `shared`
  // hook-result object, and the save-payload build that used to read these
  // individual values now lives in useEditListingCommands.ts.
  const shared = useSharedFields();

  // Commercial-exclusive fields — Issue #1838 slice-5b: 5 commercial-only
  // fields extracted into useCommercialFields(). carpetArea/carpetAreaUnit/
  // floorNumber/totalFloors/furnishingStatus above are shared with
  // residential/apartment and stay component-owned.
  const commercial = useCommercialFields();

  // Rent-exclusive fields — Issue #1838 slice-5c: 3 rent-only fields
  // extracted into useRentFields(). Gated purely by isRent (listingPurpose
  // === 'rent'), independent of propertyType.
  const rent = useRentFields();

  // Agricultural land fields — Issue #1838 slice-5a: 8 agri-only fields extracted
  // into useAgriFields(). ownershipType is shared with residential and stays here.
  const agri = useAgriFields();

  // Residential-exclusive fields — Issue #1838 slice-5d: ~39 residential-only
  // fields (including the 5 dual-gated fields maintenanceIncluded/
  // rentNegotiable/petsAllowed/availabilityTimeline/preferredTenants, which
  // hydrate unconditionally here — their isRent gating stays in
  // buildUpdatePayload.ts + the JSX below) extracted into useResidentialFields().
  // facing/ownershipType/surveyNumber/carpetArea/floorNumber/totalFloors/
  // furnishingStatus/bedrooms/builtArea/landArea are shared with agri/commercial
  // or are base fields and stay component-owned.
  const residential = useResidentialFields();

  // Images for thumbnail strip in step 4 review
  const { images: listingImages } = useListingImages(id);

  // Pre-populate form once listing loads — Issue #1838 PR B: extracted into
  // useListingHydration() (owns hydratedListingIdRef + the guarded useEffect,
  // #2294). Passing an object literal here is fine — the hook destructures it
  // internally into a stable deps array of individual function refs.
  useListingHydration(listing, {
    base: base.hydrate,
    shared: shared.hydrate,
    commercial: commercial.hydrate,
    rent: rent.hydrate,
    agri: agri.hydrate,
    residential: residential.hydrate,
  });

  // Issue #1838 PR C — save/submit command handlers + derived values
  // extracted into useEditListingCommands(). See that file's header comment
  // for the preserve-exactly list (commercialSubtype vs explicitSubtype,
  // step1Complete vs editCtx.isRent, the crops merge order, no memoization,
  // no double-toasting onError, setBoundaryCoords-before-mutate ordering).
  const { derived, commands } = useEditListingCommands({
    listing,
    fields: { base, shared, commercial, rent, agri, residential },
    ui,
    nav,
    mutations: { updateListing, submitListing },
  });
  const {
    steps, isCommercialType, commercialSubtype, editCtx, isSubmittable,
    showTitleLocalityWarning, statusBadgeVariant, requiredFieldsComplete, allConditionsMet,
  } = derived;

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
        onStepClick={commands.stepper.stepClick}
      />

      {/* ── Step 1: Describe ── */}
      <div data-testid="step-1-panel" style={{ display: currentStep === 1 ? 'block' : 'none' }}>
        <DescribeStep
          view={{
            basics: { title, description, locality, priceRupees, propertyType, listingPurpose, reraNumber },
            dimensions: {
              landArea: { value: landArea, unit: landAreaUnit },
              builtArea: { value: builtArea, unit: builtAreaUnit },
              carpetArea: { value: shared.values.carpetArea, unit: shared.values.carpetAreaUnit },
              bedrooms,
            },
            capabilities: { isCommercialType, commercialSubtype, fieldVisible: editCtx.fieldVisible },
            status: { isSaving: updateListing.isPending },
            agri: agri.values,
            commercial: commercial.values,
            rent: rent.values,
            residential: residential.values,
            shared: shared.values,
          }}
          commands={commands.describe}
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
          handleVideoUrlChange={commands.photos.changeVideoUrl}
          handleStep2Continue={commands.photos.continue}
        />
      </div>

      {/* ── Step 3: Pin Location ── */}
      {/* CRITICAL: always-mounted (display:none toggle, not conditional currentStep===3 &&)
          so AddressPicker's in-flight map state survives step navigation. Issue #1838
          slice 6a — see steps/LocationStep.tsx. */}
      <div data-testid="step-3-panel" style={{ display: currentStep === 3 ? 'block' : 'none' }}>
        <LocationStep
          view={{ isSubmittable, listing, currentStep }}
          commands={commands.location}
        />
      </div>

      {/* ── Step 4: Draw Boundary (agricultural_land only) ── */}
      {currentStep === 4 && isAgriListing && (
        <div data-testid="step-4-panel">
          <BoundaryStep
            boundaryCoords={boundaryCoords}
            listing={listing}
            handleStep4Continue={commands.boundary.continue}
            handleStep4Skip={commands.boundary.skip}
          />
        </div>
      )}

      {/* ── Step 4 (non-agri) / Step 5 (agri): Review & Submit ── */}
      {currentStep === reviewStep && (
      <div data-testid="step-review-panel">
        <ReviewStep
          view={{
            listing,
            listingImages,
            id,
            isSubmittable,
            canSubmitImages,
            requiredFieldsComplete,
            allConditionsMet,
            isRent: editCtx.isRent,
            isAgriListing,
            boundaryCoords,
            showTitleLocalityWarning,
            confirmedLocality,
            isSubmitting: submitListing.isPending,
            isSaving: updateListing.isPending,
          }}
          commands={commands.review}
        />
      </div>
      )}

    </div>
  );
}
