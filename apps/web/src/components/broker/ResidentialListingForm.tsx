import { useRef, useState } from 'react';
import { Info, Loader2, CheckCircle2 } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { InlineNearby } from '@/components/broker/residential/InlineNearby';
import { DescriptionAssistant } from '@/components/broker/residential/DescriptionAssistant';
import { intOrUndef } from '@/lib/listing-utils';
import { computeListingStrength } from '@/lib/listingStrength';
import { Section } from './residential/ResidentialFormPrimitives';
import { useResidentialListingFormState, type ResidentialPropertyType } from './residential/useResidentialListingFormState';
import { useResidentialListingDraft } from './residential/useResidentialListingDraft';
import { useResidentialListingLocation } from './residential/useResidentialListingLocation';
import {
  buildResidentialListingPayload,
  computeResidentialChecklist,
  buildResidentialStrengthInput,
  computeResidentialDescriptionFacts,
  computeResidentialSpecChips,
} from './residential/residentialListingPayload';
import { ResidentialPurposeSection } from './residential/ResidentialPurposeSection';
import { ResidentialLocalitySection } from './residential/ResidentialLocalitySection';
import { ResidentialPropertyDetailsSection } from './residential/ResidentialPropertyDetailsSection';
import { ResidentialTermsSection } from './residential/ResidentialTermsSection';
import { ResidentialMoreDetailsSection } from './residential/ResidentialMoreDetailsSection';
import { ResidentialPhotosLocationSection } from './residential/ResidentialPhotosLocationSection';
import { ResidentialSidebarSummary } from './residential/ResidentialSidebarSummary';
import { ResidentialFooterActions } from './residential/ResidentialFooterActions';
import { ResidentialReviewScreen } from './residential/ResidentialReviewScreen';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';

/**
 * Issue #2040 (code review, cycle 5) — a `document.getElementById` lookup for
 * a gate's targetFieldId can resolve to a non-focusable container (e.g. the
 * SingleChipGroup ToggleGroup root, a plain `role="group"` div with no
 * tabIndex) instead of an actual control. `.focus()` on such an element is a
 * silent no-op. Used by handleGoToReview to decide whether to focus the
 * resolved target directly or fall back to its first focusable descendant.
 */
function isFocusableElement(el: HTMLElement): boolean {
  return el.tabIndex >= 0 || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(el.tagName);
}

/**
 * M38-13A (#1626) — residential single-page create experience.
 *
 * D-FE1: residential-scoped composition/wrapper — mounted by NewListing.tsx ONLY
 * when the selected property type is one of the four residential subtypes. The
 * generic (commercial/agricultural) body in NewListing.tsx is untouched and stays
 * reachable via `onSwitchToGenericFlow` (resets the parent's propertyType to '',
 * unmounting this component and returning to the original unfiltered selector).
 *
 * Manages its OWN local form state (separate from NewListing.tsx's generic-flow
 * state) — the two flows never share mutable state, only the create mutation hook.
 *
 * #2387 — page-health decomposition: this component is now a thin composition
 * root over named owners in ./residential/ — useResidentialListingFormState
 * (typed field state + one-shot hydration + subtype visibility),
 * useResidentialListingDraft (persistence/recovery/mode lifecycle),
 * useResidentialListingLocation (the single useResidentialLocation instance),
 * residentialListingPayload (payload/checklist/strength-input/description-facts/
 * spec-chip mapping), and per-section presentation components. Behaviour is
 * unchanged from the pre-decomposition version. Mirrors the CommercialListingForm
 * decomposition (#2388) — see that PR for the shared pattern — but derives its
 * own section/owner boundaries from residential's own field set and simpler
 * (non-explicit) subtype model.
 */

interface ResidentialListingFormProps {
  initialPropertyType: ResidentialPropertyType;
  /** #1748 — optional demand-gap prefill; defaults to 'sale' when absent. */
  initialListingPurpose?: 'sale' | 'rent';
  /**
   * Issue #2039 — a draft id recovered from the route's ?draftId= query param
   * at mount (URL-seeded only). When present, the editor hydrates from the
   * persisted draft instead of starting a blank Step-1 create — see the
   * one-shot hydrate effect in useResidentialListingDraft. Never re-seeded
   * after mount.
   */
  initialDraftId?: string | null;
  onSwitchToGenericFlow: () => void;
  navigate: NavigateFunction;
  /**
   * Issue #2039 — fired exactly once, right after THIS session's own first
   * successful draft create (never on later updates), so the route-owning
   * page can stash the new id into the URL via history REPLACE.
   */
  onDraftPersisted?: (id: string) => void;
}

