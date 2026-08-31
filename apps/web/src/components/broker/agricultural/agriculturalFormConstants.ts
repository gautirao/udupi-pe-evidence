import type { ChipOption } from '@/components/broker/ChipGroup';
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

/**
 * Issue #2398 — page-health decomposition: chip/select-option constants used
 * by AgriculturalLandDetailsSection, AgriculturalLandCharacteristicsSection
 * and AgriculturalLandRecordSection. Verbatim extraction from
 * AgriculturalListingForm.tsx — no behaviour change. Kept separate from
 * AgriculturalFormPrimitives.tsx (component-only exports) so
 * react-refresh/only-export-components stays clean.
 */

/** Converts a Record<code,label> label map (agriFieldLabels.ts) into ChipOption[] for Select/chip rendering. */
function optionsFromLabelMap(map: Record<string, string>): ChipOption[] {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

export const WATER_SOURCE_OPTIONS = optionsFromLabelMap(WATER_SOURCE_LABELS);
export const SOIL_TYPE_OPTIONS = optionsFromLabelMap(SOIL_TYPE_LABELS);
export const ROAD_ACCESS_OPTIONS = optionsFromLabelMap(ROAD_ACCESS_LABELS);
export const CULTIVATION_STATUS_OPTIONS = optionsFromLabelMap(CULTIVATION_STATUS_LABELS);
export const OWNERSHIP_TYPE_OPTIONS = optionsFromLabelMap(OWNERSHIP_TYPE_LABELS);
export const LAND_CATEGORY_OPTIONS = optionsFromLabelMap(LAND_CATEGORY_LABELS);
export const AGRI_CONVERSION_STATUS_OPTIONS = optionsFromLabelMap(AGRI_CONVERSION_STATUS_LABELS);

// Issue #2044 — canonical backend crop vocabulary (AgriFieldOptions.VALID_CROPS),
// sourced from agriFieldLabels.ts like every other agri field. No 'Other' member
// (DP-1) — the free-text escape hatch was deliberately removed.
export const CROP_OPTIONS: readonly ChipOption[] = optionsFromLabelMap(CROP_LABELS);

/** FE-only vocabulary — no backend enum (deferred to PR-2, see AgriculturalListingForm.tsx class doc). */
export const FEATURE_OPTIONS: readonly ChipOption[] = [
  { value: 'Borewell', label: 'Borewell' },
  { value: 'Pond on land', label: 'Pond on land' },
  { value: 'Irrigation channel', label: 'Irrigation channel' },
  { value: 'Farm shed', label: 'Farm shed' },
  { value: 'Electricity connection', label: 'Electricity connection' },
  { value: 'Compound wall', label: 'Compound wall' },
];
