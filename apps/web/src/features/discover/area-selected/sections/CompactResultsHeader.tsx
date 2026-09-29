import { Search, TrendingUp, X } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { ScopeActionsMenu, type ScopeActionsMenuProps } from './ScopeActionsMenu';
import { CommittedAreaChips } from './CommittedAreaChips';
import { resolveAreaSetTitle } from '../selectors/areaSetTitle';

export interface CompactResultsHeaderProps {
  multiAreaKeys: string[] | null;
  resolvedAreasCity: string;
  count: number;
  isLoadingListings?: boolean;
  headingNoun: string;
  countNoun: string;
  areaLabel: string;
  resultScopeKind: 'AREA' | 'POLYGON' | 'VIEWPORT';
  isViewportScope: boolean;
  /** Issue #2729 §2 — the EXISTING in-scope listing search (`WorkflowGroup`'s `area-search-input`
   * state/handler, same source, never a second input). Omitted entirely (not just hidden) when
   * the caller has no search handler wired — matches every other "no dead control" gate in this
   * panel. */
  search?: {
    query: string;
    onChange: (value: string) => void;
  };
  scopeActions: Omit<ScopeActionsMenuProps, 'multiAreaKeys' | 'resultScopeKind' | 'isViewportScope'>;
  /** Issue #2729 D5 — moved here from `Toolbar`'s standalone row (own ~45px line) to reclaim
   * vertical space ahead of the first card row; same destination/href, not a new link. Omitted
   * (not just hidden) when the caller has none, matching every other "no dead control" gate. */
  trendsHref?: string;
  /** Issue #2729 R6 fix — the SAME committed-area removal handler `AreaSetSelectedHeader` (the
   * stacked layout's plural header) already uses; required whenever `multiAreaKeys` is a real
   * AREA_SET (mirrors that component's own contract), so the compact header can restore the same
   * one-click "remove this one area" chips the merge-base action row had. */
  onRemoveArea?: (areaKey: string) => void;
}

/**
 * Issue #2729 §2 — compact desktop Results header (≥1366 only; the caller gates this entirely,
 * this component has no width awareness of its own). Replaces `ResultHeading`'s eyebrow +
 * headline + action-row + sub-copy block AND `WorkflowGroup`'s in-scope search box with the
 * approved hierarchy's single two-line block:
 *
 *   Properties in Hebbal                          [search pill]
 *   42 homes for sale                             [Edit areas ▾ / Options ▾]
 *
 * NO sort control — production has no canonical sort state/handler anywhere in this codebase
 * (confirmed: no `sortBy`/`sortOrder` field on `PropertyFilters`, no sort hook), so none is
 * invented here, per the issue's explicit "do not invent fake sort/search behaviour" instruction.
 */
