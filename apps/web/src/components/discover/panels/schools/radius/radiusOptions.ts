/**
 * School-radius chip options and value snapping — extracted verbatim from
 * SchoolJourneyPanels.tsx (Issue #2661 commit 2, pure-function extraction, no
 * logic changes).
 */
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import { clampSchoolRadiusKm } from '@/hooks/usePropertyListings';

// ReTrends redesign: 3/5/10 km replaces 1/2/3/5 km
export const RADIUS_OPTIONS = [3, 5, 10] as const;
export type RadiusKm = (typeof RADIUS_OPTIONS)[number];

/**
 * Snap a raw radiusKm to a supported chip value so exactly one radius chip is always
 * active. Valid 3/5/10 pass through unchanged. Null/non-finite and legacy out-of-set
 * values (e.g. 1/2 from older URLs) fall back to the NEAREST option (ties resolve to
 * the smaller radius), guaranteeing the UI never renders with zero active chips.
 * Built on clampSchoolRadiusKm so the existing sub-minimum normalisation still applies.
 */
export function snapRadiusKm(radiusKm: number | null | undefined): RadiusKm {
  const raw = clampSchoolRadiusKm(radiusKm ?? DEFAULT_SCHOOL_RADIUS_KM);
  if ((RADIUS_OPTIONS as readonly number[]).includes(raw)) return raw as RadiusKm;
  return RADIUS_OPTIONS.reduce<RadiusKm>(
    (best, opt) => (Math.abs(opt - raw) < Math.abs(best - raw) ? opt : best),
    RADIUS_OPTIONS[0],
  );
}
