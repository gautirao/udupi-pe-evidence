// Extracted verbatim from DescribeStep.tsx:574-898 — no gate logic changed.
// Issue #1838 PR D — internal split of DescribeStep into per-domain sections.
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FACING_OPTIONS,
  RESIDENTIAL_OWNERSHIP_OPTIONS,
  RESIDENTIAL_AREA_UNIT_OPTIONS,
  PROPERTY_AGE_OPTIONS,
  RESIDENTIAL_WATER_SOURCE_OPTIONS,
  SPECIAL_LOCATION_VIEW_OPTIONS,
  APARTMENT_AMENITY_OPTIONS,
  HOUSE_VILLA_AMENITY_OPTIONS,
  CONVERSION_STATUS_OPTIONS,
} from '@/lib/listing-constants';
import type { PropertyType } from '@/lib/listing-constants';
import {
  SingleChipGroup,
  MultiChipGroup,
  BATHROOM_CHIP_OPTIONS,
  BALCONY_CHIP_OPTIONS,
  PARKING_CHIP_OPTIONS,
} from '../../chipGroups';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import type { ResidentialFieldValues, ResidentialFieldSetters } from '../../useResidentialFields';
import type { SharedFieldValues, SharedFieldSetters } from '../../useSharedFields';
import type { FieldSlice } from '../stepContracts';

type ResidentialFeaturesValueKeys =
  | 'bathrooms' | 'balconies' | 'parking2wCount' | 'parking4wCount' | 'roadWidthFt'
  | 'propertyAge' | 'residentialWaterSource' | 'plotDimensions' | 'conversionStatus' | 'khataNumber'
  | 'propertyTaxPid' | 'approvingAuthority' | 'projectName' | 'builderName'
  | 'hasLift' | 'hasPowerBackup' | 'isGated' | 'hasGarden'
  | 'hasTerrace' | 'hasCompound' | 'hasServantRoom' | 'isCornerPlot' | 'hasBoundaryWall' | 'isGatedLayout'
  | 'hasWaterConnection' | 'hasElectricityConnection' | 'hasDrainage'
  | 'amenities' | 'specialLocationViews' | 'superBuiltArea' | 'superBuiltAreaUnit';

interface ResidentialFeaturesSectionProps {
  residential: FieldSlice<ResidentialFieldValues, ResidentialFieldSetters, ResidentialFeaturesValueKeys>;
  // shared.ownershipType/setOwnershipType is a genuinely shared value slice
  // also rendered (with a different id + option list) by AgriDetailsSection —
  // do NOT merge/dedupe the two controls.
  shared: FieldSlice<SharedFieldValues, SharedFieldSetters, 'facing' | 'ownershipType'>;
  propertyType: PropertyType | '';
  fieldVisible: (key: ListingFieldKey) => boolean;
}

/** M38-13A (#1626) residential typed-listing fields — bathrooms through the
 * plot-docs section. */
export function ResidentialFeaturesSection({
  residential, shared, propertyType, fieldVisible,
}: ResidentialFeaturesSectionProps) {
  const {
    bathrooms, balconies, parking2wCount, parking4wCount, roadWidthFt,
    propertyAge, residentialWaterSource, plotDimensions, conversionStatus, khataNumber,
    propertyTaxPid, approvingAuthority, projectName, builderName,
    hasLift, hasPowerBackup, isGated, hasGarden,
    hasTerrace, hasCompound, hasServantRoom, isCornerPlot, hasBoundaryWall, isGatedLayout,
    hasWaterConnection, hasElectricityConnection, hasDrainage,
    amenities, specialLocationViews,
    superBuiltArea, superBuiltAreaUnit,
  } = residential.values;
  const {
    setBathrooms, setBalconies, setParking2wCount, setParking4wCount, setRoadWidthFt,
    setPropertyAge, setResidentialWaterSource, setPlotDimensions,
    setConversionStatus, setKhataNumber, setPropertyTaxPid, setApprovingAuthority,
    setProjectName, setBuilderName,
    setHasLift, setHasPowerBackup, setIsGated, setHasGarden,
    setHasTerrace, setHasCompound, setHasServantRoom, setIsCornerPlot, setHasBoundaryWall,
    setIsGatedLayout, setHasWaterConnection, setHasElectricityConnection, setHasDrainage,
    setAmenities,
    setSpecialLocationViews, setSuperBuiltArea, setSuperBuiltAreaUnit,
  } = residential.setters;
  const { facing, ownershipType } = shared.values;
  const { setFacing, setOwnershipType } = shared.setters;

  return (
    <>
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
    </>
  );
}
