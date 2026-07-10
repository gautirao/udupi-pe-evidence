import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Layers, MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { DiscoverJourney } from '@/types/discover';
import { getAreaGroupContent, getLocalityDescription } from '@/lib/discoverGroupContent';
import { ScopedSearch } from '../ScopedSearch';
import { PanelColumn } from './_shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AreaGroupSelectedPanelProps {
  /** The resolved (deep-linked / selected) neighbourhood group. */
  group: AreaGroup;
  /** Member areas already filtered to this group and resolved against live area data. */
  areas: DiscoverArea[];
  /** Human-readable city label (e.g. "Udupi") for the breadcrumb + heading. */
  cityLabel: string;
  /**
   * Active city slug (e.g. "udupi", "bangalore") used to scope this panel's
   * ScopedSearch school search to the current city/region — mirrors
   * AreaGroupsLandingPanel's citySlug threading. Optional — when omitted,
   * school search stays unscoped (prior behaviour); callers with no city
   * context should leave this unset rather than fabricate a value.
   */
  citySlug?: string;
  /**
   * Back to the all-groups (Level-1) list. When omitted the affordance is not rendered
   * (mirrors AreaGroupsLandingPanel's onClearGroup contract).
   */
  onBack?: () => void;
  /**
   * Issue #1745 4-level hierarchy — navigate back to the macro region's zone list.
   * When provided and regionLabel exists, renders the 4-level breadcrumb:
   * All zones › {regionLabel} › {group.name}
   */
  onBackToRegion?: (regionLabel: string) => void;
  /** Start over → return to journey selection. Rendered top-right when provided. */
  onStartOver?: () => void;
  /** Select a member locality → drill into its results page (PUSH areaKey). */
  onSelectArea: (areaKey: string) => void;
  /**
   * Issue #1597 — "View all" CTA callback. When provided, the CTA navigates to the
   * real group-results state (server-filtered list + map) instead of scrolling in-panel.
   * When omitted, the previous scroll-to-list behaviour is preserved (safe fallback).
   */
  onViewAllResults?: () => void;
  /** Callback to switch journey mode (e.g. from area to school). */
  onSelectJourney?: (journey: DiscoverJourney) => void;
  /** Callback when a school is selected */
  onSelectSchool?: (schoolId: string) => void;
  /**
   * Issue #1798 PR-B — fired with the live search query as the user types in this
   * panel's ScopedSearch (area mode only). Lets MapDiscovery promote matching area
   * markers on the map. Optional — omitted callers keep prior behaviour.
   */
  onSearchQueryChange?: (query: string) => void;
  /**
   * Issue #1798 PR-B — "Showing X of N areas on the map" counts from the map's
   * area-marker bucketing (AreaMarkerLayer.onMarkersComputed). Both must be present
   * and shownCount < totalCount for the note to render — counts are never fabricated
   * here, only forwarded from the map's own computed result.
   */
  shownCount?: number;
  totalCount?: number;
  /**
   * Issue #1798 PR-B — fired with the hovered/unhovered area's key so the map can
   * emphasise the matching marker. Called with null on mouse-leave. Never triggers
   * any camera movement — purely a marker-emphasis signal.
   */
  onAreaHover?: (areaKey: string | null) => void;
  /**
   * Issue #1806 (FIX-5e) — member-area keys to highlight, fired by a
   * non-splittable area-cluster chip click on the map (the camera holds
   * still for that click; this is the panel-side consequence instead).
   * The FIRST key in the array is scrolled into view. Undefined/empty =
   * no active highlight (default — every existing caller is unaffected).
   */
  highlightedAreaKeys?: string[];
}

// ─── Summary stat tile ──────────────────────────────────────────────────────

