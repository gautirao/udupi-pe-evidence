/**
 * resolveScope
 *
 * Issue #1910 (PR2) — pure, framework-free classification of a raw
 * `urlState.scope` string into the kind of thing it actually identifies:
 * a macro region, an area group, an area, or none of the above.
 *
 * This module does NOT change how `urlState.scope` itself is stored,
 * written, or structurally validated — that remains a plain
 * `string | null`, gated by `isValidScope`/`SCOPE_SLUG_PATTERN` in
 * `src/hooks/discoverUrlNormalize.ts`, which this module does not touch.
 * `resolveScope` is a SEPARATE, derived, data-aware classification layer
 * that call sites use to decide how to *interpret* an already-valid scope
 * value once the real region/group/area namespaces for the current city are
 * known (region_key set, group slug set, optionally an area_key set) — e.g.
 * "is this scope a region, so I should use the region-scoped groups
 * projection, or is it a specific group, so I should show that group's
 * areas directly".
 *
 * Mirrors the framework-free, unit-testable style of discoverUrlNormalize.ts
 * (no React, no history side effects, never throws).
 */

export type ResolvedScope =
  | { kind: 'region'; regionKey: string }
  | { kind: 'group'; groupSlug: string }
  | { kind: 'area'; areaKey: string }
  | { kind: 'none' };

/**
 * The fixed, backend-defined region_key vocabulary — mirrors
 * `CityRegionProjection.FULL_CANONICAL_ORDER` in
 * apps/api/.../discover/CityRegionProjection.java byte-for-byte (CENTRAL, then
 * the 4 cardinals, then the 4 diagonals). This is a structural constant of
 * the region model itself, NOT derived from any city's live data — a city
 * using a narrower region_model (e.g. CENTRAL_CARDINAL_4, which never
 * materializes NE/SE/SW/NW) simply never returns groups for the keys it
 * doesn't use; the projection endpoint answers with an honest empty list
 * (200, never 404) rather than resolveScope needing to know which subset
 * applies per city.
 *
 * Review fix (#1910 PR2, canonical region aliases) — always unioned into the
 * accepted region-key namespace, INDEPENDENT of whatever `ns.regionKeys` the
 * caller supplies. This closes two related bugs:
 *  1. A canonical key (e.g. `scope=CENTRAL`) was only recognized as a region
 *     when the city's region-summary fetch had already succeeded and
 *     populated `ns.regionKeys` — a failed/slow summary fetch silently
 *     turned a perfectly valid deep link into `kind:'none'`.
 *  2. `ns.regionKeys` is caller-supplied real backend region keys (uppercase,
 *     e.g. `'N'`), so a legacy human-readable link like `scope=north` never
 *     matched it — see REGION_KEY_ALIASES below for that half of the fix.
 */
export const CANONICAL_REGION_KEYS = [
  'CENTRAL', 'N', 'E', 'S', 'W', 'NE', 'SE', 'SW', 'NW',
] as const;

export const CANONICAL_REGION_KEY_SET: ReadonlySet<string> = new Set(CANONICAL_REGION_KEYS);

/**
 * Legacy/human-readable region-name aliases → canonical backend region_key.
 * These are the same 5 tokens `discoverUrlNormalize.VALID_SCOPES` has always
 * accepted as STRUCTURALLY valid scope values, but until this fix nothing
 * ever mapped them to the real region_key a city's data is actually keyed by
 * — a deep link like `?scope=north` passed `isValidScope` yet resolved to
 * `kind:'none'` once classified against real (uppercase) region keys.
 */
export const REGION_KEY_ALIASES: ReadonlyMap<string, string> = new Map([
  ['north', 'N'],
  ['east', 'E'],
  ['south', 'S'],
  ['west', 'W'],
  ['central', 'CENTRAL'],
  ['northeast', 'NE'],
  ['southeast', 'SE'],
  ['southwest', 'SW'],
  ['northwest', 'NW'],
  // Issue #1915 — legacy hyphenated diagonal forms (e.g. `?scope=north-east`)
  // pass isValidScope's SCOPE_SLUG_PATTERN (kebab-case, 2+ segments) but had
  // no entry here, so they silently resolved to kind:'none' instead of the
  // correct diagonal region. Same canonical targets as their non-hyphenated
  // counterparts above.
  ['north-east', 'NE'],
  ['south-east', 'SE'],
  ['south-west', 'SW'],
  ['north-west', 'NW'],
  // Issue #1915 — legacy lowercase abbreviations. These also require a
  // corresponding isValidScope allowance in discoverUrlNormalize.ts (they
  // don't match SCOPE_SLUG_PATTERN, which requires a hyphen), otherwise they
  // never reach this map.
  ['ne', 'NE'],
  ['nw', 'NW'],
  ['se', 'SE'],
  ['sw', 'SW'],
]);

