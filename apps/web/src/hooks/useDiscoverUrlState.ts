/**
 * useDiscoverUrlState
 *
 * Owns ALL URL read/write for the /discover page.
 *
 * Canonical params:
 *   city       – city slug (validated externally by Index)
 *   areaKey    – selected area key (single value)
 *   lat        – map center latitude  (5 dp, debounced replace)
 *   lon        – map center longitude (5 dp, debounced replace)
 *   zoom       – integer zoom level   (debounced replace)
 *   region     – agri-first corridor direction (e.g. "N", "NW"); absent when none selected
 *   maxKm      – selected cumulative distance tier (10|25|50|100); absent until user picks
 *   scope      – residential scope axis (Issue #1745 P2), validated via isValidScope
 *                (the 5 fixed direction/central tokens, corridor codes, or a real
 *                area-group regionKey slug); absent when none selected. Distinct from
 *                `region` (agri-only corridor direction) — orthogonal axis.
 *
 * DEPRECATED (OD-1 Option A):
 *   group      – legacy "DIRECTION:BAND" format; cold-loaded URLs are migrated to region=DIR
 *                (band is dropped, maxKm is NOT inferred) via history.replace on first render
 *
 * Journey params:
 *   journey    – active journey type: "area-first" | "school-first" | "agri-first" (absent = no journey)
 *                READ-only short-name aliases (Issue #1745 P0): "area" | "school" | "agri" are
 *                accepted on read (resolved via the discoverUrlNormalize shim) but the URL is
 *                never rewritten to the short form — all writes still emit the long canonical form.
 *   groupId    – area-group slug selected for area-first journey (absent when no group)
 *
 * Filter params:
 *   type       – comma-joined property types (e.g. "land,house")
 *   beds       – comma-joined bedroom counts (e.g. "2,3")
 *   priceMin   – rupees
 *   priceMax   – rupees
 *   seller     – comma-joined seller types (e.g. "owner,broker"); legacy singular value also accepted
 *   board      – school board filters as REPEATED params (e.g. "?board=CBSE&board=ICSE")
 *   category   – comma-joined school category filters (e.g. "primary,secondary")
 *   bom        – "1" when backOnMarket=true
 *   ntm        – "1" when newToMarket=true
 *   rera       – "1" when reraRegistered=true
 *   rtm        – "1" when readyToMove=true
 *   from       – ISO date YYYY-MM-DD for dateFrom
 *   to         – ISO date YYYY-MM-DD for dateTo
 *   schoolId   – school id (already in use; threaded through for completeness)
 *   radiusKm   – school radius (already in use; threaded through for completeness)
 *
 * Search params:
 *   q          – free-text search query (empty string when no search)
 *
 * History semantics (per issue #910 spec):
 *   City change          → push (atomic: clears journey, groupId, areaKey, viewport)
 *   Journey change       → push
 *   Group selection      → push
 *   Area selection       → push
 *   Area deselection     → replace (remove areaKey)
 *   Map pan/zoom         → replace (debounced 300 ms)
 *   Live filter change   → replace (debounced 300 ms)
 *   Committed filter     → push
 *   School board/cat     → replace
 *
 * ─── Implementation note (Issue #2001 Slice 2 PR2/PR3) ─────────────────────────
 * The ~1,100-line body that used to live in this file has been decomposed into
 * seven domain hooks under src/features/discover/state/url/ (viewport, city,
 * filters, school, area, agricultural, compatibility), each owning its own
 * slice of state + actions plus a shared _shared.ts for the cross-domain
 * context types. This file is now a thin facade: it owns the three
 * debounce-timer refs, the single unmount cleanup effect, builds the shared
 * ctx, calls the seven domain hooks, and assembles their outputs into the
 * unchanged [DiscoverUrlState, DiscoverUrlActions] public return shape. See
 * each domain module's header comment for what it owns.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { UrlDebounceTimers, UrlDomainCtx } from '@/features/discover/state/url/_shared';
import { useViewportUrlDomain } from '@/features/discover/state/url/viewport';
import { useCityUrlDomain } from '@/features/discover/state/url/city';
import { useFiltersUrlDomain } from '@/features/discover/state/url/filters';
import { useSchoolUrlDomain } from '@/features/discover/state/url/school';
import { useAreaUrlDomain } from '@/features/discover/state/url/area';
import { useAgriculturalUrlDomain } from '@/features/discover/state/url/agricultural';
import { useCompatibilityUrlDomain } from '@/features/discover/state/url/compatibility';
import {
  cancelPendingViewportCommit,
  useNavigationUrlDomain,
} from '@/features/discover/state/url/navigation';
import { useResultScopeUrlDomain } from '@/features/discover/state/url/resultScope';
import type { CommittedResultScope, ResultScope } from '@/features/discover/state/resultScope';

// Byte-identical re-export: DEFAULT_MAX_KM is now declared in agricultural.ts
// (the only domain that uses it), but every existing consumer imports it from
// this file's path — keep that path working unchanged.
export { DEFAULT_MAX_KM } from '@/features/discover/state/url/agricultural';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Journey type — mutually exclusive modes for the right panel. Absent = no active journey. */
export type DiscoverJourney = 'area-first' | 'school-first' | 'agri-first';

