import { useCallback, useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { useNearbyAreaCandidates } from '@/hooks/useNearbyAreaCandidates';
import { useAreaSetDraftContext } from '@/features/discover/state/AreaSetDraftContext';
import { useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { areaSetProximityLabel, type SelectedAreaGeo } from '@/features/discover/utils/areaSetProximity';
import { useRelaxationPreviews, type RelaxationPreviewScope } from '@/hooks/useRelaxationPreviews';
import { useAuth } from '@/contexts/AuthContext';
import type { ResultScope } from '@/features/discover/state/resultScope';
import { summariseActiveFilters } from '../zeroRecoveryCopy';
import { applyRelaxationPreview, relaxationLabel } from '../relaxationCopy';
import type { DiscoverEmptyCause } from '../emptyStateCopy';

/**
 * Issue #2018 (slice 1) — honest zero-result recovery for a committed
 * AREA_SET or a single canonical AREA, replacing the generic cause-routed
 * `EmptyState` that `AreaSelectedPanel` rendered for this case before.
 *
 * Mock source: `ui_kits/new_discover/src/ExpPanel.jsx`'s `EPZero`
 * (L273-349) — the ochre banner (scope-aware heading, mono scope+filter
 * line, "kept exactly as it is" note), then the "Nearby areas with matches"
 * list, then the existing clear-filters action.
 *
 * Issue #2018 (slice 2) added the "Change one filter" relaxation rows
 * (`EPZero` L330-342), which slice 1 had deferred for want of a backend
 * count endpoint. Every count now comes from
 * `GET /api/discover/areas/relaxation-previews`, which computes it from the
 * SAME predicate builder the listings query uses — so a previewed number
 * cannot disagree with what the shopper sees after applying it. Clicking a
 * row applies exactly ONE filter change through the panel's existing filter
 * owner (`onApplyFilters`, threaded from `AreaSelectedPanel`'s
 * `onFiltersChange` — the same seam the budget/bedroom/type quick chips
 * already use), so the history semantics are identical to an existing
 * committed filter change and the result scope is untouched.
 *
 * DELIBERATELY NOT RENDERED HERE, and not stubbed:
 *   - `Create alert` (`EPZero` L344). Blocked on #2019 / #1793; the issue
 *     forbids presenting an alert as scheduled before it is persisted, so
 *     no control that implies persistence is rendered. (`AreaSetSelectedHeader`
 *     already renders an explicitly DISABLED "Create alert" — that stays.)
 *   - POLYGON / VIEWPORT recovery blocks (`EPZero` L290-310) — later slice.
 *
 * DELIBERATE DEVIATION FROM THE FROZEN MOCK (flagged for owner ruling on
 * the PR): `EPZero` gates its nearby list on
 * `areaScope = kind === "AREA_SET" || kind === "CITY"`, which excludes a
 * single canonical AREA. The issue text requires the opposite twice — "when
 * the active scope is a canonical AREA or AREA_SET: suggestions come from
 * the same geography-led nearby contract used by #2017", and, for
 * zero-content canonical areas, "offer nearby alternatives". This component
 * follows the issue, so `scopeAreaKeys` of length 1 gets the list too.
 */

/** Mock parity (`EPZero` L278): at most three suggestions, never a long tail. */
const MAX_NEARBY_SUGGESTIONS = 3;

export interface AreaZeroResultRecoveryProps {
  /**
   * The committed scope's canonical, stable area keys: the AREA_SET's
   * `areaKeys` when one is committed, otherwise the single canonical AREA's
   * own key. Never a display name — these are the keys sent to the nearby
   * contract and to the draft, per the issue's "canonical stable keys" rule.
   */
  scopeAreaKeys: string[];
  /**
   * Display name to fall back to when `useDiscoverAreas` has not resolved a
   * name for a key (cold load, or a key absent from the areas payload). The
   * panel's own `areaLabel`, so a single-area scope always has an honest
   * name to show even before the areas query settles.
   */
  fallbackScopeName: string;
  city: string;
  /** Active discover filters — drives both the summary line and the nearby counts. */
  filters: PropertyFilters;
  /** Active buy/rent intent, named first in the filter summary. */
  intent: 'buy' | 'rent';
  /** Active within-area search text, if any. */
  searchQuery?: string;
  /** "homes" / "rentals" — the noun already used by this panel's other copy. */
  noun: string;
  /**
   * Issue #1817's cause signal, reused rather than re-derived so this
   * banner and the map badge still agree about WHY the list is empty. The
   * mock's `EPZero` only ever depicts a filtered zero; `empty` is the
   * zero-content canonical AREA the issue calls out separately ("confirm
   * the area is valid; state that there are no current matching listings"),
   * which needs its own heading rather than claiming filters are hiding
   * something that was never there.
   */
  cause: DiscoverEmptyCause;
  /**
   * Issue #2018 slice 3 — the kind of result scope these zero results belong
   * to, so the recovery can only say things that are true about it.
   *
   * Before this existed the component assumed an area-shaped scope, which is
   * a truthfulness bug for the other two kinds: a committed POLYGON has no
   * `isViewportScope` equivalent anywhere (both flags in `useDiscoverMapData`
   * are gated on `kind === 'VIEWPORT'`), so it fell through to the
   * single-canonical-AREA path and this banner named an AREA that is not the
   * scope, then offered nearby areas measured from it.
   *
   * 'AREA' covers a canonical AREA leaf and a committed AREA_SET — both are
   * genuinely area-shaped, so both keep the nearby list.
   */
  scopeKind?: 'AREA' | 'POLYGON' | 'VIEWPORT';
  /**
   * Issue #2454 (slice 4) — the committed #2016 result scope itself
   * (`nav.resultScope.active`, passed through by `AreaSelectedPanel` and not
   * re-derived here), so the relaxation counts can be asked for the SAME
   * geometry the listings query is scoped to. Only read for POLYGON and
   * VIEWPORT; an AREA scope keeps using `scopeAreaKeys`. When `scopeKind`
   * says POLYGON/VIEWPORT but this is absent or of another kind, no
   * relaxation query is issued and no rows render — a count for a geometry
   * that cannot be named truthfully is worse than none.
   */
  resultScope?: ResultScope;
  /**
   * Commits an explicit filter change (#2018 slice 2). Threaded from
   * `AreaSelectedPanel`'s existing `onFiltersChange`, so a relaxation row is
   * exactly as much of a state transition as clicking a budget quick chip:
   * one meaningful transition, no scope change, no new URL contract.
   * Omitted when the surface has no filter owner, in which case the
   * relaxation rows are not rendered at all rather than rendered inert.
   */
  onApplyFilters?: (filters: PropertyFilters) => void;
  /**
   * Issue #2018 slice 3 — the frozen mock's POLYGON action "Adjust boundary"
   * (`EPZero` L294, `act.drawArea`). Consumes the EXISTING seam
   * `handleRedrawPolygon` from `useDiscoverPageState` (#2419 PR-1) by name;
   * nothing is reimplemented here.
   *
   * It starts a NEW drawing and commits nothing: the committed scope keeps
   * producing results until a fresh polygon is drawn AND accepted, so this
   * row writes no URL, pushes no history entry and changes no result scope.
   * Omitted renders no row at all rather than a dead control.
   */
  onAdjustBoundary?: () => void;
  /** Clears the property filters. Omitted when no property filter is active. */
  onClearFilters?: () => void;
  /** Clears the within-area search. Omitted when no search is active. */
  onClearSearch?: () => void;
}

export function AreaZeroResultRecovery({
  scopeAreaKeys,
  fallbackScopeName,
  city,
  filters,
  intent,
  searchQuery,
  noun,
  cause,
  scopeKind = 'AREA',
  resultScope = null,
  onAdjustBoundary,
  onApplyFilters,
  onClearFilters,
  onClearSearch,
}: AreaZeroResultRecoveryProps) {
  const shell = useDiscoverShell();
  const { view: draft, commands } = useAreaSetDraftContext();
  const { data: areasData } = useDiscoverAreas(city);
  const { user } = useAuth();
  const isSignedIn = user != null;

  // Issue #2017's nearby contract, called with THIS surface's committed scope
  // keys rather than read off `useAreaSetDraftContext().data`. The context
  // seeds its query from the DRAFT, which is empty whenever the committed
  // scope is not an AREA_SET — i.e. exactly the single-canonical-AREA case
  // this component must also serve, where it would ask for "areas near
  // nothing". Identical `selected` keys produce an identical TanStack query
  // key, so in the AREA_SET case this shares the context's cache entry
  // instead of issuing a second request.
  //
  // Issue #2018 slice 3 — disabled outright for POLYGON/VIEWPORT via the
  // hook's own documented `city.length > 0` guard, because the result is not
  // rendered for those scopes (see the nearby block below) and firing an
  // area-keyed request for a drawn or visible-map search asks a question the
  // shopper did not.
  //
  // Issue #2456 — `listingPurpose` mirrors the listings query's own intent
  // mapping (same shape as the `useRelaxationPreviews` call below), so rent-only
  // rows never inflate a Buy search's "with matches" counts.
  const { data: nearbyData, isLoading: nearbyLoading } = useNearbyAreaCandidates(
    scopeKind === 'AREA' ? city : '',
    scopeAreaKeys,
    filters,
    { listingPurpose: intent === 'rent' ? 'rent' : 'sale' },
  );

  // Issue #2018 slice 2. The stale-response guard lives in the hook's query
  // key (filters + scope payload), so a reply computed for older state is
  // cached under a different key and can never be read back here — which is
  // also what makes it exact for `relaxationLabel` to diff a preview against
  // the live `filters` below.
  //
  // Issue #2454 (slice 4) — the hook is scope-aware, so the previews are now
  // asked for the SAME geometry the listings query is scoped to: the
  // committed AREA/AREA_SET keys, the committed POLYGON, or the committed
  // VIEWPORT bbox. Slice 3's `isAreaScope` gate is gone for those kinds
  // because their counts are now truthful. What remains gated is anything
  // whose count could NOT be truthful: a POLYGON/VIEWPORT `scopeKind` with no
  // matching `resultScope` to hand over (null scope → the hook asks nothing),
  // and a signed-out POLYGON (no anonymous polygon path exists; the hook
  // disables itself, and `canOfferRelaxations` below refuses to render even if
  // something else supplied data).
  const previewScope: RelaxationPreviewScope = useMemo(() => {
    if (scopeKind === 'AREA') return { kind: 'AREA_SET', areaKeys: scopeAreaKeys };
    if (scopeKind === 'POLYGON' && resultScope?.kind === 'POLYGON') return resultScope;
    if (scopeKind === 'VIEWPORT' && resultScope?.kind === 'VIEWPORT') return resultScope;
    return null;
  }, [scopeKind, scopeAreaKeys, resultScope]);

  // `listingPurpose` mirrors the listings query's own intent mapping (see
  // DiscoverRightPanel / useDiscoverListings): purpose is part of the server's
  // never-relaxed envelope, so omitting it counts rent rows for a buy search.
  const { data: relaxationData } = useRelaxationPreviews(city, previewScope, filters, {
    listingPurpose: intent === 'rent' ? 'rent' : 'sale',
  });

  // Issue #2454 — the correctness rule, asserted HERE as well as in the hook's
  // `enabled`, deliberately: disabling the request is an optimisation, this
  // gate is what keeps a wrong number off the screen. A reply only counts for
  // this surface when (a) there is a scope it could truthfully describe, (b) it
  // is not an anonymous POLYGON (no anonymous polygon path exists), and (c) the
  // server says it was computed for THAT scope kind — the server half of the
  // stale-response guard, so an AREA_SET reply can never dress up a POLYGON.
  const canOfferRelaxations =
    previewScope != null && (previewScope.kind !== 'POLYGON' || isSignedIn);
  const relaxationsAreForThisScope =
    previewScope != null && relaxationData?.scopeKind === previewScope.kind;

  // Nothing renders until real counts arrive: an optimistic or placeholder
  // number is precisely the dishonest preview the issue forbids.
  const relaxations =
    canOfferRelaxations && relaxationsAreForThisScope ? (relaxationData?.previews ?? []) : [];

  // Names for the scope line, resolved from the SAME `useDiscoverAreas`
  // payload `AreaSetSelectedHeader` reads (one source for area names on this
  // panel), falling back per-key so a cold areas query degrades to the
  // panel's own label rather than to a raw canonical key.
  const scopeAreaNames = useMemo(() => {
    const nameByKey = new Map((areasData?.areas ?? []).map((a) => [a.areaKey, a.name] as const));
    return scopeAreaKeys.map((key, i) => nameByKey.get(key) ?? (i === 0 ? fallbackScopeName : key));
  }, [areasData?.areas, scopeAreaKeys, fallbackScopeName]);

  const selectedAreaGeoByKey = useMemo(() => {
    const map = new Map<string, SelectedAreaGeo>();
    for (const area of areasData?.areas ?? []) {
      if (scopeAreaKeys.includes(area.areaKey)) {
        map.set(area.areaKey, { name: area.name, lat: area.geoCenterLat, lon: area.geoCenterLon });
      }
    }
    return map;
  }, [areasData?.areas, scopeAreaKeys]);

  // Mock parity (`EPZero` L278: `.filter((n) => n.n > 0).slice(0, 3)`).
  //
  // `useNearbyAreaCandidates`' doc says callers must not re-filter or
  // re-rank the response, and that rule is respected: GEOGRAPHY and RANKING
  // stay entirely server-owned, and nothing is reordered here. What is
  // applied is a presentational honesty gate — verified live against this
  // backend, `/areas/nearby-candidates` DOES return candidates with
  // `eligibleListingCount: 0` (every candidate comes back 0 under a
  // restrictive price cap), and listing those under a heading that promises
  // "with matches" would state something false. Areas with no matches are
  // not silently dropped either: when NONE of them has a match, the note
  // below says so explicitly rather than rendering an empty section.
  const suggestions = useMemo(
    () =>
      (nearbyData?.candidates ?? [])
        .filter((c) => c.eligibleListingCount > 0)
        .slice(0, MAX_NEARBY_SUGGESTIONS),
    [nearbyData?.candidates],
  );

  const filterSummary = useMemo(
    () => summariseActiveFilters(filters, intent, searchQuery),
    [filters, intent, searchQuery],
  );

  const isAreaScope = scopeKind === 'AREA';

  // Issue #2454 — the relaxation footnote must name the ACTIVE scope, for the
  // same reason the scope line below must (FUNCTIONAL_AUDIT §C2).
  const scopeStaysCopy =
    scopeKind === 'POLYGON'
      ? 'Your drawn area stays exactly as it is.'
      : scopeKind === 'VIEWPORT'
        ? 'The visible map area stays exactly as it is.'
        : 'Your selected areas stay exactly as they are.';

  // `EPZero` L285's scope-aware heading. The POLYGON and VIEWPORT wordings
  // are the mock's own, verbatim; the `empty` branch is the addition the mock
  // has no state for (a canonical area that is valid but genuinely holds
  // nothing must not claim filters are hiding listings that never existed).
  const heading =
    scopeKind === 'POLYGON'
      ? `No matching ${noun} inside your drawn area`
      : scopeKind === 'VIEWPORT'
        ? `No matching ${noun} in the visible map area`
        : cause === 'empty'
          ? `${scopeAreaNames[0] ?? 'This area'} has no ${noun} listed right now`
          : scopeAreaKeys.length > 1
            ? `No matching ${noun} in your ${scopeAreaKeys.length} selected areas`
            : `No matching ${noun} in ${scopeAreaNames[0] ?? 'this area'}`;

  const subCopy =
    isAreaScope && cause === 'empty'
      ? 'This is a real area with nothing listed today, not a filtered-out result. Your search is unchanged.'
      : 'Your search is kept exactly as it is. Nothing here widens it for you.';

  // The scope line must name the ACTIVE scope. Naming the previously-selected
  // areas under a drawn or visible-map search is precisely what
  // FUNCTIONAL_AUDIT §C2 ruled out: "The zero panel no longer prints previous
  // area names as the active scope."
  const scopeLine =
    scopeKind === 'POLYGON'
      ? 'Drawn area'
      : scopeKind === 'VIEWPORT'
        ? 'Visible map area'
        : scopeAreaNames.length > 0
          ? scopeAreaNames.join(' · ')
          : `${scopeAreaKeys.length} areas`;

  // Adding a candidate opens the EXISTING #2017 draft — it never commits.
  // Per the resolved mock (FUNCTIONAL_AUDIT §C2: "Add now opens a draft
  // instead of committing"), the committed result scope, the URL and browser
  // history are all untouched here; only the explicit "Show listings" /
  // "Search these areas" action commits, and that already exists.
  //
  // `openAreaSetDraft()` is the single cross-tree open signal all surfaces
  // read: the right panel swaps to `AreaSetDraftPanel` in place.
  // Copied from `AreaSelectedPanel`'s own `handleAddNearbyAreas`, not a second mechanism.
  const handleAdd = useCallback(
    (areaKey: string) => {
      // A single canonical AREA has no committed AREA_SET, so the shared
      // draft is seeded empty — adding straight into it would silently drop
      // the very area the shopper is looking at and produce a one-area draft
      // for the SUGGESTION alone. Seed the current scope first in that case.
      if (draft.draftAreaKeys.length === 0) {
        scopeAreaKeys.forEach((key) => commands.add(key));
      }
      commands.add(areaKey);
      shell.openAreaSetDraft();
    },
    [draft.draftAreaKeys.length, scopeAreaKeys, commands, shell],
  );

  // A draft already at the cap cannot take another area. Mirrors
  // AreaSetDraftPanel's own at-limit treatment (disabled + explanatory
  // title) rather than an Add button that silently does nothing.
  const atLimit = Math.max(draft.draftAreaKeys.length, scopeAreaKeys.length) >= draft.maxAreas;

  return (
    // `data-empty-cause` is carried forward from the EmptyState this block
    // replaces (Issue #1817 AC7), so the cause contract between this panel
    // and the map badge stays externally observable and testable.
    <div
      className="flex flex-col gap-3.5 p-4"
      data-testid="area-zero-result-recovery"
      data-empty-cause={cause}
    >
      <div
        className="rounded-xl border border-warning/50 bg-warning/10 px-4 py-3.5"
        data-testid="area-zero-recovery-banner"
      >
        <h3 className="text-base font-bold leading-tight text-foreground" data-testid="area-zero-recovery-heading">
          {heading}
        </h3>
        <p className="mt-1.5 font-mono text-xs text-[hsl(var(--text-body))]" data-testid="area-zero-recovery-scope-line">
          {scopeLine} — {filterSummary.join(' · ')}
        </p>
        <p className="mt-2 text-[12.5px] text-muted-foreground" data-testid="area-zero-recovery-note">
          {subCopy}
        </p>
      </div>

      {/* Issue #2018 slice 3 — the mock's scope-specific action block
          (`EPZero` L290-310), placed directly under the banner as the mock
          orders it (#2454 moved it above the nearby list to match). Only
          actions backed by a real seam are rendered; a mock action with no
          working implementation is left out rather than shipped inert, and is
          recorded as a named dependency in the PR's evidence table instead. */}
      {scopeKind === 'POLYGON' && onAdjustBoundary && (
        <div data-testid="area-zero-recovery-scope-actions">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Change your drawn area
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onAdjustBoundary}
              data-testid="area-zero-recovery-adjust-boundary"
            >
              Adjust boundary
            </Button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            Redrawing starts a new boundary. Your current results stay until you draw and accept a
            new one.
          </p>
        </div>
      )}

      {/* Issue #2018 slice 3 — the nearby list is AREA-shaped and is offered
          only where its relationship to the active scope can be stated
          truthfully, which is the issue's own condition ("nearby canonical-area
          suggestions only where the relationship can be explained truthfully").
          `areaSetProximityLabel` measures each candidate from the nearest
          SELECTED AREA CENTRE, so under a drawn polygon or a panned viewport
          every row would read "Adjacent to {area}" or "N km away" about an
          area that is not the scope and may not even be inside it. Rather than
          print a distance nobody asked about, these scopes get filter recovery
          only — which is also what the mock does (`EPZero` L290-310 gives
          POLYGON and VIEWPORT their own action blocks and no nearby list). */}
      {!isAreaScope ? null : nearbyLoading ? (
        <p className="px-1 text-xs text-muted-foreground" data-testid="area-zero-recovery-nearby-loading">
          Looking for nearby areas…
        </p>
      ) : suggestions.length > 0 ? (
        <div data-testid="area-zero-recovery-nearby">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Nearby areas with matches — your filters
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {suggestions.map((candidate) => (
              <div
                key={candidate.areaKey}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                data-testid={`area-zero-recovery-nearby-${candidate.areaKey}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-foreground">{candidate.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {areaSetProximityLabel(candidate, selectedAreaGeoByKey)}
                  </span>
                </span>
                <span
                  className="shrink-0 font-mono text-[12.5px] font-bold text-copper"
                  data-testid={`area-zero-recovery-nearby-${candidate.areaKey}-count`}
                >
                  {candidate.eligibleListingCount} {candidate.eligibleListingCount === 1 ? 'listing' : 'listings'}
                </span>
                <Button
                  variant="default"
                  size="sm"
                  disabled={atLimit}
                  className="h-7 shrink-0 rounded-full px-3.5 text-xs font-bold"
                  title={
                    atLimit
                      ? `Maximum of ${draft.maxAreas} areas reached — remove one to add another.`
                      : undefined
                  }
                  onClick={() => handleAdd(candidate.areaKey)}
                  data-testid={`area-zero-recovery-nearby-${candidate.areaKey}-add`}
                >
                  Add
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            Add opens your selected areas as a draft — the search only changes when you show the listings.
          </p>
        </div>
      ) : (
        <p
          className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          data-testid="area-zero-recovery-nearby-empty"
        >
          No nearby area has matches with these filters either. Changing a filter is the honest next step.
        </p>
      )}

      {/*
        `EPZero` L330-342 — "Change one filter", between the nearby list and the
        actions row, exactly as the mock orders it.

        Rendered only when there is a filter owner AND the server returned at
        least one offer. A relaxation that still yields zero never reaches here:
        the endpoint omits it rather than returning a "→ 0 listings" row that
        demonstrably does not help.

        Each row is a real <button>, so it is keyboard-reachable and announced
        as an action, and its count reuses the mono/copper treatment the nearby
        rows directly above already use — same block, same visual grammar, no
        new variant. The noun is "listing(s)" to match those adjacent rows and
        the mock, rather than the banner's "homes"/"rentals".
      */}
      {/* Issue #2454 — rendered for every scope kind whose counts are
          truthful. `relaxations` is already empty unless `canOfferRelaxations`
          and `relaxationsAreForThisScope` both hold (see above), so a
          signed-out POLYGON or a reply for another scope kind never reaches
          this block. */}
      {onApplyFilters && relaxations.length > 0 && (
        <div data-testid="area-zero-recovery-relaxations">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Change one filter
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {relaxations.map((preview) => (
              <button
                key={preview.kind}
                type="button"
                onClick={() => onApplyFilters(applyRelaxationPreview(filters, preview))}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                data-testid={`area-zero-recovery-relaxation-${preview.kind}`}
              >
                <span className="text-[13.5px] font-semibold text-foreground">
                  {relaxationLabel(preview, filters, intent)}
                </span>
                <span
                  className="shrink-0 font-mono text-[12.5px] font-bold text-copper"
                  data-testid={`area-zero-recovery-relaxation-${preview.kind}-count`}
                >
                  {preview.resultingCount} {preview.resultingCount === 1 ? 'listing' : 'listings'}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            Each option changes one filter only. {scopeStaysCopy}
          </p>
        </div>
      )}

      {(onClearFilters || onClearSearch) && (
        <div className="flex flex-wrap items-center gap-2" data-testid="area-zero-recovery-actions">
          {onClearSearch && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearSearch}
              data-testid="area-zero-recovery-clear-search"
            >
              Clear search
            </Button>
          )}
          {onClearFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearFilters}
              data-testid="area-zero-recovery-clear-filters"
            >
              Clear filters
            </Button>
          )}
          <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {scopeStaysCopy}
          </span>
        </div>
      )}
    </div>
  );
}
