import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRoute } from '@/lib/routeAccess';
import { useCreateListing } from '@/hooks/useBrokerListings';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/broker/SectionCard';
import { ListingPurposeToggle } from '@/components/broker/ListingPurposeToggle';
import { PropertyTypeCardSelector } from '@/components/broker/PropertyTypeCardSelector';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PriceField } from '@/components/broker/PriceField';
import { AreaField } from '@/components/broker/AreaField';
import { StepIndicator } from '@/components/broker/StepIndicator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
// Alert removed — commercial types are now fully supported
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { COMMERCIAL_TYPES, FURNISHING_OPTIONS } from '@/lib/listing-constants';
import type { PropertyType } from '@/lib/listing-constants';
import { intOrUndef, floatOrUndef } from '@/lib/listing-utils';
import { isListingFieldVisible } from '@/lib/listingFieldConfig';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ResidentialListingForm } from '@/components/broker/ResidentialListingForm';
import { CommercialListingForm } from '@/components/broker/CommercialListingForm';

/**
 * M38-13A (#1626) — the four residential subtypes that mount the new
 * single-page residential composition (design-spec.md §D-FE1) instead of the
 * generic body below. Commercial/agricultural types render the UNCHANGED
 * generic body — this is the ONLY branch point that differs from pre-#1626.
 */
const RESIDENTIAL_TYPES: ReadonlySet<PropertyType | ''> = new Set(['apartment', 'house', 'villa', 'residential_plot']);

// ---------------------------------------------------------------------------
// M38-13A (#1626) — chip / segmented control affordances (design-spec.md §1).
// Built from the EXISTING shadcn ToggleGroup primitive — no new dependency.
// Mirrors the identical helpers in EditListing.tsx (this page duplicates its
// own inline form, consistent with the existing NewListing/EditListing split).
// ---------------------------------------------------------------------------

interface ChipOption {
  readonly value: string;
  readonly label: string;
}

/** BHK — 1/2/3/4/5+ (design §1). Value IS the numeric bedrooms string sent on save. */
const BHK_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5+' },
];

/**
 * House/villa "Number of floors" — Ground/G+1/G+2/G+3/G+4+ (design §1). Reuses the
 * `totalFloors` column/state — see EditListing.tsx for the full rationale.
 */
const FLOORS_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '0', label: 'Ground' },
  { value: '1', label: 'G+1' },
  { value: '2', label: 'G+2' },
  { value: '3', label: 'G+3' },
  { value: '4', label: 'G+4+' },
];

interface SingleChipGroupProps {
  id: string;
  label: string;
  options: readonly ChipOption[];
  value: string;
  onValueChange: (value: string) => void;
  variant?: 'chip' | 'segmented';
}

