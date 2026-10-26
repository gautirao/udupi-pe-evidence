import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { InlineNearby } from '@/components/broker/residential/InlineNearby';
import { MapPin } from '@/components/broker/residential/MapPin';
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
  /**
   * #2811 — when the page URL already carries `?draftId=<id>` (e.g. after a
   * browser refresh mid-create), seed `listingId` from it and hydrate the
   * form from `GET /api/listings/{id}` so subsequent saves update the same
   * draft (`PUT`) instead of creating a duplicate (`POST`).
   */
  initialDraftId?: string | null;
  /**
   * #2811 — called whenever a draft is persisted (initial `POST` or subsequent
   * `PUT`) so the parent route (`AgriculturalNewListingPage.tsx` or
   * `NewListing.tsx`) can reflect `?draftId=<id>` in the URL via
   * `setSearchParams(..., { replace: true })`.
   */
  onDraftPersisted?: (id: string) => void;
}

export function AgriculturalListingForm({
  onSwitchToGenericFlow,
  navigate,
  initialDraftId,
  onDraftPersisted,
}: AgriculturalListingFormProps) {
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
    initialDraftId,
    onDraftPersisted,
    canSubmit,
    buildPayload,
    onAttempt: () => setHasAttempted(true),
    onHydrate: form.hydrateFrom,
  });

  const location = useAgriculturalListingLocation({
    listingId: draft.listingId,
    addressConfirmed: draft.addressConfirmed,
    draftListing: draft.draftListing,
    urlSeededRef: draft.urlSeededRef,
    didHydrateRef: draft.didHydrateRef,
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
  // #2811 — include `localityResolved` alongside `resolved != null` so a
  // locality-only draft reloaded via `?draftId=<id>` (or confirmed pin with
  // locality) reports the same gate state as ResidentialListingForm (#2053).
  const strengthResult = computeAgriculturalStrengthResult({
    priceValid,
    locality: form.locality,
    landArea: form.landArea,
    landAreaUnit: form.landAreaUnit,
    imageCount: draft.imageCount,
    locationEntered:
      location.residentialLocation.state.resolved != null ||
      location.residentialLocation.state.localityResolved,
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

  // #2811 — keep `location.locationBridge` mounted across edit <-> review <->
  // submitted transitions (at index 0 of the fragment in every branch) so
  // `useResidentialLocation` state (search query, resolved place, pin) survives
  // "Review -> Back to edit" without unmounting and resetting to `draftListing`.
  if (draft.submitted) {
    return (
      <>
        {location.locationBridge}
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
      </>
    );
  }

  if (draft.mode === 'review' && draft.listingId) {
    return (
      <>
        {location.locationBridge}
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
      </>
    );
  }

  return (
    <>
      {location.locationBridge}
      <div className="mx-auto max-w-6xl px-4 py-8 pb-24">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Agricultural land listing
          </p>
          <h1 className="text-2xl font-bold text-foreground">Create a listing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add what buyers actually need. Optional details stay tucked away — fill only what you know, skip the rest.
          </p>
          {draft.draftLoadError && (
            <p
              role="alert"
              data-testid="draft-recovery-error"
              className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {draft.draftLoadError}
            </p>
          )}
          {draft.isRecoveringDraft && (
            <p
              role="status"
              data-testid="draft-recovery-loading"
              className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            >
              Loading your saved draft…
            </p>
          )}
          {draft.draftSaveError && (
            <p
              role="alert"
              data-testid="draft-save-error"
              className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              Could not save draft: {draft.draftSaveError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <fieldset disabled={draft.isRecoveringDraft} className="min-w-0 space-y-4 border-0 p-0 m-0">
            <AgriculturalLocalitySection
              residentialLocation={location.residentialLocation}
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
              priceHydrationSeed={form.priceHydrationSeed}
              onPriceChange={form.handlePriceInput}
              isRecoveringDraft={draft.isRecoveringDraft}
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

            {/* #2655 — photos only, pin-location moved to the Location & Nearby Places section. */}
            <AgriculturalPhotosLocationSection
              listingId={draft.listingId}
              canSubmit={canSubmit}
              isCreatePending={draft.createListing.isPending}
              onContinue={() => draft.persistDraft()}
            />

            {/* Section 6 — Location & Nearby Places (issue #2655 — recomposition: pin-location relocated
                here from Section 5, single authoritative useResidentialLocation instance (via
                useAgriculturalListingLocation) reused verbatim, same <MapPin>/<PinDialog> as before — no
                second picker or location model introduced). Nearby-place behaviour is unchanged (gated on
                addressConfirmed, honest derived/broker-added labels).
                #2647 (owner decision, PR #2654 comment 5773021097 — Option B): the same location/pin
                fidelity Residential gets, wired through the SAME shared architecture. This flow already
                owns a useResidentialLocation instance via useAgriculturalListingLocation, so these are
                the identical values ResidentialListingForm passes — no second location model and no
                second picker. `publicLoc` is the COARSE locality only; `resolved.formatted` and the pin
                lat/lng never reach InlineNearby.
                #2655 review fix — `onOpenPicker` is now DELIBERATELY OMITTED. #2647 wired it so InlineNearby's
                own CTA (rendered when locationResolved && onOpenPicker && !addressConfirmed) could reach
                Section 5's picker BEFORE it lived next to InlineNearby. Now that <MapPin> is co-located in this
                same section, MapPin's own "Pin location on map" button (immediately above) is the single
                picker-action owner; passing onOpenPicker here would render a second, redundant control with the
                identical accessible name. InlineNearby still renders its locality/status copy via
                `locationResolved`/`publicLoc` — only the duplicate action button is dropped. */}
            {draft.listingId && (
              <Section number={6} title="Location & Nearby Places">
                <MapPin location={location.residentialLocation} />
                <p className="text-xs text-muted-foreground">
                  The pin marks the location only — it is not a legal or survey boundary.
                </p>
                <InlineNearby
                  listingId={draft.listingId}
                  propertyType={form.propertyType}
                  addressConfirmed={draft.addressConfirmed}
                  locationResolved={
                    location.residentialLocation.state.resolved != null ||
                    location.residentialLocation.state.localityResolved
                  }
                  publicLoc={location.residentialLocation.state.resolved?.publicLoc || form.locality}
                  onChangeLocation={location.residentialLocation.clear}
                />
              </Section>
            )}

            {/* Section 7 — Description — deterministic FE-only draft builder (no AI claim).
                #2811 — key on `location.locationRemountKey` (mirrors CommercialListingForm #2348)
                so when a URL-recovered draft arrives with a non-empty `description`, the
                assistant remounts in its `'ready'` state with the hydrated textarea visible. */}
            <Section number={draft.listingId ? 7 : 6} title="Description">
              <AgriculturalDescriptionAssistant
                key={location.locationRemountKey}
                facts={descriptionFacts}
                value={form.description}
                onChange={form.setDescription}
              />
            </Section>
          </fieldset>

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
          isRecoveringDraft={draft.isRecoveringDraft}
          strengthPercent={strengthPercent}
          createPending={draft.createListing.isPending}
          updatePending={draft.updateListing.isPending}
          onSaveDraft={() => draft.persistDraft()}
          onReview={draft.handleGoToReview}
        />
      </div>
    </>
  );
}
