import { useState } from 'react';
import { ChevronDown, Info, Loader2 } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';
import { useCreateListing } from '@/hooks/useBrokerListings';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PropertyTypeCardSelector } from '@/components/broker/PropertyTypeCardSelector';
import { ListingPurposeToggle } from '@/components/broker/ListingPurposeToggle';
import { AreaField } from '@/components/broker/AreaField';
import { PriceField } from '@/components/broker/PriceField';
import { PhotoTileGrid } from '@/components/broker/PhotoTileGrid';
import { BuyerPreviewCard, type BuyerPreviewSpecChip } from '@/components/broker/BuyerPreviewCard';
import { ListingStrengthMeter, type ListingStrengthChecklist, computeListingStrength } from '@/components/broker/ListingStrengthMeter';
import { SingleChipGroup, MultiChipGroup, boolToTriState, triStateToBool, type ChipOption } from '@/components/broker/ChipGroup';
import { isListingFieldVisible } from '@/lib/listingFieldConfig';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import { intOrUndef, floatOrUndef } from '@/lib/listing-utils';
import {
  FACING_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
  RESIDENTIAL_OWNERSHIP_OPTIONS,
  MAINTENANCE_INCLUDED_OPTIONS,
  AVAILABILITY_OPTIONS,
  PREFERRED_TENANT_OPTIONS,
  CONVERSION_STATUS_OPTIONS,
  PROPERTY_AGE_OPTIONS,
  RESIDENTIAL_WATER_SOURCE_OPTIONS,
  SPECIAL_LOCATION_VIEW_OPTIONS,
  APARTMENT_AMENITY_OPTIONS,
  HOUSE_VILLA_AMENITY_OPTIONS,
  FURNISHING_OPTIONS,
} from '@/lib/listing-constants';

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
 */

type ResidentialPropertyType = 'apartment' | 'house' | 'villa' | 'residential_plot';

const BHK_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5+' },
];

const BATHROOM_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4+' },
];

const BALCONY_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3+' },
];

const PARKING_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3+' },
];

const FLOORS_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '0', label: 'Ground' },
  { value: '1', label: 'G+1' },
  { value: '2', label: 'G+2' },
  { value: '3', label: 'G+3' },
  { value: '4', label: 'G+4+' },
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

/** Tri-state Yes/No switch — undefined = not specified (omitted from payload). */
function BoolSwitch({ id, label, value, onChange }: { id: string; label: string; value: boolean | null | undefined; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <Switch id={id} checked={value === true} onCheckedChange={onChange} />
    </div>
  );
}

interface ResidentialListingFormProps {
  initialPropertyType: ResidentialPropertyType;
  onSwitchToGenericFlow: () => void;
  navigate: NavigateFunction;
}