function Stat({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span
        className={cn(
          'font-mono text-xl font-bold leading-none tracking-tight tabular-nums',
          accent ? 'text-copper' : 'text-foreground',
        )}
      >
        {value}
      </span>
      <span className="mt-1.5 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ─── Locality (member-area) card ────────────────────────────────────────────
//
// Active when the locality has live properties → leads to its results page.
// Muted / passive when zero — visibly present but non-interactive (never "broken").

function LocalityCard({
  area,
  onSelectArea,
  onAreaHover,
  highlighted,
  registerRef,
}: {
  area: DiscoverArea;
  onSelectArea: (areaKey: string) => void;
  /** Issue #1798 PR-B — map-marker emphasis signal; null on mouse-leave/blur. */
  onAreaHover?: (areaKey: string | null) => void;
  /** Issue #1806 (FIX-5e) — true when this row is a member of the active non-splittable cluster click. */
  highlighted?: boolean;
  /** Issue #1806 (FIX-5e) — registers this row's DOM node so the panel can scrollIntoView the first highlighted member. */
  registerRef?: (node: HTMLLIElement | null) => void;
}) {
  const count = area.listingCount ?? 0;
  const hasProperties = count > 0;
  const description = getLocalityDescription(area.name);

  // data-testid stays `browse-all-area-${areaKey}` for both states so the existing
  // routing/e2e contract (click → onSelectArea(areaKey)) is preserved unchanged.
  const testId = `browse-all-area-${area.areaKey}`;

  if (!hasProperties) {
    return (
      <li ref={registerRef}>
        <div
          data-testid={testId}
          aria-disabled="true"
          className={cn(
            'rounded-xl border border-border/60 bg-muted/40 p-4',
            highlighted && 'ring-2 ring-copper ring-offset-2',
          )}
          onMouseEnter={() => onAreaHover?.(area.areaKey)}
          onMouseLeave={() => onAreaHover?.(null)}
        >
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground/60">
              <MapPin className="h-[20px] w-[20px]" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-bold tracking-[-0.01em] text-muted-foreground">{area.name}</p>
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground/70">
                  No properties yet
                </span>
              </div>
              {description && (
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground/70">{description}</p>
              )}
            </div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li ref={registerRef}>
      <button
        type="button"
        data-testid={testId}
        onClick={() => onSelectArea(area.areaKey)}
        onMouseEnter={() => onAreaHover?.(area.areaKey)}
        onMouseLeave={() => onAreaHover?.(null)}
        onFocus={() => onAreaHover?.(area.areaKey)}
        onBlur={() => onAreaHover?.(null)}
        aria-label={`View ${count} propert${count === 1 ? 'y' : 'ies'} in ${area.name}`}
        className={cn(
          'group w-full rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-copper/60 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          highlighted && 'ring-2 ring-copper ring-offset-2',
        )}
      >
        <div className="flex items-start gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-copper-tint text-copper">
            <MapPin className="h-[20px] w-[20px]" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold tracking-[-0.01em] text-foreground">{area.name}</p>
            {description && (
              <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{description}</p>
            )}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
              <span className="text-[12.5px] text-muted-foreground">
                <span className="font-mono font-semibold tabular-nums text-copper">{count}</span>{' '}
                propert{count === 1 ? 'y' : 'ies'}
              </span>
              <span className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-foreground transition-colors group-hover:text-copper">
                View properties
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function AreaGroupSelectedPanel({
  group,
  areas,
  cityLabel,
  citySlug,
  onBack,
  onBackToRegion,
  onStartOver,
  onSelectArea,
  onViewAllResults,
  onSelectJourney,
  onSelectSchool,
  onSearchQueryChange,
  shownCount,
  totalCount,
  onAreaHover,
  highlightedAreaKeys,
}: AreaGroupSelectedPanelProps) {
  const areasRef = useRef<HTMLDivElement | null>(null);
  // Issue #1806 (FIX-5e) — per-row refs, keyed by areaKey, so the FIRST
  // highlighted member can be scrolled into view without a full-list
  // scrollIntoView (which would jump to the top of the section instead of
  // the actual highlighted row).
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const highlightedSet = useMemo(
    () => (highlightedAreaKeys && highlightedAreaKeys.length > 0 ? new Set(highlightedAreaKeys) : null),
    [highlightedAreaKeys],
  );

  useEffect(() => {
    if (!highlightedAreaKeys || highlightedAreaKeys.length === 0) return;
    const firstKey = highlightedAreaKeys[0];
    const node = rowRefs.current.get(firstKey);
    if (node) {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    // Only re-run when the highlighted set changes — a new cluster click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedAreaKeys]);

  // Truthful aggregates — derived only from live area data (never fabricated).
  const areaCount = areas.length;
  const totalProperties = useMemo(
    () => areas.reduce((sum, a) => sum + (a.listingCount ?? 0), 0),
    [areas],
  );

  // Issue #1597 — description resolution priority:
  //   1. Backend group.description (new field, long-form copy from DB).
  //   2. group.subtitle (existing backend field, shorter form).
  //   3. discoverGroupContent adapter fallback (frontend-only, for groups without DB copy).
  // discoverGroupContent.ts is NOT deleted — it also feeds SchoolBrowsePanel and
  // AreaIndicatorOverlay; LOCALITY_DESCRIPTION is preserved for LocalityCard.
  const fallback = getAreaGroupContent(group.id);
  const description = group.description?.trim() || group.subtitle?.trim() || fallback?.description;
  const regionLabel = group.region_label?.trim() || fallback?.regionLabel;

  // Issue #1597 — "View all" CTA:
  //   - When onViewAllResults is provided: navigate to the real group-results state
  //     (server-filtered list + map). This is the primary path after #1597.
  //   - Fallback: scroll to the locality list in-panel (pre-#1597 behaviour).
  const handleViewAll = useCallback(() => {
    if (onViewAllResults) {
      onViewAllResults();
      return;
    }
    const node = areasRef.current;
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [onViewAllResults]);

  return (
    <>
      {/* ── Header: Start over, heading + "By area", back-to-all ──
          The City › Group breadcrumb lives on the map (top-left) for this step
          (Issue #1595 Option A), so it is intentionally not repeated here. */}
      <div className="sticky top-0 z-20 flex-shrink-0 flex flex-col gap-2.5 bg-background border-b border-border/50 px-4 pt-3 pb-3.5">
        {onStartOver && (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              data-testid="start-over-button"
              onClick={onStartOver}
              aria-label="Start over and return to journey selection"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-muted/40"
            >
              Start over
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="font-['Fraunces',_ui-serif,_Georgia,_serif] text-2xl font-semibold leading-tight tracking-tight text-foreground">
            Choose an area in {cityLabel}
          </h1>
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-copper-tint px-2.5 py-1 text-xs font-semibold text-copper">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            By area
          </span>
        </div>
        <p className="text-[13.5px] text-muted-foreground">
          Pick a group to narrow to its areas, or jump straight to an area with search.
        </p>

        {onBack && (
          onBackToRegion && regionLabel ? (
            <nav aria-label="Group breadcrumb" data-testid="area-group-breadcrumb" className="flex items-center gap-1.5 text-[13px] text-muted-foreground flex-wrap">
              <button
                type="button"
                onClick={onBack}
                data-testid="area-group-back-to-all"
                className="inline-flex items-center gap-1 rounded font-semibold transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>All zones</span>
              </button>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
              <button
                type="button"
                onClick={() => onBackToRegion(regionLabel)}
                data-testid="area-group-back-to-region"
                className="rounded font-semibold transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {regionLabel}
              </button>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
              <span className="font-bold text-foreground truncate max-w-[180px]" aria-current="page">
                {group.name}
              </span>
            </nav>
          ) : (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to all neighbourhood groups"
              data-testid="area-group-back-to-all"
              className="flex w-fit items-center gap-1.5 rounded text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              Back to all neighbourhood groups
            </button>
          )
        )}
      </div>

      {/* ── Body: selected-group card + member-area list ── */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
      <PanelColumn className="space-y-5">
        <ScopedSearch
          cityLabel={cityLabel}
          citySlug={citySlug}
          areas={areas}
          onSelectArea={onSelectArea}
          onSelectSchool={onSelectSchool}
          onQueryChange={onSearchQueryChange}
        />

        {/* Issue #1798 PR-B — panel-is-source-of-truth note: only when the map is
            showing fewer representative pins than the total area count (dense-group
            degradation active). Counts come straight from the map's own bucketing
            result — never recomputed or fabricated here. */}
        {shownCount != null && totalCount != null && shownCount < totalCount && (
          <p
            data-testid="area-marker-shown-of-total-note"
            className="text-xs text-muted-foreground"
          >
            Showing {shownCount} of {totalCount} areas on the map — all {totalCount} are listed below.
          </p>
        )}
        {/* Selected-group context card */}
        <article
          data-testid="area-group-selected-card"
          className="rounded-xl border border-border/70 bg-card p-5 shadow-sm"
        >
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-copper-tint text-copper">
              <Layers className="h-[20px] w-[20px]" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-['Fraunces',_ui-serif,_Georgia,_serif] text-[1.35rem] font-semibold leading-tight tracking-tight text-foreground">
                  {group.name}
                </h2>
                {regionLabel && (
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[11.5px] font-semibold text-muted-foreground">
                    {regionLabel}
                  </span>
                )}
              </div>
              {description && (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-9 border-t border-border/70 pt-3.5">
            <Stat value={areaCount} label={areaCount === 1 ? 'area' : 'areas'} />
            <Stat value={totalProperties} label="properties" accent />
          </div>

          <div className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/50 px-3.5 py-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-copper" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Choose an area below to see the properties inside it.
            </p>
          </div>

          {totalProperties > 0 && (
            <div className="mt-4 flex items-center justify-end border-t border-border/70 pt-3.5">
              <button
                type="button"
                onClick={handleViewAll}
                data-testid="area-group-view-all"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-copper transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                View all {totalProperties} properties across {group.name}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </article>

        {/* Areas inside this group */}
        <div ref={areasRef}>
          {areaCount === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-xl border border-border bg-muted/20 py-10 px-4 text-center"
              role="status"
              aria-label="No areas available"
            >
              <MapPin className="mb-3 h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
              <p className="mb-1 text-sm font-medium text-foreground">No areas found</p>
              <p className="text-xs text-muted-foreground">
                No localities are available inside {group.name} yet.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Areas inside {group.name}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {areaCount} area{areaCount === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="mt-3.5 space-y-3" role="list" aria-label={`Areas inside ${group.name}`}>
                {areas.map((area) => (
                  <LocalityCard
                    key={area.areaKey}
                    area={area}
                    onSelectArea={onSelectArea}
                    onAreaHover={onAreaHover}
                    highlighted={highlightedSet?.has(area.areaKey) ?? false}
                    registerRef={(node) => {
                      if (node) rowRefs.current.set(area.areaKey, node);
                      else rowRefs.current.delete(area.areaKey);
                    }}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </PanelColumn>
      </div>
    </>
  );
}
