import { useRef, useState } from 'react';
import { ChevronDown, Info, Loader2, CheckCircle2 } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';
import { useCreateListing, useUpdateListing, useSubmitListing, useGetListing } from '@/hooks/useBrokerListings';
import { useListingImages } from '@/hooks/useListingImages';
import { ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaField } from '@/components/broker/AreaField';
import { PriceField } from '@/components/broker/PriceField';
import { BuyerPreviewCard, type BuyerPreviewSpecChip } from '@/components/broker/BuyerPreviewCard';
import { ListingStrengthMeter, type ListingStrengthChecklist, computeListingStrength as computeFormCompleteness } from '@/components/broker/ListingStrengthMeter';
import { MultiChipGroup, type ChipOption } from '@/components/broker/ChipGroup';
import { InlinePhotos } from '@/components/broker/residential/InlinePhotos';
import { AddressSearch } from '@/components/broker/residential/AddressSearch';
import { MapPin } from '@/components/broker/residential/MapPin';
import { useResidentialLocation } from '@/components/broker/residential/useResidentialLocation';
import { InlineNearby } from '@/components/broker/residential/InlineNearby';
import { StrengthMeter } from '@/components/broker/residential/StrengthMeter';
import { AgriculturalReviewPreview } from '@/components/broker/agricultural/AgriculturalReviewPreview';
import { AgriculturalDescriptionAssistant } from '@/components/broker/agricultural/AgriculturalDescriptionAssistant';
import type { AgriculturalDescriptionFacts } from '@/lib/agriculturalDescriptionBuilder';
import { computeAgriPriceBreakdown } from '@/components/broker/agricultural/priceMath';
import type { ListingStrengthResult, ListingStrengthGate } from '@/lib/listingStrength';
import { isListingFieldVisible, type ListingFieldKey } from '@/lib/listingFieldConfig';
import {
  WATER_SOURCE_LABELS,
  SOIL_TYPE_LABELS,
  ROAD_ACCESS_LABELS,
  CULTIVATION_STATUS_LABELS,
  OWNERSHIP_TYPE_LABELS,
  LAND_CATEGORY_LABELS,
  AGRI_CONVERSION_STATUS_LABELS,
} from '@/lib/agriFieldLabels';
import { FACING_OPTIONS } from '@/lib/listing-constants';

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
 * HONESTY (issue #1627 scope decision — crops/features/RTC): the backend
 * CreateListingRequest/UpdateListingRequest contract has NO field for
 * crops[], features[], or rtc (confirmed against useBrokerListings.ts and
 * ListingController.validateAgriFields — only water/soil/road/cultivation/
 * ownership/survey/landCategory/farmhouse/fencing are persisted). Rather
 * than silently dropping broker input (data loss with no trace) or
 * fabricating a persistence illusion, these three fields are captured as
 * FORM-LOCAL state, shown in the review preview labelled "as entered, not
 * saved to record yet", and folded into the free-text `description` field
 * (which IS persisted) via agriculturalDescriptionBuilder — never sent as
 * structured fields in buildPayload(). Persisting them as structured columns
 * is out of scope for this issue (would require a backend/DTO/migration
 * change, which is forbidden here) and is deferred to a follow-up.
 */

type AgriculturalPropertyType = 'agricultural_land';

interface FieldProps {
  id: string;
  label: string;
  children: React.ReactNode;
  hint?: string;
}

function Field({ id, label, children, hint }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[13px] font-semibold">{label}</Label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface SectionHeaderProps {
  number: number;
  title: string;
}

function SectionHeader({ number, title }: SectionHeaderProps) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 font-mono text-[13px] font-bold text-primary">
        {number}
      </span>
      <h2 className="text-[17px] font-bold text-foreground">{title}</h2>
    </div>
  );
}

interface SectionProps {
  number: number;
  title: string;
  children: React.ReactNode;
}