export interface DiscoverViewport {
  lat: number;
  lon: number;
  zoom: number;
}

export interface DiscoverUrlFilters {
  propertyTypes?: string[];
  bedrooms?: number[];
  priceMin?: number;
  priceMax?: number;
  /** Comma-separated seller types in the URL; replaces the former singular sellerType. */
  sellerTypes?: string[];
  /**
   * School board filters. Serialised in URL as REPEATED `board` params
   * (e.g. `?board=CBSE&board=ICSE`). School-journey only.
   */
  boardFilters?: string[];
  /** Comma-separated school category filters (e.g. "primary,secondary"). School-journey only. */
  categoryFilters?: string[];
  backOnMarket?: boolean;
  newToMarket?: boolean;
  reraRegistered?: boolean;
  readyToMove?: boolean;
  /** ISO date string YYYY-MM-DD — URL representation of dateFrom */
  dateFrom?: string;
  /** ISO date string YYYY-MM-DD — URL representation of dateTo */
  dateTo?: string;
  /** Issue #1457 — agri acreage filter minimum (acres, decimal OK). Applied client-side. */
  agriAcresMin?: number;
  /** Issue #1457 — agri acreage filter maximum (acres, decimal OK). Applied client-side. */
  agriAcresMax?: number;
  /** Issue #1457 — agri price filter minimum (rupees). Applied client-side, auth only. */
  agriPriceMin?: number;
  /** Issue #1457 — agri price filter maximum (rupees). Applied client-side, auth only. */
  agriPriceMax?: number;
  /** Issue #1458 — agri land category filter (exact match; null = no filter). */
  agriLandCategory?: string | null;
  /**
   * Issue #1458 — farmhouse available tri-state filter.
   * true = only rows where farmhouseAvailable===true;
   * false = only rows where farmhouseAvailable===false (NOT null);
   * null = no filter (include all).
   */
  agriFarmhouseAvailable?: boolean | null;
  /** Issue #1458 — fencing done tri-state filter. Same semantics as agriFarmhouseAvailable. */
  agriFencingDone?: boolean | null;
  /**
   * Issue #1458 — water source exact-match filter.
   * 'NOT_AVAILABLE' matches only explicit NOT_AVAILABLE rows (not null rows).
   * null = no filter.
   */
  agriWaterSource?: string | null;
}

// ─── Intent (buy / rent) ──────────────────────────────────────────────────────
// Sits outside DiscoverUrlFilters because it is a global user preference, not a
// property filter. It survives startOver() so the user does not lose their choice.
export type DiscoverIntent = 'buy' | 'rent';

