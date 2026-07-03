/**
 * discoverLayerRegistry
 *
 * Issue #1745 slice P1 — layer-registry FAÇADE.
 *
 * This module is an UN-WIRED foundation seam for slice P2 (the eventual 16→12
 * panel-state collapse / scope-aware routing work). As of P1 it is NOT imported
 * by any component, page, or hook — it exists purely so future slices have a
 * single, typed entry point to build against without having to touch
 * `discoverPanelState.ts` or `useDiscoverUrlState.ts` directly.
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
 * Cross-region scope. `region` is ALWAYS `null` in P1 (single-region app for
 * this phase) — the field exists so P2 can introduce multi-region scoping
 * without changing this module's public shape.
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
 * Pure adapter: DiscoverUrlState → DiscoverLayerInput. `scope.region` defaults
 * to `null` (P1 has no region-scoping source yet).
 */
export function toLayerInput(urlState: DiscoverUrlState): DiscoverLayerInput {
  return {
    scope: { region: null },
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
 * `input.scope.region` is unused here by construction — P1's only supported
 * scope value is `null`, which is exactly what `derivePanelContent` already
 * assumes (it has no region-scope concept at all). P2 will extend this
 * function when region scoping needs to influence the derived layer.
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
 * Mirrors `useDiscoverUrlState.changeCity` (Issue #910 atomic city switch):
 * clears journey, groupId, the legacy/region-scoped agri selection fields
 * (selectedGroup/selectedRegion/selectedMaxKm/selectedListing/selectedLocality),
 * groupResults, schoolPicking, areaKey, and region scope.
 *
 * `schoolId` is intentionally PRESERVED here — the real `changeCity`
 * implementation (useDiscoverUrlState.ts) does not delete the `schoolId`/
 * `radiusKm` URL params on city switch, so this reducer mirrors that exact
 * (pre-existing, out-of-scope-to-fix) behaviour rather than the more
 * "complete-sounding" clear-everything reading of the ticket text.
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
 * Mirrors `useDiscoverUrlState.startOver`: full reset to the neutral landing
 * layer input (journey null, all selection fields cleared, region scope
 * cleared). Only `city` and `intent` survive `startOver` in the real hook —
 * neither is part of `DiscoverLayerInput`, so nothing needs to be threaded
 * through here; the returned shape is always the same fixed neutral value
 * regardless of `state`.
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
 * Mirrors `useDiscoverUrlState.clearRegionAndMaxKm` / the agri corridor-clear
 * semantics: clears `scope.region` plus the four agri selection fields
 * (selectedRegion, selectedMaxKm, selectedListing, selectedLocality).
 * Everything else (journey, areaKey, groupId, schoolId, schoolPicking,
 * groupResults, legacy selectedGroup) is preserved unchanged.
 *
 * A no-op when those fields are already null (returns an equivalent-value
 * object), and idempotent — calling it twice in a row yields the same result
 * as calling it once.
 */
export function clearRegionScopeForAgri(state: DiscoverLayerInput): DiscoverLayerInput {
  return {
    scope: { ...state.scope, region: null },
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