function Section({ number, title, children }: SectionProps) {
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <SectionHeader number={number} title={title} />
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Converts a Record<code,label> label map (agriFieldLabels.ts) into ChipOption[] for Select/chip rendering. */
function optionsFromLabelMap(map: Record<string, string>): ChipOption[] {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

const WATER_SOURCE_OPTIONS = optionsFromLabelMap(WATER_SOURCE_LABELS);
const SOIL_TYPE_OPTIONS = optionsFromLabelMap(SOIL_TYPE_LABELS);
const ROAD_ACCESS_OPTIONS = optionsFromLabelMap(ROAD_ACCESS_LABELS);
const CULTIVATION_STATUS_OPTIONS = optionsFromLabelMap(CULTIVATION_STATUS_LABELS);
const OWNERSHIP_TYPE_OPTIONS = optionsFromLabelMap(OWNERSHIP_TYPE_LABELS);
const LAND_CATEGORY_OPTIONS = optionsFromLabelMap(LAND_CATEGORY_LABELS);
const AGRI_CONVERSION_STATUS_OPTIONS = optionsFromLabelMap(AGRI_CONVERSION_STATUS_LABELS);

/** FE-only vocabulary — no backend enum (see class doc: crops/features have no write path). */
const CROP_OPTIONS: readonly ChipOption[] = [
  { value: 'Areca nut', label: 'Areca nut' },
  { value: 'Coconut', label: 'Coconut' },
  { value: 'Paddy', label: 'Paddy' },
  { value: 'Banana', label: 'Banana' },
  { value: 'Cashew', label: 'Cashew' },
  { value: 'Rubber', label: 'Rubber' },
  { value: 'Pepper', label: 'Pepper' },
  { value: 'Other', label: 'Other' },
];

const FEATURE_OPTIONS: readonly ChipOption[] = [
  { value: 'Borewell', label: 'Borewell' },
  { value: 'Pond on land', label: 'Pond on land' },
  { value: 'Irrigation channel', label: 'Irrigation channel' },
  { value: 'Farm shed', label: 'Farm shed' },
  { value: 'Electricity connection', label: 'Electricity connection' },
  { value: 'Compound wall', label: 'Compound wall' },
];

interface AgriculturalListingFormProps {
  onSwitchToGenericFlow: () => void;
  navigate: NavigateFunction;
}

export function AgriculturalListingForm({ onSwitchToGenericFlow, navigate }: AgriculturalListingFormProps) {
  const createListing = useCreateListing();
  const { toast } = useToast();

  const propertyType: AgriculturalPropertyType = 'agricultural_land';

  const [listingId, setListingId] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'review'>('edit');
  const [submitted, setSubmitted] = useState(false);
  const draftInFlightRef = useRef(false);

  const updateListing = useUpdateListing(listingId ?? '');
  const submitListing = useSubmitListing(listingId ?? undefined);
  const { images, imageCount } = useListingImages(listingId ?? undefined);
  const coverImageUrl = images[0]?.url ?? null;
  const { data: draftListing } = useGetListing(listingId ?? '');
  const addressConfirmed = draftListing?.addressConfirmed ?? false;

  const [hasAttempted, setHasAttempted] = useState(false);
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);

  const [locality, setLocality] = useState('');
  const [title, setTitle] = useState('');

  const residentialLocation = useResidentialLocation({
    listingId,
    addressConfirmed,
    initialLatitude: draftListing?.latitude ?? null,
    initialLongitude: draftListing?.longitude ?? null,
    initialLocality: draftListing?.locality ?? '',
    onPublicLoc: setLocality,
  });

  // Area + price
  const [landArea, setLandArea] = useState<number | null>(null);
  const [landAreaUnit, setLandAreaUnit] = useState('acre');
  const [priceRupees, setPriceRupees] = useState<number | null>(null);

  // Agricultural land fields (all 9 in-scope + facing, all real write paths)
  const [facing, setFacing] = useState('');
  const [waterSource, setWaterSource] = useState('');
  const [soilType, setSoilType] = useState('');
  const [roadAccess, setRoadAccess] = useState('');
  const [cultivationStatus, setCultivationStatus] = useState('');
  const [landCategory, setLandCategory] = useState('');
  const [agriConversionStatus, setAgriConversionStatus] = useState('');
  const [ownershipType, setOwnershipType] = useState('');
  const [surveyNumber, setSurveyNumber] = useState('');
  const [farmhouseAvailable, setFarmhouseAvailable] = useState(''); // '' | 'true' | 'false'
  const [fencingDone, setFencingDone] = useState('');

  // FE-only fields — never sent to the backend (see class doc)
  const [rtc, setRtc] = useState('');
  const [crops, setCrops] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);

  const [description, setDescription] = useState('');

  const fieldVisible = (key: ListingFieldKey): boolean => isListingFieldVisible(key, propertyType, 'sale');

  const priceValid = priceRupees != null && priceRupees > 0;
  const canSubmit = priceValid;

  const buildPayload = () => ({
    propertyType,
    title: title.trim() || undefined,
    locality: locality.trim() || undefined,
    price: priceRupees ?? undefined,
    description: description.trim() || undefined,
    listingPurpose: 'sale',
    landArea: landArea != null && landArea > 0 ? landArea : undefined,
    landAreaUnit: landArea != null && landArea > 0 ? landAreaUnit : undefined,
    facing: fieldVisible('facing') ? (facing || undefined) : undefined,
    waterSource: waterSource || undefined,
    soilType: soilType || undefined,
    roadAccess: roadAccess || undefined,
    cultivationStatus: cultivationStatus || undefined,
    ownershipType: ownershipType || undefined,
    surveyNumber: surveyNumber.trim() || undefined,
    landCategory: landCategory || undefined,
    agriConversionStatus: fieldVisible('agriConversionStatus') ? (agriConversionStatus || undefined) : undefined,
    farmhouseAvailable: farmhouseAvailable === 'true' ? true : farmhouseAvailable === 'false' ? false : undefined,
    fencingDone: fencingDone === 'true' ? true : fencingDone === 'false' ? false : undefined,
    // NOTE: rtc/crops/features are DELIBERATELY OMITTED — no backend write
    // path exists (see class doc). They are folded into `description` only.
  });

  const persistDraft = (onDone?: (id: string) => void) => {
    setHasAttempted(true);
    if (!canSubmit) return;

    if (listingId) {
      updateListing.mutate(buildPayload(), { onSuccess: () => onDone?.(listingId) });
      return;
    }

    if (draftInFlightRef.current || createListing.isPending) return;
    draftInFlightRef.current = true;

    createListing.mutate(buildPayload(), {
      onSuccess: (data) => {
        draftInFlightRef.current = false;
        setListingId(data.id);
        toast({ title: 'Draft saved', description: 'Continue adding photos, location, and a description below.' });
        onDone?.(data.id);
      },
      onError: (error: Error) => {
        draftInFlightRef.current = false;
        const apiErr = error as ApiError;
        const body = apiErr.body as Record<string, unknown> | undefined;
        const message =
          (body?.message as string | undefined) ??
          (body?.error as string | undefined) ??
          error.message;
        toast({ title: 'Could not save draft', description: message, variant: 'destructive' });
      },
    });
  };

  const handleGoToReview = () => persistDraft(() => setMode('review'));
  const handleBackToEdit = () => setMode('edit');

  const handleSubmitForReview = () => {
    if (!listingId) return;
    submitListing.mutate(undefined, {
      onSuccess: () => {
        setSubmitted(true);
        toast({ title: 'Submitted for review', description: 'Pending admin approval.' });
      },
      onError: (error: Error) => {
        const apiErr = error as ApiError;
        const body = apiErr.body as Record<string, unknown> | undefined;
        const message =
          (body?.message as string | undefined) ??
          (body?.error as string | undefined) ??
          error.message;
        toast({ title: 'Submit failed', description: message, variant: 'destructive' });
      },
    });
  };

  const checklist: ListingStrengthChecklist = {
    hasType: true,
    hasPurpose: true,
    hasLocality: locality.trim() !== '',
    hasArea: landArea != null && landArea > 0,
    hasPrice: priceValid,
    hasTitle: title.trim() !== '',
    hasConfigDetails: waterSource !== '' || soilType !== '',
    hasPhotos: imageCount > 0,
    isPinned: addressConfirmed,
    hasDescription: description.trim().length >= 20,
  };
  const strengthPercent = computeFormCompleteness(checklist);

  // Real submit-gate strength — mirrors ListingTransitionPolicy.validateFields'
  // agricultural_land case EXACTLY: price>0, locality, addressConfirmed,
  // >=3 images, landArea + landAreaUnit. LOCAL to this form (listingStrength.ts
  // is typed strictly to the 4 residential property types).
  const priceOk = priceValid;
  const imagesOk = imageCount >= 3;
  const locationEnteredOk = residentialLocation.state.resolved != null || addressConfirmed;
  const pinConfirmedOk = addressConfirmed;
  const localityOk = locality.trim() !== '';
  const areaOk = landArea != null && landArea > 0 && landAreaUnit !== '';
  const gates: ListingStrengthGate[] = [
    { key: 'price', label: 'Add the total price', met: priceOk },
    { key: 'locality', label: 'Add the locality', met: localityOk },
    { key: 'area', label: 'Add the land area', met: areaOk },
    { key: 'images', label: `Add at least 3 photos (${Math.min(imageCount, 3)}/3)`, met: imagesOk },
    { key: 'locationEntered', label: 'Location entered', met: locationEnteredOk },
    { key: 'pinConfirmed', label: 'Map pin confirmed', met: pinConfirmedOk },
  ];
  const metCount = gates.filter((g) => g.met).length;
  const strengthResult: ListingStrengthResult = {
    isSubmittable: gates.every((g) => g.met),
    percent: Math.round((metCount / gates.length) * 100),
    gates,
    missingItems: gates.filter((g) => !g.met).map((g) => g.label),
  };

  const descriptionFacts: AgriculturalDescriptionFacts = {
    locality,
    landArea,
    landAreaUnit,
    facing,
    waterSource,
    soilType,
    roadAccess,
    cultivationStatus,
    landCategory,
    farmhouseAvailable,
    fencingDone,
    crops,
    features,
    priceRupees,
  };

  const priceBreakdown = computeAgriPriceBreakdown(priceRupees, landArea, landAreaUnit);

  const specChips: BuyerPreviewSpecChip[] = [];
  if (landArea) specChips.push({ label: `${landArea} ${landAreaUnit}` });
  const facingLabel = FACING_OPTIONS.find((o) => o.value === facing)?.label;
  if (facingLabel) specChips.push({ label: `${facingLabel} facing` });

  if (submitted) {
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

  if (mode === 'review' && listingId) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 pb-24">
        <button type="button" onClick={handleBackToEdit} className="mb-4 text-sm font-semibold text-primary">
          &larr; Back to editing
        </button>
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Agricultural land listing
          </p>
          <h1 className="text-2xl font-bold text-foreground">Review your listing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Check everything looks right. Nothing here is publicly verified — it shows exactly what you entered.
          </p>
        </div>

        <AgriculturalReviewPreview
          listingId={listingId}
          addressConfirmed={addressConfirmed}
          strengthResult={strengthResult}
          onEditSection={handleBackToEdit}
          facts={{
            propertyType,
            listingPurpose: 'sale',
            title,
            description,
            locality,
            landArea,
            landAreaUnit,
            facing,
            waterSource,
            soilType,
            roadAccess,
            cultivationStatus,
            landCategory,
            agriConversionStatus,
            ownershipType,
            surveyNumber,
            farmhouseAvailable,
            fencingDone,
            rtc,
            crops,
            features,
            priceRupees,
          }}
        />

        <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {strengthResult.isSubmittable ? 'Ready to submit for review' : `${strengthResult.missingItems.length} item(s) still needed`}
            </p>
            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={handleBackToEdit}>
                Back to editing
              </Button>
              <Button
                type="button"
                onClick={handleSubmitForReview}
                disabled={!strengthResult.isSubmittable || submitListing.isPending}
              >
                {submitListing.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit for review
              </Button>
            </div>
          </div>
        </div>
      </div>
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
          {/* Section 1 — Where is it? */}
          <Section number={1} title="Where is it?">
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Residential &amp; commercial listings use a separate flow.</span>
              <button
                type="button"
                onClick={onSwitchToGenericFlow}
                className="ml-auto shrink-0 font-semibold text-primary underline-offset-2 hover:underline"
              >
                Switch flow
              </button>
            </div>

            <Field id="locality" label="Locality / village *">
              <AddressSearch location={residentialLocation} />
              {hasAttempted && !locality.trim() && <p className="text-sm text-destructive">Locality is required.</p>}
            </Field>

            <Field id="title" label="Listing title" hint="Buyers see this first">
              <Input id="title" placeholder="e.g. 2.5 Acre Farmland in Hejamadi" value={title} onChange={(e) => setTitle(e.target.value)} className="h-11" />
            </Field>
          </Section>

          {/* Section 2 — Land details */}
          <Section number={2} title="Land details">
            <AreaField
              id="landArea"
              label="Land area"
              propertyType="agricultural_land"
              initialArea={landArea}
              initialUnit={landAreaUnit}
              onChange={(a, u) => { setLandArea(a); setLandAreaUnit(u); }}
            />

            <div>
              <PriceField id="price" initialRupees={null} onChange={setPriceRupees} required />
              {hasAttempted && (priceRupees == null || priceRupees <= 0) && (
                <p className="mt-1 text-sm text-destructive">A valid price greater than 0 is required.</p>
              )}
              {(priceBreakdown.perAcre != null || priceBreakdown.perCent != null || priceBreakdown.perSqft != null) ? (
                <p className="mt-2 font-mono text-xs text-muted-foreground" data-testid="agri-price-breakdown">
                  {priceBreakdown.perAcre != null && `₹${priceBreakdown.perAcre.toLocaleString('en-IN')}/acre`}
                  {priceBreakdown.perCent != null && ` · ₹${priceBreakdown.perCent.toLocaleString('en-IN')}/cent`}
                  {priceBreakdown.perSqft != null && ` · ₹${priceBreakdown.perSqft.toLocaleString('en-IN')}/sqft`}
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Per-acre / per-cent / per-sq.ft price appears once you add area and price.</p>
              )}
            </div>

            {fieldVisible('facing') && (
              <Field id="facing" label="Facing">
                <Select value={facing} onValueChange={setFacing}>
                  <SelectTrigger id="facing" className="h-11"><SelectValue placeholder="Select facing" /></SelectTrigger>
                  <SelectContent>
                    {FACING_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </Section>

          {/* Section 3 — Water, cultivation & suitability (collapsible, matches design mock) */}
          <Collapsible defaultOpen>
            <section className="rounded-2xl border bg-card p-6 shadow-sm">
              <CollapsibleTrigger asChild>
                <button type="button" className="flex w-full items-center justify-between text-left">
                  <SectionHeader number={3} title="Water, cultivation & suitability" />
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform" aria-hidden="true" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-1">
                {fieldVisible('waterSource') && (
                  <Field id="waterSource" label="Water source">
                    <Select value={waterSource} onValueChange={setWaterSource}>
                      <SelectTrigger id="waterSource" className="h-11"><SelectValue placeholder="Select water source" /></SelectTrigger>
                      <SelectContent>
                        {WATER_SOURCE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {fieldVisible('soilType') && (
                  <Field id="soilType" label="Soil type">
                    <Select value={soilType} onValueChange={setSoilType}>
                      <SelectTrigger id="soilType" className="h-11"><SelectValue placeholder="Select soil type" /></SelectTrigger>
                      <SelectContent>
                        {SOIL_TYPE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {fieldVisible('roadAccess') && (
                  <Field id="roadAccess" label="Road access">
                    <Select value={roadAccess} onValueChange={setRoadAccess}>
                      <SelectTrigger id="roadAccess" className="h-11"><SelectValue placeholder="Select road access" /></SelectTrigger>
                      <SelectContent>
                        {ROAD_ACCESS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {fieldVisible('cultivationStatus') && (
                  <Field id="cultivationStatus" label="Cultivation status">
                    <Select value={cultivationStatus} onValueChange={setCultivationStatus}>
                      <SelectTrigger id="cultivationStatus" className="h-11"><SelectValue placeholder="Select cultivation status" /></SelectTrigger>
                      <SelectContent>
                        {CULTIVATION_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                <MultiChipGroup testId="chip-group-crops" label="Crops grown / suitable for" options={CROP_OPTIONS} value={crops} onValueChange={setCrops} />
                <MultiChipGroup testId="chip-group-features" label="On-land features" options={FEATURE_OPTIONS} value={features} onValueChange={setFeatures} />
                <p className="text-xs text-muted-foreground" data-testid="crops-features-not-saved-note">
                  Crops and features aren't saved as structured listing data yet — they're added to your description below so buyers can still see them.
                </p>
              </CollapsibleContent>
            </section>
          </Collapsible>

          {/* Section 4 — Land record details (collapsible, collapsed by default) */}
          <Collapsible open={moreDetailsOpen} onOpenChange={setMoreDetailsOpen}>
            <section className="rounded-2xl border bg-card p-6 shadow-sm">
              <CollapsibleTrigger asChild>
                <button type="button" className="flex w-full items-center justify-between text-left">
                  <SectionHeader number={4} title="Land record details" />
                  <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${moreDetailsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-1">
                <p className="text-xs text-muted-foreground">
                  Seller / broker-provided details — shown exactly as entered, never platform-verified.
                </p>
                {fieldVisible('landCategory') && (
                  <Field id="landCategory" label="Land category">
                    <Select value={landCategory} onValueChange={setLandCategory}>
                      <SelectTrigger id="landCategory" className="h-11"><SelectValue placeholder="Select land category" /></SelectTrigger>
                      <SelectContent>
                        {LAND_CATEGORY_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {fieldVisible('agriConversionStatus') && (
                  <Field
                    id="agriConversionStatus"
                    label="Conversion status (optional)"
                    hint="Declared by the seller/broker — not verified by ReTrends."
                  >
                    <Select value={agriConversionStatus} onValueChange={setAgriConversionStatus}>
                      <SelectTrigger id="agriConversionStatus" className="h-11"><SelectValue placeholder="Select conversion status" /></SelectTrigger>
                      <SelectContent>
                        {AGRI_CONVERSION_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {fieldVisible('ownershipType') && (
                  <Field id="ownershipType" label="Ownership type">
                    <Select value={ownershipType} onValueChange={setOwnershipType}>
                      <SelectTrigger id="ownershipType" className="h-11"><SelectValue placeholder="Select ownership type" /></SelectTrigger>
                      <SelectContent>
                        {OWNERSHIP_TYPE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {fieldVisible('surveyNumber') && (
                  <Field id="surveyNumber" label="Survey number">
                    <Input id="surveyNumber" maxLength={64} placeholder="e.g. 123/4A" value={surveyNumber} onChange={(e) => setSurveyNumber(e.target.value)} className="h-11" />
                  </Field>
                )}
                <Field id="rtc" label="RTC number" hint="Not yet saved as structured data — folded into your description below.">
                  <Input id="rtc" maxLength={64} placeholder="e.g. RTC-2024-00123" value={rtc} onChange={(e) => setRtc(e.target.value)} className="h-11" />
                </Field>
                {(fieldVisible('farmhouseAvailable') || fieldVisible('fencingDone')) && (
                  <div className="grid grid-cols-2 gap-4">
                    {fieldVisible('farmhouseAvailable') && (
                      <Field id="farmhouseAvailable" label="Farmhouse available">
                        <Select value={farmhouseAvailable} onValueChange={setFarmhouseAvailable}>
                          <SelectTrigger id="farmhouseAvailable" className="h-11"><SelectValue placeholder="Not specified" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Yes</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                    {fieldVisible('fencingDone') && (
                      <Field id="fencingDone" label="Fencing done">
                        <Select value={fencingDone} onValueChange={setFencingDone}>
                          <SelectTrigger id="fencingDone" className="h-11"><SelectValue placeholder="Not specified" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Yes</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </div>
                )}
              </CollapsibleContent>
            </section>
          </Collapsible>

          {/* Section 5 — Photos & location (inline, real system, no navigation) */}
          <Section number={5} title="Photos & location">
            {listingId ? (
              <>
                <InlinePhotos listingId={listingId} />
                <div className="h-px bg-border" />
                <MapPin location={residentialLocation} />
                <p className="text-xs text-muted-foreground">
                  The pin marks the location only — it is not a legal or survey boundary.
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Save your details to add photos and pin the location.
                </p>
                <Button type="button" variant="outline" onClick={() => persistDraft()} disabled={!canSubmit || createListing.isPending}>
                  {createListing.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Continue
                </Button>
              </div>
            )}
          </Section>

          {/* Section 6 — Nearby places (gated on addressConfirmed, honest derived/broker-added labels) */}
          {listingId && (
            <Section number={6} title="Nearby places">
              <InlineNearby listingId={listingId} propertyType={propertyType} addressConfirmed={addressConfirmed} />
            </Section>
          )}

          {/* Section 7 — Description — deterministic FE-only draft builder (no AI claim). */}
          <Section number={listingId ? 7 : 6} title="Description">
            <AgriculturalDescriptionAssistant facts={descriptionFacts} value={description} onChange={setDescription} />
          </Section>
        </div>

        {/* Right column — buyer preview + listing strength */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <BuyerPreviewCard
            title={title}
            locality={locality}
            priceRupees={priceRupees}
            monthlyRent={null}
            isRent={false}
            areaSqft={landArea}
            specChips={specChips}
            photoCount={imageCount}
            coverImageUrl={coverImageUrl}
            locationConfirmed={addressConfirmed}
          />
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <ListingStrengthMeter checklist={checklist} />
          </div>
          {listingId && (
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <StrengthMeter result={strengthResult} variant="sidebar" />
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {canSubmit ? `Good listing · ${strengthPercent}% complete` : 'Add a price to continue'}
          </p>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => persistDraft()} disabled={!canSubmit || createListing.isPending || updateListing.isPending}>
              {(createListing.isPending || updateListing.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save draft
            </Button>
            <Button type="button" onClick={handleGoToReview} disabled={!canSubmit || createListing.isPending || updateListing.isPending}>
              {(createListing.isPending || updateListing.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Review
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
