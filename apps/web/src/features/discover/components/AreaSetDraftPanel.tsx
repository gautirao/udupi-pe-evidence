import { useMemo } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/discover/chips/Chip';
import { useDiscoverNav, useDiscoverActions, useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { useAreaSetDraftContext } from '@/features/discover/state/AreaSetDraftContext';
import { areaSetProximityLabel, type SelectedAreaGeo } from '@/features/discover/utils/areaSetProximity';
import { DEFAULT_CITY } from '@/lib/localityUtils';

/**
 * Issue #2017 — desktop in-panel AREA_SET draft view (owner-directed rework,
 * PR #2424). The design mock's desktop "Add nearby areas" flow REPLACES the
 * right panel's own content with this draft view — it is not a floating
 * overlay on the map. `AreaSetChips.tsx`'s map-anchored popover previously
 * approximated this same mock content on desktop too (a judgment call from
 * an earlier pass, since superseded by an explicit owner ruling): keep that
 * popover for MOBILE (where map and panel are the same single-column
 * surface, so a popover reads correctly), but on desktop render THIS
 * component in place of `AreaSelectedPanel` instead.
 *
 * Shares the same `useAreaSetDraftContext()` state AreaSetChips.tsx reads —
 * one draft, two presentations, gated by `DiscoverRightPanel`'s
 * `isAreaSetDraftOpen` + `isMobileShell` check. Mirrors AreaSetChips.tsx's
 * candidate-row/commit logic closely; the one deliberate structural
 * difference (per the mock, live-verified at 1366x768) is a 2-column grid of
 * candidate cards here vs. AreaSetChips's single column (its floating panel
 * is narrow — `w-[22rem]` — and stays single-column on both viewports,
 * matching the mock's own 1-column mobile treatment).
 */
export function AreaSetDraftPanel() {
  const nav = useDiscoverNav();
  const actions = useDiscoverActions();
  const shell = useDiscoverShell();
  const { data } = useDiscoverAreas(nav.city || DEFAULT_CITY);
  const areas = data?.areas ?? [];

  const {
    view: draft,
    commands,
    nearbyFilters,
    data: nearbyData,
    isLoading: suggestionsLoading,
  } = useAreaSetDraftContext();
  const suggestions = nearbyData?.candidates ?? [];

  const labelByKey = useMemo(() => {
    const map = new Map<string, string>();
    areas.forEach((area) => map.set(area.areaKey, area.name));
    return map;
  }, [areas]);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        (nearbyFilters.propertyTypes && nearbyFilters.propertyTypes.length > 0) ||
          (nearbyFilters.bedrooms && nearbyFilters.bedrooms.length > 0) ||
          nearbyFilters.priceMin !== undefined ||
          nearbyFilters.priceMax !== undefined ||
          (nearbyFilters.sellerTypes && nearbyFilters.sellerTypes.length > 0) ||
          (nearbyFilters.boardFilters && nearbyFilters.boardFilters.length > 0) ||
          (nearbyFilters.categoryFilters && nearbyFilters.categoryFilters.length > 0) ||
          nearbyFilters.backOnMarket === true ||
          nearbyFilters.newToMarket === true ||
          nearbyFilters.reraRegistered === true ||
          nearbyFilters.readyToMove === true ||
          nearbyFilters.dateFrom !== undefined ||
          nearbyFilters.dateTo !== undefined,
      ),
    [nearbyFilters],
  );

  const selectedAreaGeoByKey = useMemo(() => {
    const map = new Map<string, SelectedAreaGeo>();
    areas.forEach((area) => {
      if (draft.draftAreaKeys.includes(area.areaKey)) {
        map.set(area.areaKey, { name: area.name, lat: area.geoCenterLat, lon: area.geoCenterLon });
      }
    });
    return map;
  }, [areas, draft.draftAreaKeys]);

  // Issue #2017 fix (truthfulness) — no fabricated combined count; see
  // AreaSetChips.tsx's identical comment for the full rationale.
  const combinedTotalLabel = draft.draftAreaKeys.map((key) => labelByKey.get(key) ?? key).join(' + ');

  const handleCommit = () => {
    const areaKeys = draft.draftAreaKeys.slice(0, draft.maxAreas);
    if (areaKeys.length === 0) return;
    actions.commitAreaSet(areaKeys, { primaryAreaKey: areaKeys[0] });
    shell.closeAreaSetDraft();
  };

  // Team-lead review (post-#2017 desktop rework) — every non-commit close of
  // this draft ("Back to areas", the bottom "Cancel" button) must discard
  // any uncommitted edits via commands.resetToCommitted(), or a reopen would
  // silently inherit an area that was added but never committed. See
  // AreaSetDraftCommands.resetToCommitted's doc for the full rationale.
  const handleCancelDraft = () => {
    commands.resetToCommitted();
    shell.closeAreaSetDraft();
  };

  return (
    <div className="discover-panel-container flex flex-1 flex-col overflow-y-auto" data-testid="area-set-draft-panel">
      <div className="border-b border-border/60 bg-background/95 px-4 py-2.5">
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          onClick={handleCancelDraft}
          data-testid="area-set-draft-panel-back"
        >
          <span aria-hidden="true">‹</span> Back to areas
        </button>
      </div>

      <div className="px-4 pb-3 pt-3.5">
        <div className="mb-3 border-b border-border pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-copper">
            Draft selection · {draft.draftAreaKeys.length} of {draft.maxAreas} selected
          </p>
          <div className="mt-1 flex items-start justify-between gap-2">
            <h3 className="font-serif text-lg font-semibold text-foreground">Add nearby areas</h3>
            <div className="shrink-0 text-right leading-tight">
              <p className="font-mono text-lg font-semibold text-foreground">
                {draft.draftAreaKeys.length} of {draft.maxAreas}
              </p>
              <p className="text-[10px] text-muted-foreground whitespace-nowrap">areas selected</p>
            </div>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {draft.draftAreaKeys.map((areaKey) => (
            <Chip
              key={areaKey}
              id={areaKey}
              icon={<span className="text-[10px] font-bold leading-none">A</span>}
              label={labelByKey.get(areaKey) ?? areaKey}
              onClear={() => commands.remove(areaKey)}
              testId={`area-set-draft-panel-chip-${areaKey}`}
              dismissTestId={`area-set-draft-panel-chip-${areaKey}-dismiss`}
              tabIndex={0}
              onFocus={() => {}}
              onArrow={() => {}}
              chipRef={() => {}}
            />
          ))}
        </div>

        <div className="mb-2 flex items-baseline justify-between gap-2 border-t border-border pt-3">
          <p
            className={
              draft.atLimit
                ? 'text-[10px] font-semibold uppercase tracking-wide text-copper'
                : 'text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'
            }
          >
            {draft.atLimit ? `Maximum of ${draft.maxAreas} areas reached` : 'Nearby areas'}
          </p>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {draft.draftAreaKeys.length} of {draft.maxAreas} selected
          </span>
        </div>

        {draft.atLimit && (
          <div
            className="mb-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-[11px] font-medium text-warning-foreground"
            data-testid="area-set-draft-panel-atlimit-notice"
          >
            Maximum of {draft.maxAreas} areas reached — remove one to add another.
          </div>
        )}

        {suggestionsLoading ? (
          <div className="px-1 py-2 text-xs text-muted-foreground" data-testid="area-set-draft-panel-suggestions-loading">
            Loading nearby areas…
          </div>
        ) : suggestions.length === 0 && hasActiveFilters ? (
          <div
            className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-xs text-warning-foreground"
            data-testid="area-set-draft-panel-suggestions-filtered-empty"
          >
            No area here has a listing that matches your filters.{' '}
            <button
              type="button"
              className="font-medium text-copper underline-offset-2 hover:underline"
              onClick={() => actions.clearAllFiltersAndSearch()}
              data-testid="area-set-draft-panel-suggestions-reset-filters"
            >
              Reset filters
            </button>
          </div>
        ) : suggestions.length === 0 ? (
          <div
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
            data-testid="area-set-draft-panel-suggestions-empty"
          >
            No nearby areas to suggest
          </div>
        ) : (
          // Issue #2017 desktop rework — 2-column grid of candidate cards,
          // matching the mock's desktop layout (`sm:grid-cols-2`; single
          // column below that, matching the mock's mobile treatment too, for
          // any narrow window that reaches this in-panel component).
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="area-set-draft-panel-suggestions">
            {suggestions.map((candidate) => (
              <div
                key={candidate.areaKey}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-xs transition-colors hover:border-primary/40"
                data-testid={`area-set-draft-panel-suggestion-${candidate.areaKey}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{candidate.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {areaSetProximityLabel(candidate, selectedAreaGeoByKey)}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {candidate.eligibleListingCount} listings · {candidate.schoolCount} schools
                  </p>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  className={
                    draft.atLimit
                      ? 'h-7 shrink-0 rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground opacity-50'
                      : 'h-7 shrink-0 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90'
                  }
                  aria-disabled={draft.atLimit}
                  onClick={() => {
                    if (draft.atLimit) return;
                    commands.addCandidate(candidate);
                  }}
                  data-testid={`area-set-draft-panel-suggestion-${candidate.areaKey}-add`}
                >
                  Add
                </Button>
              </div>
            ))}
          </div>
        )}

        <div
          className="mt-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground"
          data-testid="area-set-draft-panel-note"
        >
          This is a draft — nothing changes until you press Show listings.
        </div>

        {draft.isDirty && (
          <div className="mt-3 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                className="h-9 flex-1 gap-1.5 rounded-full bg-copper text-sm font-semibold text-copper-foreground hover:bg-copper-hover"
                onClick={handleCommit}
                data-testid="area-set-draft-panel-commit-cta"
              >
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                Show listings
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-full text-sm"
                onClick={handleCancelDraft}
                data-testid="area-set-draft-panel-cancel"
              >
                Cancel
              </Button>
            </div>
            <p className="mt-2 truncate text-center text-[11px] text-muted-foreground">
              {`Includes ${combinedTotalLabel}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
