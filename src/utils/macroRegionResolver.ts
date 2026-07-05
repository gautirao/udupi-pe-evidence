/**
 * macroRegionResolver
 *
 * Issue #1745: Safe resolver for mapping between URL `scope` keys (macro region slugs/directions)
 * and backend `group.region_label` / `DiscoverSummaryRegion.regionLabel` strings.
 *
 * Enforces guardrails:
 * 1. Never compares `group.region_label` directly to `scope` without normalization or lookup.
 * 2. Consults `summaryRegions` (from /api/discover/summary) first when available.
 * 3. Derives stable slugs or direction prefixes without hardcoding city names (e.g. Bangalore/Udupi).
 * 4. Provides safe fallbacks for missing/null `region_label` ("Other zones").
 */

import type { DiscoverSummaryRegion } from '@/hooks/useDiscoverSummary';
import type { AreaGroup } from '@/hooks/useAreaGroups';

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

const DIRECTION_WORDS = [
  'north',
  'south',
  'east',
  'west',
  'central',
  'northeast',
  'northwest',
  'southeast',
  'southwest',
] as const;

const DIRECTION_ABBR_MAP: Record<string, string> = {
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  ne: 'northeast',
  nw: 'northwest',
  se: 'southeast',
  sw: 'southwest',
  c: 'central',
};

/**
 * Returns the safe display label for a group's macro region, falling back to "Other zones"
 * when region_label is null, undefined, or whitespace-only.
 */
export function getGroupMacroRegionLabel(group: { region_label?: string | null }): string {
  const label = group.region_label?.trim();
  return label && label.length > 0 ? label : FALLBACK_REGION_LABEL;
}

/**
 * Checks whether a group's `region_label` matches an active URL `scope` key.
 *
 * @param groupRegionLabel - The display label from `group.region_label` (e.g. "North Bangalore")
 * @param scope - The URL scope parameter (e.g. "north", "university-belt")
 * @param summaryRegions - Optional list of regions returned by `/api/discover/summary`
 */
