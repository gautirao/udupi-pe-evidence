// Shared agri filter option metadata (Issue #1457, #1458).
// Single source of truth for the drawer's Select options AND the active-filter
// chip labels, so the two never drift. Kept in a non-component module so
// importing these constants does not trip react-refresh/only-export-components.

export const LAND_CATEGORY_OPTIONS = [
  { value: 'FARMLAND', label: 'Farmland' },
  { value: 'PLANTATION', label: 'Plantation' },
  { value: 'FARM_PLOT', label: 'Farm plot' },
  { value: 'AGRICULTURAL_PLOT', label: 'Agricultural plot' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const WATER_SOURCE_OPTIONS = [
  { value: 'WELL', label: 'Well' },
  { value: 'BOREWELL', label: 'Borewell' },
  { value: 'POND', label: 'Pond' },
  { value: 'STREAM', label: 'Stream' },
  { value: 'NOT_AVAILABLE', label: 'Not available' },
  { value: 'OTHER', label: 'Other' },
] as const;

/** Resolve a land-category value to its display label (falls back to the raw value). */
export function landCategoryLabel(value: string): string {
  return LAND_CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** Resolve a water-source value to its display label (falls back to the raw value). */
export function waterSourceLabel(value: string): string {
  return WATER_SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