export function CompactResultsHeader({
  multiAreaKeys,
  resolvedAreasCity,
  count,
  isLoadingListings,
  headingNoun,
  countNoun,
  areaLabel,
  resultScopeKind,
  isViewportScope,
  search,
  scopeActions,
  trendsHref,
  onRemoveArea,
}: CompactResultsHeaderProps) {
  const isAreaSet = multiAreaKeys != null && multiAreaKeys.length > 0;

  // Issue #2017 / #2729 — same self-sourced `useDiscoverAreas(city)` convention
  // `AreaSetSelectedHeader`/`AreaSetTwoTileRow` already establish for this exact query: same
  // cache key as the panel's own unconditional call, so this is never a second network request
  // (see AreaSetTwoTileRow's doc comment for the full "why this costs no extra request" proof).
  const { data } = useDiscoverAreas(isAreaSet ? resolvedAreasCity : '');
  // Issue #2729 R1/R5/R6 fix — `resolveAreaSetTitle` is the SAME shared pure function
  // `AreaSelectedPanel` uses to broadcast `DiscoverShellContextValue.canonicalScopeLabel` for the
  // global search's idle value, so the title here and the search's idle value can never drift on
  // HOW they join names (each still self-sources its own `useDiscoverAreas` call above — same
  // cache key, not a second request).
  const areaSetTitle = useMemo(
    () => (isAreaSet && multiAreaKeys ? resolveAreaSetTitle(multiAreaKeys, data?.areas ?? []) : null),
    [isAreaSet, multiAreaKeys, data?.areas],
  );
  // R6 — the per-area removable chips the merge-base `AreaSetSelectedHeader` rendered; the compact
  // header dropped these, leaving "Clear selected areas" (clears ALL of them) as the only
  // reachable removal action. Same `DiscoverArea[]` shape `AreaSetSelectedHeader` itself resolves.
  const selectedAreas = useMemo(
    () =>
      isAreaSet && multiAreaKeys
        ? multiAreaKeys
            .map((key) => data?.areas.find((a) => a.areaKey === key))
            .filter((a): a is NonNullable<typeof a> => Boolean(a))
        : [],
    [isAreaSet, multiAreaKeys, data?.areas],
  );

  const title = isAreaSet
    ? areaSetTitle
    : isViewportScope
      ? 'On screen right now'
      : resultScopeKind === 'POLYGON'
        ? `${headingNoun} in your drawn area`
        : `${headingNoun} in ${areaLabel}`;

  const countLine = isLoadingListings ? null : `${count} ${countNoun}`;

  return (
    // Issue #2729 V2/V2b fix — additive `min-[1366px]:` tightening (py-2.5→py-1.5), part of the
    // vertical-chrome recovery; see Toolbar.tsx's matching comment for the running total.
    <div className="border-b border-border px-4 py-2.5 min-[1366px]:py-1.5" data-testid="compact-results-header">
      <div className="flex items-baseline justify-between gap-3">
        <h1
          className="min-w-0 truncate font-['Fraunces',_ui-serif,_Georgia,_serif] text-[1.35rem] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground"
          data-testid="compact-results-title"
          // Issue #2729 N1 — the title is CSS-truncated by construction (`truncate` above, working
          // as designed at narrow real-estate); `title` is the same "never lose the name, just the
          // visible glyphs" fallback the issue itself calls for, so a long scope name (e.g. "Commercial
          // properties in Sanjeevini Nagar") is always available via native tooltip/copy even on a
          // fixture where the search pill's own reduced width (below) still isn't enough.
          title={title ?? undefined}
        >
          {title}
        </h1>
        {search && (
          // Issue #2729 N1 — was a fixed `w-[180px]`; at the desktop-reskin floor this alone ate
          // enough of the row that "Commercial properties in Sanjeevini Nagar" truncated to "…Na…",
          // hiding the one thing this title exists to show. Narrower at ≥1366 (130px, still a
          // legible pill — placeholder/icon/input/clear all still fit) frees ~50px back to the
          // title, which is `min-w-0 truncate` and so absorbs whatever the pill gives up.
          <div className="relative w-[180px] shrink-0 min-[1366px]:w-[130px]">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search.query}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={`Search in ${areaLabel}`}
              aria-label={`Search properties in ${areaLabel}`}
              data-testid="compact-results-search-input"
              className="h-8 w-full rounded-full border border-border bg-card pl-8 pr-7 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {search.query && (
              <button
                type="button"
                aria-label="Clear search"
                data-testid="compact-results-search-clear"
                onClick={() => search.onChange('')}
                className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
      {/* R6 — restored per-area removable chips (one-click remove for a SINGLE committed area);
          the merge-base action row's only equivalent, "Clear selected areas", removes ALL of
          them, which is not the same affordance. Rendered only when there is at least one
          resolved area AND a remove handler — no dead control if the caller omits one. */}
      {selectedAreas.length > 0 && onRemoveArea && (
        <div className="mt-1.5">
          <CommittedAreaChips selectedAreas={selectedAreas} onRemoveArea={onRemoveArea} />
        </div>
      )}
      <div className="mt-1 flex items-center justify-between gap-3 min-[1366px]:mt-0.5">
        {countLine && (
          <p className="text-xs text-muted-foreground" data-testid="compact-results-count">
            {countLine}
          </p>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          {trendsHref && (
            <Link
              to={trendsHref}
              data-testid="compact-results-trends-link"
              className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              Trends
            </Link>
          )}
          <ScopeActionsMenu
            multiAreaKeys={multiAreaKeys}
            resultScopeKind={resultScopeKind}
            isViewportScope={isViewportScope}
            {...scopeActions}
          />
        </div>
      </div>
    </div>
  );
}
