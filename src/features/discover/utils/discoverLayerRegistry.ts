/**
 * discoverLayerRegistry
 *
 * Issue #1745 slice P1 — layer-registry FAÇADE. Slice P2 wires this module in as
 * the canonical entry point (see `MapDiscovery.tsx`, which now calls
 * `computeDiscoverLayer(toLayerInput(urlState))` instead of calling
 * `derivePanelContent` directly) and introduces the residential `scope` axis
 * (`DiscoverUrlState.scope` → `DiscoverLayerScope.region`). `scope` is orthogonal
 * to the agri-only `region`/`maxKm` corridor model and is not yet read by
 * `derivePanelContent` — it flows through the façade unused, ready for a future
 * slice to consult it.
 *
 * P2 also RECONCILES `applyCityChangeReset` and `clearRegionScopeForAgri` (see
 * their docstrings below) to mirror the real `useDiscoverUrlState.changeCity` /
 * `clearRegionAndMaxKm` behaviour exactly, and adds `PANEL_DERIVATION_FIELDS` — a
 * typed + runtime-enforced structural guard asserting this module's selection
 * surface covers exactly the fields `derivePanelContent` reads (see the
 * Proxy-based access-guard test in `discoverLayerRegistry.test.ts`).
 *
 * `computeDiscoverLayer` DELEGATES to `derivePanelContent` (discoverPanelState.ts)
 * rather than re-implementing its branch logic. Parity between the two is true
 * BY CONSTRUCTION — this file must never grow its own copy of the
 * journey/precedence rules. See the parity-matrix test in
 * `src/utils/__tests__/discoverLayerRegistry.test.ts`, which also asserts (via a
 * spy) that `computeDiscoverLayer` actually calls `derivePanelContent`, so any
 * future re-implementation attempt fails the suite.
 *
 * Pre-existing note: the `DiscoverPanelContent` union (discoverPanelState.ts)
 * contains two enumerands — `agri-detail` and `area-selection` — that
 * `derivePanelContent` never routes to. They are unreachable dead states in the
 * existing union (not introduced or fixed here; discoverPanelState.ts is out of
 * scope for P1). This module does not attempt to construct fixtures that
 * produce them.
 *
 * Pure module: no React, no hooks, no side effects, nothing runs at import time.
 */