export interface DiscoverUrlState {
  city: string;
  areaKey: string | null;
  viewport: DiscoverViewport | null;
  filters: DiscoverUrlFilters;
  /** School params — read-only here; school writes handled by existing handleSchoolSelect in Index */
  schoolId: string | null;
  radiusKm: number | null;
  /** Free-text search query. Empty string when no search is active. */
  q: string;
  /** Active journey type. Null when no journey is active. */
  journey: DiscoverJourney | null;
  /** Selected area-group slug for area-first journey. Null when no group is selected. */
  groupId: string | null;
  /**
   * Transient marker for the area-first "add a school in this area" sub-step (Issue #1157).
   * When true (URL `schoolPicking=1`), the area-first journey shows the schools-in-area panel
   * WITHOUT flipping journey to school-first, so browser/in-app Back returns to area-selected.
   * Matches the bom/ntm/rera/rtm presence-flag read style (`=== '1' ? true : undefined`).
   */
  schoolPicking?: boolean;
  /**
   * Issue #1597 — presence flag for the area-group results view.
   * When true (URL `groupResults=1`), the area-first journey shows all listings across the
   * selected group's child areas (server-filtered). Requires groupId to be present —
   * a stray groupResults without groupId is ignored by derivePanelContent.
   * Same presence-flag read style as schoolPicking (`=== '1' ? true : undefined`).
   */
  groupResults?: boolean;
  /**
   * Selected agri-first corridor direction (Issue #1429).
   * Parsed from URL `region` param (e.g. "NW"). Null when absent or invalid.
   * Optional to allow partial construction in tests/callers.
   */
  selectedRegion?: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | null;
  /**
   * Selected cumulative distance tier in km (Issue #1429).
   * Parsed from URL `maxKm` param. Null when absent or invalid.
   * Only meaningful when selectedRegion is also set.
   * Optional to allow partial construction in tests/callers.
   */
  selectedMaxKm?: 10 | 25 | 50 | 100 | null;
  /**
   * @deprecated Use selectedRegion + selectedMaxKm instead.
   * Kept for backward compatibility with discoverPanelState + panels that
   * still reference the old `group` param shape.
   * Will be removed once all consumers migrate to selectedRegion/selectedMaxKm.
   */
  selectedGroup: { directionKey: string; distanceBandKey: string } | null;
  /**
   * Selected agri-group listing id for the Level-2 peek panel (Issue #1430).
   * Parsed from URL `listing` param (UUID string). Null when absent or empty.
   * Only meaningful when selectedRegion + selectedMaxKm are also set (agri-group context).
   * Optional to allow partial construction in tests/callers.
   */
  selectedListing?: string | null;
  /**
   * Selected locality name for the agri-group-locality drill-down panel (Issue #1464).
   * Parsed from URL `locality` param (plain string). Null when absent or empty.
   * Only meaningful when selectedRegion + selectedMaxKm are also set (agri-group context).
   * Optional to allow partial construction in tests/callers.
   */
  selectedLocality?: string | null;
  /**
   * Issue #1494 — buy/rent user intent. Defaults to 'buy' when absent or invalid.
   * Serialised as `intent=rent`; 'buy' is the canonical default and is NOT emitted
   * to the URL (shorter URLs, stable canonical form).
   */
  intent: DiscoverIntent;
  /**
   * Issue #1745 P2 — residential "scope" axis. Validated via isValidScope (the 5
   * fixed direction/central tokens, corridor codes, or a real area-group regionKey
   * slug), parsed from URL `scope`. Null when absent or invalid. Distinct from
   * `selectedRegion` (agri-only corridor direction) —
   * an orthogonal residential scoping mechanism. Not yet wired to any UI in P2.
   * Optional (like selectedRegion/selectedListing/etc.) to allow partial construction
   * in tests/callers that predate this field.
   */
  scope?: string | null;
  /**
   * Issue #1956 — the canonical Areas hierarchy identity cursor, parsed from
   * URL `node`. Null when absent, empty, or whitespace-only (same `?.trim()`
   * discipline the groupId guards in discoverPanelState already use).
   *
   * AC1.4 — inside the Areas preview this is the SOLE hierarchy identity;
   * groupId / region / areaKey / scope are never hierarchy identity. Node keys
   * are produced ONLY by the server (`.../areas/{areaKey}/navigation-path`) —
   * the frontend never constructs them.
   *
   * Optional (like scope/selectedRegion/etc.) so existing tests and callers
   * that build a partial state literal keep compiling.
   */
  node?: string | null;
  /**
   * Issue #1956 PR 2 — the RAW trimmed `node` param, BEFORE the shape/size
   * validation `node` applies. Null only when `node=` is genuinely absent, empty
   * or whitespace-only.
   *
   * This exists so that "malformed `node=`" and "no `node=` at all" stay
   * DISTINGUISHABLE. `node` above reads a malformed or oversized value as null so
   * it is never treated as a hierarchy identity — but a mount gate reading that
   * same null would fall through to the legacy flat landing silently, with no
   * resolution notice, for a URL the user can plainly see carries a node. The
   * server's resolve ladder (EXACT → ANCESTOR → CITY_ROOT) is designed to absorb
   * an unknown key, so a consumer mounts on the raw value and lets the server
   * classify it. See state/url/navigation.ts's own doc for the full rationale.
   *
   * Optional, like the other late-added fields, so partial state literals in
   * existing tests and callers keep compiling.
   */
  rawNodeParam?: string | null;
  /**
   * Issue #2083 (cycle 5) — the react-router history action ('POP' | 'PUSH' |
   * 'REPLACE') that produced the CURRENT render's location. 'POP' covers both
   * browser Back and Forward (and `navigate(-1)`) — the one transition kind no
   * app-initiated URL writer intercepts (see useDiscoverUrlState.ts's RC_A part
   * 1 comment). Consumers use this to distinguish a genuine history restoration
   * (trust the already-persisted URL camera) from a fresh forward navigation
   * (fit from scratch) — see useDiscoverCameraOrchestration.ts's canonical-node
   * fit-once effect for the concrete consumer.
   * Optional, like the other late-added fields, so partial state literals in
   * existing tests and callers keep compiling.
   */
  historyAction?: 'POP' | 'PUSH' | 'REPLACE';
  /**
   * Issue #2087 — bounded listings view for a stable node.
   * When true (URL `nodeListings=1`), the canonical Areas journey shows all listings
   * across the selected node's descendant Areas. Requires `node` to be present and eligible.
   * Same presence-flag read style as groupResults (`=== '1' ? true : undefined`).
   */
  nodeListings?: boolean;
  /**
   * Issue #2016 — the single canonical geography controlling Discover
   * results (AREA_SET | POLYGON | VIEWPORT), strictly separate from
   * navigation (`node`) and from PropertyFilters. `active` is the committed
   * scope; `previous` is the scope it replaced, restored BY NAME on J3.5
   * ("Return to selected areas"), never inferred from the camera. See
   * features/discover/state/resultScope.ts for the type and
   * features/discover/state/url/resultScope.ts for the `r`-prefixed URL
   * param contract.
   *
   * Optional, like scope/selectedRegion/node/etc. above, so existing tests
   * and callers that build a partial DiscoverUrlState literal keep
   * compiling. Consumers must treat an absent value the same as
   * `{ active: null, previous: null }`.
   */
  resultScope?: CommittedResultScope;
}

