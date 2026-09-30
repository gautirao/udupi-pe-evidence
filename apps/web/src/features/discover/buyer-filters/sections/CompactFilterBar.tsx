// Issue #2762 PR-B — generic extraction of the compact single-row filter toolbar pattern
// `CompactFilterToolbar.tsx` (By-area) established, so Near-a-school and Agricultural can reuse
// the identical component/visual contract with their own filter definitions instead of each
// maintaining a separate large filter panel. Journeys supply RENDER-SLOT pill groups (an id,
// label, active/collapse state, and a `renderPopover()` function that mounts the journey's own,
// unmodified filter controls) rather than a declarative field-type schema — this keeps every
// existing control (residential/commercial rows, school sections, agri controls) byte-identical;
// only their PLACEMENT becomes shared.
//
// `CompactFilterToolbar.tsx` is now a thin By-area adapter over this component (see that file).
// It must keep producing IDENTICAL DOM/testids/behaviour to before this extraction — verified by
// running `PropertyFilterGroups.compactPills.test.tsx` unmodified as the regression gate.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { FilterPill } from './PropertyFilterGroups';
import { resolveCompactFilterBarCollapse } from '@/features/discover/buyer-filters/selectors/toolbarOverflow';

/** One filter pill a journey contributes to the toolbar row. */
export interface FilterBarGroup {
  id: string;
  label: string;
  isActive?: boolean;
  /** 'filled' = solid accent background (reserved for a pill whose value is never "unset", e.g.
   * By-area's Family pill); 'tinted' (default) = the accent-tint/border-only active style every
   * other pill uses. */
  variant?: 'tinted' | 'filled';
  testId: string;
  /** Lower collapses first under width pressure. Omitted/non-finite = PINNED — this group never
   * collapses into "More filters", regardless of available width. */
  collapsePriority?: number;
  /** Mounts the journey's own, unmodified filter controls — called when this group's inline pill
   * (or, absent `renderInOverflow`, its overflow row) is opened. */
  renderPopover: () => ReactNode;
  /** Overrides `renderPopover` specifically for the "More filters" overflow placement, when a
   * collapsed group needs different chrome there (rare — most groups can omit this). */
  renderInOverflow?: () => ReactNode;
}

/** Content that ALWAYS lives in "More filters", regardless of width (e.g. a possession toggle) —
 * never rendered as its own inline pill. */
export interface FilterBarOverflowItem {
  id: string;
  isActive?: boolean;
  render: () => ReactNode;
}

export interface CompactFilterBarProps {
  /** Pill groups, in the exact order they should render inline (left to right). */
  groups: FilterBarGroup[];
  /** Content permanently confined to "More filters" — rendered after any collapsed groups. */
  overflowOnly?: FilterBarOverflowItem[];
  /** Sets `data-accent` on the toolbar root — journey-specific accent token, never a raw hex
   * value in this component. */
  accent: 'areas' | 'schools' | 'agri';
  /** Prefix for the "More filters" trigger/badge/popover testids. Defaults to the literal ids
   * `CompactFilterToolbar` already used before this extraction, so By-area's adapter needs no
   * override to stay byte-identical. */
  testIdPrefix?: string;
  ariaLabel?: string;
  /** Built once by the caller — identical across layouts, mounted below the pill row. */
  selectedChipsNode?: ReactNode;
}

export function CompactFilterBar({
  groups,
  overflowOnly = [],
  accent,
  testIdPrefix = 'filter-toolbar',
  ariaLabel = 'Property filters',
  selectedChipsNode,
}: CompactFilterBarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !toolbarRef.current) return;
    const el = toolbarRef.current;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setAvailableWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pinned = groups.filter((g) => g.collapsePriority == null || !Number.isFinite(g.collapsePriority));
  const collapsible = groups
    .filter((g) => g.collapsePriority != null && Number.isFinite(g.collapsePriority))
    .sort((a, b) => (a.collapsePriority as number) - (b.collapsePriority as number));

  const collapsedIds = resolveCompactFilterBarCollapse({
    pinnedLabels: pinned.map((g) => g.label),
    collapsible: collapsible.map((g) => ({ id: g.id, label: g.label })),
    availableWidth,
  });

  const hasMoreFilters = overflowOnly.length > 0 || collapsedIds.size > 0;
  const moreFiltersActiveCount =
    groups.filter((g) => collapsedIds.has(g.id) && g.isActive).length +
    overflowOnly.filter((o) => o.isActive).length;

  const triggerTestId = `${testIdPrefix}-more-filters-trigger`;
  const countTestId = `${testIdPrefix}-more-filters-count`;
  const popoverTestId = `${testIdPrefix}-more-filters-popover`;

  return (
    <div className="border-b border-border px-4 py-1" data-design-component="filter-toolbar-compact" data-accent={accent}>
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label={ariaLabel}
        className="flex flex-nowrap items-center gap-1.5 overflow-hidden"
      >
        {groups.map((g) =>
          collapsedIds.has(g.id) ? null : (
            <FilterPill key={g.id} label={g.label} isActive={g.isActive} variant={g.variant} testId={g.testId}>
              {g.renderPopover()}
            </FilterPill>
          ),
        )}

        {hasMoreFilters && (
          <div className="ml-auto shrink-0">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid={triggerTestId}
                  className="inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  More filters
                  {moreFiltersActiveCount > 0 && (
                    <span
                      data-testid={countTestId}
                      className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background"
                    >
                      {moreFiltersActiveCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[260px] space-y-3" data-testid={popoverTestId}>
                {groups
                  .filter((g) => collapsedIds.has(g.id))
                  .map((g) => <div key={g.id}>{(g.renderInOverflow ?? g.renderPopover)()}</div>)}
                {overflowOnly.map((o) => (
                  <div key={o.id}>{o.render()}</div>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
      {selectedChipsNode}
    </div>
  );
}
