/**
 * Issue #2432 — buyer-readable labels for the Commercial enums rendered on listing detail.
 *
 * This module deliberately defines NO vocabulary of its own. Every label is looked up from the
 * option arrays already exported by `@/lib/listing-constants`, which are themselves the frontend
 * mirror of the server's `CommercialFieldOptions`. A third copy of these strings would be free to
 * drift from both, and the drift would be invisible: a stale label still renders, it just renders
 * the wrong word. Adapting the existing arrays means a vocabulary change lands in one place.
 *
 * The hubType and suitableUses vocabularies are SUBTYPE-SCOPED on the seller side — a shop's hub
 * types are not an office's — so their lookups take the subtype and consult the matching array.
 */

import {
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

import type { CommercialDetailSubtype } from './commercialDetailModel';

type Option = { readonly value: string; readonly label: string };

/**
 * Looks a machine value up in an option array.
 *
 * Returns `null` — never the raw value — when the code is absent or unrecognised. Falling back to
 * the raw code would put `PLUG_AND_PLAY` in front of a buyer, which is exactly the failure #2432
 * exists to remove; a caller that gets `null` omits the row instead. An unrecognised code means
 * the vocabulary moved on without this mirror, and showing nothing is the honest response.
 */
function lookup(options: readonly Option[], value: string | null | undefined): string | null {
  if (value == null) return null;
  const key = value.trim().toUpperCase();
  if (!key) return null;
  return options.find((o) => o.value === key)?.label ?? null;
}

/** Maps every value in a multi-select, dropping any the vocabulary no longer recognises. */
function lookupAll(options: readonly Option[], values: readonly string[] | null | undefined): string[] {
  if (!values?.length) return [];
  return values.map((v) => lookup(options, v)).filter((l): l is string => l !== null);
}

export const floorChoiceLabel = (v: string | null | undefined) =>
  lookup(COMMERCIAL_FLOOR_CHOICE_OPTIONS, v);

export const floorModeLabel = (v: string | null | undefined) =>
  lookup(COMMERCIAL_FLOOR_MODE_OPTIONS, v);

export const occupancyStatusLabel = (v: string | null | undefined) =>
  lookup(COMMERCIAL_OCCUPANCY_STATUS_OPTIONS, v);

export const commercialFurnishingLabel = (v: string | null | undefined) =>
  lookup(COMMERCIAL_FURNISHING_STATUS_OPTIONS, v);

export const commercialOwnershipLabel = (v: string | null | undefined) =>
  lookup(COMMERCIAL_OWNERSHIP_OPTIONS, v);

export const commercialAvailabilityLabel = (v: string | null | undefined) =>
  lookup(COMMERCIAL_AVAILABILITY_OPTIONS, v);

export const warehouseFlooringLabel = (v: string | null | undefined) =>
  lookup(WAREHOUSE_FLOORING_OPTIONS, v);

export const commercialAreaUnitLabel = (v: string | null | undefined) =>
  lookup(COMMERCIAL_AREA_UNIT_OPTIONS, v);

export const utilityLabels = (v: readonly string[] | null | undefined) =>
  lookupAll(COMMERCIAL_UTILITY_OPTIONS, v);

/**
 * hubType is subtype-scoped: SHOP and OFFICE have different vocabularies that happen to share
 * STANDALONE_BUILDING. A legacy row (null subtype) has no subtype to scope by, so both arrays are
 * consulted — shop first, then office — rather than the row losing a fact it genuinely carries.
 */
export function hubTypeLabel(
  v: string | null | undefined,
  subtype: CommercialDetailSubtype | null,
): string | null {
  if (subtype === 'SHOP') return lookup(SHOP_HUB_TYPE_OPTIONS, v);
  if (subtype === 'OFFICE') return lookup(OFFICE_HUB_TYPE_OPTIONS, v);
  return lookup(SHOP_HUB_TYPE_OPTIONS, v) ?? lookup(OFFICE_HUB_TYPE_OPTIONS, v);
}

/**
 * suitableUses is subtype-scoped for the same reason as {@link hubTypeLabel}. For a legacy row the
 * arrays are tried in turn per value, so a row that predates subtyping still shows its uses.
 */
export function suitableUseLabels(
  values: readonly string[] | null | undefined,
  subtype: CommercialDetailSubtype | null,
): string[] {
  const bySubtype: Record<CommercialDetailSubtype, readonly Option[]> = {
    SHOP: SHOP_SUITABLE_USE_OPTIONS,
    OFFICE: OFFICE_SUITABLE_USE_OPTIONS,
    BUILDING: BUILDING_SUITABLE_USE_OPTIONS,
    WAREHOUSE: WAREHOUSE_SUITABLE_USE_OPTIONS,
    LAND: LAND_SUITABLE_USE_OPTIONS,
  };

  if (subtype) return lookupAll(bySubtype[subtype], values);

  if (!values?.length) return [];
  const all = Object.values(bySubtype);
  return values
    .map((v) => all.reduce<string | null>((found, opts) => found ?? lookup(opts, v), null))
    .filter((l): l is string => l !== null);
}
