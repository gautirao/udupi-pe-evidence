import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

/**
 * Issue #2729 (R1/R5 fix) — the ONE joined-name computation for a committed multi-area AREA_SET,
 * shared by every caller that needs to describe the set as a single string (currently
 * `CompactResultsHeader` and `AreaSelectedPanel`'s canonical-scope-label broadcast — see
 * `DiscoverShellContextValue.canonicalScopeLabel`). Extracted so the Results title and the global
 * search's idle value can never independently drift on HOW they join names, even though each
 * still self-sources its own `useDiscoverAreas` call (same cache key, so never a second request —
 * see `AreaSetTwoTileRow`'s doc comment for the established "why this costs nothing" proof this
 * mirrors).
 *
 * Falls back to "{n} areas" when the areas list hasn't resolved every key yet (matches
 * `AreaSetSelectedHeader`'s own pre-existing fallback for the identical case).
 */
export function resolveAreaSetTitle(areaKeys: string[], areas: DiscoverArea[]): string {
  const byKey = new Map(areas.map((a) => [a.areaKey, a.name]));
  const names = areaKeys.map((key) => byKey.get(key)).filter((n): n is string => Boolean(n));
  return names.length === areaKeys.length ? names.join(' · ') : `${areaKeys.length} areas`;
}
