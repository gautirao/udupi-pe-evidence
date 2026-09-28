import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { COMMERCIAL_FAMILY_TOKENS } from './familyTokens';

export type PropertyFamily = 'residential' | 'commercial';

/**
 * Issue #2658 (C1) — pure extraction of usePropertyFilterGroups'
 * `commercialFromFilters` derivation (Issue #2450).
 *
 * The family is DERIVED from filter state rather than stored separately.
 * Under the one-axis contract a Commercial selection rides
 * `commercialSubtypes` alone and sets no `propertyTypes`, so a restored link
 * carrying only a subtype must still read as Commercial.
 */
export const isCommercialFromFilters = (filters: PropertyFilters): boolean => {
  const hasSubtype = (filters.commercialSubtypes?.length ?? 0) > 0;
  const hasFamilyToken = (filters.propertyTypes ?? []).some((t) =>
    (COMMERCIAL_FAMILY_TOKENS as readonly string[]).includes(t),
  );
  return hasSubtype || hasFamilyToken;
};

/**
 * Issue #2658 (C1) — pure extraction of `activeFamily`'s resolution
 * (Issue #2552).
 *
 * The override is consulted ONLY while the filters are family-SILENT
 * (`familyIsUnset`): derivation from live filters always wins when the
 * filters say anything about family, so the override can never contradict
 * what is actually on the wire.
 */
export const resolveActiveFamily = ({
  commercialFromFilters,
  familyIsUnset,
  familyOverride,
}: {
  commercialFromFilters: boolean;
  familyIsUnset: boolean;
  familyOverride: PropertyFamily | null;
}): PropertyFamily => {
  if (commercialFromFilters) return 'commercial';
  if (familyIsUnset && familyOverride !== null) return familyOverride;
  return 'residential';
};

/**
 * Issue #2658 (C1) — pure extraction of `familyIsUnset`
 * (`activeCommercialSubtypes.size === 0 && allTypesActive`).
 */
export const isFamilyUnset = (filters: PropertyFilters): boolean =>
  (filters.commercialSubtypes?.length ?? 0) === 0 && (filters.propertyTypes?.length ?? 0) === 0;
