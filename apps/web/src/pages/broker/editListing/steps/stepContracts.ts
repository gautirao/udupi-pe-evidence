import type { ListingResponse } from '@/hooks/useBrokerListings';
import type { ListingImage } from '@/hooks/useListingImages';
import type { AddressPickerValue } from '@/components/broker/AddressPicker';
import type { PropertyType } from '@/lib/listing-constants';
import type { ListingFieldKey, CommercialSubtype } from '@/lib/listingFieldConfig';
import type { BaseFieldValues, BaseFieldSetters } from '../useBaseFields';
import type { AgriFieldValues, AgriFieldSetters } from '../useAgriFields';
import type { CommercialFieldValues, CommercialFieldSetters } from '../useCommercialFields';
import type { RentFieldValues, RentFieldSetters } from '../useRentFields';
import type { ResidentialFieldValues, ResidentialFieldSetters } from '../useResidentialFields';
import type { SharedFieldValues, SharedFieldSetters } from '../useSharedFields';

// Issue #1838 PR C commit 3 — {view, commands} prop-shape contracts for the
// converted step components (LocationStep, ReviewStep). Each step's own
// props interface is derived from these two halves: `view` is read-only
// display data, `commands` is the set of callbacks the step invokes.
//
// Issue #1838 PR E — this file is now ALSO the home for the DescribeStep
// {view, commands} contract (DescribeStepView/DescribeStepCommands/
// DescribeStepProps below), plus the generic `FieldSlice` helper the 7
// steps/describe/*.tsx section components use to narrow their own prop
// types. `setPropertyType` (the raw useBaseFields setter) is deliberately
// NEVER imported/referenced anywhere below — only the wrapped
// `changePropertyType` (= handlePropertyTypeChange, the #2281-aware
// wrapper that also resets the explicit SHOP/OFFICE choice) is reachable
// from DescribeBasicsCommands, so a miswiring that bypasses that reset
// cannot even compile.

export interface PhotosStepView {
  id: string | undefined;
  isSubmittable: boolean;
  videoUrl: string;
  videoUrlError: string;
  canSubmitImages: boolean;
}

export interface PhotosStepCommands {
  changeVideoUrl: (value: string) => void;
  continue: () => void;
  /** Reported by ImageUploader's onCanSubmitChange child callback — a raw
   * setter crossing the {view,commands} boundary here is justified: this IS
   * a state report from a mounted child, not a broker-initiated action, and
   * ImageUploader's own prop is inherently a state-setter signature
   * (`(canSubmit: boolean) => void`). See useEditListingUiState.ts. */
  reportImageReadiness: (canSubmit: boolean) => void;
}

export interface PhotosStepProps {
  view: PhotosStepView;
  commands: PhotosStepCommands;
}

export interface BoundaryStepView {
  boundaryCoords: [number, number][];
  listing: ListingResponse;
}

export interface BoundaryStepCommands {
  continue: (coords: [number, number][]) => void;
  skip: () => void;
}

export interface BoundaryStepProps {
  view: BoundaryStepView;
  commands: BoundaryStepCommands;
}

export interface LocationStepView {
  isSubmittable: boolean;
  listing: ListingResponse;
  currentStep: number;
}

export interface LocationStepCommands {
  confirmAddress: (addr: AddressPickerValue) => void;
  unconfirmAddress: () => void;
  confirmLocality: (locality: string, lat: number, lng: number) => void;
  saveAndContinue: () => void;
}

export interface LocationStepProps {
  view: LocationStepView;
  commands: LocationStepCommands;
}

export interface ReviewStepView {
  listing: ListingResponse;
  listingImages: ListingImage[];
  id: string | undefined;
  isSubmittable: boolean;
  canSubmitImages: boolean;
  requiredFieldsComplete: boolean;
  allConditionsMet: boolean;
  isRent: boolean;
  isAgriListing: boolean;
  boundaryCoords: [number, number][];
  showTitleLocalityWarning: boolean;
  confirmedLocality: string;
  isSubmitting: boolean;
  isSaving: boolean;
}

