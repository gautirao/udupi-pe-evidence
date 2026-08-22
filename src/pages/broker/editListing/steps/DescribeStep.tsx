import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { PriceField } from '@/components/broker/PriceField';
import { AreaField } from '@/components/broker/AreaField';
import { SectionCard } from '@/components/broker/SectionCard';
import { ListingPurposeToggle } from '@/components/broker/ListingPurposeToggle';
import { PropertyTypeCardSelector } from '@/components/broker/PropertyTypeCardSelector';
import {
  FURNISHING_OPTIONS,
  FACING_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
  RESIDENTIAL_OWNERSHIP_OPTIONS,
  MAINTENANCE_INCLUDED_OPTIONS,
  AVAILABILITY_OPTIONS,
  PREFERRED_TENANT_OPTIONS,
  CONVERSION_STATUS_OPTIONS,
  RESIDENTIAL_AREA_UNIT_OPTIONS,
  PROPERTY_AGE_OPTIONS,
  RESIDENTIAL_WATER_SOURCE_OPTIONS,
  SPECIAL_LOCATION_VIEW_OPTIONS,
  APARTMENT_AMENITY_OPTIONS,
  HOUSE_VILLA_AMENITY_OPTIONS,
} from '@/lib/listing-constants';
import type { PropertyType } from '@/lib/listing-constants';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import {
  WATER_SOURCE_LABELS,
  SOIL_TYPE_LABELS,
  ROAD_ACCESS_LABELS,
  CULTIVATION_STATUS_LABELS,
  OWNERSHIP_TYPE_LABELS,
  LAND_CATEGORY_LABELS,
  AGRI_CONVERSION_STATUS_LABELS,
} from '@/lib/agriFieldLabels';
import {
  SingleChipGroup,
  MultiChipGroup,
  BHK_CHIP_OPTIONS,
  BATHROOM_CHIP_OPTIONS,
  BALCONY_CHIP_OPTIONS,
  PARKING_CHIP_OPTIONS,
  FLOORS_CHIP_OPTIONS,
} from '../chipGroups';
import type { useAgriFields } from '../useAgriFields';
import type { useCommercialFields } from '../useCommercialFields';
import type { useRentFields } from '../useRentFields';
import type { useResidentialFields } from '../useResidentialFields';
import type { useSharedFields } from '../useSharedFields';
import type { useUpdateListing } from '@/hooks/useBrokerListings';

// Issue #1458 + #1459 — derive canonical value lists from shared label maps to avoid duplication.
// Re-derived here (not threaded as props) mirroring steps/PhotosStep.tsx's precedent of
// re-importing pure module-scope helpers/consts. Any future addition to agriFieldLabels.ts
// is automatically reflected here, same as in EditListingForm.tsx.
const KNOWN_WATER_SOURCES = Object.keys(WATER_SOURCE_LABELS);
const KNOWN_SOIL_TYPES = Object.keys(SOIL_TYPE_LABELS);
const KNOWN_ROAD_ACCESS_VALUES = Object.keys(ROAD_ACCESS_LABELS);
const KNOWN_CULTIVATION_STATUSES = Object.keys(CULTIVATION_STATUS_LABELS);
const KNOWN_OWNERSHIP_TYPES = Object.keys(OWNERSHIP_TYPE_LABELS);
const KNOWN_LAND_CATEGORIES = Object.keys(LAND_CATEGORY_LABELS);

