import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { InlineNearby } from '@/components/broker/residential/InlineNearby';
import { AgriculturalDescriptionAssistant } from '@/components/broker/agricultural/AgriculturalDescriptionAssistant';
import { computeListingStrength } from '@/components/broker/ListingStrengthMeter';
import { computeAgriPriceBreakdown } from '@/components/broker/agricultural/priceMath';
import { Section } from './agricultural/AgriculturalFormPrimitives';
import { useAgriculturalListingFormState } from './agricultural/useAgriculturalListingFormState';
import { useAgriculturalListingDraft } from './agricultural/useAgriculturalListingDraft';
import { useAgriculturalListingLocation } from './agricultural/useAgriculturalListingLocation';
import {
  buildAgriculturalListingPayload,
  computeAgriculturalChecklist,
  computeAgriculturalStrengthResult,
  computeAgriculturalDescriptionFacts,
  computeAgriculturalSpecChips,
} from './agricultural/agriculturalListingPayload';
import { AgriculturalLocalitySection } from './agricultural/AgriculturalLocalitySection';
import { AgriculturalLandDetailsSection } from './agricultural/AgriculturalLandDetailsSection';
import { AgriculturalLandCharacteristicsSection } from './agricultural/AgriculturalLandCharacteristicsSection';
import { AgriculturalLandRecordSection } from './agricultural/AgriculturalLandRecordSection';
import { AgriculturalPhotosLocationSection } from './agricultural/AgriculturalPhotosLocationSection';
import { AgriculturalSidebarSummary } from './agricultural/AgriculturalSidebarSummary';
import { AgriculturalFooterActions } from './agricultural/AgriculturalFooterActions';
import { AgriculturalReviewScreen } from './agricultural/AgriculturalReviewScreen';

/**
 * Issue #1627 — agricultural single-page create experience, the agricultural
 * sibling of ResidentialListingForm.tsx (#1626/#1718) and
 * CommercialListingForm.tsx (#1684/#1730). Deliberately CLONES their
 * compositional pattern (own local state, own inline draft-persist ->
 * review -> submit lifecycle) rather than extracting a shared hook.
 *
 * Mounted by NewListing.tsx ONLY for propertyType === 'agricultural_land',
 * and directly by AgriculturalNewListingPage.tsx at
 * /broker/listings/new/agricultural — the residential/commercial branches
 * are untouched.
 *
 * Reuses (AS-IS, no behaviour change): AddressSearch, MapPin,
 * useResidentialLocation, InlinePhotos, InlineNearby, StrengthMeter,
 * AreaField, PriceField, ChipGroup helpers, BuyerPreviewCard,
 * PropertyTypeCardSelector is NOT rendered here — this form mounts directly
 * for a single fixed propertyType (mirrors CommercialNewListingPage's
 * direct-mount pattern), with "Switch flow" returning to the generic picker.
 *
 * Vocabulary is sourced from src/lib/agriFieldLabels.ts (parity-tested
 * against listing-field-options.json's `agri` block) — never re-hardcoded.
 *
 * HONESTY (issue #1627 scope decision, updated by #2044 — crops/features/RTC):
 * as of #2044, `crops` IS persisted — POST /api/listings and PUT
 * /api/listings/{id} accept an optional `crops: string[]` of canonical
 * machine values (backend AgriFieldOptions.VALID_CROPS), and buildPayload()
 * below sends it as a real structured field. `features` and `rtc` remain
 * FE-only: the backend CreateListingRequest/UpdateListingRequest contract has
 * no write path for them (confirmed against useBrokerListings.ts and
 * ListingController.validateAgriFields). Rather than silently dropping
 * broker input for those two, they stay FORM-LOCAL state, shown in the
 * review preview labelled "as entered, not saved to record yet", and folded
 * into the free-text `description` field (which IS persisted) via
 * agriculturalDescriptionBuilder. Persisting features/rtc as structured
 * columns is out of scope for this issue and remains deferred to a follow-up
 * (PR-2), same as the on-land feature chips.
 *
 * #2398 — page-health decomposition: this component is now a thin
 * composition root over named owners in ./agricultural/ —
 * useAgriculturalListingFormState (typed field state + sale-only field
 * visibility), useAgriculturalListingDraft (persistence/mode lifecycle, no
 * URL draft recovery — current product behaviour has none),
 * useAgriculturalListingLocation (the single useResidentialLocation
 * instance), agriculturalListingPayload (payload/checklist/strength-input/
 * description-facts/spec-chip mapping), and per-section presentation
 * components. Behaviour is unchanged from the pre-decomposition version.
 * Mirrors the Residential (#2387) / Commercial (#2388) decompositions, but
 * derives its own (smaller) owner/section boundaries from agricultural's own
 * field set — no subtype model, no draft-recovery machinery to carry over.
 */

interface AgriculturalListingFormProps {
  onSwitchToGenericFlow: () => void;
  navigate: NavigateFunction;
}