export interface ScopeNamespaces {
  regionKeys: ReadonlySet<string>;
  groupSlugs: ReadonlySet<string>;
  areaKeys?: ReadonlySet<string>;
  /**
   * Issue #1910 (PR2 fix-up) — optional alias → canonical `groupSlugs` member
   * lookup, restoring the name/label-based fallback that the pre-#1910 ad-hoc
   * OR-match had (`g.name.toLowerCase() === activeScope.toLowerCase()` and
   * `labelToSlug(g.name) === activeScope`) and that plain `groupSlugs`
   * membership does NOT reproduce: a group's `id` (its DB `slug`) is seed
   * data, not something derived at read time from `name` — e.g.
   * `('kr-puram-belt', 'K R Puram Belt', ...)` in
   * V106__seed_bangalore_macro_region_mapping.sql has
   * `labelToSlug('K R Puram Belt') === 'k-r-puram-belt' !== 'kr-puram-belt'`.
   * Callers should populate this with, for every group, its
   * `labelToSlug(name)` and `name.toLowerCase()` each mapped to the group's
   * real `id`, so a legacy/malformed scope value that matches one of those
   * still resolves to the SAME canonical group as before the #1910 migration
   * (never to an alias string a caller wouldn't recognize as `g.id`).
   */
  groupNameSlugs?: ReadonlyMap<string, string>;
}

/**
 * Classifies `rawScope` against the supplied namespaces.
 *
 * Classification order: canonical/aliased region keys are checked FIRST,
 * then group slugs (+ group-name aliases), then area keys, else `none`.
 *
 * This region-first order is a deterministic tie-break kept for
 * defensiveness — a single raw scope value should never legitimately match
 * both a region key and a group slug for the same city, since the backend
 * enforces region-key/group-slug disjointness for BOTH namespaces:
 * `CityRegionOnboardingService.apply()` rejects a region key that collides
 * with any existing area-group slug at onboarding time, AND (#1910 PR2
 * review follow-up) `fn_reject_area_group_region_key_collision`/
 * `fn_reject_city_region_area_group_collision` (V119 migration) enforce the
 * same disjointness as a database trigger on every future write to either
 * table, not just the onboarding code path. This function still defines a
 * deterministic order in case that invariant is ever violated by bad data
 * predating V119, rather than relying on caller iteration order.
 */
export function resolveScope(
  rawScope: string | null | undefined,
  ns: ScopeNamespaces,
): ResolvedScope {
  if (rawScope == null || rawScope.length === 0) {
    return { kind: 'none' };
  }

  // Review fix (#1910 PR2) — canonical region keys are recognized regardless
  // of what `ns.regionKeys` the caller supplies (see CANONICAL_REGION_KEY_SET
  // JSDoc): a real backend region_key must resolve to `kind:'region'` even
  // when the city's region-summary fetch is still loading, has failed, or
  // simply hasn't populated `ns.regionKeys` yet.
  if (ns.regionKeys.has(rawScope) || CANONICAL_REGION_KEY_SET.has(rawScope)) {
    return { kind: 'region', regionKey: rawScope };
  }

  // Review fix (#1910 PR2) — legacy human-readable aliases (`north`, `east`,
  // ...) resolve to their canonical backend key, never to the raw alias
  // string, so downstream `region_key === resolved.regionKey` comparisons
  // (region-scoped projection fetch, map/camera bounds) keep working.
  const canonicalRegionKey = REGION_KEY_ALIASES.get(rawScope.toLowerCase());
  if (canonicalRegionKey != null) {
    return { kind: 'region', regionKey: canonicalRegionKey };
  }

  if (ns.groupSlugs.has(rawScope)) {
    return { kind: 'group', groupSlug: rawScope };
  }

  // Issue #1910 (PR2 fix-up) — name/label-derived alias fallback (see
  // ScopeNamespaces.groupNameSlugs JSDoc). Resolves to the ALIAS TARGET
  // (canonical group id), never to the raw alias string, so downstream
  // `groups.find(g => g.id === resolved.groupSlug)` lookups keep working.
  const aliasedGroupId = ns.groupNameSlugs?.get(rawScope);
  if (aliasedGroupId != null) {
    return { kind: 'group', groupSlug: aliasedGroupId };
  }

  if (ns.areaKeys?.has(rawScope)) {
    return { kind: 'area', areaKey: rawScope };
  }

  return { kind: 'none' };
}