/** Single-select chip/segmented control — shadcn ToggleGroup type="single". */
function SingleChipGroup({ id, label, options, value, onValueChange, variant = 'chip' }: SingleChipGroupProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <ToggleGroup
        id={id}
        type="single"
        value={value}
        onValueChange={(v) => { if (v) onValueChange(v); }}
        className={variant === 'segmented' ? 'inline-flex w-fit rounded-lg bg-muted p-1' : 'flex-wrap justify-start gap-2'}
      >
        {options.map((opt) => (
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            aria-label={opt.label}
            className={
              variant === 'segmented'
                ? 'rounded-md px-4 py-1.5 text-sm data-[state=on]:bg-card data-[state=on]:shadow-sm'
                : 'rounded-full border px-4 py-1.5 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary/10'
            }
          >
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export default function NewListing() {
  const { userRole, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const createListing = useCreateListing();
  const { toast } = useToast();

  // Phase-7A FIX-A (#1626 follow-up): the residential single-page composition is now
  // the DEFAULT landing at /broker/listings/new (mock default = Apartment preselected),
  // not something reached only after picking a type. The old unfiltered 10-type generic
  // body (incl. commercial/agri) is reached via the residential view's "Switch flow"
  // affordance, which resets this state to '' (see RESIDENTIAL_TYPES branch below).
  const [propertyType, setPropertyType] = useState<PropertyType | ''>('apartment');
  const [title, setTitle] = useState('');
  const [priceRupees, setPriceRupees] = useState<number | null>(null);
  // Tracks whether the user has attempted to submit — gates inline field errors
  const [hasAttempted, setHasAttempted] = useState(false);
  const [description, setDescription] = useState('');
  const [locality, setLocality] = useState('');

  // Listing purpose: sale (default) or rent
  const [listingPurpose, setListingPurpose] = useState<'sale' | 'rent'>('sale');

  // Conditional field state (captured for UX; persisted on edit page via PUT)
  const [landArea, setLandArea] = useState<number | null>(null);
  // Default 'cent' — dominant Udupi/Karnataka unit
  const [landAreaUnit, setLandAreaUnit] = useState('cent');
  const [bedrooms, setBedrooms] = useState('');
  const [builtArea, setBuiltArea] = useState<number | null>(null);
  const [builtAreaUnit, setBuiltAreaUnit] = useState('sqft');

  // Commercial-specific fields
  const [carpetArea, setCarpetArea] = useState<number | null>(null);
  const [carpetAreaUnit, setCarpetAreaUnit] = useState('sqft');
  const [floorNumber, setFloorNumber] = useState('');
  const [totalFloors, setTotalFloors] = useState('');
  const [furnishingStatus, setFurnishingStatus] = useState('');
  const [washrooms, setWashrooms] = useState('');
  const [parkingCount, setParkingCount] = useState('');
  const [roadFrontageFt, setRoadFrontageFt] = useState('');
  const [commercialUsage, setCommercialUsage] = useState('');
  const [numberOfUnits, setNumberOfUnits] = useState('');

  // Rent-specific fields
  const [monthlyRent, setMonthlyRent] = useState('');
  const [securityDepositMonths, setSecurityDepositMonths] = useState('');
  const [lockInMonths, setLockInMonths] = useState('');

  // Agricultural land fields
  const [waterSource, setWaterSource] = useState('');
  const [soilType, setSoilType] = useState('');
  const [roadAccess, setRoadAccess] = useState('');
  const [cultivationStatus, setCultivationStatus] = useState('');
  const [ownershipType, setOwnershipType] = useState('');
  const [surveyNumber, setSurveyNumber] = useState('');
  // Issue #1458 — new structured agri fields
  const [landCategory, setLandCategory] = useState('');
  // '' = not specified (omit from request); 'true'/'false' = boolean string for Select
  const [farmhouseAvailable, setFarmhouseAvailable] = useState('');
  const [fencingDone, setFencingDone] = useState('');

  // Guard: allow dealer, admin, and user (owner) roles
  const role = userRole as string | null;
  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }
  if (!canAccessRoute('/broker/listings/new', role)) {
    return <Navigate to="/" replace />;
  }

  // M38-13A (#1626) — D-FE1, extended by Phase-7A FIX-A: the residential single-page
  // composition is now the DEFAULT view (propertyType initializes to 'apartment' above),
  // so this branch is taken on first paint, not only after an explicit selection.
  // Commercial/agricultural selections (and the "Switch flow" reset to '') fall through
  // to the UNCHANGED generic body below (this is the "existing generic entry" the
  // architect plan requires preserving verbatim — FIX-B).
  if (RESIDENTIAL_TYPES.has(propertyType)) {
    return (
      <AppLayout>
        <ResidentialListingForm
          initialPropertyType={propertyType as 'apartment' | 'house' | 'villa' | 'residential_plot'}
          onSwitchToGenericFlow={() => setPropertyType('')}
          navigate={navigate}
        />
      </AppLayout>
    );
  }

  // #1684 [M38-13B] — the commercial sibling of the M38-13A residential branch
  // above: mounts the new single-page commercial composition (full parity with
  // #1730's typed write path) instead of the generic body below. Inserted
  // BEFORE the legacy generic fall-through, ALONGSIDE the residential branch —
  // agricultural selections still fall through to the UNCHANGED generic body.
  if (COMMERCIAL_TYPES.has(propertyType)) {
    return (
      <AppLayout>
        <CommercialListingForm
          initialPropertyType={propertyType as 'commercial' | 'commercial_building' | 'warehouse' | 'commercial_land'}
          onSwitchToGenericFlow={() => setPropertyType('')}
          navigate={navigate}
        />
      </AppLayout>
    );
  }

  const isCommercialType = COMMERCIAL_TYPES.has(propertyType);
  const isRent = listingPurpose === 'rent';

  /**
   * Shorthand render-visibility predicate for the current propertyType +
   * listingPurpose. The `propertyType !== ''` guard keeps TypeScript happy
   * (state type is PropertyType | '') and returns false when no type is selected.
   */
  const fieldVisible = (key: ListingFieldKey): boolean =>
    propertyType !== '' && isListingFieldVisible(key, propertyType, listingPurpose);

  // Sale needs price > 0; rent needs monthlyRent > 0
  const priceValid = isRent
    ? (monthlyRent !== '' && parseInt(monthlyRent, 10) > 0)
    : (priceRupees != null && priceRupees > 0);
  const canSubmit = propertyType !== '' && priceValid;

  const handleSaveDraft = async () => {
    setHasAttempted(true);

    if (!propertyType) return;

    if (!isRent && (!priceRupees || priceRupees <= 0)) {
      return;
    }

    if (isRent && (!monthlyRent || parseInt(monthlyRent, 10) <= 0)) {
      return;
    }

    const bedroomsNum = bedrooms ? parseInt(bedrooms, 10) : undefined;
    const resolvedLandArea = landArea != null && landArea > 0 ? landArea : undefined;
    const resolvedBuiltArea = builtArea != null && builtArea > 0 ? builtArea : undefined;
    const resolvedCarpetArea = carpetArea != null && carpetArea > 0 ? carpetArea : undefined;

    createListing.mutate(
      {
        propertyType,
        title: title.trim() || undefined,
        price: isRent ? undefined : priceRupees ?? undefined,
        description: description.trim() || undefined,
        locality: locality.trim() || undefined,
        landArea: resolvedLandArea,
        landAreaUnit: resolvedLandArea !== undefined ? landAreaUnit : undefined,
        bedrooms: bedroomsNum && !isNaN(bedroomsNum) ? bedroomsNum : undefined,
        builtArea: resolvedBuiltArea,
        builtAreaUnit: resolvedBuiltArea !== undefined ? builtAreaUnit : undefined,
        listingPurpose,
        carpetArea: resolvedCarpetArea,
        carpetAreaUnit: resolvedCarpetArea !== undefined ? carpetAreaUnit : undefined,
        floorNumber: intOrUndef(floorNumber),
        totalFloors: intOrUndef(totalFloors),
        furnishingStatus: furnishingStatus || undefined,
        washrooms: intOrUndef(washrooms),
        parkingCount: intOrUndef(parkingCount),
        roadFrontageFt: floatOrUndef(roadFrontageFt),
        commercialUsage: commercialUsage.trim() || undefined,
        numberOfUnits: intOrUndef(numberOfUnits),
        monthlyRent: isRent ? intOrUndef(monthlyRent) : undefined,
        securityDepositMonths: isRent ? intOrUndef(securityDepositMonths) : undefined,
        lockInMonths: isRent ? intOrUndef(lockInMonths) : undefined,
        waterSource: waterSource.trim() || undefined,
        soilType: soilType.trim() || undefined,
        roadAccess: roadAccess.trim() || undefined,
        cultivationStatus: cultivationStatus.trim() || undefined,
        ownershipType: ownershipType.trim() || undefined,
        surveyNumber: surveyNumber.trim() || undefined,
        // Issue #1458 — new structured agri fields (omit when not specified)
        landCategory: landCategory || undefined,
        farmhouseAvailable: farmhouseAvailable === 'true' ? true : farmhouseAvailable === 'false' ? false : undefined,
        fencingDone: fencingDone === 'true' ? true : fencingDone === 'false' ? false : undefined,
      },
      {
        onSuccess: (data) => {
          toast({ title: 'Draft saved', description: 'Your listing has been created as a draft.' });
          navigate(`/broker/listings/${data.id}/edit?step=2`);
        },
      },
    );
  };

  return (
    <AppLayout>
      <div className="container max-w-2xl py-8 px-4 space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold">Create New Listing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Price and property type are required. You'll add photos and location next.
          </p>
        </div>

        {/* Step indicator — step 1 only; steps 2–4 are gated until listing is created */}
        <StepIndicator
          steps={[
            {
              label: 'Describe',
              isComplete: propertyType !== '' && priceValid,
            },
            { label: 'Add Photos', isComplete: false },
            { label: 'Pin Location', isComplete: false },
            { label: 'Review & Submit', isComplete: false },
          ]}
          currentStep={1}
          onStepClick={(n) => { if (n <= 1) { /* no-op: only step 1 available */ } }}
          helperText="Complete step 1 to unlock the remaining steps."
        />

        {/* Listing basics */}
        <SectionCard title="Listing basics">
          {/* Property Type */}
          <div className="space-y-2">
            <Label htmlFor="propertyType">Property Type *</Label>
            <PropertyTypeCardSelector
              id="propertyType"
              value={propertyType}
              onChange={setPropertyType}
            />
            {hasAttempted && !propertyType && (
              <p className="text-sm text-destructive">Property type is required.</p>
            )}
          </div>

          {/* Listing Purpose (Sale / Rent) */}
          {propertyType && (
            <div className="space-y-2">
              <Label>Listing Purpose *</Label>
              <div>
                <ListingPurposeToggle value={listingPurpose} onChange={setListingPurpose} />
              </div>
            </div>
          )}
        </SectionCard>

        {propertyType && (
          <>
            {/* Property details — size, layout and type-specific fields */}
            <SectionCard title="Property details">
            {/* Conditional: Land Area — land, commercial_land, commercial_building, warehouse, agricultural_land */}
            {fieldVisible('landArea') && (
              <AreaField
                id="landArea"
                propertyType={propertyType === 'agricultural_land' ? 'agricultural_land' : 'land'}
                initialArea={landArea}
                initialUnit={landAreaUnit}
                onChange={(area, unit) => {
                  setLandArea(area);
                  setLandAreaUnit(unit);
                }}
              />
            )}

            {/* Agricultural Land Fields — shown only for agricultural_land */}
            {fieldVisible('waterSource') && (
              <div className="space-y-4" data-testid="agri-fields-section">
                <h3 className="text-sm font-medium text-foreground">Agricultural Land Details</h3>

                {/* Water Source — Issue #1458: use enum values (WELL, BOREWELL, …) */}
                <div className="space-y-2">
                  <Label htmlFor="waterSource">Water Source</Label>
                  <Select value={waterSource} onValueChange={setWaterSource}>
                    <SelectTrigger id="waterSource">
                      <SelectValue placeholder="Select water source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WELL">Well</SelectItem>
                      <SelectItem value="BOREWELL">Borewell</SelectItem>
                      <SelectItem value="POND">Pond</SelectItem>
                      <SelectItem value="STREAM">Stream</SelectItem>
                      <SelectItem value="NOT_AVAILABLE">Not available</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Soil Type */}
                <div className="space-y-2">
                  <Label htmlFor="soilType">Soil Type</Label>
                  <Select value={soilType} onValueChange={setSoilType}>
                    <SelectTrigger id="soilType">
                      <SelectValue placeholder="Select soil type" />
                    </SelectTrigger>
                    <SelectContent>
                      {['Red laterite', 'Black cotton', 'Sandy loam', 'Clay', 'Alluvial', 'Other'].map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Road Access */}
                <div className="space-y-2">
                  <Label htmlFor="roadAccess">Road Access</Label>
                  <Select value={roadAccess} onValueChange={setRoadAccess}>
                    <SelectTrigger id="roadAccess">
                      <SelectValue placeholder="Select road access" />
                    </SelectTrigger>
                    <SelectContent>
                      {['Tarred road', 'Gravel road', 'Kachcha road', 'No road access', 'Other'].map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Cultivation Status */}
                <div className="space-y-2">
                  <Label htmlFor="cultivationStatus">Cultivation Status</Label>
                  <Select value={cultivationStatus} onValueChange={setCultivationStatus}>
                    <SelectTrigger id="cultivationStatus">
                      <SelectValue placeholder="Select cultivation status" />
                    </SelectTrigger>
                    <SelectContent>
                      {['Cultivated', 'Fallow', 'Partially cultivated', 'Uncultivated', 'Other'].map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Ownership Type */}
                <div className="space-y-2">
                  <Label htmlFor="ownershipType">Ownership Type</Label>
                  <Select value={ownershipType} onValueChange={setOwnershipType}>
                    <SelectTrigger id="ownershipType">
                      <SelectValue placeholder="Select ownership type" />
                    </SelectTrigger>
                    <SelectContent>
                      {['Patta', 'Survey settlement', 'Katha', 'Revenue', 'Other'].map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Survey Number */}
                <div className="space-y-2">
                  <Label htmlFor="surveyNumber">Survey Number</Label>
                  <Input
                    id="surveyNumber"
                    type="text"
                    maxLength={64}
                    placeholder="e.g. 123/4A"
                    value={surveyNumber}
                    onChange={(e) => setSurveyNumber(e.target.value)}
                  />
                </div>

                {/* Issue #1458 — Land Category */}
                <div className="space-y-2">
                  <Label htmlFor="landCategory">Land Category</Label>
                  <Select value={landCategory} onValueChange={setLandCategory}>
                    <SelectTrigger id="landCategory">
                      <SelectValue placeholder="Select land category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FARMLAND">Farmland</SelectItem>
                      <SelectItem value="PLANTATION">Plantation</SelectItem>
                      <SelectItem value="FARM_PLOT">Farm plot</SelectItem>
                      <SelectItem value="AGRICULTURAL_PLOT">Agricultural plot</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Issue #1458 — Farmhouse Available */}
                <div className="space-y-2">
                  <Label htmlFor="farmhouseAvailable">Farmhouse Available</Label>
                  <Select value={farmhouseAvailable} onValueChange={setFarmhouseAvailable}>
                    <SelectTrigger id="farmhouseAvailable">
                      <SelectValue placeholder="Not specified" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Issue #1458 — Fencing Done */}
                <div className="space-y-2">
                  <Label htmlFor="fencingDone">Fencing Done</Label>
                  <Select value={fencingDone} onValueChange={setFencingDone}>
                    <SelectTrigger id="fencingDone">
                      <SelectValue placeholder="Not specified" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Conditional: Built Area — house, apartment, commercial_building, warehouse */}
            {fieldVisible('builtArea') && (
              <AreaField
                id="builtArea"
                label="Built Area"
                propertyType={isCommercialType ? 'commercial' : (propertyType === 'apartment' ? 'apartment' : 'house')}
                initialArea={builtArea}
                initialUnit={builtAreaUnit}
                onChange={(area, unit) => {
                  setBuiltArea(area);
                  setBuiltAreaUnit(unit);
                }}
              />
            )}

            {/* Conditional: Bedrooms (BHK) — apartment / house / villa. M38-13A (#1626)
                chip control (design §1); wire value unchanged (plain integer). */}
            {fieldVisible('bedrooms') && (
              <SingleChipGroup
                id="bedrooms"
                label="Bedrooms (BHK)"
                options={BHK_CHIP_OPTIONS}
                value={bedrooms}
                onValueChange={setBedrooms}
              />
            )}

            {/* Conditional: Carpet Area — commercial shop/office */}
            {fieldVisible('carpetArea') && (
              <AreaField
                id="carpetArea"
                label="Carpet Area"
                propertyType="commercial"
                initialArea={carpetArea}
                initialUnit={carpetAreaUnit}
                onChange={(area, unit) => {
                  setCarpetArea(area);
                  setCarpetAreaUnit(unit);
                }}
              />
            )}

            {/* Conditional: Floor Number — commercial */}
            {fieldVisible('floorNumber') && (
              <div className="space-y-2">
                <Label htmlFor="floorNumber">Floor Number *</Label>
                <Input
                  id="floorNumber"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="e.g. 2"
                  value={floorNumber}
                  onChange={(e) => setFloorNumber(e.target.value)}
                />
              </div>
            )}

            {/* Conditional: Total Floors — commercial_building/apartment (plain numeric count);
                house/villa (M38-13A #1626 — "Number of floors" chip: Ground/G+1/.../G+4+). */}
            {fieldVisible('totalFloors') && (propertyType === 'house' || propertyType === 'villa') ? (
              <SingleChipGroup
                id="totalFloors"
                label="Number of floors"
                options={FLOORS_CHIP_OPTIONS}
                value={totalFloors}
                onValueChange={setTotalFloors}
              />
            ) : fieldVisible('totalFloors') ? (
              <div className="space-y-2">
                <Label htmlFor="totalFloors">Total Floors *</Label>
                <Input
                  id="totalFloors"
                  type="number"
                  min="1"
                  max="100"
                  placeholder="e.g. 5"
                  value={totalFloors}
                  onChange={(e) => setTotalFloors(e.target.value)}
                />
              </div>
            ) : null}

            {/* Furnishing — shared by commercial AND residential (apartment/house/villa,
                M38-13A #1626). Residential renders a segmented control (design §1);
                commercial keeps the existing Select. washrooms/parkingCount below are
                gated on their OWN fieldVisible() (commercial-only) — previously both were
                nested under fieldVisible('furnishingStatus'), which would have incorrectly
                shown "Washrooms"/"Parking Spots" for apartment/house/villa now that
                furnishingStatus is also residential-shared. */}
            {fieldVisible('furnishingStatus') && (
              isCommercialType ? (
                <div className="space-y-2">
                  <Label htmlFor="furnishingStatus">Furnishing Status</Label>
                  <Select value={furnishingStatus} onValueChange={setFurnishingStatus}>
                    <SelectTrigger id="furnishingStatus">
                      <SelectValue placeholder="Select furnishing" />
                    </SelectTrigger>
                    <SelectContent>
                      {FURNISHING_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <SingleChipGroup
                  id="furnishingStatus"
                  label="Furnishing"
                  variant="segmented"
                  options={FURNISHING_OPTIONS}
                  value={furnishingStatus}
                  onValueChange={setFurnishingStatus}
                />
              )
            )}

            {(fieldVisible('washrooms') || fieldVisible('parkingCount')) && (
              <div className="grid grid-cols-2 gap-4">
                {fieldVisible('washrooms') && (
                  <div className="space-y-2">
                    <Label htmlFor="washrooms">Washrooms</Label>
                    <Input
                      id="washrooms"
                      type="number"
                      min="0"
                      placeholder="e.g. 2"
                      value={washrooms}
                      onChange={(e) => setWashrooms(e.target.value)}
                    />
                  </div>
                )}
                {fieldVisible('parkingCount') && (
                  <div className="space-y-2">
                    <Label htmlFor="parkingCount">Parking Spots</Label>
                    <Input
                      id="parkingCount"
                      type="number"
                      min="0"
                      placeholder="e.g. 4"
                      value={parkingCount}
                      onChange={(e) => setParkingCount(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {fieldVisible('roadFrontageFt') && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="roadFrontageFt">Road Frontage (ft)</Label>
                  <Input
                    id="roadFrontageFt"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="e.g. 30"
                    value={roadFrontageFt}
                    onChange={(e) => setRoadFrontageFt(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commercialUsage">Usage / Business Type</Label>
                  <Input
                    id="commercialUsage"
                    placeholder="e.g. Retail, Office, Restaurant"
                    value={commercialUsage}
                    onChange={(e) => setCommercialUsage(e.target.value)}
                  />
                </div>
                {fieldVisible('numberOfUnits') && (
                  <div className="space-y-2">
                    <Label htmlFor="numberOfUnits">Number of Units</Label>
                    <Input
                      id="numberOfUnits"
                      type="number"
                      min="1"
                      placeholder="e.g. 8"
                      value={numberOfUnits}
                      onChange={(e) => setNumberOfUnits(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}

            </SectionCard>

            {/* Listing information */}
            <SectionCard title="Listing information">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    placeholder={isCommercialType
                      ? 'e.g. 500 sqft Shop in Udupi Town'
                      : 'e.g. 3 BHK Apartment in Manipal'}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                {/* Locality */}
                <div className="space-y-2">
                  <Label htmlFor="locality">Locality</Label>
                  <Input
                    id="locality"
                    placeholder="e.g. Manipal, Udupi"
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                  />
                </div>

                {/* Price — for sale listings */}
                {fieldVisible('price') && (
                  <div>
                    <PriceField
                      id="price"
                      initialRupees={null}
                      onChange={setPriceRupees}
                      required
                    />
                    {hasAttempted && (priceRupees == null || priceRupees <= 0) && (
                      <p className="text-sm text-destructive mt-1">A valid price greater than 0 is required.</p>
                    )}
                  </div>
                )}

                {/* Rent fields */}
                {fieldVisible('monthlyRent') && (
                  <div className="space-y-4 rounded-md border p-4 bg-muted/30">
                    <p className="text-sm font-medium">Rent Details</p>
                    <div className="space-y-2">
                      <Label htmlFor="monthlyRent">Monthly Rent (₹) *</Label>
                      <Input
                        id="monthlyRent"
                        type="number"
                        min="1"
                        placeholder="e.g. 15000"
                        value={monthlyRent}
                        onChange={(e) => setMonthlyRent(e.target.value)}
                      />
                      {hasAttempted && (!monthlyRent || parseInt(monthlyRent, 10) <= 0) && (
                        <p className="text-sm text-destructive">Monthly rent must be greater than 0.</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="securityDepositMonths">Security Deposit (months) *</Label>
                        <Input
                          id="securityDepositMonths"
                          type="number"
                          min="0"
                          max="24"
                          placeholder="e.g. 10"
                          value={securityDepositMonths}
                          onChange={(e) => setSecurityDepositMonths(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lockInMonths">Lock-in Period (months)</Label>
                        <Input
                          id="lockInMonths"
                          type="number"
                          min="0"
                          max="60"
                          placeholder="e.g. 12"
                          value={lockInMonths}
                          onChange={(e) => setLockInMonths(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of the property..."
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
            </SectionCard>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => navigate('/broker/listings')}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveDraft}
                disabled={!canSubmit || createListing.isPending}
              >
                {createListing.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {createListing.isPending ? 'Saving…' : 'Save & Continue'}
              </Button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