export interface ReviewStepCommands {
  submitForReview: () => void;
  editStepFromReview: (step: number) => void;
  editBoundary: () => void;
  resetTitleToLocality: () => void;
}

export interface ReviewStepProps {
  view: ReviewStepView;
  commands: ReviewStepCommands;
}

// ── DescribeStep (PR E) ─────────────────────────────────────────────────────

/** A combined area value + unit pair — DescribeDimensionsView's shape for
 * landArea/builtArea/carpetArea, replacing the old 6 separate flat
 * scalar+unit prop pairs with 3 paired objects. */
export interface AreaValue {
  value: number | null;
  unit: string;
}

export type DescribeBasicsView = Pick<BaseFieldValues,
  'title' | 'description' | 'locality' | 'priceRupees' | 'propertyType' | 'listingPurpose' | 'reraNumber'>;

export interface DescribeDimensionsView {
  landArea: AreaValue;
  builtArea: AreaValue;
  carpetArea: AreaValue;
  bedrooms: string;
}

export interface DescribeCapabilitiesView {
  isCommercialType: boolean;
  // #2281 [#1684 parity] — derived (F1: from LIVE propertyType + explicit
  // choice, NEVER from the raw stored listing.commercialSubtype) subtype used
  // to pick per-subtype option vocabularies (suitableUses/hubType).
  commercialSubtype: CommercialSubtype | undefined;
  fieldVisible: (key: ListingFieldKey) => boolean;
}

export interface DescribeStatusView {
  isSaving: boolean;
}

export interface DescribeStepView {
  basics: DescribeBasicsView;
  dimensions: DescribeDimensionsView;
  capabilities: DescribeCapabilitiesView;
  status: DescribeStatusView;
  agri: AgriFieldValues;
  commercial: CommercialFieldValues;
  rent: RentFieldValues;
  residential: ResidentialFieldValues;
  shared: Omit<SharedFieldValues, 'carpetArea' | 'carpetAreaUnit'>;
}

export interface DescribeBasicsCommands extends Pick<BaseFieldSetters,
  'setTitle' | 'setDescription' | 'setLocality' | 'setPriceRupees' | 'setListingPurpose' | 'setReraNumber'> {
  // #2281 — plain callback (not Dispatch<SetStateAction<...>>): wraps the raw
  // useBaseFields setter to also reset the explicit SHOP/OFFICE choice on
  // type change (see useEditListingCommands.ts's handlePropertyTypeChange).
  // `setPropertyType` itself is intentionally UNREACHABLE from this
  // interface (see this file's header comment) — never add it here.
  changePropertyType: (value: PropertyType | '') => void;
  markTitleManuallyEdited: () => void;
}

export interface DescribeDimensionsCommands {
  setLandArea: (value: number | null, unit: string) => void;
  setBuiltArea: (value: number | null, unit: string) => void;
  setCarpetArea: (value: number | null, unit: string) => void;
  setBedrooms: BaseFieldSetters['setBedrooms'];
}

export interface DescribeWorkflowCommands {
  save: (e: React.FormEvent) => void;
}

export interface DescribeStepCommands {
  workflow: DescribeWorkflowCommands;
  basics: DescribeBasicsCommands;
  dimensions: DescribeDimensionsCommands;
  agri: AgriFieldSetters;
  commercial: CommercialFieldSetters;
  rent: RentFieldSetters;
  residential: ResidentialFieldSetters;
  shared: Omit<SharedFieldSetters, 'setCarpetArea' | 'setCarpetAreaUnit'>;
}

export interface DescribeStepProps {
  view: DescribeStepView;
  commands: DescribeStepCommands;
}

/** Leaf-section contract: exactly the fields a section renders + their
 * setters. Used by the 7 steps/describe/*.tsx section components to narrow
 * their own prop types to just the field(s) they actually destructure,
 * instead of the full domain hook-result object. */
export type FieldSlice<V, S, K extends keyof V & string> = {
  values: Pick<V, K>;
  setters: Pick<S, Extract<`set${Capitalize<K>}`, keyof S>>;
};