export function ResidentialListingForm({ initialPropertyType, onSwitchToGenericFlow, navigate }: ResidentialListingFormProps) {
  const createListing = useCreateListing();
  const { toast } = useToast();

  const [propertyType, setPropertyType] = useState<ResidentialPropertyType>(initialPropertyType);
  const [listingPurpose, setListingPurpose] = useState<'sale' | 'rent'>('sale');
  const [hasAttempted, setHasAttempted] = useState(false);
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);

  // Section 2 — Where is it?
  const [locality, setLocality] = useState('');
  const [projectName, setProjectName] = useState('');
  const [title, setTitle] = useState('');

  // Section 3 — Property details (primary area, per-type)
  const [carpetArea, setCarpetArea] = useState<number | null>(null);
  const [carpetAreaUnit, setCarpetAreaUnit] = useState('sqft');
  const [builtArea, setBuiltArea] = useState<number | null>(null);
  const [builtAreaUnit, setBuiltAreaUnit] = useState('sqft');
  const [landArea, setLandArea] = useState<number | null>(null);
  const [landAreaUnit, setLandAreaUnit] = useState('cent');

  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [balconies, setBalconies] = useState('');
  const [furnishingStatus, setFurnishingStatus] = useState('');
  const [facing, setFacing] = useState('');
  const [floorNumber, setFloorNumber] = useState('');
  const [totalFloors, setTotalFloors] = useState('');
  const [superBuiltArea, setSuperBuiltArea] = useState('');
  const [propertyAge, setPropertyAge] = useState('');
  const [residentialWaterSource, setResidentialWaterSource] = useState('');
  const [parking2wCount, setParking2wCount] = useState('');
  const [parking4wCount, setParking4wCount] = useState('');
  const [isGated, setIsGated] = useState<boolean | null>(null);
  const [builderName, setBuilderName] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);
  const [specialLocationViews, setSpecialLocationViews] = useState<string[]>([]);
  const [hasLift, setHasLift] = useState<boolean | null>(null);
  const [hasPowerBackup, setHasPowerBackup] = useState<boolean | null>(null);
  const [hasGarden, setHasGarden] = useState<boolean | null>(null);
  const [hasTerrace, setHasTerrace] = useState<boolean | null>(null);
  const [hasCompound, setHasCompound] = useState<boolean | null>(null);
  const [hasServantRoom, setHasServantRoom] = useState<boolean | null>(null);
  const [plotDimensions, setPlotDimensions] = useState('');
  const [roadWidthFt, setRoadWidthFt] = useState('');
  const [isCornerPlot, setIsCornerPlot] = useState<boolean | null>(null);
  const [hasBoundaryWall, setHasBoundaryWall] = useState<boolean | null>(null);
  const [isGatedLayout, setIsGatedLayout] = useState<boolean | null>(null);
  const [hasWaterConnection, setHasWaterConnection] = useState<boolean | null>(null);
  const [hasElectricityConnection, setHasElectricityConnection] = useState<boolean | null>(null);
  const [hasDrainage, setHasDrainage] = useState<boolean | null>(null);

  // Section 4 — Sale / Rent terms
  const [priceRupees, setPriceRupees] = useState<number | null>(null);
  const [priceNegotiable, setPriceNegotiable] = useState<boolean | null>(null);
  const [maintenancePaise, setMaintenancePaise] = useState('');
  const [possessionStatus, setPossessionStatus] = useState('');
  // Prototype-only (design-spec.md §prototype_only has no explicit "RERA" entry, but the
  // CreateListingRequest DTO has no `reraNumber` field — only UpdateListingRequest does.
  // Rendered for visual parity; NOT wired into the create payload (documented HARD
  // CONSTRAINT: no new payload key). Broker can add it on the EditListing step-1 form.
  const [reraNumberDraft, setReraNumberDraft] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [securityDepositMonths, setSecurityDepositMonths] = useState('');
  const [lockInMonths, setLockInMonths] = useState('');
  const [maintenanceIncluded, setMaintenanceIncluded] = useState<boolean | null>(null);
  const [rentNegotiable, setRentNegotiable] = useState<boolean | null>(null);
  const [petsAllowed, setPetsAllowed] = useState<boolean | null>(null);
  const [availabilityTimeline, setAvailabilityTimeline] = useState('');
  const [preferredTenants, setPreferredTenants] = useState<string[]>([]);

  // Section 5 — Ownership & document details
  const [ownershipType, setOwnershipType] = useState('');
  const [conversionStatus, setConversionStatus] = useState('');
  const [khataNumber, setKhataNumber] = useState('');
  const [propertyTaxPid, setPropertyTaxPid] = useState('');
  const [approvingAuthority, setApprovingAuthority] = useState('');
  const [surveyNumber, setSurveyNumber] = useState('');

  // Section 6 — Photos, video & location (prototype-only, see PhotoTileGrid.tsx)
  // design-spec.md §prototype_only "video_link": no create-payload field exists for a
  // video link — rendered disabled/deferred, its value is intentionally never read.
  const [videoLinkDraft, setVideoLinkDraft] = useState('');

  // Section 7 — Description
  const [description, setDescription] = useState('');

  const isRent = listingPurpose === 'rent';
  const isApartment = propertyType === 'apartment';
  const isHouseOrVilla = propertyType === 'house' || propertyType === 'villa';
  const isPlot = propertyType === 'residential_plot';

  const fieldVisible = (key: ListingFieldKey): boolean => isListingFieldVisible(key, propertyType, listingPurpose);

  const priceValid = isRent
    ? (monthlyRent !== '' && parseInt(monthlyRent, 10) > 0)
    : (priceRupees != null && priceRupees > 0);
  // propertyType is always a residential value here (never ''); canSubmit tracks the
  // price/rent validity gate only.
  const canSubmit = priceValid;

  const primaryAreaSqft = isApartment ? carpetArea : isHouseOrVilla ? builtArea : landArea;

  const buildPayload = () => ({
    propertyType,
    title: title.trim() || undefined,
    locality: locality.trim() || undefined,
    price: isRent ? undefined : priceRupees ?? undefined,
    description: description.trim() || undefined,
    listingPurpose,
    landArea: isPlot && landArea != null && landArea > 0 ? landArea : undefined,
    landAreaUnit: isPlot && landArea != null && landArea > 0 ? landAreaUnit : undefined,
    builtArea: isHouseOrVilla && builtArea != null && builtArea > 0 ? builtArea : undefined,
    builtAreaUnit: isHouseOrVilla && builtArea != null && builtArea > 0 ? builtAreaUnit : undefined,
    carpetArea: isApartment && carpetArea != null && carpetArea > 0 ? carpetArea : undefined,
    carpetAreaUnit: isApartment && carpetArea != null && carpetArea > 0 ? carpetAreaUnit : undefined,
    bedrooms: fieldVisible('bedrooms') ? intOrUndef(bedrooms) : undefined,
    bathrooms: fieldVisible('bathrooms') ? intOrUndef(bathrooms) : undefined,
    balconies: fieldVisible('balconies') ? intOrUndef(balconies) : undefined,
    furnishingStatus: fieldVisible('furnishingStatus') ? (furnishingStatus || undefined) : undefined,
    facing: fieldVisible('facing') ? (facing || undefined) : undefined,
    floorNumber: fieldVisible('floorNumber') ? intOrUndef(floorNumber) : undefined,
    totalFloors: fieldVisible('totalFloors') ? intOrUndef(totalFloors) : undefined,
    superBuiltArea: fieldVisible('superBuiltArea') ? floatOrUndef(superBuiltArea) : undefined,
    superBuiltAreaUnit: fieldVisible('superBuiltArea') && floatOrUndef(superBuiltArea) != null ? 'sqft' : undefined,
    propertyAge: fieldVisible('propertyAge') ? (propertyAge || undefined) : undefined,
    residentialWaterSource: fieldVisible('residentialWaterSource') ? (residentialWaterSource || undefined) : undefined,
    parking2wCount: fieldVisible('parking2wCount') ? intOrUndef(parking2wCount) : undefined,
    parking4wCount: fieldVisible('parking4wCount') ? intOrUndef(parking4wCount) : undefined,
    isGated: fieldVisible('isGated') ? triStateToBool(boolToTriState(isGated)) : undefined,
    projectName: fieldVisible('projectName') ? (projectName.trim() || undefined) : undefined,
    builderName: fieldVisible('builderName') ? (builderName.trim() || undefined) : undefined,
    amenities: fieldVisible('amenities') && amenities.length > 0 ? amenities : undefined,
    specialLocationViews: fieldVisible('specialLocationViews') && specialLocationViews.length > 0 ? specialLocationViews : undefined,
    hasLift: fieldVisible('hasLift') ? triStateToBool(boolToTriState(hasLift)) : undefined,
    hasPowerBackup: fieldVisible('hasPowerBackup') ? triStateToBool(boolToTriState(hasPowerBackup)) : undefined,
    hasGarden: fieldVisible('hasGarden') ? triStateToBool(boolToTriState(hasGarden)) : undefined,
    hasTerrace: fieldVisible('hasTerrace') ? triStateToBool(boolToTriState(hasTerrace)) : undefined,
    hasCompound: fieldVisible('hasCompound') ? triStateToBool(boolToTriState(hasCompound)) : undefined,
    hasServantRoom: fieldVisible('hasServantRoom') ? triStateToBool(boolToTriState(hasServantRoom)) : undefined,
    plotDimensions: fieldVisible('plotDimensions') ? (plotDimensions.trim() || undefined) : undefined,
    roadWidthFt: fieldVisible('roadWidthFt') ? floatOrUndef(roadWidthFt) : undefined,
    isCornerPlot: fieldVisible('isCornerPlot') ? triStateToBool(boolToTriState(isCornerPlot)) : undefined,
    hasBoundaryWall: fieldVisible('hasBoundaryWall') ? triStateToBool(boolToTriState(hasBoundaryWall)) : undefined,
    isGatedLayout: fieldVisible('isGatedLayout') ? triStateToBool(boolToTriState(isGatedLayout)) : undefined,
    hasWaterConnection: fieldVisible('hasWaterConnection') ? triStateToBool(boolToTriState(hasWaterConnection)) : undefined,
    hasElectricityConnection: fieldVisible('hasElectricityConnection') ? triStateToBool(boolToTriState(hasElectricityConnection)) : undefined,
    hasDrainage: fieldVisible('hasDrainage') ? triStateToBool(boolToTriState(hasDrainage)) : undefined,
    priceNegotiable: fieldVisible('priceNegotiable') ? triStateToBool(boolToTriState(priceNegotiable)) : undefined,
    maintenancePaise: fieldVisible('maintenancePaise') ? intOrUndef(maintenancePaise) : undefined,
    possessionStatus: fieldVisible('possessionStatus') ? (possessionStatus || undefined) : undefined,
    monthlyRent: isRent ? intOrUndef(monthlyRent) : undefined,
    securityDepositMonths: isRent ? intOrUndef(securityDepositMonths) : undefined,
    lockInMonths: isRent ? intOrUndef(lockInMonths) : undefined,
    maintenanceIncluded: fieldVisible('maintenanceIncluded') ? triStateToBool(boolToTriState(maintenanceIncluded)) : undefined,
    rentNegotiable: fieldVisible('rentNegotiable') ? triStateToBool(boolToTriState(rentNegotiable)) : undefined,
    petsAllowed: fieldVisible('petsAllowed') ? triStateToBool(boolToTriState(petsAllowed)) : undefined,
    availabilityTimeline: fieldVisible('availabilityTimeline') ? (availabilityTimeline || undefined) : undefined,
    preferredTenants: fieldVisible('preferredTenants') && preferredTenants.length > 0 ? preferredTenants : undefined,
    ownershipType: fieldVisible('ownershipType') ? (ownershipType || undefined) : undefined,
    conversionStatus: fieldVisible('conversionStatus') ? (conversionStatus || undefined) : undefined,
    khataNumber: fieldVisible('khataNumber') ? (khataNumber.trim() || undefined) : undefined,
    propertyTaxPid: fieldVisible('propertyTaxPid') ? (propertyTaxPid.trim() || undefined) : undefined,
    approvingAuthority: fieldVisible('approvingAuthority') ? (approvingAuthority.trim() || undefined) : undefined,
    surveyNumber: fieldVisible('surveyNumber') ? (surveyNumber.trim() || undefined) : undefined,
  });

  const handleSaveDraft = (andNavigateToStep?: number) => {
    setHasAttempted(true);
    if (!canSubmit) return;

    createListing.mutate(buildPayload(), {
      onSuccess: (data) => {
        toast({ title: 'Draft saved', description: 'Your listing has been created as a draft.' });
        navigate(`/broker/listings/${data.id}/edit?step=${andNavigateToStep ?? 2}`);
      },
    });
  };

  // design-spec.md §prototype_only "photo_tiles" / "map_pin": both CTAs save the
  // current draft (identical to "Save & Continue" today) then deep-link into the
  // relevant EXISTING EditListing step — no new backend behavior.
  const handlePhotoTileClick = () => handleSaveDraft(2);
  const handlePinLocationClick = () => handleSaveDraft(3);

  const checklist: ListingStrengthChecklist = {
    // propertyType is always set in this component (one of the 4 residential values).
    hasType: true,
    // listingPurpose always defaults to 'sale' — this row is trivially satisfied
    // (kept in the checklist type for readability/parity with the design spec).
    hasPurpose: true,
    hasLocality: locality.trim() !== '',
    hasArea: primaryAreaSqft != null && primaryAreaSqft > 0,
    hasPrice: priceValid,
    hasTitle: title.trim() !== '',
    hasConfigDetails: isPlot ? plotDimensions.trim() !== '' : bedrooms !== '',
    hasPhotos: false,
    isPinned: false,
    hasDescription: description.trim().length >= 20,
  };
  const strengthPercent = computeListingStrength(checklist);

  // Gate every chip by fieldVisible() for the CURRENT propertyType/listingPurpose —
  // bedrooms/bathrooms/furnishingStatus/area are raw useState and are not reset on
  // a mid-flow property-type switch (e.g. Apartment -> Plot), so an ungated chip
  // would keep showing a stale "3 BHK" for a type that has no bedroom field. This
  // enforces the honest-null requirement: never fabricate a preview chip for a
  // field the current type/purpose doesn't collect.
  const specChips: BuyerPreviewSpecChip[] = [];
  if (fieldVisible('bedrooms') && bedrooms) specChips.push({ label: `${bedrooms} BHK` });
  if (fieldVisible('bathrooms') && bathrooms) specChips.push({ label: `${bathrooms} Bath` });
  const primaryAreaFieldKey: ListingFieldKey = isApartment ? 'carpetArea' : isHouseOrVilla ? 'builtArea' : 'landArea';
  if (fieldVisible(primaryAreaFieldKey) && primaryAreaSqft) {
    specChips.push({ label: `${primaryAreaSqft} sqft` });
  }
  if (fieldVisible('furnishingStatus') && furnishingStatus) {
    const opt = FURNISHING_OPTIONS.find((o) => o.value === furnishingStatus);
    if (opt) specChips.push({ label: opt.label });
  }

  const amenityOptions = isApartment ? APARTMENT_AMENITY_OPTIONS : HOUSE_VILLA_AMENITY_OPTIONS;

  return (
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left column — form */}
        <div className="space-y-4">
          {/* Section 1 — Property type & purpose */}
          <Section number={1} title="Property type & purpose">
            <PropertyTypeCardSelector
              id="residential-property-type"
              value={propertyType}
              onChange={(v) => setPropertyType(v as ResidentialPropertyType)}
              residentialOnly
            />

            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Commercial &amp; agricultural listings use a separate flow.</span>
              <button
                type="button"
                onClick={onSwitchToGenericFlow}
                className="ml-auto shrink-0 font-semibold text-primary underline-offset-2 hover:underline"
              >
                Switch flow
              </button>
            </div>

            <div className="space-y-2">
              <Label className="text-[13px] font-semibold">Listing purpose</Label>
              <ListingPurposeToggle value={listingPurpose} onChange={setListingPurpose} />
            </div>
          </Section>

          {/* Section 2 — Where is it? */}
          <Section number={2} title="Where is it?">
            <Field id="locality" label="Locality / area *">
              <Input id="locality" placeholder="e.g. Manipal, Udupi" value={locality} onChange={(e) => setLocality(e.target.value)} className="h-11" />
              {hasAttempted && !locality.trim() && <p className="text-sm text-destructive">Locality is required.</p>}
            </Field>

            {!isPlot && (
              <Field id="projectName" label="Project / society name">
                <Input id="projectName" placeholder="e.g. Green Meadows" value={projectName} onChange={(e) => setProjectName(e.target.value)} className="h-11" />
              </Field>
            )}

            <Field id="title" label="Listing title *" hint="Buyers see this first">
              <Input id="title" placeholder={isPlot ? 'e.g. 5 cent residential plot in Manipal' : 'e.g. 3 BHK Apartment in Manipal'} value={title} onChange={(e) => setTitle(e.target.value)} className="h-11" />
              {hasAttempted && !title.trim() && <p className="text-sm text-destructive">Title is required.</p>}
            </Field>
          </Section>

          {/* Section 3 — Property details */}
          <Section number={3} title={isPlot ? 'Plot details' : 'Property details'}>
            {isApartment && (
              <AreaField id="carpetArea" label="Carpet area" propertyType="apartment" initialArea={carpetArea} initialUnit={carpetAreaUnit} onChange={(a, u) => { setCarpetArea(a); setCarpetAreaUnit(u); }} />
            )}
            {isHouseOrVilla && (
              <AreaField id="builtArea" label="Built-up area" propertyType="house" initialArea={builtArea} initialUnit={builtAreaUnit} onChange={(a, u) => { setBuiltArea(a); setBuiltAreaUnit(u); }} />
            )}
            {isPlot && (
              <AreaField id="plotArea" label="Plot area" propertyType="land" initialArea={landArea} initialUnit={landAreaUnit} onChange={(a, u) => { setLandArea(a); setLandAreaUnit(u); }} />
            )}

            {fieldVisible('bedrooms') && (
              <SingleChipGroup id="bedrooms" label="Bedrooms (BHK)" options={BHK_CHIP_OPTIONS} value={bedrooms} onValueChange={setBedrooms} />
            )}
            {fieldVisible('bathrooms') && (
              <SingleChipGroup id="bathrooms" label="Bathrooms" options={BATHROOM_CHIP_OPTIONS} value={bathrooms} onValueChange={setBathrooms} />
            )}
            {fieldVisible('balconies') && (
              <SingleChipGroup id="balconies" label="Balconies" options={BALCONY_CHIP_OPTIONS} value={balconies} onValueChange={setBalconies} />
            )}
            {fieldVisible('furnishingStatus') && (
              <SingleChipGroup id="furnishingStatus" label="Furnishing" variant="segmented" options={FURNISHING_OPTIONS} value={furnishingStatus} onValueChange={setFurnishingStatus} />
            )}
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
            {isApartment && fieldVisible('floorNumber') && (
              <Field id="floorNumber" label="Floor number">
                <Input id="floorNumber" type="number" min="0" max="100" className="h-11 font-mono" value={floorNumber} onChange={(e) => setFloorNumber(e.target.value)} />
              </Field>
            )}
            {isApartment && fieldVisible('totalFloors') && (
              <Field id="totalFloors" label="Total floors">
                <Input id="totalFloors" type="number" min="1" max="100" className="h-11 font-mono" value={totalFloors} onChange={(e) => setTotalFloors(e.target.value)} />
              </Field>
            )}
            {isHouseOrVilla && fieldVisible('totalFloors') && (
              <SingleChipGroup id="totalFloors" label="Number of floors" options={FLOORS_CHIP_OPTIONS} value={totalFloors} onValueChange={setTotalFloors} />
            )}
            {isApartment && fieldVisible('superBuiltArea') && (
              <Field id="superBuiltArea" label="Super built-up area (sqft)">
                <Input id="superBuiltArea" type="number" min="0" className="h-11 font-mono" value={superBuiltArea} onChange={(e) => setSuperBuiltArea(e.target.value)} />
              </Field>
            )}
            {isHouseOrVilla && fieldVisible('propertyAge') && (
              <Field id="propertyAge" label="Property age">
                <Select value={propertyAge} onValueChange={setPropertyAge}>
                  <SelectTrigger id="propertyAge" className="h-11"><SelectValue placeholder="Select property age" /></SelectTrigger>
                  <SelectContent>
                    {PROPERTY_AGE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {isHouseOrVilla && fieldVisible('residentialWaterSource') && (
              <Field id="residentialWaterSource" label="Water source">
                <Select value={residentialWaterSource} onValueChange={setResidentialWaterSource}>
                  <SelectTrigger id="residentialWaterSource" className="h-11"><SelectValue placeholder="Select water source" /></SelectTrigger>
                  <SelectContent>
                    {RESIDENTIAL_WATER_SOURCE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {(fieldVisible('parking2wCount') || fieldVisible('parking4wCount')) && (
              <div className="grid grid-cols-2 gap-4">
                {fieldVisible('parking2wCount') && (
                  <SingleChipGroup id="parking2wCount" label="2-wheeler parking" options={PARKING_CHIP_OPTIONS} value={parking2wCount} onValueChange={setParking2wCount} />
                )}
                {fieldVisible('parking4wCount') && (
                  <SingleChipGroup id="parking4wCount" label="4-wheeler parking" options={PARKING_CHIP_OPTIONS} value={parking4wCount} onValueChange={setParking4wCount} />
                )}
              </div>
            )}
            {fieldVisible('isGated') && (
              <BoolSwitch id="isGated" label="Gated community" value={isGated} onChange={setIsGated} />
            )}
            {fieldVisible('builderName') && (
              <Field id="builderName" label="Builder name">
                <Input id="builderName" value={builderName} onChange={(e) => setBuilderName(e.target.value)} className="h-11" />
              </Field>
            )}
            {(fieldVisible('hasLift') || fieldVisible('hasPowerBackup')) && (
              <div className="grid grid-cols-2 gap-3">
                {fieldVisible('hasLift') && <BoolSwitch id="hasLift" label="Lift" value={hasLift} onChange={setHasLift} />}
                {fieldVisible('hasPowerBackup') && <BoolSwitch id="hasPowerBackup" label="Power backup" value={hasPowerBackup} onChange={setHasPowerBackup} />}
              </div>
            )}
            {(fieldVisible('hasGarden') || fieldVisible('hasTerrace') || fieldVisible('hasCompound') || fieldVisible('hasServantRoom')) && (
              <div className="grid grid-cols-2 gap-3">
                {fieldVisible('hasGarden') && <BoolSwitch id="hasGarden" label="Garden" value={hasGarden} onChange={setHasGarden} />}
                {fieldVisible('hasTerrace') && <BoolSwitch id="hasTerrace" label="Terrace" value={hasTerrace} onChange={setHasTerrace} />}
                {fieldVisible('hasCompound') && <BoolSwitch id="hasCompound" label="Compound wall" value={hasCompound} onChange={setHasCompound} />}
                {fieldVisible('hasServantRoom') && <BoolSwitch id="hasServantRoom" label="Servant room" value={hasServantRoom} onChange={setHasServantRoom} />}
              </div>
            )}
            {isPlot && fieldVisible('plotDimensions') && (
              <Field id="plotDimensions" label="Plot dimensions">
                <Input id="plotDimensions" placeholder="e.g. 30x40" value={plotDimensions} onChange={(e) => setPlotDimensions(e.target.value)} className="h-11" />
              </Field>
            )}
            {isPlot && fieldVisible('roadWidthFt') && (
              <Field id="roadWidthFt" label="Road width (ft)">
                <Input id="roadWidthFt" type="number" min="0" className="h-11 font-mono" value={roadWidthFt} onChange={(e) => setRoadWidthFt(e.target.value)} />
              </Field>
            )}
            {isPlot && (
              <div className="grid grid-cols-2 gap-3">
                {fieldVisible('isCornerPlot') && <BoolSwitch id="isCornerPlot" label="Corner plot" value={isCornerPlot} onChange={setIsCornerPlot} />}
                {fieldVisible('hasBoundaryWall') && <BoolSwitch id="hasBoundaryWall" label="Boundary wall" value={hasBoundaryWall} onChange={setHasBoundaryWall} />}
                {fieldVisible('isGatedLayout') && <BoolSwitch id="isGatedLayout" label="Gated layout" value={isGatedLayout} onChange={setIsGatedLayout} />}
                {fieldVisible('hasWaterConnection') && <BoolSwitch id="hasWaterConnection" label="Water connection" value={hasWaterConnection} onChange={setHasWaterConnection} />}
                {fieldVisible('hasElectricityConnection') && <BoolSwitch id="hasElectricityConnection" label="Electricity connection" value={hasElectricityConnection} onChange={setHasElectricityConnection} />}
                {fieldVisible('hasDrainage') && <BoolSwitch id="hasDrainage" label="Drainage" value={hasDrainage} onChange={setHasDrainage} />}
              </div>
            )}
            {fieldVisible('amenities') && (
              <MultiChipGroup testId="chip-group-amenities" label="Amenities" options={amenityOptions} value={amenities} onValueChange={setAmenities} />
            )}
            {fieldVisible('specialLocationViews') && (
              <MultiChipGroup testId="chip-group-special-views" label="Special location / views" options={SPECIAL_LOCATION_VIEW_OPTIONS} value={specialLocationViews} onValueChange={setSpecialLocationViews} />
            )}
          </Section>

          {/* Section 4 — Sale / Rent terms */}
          <Section number={4} title={isRent ? 'Rent terms' : 'Sale terms'}>
            {!isRent && fieldVisible('price') && (
              <div>
                <PriceField id="price" initialRupees={null} onChange={setPriceRupees} required />
                {hasAttempted && (priceRupees == null || priceRupees <= 0) && (
                  <p className="mt-1 text-sm text-destructive">A valid price greater than 0 is required.</p>
                )}
              </div>
            )}
            {!isRent && fieldVisible('priceNegotiable') && (
              <BoolSwitch id="priceNegotiable" label="Price negotiable" value={priceNegotiable} onChange={setPriceNegotiable} />
            )}
            {!isRent && fieldVisible('maintenancePaise') && (
              <Field id="maintenancePaise" label="Monthly maintenance (₹)">
                <Input id="maintenancePaise" type="number" min="0" className="h-11 font-mono" value={maintenancePaise} onChange={(e) => setMaintenancePaise(e.target.value)} />
              </Field>
            )}
            {!isRent && fieldVisible('possessionStatus') && (
              <Field id="possessionStatus" label="Property status">
                <Select value={possessionStatus} onValueChange={setPossessionStatus}>
                  <SelectTrigger id="possessionStatus" className="h-11"><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    {PROPERTY_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {!isRent && (
              <Field id="reraNumber" label="RERA number" hint="Added after the draft is created — see the listing's Describe step.">
                <Input id="reraNumber" placeholder="Optional" value={reraNumberDraft} onChange={(e) => setReraNumberDraft(e.target.value)} className="h-11" disabled />
              </Field>
            )}

            {isRent && fieldVisible('monthlyRent') && (
              <div>
                <Field id="monthlyRent" label="Monthly rent (₹) *">
                  <Input id="monthlyRent" type="number" min="1" className="h-12 font-mono text-[17px] font-semibold" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} />
                </Field>
                {hasAttempted && (!monthlyRent || parseInt(monthlyRent, 10) <= 0) && (
                  <p className="mt-1 text-sm text-destructive">Monthly rent must be greater than 0.</p>
                )}
              </div>
            )}
            {isRent && fieldVisible('securityDepositMonths') && (
              <Field id="securityDepositMonths" label="Security deposit (months)">
                <Input id="securityDepositMonths" type="number" min="0" max="24" className="h-11 font-mono" value={securityDepositMonths} onChange={(e) => setSecurityDepositMonths(e.target.value)} />
              </Field>
            )}
            {isRent && fieldVisible('lockInMonths') && (
              <Field id="lockInMonths" label="Lock-in period (months)">
                <Input id="lockInMonths" type="number" min="0" max="60" className="h-11 font-mono" value={lockInMonths} onChange={(e) => setLockInMonths(e.target.value)} />
              </Field>
            )}
            {isRent && fieldVisible('maintenanceIncluded') && (
              <Field id="maintenanceIncluded" label="Maintenance">
                <Select value={boolToTriState(maintenanceIncluded)} onValueChange={(v) => setMaintenanceIncluded(triStateToBool(v) ?? null)}>
                  <SelectTrigger id="maintenanceIncluded" className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_INCLUDED_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value === 'INCLUDED' ? 'true' : 'false'}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {isRent && fieldVisible('availabilityTimeline') && (
              <Field id="availabilityTimeline" label="Availability">
                <Select value={availabilityTimeline} onValueChange={setAvailabilityTimeline}>
                  <SelectTrigger id="availabilityTimeline" className="h-11"><SelectValue placeholder="Select availability" /></SelectTrigger>
                  <SelectContent>
                    {AVAILABILITY_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {isRent && fieldVisible('preferredTenants') && (
              <MultiChipGroup testId="chip-group-preferred-tenants" label="Preferred tenants" options={PREFERRED_TENANT_OPTIONS} value={preferredTenants} onValueChange={setPreferredTenants} />
            )}
            {isRent && fieldVisible('petsAllowed') && (
              <BoolSwitch id="petsAllowed" label="Pets allowed" value={petsAllowed} onChange={setPetsAllowed} />
            )}
            {isRent && fieldVisible('rentNegotiable') && (
              <BoolSwitch id="rentNegotiable" label="Rent negotiable" value={rentNegotiable} onChange={setRentNegotiable} />
            )}
          </Section>

          {/* Section 5 — More details / Ownership & document details (collapsible, collapsed by default) */}
          <Collapsible open={moreDetailsOpen} onOpenChange={setMoreDetailsOpen}>
            <section className="rounded-2xl border bg-card p-6 shadow-sm">
              <CollapsibleTrigger asChild>
                <button type="button" className="flex w-full items-center justify-between text-left">
                  <SectionHeader number={5} title="More details / Ownership & document details" />
                  <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${moreDetailsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-1">
                {fieldVisible('ownershipType') && (
                  <Field id="ownershipType" label="Ownership type">
                    <Select value={ownershipType} onValueChange={setOwnershipType}>
                      <SelectTrigger id="ownershipType" className="h-11"><SelectValue placeholder="Select ownership type" /></SelectTrigger>
                      <SelectContent>
                        {RESIDENTIAL_OWNERSHIP_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {isPlot && fieldVisible('conversionStatus') && (
                  <Field id="conversionStatus" label="Conversion status">
                    <Select value={conversionStatus} onValueChange={setConversionStatus}>
                      <SelectTrigger id="conversionStatus" className="h-11"><SelectValue placeholder="Select conversion status" /></SelectTrigger>
                      <SelectContent>
                        {CONVERSION_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {isPlot && fieldVisible('khataNumber') && (
                  <Field id="khataNumber" label="Khata number">
                    <Input id="khataNumber" value={khataNumber} onChange={(e) => setKhataNumber(e.target.value)} className="h-11" />
                  </Field>
                )}
                {isPlot && fieldVisible('propertyTaxPid') && (
                  <Field id="propertyTaxPid" label="Property tax PID">
                    <Input id="propertyTaxPid" value={propertyTaxPid} onChange={(e) => setPropertyTaxPid(e.target.value)} className="h-11" />
                  </Field>
                )}
                {isPlot && fieldVisible('approvingAuthority') && (
                  <Field id="approvingAuthority" label="Approving authority">
                    <Input id="approvingAuthority" value={approvingAuthority} onChange={(e) => setApprovingAuthority(e.target.value)} className="h-11" />
                  </Field>
                )}
                {isPlot && fieldVisible('surveyNumber') && (
                  <Field id="surveyNumber" label="Survey number">
                    <Input id="surveyNumber" placeholder="e.g. 123/4A" value={surveyNumber} onChange={(e) => setSurveyNumber(e.target.value)} className="h-11" />
                  </Field>
                )}
              </CollapsibleContent>
            </section>
          </Collapsible>

          {/* Section 6 — Photos, video & location */}
          <Section number={6} title="Photos, video & location">
            <PhotoTileGrid onAddPhoto={handlePhotoTileClick} />

            {/* design-spec.md §prototype_only "video_link" — no create-payload field exists;
                rendered disabled so the value is never wired into buildPayload(). */}
            <Field id="videoLink" label="Video link" hint="Add a video after creating the draft — coming soon on this page.">
              <Input id="videoLink" placeholder="YouTube or Instagram Reel URL" value={videoLinkDraft} onChange={(e) => setVideoLinkDraft(e.target.value)} className="h-11" disabled />
            </Field>

            <div className="space-y-2">
              <Button type="button" variant="outline" onClick={handlePinLocationClick}>
                Pin location on map
              </Button>
              <div className="flex aspect-[16/9] items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
                Map preview available after pinning
              </div>
            </div>
          </Section>

          {/* Section 7 — Description */}
          <Section number={7} title="Description">
            <div className="flex flex-wrap gap-2">
              {/* design-spec.md §prototype_only "ai_description" — no AI service call; disabled for visual parity only. */}
              <Button type="button" disabled title="Coming soon">
                Generate description
              </Button>
              <Button type="button" variant="outline">
                Write it myself
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A good description mentions layout, condition, and what makes the location convenient.
            </p>
            <Textarea
              id="description"
              placeholder="Brief description of the property..."
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Section>
        </div>

        {/* Right column — buyer preview + listing strength */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <BuyerPreviewCard
            title={title}
            locality={locality}
            priceRupees={priceRupees}
            monthlyRent={intOrUndef(monthlyRent) ?? null}
            isRent={isRent}
            areaSqft={primaryAreaSqft}
            specChips={specChips}
            photoCount={0}
          />
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <ListingStrengthMeter checklist={checklist} />
          </div>
        </div>
      </div>

      {/* Sticky footer (design-spec.md §footer) — replaces the old bottom action row */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {canSubmit ? `Good listing · ${strengthPercent}% complete` : 'Add price and property type to publish'}
          </p>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => handleSaveDraft(2)} disabled={createListing.isPending}>
              {createListing.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save draft
            </Button>
            <Button type="button" onClick={() => handleSaveDraft(2)} disabled={!canSubmit || createListing.isPending}>
              {createListing.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Review &amp; publish
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
