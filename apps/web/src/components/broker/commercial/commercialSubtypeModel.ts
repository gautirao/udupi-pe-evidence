import {
  isListingFieldVisible,
  deriveCommercialSubtype,
  type ListingFieldKey,
  type CommercialSubtype,
} from '@/lib/listingFieldConfig';
import {
  SHOP_HUB_TYPE_OPTIONS,
  OFFICE_HUB_TYPE_OPTIONS,
  SHOP_SUITABLE_USE_OPTIONS,
  OFFICE_SUITABLE_USE_OPTIONS,
  BUILDING_SUITABLE_USE_OPTIONS,
  WAREHOUSE_SUITABLE_USE_OPTIONS,
  LAND_SUITABLE_USE_OPTIONS,
} from '@/lib/listing-constants';
import type { CommercialPropertyType, ExplicitSubtype, CommercialPurpose } from './commercialListingTypes';

export function suitableUseOptionsFor(subtype: CommercialSubtype | undefined) {
  switch (subtype) {
    case 'SHOP': return SHOP_SUITABLE_USE_OPTIONS;
    case 'OFFICE': return OFFICE_SUITABLE_USE_OPTIONS;
    case 'BUILDING': return BUILDING_SUITABLE_USE_OPTIONS;
    case 'WAREHOUSE': return WAREHOUSE_SUITABLE_USE_OPTIONS;
    case 'LAND': return LAND_SUITABLE_USE_OPTIONS;
    default: return [];
  }
}

export function hubTypeOptionsFor(subtype: CommercialSubtype | undefined) {
  if (subtype === 'SHOP') return SHOP_HUB_TYPE_OPTIONS;
  if (subtype === 'OFFICE') return OFFICE_HUB_TYPE_OPTIONS;
  return [];
}

export interface CommercialSubtypeModel {
  commercialSubtype: CommercialSubtype | undefined;
  isLand: boolean;
  isRentOrLease: boolean;
  fieldVisible: (key: ListingFieldKey) => boolean;
  suitableUseOptions: ReturnType<typeof suitableUseOptionsFor>;
  hubTypeOptions: ReturnType<typeof hubTypeOptionsFor>;
}

/**
 * #2388 — single authoritative owner for commercial subtype derivation and
 * field-visibility semantics. Delegates to listingFieldConfig
 * (deriveCommercialSubtype / isListingFieldVisible) rather than introducing a
 * competing subtype schema — this is a thin, pure, independently-testable
 * wrapper around that config for the shape CommercialListingForm consumes.
 */
export function deriveCommercialSubtypeModel(
  propertyType: CommercialPropertyType,
  explicitSubtype: ExplicitSubtype,
  listingPurpose: CommercialPurpose,
): CommercialSubtypeModel {
  const commercialSubtype = deriveCommercialSubtype(propertyType, explicitSubtype);
  const isLand = commercialSubtype === 'LAND';
  const isRentOrLease = listingPurpose === 'rent' || listingPurpose === 'lease';
  const fieldVisible = (key: ListingFieldKey): boolean =>
    isListingFieldVisible(key, propertyType, listingPurpose, commercialSubtype);

  return {
    commercialSubtype,
    isLand,
    isRentOrLease,
    fieldVisible,
    suitableUseOptions: suitableUseOptionsFor(commercialSubtype),
    hubTypeOptions: hubTypeOptionsFor(commercialSubtype),
  };
}
