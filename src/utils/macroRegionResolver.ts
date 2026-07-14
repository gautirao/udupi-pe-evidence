/**
 * macroRegionResolver
 *
 * Issue #1745: originally a safe resolver for mapping between URL `scope` keys
 * (macro region slugs/directions) and backend `group.region_label` /
 * `DiscoverSummaryRegion.regionLabel` strings, using label/slug/direction-word
 * heuristics when no exact key match was available.
 *
 * Issue #1882 (Track A PR2 Slice S2c) — the backend now derives and returns a
 * canonical `region_key` per group/region (see AreaGroupsService.java's
 * derived-at-read regionKey, and the region-summary rollup's `key` field), so
 * every region-scope caller across the app now compares region keys with
 * strict equality instead of inferring a match from labels/directions.
 * `aggregateMacroRegions`, `matchesMacroRegion`, `resolveScopeKeyFromLabel`,
 * and their direction-heuristic tables (`DIRECTION_WORDS`,
 * `DIRECTION_ABBR_MAP`) have been DELETED — do not reintroduce them.
 *
 * What remains:
 * - `labelToSlug` — still used for GROUP-slug (not region) URL matching
 *   (e.g. matching a group's own name-derived slug against `scope`).
 * - `getGroupMacroRegionLabel` — display-label fallback ("Other zones") for
 *   presentational grouping/section headers, independent of scope matching.
 * - `SummaryRegionRef` — shared shape for the region-summary lookups that
 *   replaced the deleted resolvers.
 */

export interface SummaryRegionRef {
  regionKey: string;
  regionLabel: string;
}

export const FALLBACK_REGION_LABEL = 'Other zones';

/**
 * Converts a display label into a normalized kebab-case slug.
 * e.g., "North Bangalore" -> "north-bangalore", "University Belt" -> "university-belt"
 */
export function labelToSlug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Returns the safe display label for a group's macro region, falling back to "Other zones"
 * when region_label is null, undefined, or whitespace-only.
 */
export function getGroupMacroRegionLabel(group: { region_label?: string | null }): string {
  const label = group.region_label?.trim();
  return label && label.length > 0 ? label : FALLBACK_REGION_LABEL;
}
