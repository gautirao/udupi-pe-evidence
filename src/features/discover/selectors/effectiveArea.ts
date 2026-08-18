import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

/**
 * Issue #2083 (code-review Finding 1) — the exact "bridge" expression that
 * folds the legacy areaKey-driven `selectedArea` and the canonical
 * node-journey's `nodeAreaPoint` into a single value every
 * selectedArea-driven consumer (badge/count copy, area-scoped links,
 * area-scoped filters, map highlight) reads. Moved from MapDiscovery.tsx
 * (issue #2142) unchanged — see MapDiscovery.issue2083.badgeBridge.test.ts
 * for the original regression proof, now import-path-repointed here.
 *
 * `selectedArea` always wins when both are non-null. `nodeAreaPoint` is
 * non-null only while `showAreasNavigationJourney` is true AND the node
 * journey resolved to an AREA leaf (useDiscoverNavigationController.ts:115-118).
 * `showAreasNavigationJourney` is true for area-first, and ALSO for
 * school-first at the nav-node root (`journey === 'school-first' &&
 * !areaKey && !schoolId`, :75, :81) — so `nodeAreaPoint` CAN be non-null in
 * school-first, not just area-first.
 *
 * In agri-first, `nodeAreaPoint` is genuinely always null (agri-first
 * satisfies neither disjunct of `showAreasNavigationJourney`, :80-81), so
 * `selectedArea` is the sole live source of area identity there.
 *
 * In school-first, the two sources still don't collide, but not because
 * `nodeAreaPoint` is always null: `isSchoolsNavNodeLevel` requires
 * `!nav.areaKey` (:75), so the moment a legacy `areaKey` sets `selectedArea`
 * non-null, `isSchoolsNavNodeLevel` (and with it `nodeAreaPoint`) goes false
 * first. The interlock is what prevents the collision, not journey identity.
 *
 * In area-first, `showAreasNavigationJourney` is true regardless of
 * `areaKey`, so a URL carrying BOTH `node=` and a legacy `areaKey=` CAN make
 * both non-null simultaneously — this is the #2184 live repro that started
 * this investigation. The `selectedArea ??` precedence is not purely
 * theoretical: it genuinely resolves that dual-identity URL case in favour
 * of the legacy value.
 *
 * Removing or inverting the `selectedArea ??` precedence would blank
 * `effectiveSelectedArea` for agri-first and flip the #2184 dual-identity
 * URL case, breaking every downstream consumer (badge/count copy,
 * area-scoped links, area-scoped filters, map highlight — see
 * useDiscoverPageStateController.ts:72).
 */
export function resolveEffectiveSelectedArea(
  selectedArea: AreaPoint | null | undefined,
  nodeAreaPoint: AreaPoint | null | undefined,
): AreaPoint | null {
  return selectedArea ?? nodeAreaPoint ?? null;
}
