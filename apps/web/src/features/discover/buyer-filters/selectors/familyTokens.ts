import type { PropertyFilters } from '@/hooks/usePropertyListings';

/**
 * Issue #2658 (C1) — extracted verbatim from
 * apps/web/src/components/discover/panels/PropertyFilterGroups.tsx
 * (Issue #2450/#2572). Behavior-preserving: same values, same logic.
 *
 * The Commercial FAMILY is expressed on the wire as these 4 tokens when no
 * subtype is selected yet (see `familyResolution.ts` and
 * `familySwitchTransitions.ts` for where/why they get written). A token
 * emitted ALONGSIDE a subtype is the #2450 contradiction and matches zero
 * rows — see `withoutCommercialFamilyTokens`'s own note.
 */
export const COMMERCIAL_FAMILY_TOKENS: readonly NonNullable<
  PropertyFilters['propertyTypes']
>[number][] = ['commercial', 'commercial_building', 'warehouse', 'commercial_land'];

/**
 * Drops the Commercial FAMILY tokens from a property-type selection while
 * preserving any genuine Residential type. Returns `undefined` (not `[]`)
 * when nothing survives the strip, matching every other "empty axis" case
 * in this file's contract.
 */
export const withoutCommercialFamilyTokens = (
  types: PropertyFilters['propertyTypes'],
): PropertyFilters['propertyTypes'] => {
  const kept = (types ?? []).filter((type) => !COMMERCIAL_FAMILY_TOKENS.includes(type));
  return kept.length > 0 ? kept : undefined;
};