export interface DiscoverUrlActions {
  /**
   * Atomic city switch — single PUSH, clears journey, groupId, areaKey, and viewport.
   * Property filters (type, beds, price, seller, booleans, dates) are preserved.
   * Replaces the old `setCity` for user-initiated city changes.
   */
  changeCity: (city: string) => void;
  /**
   * Low-level city setter — pushes a new history entry and clears areaKey.
   * Kept for backward compatibility; prefer `changeCity` for user-initiated changes.
   */
  setCity: (city: string) => void;
  /**
   * Select an area — pushes a new history entry.
   *
   * `resultScope` (Issue #2016 code-review Finding 5) — optional: when
   * passed (even `null`), the result-scope commit (see `commitResultScope`)
   * is folded into this SAME `setUrlParams` write/history entry instead of
   * firing as a second independent action, which would race on
   * react-router-dom's functional-updater `prev` and can silently drop one
   * of the two deltas. Omit entirely to leave the committed scope untouched
   * (pre-#2016 behaviour, unchanged for every caller that predates this
   * param).
   */
  selectArea: (areaKey: string, resultScope?: ResultScope) => void;
  /**
   * Deselect the current area — replaces current entry (removes areaKey).
   * `resultScope` — same fold-into-one-write contract as `selectArea` above.
   */
  deselectArea: (resultScope?: ResultScope) => void;
  /** Report map viewport change — debounced replace (300 ms), does NOT push history */
  reportViewport: (vp: DiscoverViewport) => void;
  /** Set filters as a live/uncommitted change — debounced replace */
  setFiltersLive: (filters: DiscoverUrlFilters) => void;
  /** Set filters as a committed Apply action — pushes a new history entry */
  setFiltersCommitted: (filters: DiscoverUrlFilters) => void;
  /**
   * Write school params (schoolId + radiusKm) to URL.
   * Default: PUSH — each user-initiated school selection creates a history entry so
   * browser Back works as a step-back within the school-first journey (AC7 / Issue #1143).
   * Pass `options.replace = true` for housekeeping writes (e.g. cold-load backfill) that
   * must not create a phantom history entry (Issue #1146 cycle-2 blocking fix).
   * Pass null to remove both params. Single path so Index.tsx needs no bare
   * useSearchParams instance for school writes.
   */
  setSchoolParams: (
    params: { schoolId: string; radiusKm: number } | null,
    options?: { replace?: boolean },
  ) => void;
  /**
   * In-page Back from Level 2 (school selected) — clears schoolId + radiusKm.
   * Preserves journey, areaKey, city, board/category filters, property filters,
   * and viewport. Single REPLACE — returns to Level 1 (schools-in-area).
   * Issue #1143 AC2.
   */
  clearSchoolSelection: () => void;
  /**
   * In-page Back from Level 1 (area selected, no school) — clears areaKey only.
   * Preserves journey, city, property filters, and viewport.
   * Single REPLACE — returns to Level 0 (school-browse).
   * Issue #1143 AC3.
   */
  clearAreaSelection: () => void;
  /** Set the free-text search query — debounced replace. Empty string removes the param. */
  setSearchQuery: (q: string) => void;
  /**
   * "Clear all" — atomically clears every filter key AND `q` in a single REPLACE.
   * Cancels any pending setFiltersLive/setSearchQuery debounce timers first so a
   * stale-snapshot write cannot race in afterward and revive the old `q` (Issue #1854).
   */
  clearAllFiltersAndSearch: () => void;
  /** Set the active journey — pushes a new history entry. Null removes the journey param. */
  setJourney: (journey: DiscoverJourney | null) => void;
  /** Select an area group — pushes a new history entry. Null removes the groupId param. */
  selectGroup: (groupId: string | null) => void;
  /**
   * Set school board filters — replace (not push). Comma-separated in URL as `board`.
   * Empty array removes the param.
   */
  setBoardFilters: (boards: string[]) => void;
  /**
   * Set school category filters — replace (not push). Comma-separated in URL as `category`.
   * Empty array removes the param.
   */
  setCategoryFilters: (categories: string[]) => void;
  /**
   * Clear area context — removes areaKey only. Preserves groupId, journey, schoolId,
   * radiusKm, filters, and viewport. Single REPLACE — does not push a history entry.
   * Does NOT cancel the viewport debounce timer (contrast with deselectArea which does).
   */
  clearAreaContext: () => void;
  /**
   * Clear school context — removes schoolId and radiusKm in a single REPLACE.
   * Preserves areaKey, journey, groupId, board, category, property filters, and viewport.
   * Returns user to filtered schools-in-area context after dismissing a school selection.
   */
  clearSchoolContext: () => void;
  /** Start over — clears ALL URL state except city. Journey, groupId, areaKey, schoolId, radiusKm, board, category, q, viewport, scope, and all property filters (type/beds/priceMin/priceMax/seller/bom/ntm/rera/rtm/from/to) are dropped. Single REPLACE navigation. */
  startOver: () => void;
  /**
   * Enter the area-first school-picking sub-step (Issue #1157).
   * Sets `schoolPicking=1` while keeping journey=area-first, areaKey, filters, and viewport.
   * Single PUSH — a deliberate destination so browser Back returns to area-selected.
   */
  enterSchoolPicking: () => void;
  /**
   * Leave the area-first school-picking sub-step (Issue #1157).
   * Deletes `schoolPicking`, keeping areaKey/journey/filters/viewport.
   * Single REPLACE — symmetric with clearAreaSelection/clearSchoolSelection.
   */
  clearSchoolPicking: () => void;
  /**
   * Back from area-school-combined to the schools-in-area sub-step (Issue #1157
   * rev-5 DEFECT B). Deletes schoolId + radiusKm and sets schoolPicking=1 in a
   * single REPLACE. Preserves journey (area-first), areaKey, property/board/category
   * filters, and viewport. Models enterSchoolPicking/clearSchoolPicking. Local school
   * state (selectedSchool + filters.schoolLat/Lon/RadiusKm) is cleared by the caller.
   */
  backToSchoolPicking: () => void;
  /**
   * Issue #1597 — enter the area-group results view.
   * Sets `groupResults=1` while keeping journey=area-first, groupId, city, intent,
   * and all active filters. areaKey must NOT be present (results are group-wide).
   * Single PUSH — a shareable destination so browser Back returns to the group drill-down.
   */
  enterGroupResults: () => void;
  /**
   * Issue #1597 — leave the area-group results view.
   * Deletes `groupResults`, keeping groupId/journey/city/intent/filters.
   * Single REPLACE — symmetric with clearSchoolPicking.
   */
  clearGroupResults: () => void;
  /**
   * Select or clear the agri-first regional group (Issue #1409).
   * Writes `group=DIRECTION:BAND` to URL (e.g. "N:10_25"). Null removes the param.
   * Does NOT delete areaKey — B2 allows group selection independently of area selection.
   * PUSH — group selection is a navigational choice.
   * @deprecated Use setRegion + setMaxKm instead (Issue #1429 corridor-first model).
   */
  selectRegionalGroup: (group: { directionKey: string; distanceBandKey: string } | null) => void;
  /**
   * Set the agri-first corridor direction (Issue #1429).
   * Writes `region=DIR` to URL (e.g. "region=NW"). PUSH.
   * Does NOT set maxKm — the user must pick a distance tier separately.
   */
  setRegion: (dir: string) => void;
  /**
   * Set the residential "scope" axis (Issue #1745 P2, wired to the landing macro-region
   * cards in P8). Writes `scope=<value>` to URL when valid (see isValidScope); invalid
   * values or null remove the param (canonical omission). REPLACE — a scope selection is a
   * landing-level refinement, not a navigational destination, mirroring setIntent's REPLACE
   * semantics (Issue #1745 P8: changed from the original P2 PUSH so selecting/switching/
   * clearing scope does not stack browser history entries).
   */
  setScope: (scope: string | null) => void;
  /**
   * Set corridor direction AND default distance tier atomically (Issue #1445).
   * Writes `region=DIR&maxKm=km` in a SINGLE PUSH, skipping the intermediate
   * agri-landing state where only region is set. Default km = DEFAULT_MAX_KM (25).
   * Silently no-ops when dir is not a valid direction or km is not in VALID_MAX_KM.
   */
  setRegionWithMaxKm: (dir: string, km?: number) => void;
  /**
   * Set the cumulative distance tier (Issue #1429).
   * Writes `maxKm=N` to URL. PUSH. Region must already be set.
   */
  setMaxKm: (km: 10 | 25 | 50 | 100) => void;
  /**
   * Clear both region + maxKm atomically (Issue #1429).
   * Removes both params in a single PUSH. Returns to agri-landing.
   */
  clearRegionAndMaxKm: () => void;
  /**
   * Select an agri-group listing for the Level-2 peek panel (Issue #1430).
   * Writes `listing=<uuid>` to URL. PUSH — peek is a navigational destination (browser Back works).
   */
  setSelectedListing: (id: string) => void;
  /**
   * Close the agri-group listing peek panel (Issue #1430).
   * Removes `listing=` only; preserves region, maxKm, journey, city, and all other params.
   * REPLACE — closing is not a new destination (Back should not re-open the peek).
   */
  clearSelectedListing: () => void;
  /**
   * Drill into a locality group within the agri-group-selected panel (Issue #1464).
   * Writes `locality=<name>` to URL. PUSH — locality drill-down is a navigational destination
   * so browser Back returns to the grouped view.
   */
  setLocality: (name: string) => void;
  /**
   * Close the agri-group-locality panel (Issue #1464).
   * Removes `locality=` only; preserves region, maxKm, journey, city, and all other params.
   * REPLACE — closing is not a new navigation destination.
   */
  clearLocality: () => void;
  /**
   * Clear all agri filter params — removes agriAcresMin, agriAcresMax, agriPriceMin,
   * agriPriceMax, agriLandCategory, agriFarmhouseAvailable, agriFencingDone, agriWaterSource.
   * Preserves all other URL state. REPLACE (not PUSH).
   * Issue #1457, #1458.
   */
  clearAgriFilters: () => void;
  /**
   * Issue #1494 — set the buy/rent intent. REPLACE (preference change, not a new
   * navigation destination; Back should not undo a buy/rent toggle).
   */
  setIntent: (intent: DiscoverIntent) => void;
  /**
   * Atomic school-first journey start — sets journey='school-first', school params (schoolId,
   * radiusKm, lat, lon, zoom), and areaKey in a single PUSH. Ensures all params reach the URL
   * together for correct panel routing. Only used when transitioning to school-first journey
   * with a selected school.
   *
   * areaKey resolution order (Issue #1160 Option Y):
   *   1. school.areaKey (truthy) — use directly (backend-provided, most precise).
   *   2. Bbox containment fallback — walk the already-loaded discover-areas cache for the
   *      current city. Find the first area whose bbox contains school.lat/lon. No extra fetch.
   *   3. Neither source yields areaKey — omit the param and warn-log once.
   */
  setSchoolJourney: (params: {
    schoolId: string;
    radiusKm: number;
    lat: number;
    lon: number;
    zoom: number;
    areaKey?: string | null;
  }) => void;
  /**
   * Issue #1956 PR 2 — drill into a canonical Areas hierarchy node. Writes
   * `node=<serverSuppliedKey>` and drops `lat`/`lon`/`zoom`/`listing` (the new
   * node owns the camera; a peek pinned to the previous context must not
   * survive). Single PUSH. A repeat call for the node already active is a no-op
   * (zero writes) so one click never costs two Back presses.
   */
  goToNode: (nodeKey: string) => void;
  /**
   * Issue #1943 (singleton auto-advance, PR #2368 owner ruling 2026-08-28) —
   * IDENTICAL param delta to `goToNode` (same `applyNodeDelta`, so a
   * differential test can assert byte-identical output), but a single
   * REPLACE instead of a PUSH.
   *
   * Reserved for the automatic hierarchy transition fired when the current
   * rendered state resolves to exactly one interactive real child marker
   * that itself has further children — never for a user-initiated click,
   * which always stays PUSH via `goToNode`. REPLACE is load-bearing here:
   * the singleton state this collapses through was never a real navigation
   * destination the user chose, so it must not occupy its own history slot
   * — a PUSH would let Back land back on the singleton and immediately
   * auto-re-advance forward again, an unrecoverable trap. Same no-op guard
   * as `goToNode` (a repeat call for the node already active writes
   * nothing).
   */
  goToNodeReplacingCurrent: (nodeKey: string) => void;
  /**
   * Issue #1956 PR 2 — jump to an ancestry crumb, including `'root'` (the
   * synthetic city top level, a real server key). Identical URL delta to
   * `goToNode`; a distinct name so breadcrumb intent has its own call site.
   * Single PUSH.
   */
  goToAncestorNode: (nodeKey: string) => void;
  /**
   * Issue #1956 PR 2 — leave the hierarchy cursor: deletes `node` plus
   * `lat`/`lon`/`zoom`/`listing`. Single PUSH.
   */
  clearNode: () => void;
  /**
   * Issue #1956 PR 2 — ATOMIC entry into the canonical Areas journey: sets
   * `journey=area-first` AND `node=` in ONE write, therefore ONE history entry.
   * Callers must use this instead of composing `setJourney` (itself a PUSH) with
   * a node write, which would push twice in a single tick.
   */
  enterAreasJourney: (nodeKey: string | null) => void;
  /**
   * ATOMIC entry into the canonical Schools journey: sets
   * `journey=school-first` AND `node=` in ONE write.
   */
  enterSchoolsJourney: (nodeKey: string | null) => void;
  /**
   * ATOMIC entry into the Schools journey at a specific area: sets
   * `journey=school-first` AND `areaKey=` while deleting `node` in ONE write.
   */
  enterSchoolsJourneyAtArea: (areaKey: string) => void;
  /**
   * Issue #1956 PR 2 — PURE: returns the query string a middle-click / cmd-click
   * / "copy link address" on a node destination should resolve to, or null when
   * the key is not writable. Writes NOTHING. Guaranteed by a differential test to
   * produce exactly the URL `goToNode` would produce from the same params, so the
   * link affordance and the click affordance cannot diverge.
   */
  buildNodeHref: (nodeKey: string) => string | null;
  /**
   * Issue #2087 — enter the bounded node listings view.
   * Sets `nodeListings=1` while keeping node/journey/filters.
   * Single PUSH — a shareable destination so browser Back returns to the node drill-down.
   */
  enterNodeListings: () => void;
  /**
   * Issue #2087 — leave the bounded node listings view.
   * Deletes `nodeListings`, keeping node/journey/filters.
   * Single REPLACE.
   */
  clearNodeListings: () => void;
  /**
   * Issue #2203 (Option A') — School-first "pick a new Area" from the shared
   * control-bar search. Writes `node=<resolvedKey>` (identical delta to
   * `goToNode`) AND clears `schoolId` in ONE PUSH. `journey` is never
   * touched — the caller stays in school-first. Use this instead of
   * `goToNode` whenever a new Area selection must also invalidate a
   * previously-selected school (the geography-dependent leaf).
   */
  goToNodeAndClearSchoolSelection: (nodeKey: string) => void;
  /**
   * Issue #2203 (Option A') — Agri-first "pick a new Area" from the shared
   * control-bar search. Writes `node=<resolvedKey>` (identical delta to
   * `goToNode`) AND clears the destKey-based `selectedLocality` leaf
   * (`destKey`/`locality`/`town`) in ONE PUSH. `journey` is never touched.
   * `selectedRegion`/`selectedMaxKm` (corridor + radius) are deliberately
   * preserved — they remain meaningful across an Area change.
   */
  goToNodeAndClearAgriculturalLocality: (nodeKey: string) => void;
  /**
   * Issue #2016 — commit a new result scope. Moves the current `active`
   * scope into `previous` (rprev) and writes the new scope's payload key in
   * ONE history PUSH. Passing `null` clears the committed scope entirely.
   * Never call this for draft/in-progress state (drawing, camera movement)
   * — those never touch the URL at all (see state/url/resultScope.ts).
   */
  commitResultScope: (scope: ResultScope) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDiscoverUrlState(): [DiscoverUrlState, DiscoverUrlActions] {
  const [urlParams, setUrlParams] = useSearchParams();
  const queryClient = useQueryClient();
  const location = useLocation();
  // Issue #2083 (cycle 5) — see DiscoverUrlState.historyAction's doc.
  const historyAction = useNavigationType();

  // Debounce timers — facade-owned (qa-fast R1), injected into every domain via
  // ctx.timers so cross-domain cancellation call sites (clearAllFiltersAndSearch
  // in filters.ts; changeCity/deselectArea/startOver in city.ts/area.ts) all
  // cancel the SAME ref instance rather than a domain-local copy.
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtersLiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // useRef-sourced values are eslint-exempt from exhaustive-deps (stable
  // forever), so an empty dep array here is correct, not a suppression.
  const timers = useMemo<UrlDebounceTimers>(
    () => ({ viewport: viewportTimer, filtersLive: filtersLiveTimer, search: searchTimer }),
    [],
  );

  // Cleanup timers on unmount — the single unmount effect for all three.
  // NOTE: eslint-plugin-react-hooks now warns here ("ref value ... will likely
  // have changed by the time this effect cleanup function runs") because the
  // `.current = setTimeout(...)` assignment sites for these refs live in the
  // six domain modules, not this file — eslint can no longer statically prove
  // (within useDiscoverUrlState.ts alone) that these are plain timer-id refs
  // rather than DOM refs. They are NOT DOM refs; reading `.current` at
  // unmount time (not copying it during mount) is the correct, intentional
  // behaviour here — it clears whatever debounced write is pending at the
  // moment of unmount. Deliberately NOT suppressed with eslint-disable (see
  // qa-fast handoff: zero exhaustive-deps suppressions in this file).
  useEffect(() => {
    return () => {
      if (viewportTimer.current) clearTimeout(viewportTimer.current);
      if (filtersLiveTimer.current) clearTimeout(filtersLiveTimer.current);
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  // Issue #2083 RC_A part 2 — always holds the CURRENT render's `urlParams`.
  // Mutated directly in the render body (not inside an effect) so it is
  // guaranteed current before any `setTimeout` scheduled THIS render can
  // fire — an effect-based update would still be one tick behind a timer
  // that fires between commit and effect flush. See _shared.ts's
  // `liveUrlParamsRef` doc for why a debounced flush must read this instead
  // of `setUrlParams`'s functional-updater `prev`.
  const liveUrlParamsRef = useRef(urlParams);
  liveUrlParamsRef.current = urlParams;

  // Computed once and threaded to every domain that needs it (city.ts's own
  // state slice, school.ts's setSchoolJourney bbox-fallback cache key) via
  // ctx.reads.city.
  const city = urlParams.get('city') ?? '';

  const ctx: UrlDomainCtx = {
    urlParams,
    setUrlParams,
    timers,
    queryClient,
    reads: { city },
    liveUrlParamsRef,
  };

  // Issue #2083 RC_A part 1 — UNIVERSAL cancellation of any pending viewport
  // debounce commit, keyed on a HISTORY TRANSITION (`location.key`), which
  // changes on every navigation react-router performs — PUSH, REPLACE, and
  // POP (browser Back/Forward) alike.
  //
  // WHY THIS COEXISTS WITH THE PER-WRITER SYNCHRONOUS CANCELS (navigation.ts's
  // `writeNode`/`enterAreasJourney`, area.ts's `deselectArea`, etc.) RATHER
  // THAN REPLACING THEM — this looks like duplication but is not, and
  // removing either half reintroduces the race it closes:
  //   - The per-writer cancels are SYNCHRONOUS and run BEFORE the navigation
  //     they guard, closing the gap between "user clicks" and "history
  //     updates" for app-initiated writes.
  //   - This effect runs AFTER commit, in response to `location.key` having
  //     already changed — the only guard available for a transition NO
  //     writer can intercept: browser Back/Forward (a POP), `navigate(-1)`
  //     (HierarchyBackButton.tsx), and the `<Link replace>` fallback. None of
  //     those call any URL-domain writer, so only a POST-transition guard can
  //     ever see them.
  // A timer armed a moment before either kind of transition must never land
  // afterwards and re-add a stale lat/lon/zoom onto the NEW history entry —
  // that is the bug this pair of guards exists to make structurally
  // unreachable, not merely unlikely.
  useEffect(() => {
    cancelPendingViewportCommit(timers);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `timers` is a
    // useRef-backed object (stable identity forever, see the comment on its
    // declaration above); only `location.key` should re-run this effect.
  }, [location.key]);

  // Fixed call order — all eight domain hooks run unconditionally every render.
  const viewportDomain = useViewportUrlDomain(ctx);
  const cityDomain = useCityUrlDomain(ctx);
  const filtersDomain = useFiltersUrlDomain(ctx);
  const schoolDomain = useSchoolUrlDomain(ctx);
  const areaDomain = useAreaUrlDomain(ctx);
  const agriculturalDomain = useAgriculturalUrlDomain(ctx);
  const compatibilityDomain = useCompatibilityUrlDomain(ctx);
  // Issue #1956 PR 1 — read-only domain (no actions), appended LAST so the
  // existing seven-domain call order is byte-for-byte unchanged.
  const navigationDomain = useNavigationUrlDomain(ctx);
  // Issue #2016 — appended last, same rationale: never disturb the existing
  // eight-domain call order.
  const resultScopeDomain = useResultScopeUrlDomain(ctx);

  // Explicit literal in the ORIGINAL 18-key order (qa-fast R3) — guards any
  // Object.keys/snapshot assertion a caller may add later.
  const state: DiscoverUrlState = {
    city: cityDomain.state.city,
    areaKey: areaDomain.state.areaKey,
    viewport: viewportDomain.state.viewport,
    filters: filtersDomain.state.filters,
    schoolId: schoolDomain.state.schoolId,
    radiusKm: schoolDomain.state.radiusKm,
    q: filtersDomain.state.q,
    journey: areaDomain.state.journey,
    groupId: areaDomain.state.groupId,
    schoolPicking: schoolDomain.state.schoolPicking,
    groupResults: areaDomain.state.groupResults,
    selectedGroup: compatibilityDomain.state.selectedGroup,
    selectedRegion: agriculturalDomain.state.selectedRegion,
    selectedMaxKm: agriculturalDomain.state.selectedMaxKm,
    selectedListing: agriculturalDomain.state.selectedListing,
    selectedLocality: agriculturalDomain.state.selectedLocality,
    intent: cityDomain.state.intent,
    scope: compatibilityDomain.state.scope,
    // Issue #1956 PR 1 — appended AFTER the original 18 keys so the existing
    // key order is preserved for any Object.keys/snapshot assertion.
    node: navigationDomain.state.node,
    // Issue #1956 PR 2 — appended after PR 1's key, same rationale.
    rawNodeParam: navigationDomain.state.rawNodeParam,
    // Issue #2087 — appended last with historyAction.
    nodeListings: navigationDomain.state.nodeListings,
    // Issue #2083 (cycle 5) — appended last, same rationale as the two keys above.
    historyAction,
    // Issue #2016 — appended last, same rationale.
    resultScope: resultScopeDomain.state.resultScope,
  };

  // Spread merge is safe under this explicit `DiscoverUrlActions` annotation —
  // TypeScript verifies every key of the action interface is present across the
  // domain slices (a missing/misspelled action key fails the build).
  //
  // Issue #1956 PR 2 — the navigation domain now contributes actions too (it was
  // deliberately action-less in PR 1, when nothing navigated). Spread LAST, in
  // the same position its hook occupies in the call order above. Its keys are
  // disjoint from every other domain's, so the merge order is not load-bearing.
  const actions: DiscoverUrlActions = {
    ...viewportDomain.actions,
    ...cityDomain.actions,
    ...filtersDomain.actions,
    ...schoolDomain.actions,
    ...areaDomain.actions,
    ...agriculturalDomain.actions,
    ...compatibilityDomain.actions,
    ...navigationDomain.actions,
    ...resultScopeDomain.actions,
  };

  return [state, actions];
}