interface DescribeStepProps {
  // Composed hook-result objects (Issue #1838 slice 6b — misrouting-safe by construction;
  // agri={agri} cannot be miswired, unlike passing dozens of loose scalars).
  agri: ReturnType<typeof useAgriFields>;
  commercial: ReturnType<typeof useCommercialFields>;
  rent: ReturnType<typeof useRentFields>;
  residential: ReturnType<typeof useResidentialFields>;
  shared: ReturnType<typeof useSharedFields>;
  // Flat base scalars/setters — component-owned useState in the parent (EditListingForm).
  title: string;
  setTitle: Dispatch<SetStateAction<string>>;
  setTitleManuallyEdited: Dispatch<SetStateAction<boolean>>;
  description: string;
  setDescription: Dispatch<SetStateAction<string>>;
  priceRupees: number | null;
  setPriceRupees: Dispatch<SetStateAction<number | null>>;
  propertyType: PropertyType | '';
  setPropertyType: Dispatch<SetStateAction<PropertyType | ''>>;
  locality: string;
  setLocality: Dispatch<SetStateAction<string>>;
  landArea: number | null;
  setLandArea: Dispatch<SetStateAction<number | null>>;
  landAreaUnit: string;
  setLandAreaUnit: Dispatch<SetStateAction<string>>;
  bedrooms: string;
  setBedrooms: Dispatch<SetStateAction<string>>;
  builtArea: number | null;
  setBuiltArea: Dispatch<SetStateAction<number | null>>;
  builtAreaUnit: string;
  setBuiltAreaUnit: Dispatch<SetStateAction<string>>;
  reraNumber: string;
  setReraNumber: Dispatch<SetStateAction<string>>;
  listingPurpose: 'sale' | 'rent';
  setListingPurpose: Dispatch<SetStateAction<'sale' | 'rent'>>;
  // Derived flags — computed in the parent over the frozen listingFieldConfig CONFIG_MAP;
  // NEVER recomputed/reimplemented here.
  fieldVisible: (key: ListingFieldKey) => boolean;
  isCommercialType: boolean;
  // Handlers
  handleStep1Save: (e: React.FormEvent) => void;
  updateListing: ReturnType<typeof useUpdateListing>;
}

/**
 * Step 1 ("Describe") render panel — Issue #1838 slice 6b (final panel extraction of the
 * EditListingForm decomposition programme). STATELESS: owns no state, calls none of the 5
 * domain hooks itself. EditListingForm.tsx remains the sole state owner; this component
 * receives every value/setter/handler as a prop and renders the identical JSX that used to
 * live inline in EditListingForm.tsx (lines ~601-1553 pre-extraction).
 *
 * The parent's `<div data-testid="step-1-panel" style={{ display: currentStep === 1 ? 'block'
 * : 'none' }}>` always-mounted wrapper stays in EditListingForm.tsx verbatim — this component
 * is only the wrapper's inner content (the `<form>`).
 */