export function AgriculturalListingForm({ onSwitchToGenericFlow, navigate }: AgriculturalListingFormProps) {
  const form = useAgriculturalListingFormState();
  const [hasAttempted, setHasAttempted] = useState(false);
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);

  const priceValid = form.priceRupees != null && form.priceRupees > 0;
  const canSubmit = priceValid;

  const buildPayload = () => buildAgriculturalListingPayload({
    propertyType: form.propertyType,
    title: form.title,
    locality: form.locality,
    priceRupees: form.priceRupees,
    description: form.description,
    landArea: form.landArea,
    landAreaUnit: form.landAreaUnit,
    facing: form.facing,
    waterSource: form.waterSource,
    soilType: form.soilType,
    roadAccess: form.roadAccess,
    cultivationStatus: form.cultivationStatus,
    ownershipType: form.ownershipType,
    surveyNumber: form.surveyNumber,
    landCategory: form.landCategory,
    agriConversionStatus: form.agriConversionStatus,
    farmhouseAvailable: form.farmhouseAvailable,
    fencingDone: form.fencingDone,
    crops: form.crops,
    fieldVisible: form.fieldVisible,
  });

  const draft = useAgriculturalListingDraft({
    canSubmit,
    buildPayload,
    onAttempt: () => setHasAttempted(true),
  });

  const residentialLocation = useAgriculturalListingLocation({
    listingId: draft.listingId,
    addressConfirmed: draft.addressConfirmed,
    draftListing: draft.draftListing,
    onPublicLoc: form.setLocality,
  });

  const checklist = computeAgriculturalChecklist({
    locality: form.locality,
    landArea: form.landArea,
    priceValid,
    title: form.title,
    waterSource: form.waterSource,
    soilType: form.soilType,
    imageCount: draft.imageCount,
    addressConfirmed: draft.addressConfirmed,
    description: form.description,
  });
  const strengthPercent = computeListingStrength(checklist);

  // Real submit-gate strength — mirrors ListingTransitionPolicy.validateFields'
  // agricultural_land case EXACTLY. LOCAL to this form (listingStrength.ts
  // is typed strictly to the 4 residential property types).
  const strengthResult = computeAgriculturalStrengthResult({
    priceValid,
    locality: form.locality,
    landArea: form.landArea,
    landAreaUnit: form.landAreaUnit,
    imageCount: draft.imageCount,
    locationEntered: residentialLocation.state.resolved != null,
    addressConfirmed: draft.addressConfirmed,
  });

  const descriptionFacts = computeAgriculturalDescriptionFacts({
    locality: form.locality,
    landArea: form.landArea,
    landAreaUnit: form.landAreaUnit,
    facing: form.facing,
    waterSource: form.waterSource,
    soilType: form.soilType,
    roadAccess: form.roadAccess,
    cultivationStatus: form.cultivationStatus,
    landCategory: form.landCategory,
    farmhouseAvailable: form.farmhouseAvailable,
    fencingDone: form.fencingDone,
    crops: form.crops,
    features: form.features,
    priceRupees: form.priceRupees,
  });

  const priceBreakdown = computeAgriPriceBreakdown(form.priceRupees, form.landArea, form.landAreaUnit);

  const specChips = computeAgriculturalSpecChips({
    landArea: form.landArea,
    landAreaUnit: form.landAreaUnit,
    facing: form.facing,
  });

  if (draft.submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center" data-testid="agricultural-submitted-panel">
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
    );
  }

  if (draft.mode === 'review' && draft.listingId) {
    return (
      <AgriculturalReviewScreen
        listingId={draft.listingId}
        addressConfirmed={draft.addressConfirmed}
        strengthResult={strengthResult}
        onBackToEdit={draft.handleBackToEdit}
        onSubmitForReview={draft.handleSubmitForReview}
        submitPending={draft.submitListing.isPending}
        facts={{
          propertyType: form.propertyType,
          listingPurpose: 'sale',
          title: form.title,
          description: form.description,
          locality: form.locality,
          landArea: form.landArea,
          landAreaUnit: form.landAreaUnit,
          facing: form.facing,
          waterSource: form.waterSource,
          soilType: form.soilType,
          roadAccess: form.roadAccess,
          cultivationStatus: form.cultivationStatus,
          landCategory: form.landCategory,
          agriConversionStatus: form.agriConversionStatus,
          ownershipType: form.ownershipType,
          surveyNumber: form.surveyNumber,
          farmhouseAvailable: form.farmhouseAvailable,
          fencingDone: form.fencingDone,
          rtc: form.rtc,
          crops: form.crops,
          features: form.features,
          priceRupees: form.priceRupees,
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-24">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Agricultural land listing
        </p>
        <h1 className="text-2xl font-bold text-foreground">Create a listing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add what buyers actually need. Optional details stay tucked away — fill only what you know, skip the rest.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <AgriculturalLocalitySection
            residentialLocation={residentialLocation}
            locality={form.locality}
            title={form.title}
            onTitleChange={form.setTitle}
            hasAttempted={hasAttempted}
            onSwitchToGenericFlow={onSwitchToGenericFlow}
          />

          <AgriculturalLandDetailsSection
            landArea={form.landArea}
            landAreaUnit={form.landAreaUnit}
            onLandAreaChange={(a, u) => { form.setLandArea(a); form.setLandAreaUnit(u); }}
            priceRupees={form.priceRupees}
            onPriceChange={form.setPriceRupees}
            hasAttempted={hasAttempted}
            priceBreakdown={priceBreakdown}
            facing={form.facing}
            onFacingChange={form.setFacing}
            fieldVisible={form.fieldVisible}
          />

          <AgriculturalLandCharacteristicsSection
            fieldVisible={form.fieldVisible}
            waterSource={form.waterSource}
            onWaterSourceChange={form.setWaterSource}
            soilType={form.soilType}
            onSoilTypeChange={form.setSoilType}
            roadAccess={form.roadAccess}
            onRoadAccessChange={form.setRoadAccess}
            cultivationStatus={form.cultivationStatus}
            onCultivationStatusChange={form.setCultivationStatus}
            crops={form.crops}
            onCropsChange={form.setCrops}
            features={form.features}
            onFeaturesChange={form.setFeatures}
          />

          <AgriculturalLandRecordSection
            open={moreDetailsOpen}
            onOpenChange={setMoreDetailsOpen}
            fieldVisible={form.fieldVisible}
            landCategory={form.landCategory}
            onLandCategoryChange={form.setLandCategory}
            agriConversionStatus={form.agriConversionStatus}
            onAgriConversionStatusChange={form.setAgriConversionStatus}
            ownershipType={form.ownershipType}
            onOwnershipTypeChange={form.setOwnershipType}
            surveyNumber={form.surveyNumber}
            onSurveyNumberChange={form.setSurveyNumber}
            rtc={form.rtc}
            onRtcChange={form.setRtc}
            farmhouseAvailable={form.farmhouseAvailable}
            onFarmhouseAvailableChange={form.setFarmhouseAvailable}
            fencingDone={form.fencingDone}
            onFencingDoneChange={form.setFencingDone}
          />

          <AgriculturalPhotosLocationSection
            listingId={draft.listingId}
            residentialLocation={residentialLocation}
            canSubmit={canSubmit}
            isCreatePending={draft.createListing.isPending}
            onContinue={() => draft.persistDraft()}
          />

          {/* Section 6 — Nearby places (gated on addressConfirmed, honest derived/broker-added labels)
              #2647 (owner decision, PR #2654 comment 5773021097 — Option B): the same location/pin
              fidelity Residential gets, wired through the SAME shared architecture. This flow already
              owns a useResidentialLocation instance via useAgriculturalListingLocation, so these are
              the identical values ResidentialListingForm passes — no second location model and no
              second picker. `publicLoc` is the COARSE locality only; `resolved.formatted` and the pin
              lat/lng never reach InlineNearby. `onOpenPicker` is gated on `resolved` exactly as
              MapPin.tsx gates its own CTA (`disabled={!resolved}`). */}
          {draft.listingId && (
            <Section number={6} title="Nearby places">
              <InlineNearby
                listingId={draft.listingId}
                propertyType={form.propertyType}
                addressConfirmed={draft.addressConfirmed}
                locationResolved={
                  residentialLocation.state.resolved != null || residentialLocation.state.localityResolved
                }
                publicLoc={residentialLocation.state.resolved?.publicLoc || form.locality}
                onOpenPicker={
                  residentialLocation.state.resolved != null ? residentialLocation.openPicker : undefined
                }
                onChangeLocation={residentialLocation.clear}
              />
            </Section>
          )}

          {/* Section 7 — Description — deterministic FE-only draft builder (no AI claim). */}
          <Section number={draft.listingId ? 7 : 6} title="Description">
            <AgriculturalDescriptionAssistant facts={descriptionFacts} value={form.description} onChange={form.setDescription} />
          </Section>
        </div>

        <AgriculturalSidebarSummary
          title={form.title}
          locality={form.locality}
          priceRupees={form.priceRupees}
          landArea={form.landArea}
          specChips={specChips}
          photoCount={draft.imageCount}
          coverImageUrl={draft.coverImageUrl}
          locationConfirmed={draft.addressConfirmed}
          listingId={draft.listingId}
          strengthResult={strengthResult}
          checklist={checklist}
        />
      </div>

      <AgriculturalFooterActions
        canSubmit={canSubmit}
        strengthPercent={strengthPercent}
        createPending={draft.createListing.isPending}
        updatePending={draft.updateListing.isPending}
        onSaveDraft={() => draft.persistDraft()}
        onReview={draft.handleGoToReview}
      />
    </div>
  );
}
