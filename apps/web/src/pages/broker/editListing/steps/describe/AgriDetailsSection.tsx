// Extracted verbatim from DescribeStep.tsx:315-526 — no gate logic changed.
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
  WATER_SOURCE_LABELS,
  SOIL_TYPE_LABELS,
  ROAD_ACCESS_LABELS,
  CULTIVATION_STATUS_LABELS,
  OWNERSHIP_TYPE_LABELS,
  LAND_CATEGORY_LABELS,
  AGRI_CONVERSION_STATUS_LABELS,
  CROP_LABELS,
} from '@/lib/agriFieldLabels';
import { MultiChipGroup } from '../../chipGroups';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import type { AgriFieldValues, AgriFieldSetters } from '../../useAgriFields';
import type { SharedFieldValues, SharedFieldSetters } from '../../useSharedFields';
import type { FieldSlice } from '../stepContracts';

// Issue #1458 + #1459 — derive canonical value lists from shared label maps to avoid duplication.
// Relocated here from DescribeStep.tsx (Issue #1838 PR D) — used only by this section now.
const KNOWN_WATER_SOURCES = Object.keys(WATER_SOURCE_LABELS);
const KNOWN_SOIL_TYPES = Object.keys(SOIL_TYPE_LABELS);
const KNOWN_ROAD_ACCESS_VALUES = Object.keys(ROAD_ACCESS_LABELS);
const KNOWN_CULTIVATION_STATUSES = Object.keys(CULTIVATION_STATUS_LABELS);
const KNOWN_OWNERSHIP_TYPES = Object.keys(OWNERSHIP_TYPE_LABELS);
const KNOWN_LAND_CATEGORIES = Object.keys(LAND_CATEGORY_LABELS);
// Issue #2044 — canonical crop chip vocabulary, derived from agriFieldLabels.ts
// like every other agri field here (never re-hardcoded).
const CROP_CHIP_OPTIONS = Object.entries(CROP_LABELS).map(([value, label]) => ({ value, label }));

type AgriDetailsValueKeys =
  | 'waterSource' | 'soilType' | 'roadAccess' | 'cultivationStatus' | 'surveyNumber'
  | 'landCategory' | 'agriConversionStatus' | 'farmhouseAvailable' | 'fencingDone' | 'crops';

interface AgriDetailsSectionProps {
  agri: FieldSlice<AgriFieldValues, AgriFieldSetters, AgriDetailsValueKeys>;
  // shared.ownershipType/setOwnershipType is a genuinely shared value slice
  // also rendered (with a different id + option list) by
  // ResidentialFeaturesSection — do NOT merge/dedupe the two controls.
  shared: FieldSlice<SharedFieldValues, SharedFieldSetters, 'ownershipType'>;
  fieldVisible: (key: ListingFieldKey) => boolean;
}

/** Agricultural Land Fields — shown only for agricultural_land. */
export function AgriDetailsSection({ agri, shared, fieldVisible }: AgriDetailsSectionProps) {
  const {
    waterSource, soilType, roadAccess, cultivationStatus,
    surveyNumber, landCategory, agriConversionStatus, farmhouseAvailable, fencingDone, crops,
  } = agri.values;
  const {
    setWaterSource, setSoilType, setRoadAccess, setCultivationStatus,
    setSurveyNumber, setLandCategory, setAgriConversionStatus, setFarmhouseAvailable, setFencingDone, setCrops,
  } = agri.setters;
  const { ownershipType } = shared.values;
  const { setOwnershipType } = shared.setters;

  return (
    <>
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

          {/* Crops — Issue #2044. Canonical machine-value multi-select;
              persisted structurally (unlike the FE-only on-land features
              chips, which remain out of scope for this issue). */}
          <MultiChipGroup
            label="Crops grown / suitable for"
            options={CROP_CHIP_OPTIONS}
            value={crops}
            onValueChange={setCrops}
            testId="chip-group-agri-crops"
          />
        </div>
      )}
    </>
  );
}
