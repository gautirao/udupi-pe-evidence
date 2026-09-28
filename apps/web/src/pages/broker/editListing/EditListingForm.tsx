import { useParams } from 'react-router-dom';
import { useUpdateListing, useSubmitListing } from '@/hooks/useBrokerListings';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useListingImages } from '@/hooks/useListingImages';
import { StepIndicator } from '@/components/broker/StepIndicator';
import { formatListingId } from '@/lib/listing-id';
import { COMMERCIAL_TYPES } from '@/lib/listing-constants';
import { useAgriFields } from './useAgriFields';
import { useCommercialFields } from './useCommercialFields';
import { useRentFields } from './useRentFields';
import { useResidentialFields } from './useResidentialFields';
import { useSharedFields } from './useSharedFields';
import { useBaseFields } from './useBaseFields';
import { useEditListingUiState } from './useEditListingUiState';
import { useListingHydration } from './useListingHydration';
import { useEditListingNavigation } from './useEditListingNavigation';
import { useDescribeStepCommands } from './useDescribeStepCommands';
import { useMediaStepCommands } from './useMediaStepCommands';
import { useLocationStepCommands } from './useLocationStepCommands';
import { useBoundaryStepCommands } from './useBoundaryStepCommands';
import { useReviewStepCommands } from './useReviewStepCommands';
import {
  selectStep1Complete, selectStep2Complete, selectStep3Complete, selectWizardSteps,
  selectCommercialSubtype, selectEditCtx, selectIsSubmittable, selectStatusBadgeVariant,
  selectTitleLocalityWarning, selectRequiredFieldsComplete, selectAllConditionsMet,
} from './editListingSelectors';
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
  const { toast } = useToast();

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
  const { currentStep, setCurrentStep, setCameFromReview, wizardSteps, reviewStep, boundaryStep, isAgriListing, advanceAfterSave } = nav;

  // UI-only fields — Issue #1838 PR B: 6 never-hydrated fields extracted into
  // useEditListingUiState(). These must NOT reset when the listing id changes.
  const ui = useEditListingUiState();
  const { canSubmitImages, videoUrlError, titleManuallyEdited, confirmedLocality } = ui.values;
  const {
    setCanSubmitImages, setLandAreaUnitError, setBuiltAreaUnitError, setVideoUrlError,
    setTitleManuallyEdited, setConfirmedLocality,
  } = ui.setters;

  // Shared fields — Issue #1838 slice-5e: 7 fields shared across two or more
  // domains (carpetArea/carpetAreaUnit/floorNumber/totalFloors/
  // furnishingStatus shared between residential/apartment and commercial;
  // facing/ownershipType shared between residential and agri) extracted into
  // useSharedFields(). Issue #1838 PR C — Form no longer destructures the
  // individual values/setters; DescribeStep receives the whole `shared`
  // hook-result object, and the save-payload build that used to read these
  // individual values now lives in useDescribeStepCommands.ts.
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

  // Issue #1838 PR F — derived gates now come from pure selectors
  // (editListingSelectors.ts), each fed only the primitives it needs.
  const step1Complete = selectStep1Complete({
    listingPurpose, propertyType, monthlyRent: rent.values.monthlyRent, priceRupees, locality,
  });
  const step2Complete = selectStep2Complete(canSubmitImages);
  const step3Complete = selectStep3Complete(listing.addressConfirmed);
  const steps = selectWizardSteps({ isAgriListing, wizardSteps, step1Complete, step2Complete, step3Complete });

  const isCommercialType = COMMERCIAL_TYPES.has(propertyType);
  const commercialSubtype = selectCommercialSubtype(propertyType, commercial.values.explicitSubtype);
  const editCtxFull = selectEditCtx(propertyType, listingPurpose, commercialSubtype);
  const { isRent, fieldVisible } = editCtxFull;

  const isSubmittable = selectIsSubmittable(listing.status);
  const statusBadgeVariant = selectStatusBadgeVariant(listing.status);
  const { showTitleLocalityWarning } = selectTitleLocalityWarning({
    titleManuallyEdited, confirmedLocality, title,
  });
  const requiredFieldsComplete = selectRequiredFieldsComplete({
    isRent, monthlyRent: rent.values.monthlyRent, priceRupees, propertyType, locality,
  });
  const allConditionsMet = selectAllConditionsMet({
    canSubmitImages, addressConfirmed: listing.addressConfirmed, requiredFieldsComplete, showTitleLocalityWarning,
  });

  // Issue #1838 PR F — command hooks, one per workflow, split out of the
  // former useEditListingCommands.ts God controller. EditListingForm itself
  // composes their outputs into the `commands` shape each step expects — no
  // aggregator hook re-bundles them.
  const describeCommands = useDescribeStepCommands({
    base, shared, commercial, rent, agri, residential,
    ui: { setLandAreaUnitError, setBuiltAreaUnitError, setTitleManuallyEdited },
    editCtxFull, isAgriListing, advanceAfterSave, updateListing, toast,
  });
  const mediaCommands = useMediaStepCommands({
    videoUrl, setVideoUrl: base.setters.setVideoUrl, setVideoUrlError, advanceAfterSave, updateListing,
  });
  const locationCommands = useLocationStepCommands({
    titleManuallyEdited, setTitle: base.setters.setTitle, setConfirmedLocality,
    setCameFromReview, setCurrentStep, isAgriListing, reviewStep, updateListing,
  });
  const boundaryCommands = useBoundaryStepCommands({
    setBoundaryCoords: base.setters.setBoundaryCoords, setCurrentStep, reviewStep, updateListing,
  });
  const reviewCommands = useReviewStepCommands({
    confirmedLocality, setTitle: base.setters.setTitle, setTitleManuallyEdited,
    setCameFromReview, setCurrentStep, boundaryStep, submitListing, toast,
  });

  // Stepper click-gating — tiny enough to stay a plain closure here rather
  // than its own command hook (see useEditListingNavigation.ts header: the
  // `steps` completion-gate array is deliberately not nav-pure).
  const handleStepClick = (n: number) => {
    // Allow: step 1 always, any completed step, or any step before current
    if (n === 1 || steps[n - 1]?.isComplete || n < currentStep) {
      setCurrentStep(n);
    }
  };

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
          view={{
            basics: { title, description, locality, priceRupees, propertyType, listingPurpose, reraNumber },
            dimensions: {
              landArea: { value: landArea, unit: landAreaUnit },
              builtArea: { value: builtArea, unit: builtAreaUnit },
              carpetArea: { value: shared.values.carpetArea, unit: shared.values.carpetAreaUnit },
              bedrooms,
            },
            capabilities: { isCommercialType, commercialSubtype, fieldVisible },
            status: { isSaving: updateListing.isPending },
            agri: agri.values,
            commercial: commercial.values,
            rent: rent.values,
            residential: residential.values,
            shared: shared.values,
          }}
          commands={describeCommands}
        />
      </div>

      {/* ── Step 2: Add Photos ── */}
      {/* CRITICAL: always-mounted (display:none toggle, not conditional currentStep===2 &&)
          so ImageUploader's in-flight upload state survives step navigation. Issue #1838
          slice 6a — see steps/PhotosStep.tsx. WHY (PR F requirement 7): canSubmitImages
          (step-2 completion + the Review allConditionsMet gate) is reported ONLY by
          ImageUploader's onCanSubmitChange effect, so lazy-mounting it on
          currentStep===2 would leave step 2 reporting incomplete for an
          already-complete listing until the broker revisits a step they have no
          reason to — see EditListingForm.imageReadinessOnMount.test.tsx. */}
      <div data-testid="step-2-panel" style={{ display: currentStep === 2 ? 'block' : 'none' }}>
        <PhotosStep
          view={{ id, isSubmittable, videoUrl, videoUrlError, canSubmitImages }}
          commands={{
            changeVideoUrl: mediaCommands.changeVideoUrl,
            continue: mediaCommands.continue,
            reportImageReadiness: setCanSubmitImages,
          }}
        />
      </div>

      {/* ── Step 3: Pin Location ── */}
      {/* CRITICAL: always-mounted (display:none toggle, not conditional currentStep===3 &&)
          so AddressPicker's in-flight map state survives step navigation. Issue #1838
          slice 6a — see steps/LocationStep.tsx. */}
      <div data-testid="step-3-panel" style={{ display: currentStep === 3 ? 'block' : 'none' }}>
        <LocationStep
          view={{ isSubmittable, listing, currentStep }}
          commands={locationCommands}
        />
      </div>

      {/* ── Step 4: Draw Boundary (agricultural_land only) ── */}
      {currentStep === 4 && isAgriListing && (
        <div data-testid="step-4-panel">
          <BoundaryStep
            view={{ boundaryCoords, listing }}
            commands={boundaryCommands}
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
            isRent,
            isAgriListing,
            boundaryCoords,
            showTitleLocalityWarning,
            confirmedLocality,
            isSubmitting: submitListing.isPending,
            isSaving: updateListing.isPending,
          }}
          commands={reviewCommands}
        />
      </div>
      )}

    </div>
  );
}
