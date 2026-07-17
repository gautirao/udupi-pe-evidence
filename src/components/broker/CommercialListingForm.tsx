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
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PropertyTypeCardSelector } from '@/components/broker/PropertyTypeCardSelector';
import { AreaField } from '@/components/broker/AreaField';
import { PriceField } from '@/components/broker/PriceField';
import { BuyerPreviewCard, type BuyerPreviewSpecChip } from '@/components/broker/BuyerPreviewCard';
import { ListingStrengthMeter, type ListingStrengthChecklist, computeListingStrength as computeFormCompleteness } from '@/components/broker/ListingStrengthMeter';
import { SingleChipGroup, MultiChipGroup, type ChipOption } from '@/components/broker/ChipGroup';
import { InlinePhotos } from '@/components/broker/residential/InlinePhotos';
import { AddressSearch } from '@/components/broker/residential/AddressSearch';
import { MapPin } from '@/components/broker/residential/MapPin';
import { useResidentialLocation } from '@/components/broker/residential/useResidentialLocation';
import { InlineNearby } from '@/components/broker/residential/InlineNearby';
import { FieldPairRow } from '@/components/broker/residential/FieldPairRow';
import { StrengthMeter } from '@/components/broker/residential/StrengthMeter';
import { CommercialReviewPreview } from '@/components/broker/commercial/CommercialReviewPreview';
import { CommercialDescriptionAssistant } from '@/components/broker/commercial/CommercialDescriptionAssistant';
import type { CommercialDescriptionFacts } from '@/components/broker/commercial/commercialDescriptionBuilder';
import type { ListingStrengthResult, ListingStrengthGate } from '@/lib/listingStrength';
import {
  isListingFieldVisible,
  deriveCommercialSubtype,
  type ListingFieldKey,
  type CommercialSubtype,
} from '@/lib/listingFieldConfig';
import { intOrUndef, floatOrUndef } from '@/lib/listing-utils';
import {
  COMMERCIAL_SUBTYPE_OPTIONS,
  COMMERCIAL_FLOOR_CHOICE_OPTIONS,
  COMMERCIAL_FLOOR_MODE_OPTIONS,
  SHOP_HUB_TYPE_OPTIONS,
  OFFICE_HUB_TYPE_OPTIONS,
  SHOP_SUITABLE_USE_OPTIONS,
  OFFICE_SUITABLE_USE_OPTIONS,
  BUILDING_SUITABLE_USE_OPTIONS,
  WAREHOUSE_SUITABLE_USE_OPTIONS,
  LAND_SUITABLE_USE_OPTIONS,
  COMMERCIAL_UTILITY_OPTIONS,
  COMMERCIAL_OCCUPANCY_STATUS_OPTIONS,
  COMMERCIAL_FURNISHING_STATUS_OPTIONS,
  COMMERCIAL_OWNERSHIP_OPTIONS,
  COMMERCIAL_AVAILABILITY_OPTIONS,
  WAREHOUSE_FLOORING_OPTIONS,
  COMMERCIAL_AREA_UNIT_OPTIONS,
} from '@/lib/listing-constants';

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
 */

type CommercialPropertyType = 'commercial' | 'commercial_building' | 'warehouse' | 'commercial_land';
type ExplicitSubtype = '' | 'SHOP' | 'OFFICE';
type CommercialPurpose = 'sale' | 'rent' | 'lease';

const PURPOSE_OPTIONS: readonly { value: CommercialPurpose; label: string }[] = [
  { value: 'sale', label: 'For Sale' },
  { value: 'rent', label: 'For Rent' },
  { value: 'lease', label: 'For Lease' },
];

const SUBTYPE_CHOICE_OPTIONS = COMMERCIAL_SUBTYPE_OPTIONS.filter((o) => o.value === 'SHOP' || o.value === 'OFFICE');

const WASHROOM_PARKING_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3+' },
];

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

function BoolSwitch({ id, label, value, onChange }: { id: string; label: string; value: boolean | null | undefined; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <Switch id={id} checked={value === true} onCheckedChange={onChange} />
    </div>
  );
}

