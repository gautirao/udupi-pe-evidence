import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { CommercialSubtype } from '@/lib/listing-constants';
import { COMMERCIAL_FAMILY_TOKENS, withoutCommercialFamilyTokens } from './familyTokens';

type CommercialMemory = PropertyFilters['commercialSubtypes'];
type ResidentialMemory = PropertyFilters['propertyTypes'];

/**
 * Issue #2658 (C1) — pure extraction of usePropertyFilterGroups'
 * `handleSelectFamily` Commercial-branch emission (Issues #2555 item 1,
 * #2572).
 *
 * Residential types do not survive the switch; Budget and Bedrooms do (they
 * are family-independent, spread via `...filters`). If a commercial memory
 * exists it wins (the exact subtype the buyer was last on); otherwise the 4
 * family tokens are written so the family NARROWS rather than merely
 * relabels (a bare `propertyTypes: undefined` would ask the server for
 * nothing while the chip reads "Commercial").
 */
export const computeSwitchToCommercialPatch = (
  filters: PropertyFilters,
  commercialMemory: CommercialMemory,
): PropertyFilters => ({
  ...filters,
  propertyTypes: commercialMemory?.length ? undefined : [...COMMERCIAL_FAMILY_TOKENS],
  commercialSubtypes: commercialMemory,
});

/**
 * Issue #2658 (C1) — pure extraction of usePropertyFilterGroups'
 * `handleSelectFamily` Residential-branch emission (Issue #2552, #2555
 * item 1 fourth-cycle review).
 *
 * Only the Commercial FAMILY TOKENS are stripped from the live
 * `propertyTypes`; a genuine surviving Residential type beats the memory
 * (`??` order is load-bearing — see the hook's own doc comment). The memory
 * is ALSO stripped on read, so no future writer can leak a Commercial token
 * into a Residential emission even if it banks one.
 */
export const computeSwitchToResidentialPatch = (
  filters: PropertyFilters,
  residentialMemory: ResidentialMemory,
): PropertyFilters => ({
  ...filters,
  commercialSubtypes: undefined,
  propertyTypes:
    withoutCommercialFamilyTokens(filters.propertyTypes) ??
    withoutCommercialFamilyTokens(residentialMemory),
});

/**
 * Issue #2658 (C1) — pure extraction of the "All commercial" emission
 * (`handleToggleSubtype(null)`, Issue #2572).
 *
 * Clears the subtype narrowing WITHOUT leaving the family: the 4 family
 * tokens are written explicitly so the RESULTS (not just the chip) reflect
 * "the whole Commercial family, no subtype".
 */
export const computeAllCommercialPatch = (filters: PropertyFilters): PropertyFilters => ({
  ...filters,
  propertyTypes: [...COMMERCIAL_FAMILY_TOKENS],
  commercialSubtypes: undefined,
});

/**
 * Issue #2658 (C1) — pure extraction of `handleToggleSubtype`'s non-null
 * branch (Issue #2572): toggling one subtype chip on/off.
 *
 * While a subtype survives, no family token rides with it (the #2450
 * contradiction — a token alongside a subtype matches zero rows). Emptying
 * the axis by toggling the last subtype off falls through to the family
 * tokens, landing on the whole Commercial family rather than no filter at
 * all — the same rule `computeAllCommercialPatch` encodes.
 */
export const computeToggleSubtypePatch = (
  filters: PropertyFilters,
  value: CommercialSubtype,
): PropertyFilters => {
  const current = filters.commercialSubtypes ?? [];
  const updated = current.includes(value)
    ? current.filter((s) => s !== value)
    : [...current, value];
  return {
    ...filters,
    propertyTypes:
      updated.length > 0
        ? withoutCommercialFamilyTokens(filters.propertyTypes)
        : [...COMMERCIAL_FAMILY_TOKENS],
    commercialSubtypes: updated.length > 0 ? updated : undefined,
  };
};

/**
 * Issue #2658 (C1) — pure extraction of `handleRemoveSubtype`'s emission
 * (Issue #2552, #2572 re-review). Removing a subtype CHIP is a second path
 * to the same "empty subtype axis" outcome as toggling the last one off, and
 * must agree with it: no family token survives alongside a remaining
 * subtype, and losing the last one lands on the whole Commercial family.
 */
export const computeRemoveSubtypePatch = (
  filters: PropertyFilters,
  value: CommercialSubtype,
): PropertyFilters => {
  const remaining = (filters.commercialSubtypes ?? []).filter((s) => s !== value);
  const next = remaining.length > 0 ? remaining : undefined;
  return {
    ...filters,
    propertyTypes: next
      ? withoutCommercialFamilyTokens(filters.propertyTypes)
      : [...COMMERCIAL_FAMILY_TOKENS],
    commercialSubtypes: next,
  };
};
