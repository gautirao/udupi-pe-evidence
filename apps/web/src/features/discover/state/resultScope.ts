/**
 * ResultScope — Issue #2016.
 *
 * The single canonical geography that controls which listings/markers/totals
 * are shown on Discover, strictly separate from navigation (`node=`) and from
 * PropertyFilters. Exactly one of AREA_SET / POLYGON / VIEWPORT may be active
 * at a time — enforced STRUCTURALLY by this being ONE discriminated-union
 * field, never independent per-kind flags (see
 * .claude/handoffs/issue-2016/004-plan-review-request.toml [decisions],
 * "structural impossibility of AREA_SET/POLYGON overlap"). A caller cannot
 * construct "both active" — the type system makes it unrepresentable.
 *
 * VIEWPORT ships INERT in this PR — #2015 wires the "Search this area" CTA
 * that actually commits it from a user action. Its type + fingerprint + URL
 * round-trip must still be correct today so #2015 can consume it with zero
 * further #2016 changes.
 */
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverMarkerScope } from '@/features/discover/selectors/markerScope';

export type ResultScope =
  | { kind: 'AREA_SET'; areaKeys: string[] }
  | { kind: 'POLYGON'; coordinates: [number, number][] }
  | { kind: 'VIEWPORT'; bounds: { s: number; w: number; n: number; e: number } }
  | null;

/**
 * The committed scope plus the scope it replaced. `previous` backs J3.5's
 * "Return to selected areas" — the prior scope is restored BY NAME from this
 * field, never re-derived from the current camera/viewport.
 */
export interface CommittedResultScope {
  active: ResultScope;
  previous: ResultScope;
}

function sortedEntries(obj: Record<string, unknown>): [string, unknown][] {
  return Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => [k, obj[k]] as [string, unknown]);
}

/**
 * Canonical, order-independent stringify: object keys are sorted so key
 * insertion order never affects the output; arrays are kept in their given
 * order (callers that want an order-independent array, e.g. areaKeys, must
 * pre-sort it themselves — see `scopeKeyPayload` below).
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === 'object') {
    const entries = sortedEntries(value as Record<string, unknown>);
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Order-independent payload per scope kind — the `kind` discriminant is always part of it, so AREA_SET/POLYGON/VIEWPORT with otherwise-identical filters never collide. */
function scopeKeyPayload(scope: ResultScope): unknown {
  if (scope === null) return null;
  switch (scope.kind) {
    case 'AREA_SET':
      return { kind: scope.kind, areaKeys: [...scope.areaKeys].sort() };
    case 'POLYGON':
      return { kind: scope.kind, coordinates: scope.coordinates };
    case 'VIEWPORT':
      return { kind: scope.kind, bounds: scope.bounds };
    default:
      return null;
  }
}

/**
 * Deterministic identity for (scope, filters, listingPurpose). Same inputs
 * always produce the same string; different scope/filters/listingPurpose
 * (including just a different `kind` with otherwise-identical filters) never
 * collide in any realistic case.
 *
 * `filters.polygon` is deliberately excluded from the filters payload — the
 * polygon coordinates already live in `scope` when POLYGON is active, and a
 * legacy/bridge PropertyFilters.polygon value must never make two otherwise-
 * identical requests fingerprint differently.
 *
 * Threaded through useDiscoverListings/useDiscoverFilteredMarkers as the
 * `scopeFingerprint` request param AND as part of each hook's TanStack Query
 * cache key. The server echoes the fingerprint back unchanged, but the
 * actual staleness guard is query-key isolation, not a runtime "detect and
 * discard" check on the echoed value: a request for a since-superseded scope
 * carries a different fingerprint, so its response lands in ITS OWN cache
 * entry, keyed on that fingerprint — a component subscribed to the CURRENT
 * scope's key never observes a stale scope's response, because it was never
 * written to that key's cache entry in the first place.
 */
export function computeScopeFingerprint(
  scope: ResultScope,
  filters: PropertyFilters,
  listingPurpose: string | undefined,
): string {
  const { polygon: _polygon, ...rest } = filters;
  return stableStringify({
    scope: scopeKeyPayload(scope),
    filters: rest,
    listingPurpose: listingPurpose ?? null,
  });
}

/**
 * Adapts the AREA_SET half of ResultScope to the existing
 * DiscoverMarkerScope's `{kind:'areas', areaKeys}` shape (markerScope.ts).
 *
 * POLYGON/VIEWPORT do NOT map through DiscoverMarkerScope — per the approved
 * decision it stays a pure navigation-resolution view (city/node/areas/
 * unresolved). A committed POLYGON/VIEWPORT scope instead switches the query
 * itself (a `polygon=`/`viewportScope=` request param), rather than flowing
 * through markerScope.
 */
export function resultScopeToMarkerScope(
  scope: ResultScope,
): Extract<DiscoverMarkerScope, { kind: 'areas' }> | null {
  if (scope == null || scope.kind !== 'AREA_SET') return null;
  return { kind: 'areas', areaKeys: scope.areaKeys };
}