/** Local 3-way Sale/Rent/Lease segmented control — see class doc for why ListingPurposeToggle isn't reused here. */
function CommercialPurposeToggle({ value, onChange }: { value: CommercialPurpose; onChange: (v: CommercialPurpose) => void }) {
  return (
    <div role="group" aria-label="Listing purpose" className="inline-flex rounded-lg bg-muted p-1">
      {PURPOSE_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-5 py-1.5 text-sm font-medium transition-colors ${selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function suitableUseOptionsFor(subtype: CommercialSubtype | undefined) {
  switch (subtype) {
    case 'SHOP': return SHOP_SUITABLE_USE_OPTIONS;
    case 'OFFICE': return OFFICE_SUITABLE_USE_OPTIONS;
    case 'BUILDING': return BUILDING_SUITABLE_USE_OPTIONS;
    case 'WAREHOUSE': return WAREHOUSE_SUITABLE_USE_OPTIONS;
    case 'LAND': return LAND_SUITABLE_USE_OPTIONS;
    default: return [];
  }
}

function hubTypeOptionsFor(subtype: CommercialSubtype | undefined) {
  if (subtype === 'SHOP') return SHOP_HUB_TYPE_OPTIONS;
  if (subtype === 'OFFICE') return OFFICE_HUB_TYPE_OPTIONS;
  return [];
}

interface CommercialListingFormProps {
  initialPropertyType: CommercialPropertyType;
  /** #1748 — optional demand-gap prefill; only the shared 'sale'|'rent' vocabulary
   *  is forwarded (never 'lease'). Defaults to 'sale' when absent. */
  initialListingPurpose?: 'sale' | 'rent';
  onSwitchToGenericFlow: () => void;
  navigate: NavigateFunction;
}

export function CommercialListingForm({ initialPropertyType, initialListingPurpose, onSwitchToGenericFlow, navigate }: CommercialListingFormProps) {
  const createListing = useCreateListing();
  const { toast } = useToast();

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

  const [propertyType, setPropertyType] = useState<CommercialPropertyType>(initialPropertyType);
  const [explicitSubtype, setExplicitSubtype] = useState<ExplicitSubtype>('');
  const [listingPurpose, setListingPurpose] = useState<CommercialPurpose>(initialListingPurpose ?? 'sale');
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

  // Area
  const [landArea, setLandArea] = useState<number | null>(null);
  const [landAreaUnit, setLandAreaUnit] = useState('cent');
  const [builtArea, setBuiltArea] = useState<number | null>(null);
  const [builtAreaUnit, setBuiltAreaUnit] = useState('sqft');
  const [commercialAreaUnit, setCommercialAreaUnit] = useState('');

  // SHOP/OFFICE
  const [floorChoice, setFloorChoice] = useState('');
  const [hubType, setHubType] = useState('');

  // BUILDING
  const [floorMode, setFloorMode] = useState('');
  const [powerLoadKva, setPowerLoadKva] = useState('');
  const [occupancyStatus, setOccupancyStatus] = useState('');

  // OFFICE
  const [officeSeats, setOfficeSeats] = useState('');
  const [officeCabins, setOfficeCabins] = useState('');
  const [officeMeetingRooms, setOfficeMeetingRooms] = useState('');

  // WAREHOUSE
  const [warehouseClearHeightFt, setWarehouseClearHeightFt] = useState('');
  const [warehouseLoadingBays, setWarehouseLoadingBays] = useState('');
  const [warehouseTruckAccess, setWarehouseTruckAccess] = useState<boolean | null>(null);
  const [warehouseFlooring, setWarehouseFlooring] = useState('');

  // LAND
  const [commercialZoning, setCommercialZoning] = useState('');
  const [commercialOwnership, setCommercialOwnership] = useState('');
  const [commercialApprovalsText, setCommercialApprovalsText] = useState('');

  // Built-space (all subtypes except LAND)
  const [washroomsPublic, setWashroomsPublic] = useState('');
  const [washroomsPrivate, setWashroomsPrivate] = useState('');
  const [parkingPublicCount, setParkingPublicCount] = useState('');
  const [parkingPrivateCount, setParkingPrivateCount] = useState('');
  const [commercialFurnishingStatus, setCommercialFurnishingStatus] = useState('');
  const [utilities, setUtilities] = useState<string[]>([]);

  // All subtypes
  const [suitableUses, setSuitableUses] = useState<string[]>([]);
  const [commercialAvailability, setCommercialAvailability] = useState('');

  // Terms
  const [priceRupees, setPriceRupees] = useState<number | null>(null);
  const [monthlyRent, setMonthlyRent] = useState('');
  const [securityDepositMonths, setSecurityDepositMonths] = useState('');
  const [lockInMonths, setLockInMonths] = useState('');
  const [expectedRentalYieldPct, setExpectedRentalYieldPct] = useState('');
  const [currentMonthlyIncomePaise, setCurrentMonthlyIncomePaise] = useState('');
  const [leaseTermMonths, setLeaseTermMonths] = useState('');
  const [leaseEscalationPct, setLeaseEscalationPct] = useState('');

  const [description, setDescription] = useState('');

  const commercialSubtype: CommercialSubtype | undefined = deriveCommercialSubtype(propertyType, explicitSubtype);
  const isLand = commercialSubtype === 'LAND';
  const isRentOrLease = listingPurpose === 'rent' || listingPurpose === 'lease';

  const fieldVisible = (key: ListingFieldKey): boolean =>
    isListingFieldVisible(key, propertyType, listingPurpose, commercialSubtype);

  const priceValid = isRentOrLease
    ? (monthlyRent !== '' && parseInt(monthlyRent, 10) > 0)
    : (priceRupees != null && priceRupees > 0);
  const subtypeResolved = commercialSubtype !== undefined;
  const canSubmit = subtypeResolved && priceValid;

  const primaryAreaSqft = isLand ? landArea : builtArea;

  const buildPayload = () => ({
    propertyType,
    title: title.trim() || undefined,
    locality: locality.trim() || undefined,
    price: isRentOrLease ? undefined : priceRupees ?? undefined,
    description: description.trim() || undefined,
    listingPurpose,
    landArea: isLand && landArea != null && landArea > 0 ? landArea : undefined,
    landAreaUnit: isLand && landArea != null && landArea > 0 ? landAreaUnit : undefined,
    builtArea: !isLand && builtArea != null && builtArea > 0 ? builtArea : undefined,
    builtAreaUnit: !isLand && builtArea != null && builtArea > 0 ? builtAreaUnit : undefined,
    monthlyRent: isRentOrLease ? intOrUndef(monthlyRent) : undefined,
    securityDepositMonths: isRentOrLease ? intOrUndef(securityDepositMonths) : undefined,
    lockInMonths: isRentOrLease ? intOrUndef(lockInMonths) : undefined,
    // #1684 typed commercial fields — every field gated by fieldVisible() so the
    // payload never sends a field the server's validateCommercialFields would 400 on.
    commercialSubtype: fieldVisible('commercialSubtype') ? (explicitSubtype || undefined) : undefined,
    floorChoice: fieldVisible('floorChoice') ? (floorChoice || undefined) : undefined,
    hubType: fieldVisible('hubType') ? (hubType || undefined) : undefined,
    floorMode: fieldVisible('floorMode') ? (floorMode || undefined) : undefined,
    powerLoadKva: fieldVisible('powerLoadKva') ? floatOrUndef(powerLoadKva) : undefined,
    occupancyStatus: fieldVisible('occupancyStatus') ? (occupancyStatus || undefined) : undefined,
    officeSeats: fieldVisible('officeSeats') ? intOrUndef(officeSeats) : undefined,
    officeCabins: fieldVisible('officeCabins') ? intOrUndef(officeCabins) : undefined,
    officeMeetingRooms: fieldVisible('officeMeetingRooms') ? intOrUndef(officeMeetingRooms) : undefined,
    warehouseClearHeightFt: fieldVisible('warehouseClearHeightFt') ? floatOrUndef(warehouseClearHeightFt) : undefined,
    warehouseLoadingBays: fieldVisible('warehouseLoadingBays') ? intOrUndef(warehouseLoadingBays) : undefined,
    warehouseTruckAccess: fieldVisible('warehouseTruckAccess') ? warehouseTruckAccess ?? undefined : undefined,
    warehouseFlooring: fieldVisible('warehouseFlooring') ? (warehouseFlooring || undefined) : undefined,
    commercialZoning: fieldVisible('commercialZoning') ? (commercialZoning.trim() || undefined) : undefined,
    commercialOwnership: fieldVisible('commercialOwnership') ? (commercialOwnership || undefined) : undefined,
    // #1730 backend contract: commercialApprovals is a single free-text String
    // (same shape as commercialZoning/commercialOwnership), NOT a string array.
    commercialApprovals: fieldVisible('commercialApprovals') ? (commercialApprovalsText.trim() || undefined) : undefined,
    washroomsPublic: fieldVisible('washroomsPublic') ? intOrUndef(washroomsPublic) : undefined,
    washroomsPrivate: fieldVisible('washroomsPrivate') ? intOrUndef(washroomsPrivate) : undefined,
    parkingPublicCount: fieldVisible('parkingPublicCount') ? intOrUndef(parkingPublicCount) : undefined,
    parkingPrivateCount: fieldVisible('parkingPrivateCount') ? intOrUndef(parkingPrivateCount) : undefined,
    commercialFurnishingStatus: fieldVisible('commercialFurnishingStatus') ? (commercialFurnishingStatus || undefined) : undefined,
    utilities: fieldVisible('utilities') && utilities.length > 0 ? utilities : undefined,
    suitableUses: fieldVisible('suitableUses') && suitableUses.length > 0 ? suitableUses : undefined,
    commercialAvailability: fieldVisible('commercialAvailability') ? (commercialAvailability || undefined) : undefined,
    commercialAreaUnit: fieldVisible('commercialAreaUnit') ? (commercialAreaUnit || undefined) : undefined,
    expectedRentalYieldPct: fieldVisible('expectedRentalYieldPct') ? floatOrUndef(expectedRentalYieldPct) : undefined,
    currentMonthlyIncomePaise: fieldVisible('currentMonthlyIncomePaise') ? intOrUndef(currentMonthlyIncomePaise) : undefined,
    leaseTermMonths: fieldVisible('leaseTermMonths') ? intOrUndef(leaseTermMonths) : undefined,
    leaseEscalationPct: fieldVisible('leaseEscalationPct') ? floatOrUndef(leaseEscalationPct) : undefined,
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
    hasType: subtypeResolved,
    hasPurpose: true,
    hasLocality: locality.trim() !== '',
    hasArea: primaryAreaSqft != null && primaryAreaSqft > 0,
    hasPrice: priceValid,
    hasTitle: title.trim() !== '',
    hasConfigDetails:
      commercialSubtype === 'SHOP' || commercialSubtype === 'OFFICE' ? floorChoice !== ''
        : commercialSubtype === 'BUILDING' ? floorMode !== ''
          : commercialSubtype === 'WAREHOUSE' ? warehouseFlooring !== ''
            : commercialSubtype === 'LAND' ? commercialZoning.trim() !== ''
              : false,
    hasPhotos: imageCount > 0,
    isPinned: addressConfirmed,
    hasDescription: description.trim().length >= 20,
  };
  const strengthPercent = computeFormCompleteness(checklist);

  // Real submit-gate strength — LOCAL to this form (not listingStrength.ts,
  // which is typed strictly to the 4 residential property types). Mirrors the
  // same real backend submit gate (addressConfirmed + >=3 images + price/rent
  // + submittable type) via the shared ListingStrengthResult/StrengthMeter
  // presentation contract.
  const priceOk = priceValid;
  const imagesOk = imageCount >= 3;
  const locationEnteredOk = residentialLocation.state.resolved != null || addressConfirmed;
  const pinConfirmedOk = addressConfirmed;
  const localityOk = locality.trim() !== '';
  const gates: ListingStrengthGate[] = [
    { key: 'type', label: 'Choose a commercial subtype', met: subtypeResolved },
    { key: 'price', label: isRentOrLease ? 'Add the monthly rent' : 'Add the total price', met: priceOk },
    { key: 'locality', label: 'Add the locality', met: localityOk },
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

  const descriptionFacts: CommercialDescriptionFacts = {
    commercialSubtype,
    listingPurpose,
    locality,
    primaryAreaSqft,
    areaUnit: isLand ? landAreaUnit : builtAreaUnit,
    floorChoice,
    hubType,
    floorMode,
    officeSeats,
    officeCabins,
    officeMeetingRooms,
    warehouseClearHeightFt,
    warehouseFlooring,
    commercialZoning,
    commercialFurnishingStatus,
    suitableUses,
    commercialAvailability,
    priceRupees,
    monthlyRent: intOrUndef(monthlyRent) ?? null,
    leaseTermMonths,
  };

  const specChips: BuyerPreviewSpecChip[] = [];
  if (fieldVisible('commercialAreaUnit') && primaryAreaSqft) specChips.push({ label: `${primaryAreaSqft} ${isLand ? landAreaUnit : builtAreaUnit}` });
  if (fieldVisible('floorChoice') && floorChoice) {
    const opt = COMMERCIAL_FLOOR_CHOICE_OPTIONS.find((o) => o.value === floorChoice);
    if (opt) specChips.push({ label: opt.label });
  }
  if (fieldVisible('commercialFurnishingStatus') && commercialFurnishingStatus) {
    const opt = COMMERCIAL_FURNISHING_STATUS_OPTIONS.find((o) => o.value === commercialFurnishingStatus);
    if (opt) specChips.push({ label: opt.label });
  }

  const suitableUseOptions = suitableUseOptionsFor(commercialSubtype);
  const hubTypeOptions = hubTypeOptionsFor(commercialSubtype);

  if (submitted) {
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

  if (mode === 'review' && listingId) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 pb-24">
        <button type="button" onClick={handleBackToEdit} className="mb-4 text-sm font-semibold text-primary">
          &larr; Back to editing
        </button>
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Commercial listing
          </p>
          <h1 className="text-2xl font-bold text-foreground">Review your listing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Check everything looks right. Nothing here is publicly verified — it shows exactly what you entered.
          </p>
        </div>

        <CommercialReviewPreview
          listingId={listingId}
          addressConfirmed={addressConfirmed}
          strengthResult={strengthResult}
          onEditSection={handleBackToEdit}
          facts={{
            propertyType,
            commercialSubtype,
            listingPurpose,
            title,
            description,
            locality,
            primaryAreaSqft,
            areaUnit: isLand ? landAreaUnit : builtAreaUnit,
            floorChoice,
            hubType,
            floorMode,
            occupancyStatus,
            officeSeats,
            officeCabins,
            officeMeetingRooms,
            warehouseClearHeightFt,
            warehouseFlooring,
            commercialZoning,
            commercialOwnership,
            washroomsPublic,
            washroomsPrivate,
            parkingPublicCount,
            parkingPrivateCount,
            commercialFurnishingStatus,
            utilities,
            suitableUses,
            commercialAvailability,
            priceRupees,
            monthlyRent: intOrUndef(monthlyRent) ?? null,
            leaseTermMonths,
            expectedRentalYieldPct,
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
          Commercial listing
        </p>
        <h1 className="text-2xl font-bold text-foreground">Create a listing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add what buyers actually need. Optional details stay tucked away — fill only what you know, skip the rest.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* Section 1 — Property type & purpose */}
          <Section number={1} title="Property type & purpose">
            <PropertyTypeCardSelector
              id="commercial-property-type"
              value={propertyType}
              onChange={(v) => { setPropertyType(v as CommercialPropertyType); setExplicitSubtype(''); }}
              commercialOnly
            />

            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Residential &amp; agricultural listings use a separate flow.</span>
              <button
                type="button"
                onClick={onSwitchToGenericFlow}
                className="ml-auto shrink-0 font-semibold text-primary underline-offset-2 hover:underline"
              >
                Switch flow
              </button>
            </div>

            {propertyType === 'commercial' && (
              <Field id="commercialSubtype" label="Is this a shop or an office? *">
                <Select value={explicitSubtype} onValueChange={(v) => setExplicitSubtype(v as ExplicitSubtype)}>
                  <SelectTrigger id="commercialSubtype" className="h-11"><SelectValue placeholder="Select subtype" /></SelectTrigger>
                  <SelectContent>
                    {SUBTYPE_CHOICE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {hasAttempted && !explicitSubtype && <p className="text-sm text-destructive">Choose shop or office to continue.</p>}
              </Field>
            )}

            <div className="space-y-2">
              <Label className="text-[13px] font-semibold">Listing purpose</Label>
              <CommercialPurposeToggle value={listingPurpose} onChange={setListingPurpose} />
            </div>
          </Section>

          {/* Section 2 — Where is it? */}
          <Section number={2} title="Where is it?">
            <Field id="locality" label="Locality / area *">
              <AddressSearch location={residentialLocation} />
              {hasAttempted && !locality.trim() && <p className="text-sm text-destructive">Locality is required.</p>}
            </Field>

            <Field id="title" label="Listing title *" hint="Buyers see this first">
              <Input id="title" placeholder="e.g. 500 sqft Shop in Udupi Town" value={title} onChange={(e) => setTitle(e.target.value)} className="h-11" />
              {hasAttempted && !title.trim() && <p className="text-sm text-destructive">Title is required.</p>}
            </Field>
          </Section>

          {/* Section 3 — Property details (subtype-adaptive) */}
          <Section number={3} title="Property details">
            {isLand ? (
              <AreaField id="landArea" label="Land area" propertyType="land" initialArea={landArea} initialUnit={landAreaUnit} onChange={(a, u) => { setLandArea(a); setLandAreaUnit(u); }} />
            ) : (
              <AreaField id="builtArea" label="Built area" propertyType="commercial" initialArea={builtArea} initialUnit={builtAreaUnit} onChange={(a, u) => { setBuiltArea(a); setBuiltAreaUnit(u); }} />
            )}

            {fieldVisible('commercialAreaUnit') && (
              <Field id="commercialAreaUnit" label="Area unit (listing display)">
                <Select value={commercialAreaUnit} onValueChange={setCommercialAreaUnit}>
                  <SelectTrigger id="commercialAreaUnit" className="h-11"><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>
                    {COMMERCIAL_AREA_UNIT_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {/* SHOP / OFFICE */}
            {(fieldVisible('floorChoice') || fieldVisible('hubType')) && (
              <FieldPairRow>
                {fieldVisible('floorChoice') && (
                  <Field id="floorChoice" label="Floor">
                    <Select value={floorChoice} onValueChange={setFloorChoice}>
                      <SelectTrigger id="floorChoice" className="h-11"><SelectValue placeholder="Select floor" /></SelectTrigger>
                      <SelectContent>
                        {COMMERCIAL_FLOOR_CHOICE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {fieldVisible('hubType') && (
                  <Field id="hubType" label="Location type">
                    <Select value={hubType} onValueChange={setHubType}>
                      <SelectTrigger id="hubType" className="h-11"><SelectValue placeholder="Select location type" /></SelectTrigger>
                      <SelectContent>
                        {hubTypeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </FieldPairRow>
            )}

            {/* OFFICE only */}
            {(fieldVisible('officeSeats') || fieldVisible('officeCabins') || fieldVisible('officeMeetingRooms')) && (
              <div className="grid grid-cols-3 gap-4">
                {fieldVisible('officeSeats') && (
                  <Field id="officeSeats" label="Seats">
                    <Input id="officeSeats" type="number" min="0" className="h-11 font-mono" value={officeSeats} onChange={(e) => setOfficeSeats(e.target.value)} />
                  </Field>
                )}
                {fieldVisible('officeCabins') && (
                  <Field id="officeCabins" label="Cabins">
                    <Input id="officeCabins" type="number" min="0" className="h-11 font-mono" value={officeCabins} onChange={(e) => setOfficeCabins(e.target.value)} />
                  </Field>
                )}
                {fieldVisible('officeMeetingRooms') && (
                  <Field id="officeMeetingRooms" label="Meeting rooms">
                    <Input id="officeMeetingRooms" type="number" min="0" className="h-11 font-mono" value={officeMeetingRooms} onChange={(e) => setOfficeMeetingRooms(e.target.value)} />
                  </Field>
                )}
              </div>
            )}

            {/* BUILDING only */}
            {fieldVisible('floorMode') && (
              <Field id="floorMode" label="Floors available">
                <Select value={floorMode} onValueChange={setFloorMode}>
                  <SelectTrigger id="floorMode" className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {COMMERCIAL_FLOOR_MODE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {/* powerLoadKva is BUILDING-only; occupancyStatus is SHOP + BUILDING (see fieldVisible) */}
            {(fieldVisible('powerLoadKva') || fieldVisible('occupancyStatus')) && (
              <FieldPairRow>
                {fieldVisible('powerLoadKva') && (
                  <Field id="powerLoadKva" label="Power load (KVA)">
                    <Input id="powerLoadKva" type="number" min="0" step="any" className="h-11 font-mono" value={powerLoadKva} onChange={(e) => setPowerLoadKva(e.target.value)} />
                  </Field>
                )}
                {fieldVisible('occupancyStatus') && (
                  <Field id="occupancyStatus" label="Occupancy status">
                    <Select value={occupancyStatus} onValueChange={setOccupancyStatus}>
                      <SelectTrigger id="occupancyStatus" className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {COMMERCIAL_OCCUPANCY_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </FieldPairRow>
            )}

            {/* WAREHOUSE only */}
            {(fieldVisible('warehouseClearHeightFt') || fieldVisible('warehouseLoadingBays')) && (
              <FieldPairRow>
                {fieldVisible('warehouseClearHeightFt') && (
                  <Field id="warehouseClearHeightFt" label="Clear height (ft)">
                    <Input id="warehouseClearHeightFt" type="number" min="0" step="any" className="h-11 font-mono" value={warehouseClearHeightFt} onChange={(e) => setWarehouseClearHeightFt(e.target.value)} />
                  </Field>
                )}
                {fieldVisible('warehouseLoadingBays') && (
                  <Field id="warehouseLoadingBays" label="Loading bays">
                    <Input id="warehouseLoadingBays" type="number" min="0" className="h-11 font-mono" value={warehouseLoadingBays} onChange={(e) => setWarehouseLoadingBays(e.target.value)} />
                  </Field>
                )}
              </FieldPairRow>
            )}
            {fieldVisible('warehouseFlooring') && (
              <Field id="warehouseFlooring" label="Flooring">
                <Select value={warehouseFlooring} onValueChange={setWarehouseFlooring}>
                  <SelectTrigger id="warehouseFlooring" className="h-11"><SelectValue placeholder="Select flooring" /></SelectTrigger>
                  <SelectContent>
                    {WAREHOUSE_FLOORING_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {fieldVisible('warehouseTruckAccess') && (
              <BoolSwitch id="warehouseTruckAccess" label="Truck access" value={warehouseTruckAccess} onChange={setWarehouseTruckAccess} />
            )}

            {/* LAND only */}
            {fieldVisible('commercialZoning') && (
              <Field id="commercialZoning" label="Zoning">
                <Input id="commercialZoning" placeholder="e.g. Commercial zone" value={commercialZoning} onChange={(e) => setCommercialZoning(e.target.value)} className="h-11" />
              </Field>
            )}
            {fieldVisible('commercialOwnership') && (
              <Field id="commercialOwnership" label="Ownership">
                <Select value={commercialOwnership} onValueChange={setCommercialOwnership}>
                  <SelectTrigger id="commercialOwnership" className="h-11"><SelectValue placeholder="Select ownership" /></SelectTrigger>
                  <SelectContent>
                    {COMMERCIAL_OWNERSHIP_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {fieldVisible('commercialApprovals') && (
              <Field id="commercialApprovals" label="Approvals" hint="Comma-separated, e.g. Building plan approved, Fire NOC">
                <Input id="commercialApprovals" value={commercialApprovalsText} onChange={(e) => setCommercialApprovalsText(e.target.value)} className="h-11" />
              </Field>
            )}
          </Section>

          {/* Section 4 — Sale / Rent / Lease terms */}
          <Section number={4} title={listingPurpose === 'sale' ? 'Sale terms' : listingPurpose === 'lease' ? 'Lease terms' : 'Rent terms'}>
            {!isRentOrLease && fieldVisible('price') && (
              <div>
                <PriceField id="price" initialRupees={null} onChange={setPriceRupees} required />
                {hasAttempted && (priceRupees == null || priceRupees <= 0) && (
                  <p className="mt-1 text-sm text-destructive">A valid price greater than 0 is required.</p>
                )}
              </div>
            )}
            {!isRentOrLease && fieldVisible('expectedRentalYieldPct') && (
              <FieldPairRow>
                <Field id="expectedRentalYieldPct" label="Expected rental yield (%)">
                  <Input id="expectedRentalYieldPct" type="number" min="0" step="any" className="h-11 font-mono" value={expectedRentalYieldPct} onChange={(e) => setExpectedRentalYieldPct(e.target.value)} />
                </Field>
                {fieldVisible('currentMonthlyIncomePaise') && (
                  <Field id="currentMonthlyIncomePaise" label="Current monthly income (₹)">
                    <Input id="currentMonthlyIncomePaise" type="number" min="0" className="h-11 font-mono" value={currentMonthlyIncomePaise} onChange={(e) => setCurrentMonthlyIncomePaise(e.target.value)} />
                  </Field>
                )}
              </FieldPairRow>
            )}

            {isRentOrLease && fieldVisible('monthlyRent') && (
              <div>
                <Field id="monthlyRent" label="Monthly rent (₹) *">
                  <Input id="monthlyRent" type="number" min="1" className="h-12 font-mono text-[17px] font-semibold" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} />
                </Field>
                {hasAttempted && (!monthlyRent || parseInt(monthlyRent, 10) <= 0) && (
                  <p className="mt-1 text-sm text-destructive">Monthly rent must be greater than 0.</p>
                )}
              </div>
            )}
            {isRentOrLease && fieldVisible('securityDepositMonths') && (
              <Field id="securityDepositMonths" label="Security deposit (months)">
                <Input id="securityDepositMonths" type="number" min="0" max="24" className="h-11 font-mono" value={securityDepositMonths} onChange={(e) => setSecurityDepositMonths(e.target.value)} />
              </Field>
            )}
            {isRentOrLease && fieldVisible('lockInMonths') && (
              <Field id="lockInMonths" label="Lock-in period (months)">
                <Input id="lockInMonths" type="number" min="0" max="60" className="h-11 font-mono" value={lockInMonths} onChange={(e) => setLockInMonths(e.target.value)} />
              </Field>
            )}
            {isRentOrLease && fieldVisible('leaseTermMonths') && (
              <FieldPairRow>
                <Field id="leaseTermMonths" label="Lease term (months)">
                  <Input id="leaseTermMonths" type="number" min="0" className="h-11 font-mono" value={leaseTermMonths} onChange={(e) => setLeaseTermMonths(e.target.value)} />
                </Field>
                {fieldVisible('leaseEscalationPct') && (
                  <Field id="leaseEscalationPct" label="Lease escalation (%)">
                    <Input id="leaseEscalationPct" type="number" min="0" step="any" className="h-11 font-mono" value={leaseEscalationPct} onChange={(e) => setLeaseEscalationPct(e.target.value)} />
                  </Field>
                )}
              </FieldPairRow>
            )}
          </Section>

          {/* Section 5 — More details (collapsible, collapsed by default) */}
          <Collapsible open={moreDetailsOpen} onOpenChange={setMoreDetailsOpen}>
            <section className="rounded-2xl border bg-card p-6 shadow-sm">
              <CollapsibleTrigger asChild>
                <button type="button" className="flex w-full items-center justify-between text-left">
                  <SectionHeader number={5} title="More details" />
                  <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${moreDetailsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-1">
                {(fieldVisible('washroomsPublic') || fieldVisible('washroomsPrivate')) && (
                  <div className="grid grid-cols-2 gap-4">
                    {fieldVisible('washroomsPublic') && (
                      <SingleChipGroup id="washroomsPublic" label="Public washrooms" options={WASHROOM_PARKING_CHIP_OPTIONS} value={washroomsPublic} onValueChange={setWashroomsPublic} />
                    )}
                    {fieldVisible('washroomsPrivate') && (
                      <SingleChipGroup id="washroomsPrivate" label="Private washrooms" options={WASHROOM_PARKING_CHIP_OPTIONS} value={washroomsPrivate} onValueChange={setWashroomsPrivate} />
                    )}
                  </div>
                )}
                {(fieldVisible('parkingPublicCount') || fieldVisible('parkingPrivateCount')) && (
                  <div className="grid grid-cols-2 gap-4">
                    {fieldVisible('parkingPublicCount') && (
                      <SingleChipGroup id="parkingPublicCount" label="Public parking" options={WASHROOM_PARKING_CHIP_OPTIONS} value={parkingPublicCount} onValueChange={setParkingPublicCount} />
                    )}
                    {fieldVisible('parkingPrivateCount') && (
                      <SingleChipGroup id="parkingPrivateCount" label="Private parking" options={WASHROOM_PARKING_CHIP_OPTIONS} value={parkingPrivateCount} onValueChange={setParkingPrivateCount} />
                    )}
                  </div>
                )}
                {fieldVisible('commercialFurnishingStatus') && (
                  <SingleChipGroup id="commercialFurnishingStatus" label="Furnishing" variant="segmented" options={COMMERCIAL_FURNISHING_STATUS_OPTIONS} value={commercialFurnishingStatus} onValueChange={setCommercialFurnishingStatus} />
                )}
                {fieldVisible('utilities') && (
                  <MultiChipGroup testId="chip-group-utilities" label="Utilities" options={COMMERCIAL_UTILITY_OPTIONS} value={utilities} onValueChange={setUtilities} />
                )}
                {fieldVisible('suitableUses') && (
                  <MultiChipGroup testId="chip-group-suitable-uses" label="Suitable for" options={suitableUseOptions} value={suitableUses} onValueChange={setSuitableUses} />
                )}
                {fieldVisible('commercialAvailability') && (
                  <Field id="commercialAvailability" label="Availability">
                    <Select value={commercialAvailability} onValueChange={setCommercialAvailability}>
                      <SelectTrigger id="commercialAvailability" className="h-11"><SelectValue placeholder="Select availability" /></SelectTrigger>
                      <SelectContent>
                        {COMMERCIAL_AVAILABILITY_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </CollapsibleContent>
            </section>
          </Collapsible>

          {/* Section 6 — Photos & location (inline, real system, no navigation) */}
          <Section number={6} title="Photos & location">
            {listingId ? (
              <>
                <InlinePhotos listingId={listingId} />
                <div className="h-px bg-border" />
                <MapPin location={residentialLocation} />
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

          {/* Section 6b — Nearby places (gated on addressConfirmed, honest derived/broker-added labels) */}
          {listingId && (
            <Section number={7} title="Nearby places">
              <InlineNearby listingId={listingId} propertyType={propertyType} addressConfirmed={addressConfirmed} />
            </Section>
          )}

          {/* Section 7/8 — Description — deterministic FE-only draft builder (no AI claim). */}
          <Section number={listingId ? 8 : 7} title="Description">
            <CommercialDescriptionAssistant facts={descriptionFacts} value={description} onChange={setDescription} />
          </Section>
        </div>

        {/* Right column — buyer preview + listing strength */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <BuyerPreviewCard
            title={title}
            locality={locality}
            priceRupees={priceRupees}
            monthlyRent={intOrUndef(monthlyRent) ?? null}
            isRent={isRentOrLease}
            areaSqft={primaryAreaSqft}
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
            {canSubmit ? `Good listing · ${strengthPercent}% complete` : 'Add a subtype, purpose, and price to continue'}
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
