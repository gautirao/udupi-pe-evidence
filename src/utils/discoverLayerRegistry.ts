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
import type { DiscoverJourney, DiscoverUrlState } from '../hooks/useDiscoverUrlState';

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
}

/**
 * Validity sets used by `fallbackInvalidSelection` to drop selection ids that
 * no longer resolve to a real entity (e.g. after a dataset refresh). A field
 * left `undefined` means "no validity check for this id" (never drop it).
 */
export interface DiscoverLayerValiditySets {
  validAreaKeys?: Set<string>;
  validSchoolIds?: Set<string>;
  validGroupIds?: Set<string>;
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
      selectedGroup: urlState.selectedGroup,
      selectedRegion: urlState.selectedRegion,
      selectedMaxKm: urlState.selectedMaxKm,
      selectedListing: urlState.selectedListing,
      selectedLocality: urlState.selectedLocality,
    },
  };
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
 * `DiscoverUrlState.scope`) purely for structural completeness — it is still
 * unused BY `derivePanelContent` (it has no scope concept at all; scope is not
 * one of `PANEL_DERIVATION_FIELDS`), so it never affects the returned layer. A
 * future slice will extend `derivePanelContent`/this function when scope needs
 * to influence panel routing.
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

/**
 * Drops selection ids that are not present in the supplied validity sets,
 * falling back to the nearest valid level rather than throwing. For example,
 * an invalid `schoolId` is cleared while a still-valid `areaKey` is retained —
 * `computeDiscoverLayer` then naturally resolves to `schools-in-area` instead
 * of `school-selected`/`area-school-combined`, by construction of
 * `derivePanelContent`'s existing precedence rules (no special-casing needed
 * here).
 *
 * A validity set left `undefined` means "no check for this id" (id is never
 * dropped). NEVER throws — every check is a plain optional/nullish guard.
 */
export function fallbackInvalidSelection(
  state: DiscoverLayerInput,
  validity: DiscoverLayerValiditySets,
): DiscoverLayerInput {
  const { areaKey, schoolId, groupId } = state.selection;

  const nextAreaKey =
    areaKey != null && validity.validAreaKeys != null && !validity.validAreaKeys.has(areaKey)
      ? null
      : areaKey;
  const nextSchoolId =
    schoolId != null && validity.validSchoolIds != null && !validity.validSchoolIds.has(schoolId)
      ? null
      : schoolId;
  const nextGroupId =
    groupId != null && validity.validGroupIds != null && !validity.validGroupIds.has(groupId)
      ? null
      : groupId;

  return {
    scope: state.scope,
    journey: state.journey,
    selection: {
      ...state.selection,
      areaKey: nextAreaKey,
      schoolId: nextSchoolId,
      groupId: nextGroupId,
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
] as const satisfies readonly (keyof DiscoverUrlState)[];

export type PanelDerivationField = (typeof PANEL_DERIVATION_FIELDS)[number];

export type PanelDerivationInput = Pick<DiscoverUrlState, PanelDerivationField>;
