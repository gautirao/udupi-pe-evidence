import { useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';
import { CommercialDescriptionAssistant } from '@/components/broker/commercial/CommercialDescriptionAssistant';
import { InlineNearby } from '@/components/broker/residential/InlineNearby';
import { computeListingStrength as computeFormCompleteness } from '@/components/broker/ListingStrengthMeter';
import { Button } from '@/components/ui/button';
import { intOrUndef } from '@/lib/listing-utils';
import { Section } from './commercial/CommercialFormPrimitives';
import type { CommercialPropertyType } from './commercial/commercialListingTypes';
import { deriveCommercialSubtypeModel } from './commercial/commercialSubtypeModel';
import { useCommercialListingFormState } from './commercial/useCommercialListingFormState';
import { useCommercialListingDraft } from './commercial/useCommercialListingDraft';
import { useCommercialLocationOrchestration } from './commercial/useCommercialLocationOrchestration';
import {
  buildCommercialListingPayload,
  computeCommercialChecklist,
  computeCommercialStrengthResult,
  computeCommercialDescriptionFacts,
  computeCommercialSpecChips,
} from './commercial/commercialListingPayload';
import { CommercialPurposeSection } from './commercial/CommercialPurposeSection';
import { CommercialLocalitySection } from './commercial/CommercialLocalitySection';
import { CommercialPropertyDetailsSection } from './commercial/CommercialPropertyDetailsSection';
import { CommercialTermsSection } from './commercial/CommercialTermsSection';
import { CommercialMoreDetailsSection } from './commercial/CommercialMoreDetailsSection';
import { CommercialPhotosLocationSection } from './commercial/CommercialPhotosLocationSection';
import { CommercialSidebarSummary } from './commercial/CommercialSidebarSummary';
import { CommercialFooterActions } from './commercial/CommercialFooterActions';
import { CommercialReviewScreen } from './commercial/CommercialReviewScreen';

/**
 * #1684 [M38-13B] — commercial single-page create experience, the commercial
 * sibling of ResidentialListingForm.tsx (#1626/#1718). Deliberately CLONES
 * ResidentialListingForm's compositional pattern (own local state, own
 * inline draft-persist -> review -> submit lifecycle) rather than extracting
 * a shared hook — the two flows manage distinct field sets and independent
 * subtype-adaptive visibility logic.
 *
 * Mounted by NewListing.tsx ONLY for the four commercial property types
 * (commercial / commercial_building / warehouse / commercial_land) — the
 * residential/agricultural branches are untouched.
 *
 * Reuses (AS-IS, no behaviour change): AddressSearch, MapPin,
 * useResidentialLocation, InlinePhotos, InlineNearby, StrengthMeter,
 * FieldPairRow, AreaField, PriceField, ChipGroup helpers,
 * BuyerPreviewCard, ListingPurposeToggle-equivalent (see note below),
 * PropertyTypeCardSelector (commercialOnly).
 *
 * Description: this form uses CommercialDescriptionAssistant +
 * commercialDescriptionBuilder.ts (both new, commercial-only) rather than
 * reusing residential/DescriptionAssistant.tsx — that component (and
 * listingDescriptionBuilder.ts) is typed strictly to the 4 RESIDENTIAL
 * property types (DescriptionPropertyType), so passing commercial facts
 * through it is not type-safe and would require an unsafe cast. No
 * AI/network call either way — the draft is a deterministic, FE-only
 * template composed from facts already entered, always fully editable.
 *
 * #2388 — page-health decomposition: this component is now a thin
 * composition root over named owners in ./commercial/ —
 * useCommercialListingDraft (persistence/recovery/mode lifecycle),
 * useCommercialListingFormState (typed field state + one-shot hydration),
 * commercialSubtypeModel (subtype derivation/visibility, delegating to
 * listingFieldConfig), commercialListingPayload (payload/checklist/strength
 * mapping), useCommercialLocationOrchestration (the single
 * useResidentialLocation instance), and per-section presentation
 * components. Behaviour is unchanged from the pre-decomposition version.
 */

interface CommercialListingFormProps {
  initialPropertyType: CommercialPropertyType;
  /** #1748 — optional demand-gap prefill; only the shared 'sale'|'rent' vocabulary
   *  is forwarded (never 'lease'). Defaults to 'sale' when absent. */
  initialListingPurpose?: 'sale' | 'rent';
  /**
   * #2348 — a draft id recovered from the route's ?draftId= query param at
   * mount (URL-seeded only). When present, the form hydrates from the
   * persisted draft instead of starting a blank Step-1 create. Never
   * re-seeded after mount.
   */
  initialDraftId?: string | null;
  onSwitchToGenericFlow: () => void;
  navigate: NavigateFunction;
  /**
   * #2348 — fired exactly once, right after this session's own first
   * successful draft create (never on later updates), so the route-owning
   * page can stash the new id into the URL via history REPLACE.
   */
  onDraftPersisted?: (id: string) => void;
}

export function CommercialListingForm({ initialPropertyType, initialListingPurpose, initialDraftId, onSwitchToGenericFlow, navigate, onDraftPersisted }: CommercialListingFormProps) {
  const form = useCommercialListingFormState({ initialPropertyType, initialListingPurpose });
  const [hasAttempted, setHasAttempted] = useState(false);
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);

  const subtypeModel = deriveCommercialSubtypeModel(form.propertyType, form.explicitSubtype, form.listingPurpose);
  const { commercialSubtype, isLand, isRentOrLease, fieldVisible, suitableUseOptions, hubTypeOptions } = subtypeModel;

  const priceValid = isRentOrLease
    ? (form.monthlyRent !== '' && parseInt(form.monthlyRent, 10) > 0)
    : (form.priceRupees != null && form.priceRupees > 0);
  const subtypeResolved = commercialSubtype !== undefined;
  const canSubmit = subtypeResolved && priceValid;

  const primaryAreaSqft = isLand ? form.landArea : form.builtArea;

  const buildPayload = () => buildCommercialListingPayload({
    propertyType: form.propertyType,
    title: form.title,
    locality: form.locality,
    priceRupees: form.priceRupees,
    description: form.description,
    listingPurpose: form.listingPurpose,
    landArea: form.landArea,
    landAreaUnit: form.landAreaUnit,
    builtArea: form.builtArea,
    builtAreaUnit: form.builtAreaUnit,
    monthlyRent: form.monthlyRent,
    securityDepositMonths: form.securityDepositMonths,
    lockInMonths: form.lockInMonths,
    explicitSubtype: form.explicitSubtype,
    floorChoice: form.floorChoice,
    hubType: form.hubType,
    floorMode: form.floorMode,
    powerLoadKva: form.powerLoadKva,
    occupancyStatus: form.occupancyStatus,
    officeSeats: form.officeSeats,
    officeCabins: form.officeCabins,
    officeMeetingRooms: form.officeMeetingRooms,
    warehouseClearHeightFt: form.warehouseClearHeightFt,
    warehouseLoadingBays: form.warehouseLoadingBays,
    warehouseTruckAccess: form.warehouseTruckAccess,
    warehouseFlooring: form.warehouseFlooring,
    commercialZoning: form.commercialZoning,
    commercialOwnership: form.commercialOwnership,
    commercialApprovalsText: form.commercialApprovalsText,
    washroomsPublic: form.washroomsPublic,
    washroomsPrivate: form.washroomsPrivate,
    parkingPublicCount: form.parkingPublicCount,
    parkingPrivateCount: form.parkingPrivateCount,
    commercialFurnishingStatus: form.commercialFurnishingStatus,
    utilities: form.utilities,
    suitableUses: form.suitableUses,
    commercialAvailability: form.commercialAvailability,
    commercialAreaUnit: form.commercialAreaUnit,
    expectedRentalYieldPct: form.expectedRentalYieldPct,
    currentMonthlyIncomePaise: form.currentMonthlyIncomePaise,
    leaseTermMonths: form.leaseTermMonths,
    leaseEscalationPct: form.leaseEscalationPct,
    isLand,
    isRentOrLease,
    fieldVisible,
  });

  const draft = useCommercialListingDraft({
    initialDraftId,
    canSubmit,
    buildPayload,
    onAttempt: () => setHasAttempted(true),
    onDraftPersisted,
    onHydrate: form.hydrateFrom,
  });

  const location = useCommercialLocationOrchestration({
    listingId: draft.listingId,
    addressConfirmed: draft.addressConfirmed,
    draftListing: draft.draftListing,
    urlSeededRef: draft.urlSeededRef,
    didHydrateRef: draft.didHydrateRef,
    onPublicLoc: form.setLocality,
  });

  const checklist = computeCommercialChecklist({
    subtypeResolved,
    locality: form.locality,
    primaryAreaSqft,
    priceValid,
    title: form.title,
    commercialSubtype,
    floorChoice: form.floorChoice,
    floorMode: form.floorMode,
    warehouseFlooring: form.warehouseFlooring,
    commercialZoning: form.commercialZoning,
    imageCount: draft.imageCount,
    addressConfirmed: draft.addressConfirmed,
    description: form.description,
  });
  const strengthPercent = computeFormCompleteness(checklist);

  const strengthResult = computeCommercialStrengthResult({
    subtypeResolved,
    isRentOrLease,
    priceValid,
    locality: form.locality,
    imageCount: draft.imageCount,
    locationResolved: location.residentialLocationValue?.state.resolved != null,
    addressConfirmed: draft.addressConfirmed,
    commercialSubtype,
    builtArea: form.builtArea,
    builtAreaUnit: form.builtAreaUnit,
    floorChoice: form.floorChoice,
    floorMode: form.floorMode,
    landArea: form.landArea,
    landAreaUnit: form.landAreaUnit,
  });

  const descriptionFacts = computeCommercialDescriptionFacts({
    commercialSubtype,
    listingPurpose: form.listingPurpose,
    locality: form.locality,
    primaryAreaSqft,
    isLand,
    landAreaUnit: form.landAreaUnit,
    builtAreaUnit: form.builtAreaUnit,
    floorChoice: form.floorChoice,
    hubType: form.hubType,
    floorMode: form.floorMode,
    officeSeats: form.officeSeats,
    officeCabins: form.officeCabins,
    officeMeetingRooms: form.officeMeetingRooms,
    warehouseClearHeightFt: form.warehouseClearHeightFt,
    warehouseFlooring: form.warehouseFlooring,
    commercialZoning: form.commercialZoning,
    commercialFurnishingStatus: form.commercialFurnishingStatus,
    suitableUses: form.suitableUses,
    commercialAvailability: form.commercialAvailability,
    priceRupees: form.priceRupees,
    monthlyRent: form.monthlyRent,
    leaseTermMonths: form.leaseTermMonths,
  });

  const specChips = computeCommercialSpecChips({
    fieldVisible,
    primaryAreaSqft,
    isLand,
    landAreaUnit: form.landAreaUnit,
    builtAreaUnit: form.builtAreaUnit,
    floorChoice: form.floorChoice,
    commercialFurnishingStatus: form.commercialFurnishingStatus,
  });

  if (draft.submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center" data-testid="commercial-submitted-panel">
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

  // #2388 — the location bridge is rendered at this single, stable position
  // regardless of edit/review mode below, so switching modes never changes
  // its parent fiber boundary. Letting each mode's branch own a differently
  // shaped subtree (e.g. one wrapping it in its own component) would make
  // React treat it as a different tree on the transition, unmounting and
  // remounting useResidentialLocation and replaying its one-time hydration
  // effect mid-session — see useCommercialLocationOrchestration's doc.
  if (draft.mode === 'review' && draft.listingId) {
    return (
      <>
        {/* #2348 — keeps the location hook instance alive while in review mode. */}
        {location.locationBridge}
        <CommercialReviewScreen
          listingId={draft.listingId}
          addressConfirmed={draft.addressConfirmed}
          strengthResult={strengthResult}
          onBackToEdit={draft.handleBackToEdit}
          onSubmitForReview={draft.handleSubmitForReview}
          submitPending={draft.submitListing.isPending}
          facts={{
          propertyType: form.propertyType,
          commercialSubtype,
          listingPurpose: form.listingPurpose,
          title: form.title,
          description: form.description,
          locality: form.locality,
          primaryAreaSqft,
          areaUnit: isLand ? form.landAreaUnit : form.builtAreaUnit,
          floorChoice: form.floorChoice,
          hubType: form.hubType,
          floorMode: form.floorMode,
          occupancyStatus: form.occupancyStatus,
          officeSeats: form.officeSeats,
          officeCabins: form.officeCabins,
          officeMeetingRooms: form.officeMeetingRooms,
          warehouseClearHeightFt: form.warehouseClearHeightFt,
          warehouseFlooring: form.warehouseFlooring,
          commercialZoning: form.commercialZoning,
          commercialOwnership: form.commercialOwnership,
          washroomsPublic: form.washroomsPublic,
          washroomsPrivate: form.washroomsPrivate,
          parkingPublicCount: form.parkingPublicCount,
          parkingPrivateCount: form.parkingPrivateCount,
          commercialFurnishingStatus: form.commercialFurnishingStatus,
          utilities: form.utilities,
          suitableUses: form.suitableUses,
          commercialAvailability: form.commercialAvailability,
          priceRupees: form.priceRupees,
          monthlyRent: intOrUndef(form.monthlyRent) ?? null,
          leaseTermMonths: form.leaseTermMonths,
          expectedRentalYieldPct: form.expectedRentalYieldPct,
        }}
        />
      </>
    );
  }

  return (
    <>
      {/* #2348 — owns the single useResidentialLocation instance for this
          render; its remount key flips exactly once, the render a
          URL-seeded draft's hydrate (or error-fallback) effect settles. */}
      {location.locationBridge}
      <div className="mx-auto max-w-6xl px-4 py-8 pb-24">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Commercial listing
        </p>
        <h1 className="text-2xl font-bold text-foreground">Create a listing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add what buyers actually need. Optional details stay tucked away — fill only what you know, skip the rest.
        </p>
        {draft.draftLoadError && (
          <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="commercial-draft-load-error">
            {draft.draftLoadError}
          </p>
        )}
      </div>

      {/* #2348 — visible while a URL-seeded draft is loading, so the broker
          sees why the form is briefly empty/disabled rather than assuming
          it is a fresh, blank create. Mirrors ResidentialListingForm.tsx
          (issue #2039, AC2/AC4). */}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* #2348 — a native <fieldset disabled> cascades disabled to every
            descendant form control (input, select, textarea, button —
            including the Radix-based Select/chip buttons used throughout
            these sections) without wiring a `disabled` prop through every
            individual field component. Disabled only while a URL-seeded
            draft is still resolving for the very first time
            (isRecoveringDraft), so a broker can never type into — or
            "Save draft"/"Continue" from — a form that is about to be
            silently overwritten by the hydrate effect once the draft fetch
            settles. Bounded by DRAFT_RECOVERY_TIMEOUT_MS in
            useCommercialListingDraft — this can never stay disabled
            indefinitely. Mirrors ResidentialListingForm.tsx (issue #2039,
            revision 4, finding 1). */}
        <fieldset className="min-w-0 space-y-4 border-0 p-0 m-0" disabled={draft.isRecoveringDraft}>
          <CommercialPurposeSection
            propertyType={form.propertyType}
            onPropertyTypeChange={form.setPropertyType}
            explicitSubtype={form.explicitSubtype}
            onExplicitSubtypeChange={form.setExplicitSubtype}
            listingPurpose={form.listingPurpose}
            onListingPurposeChange={form.setListingPurpose}
            hasAttempted={hasAttempted}
            onSwitchToGenericFlow={onSwitchToGenericFlow}
          />

          <CommercialLocalitySection
            residentialLocationValue={location.residentialLocationValue}
            locality={form.locality}
            title={form.title}
            onTitleChange={form.setTitle}
            hasAttempted={hasAttempted}
          />

          <CommercialPropertyDetailsSection
            fieldVisible={fieldVisible}
            hubTypeOptions={hubTypeOptions}
            isLand={isLand}
            landArea={form.landArea}
            landAreaUnit={form.landAreaUnit}
            onLandAreaChange={(a, u) => { form.setLandArea(a); form.setLandAreaUnit(u); }}
            builtArea={form.builtArea}
            builtAreaUnit={form.builtAreaUnit}
            onBuiltAreaChange={(a, u) => { form.setBuiltArea(a); form.setBuiltAreaUnit(u); }}
            commercialAreaUnit={form.commercialAreaUnit}
            onCommercialAreaUnitChange={form.setCommercialAreaUnit}
            floorChoice={form.floorChoice}
            onFloorChoiceChange={form.setFloorChoice}
            hubType={form.hubType}
            onHubTypeChange={form.setHubType}
            officeSeats={form.officeSeats}
            onOfficeSeatsChange={form.setOfficeSeats}
            officeCabins={form.officeCabins}
            onOfficeCabinsChange={form.setOfficeCabins}
            officeMeetingRooms={form.officeMeetingRooms}
            onOfficeMeetingRoomsChange={form.setOfficeMeetingRooms}
            floorMode={form.floorMode}
            onFloorModeChange={form.setFloorMode}
            powerLoadKva={form.powerLoadKva}
            onPowerLoadKvaChange={form.setPowerLoadKva}
            occupancyStatus={form.occupancyStatus}
            onOccupancyStatusChange={form.setOccupancyStatus}
            warehouseClearHeightFt={form.warehouseClearHeightFt}
            onWarehouseClearHeightFtChange={form.setWarehouseClearHeightFt}
            warehouseLoadingBays={form.warehouseLoadingBays}
            onWarehouseLoadingBaysChange={form.setWarehouseLoadingBays}
            warehouseFlooring={form.warehouseFlooring}
            onWarehouseFlooringChange={form.setWarehouseFlooring}
            warehouseTruckAccess={form.warehouseTruckAccess}
            onWarehouseTruckAccessChange={form.setWarehouseTruckAccess}
            commercialZoning={form.commercialZoning}
            onCommercialZoningChange={form.setCommercialZoning}
            commercialOwnership={form.commercialOwnership}
            onCommercialOwnershipChange={form.setCommercialOwnership}
            commercialApprovalsText={form.commercialApprovalsText}
            onCommercialApprovalsTextChange={form.setCommercialApprovalsText}
          />

          <CommercialTermsSection
            listingPurpose={form.listingPurpose}
            isRentOrLease={isRentOrLease}
            fieldVisible={fieldVisible}
            hasAttempted={hasAttempted}
            isRecoveringDraft={draft.isRecoveringDraft}
            priceHydrationSeed={form.priceHydrationSeed}
            priceRupees={form.priceRupees}
            onPriceChange={form.setPriceRupees}
            expectedRentalYieldPct={form.expectedRentalYieldPct}
            onExpectedRentalYieldPctChange={form.setExpectedRentalYieldPct}
            currentMonthlyIncomePaise={form.currentMonthlyIncomePaise}
            onCurrentMonthlyIncomePaiseChange={form.setCurrentMonthlyIncomePaise}
            monthlyRent={form.monthlyRent}
            onMonthlyRentChange={form.setMonthlyRent}
            securityDepositMonths={form.securityDepositMonths}
            onSecurityDepositMonthsChange={form.setSecurityDepositMonths}
            lockInMonths={form.lockInMonths}
            onLockInMonthsChange={form.setLockInMonths}
            leaseTermMonths={form.leaseTermMonths}
            onLeaseTermMonthsChange={form.setLeaseTermMonths}
            leaseEscalationPct={form.leaseEscalationPct}
            onLeaseEscalationPctChange={form.setLeaseEscalationPct}
          />

          <CommercialMoreDetailsSection
            open={moreDetailsOpen}
            onOpenChange={setMoreDetailsOpen}
            fieldVisible={fieldVisible}
            suitableUseOptions={suitableUseOptions}
            washroomsPublic={form.washroomsPublic}
            onWashroomsPublicChange={form.setWashroomsPublic}
            washroomsPrivate={form.washroomsPrivate}
            onWashroomsPrivateChange={form.setWashroomsPrivate}
            parkingPublicCount={form.parkingPublicCount}
            onParkingPublicCountChange={form.setParkingPublicCount}
            parkingPrivateCount={form.parkingPrivateCount}
            onParkingPrivateCountChange={form.setParkingPrivateCount}
            commercialFurnishingStatus={form.commercialFurnishingStatus}
            onCommercialFurnishingStatusChange={form.setCommercialFurnishingStatus}
            utilities={form.utilities}
            onUtilitiesChange={form.setUtilities}
            suitableUses={form.suitableUses}
            onSuitableUsesChange={form.setSuitableUses}
            commercialAvailability={form.commercialAvailability}
            onCommercialAvailabilityChange={form.setCommercialAvailability}
          />

          <CommercialPhotosLocationSection
            listingId={draft.listingId}
            residentialLocationValue={location.residentialLocationValue}
            canSubmit={canSubmit}
            isCreatePending={draft.createListing.isPending}
            onSaveDraft={() => draft.persistDraft()}
          />

          {/* Section 6b — Nearby places (gated on addressConfirmed, honest derived/broker-added labels)
              #2647 (owner decision, PR #2654 comment 5773021097 — Option B): the same location/pin
              fidelity Residential gets, wired through the SAME shared architecture. This flow already
              owns a useResidentialLocation instance via useCommercialLocationOrchestration, so these
              are the identical values ResidentialListingForm passes — no second location model and no
              second picker. `publicLoc` is the COARSE locality only (`resolved.publicLoc`, else the
              persisted `form.locality`); `resolved.formatted` and the pin lat/lng never reach
              InlineNearby. `onOpenPicker` is gated on `resolved` exactly as MapPin.tsx gates its own
              CTA (`disabled={!resolved}`) — with no resolved center there is no seed coordinate. */}
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
                publicLoc={
                  location.residentialLocationValue?.state.resolved?.publicLoc || form.locality
                }
                onOpenPicker={
                  location.residentialLocationValue?.state.resolved != null
                    ? location.residentialLocationValue.openPicker
                    : undefined
                }
                onChangeLocation={location.residentialLocationValue?.clear}
              />
            </Section>
          )}

          {/* Section 7/8 — Description — deterministic FE-only draft builder (no AI claim). */}
          <Section number={draft.listingId ? 8 : 7} title="Description">
            {/* #2348 — CommercialDescriptionAssistant derives its idle/ready
                UI state from `value` only via a useState initializer (never
                re-evaluated on prop change), so a description hydrated after
                this child already mounted empty would otherwise stay stuck
                showing "Draft description" instead of the restored text.
                Reuses locationRemountKey — it flips 'pending' -> 'settled'
                at exactly the moment hydration commits — to force one clean
                remount with the now-correct value. */}
            <CommercialDescriptionAssistant key={location.locationRemountKey} facts={descriptionFacts} value={form.description} onChange={form.setDescription} />
          </Section>
        </fieldset>

        <CommercialSidebarSummary
          title={form.title}
          locality={form.locality}
          priceRupees={form.priceRupees}
          monthlyRent={intOrUndef(form.monthlyRent) ?? null}
          isRent={isRentOrLease}
          areaSqft={primaryAreaSqft}
          specChips={specChips}
          photoCount={draft.imageCount}
          coverImageUrl={draft.coverImageUrl}
          locationConfirmed={draft.addressConfirmed}
          checklist={checklist}
          listingId={draft.listingId}
          strengthResult={strengthResult}
        />
      </div>

      <CommercialFooterActions
        canSubmit={canSubmit}
        strengthPercent={strengthPercent}
        createPending={draft.createListing.isPending}
        updatePending={draft.updateListing.isPending}
        isRecoveringDraft={draft.isRecoveringDraft}
        onSaveDraft={() => draft.persistDraft()}
        onReview={draft.handleGoToReview}
      />
      </div>
    </>
  );
}