export function matchesMacroRegion(
  groupRegionLabel: string | null | undefined,
  scope: string | null | undefined,
  summaryRegions?: SummaryRegionRef[],
): boolean {
  if (!scope || !groupRegionLabel) {
    return false;
  }

  const cleanScope = scope.trim().toLowerCase();
  const cleanLabel = groupRegionLabel.trim().toLowerCase();

  if (cleanLabel === cleanScope) {
    return true;
  }

  // 1. Check summaryRegions (highest precision when available)
  if (summaryRegions && summaryRegions.length > 0) {
    const matchedSummaryRegion = summaryRegions.find((r) => {
      const rKey = r.regionKey.trim().toLowerCase();
      const rLabel = r.regionLabel.trim().toLowerCase();
      return rKey === cleanScope || labelToSlug(rLabel) === cleanScope || rLabel === cleanScope;
    });

    if (matchedSummaryRegion) {
      const targetLabel = matchedSummaryRegion.regionLabel.trim().toLowerCase();
      const targetKey = matchedSummaryRegion.regionKey.trim().toLowerCase();
      if (
        cleanLabel === targetLabel ||
        labelToSlug(cleanLabel) === labelToSlug(targetLabel) ||
        cleanLabel === targetKey ||
        labelToSlug(cleanLabel) === labelToSlug(targetKey)
      ) {
        return true;
      }
    }
  }

  // 2. Check slug match
  if (labelToSlug(cleanLabel) === cleanScope || labelToSlug(cleanLabel) === labelToSlug(cleanScope)) {
    return true;
  }

  // 3. Check direction / word prefix match (e.g. scope="north" matching "North Bangalore" or "North Udupi")
  const expandedDirection = DIRECTION_ABBR_MAP[cleanScope] || cleanScope;
  if (DIRECTION_WORDS.includes(expandedDirection as (typeof DIRECTION_WORDS)[number])) {
    if (
      cleanLabel === expandedDirection ||
      cleanLabel.startsWith(`${expandedDirection} `) ||
      cleanLabel.endsWith(` ${expandedDirection}`) ||
      cleanLabel.includes(` ${expandedDirection} `)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves a display label (e.g. "North Bangalore" or "Airport Belt") back to a URL `scope` key
 * (e.g. "north" or "airport-belt"). Used when navigating from breadcrumbs or deep links where
 * only `region_label` is known.
 *
 * @param regionLabel - The display label from `group.region_label`
 * @param summaryRegions - Optional list of regions returned by `/api/discover/summary`
 */
export function resolveScopeKeyFromLabel(
  regionLabel: string | null | undefined,
  summaryRegions?: SummaryRegionRef[],
): string | null {
  if (!regionLabel) {
    return null;
  }

  const cleanLabel = regionLabel.trim().toLowerCase();
  if (cleanLabel.length === 0) {
    return null;
  }

  // 1. Check summaryRegions
  if (summaryRegions && summaryRegions.length > 0) {
    const matched = summaryRegions.find((r) => {
      const rLabel = r.regionLabel.trim().toLowerCase();
      return rLabel === cleanLabel || labelToSlug(rLabel) === labelToSlug(cleanLabel);
    });
    if (matched) {
      return matched.regionKey;
    }
  }

  // 2. Check standard directional prefixes
  for (const word of DIRECTION_WORDS) {
    if (cleanLabel === word || cleanLabel.startsWith(`${word} `) || cleanLabel.endsWith(` ${word}`)) {
      return word;
    }
  }

  // 3. Fallback to slug
  return labelToSlug(cleanLabel);
}

/**
 * Aggregates backend summary regions (which may be zones/corridors in 4-level cities
 * like Bangalore) into macro-regions (e.g. North Bangalore, East Bangalore) using
 * each area group's `region_label`.
 *
 * In 3-level cities (like Udupi) where `region_label` is empty or matches the group name,
 * or where groups already represent the top-level regions, this preserves them cleanly
 * while ensuring consistent formatting.
 */
export function aggregateMacroRegions(
  summaryRegions: DiscoverSummaryRegion[] | undefined | null,
  areaGroups: AreaGroup[] | undefined | null,
  totalActiveListings?: number,
): DiscoverSummaryRegion[] {
  if (!summaryRegions || summaryRegions.length === 0) return [];
  if (!areaGroups || areaGroups.length === 0) return summaryRegions;

  const map = new Map<string, DiscoverSummaryRegion>();

  for (const r of summaryRegions) {
    const cleanKey = r.regionKey.trim().toLowerCase();
    const cleanLabel = r.regionLabel.trim().toLowerCase();

    const matchedGroup = areaGroups.find(
      (g) =>
        g.id.toLowerCase() === cleanKey ||
        labelToSlug(g.name) === cleanKey ||
        g.name.trim().toLowerCase() === cleanLabel
    );

    const macroLabel = getGroupMacroRegionLabel(matchedGroup ?? {});
    let targetLabel = r.regionLabel;
    let targetKey = r.regionKey;

    if (macroLabel !== FALLBACK_REGION_LABEL && macroLabel.toLowerCase() !== cleanLabel) {
      targetLabel = macroLabel;
      const resolvedKey = resolveScopeKeyFromLabel(macroLabel, summaryRegions);
      targetKey = resolvedKey ? resolvedKey : labelToSlug(macroLabel);
    }

    const existing = map.get(targetKey);
    if (existing) {
      existing.listingCount += r.listingCount;
    } else {
      map.set(targetKey, {
        regionKey: targetKey,
        regionLabel: targetLabel,
        listingCount: r.listingCount,
      });
    }
  }

  const mappedSum = Array.from(map.values()).reduce((sum, r) => sum + (r.listingCount || 0), 0);
  if (typeof totalActiveListings === 'number' && totalActiveListings > mappedSum) {
    const unmappedCount = totalActiveListings - mappedSum;
    let citySuffix = '';
    if (areaGroups && areaGroups.length > 0) {
      const label = areaGroups[0]?.region_label || '';
      if (label.includes('Bangalore')) citySuffix = ' Bangalore';
      else if (label.includes('Udupi')) citySuffix = ' Udupi';
    }
    const unmappedLabel = citySuffix ? `Other${citySuffix}` : 'Other Areas (Unmapped)';
    map.set('other', {
      regionKey: 'other',
      regionLabel: unmappedLabel,
      listingCount: unmappedCount,
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.listingCount !== a.listingCount) {
      return b.listingCount - a.listingCount;
    }
    return a.regionLabel.localeCompare(b.regionLabel);
  });
}