import type { DiscoverPanelContent } from './discoverPanelState';
import { derivePanelContent } from './discoverPanelState';
import type { DiscoverJourney, DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { AreaGroup } from '@/hooks/useAreaGroups';

/**
 * Resolves an active group from areaGroupsData by checking ID, exact slugified name, or exact name.
 * Handles exact matching for deep links carrying either ID or name slugs.
 */
export function resolveActiveDiscoverGroup(
  groups: AreaGroup[] | undefined | null,
  groupId: string | null | undefined,
): AreaGroup | null {
  if (!groups || !groupId?.trim()) return null;
  const target = groupId.trim().toLowerCase();
  const slugifiedTarget = target.replace(/\s+/g, '-');
  return (
    groups.find(
      (g) =>
        g.id.toLowerCase() === target ||
        g.name.toLowerCase() === target ||
        g.name.toLowerCase().replace(/\s+/g, '-') === slugifiedTarget ||
        g.id.toLowerCase().replace(/\s+/g, '-') === slugifiedTarget,
    ) ?? null
  );
}

/**
 * Resolves an active group given an areaKey, falling back to matching groups that contain that areaKey.
 * Guarantees state/breadcrumb/map consistency when areaKey is active even if groupId is omitted from deep-link.
 */
export function resolveDiscoverGroupForAreaKey(
  groups: AreaGroup[] | undefined | null,
  groupId: string | null | undefined,
  areaKey: string | null | undefined,
): AreaGroup | null {
  if (!groups) return null;
  const direct = resolveActiveDiscoverGroup(groups, groupId);
  if (direct) return direct;
  if (!areaKey?.trim()) return null;
  const targetKey = areaKey.trim();
  return groups.find((g) => g.area_keys.includes(targetKey)) ?? null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Straight alias of the existing 16-value `DiscoverPanelContent` union. No
 * collapse, no renaming of values — P1 is deliberately boring.
 */
export type DiscoverLayer = DiscoverPanelContent;

/**
 * Cross-region scope. `region` was ALWAYS `null` in P1 (no source existed yet).
 * As of P2, `region` is populated from `DiscoverUrlState.scope` (Issue #1745 P2's
 * new residential scope axis — "north"|"south"|"east"|"west"|"central"), NOT from
 * the agri-only `region`/`maxKm` corridor param. `derivePanelContent` does not read
 * this field (it has no scope concept), so it does not affect the derived layer.
 */
export interface DiscoverLayerScope {
  region: string | null;
}

/**
 * Mirrors the exact fields `derivePanelContent` reads off `DiscoverUrlState`
 * (journey is hoisted out to `DiscoverLayerInput.journey`; everything else
 * that participates in panel-state derivation lives here).
 */
export interface DiscoverLayerSelection {
  areaKey: string | null;
  schoolId: string | null;
  groupId: string | null;
  schoolPicking?: boolean;
  groupResults?: boolean;
  nodeListings?: boolean;
  /** @deprecated legacy selectedGroup — mirrors DiscoverUrlState.selectedGroup */
  selectedGroup: DiscoverUrlState['selectedGroup'];
  selectedRegion?: DiscoverUrlState['selectedRegion'];
  selectedMaxKm?: DiscoverUrlState['selectedMaxKm'];
  selectedListing?: string | null;
  selectedLocality?: string | null;
}

export interface DiscoverLayerInput {
  scope: DiscoverLayerScope;
  journey: DiscoverJourney | null;
  selection: DiscoverLayerSelection;
  /**
   * Issue #1956 PR-4 — CONTAINED leaf token. True when the resolved
   * `useAreasNavigationJourney` node is a canonical AREA leaf (see
   * `isResolvedAreaLeafNode` in `src/features/discover/navigation/
   * nodeAreaPoint.ts`) in the area-first journey. Read ONLY by
   * `selectDiscoverMapLayer` below — NEVER by `computeDiscoverLayer`, which
   * only ever destructures `.scope`/`.journey`/`.selection` off its own
   * freshly-reconstructed `DiscoverUrlState` (see that function's body) and
   * therefore cannot reach `derivePanelContent`,
   * `PANEL_DERIVATION_FIELDS`, the Proxy access-guard test, or the 75-cell
   * parity matrix, regardless of what this field is set to. `toLayerInput`
   * (the URL-state adapter used for the panel axis) never sets it, so it is
   * always `undefined` for every pre-existing caller.
   */
  nodeAreaLeaf?: boolean;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Pure adapter: DiscoverUrlState → DiscoverLayerInput. `scope.region` is sourced
 * from `urlState.scope` (Issue #1745 P2 residential scope axis); defaults to
 * `null` when absent (matches `DiscoverUrlState.scope`'s optional-with-null
 * convention).
 */
export function toLayerInput(urlState: DiscoverUrlState): DiscoverLayerInput {
  return {
    scope: { region: urlState.scope ?? null },
    journey: urlState.journey,
    selection: {
      areaKey: urlState.areaKey,
      schoolId: urlState.schoolId,
      groupId: urlState.groupId,
      schoolPicking: urlState.schoolPicking,
      groupResults: urlState.groupResults,
      nodeListings: urlState.nodeListings,
      selectedGroup: urlState.selectedGroup,
      selectedRegion: urlState.selectedRegion,
      selectedMaxKm: urlState.selectedMaxKm,
      selectedListing: urlState.selectedListing,
      selectedLocality: urlState.selectedLocality,
    },
  };
}

// ─── URL param mapping (Issue #1745 P3) ─────────────────────────────────────
//
// Single source of truth for the URL param name backing each of the 12 layer
// fields (11 `DiscoverLayerSelection` fields + `scope.region`). Mirrors the
// literal param names `useDiscoverUrlState.ts` reads/writes for these fields
// (see its module docstring). `selectedGroup` maps to the LEGACY `group`
// param — NOT `groupId` (that's a separate, non-legacy param for a different
// field). Pure data — no React, no side effects.

/** Layer field → URL param name. Every value is a distinct param name. */
export const LAYER_PARAM = {
  journey: 'journey',
  areaKey: 'areaKey',
  schoolId: 'schoolId',
  groupId: 'groupId',
  schoolPicking: 'schoolPicking',
  groupResults: 'groupResults',
  nodeListings: 'nodeListings',
  selectedGroup: 'group',
  selectedRegion: 'region',
  selectedMaxKm: 'maxKm',
  selectedListing: 'listing',
  selectedLocality: 'locality',
  scopeRegion: 'scope',
} as const;

/**
 * Pure adapter: URLSearchParams → DiscoverLayerInput. Reads each of the 12
 * layer params RAW off `params` — presence-based, no defaulting. Deliberately
 * does NOT apply the `VALID_DIRECTIONS`/`VALID_SCOPES`/`VALID_MAX_KM`/
 * `DEFAULT_MAX_KM` normalization `useDiscoverUrlState` applies when building
 * its own `DiscoverUrlState` — the pure reducers this feeds
 * (`applyCityChangeReset`, `clearRegionScopeForAgri`) only ever test a
 * field's null-ness to decide whether `applyLayerSelectionToParams` should
 * delete the corresponding param; they never inspect the parsed value. Every
 * one of the 12 fields is always populated (never left `undefined` by
 * omission), so `applyLayerSelectionToParams` never mistakes "not read" for
 * "preserve".
 */
export function paramsToLayerInput(params: URLSearchParams): DiscoverLayerInput {
  const rawGroup = params.get(LAYER_PARAM.selectedGroup);
  const groupParts = rawGroup ? rawGroup.split(':') : null;
  const selectedGroup: DiscoverUrlState['selectedGroup'] =
    groupParts && groupParts.length === 2
      ? { directionKey: groupParts[0], distanceBandKey: groupParts[1] }
      : null;

  const rawMaxKm = params.get(LAYER_PARAM.selectedMaxKm);
  // Cast: raw parse only, not validated against VALID_MAX_KM (see docstring
  // above) — safe because downstream reducers only test null vs non-null.
  const selectedMaxKm = (
    rawMaxKm ? parseInt(rawMaxKm, 10) : null
  ) as DiscoverUrlState['selectedMaxKm'];

  return {
    scope: { region: params.get(LAYER_PARAM.scopeRegion) },
    // Cast: raw string, not validated against the DiscoverJourney union (see
    // docstring above) — safe for the same null-vs-non-null reason.
    journey: params.get(LAYER_PARAM.journey) as DiscoverJourney | null,
    selection: {
      areaKey: params.get(LAYER_PARAM.areaKey),
      schoolId: params.get(LAYER_PARAM.schoolId),
      groupId: params.get(LAYER_PARAM.groupId),
      schoolPicking: params.get(LAYER_PARAM.schoolPicking) === '1' ? true : undefined,
      groupResults: params.get(LAYER_PARAM.groupResults) === '1' ? true : undefined,
      nodeListings: params.get(LAYER_PARAM.nodeListings) === '1' ? true : undefined,
      selectedGroup,
      // Cast: raw string, not validated against VALID_DIRECTIONS (see
      // docstring above) — safe for the same null-vs-non-null reason.
      selectedRegion: params.get(LAYER_PARAM.selectedRegion) as DiscoverUrlState['selectedRegion'],
      selectedMaxKm,
      selectedListing: params.get(LAYER_PARAM.selectedListing),
      selectedLocality: params.get(LAYER_PARAM.selectedLocality) || params.get('town'),
    },
  };
}

/**
 * Pure adapter: DiscoverLayerInput → URLSearchParams, DELETE-ONLY. For each of
 * the 12 `LAYER_PARAM` entries: if the field's value on `layer` is
 * null/undefined, deletes the param; if defined, leaves the existing param on
 * `params` untouched (byte-for-byte — never re-set/re-encoded). Mutates and
 * returns `params`. Touches ONLY the 12 `LAYER_PARAM` names — never
 * city/intent/filters/lat/lon/zoom/radiusKm/q.
 */
export function applyLayerSelectionToParams(
  params: URLSearchParams,
  layer: DiscoverLayerInput,
): URLSearchParams {
  const layerValues: Record<string, unknown> = {
    [LAYER_PARAM.journey]: layer.journey,
    [LAYER_PARAM.areaKey]: layer.selection.areaKey,
    [LAYER_PARAM.schoolId]: layer.selection.schoolId,
    [LAYER_PARAM.groupId]: layer.selection.groupId,
    [LAYER_PARAM.schoolPicking]: layer.selection.schoolPicking,
    [LAYER_PARAM.groupResults]: layer.selection.groupResults,
    [LAYER_PARAM.selectedGroup]: layer.selection.selectedGroup,
    [LAYER_PARAM.selectedRegion]: layer.selection.selectedRegion,
    [LAYER_PARAM.selectedMaxKm]: layer.selection.selectedMaxKm,
    [LAYER_PARAM.selectedListing]: layer.selection.selectedListing,
    [LAYER_PARAM.selectedLocality]: layer.selection.selectedLocality,
    [LAYER_PARAM.scopeRegion]: layer.scope.region,
  };
  for (const paramName of Object.values(LAYER_PARAM)) {
    if (layerValues[paramName] == null) {
      params.delete(paramName);
      if (paramName === LAYER_PARAM.selectedLocality) {
        params.delete('town');
      }
    }
  }
  return params;
}

// ─── Canonical layer entry point ────────────────────────────────────────────

/**
 * Canonical layer entry point. DELEGATES to `derivePanelContent` — it
 * reconstructs a `DiscoverUrlState`-shaped object from `input` and returns
 * whatever `derivePanelContent` decides. It must never re-implement the
 * journey/precedence branch logic itself.
 *
 * Only the fields `derivePanelContent` actually reads (journey + the 10
 * selection fields) are meaningful in the reconstruction below; the remaining
 * `DiscoverUrlState` fields (city, viewport, filters, radiusKm, q, intent) are
 * structurally required by that type but are never inspected by
 * `derivePanelContent`, so fixed placeholder values are safe and do not affect
 * the returned layer.
 *
 * `input.scope.region` is threaded into the reconstruction below (as
 * `DiscoverUrlState.scope`) and is read by `derivePanelContent` (as part of
 * `PANEL_DERIVATION_FIELDS`) to route macro-region drill-down to `'area-groups-landing'`.
 */
export function computeDiscoverLayer(input: DiscoverLayerInput): DiscoverLayer {
  const reconstructed: DiscoverUrlState = {
    city: '',
    areaKey: input.selection.areaKey,
    viewport: null,
    filters: {},
    schoolId: input.selection.schoolId,
    radiusKm: null,
    q: '',
    journey: input.journey,
    groupId: input.selection.groupId,
    schoolPicking: input.selection.schoolPicking,
    groupResults: input.selection.groupResults,
    nodeListings: input.selection.nodeListings,
    selectedGroup: input.selection.selectedGroup,
    selectedRegion: input.selection.selectedRegion,
    selectedMaxKm: input.selection.selectedMaxKm,
    selectedListing: input.selection.selectedListing,
    selectedLocality: input.selection.selectedLocality,
    intent: 'buy',
    scope: input.scope.region,
  };
  return derivePanelContent(reconstructed);
}

// ─── Map-layer axis (Issue #1745 Batch B — map-hierarchy fix) ───────────────
//
// THE BUG this section fixes: at the journeyless city landing (no journey,
// scope=null) MapDiscovery.tsx's `overviewAreas` fell through to `liveAreas`
// (every area with listingCount > 0 — ~100 individual pills) instead of the
// ~4-8 macro-region bubbles the right-panel summary shows. Root cause: the
// existing group-bubble derivation was gated on a journey being active
// (`isTopGroupedAreaOrSchool`); the public journeyless landing never set it.
//
// `selectDiscoverMapLayer` is the single identifiable rule deciding WHICH
// family of map markers applies for a given URL state + a coarse zoom bucket.
// It COMPOSES with `computeDiscoverLayer` (which delegates to
// `derivePanelContent`) for the panel axis — it must never re-implement
// journey/precedence routing itself. The ONLY new behaviour vs. the
// pre-existing scattered `isTopGroupedAreaOrSchool` / `isTopGroupedAgri` /
// `isLandingState` / `isAreaFirstCityLanding` booleans is: a journeyless
// landing (`computeDiscoverLayer` resolves to 'guided-entry') with no `scope`
// now resolves to `'macro-region-bubbles'` instead of falling through to the
// generic area/listing fallback; with a `scope` set it resolves to
// `'region-zone-areas'`. Every other row reproduces the pre-existing booleans'
// behaviour exactly — see the parity table in discoverLayerRegistry.test.ts.
//
// `zoomBucket` only ever collapses the OVERVIEW-bucket category to `'none'`
// when zoomed past the area-marker cutoff (mirrors MapDiscovery's pre-existing
// unconditional `mapZoom > AREA_LAYER_MAX_ZOOM` gate) — it does not otherwise
// change which category a given URL state maps to. Callers that need the
// zoom-INDEPENDENT category (e.g. to decide whether raw listing markers
// should stay suppressed even if the user manually zooms in on a grouped/
// landing state) should call this with `zoomBucket: 'overview'` explicitly.
//
// Data availability (has the area-groups query loaded yet? are there zero
// groups for this city?) is NOT a pure URL-state concern, so it is NOT
// decided here — MapDiscovery still applies its own loading/empty-groups
// fallback to the areas each returned kind implies. This function only
// decides the CATEGORY, never the underlying data.
export type DiscoverMapZoomBucket = 'overview' | 'detail';

export type DiscoverMapLayerKind =
  /** Area-first/school-first landing, no group/area/school yet (pre-existing). */
  | 'area-group-bubbles'
  /** NEW (Issue #1745 Batch B) — journeyless city landing, scope=null. */
  | 'macro-region-bubbles'
  /** NEW (Issue #1745 Batch B) — journeyless city landing, scope=<groupId>. */
  | 'region-zone-areas'
  /** Agri-first landing, no corridor/area/locality/group yet (pre-existing). */
  | 'agri-corridor-bubbles'
  /** Agri-first drill-down past the corridor landing (pre-existing — hides area markers entirely). */
  | 'agri-drilldown'
  /** Every other residential drill-down state (pre-existing — full discoverAreas set). */
  | 'all-areas'
  /** Zoomed in past the area-marker cutoff (pre-existing — hides area markers entirely). */
  | 'zoom-gated';

export function selectDiscoverMapLayer(
  input: DiscoverLayerInput,
  zoomBucket: DiscoverMapZoomBucket,
): DiscoverMapLayerKind {
  // Single top-level zoom gate — mirrors MapDiscovery's pre-existing unconditional
  // `mapZoom > AREA_LAYER_MAX_ZOOM` check, which always ran FIRST regardless of
  // journey/URL state. Callers that need the zoom-INDEPENDENT category (e.g. to
  // decide whether raw listing markers should stay suppressed even if the user
  // manually zooms in on a grouped/landing state) should pass `zoomBucket: 'overview'`
  // explicitly rather than relying on this function to ignore it.
  if (zoomBucket === 'detail') return 'zoom-gated';

  const { journey, selection, scope } = input;

  if (journey === 'agri-first') {
    // Mirrors MapDiscovery's pre-existing `isTopGroupedAgri` exactly.
    const isTopGroupedAgri =
      selection.selectedRegion == null &&
      !selection.areaKey &&
      selection.selectedLocality == null &&
      selection.selectedGroup == null;
    return isTopGroupedAgri ? 'agri-corridor-bubbles' : 'agri-drilldown';
  }

  // Mirrors MapDiscovery's pre-existing `isTopGroupedAreaOrSchool`, minus the
  // runtime `!selectedArea` / `!selectedSchool` checks — those are local UI-state
  // objects, not URL-state, and are redundant given `!areaKey` / `!schoolId` are
  // already required true (the same simplification `derivePanelContent`, the
  // authoritative panel-routing function this composes with, already relies on:
  // it never checks resolved-object state either, only the URL param).
  const isTopGroupedAreaOrSchool =
    (journey === 'area-first' || journey === 'school-first') &&
    !selection.groupId &&
    !selection.areaKey &&
    !selection.schoolId &&
    !selection.nodeListings;
  // Issue #1956 PR-4 — a resolved canonical AREA leaf (the `node=` journey)
  // must NOT collapse to the grouped-overview bubble category just because
  // the legacy `areaKey` URL param is absent (the node journey never writes
  // it — see team-lead-plan-pr4.toml [scope.three_areakeys]). Scoped
  // narrowly: `input.nodeAreaLeaf` is only ever set true by the caller for a
  // real AREA leaf in the area-first journey — never for Direction/Cluster
  // levels, and never for school-first (see nodeAreaPoint.ts /
  // markerPopoverEligibility.ts for the shared leaf-resolution contract).
  if (isTopGroupedAreaOrSchool && input.nodeAreaLeaf && journey === 'area-first') {
    return 'all-areas';
  }
  if (isTopGroupedAreaOrSchool) return 'area-group-bubbles';

  if (journey == null && (computeDiscoverLayer(input) === 'guided-entry' || computeDiscoverLayer(input) === 'area-groups-landing')) {
    if (!selection.groupId && !selection.areaKey) {
      return scope.region ? 'region-zone-areas' : 'macro-region-bubbles';
    }
  }

  return 'all-areas';
}

// ─── Pure guard reducers ─────────────────────────────────────────────────────
//
// These mirror the equivalent URL-mutation semantics in useDiscoverUrlState.ts
// but operate purely on DiscoverLayerInput (no URLSearchParams, no history,
// no side effects). Each returns a brand-new object; the input is never
// mutated.

/**
 * Mirrors `useDiscoverUrlState.changeCity` (Issue #910 atomic city switch) EXACTLY
 * — reconciled in Issue #1745 P2 against the real implementation (which deletes:
 * journey, groupId, groupResults, the legacy `group` param — which zeroes
 * `selectedGroup` — region, maxKm, locality, and areaKey; it does NOT delete
 * `schoolId`, `schoolPicking`, or `listing`/`selectedListing`).
 *
 * PRESERVED: `schoolId`, `schoolPicking`, AND `selectedListing` — the real
 * `changeCity` deletes none of these three params on city switch. (P1's version
 * of this reducer incorrectly cleared `schoolPicking` and `selectedListing`; P2
 * fixes that divergence.)
 *
 * CLEARED: journey, areaKey, groupId, groupResults, selectedGroup (legacy `group`
 * param is deleted, so the derived `selectedGroup` becomes null), selectedRegion,
 * selectedMaxKm, selectedLocality, and scope (Issue #1745 P2 — new residential
 * axis; real `changeCity` deletes `scope` on city switch, same as `region`/`maxKm`).
 *
 * intent and property filters live outside `DiscoverLayerInput`'s surface
 * entirely, so this module has nothing to do to "preserve" them — they are
 * simply not represented here.
 */
export function applyCityChangeReset(state: DiscoverLayerInput): DiscoverLayerInput {
  return {
    scope: { region: null },
    journey: null,
    selection: {
      areaKey: null,
      schoolId: state.selection.schoolId,
      groupId: null,
      schoolPicking: state.selection.schoolPicking,
      groupResults: undefined,
      selectedGroup: null,
      selectedRegion: null,
      selectedMaxKm: null,
      selectedListing: state.selection.selectedListing,
      selectedLocality: null,
    },
  };
}

/**
 * Mirrors `useDiscoverUrlState.startOver`: full reset to the neutral landing
 * layer input (journey null, all selection fields cleared, scope/region cleared —
 * the real `startOver` builds a brand-new URLSearchParams so `scope`, Issue #1745
 * P2's residential axis, is cleared by construction same as everything else).
 * Only `city` and `intent` survive `startOver` in the real hook — neither is part
 * of `DiscoverLayerInput`, so nothing needs to be threaded through here; the
 * returned shape is always the same fixed neutral value regardless of `state`.
 */
export function applyStartOverReset(state: DiscoverLayerInput): DiscoverLayerInput {
  void state; // intentionally unused — startOver ignores prior selection entirely
  return {
    scope: { region: null },
    journey: null,
    selection: {
      areaKey: null,
      schoolId: null,
      groupId: null,
      schoolPicking: undefined,
      groupResults: undefined,
      selectedGroup: null,
      selectedRegion: null,
      selectedMaxKm: null,
      selectedListing: null,
      selectedLocality: null,
    },
  };
}

/**
 * Mirrors `useDiscoverUrlState.clearRegionAndMaxKm` EXACTLY — reconciled in
 * Issue #1745 P2 against the real implementation, which deletes only `region`,
 * `maxKm`, and `listing`/`locality` (the four agri selection fields:
 * selectedRegion, selectedMaxKm, selectedListing, selectedLocality). It does NOT
 * touch `scope` — the real hook's `clearRegionAndMaxKm` never deletes the `scope`
 * URL param, because `scope` (Issue #1745 P2's residential axis) is orthogonal to
 * the agri-only region/maxKm corridor model. So `scope.region` is PRESERVED here
 * (P1's version incorrectly cleared it; P2 fixes that divergence).
 *
 * Everything else (journey, areaKey, groupId, schoolId, schoolPicking,
 * groupResults, legacy selectedGroup) is preserved unchanged, same as P1.
 *
 * A no-op when those fields are already null (returns an equivalent-value
 * object), and idempotent — calling it twice in a row yields the same result
 * as calling it once.
 */
export function clearRegionScopeForAgri(state: DiscoverLayerInput): DiscoverLayerInput {
  return {
    scope: state.scope,
    journey: state.journey,
    selection: {
      ...state.selection,
      selectedRegion: null,
      selectedMaxKm: null,
      selectedListing: null,
      selectedLocality: null,
    },
  };
}

// ─── Structural divergence guard ────────────────────────────────────────────
//
// PANEL_DERIVATION_FIELDS enumerates EXACTLY the fields `derivePanelContent`
// reads off `DiscoverUrlState` (see discoverPanelState.ts:60's destructure).
// `satisfies readonly (keyof DiscoverUrlState)[]` makes this a compile-time
// assertion: if a field is renamed/removed from `DiscoverUrlState`, this line
// fails to typecheck. It does NOT catch a *new* field being added to
// `derivePanelContent`'s destructure without updating this list — that is
// covered at runtime by the Proxy-based access-guard test in
// `discoverLayerRegistry.test.ts`, which throws if `derivePanelContent` reads
// any `DiscoverUrlState` property outside this list.
export const PANEL_DERIVATION_FIELDS = [
  'journey',
  'areaKey',
  'schoolId',
  'groupId',
  'schoolPicking',
  'groupResults',
  'selectedGroup',
  'selectedRegion',
  'selectedMaxKm',
  'selectedListing',
  'selectedLocality',
  'scope',
] as const satisfies readonly (keyof DiscoverUrlState)[];

export type PanelDerivationField = (typeof PANEL_DERIVATION_FIELDS)[number];

export type PanelDerivationInput = Pick<DiscoverUrlState, PanelDerivationField>;
