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
 * `selectedArea` always wins when both are non-null; per the two sources'
 * own invariants (nodeAreaPoint.ts's module doc, the call site in
 * MapDiscovery.tsx) they are mutually exclusive in practice — the legacy
 * areaKey-driven journeys never populate `nav.node`, and the canonical node
 * journey never populates `nav.areaKey` — so the precedence is a defensive
 * default only, not a meaningful behavioural choice.
 */
export function resolveEffectiveSelectedArea(
  selectedArea: AreaPoint | null | undefined,
  nodeAreaPoint: AreaPoint | null | undefined,
): AreaPoint | null {
  return selectedArea ?? nodeAreaPoint ?? null;
}