export function ResidentialListingForm({ initialPropertyType, initialListingPurpose, initialDraftId, onSwitchToGenericFlow, navigate, onDraftPersisted }: ResidentialListingFormProps) {
  const form = useResidentialListingFormState({ initialPropertyType, initialListingPurpose });
  const [hasAttempted, setHasAttempted] = useState(false);
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);
  // Issue #2040 (AC5) — scroll target when a blocked Review attempt has no
  // unmet gate with a mapped focusable control.
  const strengthMeterRef = useRef<HTMLDivElement>(null);

  const { isRent, isApartment, isHouseOrVilla, isPlot, fieldVisible } = form;

  const priceValid = isRent
    ? (form.monthlyRent !== '' && parseInt(form.monthlyRent, 10) > 0)
    : (form.priceRupees != null && form.priceRupees > 0);
  // propertyType is always a residential value here (never ''); canSubmit tracks the
  // price/rent validity gate only.
  const canSubmit = priceValid;

  const primaryAreaSqft = isApartment ? form.carpetArea : isHouseOrVilla ? form.builtArea : form.landArea;

  const buildPayload = () => buildResidentialListingPayload({
    propertyType: form.propertyType,
    title: form.title,
    locality: form.locality,
    priceRupees: form.priceRupees,
    description: form.description,
    listingPurpose: form.listingPurpose,
    isRent,
    isPlot,
    isHouseOrVilla,
    isApartment,
    landArea: form.landArea,
    landAreaUnit: form.landAreaUnit,
    builtArea: form.builtArea,
    builtAreaUnit: form.builtAreaUnit,
    carpetArea: form.carpetArea,
    carpetAreaUnit: form.carpetAreaUnit,
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    balconies: form.balconies,
    furnishingStatus: form.furnishingStatus,
    facing: form.facing,
    floorNumber: form.floorNumber,
    totalFloors: form.totalFloors,
    superBuiltArea: form.superBuiltArea,
    propertyAge: form.propertyAge,
    residentialWaterSource: form.residentialWaterSource,
    parking2wCount: form.parking2wCount,
    parking4wCount: form.parking4wCount,
    isGated: form.isGated,
    projectName: form.projectName,
    builderName: form.builderName,
    amenities: form.amenities,
    specialLocationViews: form.specialLocationViews,
    hasLift: form.hasLift,
    hasPowerBackup: form.hasPowerBackup,
    hasGarden: form.hasGarden,
    hasTerrace: form.hasTerrace,
    hasCompound: form.hasCompound,
    hasServantRoom: form.hasServantRoom,
    plotDimensions: form.plotDimensions,
    roadWidthFt: form.roadWidthFt,
    isCornerPlot: form.isCornerPlot,
    hasBoundaryWall: form.hasBoundaryWall,
    isGatedLayout: form.isGatedLayout,
    hasWaterConnection: form.hasWaterConnection,
    hasElectricityConnection: form.hasElectricityConnection,
    hasDrainage: form.hasDrainage,
    priceNegotiable: form.priceNegotiable,
    maintenancePaise: form.maintenancePaise,
    possessionStatus: form.possessionStatus,
    monthlyRent: form.monthlyRent,
    securityDepositMonths: form.securityDepositMonths,
    lockInMonths: form.lockInMonths,
    maintenanceIncluded: form.maintenanceIncluded,
    rentNegotiable: form.rentNegotiable,
    petsAllowed: form.petsAllowed,
    availabilityTimeline: form.availabilityTimeline,
    preferredTenants: form.preferredTenants,
    ownershipType: form.ownershipType,
    conversionStatus: form.conversionStatus,
    khataNumber: form.khataNumber,
    propertyTaxPid: form.propertyTaxPid,
    approvingAuthority: form.approvingAuthority,
    surveyNumber: form.surveyNumber,
    fieldVisible,
  });

  const draft = useResidentialListingDraft({
    initialDraftId,
    canSubmit,
    buildPayload,
    onAttempt: () => setHasAttempted(true),
    onDraftPersisted,
    onHydrate: form.hydrateFrom,
  });

  const location = useResidentialListingLocation({
    listingId: draft.listingId,
    addressConfirmed: draft.addressConfirmed,
    draftListing: draft.draftListing,
    urlSeededRef: draft.urlSeededRef,
    didHydrateRef: draft.didHydrateRef,
    onPublicLoc: form.setLocality,
  });

  const checklist = computeResidentialChecklist({
    locality: form.locality,
    primaryAreaSqft,
    priceValid,
    title: form.title,
    isPlot,
    plotDimensions: form.plotDimensions,
    bedrooms: form.bedrooms,
    imageCount: draft.imageCount,
    addressConfirmed: draft.addressConfirmed,
    description: form.description,
  });

  // Real submit-gate strength — mirrors ListingTransitionPolicy.validateFields()
  // (see src/lib/listingStrength.ts). Drives the "Submit for review" gate and
  // the review-mode "Before you submit" panel — never the cosmetic checklist above.
  const strengthResult = computeListingStrength(buildResidentialStrengthInput({
    propertyType: form.propertyType,
    listingPurpose: form.listingPurpose,
    priceRupees: form.priceRupees,
    monthlyRent: form.monthlyRent,
    securityDepositMonths: form.securityDepositMonths,
    locality: form.locality,
    imageCount: draft.imageCount,
    addressConfirmed: draft.addressConfirmed,
    // Issue #2065 — `localityResolved` is a distinct, reload-safe signal:
    // it stays true after a search-only draft reload even though `resolved`
    // (which would carry an unconfirmed pin center) is intentionally never
    // reconstructed. See useResidentialLocation.ts LocationState docs.
    locationResolved: location.residentialLocationValue?.state.resolved != null || location.residentialLocationValue?.state.localityResolved === true,
    bedrooms: form.bedrooms,
    builtArea: form.builtArea,
    builtAreaUnit: form.builtAreaUnit,
    landArea: form.landArea,
    landAreaUnit: form.landAreaUnit,
  }));

  const descriptionFacts = computeResidentialDescriptionFacts({
    propertyType: form.propertyType,
    listingPurpose: form.listingPurpose,
    locality: form.locality,
    projectName: form.projectName,
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    primaryAreaSqft,
    furnishingStatus: form.furnishingStatus,
    facing: form.facing,
    floorNumber: form.floorNumber,
    totalFloors: form.totalFloors,
    hasLift: form.hasLift,
    hasPowerBackup: form.hasPowerBackup,
    isGated: form.isGated,
    hasGarden: form.hasGarden,
    amenities: form.amenities,
    possessionStatus: form.possessionStatus,
    availabilityTimeline: form.availabilityTimeline,
    priceRupees: form.priceRupees,
    monthlyRent: form.monthlyRent,
    securityDepositMonths: form.securityDepositMonths,
    priceNegotiable: form.priceNegotiable,
    roadWidthFt: form.roadWidthFt,
    plotDimensions: form.plotDimensions,
  });

  const primaryAreaFieldKey: ListingFieldKey = isApartment ? 'carpetArea' : isHouseOrVilla ? 'builtArea' : 'landArea';
  const specChips = computeResidentialSpecChips({
    fieldVisible,
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    primaryAreaFieldKey,
    primaryAreaSqft,
    furnishingStatus: form.furnishingStatus,
  });

  /**
   * Issue #2040 (AC5) — a Review attempt while a real submit gate is unmet
   * must not silently proceed to the review preview. Blocks the TRANSITION
   * into review mode and scrolls+focuses the first unmet gate's control
   * (gate order per listingStrength.ts); if no unmet gate has a mapped
   * focusable target (e.g. only the photos gate is unmet), still blocks and
   * scrolls the strength meter into view without calling .focus() on
   * anything. Deliberately minimal — no new scroll/anchor abstraction.
   *
   * PERSIST-THEN-BLOCK SHAPE (cycle 3 correction): Review ALWAYS calls
   * persistDraft() first, exactly as it did before AC5 existed — same call,
   * same single-PUT behaviour, same idempotency guard — and the gate check
   * runs only inside persistDraft's onDone callback, AFTER the save has
   * already succeeded. Blocking BEFORE persisting (the cycle-2 shape) would
   * silently discard every edit the broker made since their last save the
   * moment a required field went missing — a real data-loss regression, and
   * exactly the class of bug #2039/PR #2061 exists to prevent. This shape
   * satisfies AC5 (review mode is never entered with a required field
   * missing) and AC9 (Review on an existing draft still issues exactly one
   * PUT) at the same time — there is no conflict between them once the
   * gate check is moved after the save.
   *
   * Retained here (not in useResidentialListingDraft) because it needs
   * strengthResult (assembled above from form+location+draft state) and
   * strengthMeterRef (a DOM ref tied to the rendered sidebar) — both are
   * genuinely composition-root-level values, not draft-lifecycle state.
   */
  const handleGoToReview = () => {
    draft.persistDraft(() => {
      if (draft.listingId && !strengthResult.isSubmittable) {
        const firstUnmetWithTarget = strengthResult.gates.find((g) => !g.met && g.targetFieldId);
        const target = firstUnmetWithTarget?.targetFieldId
          ? document.getElementById(firstUnmetWithTarget.targetFieldId)
          : null;
        if (target) {
          // Optional-call (not just optional-chain) guards environments (e.g.
          // jsdom) where scrollIntoView isn't implemented — never throw here.
          target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
          // Issue #2040 (code review, cycle 5) — some targetFieldId values
          // (e.g. "bedrooms") resolve to a SingleChipGroup's ToggleGroup
          // root, a plain container with no tabIndex — .focus() on it is a
          // silent no-op and AC5's "focuses the first missing control"
          // promise is broken for those gates. Fall back to the first
          // actually-focusable descendant (the rendered ToggleGroupItem
          // buttons) when the resolved target itself can't take focus.
          const focusableTarget = isFocusableElement(target)
            ? target
            : target.querySelector<HTMLElement>('[role="radio"], button, input, select, textarea');
          focusableTarget?.focus();
        } else {
          // Issue #2040 — a truthy-but-unresolvable targetFieldId (id mismatch
          // between the gate config and the rendered DOM) must still degrade
          // to the strength-meter scroll, never silently no-op.
          strengthMeterRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      draft.setMode('review');
    });
  };

  if (draft.submitted) {
    return (
      <>
        {/* Issue #2039 (fix cycle 2) — keeps the single useResidentialLocation
            instance mounted across mode/submitted transitions, matching its
            original always-called-every-render lifecycle. Renders nothing. */}
        {location.locationBridge}
        <div className="mx-auto max-w-2xl px-4 py-16 text-center" data-testid="residential-submitted-panel">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">Submitted for review</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Pending admin approval. We'll notify you once it's live — you can keep editing it any time from your dashboard.
          </p>
          <Button type="button" className="mt-6" onClick={() => navigate('/broker/listings')}>
            Back to dashboard
          </Button>
        </div>
      </>
    );
  }

  if (draft.mode === 'review' && draft.listingId) {
    return (
      <>
        {/* Issue #2039 (fix cycle 2) — see note above; keeps the location
            hook instance alive while in review mode. */}
        {location.locationBridge}
        <ResidentialReviewScreen
          listingId={draft.listingId}
          addressConfirmed={draft.addressConfirmed}
          strengthResult={strengthResult}
          onBackToEdit={draft.handleBackToEdit}
          onSubmitForReview={draft.handleSubmitForReview}
          submitPending={draft.submitListing.isPending}
          facts={{
            ...descriptionFacts,
            title: form.title,
            description: form.description,
            balconies: form.balconies,
            builtArea: form.builtArea,
            superBuiltArea: form.superBuiltArea,
            parking2wCount: form.parking2wCount,
            parking4wCount: form.parking4wCount,
            ownershipType: form.ownershipType,
          }}
        />
      </>
    );
  }

  return (
    <>
      {/* Issue #2039 (fix cycle 2) — see useResidentialListingLocation;
          owns the single useResidentialLocation instance for this render.
          Its remount key flips exactly once, the render a URL-seeded
          draft's hydrate (or AC4 error-fallback) effect settles. */}
      {location.locationBridge}
      <div className="mx-auto max-w-6xl px-4 py-8 pb-24">
      {/* Header (design-spec.md §header) — replaces the old 4-step stepper */}
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Residential listing
        </p>
        <h1 className="text-2xl font-bold text-foreground">Create a listing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add what buyers actually need. Optional details stay tucked away — fill only what you know, skip the rest.
        </p>
      </div>

      {/* Issue #2039 (AC4) — stale/foreign/deleted draftId degrades to a clear
          inline message rather than an infinite spinner or a silent blank form. */}
      {draft.draftLoadError && (
        <div
          role="alert"
          data-testid="draft-recovery-error"
          className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{draft.draftLoadError}</span>
        </div>
      )}
      {/* Issue #2039 (AC2/AC4) — visible while a URL-seeded draft is loading,
          so the broker sees why the form is briefly empty rather than assuming
          it is a fresh, blank create. */}
      {draft.isRecoveringDraft && (
        <div
          data-testid="draft-recovery-loading"
          aria-live="polite"
          className="mb-4 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          <span>Loading your saved draft…</span>
        </div>
      )}

      {/* Issue #2039 (revision 4, finding 2) — persistent, actionable failure
          state for a failed update of an EXISTING draft. Unlike the generic
          destructive toast (useUpdateListing's hook-level onError, which
          still fires alongside this), this banner (a) states the draft is
          still saved server-side as it was, (b) carries the draft's identity,
          (c) offers Retry (re-runs persistDraft, which — because listingId is
          already set — always re-enters this same update branch, never the
          create branch, so it cannot create a duplicate listing or trigger a
          conflicting mode/state transition) and Continue-editing (dismiss;
          the form was never locked during an update failure — only initial
          draft RECOVERY disables it, via the fieldset below), and (d) clears
          on a successful retry (see useResidentialListingDraft). */}
      {draft.draftSaveError && (
        <div
          role="alert"
          data-testid="draft-save-error"
          className="mb-4 flex flex-col gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Couldn&apos;t save your changes to draft {draft.listingId}. Your draft is still saved as it was — nothing is lost. {draft.draftSaveError}
              {/* Issue #2039 (revision 4, finding 1) — Retry is disabled while
                  !canSubmit (matches the sticky footer's "Add price ... to
                  continue" hint pattern below); without this line a broker who
                  cleared price after the failure would see a disabled Retry
                  with no explanation. */}
              {!canSubmit && ' Add a price to retry saving.'}
            </span>
          </div>
          <div className="flex shrink-0 gap-2 self-end sm:self-auto">
            <Button type="button" size="sm" variant="outline" onClick={() => draft.setDraftSaveError(null)}>
              Continue editing
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => draft.persistDraft()}
              disabled={draft.updateListing.isPending || !canSubmit}
            >
              {draft.updateListing.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Retry
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left column — form */}
        {/* Issue #2039 (revision 4, finding 1) — a native <fieldset disabled>
            cascades disabled to every descendant form control (input, select,
            textarea, button — including the Radix-based Select/Switch/chip
            buttons used throughout these sections, all of which render a
            real <button> or <input> at the DOM level) without having to wire
            a `disabled` prop through ~40 individual field components. Disabled
            only while a URL-seeded draft is still resolving for the very
            first time (isRecoveringDraft), so a broker can never type into a
            form that is about to be silently overwritten by the hydrate
            effect once the draft fetch settles. Bounded by
            DRAFT_RECOVERY_TIMEOUT_MS in useResidentialListingDraft — this can
            never stay disabled indefinitely. */}
        <fieldset className="min-w-0 space-y-4 border-0 p-0 m-0" disabled={draft.isRecoveringDraft}>
          <ResidentialPurposeSection
            propertyType={form.propertyType}
            onPropertyTypeChange={form.setPropertyType}
            listingPurpose={form.listingPurpose}
            onListingPurposeChange={form.setListingPurpose}
            onSwitchToGenericFlow={onSwitchToGenericFlow}
          />

          <ResidentialLocalitySection
            residentialLocationValue={location.residentialLocationValue}
            locality={form.locality}
            isPlot={isPlot}
            projectName={form.projectName}
            onProjectNameChange={form.setProjectName}
            title={form.title}
            onTitleChange={form.setTitle}
            hasAttempted={hasAttempted}
          />

          <ResidentialPropertyDetailsSection
            isApartment={isApartment}
            isHouseOrVilla={isHouseOrVilla}
            isPlot={isPlot}
            fieldVisible={fieldVisible}
            carpetArea={form.carpetArea}
            carpetAreaUnit={form.carpetAreaUnit}
            onCarpetAreaChange={(a, u) => { form.setCarpetArea(a); form.setCarpetAreaUnit(u); }}
            builtArea={form.builtArea}
            builtAreaUnit={form.builtAreaUnit}
            onBuiltAreaChange={(a, u) => { form.setBuiltArea(a); form.setBuiltAreaUnit(u); }}
            landArea={form.landArea}
            landAreaUnit={form.landAreaUnit}
            onLandAreaChange={(a, u) => { form.setLandArea(a); form.setLandAreaUnit(u); }}
            bedrooms={form.bedrooms}
            onBedroomsChange={form.setBedrooms}
            bathrooms={form.bathrooms}
            onBathroomsChange={form.setBathrooms}
            balconies={form.balconies}
            onBalconiesChange={form.setBalconies}
            floorNumber={form.floorNumber}
            onFloorNumberChange={form.setFloorNumber}
            totalFloors={form.totalFloors}
            onTotalFloorsChange={form.setTotalFloors}
            furnishingStatus={form.furnishingStatus}
            onFurnishingStatusChange={form.setFurnishingStatus}
            facing={form.facing}
            onFacingChange={form.setFacing}
            propertyAge={form.propertyAge}
            onPropertyAgeChange={form.setPropertyAge}
            residentialWaterSource={form.residentialWaterSource}
            onResidentialWaterSourceChange={form.setResidentialWaterSource}
            plotDimensions={form.plotDimensions}
            onPlotDimensionsChange={form.setPlotDimensions}
            roadWidthFt={form.roadWidthFt}
            onRoadWidthFtChange={form.setRoadWidthFt}
            isCornerPlot={form.isCornerPlot}
            onIsCornerPlotChange={form.setIsCornerPlot}
            hasBoundaryWall={form.hasBoundaryWall}
            onHasBoundaryWallChange={form.setHasBoundaryWall}
            isGatedLayout={form.isGatedLayout}
            onIsGatedLayoutChange={form.setIsGatedLayout}
            hasWaterConnection={form.hasWaterConnection}
            onHasWaterConnectionChange={form.setHasWaterConnection}
            hasElectricityConnection={form.hasElectricityConnection}
            onHasElectricityConnectionChange={form.setHasElectricityConnection}
            hasDrainage={form.hasDrainage}
            onHasDrainageChange={form.setHasDrainage}
          />

          <ResidentialTermsSection
            isRent={isRent}
            fieldVisible={fieldVisible}
            hasAttempted={hasAttempted}
            priceRupees={form.priceRupees}
            onPriceChange={form.setPriceRupees}
            priceNegotiable={form.priceNegotiable}
            onPriceNegotiableChange={form.setPriceNegotiable}
            maintenancePaise={form.maintenancePaise}
            onMaintenancePaiseChange={form.setMaintenancePaise}
            possessionStatus={form.possessionStatus}
            onPossessionStatusChange={form.setPossessionStatus}
            reraNumberDraft={form.reraNumberDraft}
            onReraNumberDraftChange={form.setReraNumberDraft}
            monthlyRent={form.monthlyRent}
            onMonthlyRentChange={form.setMonthlyRent}
            securityDepositMonths={form.securityDepositMonths}
            onSecurityDepositMonthsChange={form.setSecurityDepositMonths}
            lockInMonths={form.lockInMonths}
            onLockInMonthsChange={form.setLockInMonths}
            maintenanceIncluded={form.maintenanceIncluded}
            onMaintenanceIncludedChange={form.setMaintenanceIncluded}
            availabilityTimeline={form.availabilityTimeline}
            onAvailabilityTimelineChange={form.setAvailabilityTimeline}
            preferredTenants={form.preferredTenants}
            onPreferredTenantsChange={form.setPreferredTenants}
            petsAllowed={form.petsAllowed}
            onPetsAllowedChange={form.setPetsAllowed}
            rentNegotiable={form.rentNegotiable}
            onRentNegotiableChange={form.setRentNegotiable}
          />

          <ResidentialMoreDetailsSection
            open={moreDetailsOpen}
            onOpenChange={setMoreDetailsOpen}
            isApartment={isApartment}
            isPlot={isPlot}
            fieldVisible={fieldVisible}
            superBuiltArea={form.superBuiltArea}
            onSuperBuiltAreaChange={form.setSuperBuiltArea}
            parking2wCount={form.parking2wCount}
            onParking2wCountChange={form.setParking2wCount}
            parking4wCount={form.parking4wCount}
            onParking4wCountChange={form.setParking4wCount}
            isGated={form.isGated}
            onIsGatedChange={form.setIsGated}
            builderName={form.builderName}
            onBuilderNameChange={form.setBuilderName}
            hasLift={form.hasLift}
            onHasLiftChange={form.setHasLift}
            hasPowerBackup={form.hasPowerBackup}
            onHasPowerBackupChange={form.setHasPowerBackup}
            hasGarden={form.hasGarden}
            onHasGardenChange={form.setHasGarden}
            hasTerrace={form.hasTerrace}
            onHasTerraceChange={form.setHasTerrace}
            hasCompound={form.hasCompound}
            onHasCompoundChange={form.setHasCompound}
            hasServantRoom={form.hasServantRoom}
            onHasServantRoomChange={form.setHasServantRoom}
            amenities={form.amenities}
            onAmenitiesChange={form.setAmenities}
            specialLocationViews={form.specialLocationViews}
            onSpecialLocationViewsChange={form.setSpecialLocationViews}
            ownershipType={form.ownershipType}
            onOwnershipTypeChange={form.setOwnershipType}
            conversionStatus={form.conversionStatus}
            onConversionStatusChange={form.setConversionStatus}
            khataNumber={form.khataNumber}
            onKhataNumberChange={form.setKhataNumber}
            propertyTaxPid={form.propertyTaxPid}
            onPropertyTaxPidChange={form.setPropertyTaxPid}
            approvingAuthority={form.approvingAuthority}
            onApprovingAuthorityChange={form.setApprovingAuthority}
            surveyNumber={form.surveyNumber}
            onSurveyNumberChange={form.setSurveyNumber}
          />

          {/* Section 6 — Photos & location (issue #1718 — inline, real system, no navigation) */}
          <ResidentialPhotosLocationSection
            listingId={draft.listingId}
            residentialLocationValue={location.residentialLocationValue}
            canSubmit={canSubmit}
            isCreatePending={draft.createListing.isPending}
            onContinue={() => draft.persistDraft()}
            videoLinkDraft={form.videoLinkDraft}
            onVideoLinkDraftChange={form.setVideoLinkDraft}
          />

          {/* Section 6b — Nearby places (issue #1718 — gated on addressConfirmed, honest derived/broker-added labels) */}
          {draft.listingId && (
            <Section number={7} title="Nearby places">
              <InlineNearby
                listingId={draft.listingId}
                propertyType={form.propertyType}
                addressConfirmed={draft.addressConfirmed}
                locationResolved={
                  location.residentialLocationValue?.state.resolved != null ||
                  location.residentialLocationValue?.state.localityResolved === true
                }
                onChangeLocation={location.residentialLocationValue?.clear}
              />
            </Section>
          )}

          {/* Section 8 — Description (issue #1718 — deterministic local draft builder, never "AI-generated") */}
          <Section number={draft.listingId ? 8 : 7} title="Description">
            <DescriptionAssistant facts={descriptionFacts} value={form.description} onChange={form.setDescription} />
          </Section>
        </fieldset>

        <ResidentialSidebarSummary
          title={form.title}
          locality={form.locality}
          priceRupees={form.priceRupees}
          monthlyRent={intOrUndef(form.monthlyRent) ?? null}
          isRent={isRent}
          areaSqft={primaryAreaSqft}
          specChips={specChips}
          photoCount={draft.imageCount}
          coverImageUrl={draft.coverImageUrl}
          locationConfirmed={draft.addressConfirmed}
          listingId={draft.listingId}
          strengthResult={strengthResult}
          checklist={checklist}
          strengthMeterRef={strengthMeterRef}
        />
      </div>

      <ResidentialFooterActions
        canSubmit={canSubmit}
        strengthResult={strengthResult}
        createPending={draft.createListing.isPending}
        updatePending={draft.updateListing.isPending}
        isRecoveringDraft={draft.isRecoveringDraft}
        onSaveDraft={() => draft.persistDraft()}
        onReview={handleGoToReview}
      />
      </div>
    </>
  );
}
