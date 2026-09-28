import { makeUpdatePayloadCtx } from '@/lib/editListing/buildUpdatePayload';
import { deriveCommercialSubtype } from '@/lib/listingFieldConfig';
import type { CommercialSubtype } from '@/lib/listingFieldConfig';
import type { PropertyType } from '@/lib/listing-constants';

// Issue #1838 PR F — pure, React-free selectors for the derived gates that
// used to live inline in useEditListingCommands.ts. Each selector takes a
// narrow typed input (only the primitives it actually reads), not a whole
// domain hook-result object, so it can be unit-tested without rendering
// anything and without composing any of the field hooks.
//
// VERBATIM logic preserved from useEditListingCommands.ts (see that file's
// former header "preserve-exactly" list, now split across this file + the
// command hooks under this directory):
//   - selectStep1Complete keeps using listingPurpose === 'rent' directly;
//     selectRequiredFieldsComplete is the one that uses isRent (derived from
//     editCtx). Not unified — these are two different gates that happen to
//     look similar.

export interface Step1CompleteInput {
  listingPurpose: string;
  propertyType: PropertyType | '';
  monthlyRent: string;
  priceRupees: number | null;
  locality: string;
}

/** Step 1 is complete when required fields match the submit gate
 * (selectRequiredFieldsComplete). For rent listings: propertyType +
 * monthlyRent + locality. For sale: propertyType + price + locality. */
export function selectStep1Complete({
  listingPurpose, propertyType, monthlyRent, priceRupees, locality,
}: Step1CompleteInput): boolean {
  return listingPurpose === 'rent'
    ? (!!propertyType && monthlyRent !== '' && parseInt(monthlyRent, 10) > 0 && !!locality)
    : (!!propertyType && (priceRupees ?? 0) > 0 && !!locality);
}

/** Step 2 is complete when >= 3 images have been uploaded (tracked by
 * canSubmitImages, reported by ImageUploader via PhotosStep). Trivial
 * passthrough kept as a named selector for symmetry with step1/step3 and so
 * callers never read `ui.values.canSubmitImages` directly for this gate. */
export function selectStep2Complete(canSubmitImages: boolean): boolean {
  return canSubmitImages;
}

/** Step 3 is complete when address has been confirmed. */
export function selectStep3Complete(addressConfirmed: boolean | undefined): boolean {
  return addressConfirmed === true;
}

export interface WizardStepGate {
  label: string;
  isComplete: boolean;
}

export interface SelectWizardStepsInput {
  isAgriListing: boolean;
  wizardSteps: readonly string[];
  step1Complete: boolean;
  step2Complete: boolean;
  step3Complete: boolean;
}

/** Builds the StepIndicator-facing `steps` array. Agri listings get an extra
 * (never-complete) "Draw Boundary" step between Pin Location and the
 * terminal step; non-agri listings' terminal step is likewise never
 * tracked as a completion gate. */
export function selectWizardSteps({
  isAgriListing, wizardSteps, step1Complete, step2Complete, step3Complete,
}: SelectWizardStepsInput): WizardStepGate[] {
  return isAgriListing
    ? [
        { label: wizardSteps[0], isComplete: step1Complete },
        { label: wizardSteps[1], isComplete: step2Complete },
        { label: wizardSteps[2], isComplete: step3Complete },
        { label: wizardSteps[3], isComplete: false }, // Draw Boundary — not tracked as gate
        { label: wizardSteps[4], isComplete: false }, // terminal step
      ]
    : [
        { label: wizardSteps[0], isComplete: step1Complete },
        { label: wizardSteps[1], isComplete: step2Complete },
        { label: wizardSteps[2], isComplete: step3Complete },
        { label: wizardSteps[3], isComplete: false }, // terminal step
      ];
}

/**
 * #2281 [#1684 parity] — F1: derive the effective commercial subtype from
 * LIVE form state (current propertyType + the broker's own SHOP/OFFICE
 * choice), exactly as CommercialListingForm.tsx:300 does for Create. NEVER
 * read listing.commercialSubtype raw here — five isListingFieldVisible
 * branches test commercialSubtype without an isCommercialFamily guard, so a
 * stale stored value would leak wrong-subtype fields into view after a
 * mid-edit propertyType switch (see approved-plan.toml footgun F1).
 */
export function selectCommercialSubtype(
  propertyType: PropertyType | '',
  explicitSubtype: CommercialSubtype | '',
): CommercialSubtype | undefined {
  return propertyType === '' ? undefined : deriveCommercialSubtype(propertyType, explicitSubtype);
}

/**
 * #2281 cycle-2 hardening — render AND the Step-1 payload build share the
 * SAME `makeUpdatePayloadCtx` helper (buildUpdatePayload.ts).
 */
export function selectEditCtx(
  propertyType: PropertyType | '',
  listingPurpose: string,
  commercialSubtype: CommercialSubtype | undefined,
) {
  return makeUpdatePayloadCtx(propertyType, listingPurpose, commercialSubtype);
}

const SUBMITTABLE_STATUSES = ['DRAFT', 'REJECTED'];

export function selectIsSubmittable(status: string): boolean {
  return SUBMITTABLE_STATUSES.includes(status);
}

export function selectStatusBadgeVariant(status: string): 'destructive' | 'secondary' | 'outline' {
  return status === 'REJECTED'
    ? 'destructive'
    : status === 'DRAFT'
    ? 'secondary'
    : 'outline';
}

export interface TitleLocalityWarningInput {
  titleManuallyEdited: boolean;
  confirmedLocality: string;
  title: string;
}

export interface TitleLocalityWarningResult {
  confirmedLocalityShort: string;
  titleIncludesLocality: boolean;
  showTitleLocalityWarning: boolean;
}

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
export function selectTitleLocalityWarning({
  titleManuallyEdited, confirmedLocality, title,
}: TitleLocalityWarningInput): TitleLocalityWarningResult {
  const confirmedLocalityShort = confirmedLocality.split(',')[0].trim().toLowerCase();
  const titleIncludesLocality =
    !confirmedLocalityShort || title.toLowerCase().includes(confirmedLocalityShort);
  const showTitleLocalityWarning =
    titleManuallyEdited &&
    !!confirmedLocality &&
    !titleIncludesLocality;

  return { confirmedLocalityShort, titleIncludesLocality, showTitleLocalityWarning };
}

export interface RequiredFieldsCompleteInput {
  isRent: boolean;
  monthlyRent: string;
  priceRupees: number | null;
  propertyType: PropertyType | '';
  locality: string;
}

export function selectRequiredFieldsComplete({
  isRent, monthlyRent, priceRupees, propertyType, locality,
}: RequiredFieldsCompleteInput): boolean {
  return isRent
    ? (monthlyRent !== '' && parseInt(monthlyRent, 10) > 0 && !!propertyType && !!locality)
    : (priceRupees != null && priceRupees > 0 && !!propertyType && !!locality);
}

export interface AllConditionsMetInput {
  canSubmitImages: boolean;
  addressConfirmed: boolean | undefined;
  requiredFieldsComplete: boolean;
  showTitleLocalityWarning: boolean;
}

export function selectAllConditionsMet({
  canSubmitImages, addressConfirmed, requiredFieldsComplete, showTitleLocalityWarning,
}: AllConditionsMetInput): boolean {
  return (
    canSubmitImages &&
    !!addressConfirmed &&
    requiredFieldsComplete &&
    !showTitleLocalityWarning
  );
}