export function DescribeStep({
  agri, commercial, rent, residential, shared,
  title, setTitle, setTitleManuallyEdited,
  description, setDescription,
  priceRupees, setPriceRupees,
  propertyType, setPropertyType,
  locality, setLocality,
  landArea, setLandArea, landAreaUnit, setLandAreaUnit,
  bedrooms, setBedrooms,
  builtArea, setBuiltArea, builtAreaUnit, setBuiltAreaUnit,
  reraNumber, setReraNumber,
  listingPurpose, setListingPurpose,
  fieldVisible, isCommercialType,
  handleStep1Save, updateListing,
}: DescribeStepProps) {
  // Destructuring preamble — restores every bare identifier the moved JSX below reads,
  // verbatim to EditListingForm.tsx's own hook-result destructuring (Issue #1838 slice 6b).
  const {
    carpetArea, carpetAreaUnit, floorNumber, totalFloors, furnishingStatus, facing, ownershipType,
  } = shared.values;
  const {
    setCarpetArea, setCarpetAreaUnit, setFloorNumber, setTotalFloors, setFurnishingStatus, setFacing, setOwnershipType,
  } = shared.setters;

  const {
    washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits,
  } = commercial.values;
  const {
    setWashrooms, setParkingCount, setRoadFrontageFt, setCommercialUsage, setNumberOfUnits,
  } = commercial.setters;

  const {
    monthlyRent, securityDepositMonths, lockInMonths,
  } = rent.values;
  const {
    setMonthlyRent, setSecurityDepositMonths, setLockInMonths,
  } = rent.setters;

  const {
    waterSource, soilType, roadAccess, cultivationStatus,
    surveyNumber, landCategory, agriConversionStatus, farmhouseAvailable, fencingDone,
  } = agri.values;
  const {
    setWaterSource, setSoilType, setRoadAccess, setCultivationStatus,
    setSurveyNumber, setLandCategory, setAgriConversionStatus, setFarmhouseAvailable, setFencingDone,
  } = agri.setters;

  const {
    bathrooms, balconies, parking2wCount, parking4wCount, roadWidthFt, maintenancePaise,
    propertyAge, residentialWaterSource, plotDimensions, conversionStatus, khataNumber,
    propertyTaxPid, approvingAuthority, projectName, builderName, possessionStatus,
    availabilityTimeline, priceNegotiable, hasLift, hasPowerBackup, isGated, hasGarden,
    hasTerrace, hasCompound, hasServantRoom, isCornerPlot, hasBoundaryWall, isGatedLayout,
    hasWaterConnection, hasElectricityConnection, hasDrainage, maintenanceIncluded,
    rentNegotiable, petsAllowed, amenities, specialLocationViews, preferredTenants,
    superBuiltArea, superBuiltAreaUnit,
  } = residential.values;
  const {
    setBathrooms, setBalconies, setParking2wCount, setParking4wCount, setRoadWidthFt,
    setMaintenancePaise, setPropertyAge, setResidentialWaterSource, setPlotDimensions,
    setConversionStatus, setKhataNumber, setPropertyTaxPid, setApprovingAuthority,
    setProjectName, setBuilderName, setPossessionStatus, setAvailabilityTimeline,
    setPriceNegotiable, setHasLift, setHasPowerBackup, setIsGated, setHasGarden,
    setHasTerrace, setHasCompound, setHasServantRoom, setIsCornerPlot, setHasBoundaryWall,
    setIsGatedLayout, setHasWaterConnection, setHasElectricityConnection, setHasDrainage,
    setMaintenanceIncluded, setRentNegotiable, setPetsAllowed, setAmenities,
    setSpecialLocationViews, setPreferredTenants, setSuperBuiltArea, setSuperBuiltAreaUnit,
  } = residential.setters;

  return (
        <form onSubmit={handleStep1Save} className="space-y-6">
          {/* Listing basics */}
          <SectionCard title="Listing basics">
            {/* Property Type */}
            <div className="space-y-2">
              <Label htmlFor="propertyType">Property Type</Label>
              <PropertyTypeCardSelector
                id="propertyType"
                value={propertyType}
                onChange={setPropertyType}
              />
            </div>

            {/* Listing Purpose (Sale / Rent) */}
            <div className="space-y-2">
              <Label>Listing Purpose</Label>
              <div>
                <ListingPurposeToggle value={listingPurpose} onChange={setListingPurpose} />
              </div>
            </div>
          </SectionCard>

          {/* Property details — size, layout and type-specific fields */}
          <SectionCard title="Property details">
              {/* Land Area — land, commercial_land, commercial_building, warehouse, agricultural_land */}
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

                  {/* Land Category — Issue #1458 */}
                  <div className="space-y-2">
                    <Label htmlFor="landCategory">Land Category</Label>
                    <Select value={landCategory} onValueChange={setLandCategory}>
                      <SelectTrigger id="landCategory">
                        <SelectValue placeholder="Select land category" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Issue #1459 — legacy free-text fallback (same pattern as waterSource) */}
                        {landCategory && !KNOWN_LAND_CATEGORIES.includes(landCategory) && (
                          <SelectItem value={landCategory}>{landCategory} (legacy)</SelectItem>
                        )}
                        {Object.entries(LAND_CATEGORY_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Water Source */}
                  <div className="space-y-2">
                    <Label htmlFor="waterSource">Water Source</Label>
                    <Select value={waterSource} onValueChange={setWaterSource}>
                      <SelectTrigger id="waterSource">
                        <SelectValue placeholder="Select water source" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Issue #1458 — show a legacy free-text value as a visible option
                            when the stored value doesn't match any known enum. This prevents
                            the Select from rendering blank while still preserving the value
                            on save-without-change. */}
                        {waterSource && !KNOWN_WATER_SOURCES.includes(waterSource) && (
                          <SelectItem value={waterSource}>{waterSource} (legacy)</SelectItem>
                        )}
                        <SelectItem value="BOREWELL">Borewell</SelectItem>
                        <SelectItem value="WELL">Open well</SelectItem>
                        <SelectItem value="RIVER">River</SelectItem>
                        <SelectItem value="RAIN_FED">Rain-fed</SelectItem>
                        <SelectItem value="POND">Pond</SelectItem>
                        <SelectItem value="STREAM">Stream</SelectItem>
                        <SelectItem value="NOT_AVAILABLE">Not available</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Farmhouse Available — Issue #1458 */}
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

                  {/* Fencing Done — Issue #1458 */}
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

                  {/* Soil Type */}
                  <div className="space-y-2">
                    <Label htmlFor="soilType">Soil Type</Label>
                    <Select value={soilType} onValueChange={setSoilType}>
                      <SelectTrigger id="soilType">
                        <SelectValue placeholder="Select soil type" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Issue #1459 — legacy free-text fallback, same pattern as waterSource */}
                        {soilType && !KNOWN_SOIL_TYPES.includes(soilType) && (
                          <SelectItem value={soilType}>{soilType} (legacy)</SelectItem>
                        )}
                        <SelectItem value="RED_LATERITE">Red laterite</SelectItem>
                        <SelectItem value="BLACK_COTTON">Black cotton</SelectItem>
                        <SelectItem value="ALLUVIAL">Alluvial</SelectItem>
                        <SelectItem value="SANDY_LOAM">Sandy loam</SelectItem>
                        <SelectItem value="CLAY">Clay</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
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
                        {/* Issue #1459 — legacy free-text fallback (e.g. old 'Gravel road' values) */}
                        {roadAccess && !KNOWN_ROAD_ACCESS_VALUES.includes(roadAccess) && (
                          <SelectItem value={roadAccess}>{roadAccess} (legacy)</SelectItem>
                        )}
                        <SelectItem value="TARRED_ROAD">Tarred road</SelectItem>
                        <SelectItem value="KACHCHA_ROAD">Kachcha road</SelectItem>
                        <SelectItem value="HIGHWAY_FRONTAGE">Highway frontage</SelectItem>
                        <SelectItem value="NO_ROAD_ACCESS">No road access</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
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
                        {/* Issue #1459 — legacy free-text fallback (e.g. old 'Uncultivated' values) */}
                        {cultivationStatus && !KNOWN_CULTIVATION_STATUSES.includes(cultivationStatus) && (
                          <SelectItem value={cultivationStatus}>{cultivationStatus} (legacy)</SelectItem>
                        )}
                        <SelectItem value="CULTIVATED">Cultivated</SelectItem>
                        <SelectItem value="FALLOW">Fallow</SelectItem>
                        <SelectItem value="ARECA_PLANTATION">Areca plantation</SelectItem>
                        <SelectItem value="COCONUT_PLANTATION">Coconut plantation</SelectItem>
                        <SelectItem value="PARTIALLY_CULTIVATED">Partially cultivated</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
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
                        {/* Issue #1459 — legacy free-text fallback */}
                        {ownershipType && !KNOWN_OWNERSHIP_TYPES.includes(ownershipType) && (
                          <SelectItem value={ownershipType}>{ownershipType} (legacy)</SelectItem>
                        )}
                        <SelectItem value="FREEHOLD">Freehold</SelectItem>
                        <SelectItem value="INHERITED">Inherited</SelectItem>
                        <SelectItem value="PATTA">Patta</SelectItem>
                        <SelectItem value="SURVEY_SETTLEMENT">Survey settlement</SelectItem>
                        <SelectItem value="KATHA">Katha</SelectItem>
                        <SelectItem value="REVENUE">Revenue</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Conversion Status — Issue #2043. Optional; declared by the seller/broker,
                      not verified by ReTrends. Placed after the other 8 canonical agri
                      selects to avoid shifting their existing positional DOM indices. */}
                  <div className="space-y-2">
                    <Label htmlFor="agriConversionStatus">Conversion Status (optional)</Label>
                    <Select value={agriConversionStatus} onValueChange={setAgriConversionStatus}>
                      <SelectTrigger id="agriConversionStatus">
                        <SelectValue placeholder="Select conversion status" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(AGRI_CONVERSION_STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Declared by the seller/broker — not verified by ReTrends.
                    </p>
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
                </div>
              )}

              {/* Built Area — apartment, house, villa, commercial_building, warehouse.
                  AreaField's chip/unit template has no distinct 'villa' variant — villa
                  reuses the 'house' template (identical visibility set, design §3). */}
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

              {/* Bedrooms (BHK) — apartment / house / villa. M38-13A (#1626) chip control
                  (design §1): "5+" caps the chip UI but the underlying wire value stays a
                  plain integer, unchanged for the backend. */}
              {fieldVisible('bedrooms') && (
                <SingleChipGroup
                  id="bedrooms"
                  label="Bedrooms (BHK)"
                  options={BHK_CHIP_OPTIONS}
                  value={bedrooms}
                  onValueChange={setBedrooms}
                />
              )}

              {/* Carpet Area — commercial shop/office, OR apartment primary area (M38-13A) */}
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

              {/* ── M38-13A (#1626) — residential typed-listing fields ── */}
              {fieldVisible('bathrooms') && (
                <SingleChipGroup
                  id="bathrooms"
                  label="Bathrooms"
                  options={BATHROOM_CHIP_OPTIONS}
                  value={bathrooms}
                  onValueChange={setBathrooms}
                />
              )}

              {fieldVisible('balconies') && (
                <SingleChipGroup
                  id="balconies"
                  label="Balconies"
                  options={BALCONY_CHIP_OPTIONS}
                  value={balconies}
                  onValueChange={setBalconies}
                />
              )}

              {fieldVisible('superBuiltArea') && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="superBuiltArea">Super built-up area (optional)</Label>
                    <Input
                      id="superBuiltArea"
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 1350"
                      value={superBuiltArea ?? ''}
                      onChange={(e) => setSuperBuiltArea(e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="superBuiltAreaUnit">Unit</Label>
                    <Select value={superBuiltAreaUnit} onValueChange={setSuperBuiltAreaUnit}>
                      <SelectTrigger id="superBuiltAreaUnit">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {RESIDENTIAL_AREA_UNIT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {fieldVisible('facing') && (
                <div className="space-y-2">
                  <Label htmlFor="facing">Facing</Label>
                  <Select value={facing} onValueChange={setFacing}>
                    <SelectTrigger id="facing">
                      <SelectValue placeholder="Select facing" />
                    </SelectTrigger>
                    <SelectContent>
                      {FACING_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {fieldVisible('propertyAge') && (
                <div className="space-y-2">
                  <Label htmlFor="propertyAge">Property age</Label>
                  <Select value={propertyAge} onValueChange={setPropertyAge}>
                    <SelectTrigger id="propertyAge">
                      <SelectValue placeholder="Select property age" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROPERTY_AGE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {fieldVisible('residentialWaterSource') && (
                <div className="space-y-2">
                  <Label htmlFor="residentialWaterSource">Water source</Label>
                  <Select value={residentialWaterSource} onValueChange={setResidentialWaterSource}>
                    <SelectTrigger id="residentialWaterSource">
                      <SelectValue placeholder="Select water source" />
                    </SelectTrigger>
                    <SelectContent>
                      {RESIDENTIAL_WATER_SOURCE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {fieldVisible('parking2wCount') && (
                <SingleChipGroup
                  id="parking2wCount"
                  label="2-wheeler parking"
                  options={PARKING_CHIP_OPTIONS}
                  value={parking2wCount}
                  onValueChange={setParking2wCount}
                />
              )}
              {fieldVisible('parking4wCount') && (
                <SingleChipGroup
                  id="parking4wCount"
                  label="4-wheeler parking"
                  options={PARKING_CHIP_OPTIONS}
                  value={parking4wCount}
                  onValueChange={setParking4wCount}
                />
              )}

              {/* Boolean toggles — tri-state Select (Yes/No/not specified), same convention
                  as the existing agri farmhouseAvailable/fencingDone fields above. */}
              {(fieldVisible('hasLift') || fieldVisible('hasPowerBackup') || fieldVisible('isGated')
                || fieldVisible('hasGarden') || fieldVisible('hasTerrace') || fieldVisible('hasCompound')
                || fieldVisible('hasServantRoom')) && (
                <div className="grid grid-cols-2 gap-4">
                  {([
                    ['hasLift', 'Lift', hasLift, setHasLift],
                    ['hasPowerBackup', 'Power backup', hasPowerBackup, setHasPowerBackup],
                    ['isGated', 'Gated community', isGated, setIsGated],
                    ['hasGarden', 'Garden', hasGarden, setHasGarden],
                    ['hasTerrace', 'Terrace', hasTerrace, setHasTerrace],
                    ['hasCompound', 'Compound wall', hasCompound, setHasCompound],
                    ['hasServantRoom', 'Servant room', hasServantRoom, setHasServantRoom],
                  ] as const).map(([key, label, val, setter]) =>
                    fieldVisible(key) && (
                      <div className="space-y-2" key={key}>
                        <Label htmlFor={key}>{label}</Label>
                        <Select value={val} onValueChange={setter}>
                          <SelectTrigger id={key}>
                            <SelectValue placeholder="Not specified" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Yes</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ),
                  )}
                </div>
              )}

              {/* M38-13A (#1626) — Amenities: multi-select chip group (design §1). Apartment vs
                  house/villa use different amenity lists per design; emits the FINAL desired
                  set (not a delta), matching the fieldVisible-gated PUT payload behavior. */}
              {fieldVisible('amenities') && (
                <MultiChipGroup
                  testId="chip-group-amenities"
                  label="Amenities"
                  options={propertyType === 'apartment' ? APARTMENT_AMENITY_OPTIONS : HOUSE_VILLA_AMENITY_OPTIONS}
                  value={amenities}
                  onValueChange={setAmenities}
                />
              )}

              {fieldVisible('specialLocationViews') && (
                <MultiChipGroup
                  label="Special location / views"
                  options={SPECIAL_LOCATION_VIEW_OPTIONS}
                  value={specialLocationViews}
                  onValueChange={setSpecialLocationViews}
                />
              )}

              {(fieldVisible('projectName') || fieldVisible('builderName')) && (
                <div className="grid grid-cols-2 gap-4">
                  {fieldVisible('projectName') && (
                    <div className="space-y-2">
                      <Label htmlFor="projectName">Project / society name</Label>
                      <Input
                        id="projectName"
                        placeholder="e.g. Sunrise Residency"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                      />
                    </div>
                  )}
                  {fieldVisible('builderName') && (
                    <div className="space-y-2">
                      <Label htmlFor="builderName">Builder name</Label>
                      <Input
                        id="builderName"
                        placeholder="e.g. ABC Builders"
                        value={builderName}
                        onChange={(e) => setBuilderName(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {fieldVisible('ownershipType') && (
                <div className="space-y-2">
                  <Label htmlFor="residentialOwnershipType">Ownership type</Label>
                  <Select value={ownershipType} onValueChange={setOwnershipType}>
                    <SelectTrigger id="residentialOwnershipType">
                      <SelectValue placeholder="Select ownership type" />
                    </SelectTrigger>
                    <SelectContent>
                      {RESIDENTIAL_OWNERSHIP_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* ── M38-13A — residential_plot-only fields (docs + plot features) ── */}
              {fieldVisible('plotDimensions') && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="plotDimensions">Plot dimensions</Label>
                    <Input
                      id="plotDimensions"
                      placeholder="e.g. 40x60 ft"
                      value={plotDimensions}
                      onChange={(e) => setPlotDimensions(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="roadWidthFt">Road width (ft)</Label>
                    <Input
                      id="roadWidthFt"
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 30"
                      value={roadWidthFt}
                      onChange={(e) => setRoadWidthFt(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {fieldVisible('conversionStatus') && (
                <div className="space-y-2">
                  <Label htmlFor="conversionStatus">Conversion status</Label>
                  <Select value={conversionStatus} onValueChange={setConversionStatus}>
                    <SelectTrigger id="conversionStatus">
                      <SelectValue placeholder="Select conversion status" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONVERSION_STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(fieldVisible('isCornerPlot') || fieldVisible('hasBoundaryWall') || fieldVisible('isGatedLayout')
                || fieldVisible('hasWaterConnection') || fieldVisible('hasElectricityConnection') || fieldVisible('hasDrainage')) && (
                <div className="grid grid-cols-2 gap-4">
                  {([
                    ['isCornerPlot', 'Corner plot', isCornerPlot, setIsCornerPlot],
                    ['hasBoundaryWall', 'Boundary wall', hasBoundaryWall, setHasBoundaryWall],
                    ['isGatedLayout', 'Gated layout', isGatedLayout, setIsGatedLayout],
                    ['hasWaterConnection', 'Water connection', hasWaterConnection, setHasWaterConnection],
                    ['hasElectricityConnection', 'Electricity connection', hasElectricityConnection, setHasElectricityConnection],
                    ['hasDrainage', 'Drainage', hasDrainage, setHasDrainage],
                  ] as const).map(([key, label, val, setter]) =>
                    fieldVisible(key) && (
                      <div className="space-y-2" key={key}>
                        <Label htmlFor={key}>{label}</Label>
                        <Select value={val} onValueChange={setter}>
                          <SelectTrigger id={key}>
                            <SelectValue placeholder="Not specified" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Yes</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ),
                  )}
                </div>
              )}

              {(fieldVisible('khataNumber') || fieldVisible('propertyTaxPid') || fieldVisible('approvingAuthority')) && (
                <div className="space-y-4" data-testid="plot-docs-section">
                  <h3 className="text-sm font-medium text-foreground">Ownership &amp; document details</h3>
                  {fieldVisible('khataNumber') && (
                    <div className="space-y-2">
                      <Label htmlFor="khataNumber">Khata number</Label>
                      <Input
                        id="khataNumber"
                        placeholder="e.g. 123/45"
                        value={khataNumber}
                        onChange={(e) => setKhataNumber(e.target.value)}
                      />
                    </div>
                  )}
                  {fieldVisible('propertyTaxPid') && (
                    <div className="space-y-2">
                      <Label htmlFor="propertyTaxPid">Property tax PID</Label>
                      <Input
                        id="propertyTaxPid"
                        placeholder="e.g. PID-00123"
                        value={propertyTaxPid}
                        onChange={(e) => setPropertyTaxPid(e.target.value)}
                      />
                    </div>
                  )}
                  {fieldVisible('approvingAuthority') && (
                    <div className="space-y-2">
                      <Label htmlFor="approvingAuthority">Approving authority</Label>
                      <Input
                        id="approvingAuthority"
                        placeholder="e.g. Udupi CMC"
                        value={approvingAuthority}
                        onChange={(e) => setApprovingAuthority(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Floor Number — commercial */}
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

              {/* Total Floors — commercial_building, apartment (total floors in building):
                  plain numeric input (free count, not a small enumerable set).
                  House/villa (Number of floors — M38-13A #1626, reuses the same column):
                  Ground/G+1/G+2/G+3/G+4+ chip control per design §1. */}
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
                  M38-13A #1626). Residential renders it as a segmented control (design §1);
                  commercial keeps the existing Select. Bug fix: washrooms/parkingCount below
                  are now gated on their OWN fieldVisible() (commercial-only in CONFIG_MAP) —
                  previously both were nested under fieldVisible('furnishingStatus'), which
                  would have incorrectly shown "Washrooms"/"Parking Spots" plain inputs for
                  apartment/house/villa now that furnishingStatus is also residential-shared. */}
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

              {/* ── M38-13A (#1626) — sale vs rent conditional terms (design §4) ── */}
              {fieldVisible('possessionStatus') && (
                <SingleChipGroup
                  id="possessionStatus"
                  label="Property status"
                  variant="segmented"
                  options={PROPERTY_STATUS_OPTIONS}
                  value={possessionStatus}
                  onValueChange={setPossessionStatus}
                />
              )}

              {fieldVisible('maintenancePaise') && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maintenancePaise">Maintenance (₹/mo)</Label>
                    <Input
                      id="maintenancePaise"
                      type="number"
                      min="0"
                      placeholder="e.g. 2000"
                      value={maintenancePaise}
                      onChange={(e) => setMaintenancePaise(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priceNegotiable">Negotiable</Label>
                    <Select value={priceNegotiable} onValueChange={setPriceNegotiable}>
                      <SelectTrigger id="priceNegotiable">
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

              {fieldVisible('maintenanceIncluded') && (
                <div className="grid grid-cols-2 gap-4">
                  <SingleChipGroup
                    id="maintenanceIncluded"
                    label="Maintenance"
                    variant="segmented"
                    options={MAINTENANCE_INCLUDED_OPTIONS}
                    value={maintenanceIncluded === 'true' ? 'INCLUDED' : maintenanceIncluded === 'false' ? 'EXCLUDED' : ''}
                    onValueChange={(v) => setMaintenanceIncluded(v === 'INCLUDED' ? 'true' : 'false')}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="rentNegotiable">Negotiable</Label>
                    <Select value={rentNegotiable} onValueChange={setRentNegotiable}>
                      <SelectTrigger id="rentNegotiable">
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

              {fieldVisible('availabilityTimeline') && (
                <SingleChipGroup
                  id="availabilityTimeline"
                  label="Availability"
                  options={AVAILABILITY_OPTIONS}
                  value={availabilityTimeline}
                  onValueChange={setAvailabilityTimeline}
                />
              )}

              {fieldVisible('petsAllowed') && (
                <div className="space-y-2">
                  <Label htmlFor="petsAllowed">Pets allowed</Label>
                  <Select value={petsAllowed} onValueChange={setPetsAllowed}>
                    <SelectTrigger id="petsAllowed">
                      <SelectValue placeholder="Not specified" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {fieldVisible('preferredTenants') && (
                <MultiChipGroup
                  label="Preferred tenants"
                  options={PREFERRED_TENANT_OPTIONS}
                  value={preferredTenants}
                  onValueChange={setPreferredTenants}
                />
              )}

              {/* RERA Number — apartment / house / villa / residential_plot */}
              {(propertyType === 'apartment' || propertyType === 'house' || propertyType === 'villa'
                || propertyType === 'residential_plot') && (
                <div className="space-y-2">
                  <Label htmlFor="reraNumber">RERA Number (optional)</Label>
                  <Input
                    id="reraNumber"
                    placeholder="e.g., PRM/KA/RERA/1251/..."
                    maxLength={80}
                    value={reraNumber}
                    onChange={(e) => setReraNumber(e.target.value)}
                  />
                </div>
              )}
          </SectionCard>

          {/* Listing information */}
          <SectionCard title="Listing information">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g. 3 BHK Apartment in Manipal"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleManuallyEdited(true);
                }}
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

            {/* Price */}
            <PriceField initialRupees={priceRupees} onChange={setPriceRupees} required />

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

          {/* Step 1 action */}
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={updateListing.isPending}>
              {updateListing.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save & Continue
            </Button>
          </div>
        </form>
  );
}
