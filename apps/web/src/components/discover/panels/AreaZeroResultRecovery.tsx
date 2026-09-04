import { useCallback, useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { useNearbyAreaCandidates } from '@/hooks/useNearbyAreaCandidates';
import { useAreaSetDraftContext } from '@/features/discover/state/AreaSetDraftContext';
import { useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { areaSetProximityLabel, type SelectedAreaGeo } from '@/features/discover/utils/areaSetProximity';
import { summariseActiveFilters } from '../zeroRecoveryCopy';
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
 * DELIBERATELY NOT RENDERED HERE, and not stubbed:
 *   - filter-relaxation count previews (`EPZero` L330-342). The issue
 *     requires "deterministic count previews", which needs a backend
 *     count-preview endpoint that does not exist yet. A client-side guess
 *     would be exactly the dishonest number the issue forbids.
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
  onClearFilters,
  onClearSearch,
}: AreaZeroResultRecoveryProps) {
  const shell = useDiscoverShell();
  const { view: draft, commands } = useAreaSetDraftContext();
  const { data: areasData } = useDiscoverAreas(city);

  // Issue #2017's nearby contract, called with THIS surface's committed scope
  // keys rather than read off `useAreaSetDraftContext().data`. The context
  // seeds its query from the DRAFT, which is empty whenever the committed
  // scope is not an AREA_SET — i.e. exactly the single-canonical-AREA case
  // this component must also serve, where it would ask for "areas near
  // nothing". Identical `selected` keys produce an identical TanStack query
  // key, so in the AREA_SET case this shares the context's cache entry
  // instead of issuing a second request.
  const { data: nearbyData, isLoading: nearbyLoading } = useNearbyAreaCandidates(
    city,
    scopeAreaKeys,
    filters,
  );

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

  // `EPZero` L285's scope-aware heading, with one addition the mock has no
  // state for: a canonical area that is valid but genuinely holds nothing
  // must not claim filters are hiding listings that do not exist.
  const heading =
    cause === 'empty'
      ? `${scopeAreaNames[0] ?? 'This area'} has no ${noun} listed right now`
      : scopeAreaKeys.length > 1
        ? `No matching ${noun} in your ${scopeAreaKeys.length} selected areas`
        : `No matching ${noun} in ${scopeAreaNames[0] ?? 'this area'}`;

  const subCopy =
    cause === 'empty'
      ? 'This is a real area with nothing listed today, not a filtered-out result. Your search is unchanged.'
      : 'Your search is kept exactly as it is. Nothing here widens it for you.';

  const scopeLine = scopeAreaNames.length > 0 ? scopeAreaNames.join(' · ') : `${scopeAreaKeys.length} areas`;

  // Adding a candidate opens the EXISTING #2017 draft — it never commits.
  // Per the resolved mock (FUNCTIONAL_AUDIT §C2: "Add now opens a draft
  // instead of committing"), the committed result scope, the URL and browser
  // history are all untouched here; only the explicit "Show listings" /
  // "Search these areas" action commits, and that already exists.
  //
  // `openAreaSetDraft()` is the single cross-tree open signal both surfaces
  // read (see DiscoverShellContextValue's doc): on desktop the right panel
  // swaps to `AreaSetDraftPanel` in place; on mobile the paired
  // `setMobileView('MAP')` reveals the map surface where `AreaSetChips`'
  // popover lives. Copied from `AreaSelectedPanel`'s own
  // `handleAddNearbyAreas`, not a second mechanism.
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
      shell.setMobileView('MAP');
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

      {nearbyLoading ? (
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
            Your selected areas stay exactly as they are.
          </span>
        </div>
      )}
    </div>
  );
}
