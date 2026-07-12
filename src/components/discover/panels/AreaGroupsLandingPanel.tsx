import React from 'react';
import { ArrowRight, Building, ChevronRight, Layers, MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { CitySelect } from '../CitySelect';
import { IntentSelector } from '../IntentSelector';
import { AreaGroupSelectedPanel } from './AreaGroupSelectedPanel';
import { ScopedSearch } from '../ScopedSearch';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { DiscoverIntent, DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import {
  matchesMacroRegion,
  getGroupMacroRegionLabel,
  type SummaryRegionRef,
} from '@/utils/macroRegionResolver';
import { formatMemberAreaSummary, buildAreaNameIndex } from '@/utils/areaNameSummary';
import { resolveActiveDiscoverGroup } from '@/utils/discoverLayerRegistry';
import { TrustStrip } from './_shared';
import { StartOverButton } from '../StartOverButton';

// Shared uppercase eyebrow for the in-panel control labels (mirrors GuidedEntryPanel).
const CONTROL_EYEBROW = 'text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Discriminated union: when fallbackAreas is supplied (possibly non-empty),
 * onSelectArea must also be supplied so Browse-all buttons are never silent no-ops.
 * When fallbackAreas is omitted the component renders the no-areas empty state.
 */
export type AreaGroupsLandingPanelProps = {
  groups: AreaGroup[];
  isLoading: boolean;
  onSelectGroup: (groupId: string) => void;
  onStartOver: () => void;
  /**
   * Issue #1178 — the active groupId from the URL (deep-link). When it matches a
   * loaded group, that group's card is highlighted. When it is a non-empty value
   * that matches no loaded group, a non-alarming "not available" message is shown.
   */
  groupId?: string | null;
  /**
   * Issue #1483 — clears the active groupId, returning from Level-2 area list
   * back to the Level-1 group-card list. Called by the "up to all groups" affordance.
   * When omitted the affordance is not rendered (safe for contexts without group support).
   */
  onClearGroup?: () => void;
  /**
   * Issue #1595 — human-readable city label (e.g. "Udupi") used by the Level-2
   * selected-group drill-down for the breadcrumb + "Choose an area in {city}" heading.
   * Falls back to a neutral label when omitted so non-city contexts (tests) render cleanly.
   */
  cityLabel?: string;
  /**
   * Issue #1597 — "View all" CTA callback for AreaGroupSelectedPanel.
   * When provided, the CTA navigates to the real group-results state (server-filtered
   * list + map). Threaded from DiscoverRightPanel → AreaGroupsLandingPanel → AreaGroupSelectedPanel.
   */
  onViewAllResults?: () => void;
  /**
   * Issue #1745 4-level hierarchy — active residential scope (macro region key/slug).
   * When present, filters the displayed groups to only those in the matching macro region.
   */
  scope?: string | null;
  /**
   * Issue #1745 4-level hierarchy — callback to clear or change the active scope.
   */
  onClearScope?: () => void;
  /**
   * Issue #1745 4-level hierarchy — summary regions from /api/discover/summary for safe
   * scope-to-regionLabel matching without hardcoded city names.
   */
  summaryRegions?: SummaryRegionRef[];
  /**
   * Issue #1745 4-level hierarchy — navigate back to a macro region from Level-2.
   */
  onBackToRegion?: (regionLabel: string) => void;
  /**
   * Issue #1607 — city + Buy/Rent controls live inside the panel (mock parity, mirrors
   * GuidedEntryPanel). All four must be supplied together to render the controls card;
   * when any is omitted (e.g. unit tests) the card is simply not shown — the existing
   * URL-state controls are unchanged, only their placement moves off the map.
   */
  city?: string;
  onCityChange?: (city: string) => void;
  intent?: DiscoverIntent;
  onIntentChange?: (intent: DiscoverIntent) => void;
  onSelectJourney?: (journey: DiscoverJourney) => void;
  onSelectSchool?: (schoolId: string) => void;
  /**
   * Issue #1798 PR-B — fired with the live search query as the user types in
   * ScopedSearch (area mode only, Level-1 and Level-2). Forwarded unchanged to
   * MapDiscovery so matching area markers can be promoted on the map.
   */
  onSearchQueryChange?: (query: string) => void;
  /**
   * Issue #1798 PR-B — "Showing X of N areas on the map" counts from the map's
   * area-marker bucketing. Forwarded to the Level-2 AreaGroupSelectedPanel only
   * (the note is not shown on the Level-1 group-card list).
   */
  shownAreaCount?: number;
  totalAreaMarkerCount?: number;
  /**
   * Issue #1798 PR-B — fired with the hovered/unhovered area's key from the
   * Level-2 locality list, so the map can emphasise the matching marker.
   * Never triggers camera movement.
   */
  onAreaHover?: (areaKey: string | null) => void;
  /**
   * Issue #1806 (FIX-5e) — member-area keys to highlight in the Level-2
   * AreaGroupSelectedPanel, fired by a non-splittable area-cluster chip
   * click on the map. Forwarded unchanged; not applicable at Level-1.
   */
  highlightedAreaKeys?: string[];
} & (
  | { fallbackAreas: DiscoverArea[]; onSelectArea: (areaKey: string) => void }
  | { fallbackAreas?: never; onSelectArea?: never }
);

// ─── Derived-metric helpers ─────────────────────────────────────────────────
//
// Truthful aggregation only: per-group "for sale" counts are derived by summing
// the real DiscoverArea.listingCount of the areas that belong to the group
// (matched by areaKey) — the same join the Level-2 area list already relies on.
// When NONE of a group's area_keys resolve to a loaded area (or no areas were
// supplied at all), the count is reported as null and the figure is simply not
// shown — never fabricated.

function buildListingIndex(areas: DiscoverArea[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const area of areas) {
    index.set(area.areaKey, area.listingCount);
  }
  return index;
}

function forSaleForKeys(
  areaKeys: string[],
  listingIndex: Map<string, number>,
): number | null {
  let sum = 0;
  let matched = 0;
  for (const key of areaKeys) {
    const count = listingIndex.get(key);
    if (count != null) {
      sum += count;
      matched += 1;
    }
  }
  return matched > 0 ? sum : null;
}

// ─── Summary stat tile ──────────────────────────────────────────────────────

interface StatProps {
  value: number;
  label: string;
  accent?: boolean;
  /** Adds the mock's hairline divider + left padding (used for the 2nd/3rd tiles). */
  divider?: boolean;
  dark?: boolean;
}

function Stat({ value, label, accent = false, divider = false, dark = false }: StatProps) {
  return (
    <div className={cn('flex min-w-0 flex-col', divider && (dark ? 'border-l border-slate-800 pl-4' : 'border-l border-border pl-4'))}>
      <span
        className={cn(
          'font-mono text-xl font-bold leading-none tracking-tight tabular-nums',
          accent ? 'text-copper' : dark ? 'text-white' : 'text-foreground',
        )}
      >
        {value}
      </span>
      <span className={cn('mt-1.5 text-xs', dark ? 'text-slate-400' : 'text-muted-foreground')}>{label}</span>
    </div>
  );
}

// ─── Loading skeletons ────────────────────────────────────────────────────────

function GroupCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3.5">
      <div className="flex items-start gap-3.5">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  );
}

function LandingSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2">
          <GroupCardSkeleton />
          <GroupCardSkeleton />
          <GroupCardSkeleton />
          <GroupCardSkeleton />
        </div>
      </div>
    </div>
  );
}

// ─── Browse-all fallback ──────────────────────────────────────────────────────

interface BrowseAllFallbackProps {
  areas: DiscoverArea[];
  onSelectArea: (areaKey: string) => void;
}

function BrowseAllFallback({ areas, onSelectArea }: BrowseAllFallbackProps) {
  if (areas.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 px-4 text-center"
        role="status"
        aria-label="No areas available"
      >
        <MapPin className="h-8 w-8 text-muted-foreground/40 mb-3" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground mb-1">No areas found</p>
        <p className="text-xs text-muted-foreground">
          No neighbourhoods are available for this city yet.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Browse all areas
      </p>
      <ul className="space-y-2" role="list" aria-label="All areas in city">
        {areas.map((area) => (
          <li key={area.areaKey}>
            <button
              type="button"
              className="group w-full flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition-all hover:border-copper/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onSelectArea(area.areaKey)}
              aria-label={`Browse ${area.name}, ${area.listingCount} listing${area.listingCount === 1 ? '' : 's'}`}
              data-testid={`browse-all-area-${area.areaKey}`}
            >
              <span className="min-w-0 flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-sm font-medium text-foreground truncate">
                  {area.name}
                </span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {area.listingCount} listing{area.listingCount === 1 ? '' : 's'}
                </span>
                <ChevronRight
                  className="h-4 w-4 text-muted-foreground/50 transition-colors group-hover:text-copper"
                  aria-hidden="true"
                />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Intro / summary card ──────────────────────────────────────────────────────

interface AreaGroupsIntroProps {
  groupCount: number;
  areaCount: number;
  forSaleCount: number | null;
  /** City label used for the mock's "Browse {city} localities…" copy. */
  cityLabel: string;
  /** Issue #1765 — active residential scope label for north-scoped area-first polish. */
  activeScopeLabel?: string | null;
}

function AreaGroupsIntro({ groupCount, areaCount, forSaleCount, cityLabel, activeScopeLabel }: AreaGroupsIntroProps) {
  const displayCity = cityLabel && cityLabel !== 'this city' ? cityLabel : 'Bangalore';
  const titleText = activeScopeLabel
    ? `Area groups in ${activeScopeLabel}`
    : `Area groups across ${displayCity}`;

  return (
    <div
      className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-lg text-white"
      data-testid="area-groups-intro"
    >
      {/* Breadcrumb / Eyebrow */}
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
        <span>Discover {displayCity}</span>
        <span className="text-slate-600">›</span>
        <span className="text-copper uppercase tracking-wider">Search by area</span>
      </div>

      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-copper-tint text-copper">
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white">
            {titleText}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">
            Pick a group to narrow to its areas{activeScopeLabel ? ` within ${activeScopeLabel}` : ''}, or jump straight to an area with search.
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 border-t border-slate-800 pt-4">
        <Stat value={groupCount} label={groupCount === 1 ? 'group' : 'groups'} dark />
        <Stat value={areaCount} label={areaCount === 1 ? 'area' : 'areas'} divider dark />
        {forSaleCount != null && (
          <Stat value={forSaleCount} label={forSaleCount === 1 ? 'property' : 'properties'} accent divider dark />
        )}
      </div>
    </div>
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

interface GroupCardProps {
  group: AreaGroup;
  onSelect: (groupId: string) => void;
  /** Issue #1178 — highlight this card as the active (deep-linked) group. */
  isSelected: boolean;
  /**
   * Derived count of homes for sale across this group's areas. Null when no
   * area data resolves (never fabricated) — the figure is then omitted.
   */
  forSale: number | null;
  /**
   * Issue #1659 — formatted member area name summary (e.g. "Whitefield, Marathahalli + 1 more").
   * Null when no area keys resolve to names; the card then falls back to subtitle.
   */
  areaNameSummary: string | null;
  /** Current buy/rent intent */
  intent?: DiscoverIntent;
}

function GroupCard({ group, onSelect, isSelected, forSale, areaNameSummary, intent }: GroupCardProps) {
  const areaCount = group.area_keys.length;

  return (
    <button
      type="button"
      className={cn(
        'group w-full text-left rounded-xl p-5 transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'border border-copper bg-copper-tint shadow-lg ring-2 ring-copper/25'
          : 'border border-border bg-card shadow-sm hover:-translate-y-0.5 hover:border-copper/60 hover:shadow-lg',
      )}
      onClick={() => onSelect(group.id)}
      aria-current={isSelected ? 'true' : undefined}
      aria-label={`Select group ${group.name}${group.region_label ? `, ${group.region_label}` : ''}, ${areaCount} area${areaCount === 1 ? '' : 's'}`}
      data-testid={`area-group-card-${group.id}`}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors',
            isSelected
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground',
          )}
        >
          <Layers className="h-[20px] w-[20px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[16px] font-bold tracking-[-0.01em] text-foreground truncate">{group.name}</p>
            <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
              {areaCount} area{areaCount === 1 ? '' : 's'}
            </span>
          </div>
          {/* Issue #1659 — show formatted member area name summary when available; fall back to subtitle when unavailable. */}
          {areaNameSummary ? (
            <p
              className="text-[12.5px] leading-relaxed text-muted-foreground mt-1 truncate"
              data-testid="group-card-area-names"
            >
              {areaNameSummary}
            </p>
          ) : group.subtitle ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground mt-1 line-clamp-2">{group.subtitle}</p>
          ) : null}
          {group.region_label && (
            <span className="mt-2.5 inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[11.5px] font-semibold text-muted-foreground">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {group.region_label}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-3.5">
        <div className="flex gap-2.5">
          <div className="flex flex-1 items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="truncate">
              <span className="font-mono text-sm font-semibold text-foreground">{areaCount}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">{areaCount === 1 ? 'area' : 'areas'}</span>
            </span>
          </div>
          <div className="flex flex-1 items-center gap-2 rounded-lg bg-copper-tint px-3 py-2">
            <Building className="h-4 w-4 text-copper shrink-0" aria-hidden="true" />
            <span className="truncate">
              {forSale === 0 ? (
                <span className="text-xs font-semibold text-muted-foreground">No listings</span>
              ) : (
                <>
                  <span className="font-mono text-sm font-semibold text-foreground">{forSale ?? 0}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{intent === 'rent' ? 'to rent' : 'for sale'}</span>
                </>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-end">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[13.5px] font-semibold transition-colors group-hover:text-copper',
              isSelected ? 'text-copper' : 'text-foreground',
            )}
          >
            Explore group
            <ArrowRight
              className={cn(
                'h-4 w-4 transition-transform group-hover:translate-x-0.5',
                isSelected && 'translate-x-0.5',
              )}
              aria-hidden="true"
            />
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function AreaGroupsLandingPanel({
  groups,
  isLoading,
  onSelectGroup,
  onStartOver,
  groupId = null,
  onClearGroup,
  cityLabel = 'this city',
  city,
  onCityChange,
  intent,
  onIntentChange,
  fallbackAreas = [],
  onSelectArea,
  onViewAllResults,
  scope,
  onClearScope,
  summaryRegions,
  onBackToRegion,
  onSelectJourney,
  onSelectSchool,
  onSearchQueryChange,
  shownAreaCount,
  totalAreaMarkerCount,
  onAreaHover,
  highlightedAreaKeys,
}: AreaGroupsLandingPanelProps) {
  // Issue #1178 — a groupId is "active" only when it is a non-blank string.
  // Trim guards against whitespace-only deep links (e.g. `?groupId=%20`), which
  // must behave like normal browse (no highlight, no message). Store the trimmed
  // value so padded-but-valid deep links (e.g. `?groupId=%20group-A%20`) still
  // match `g.id` and highlight instead of showing the invalid-group notice.
  const activeGroupId = groupId?.trim() || null;

  const activeScope = scope ?? null;
  const handleClearScope = onClearScope ?? (() => {});

  const scopedGroups = React.useMemo(() => {
    if (!activeScope) return groups;
    return groups.filter((g) => matchesMacroRegion(g.region_label, activeScope, summaryRegions));
  }, [activeScope, groups, summaryRegions]);

  const displayGroups = activeScope ? scopedGroups : groups;

  const activeScopeLabel = React.useMemo(() => {
    if (!activeScope) return null;
    const summaryMatch = summaryRegions?.find(
      (r) => r.regionKey.toLowerCase() === activeScope.toLowerCase(),
    );
    if (summaryMatch) return summaryMatch.regionLabel;
    const groupMatch = scopedGroups[0]?.region_label;
    if (groupMatch) return groupMatch;
    return activeScope.charAt(0).toUpperCase() + activeScope.slice(1);
  }, [activeScope, summaryRegions, scopedGroups]);

  const macroRegionSections = React.useMemo(() => {
    if (activeScope) return [];
    const map = new Map<string, AreaGroup[]>();
    for (const g of groups) {
      const label = getGroupMacroRegionLabel(g);
      const list = map.get(label) ?? [];
      list.push(g);
      map.set(label, list);
    }
    return Array.from(map.entries()).map(([label, groupList]) => ({
      label,
      groups: groupList,
    }));
  }, [activeScope, groups]);

  // When activeGroupId is set, find the matching group using unified resolver.
  // Issue #1483 / Issue #1178 — supports Level 2 drill-down when valid.
  const focusedGroup = React.useMemo(() => {
    return resolveActiveDiscoverGroup(groups, activeGroupId);
  }, [groups, activeGroupId]);

  // Issue #1178 — when a non-empty groupId is passed in the URL but matches no loaded group
  // (e.g. invalid/stale deep-link), we show a non-alarming notice above the group list
  // instead of rendering a broken/blank page. We only show this once groups have loaded
  // (!isLoading) so cold-load skeletons remain clean without flickering an error.
  const showInvalidGroupMessage = !isLoading && activeGroupId !== null && focusedGroup === null;

  // Level 2 entry condition: we render AreaGroupSelectedPanel only when fallbackAreas
  // (the city's discoverAreas list) and onSelectArea are provided by the parent.
  // This reuses the existing BrowseAllFallback primitive and the same
  // fallbackAreas/onSelectArea discriminated-union contract already in this component —
  // no new data model needed. The join is O(k·n) where k = area_keys (2–6) and
  // n = discoverAreas (bounded by city count, typically < 100).
  // We only enter this branch when groups have loaded (not isLoading), so cold-load
  // shows skeletons; when the group is valid (focusedGroup != null); and when the
  // discriminated union provides onSelectArea (the real runtime discriminant —
  // fallbackAreas has a default of [] so it is never undefined at runtime).
  const showLevel2 =
    !isLoading &&
    focusedGroup !== null &&
    onSelectArea !== undefined;

  // Build the Level-2 area list: keep only discoverAreas whose areaKey is in the group.
  // Entries missing from discoverAreas are silently dropped; BrowseAllFallback handles
  // the empty-list case gracefully ("No areas found").
  const level2Areas: DiscoverArea[] = showLevel2
    ? (fallbackAreas as DiscoverArea[]).filter((a) =>
        (focusedGroup as AreaGroup).area_keys.includes(a.areaKey),
      )
    : [];

  // Derived, truthful summary + per-group "for sale" figures (see helpers above).
  // Cheap to compute; bounded by city area count. Distinct area_keys across all
  // groups so a shared area is never double-counted.
  const listingIndex = React.useMemo(
    () => buildListingIndex(fallbackAreas as DiscoverArea[]),
    [fallbackAreas],
  );
  const distinctAreaKeys = React.useMemo(() => {
    const set = new Set<string>();
    for (const g of displayGroups) for (const k of g.area_keys) set.add(k);
    return set;
  }, [displayGroups]);
  const totalAreaCount = distinctAreaKeys.size;
  const totalForSale = React.useMemo(
    () => forSaleForKeys([...distinctAreaKeys], listingIndex),
    [distinctAreaKeys, listingIndex],
  );

  // Issue #1659 — area name index for member area summary on each group card.
  // Built once per fallbackAreas change; O(n) where n = city area count (< 100).
  const areaNameIndex = React.useMemo(
    () => buildAreaNameIndex(fallbackAreas as DiscoverArea[]),
    [fallbackAreas],
  );

  // ── Level 2: resolved group → rich selected-group drill-down (Issue #1595) ────
  // Owns its own header (breadcrumb + "Choose an area in {city}") and scroll body,
  // so it renders as a full-height sibling rather than inside the group-list scroller.
  if (showLevel2) {
    return (
      <div data-testid="area-group-level2" className="flex flex-1 flex-col overflow-hidden">
        <AreaGroupSelectedPanel
          group={focusedGroup as AreaGroup}
          areas={level2Areas}
          cityLabel={cityLabel}
          // Issue #1798 PR-B (Unit F) — scope this panel's ScopedSearch school search
          // to the active city, mirroring the Level-1 ScopedSearch below.
          citySlug={city}
          onBack={onClearGroup}
          onBackToRegion={onBackToRegion}
          onStartOver={onStartOver}
          // onSelectArea cast: safe — showLevel2 guarantees it is defined (see comment above).
          onSelectArea={onSelectArea as (areaKey: string) => void}
          // Issue #1597 — thread the group-results CTA callback.
          onViewAllResults={onViewAllResults}
          onSelectJourney={onSelectJourney}
          onSelectSchool={onSelectSchool}
          // Issue #1798 PR-B (Unit D) — search-promotion + panel-source-of-truth wiring.
          onSearchQueryChange={onSearchQueryChange}
          shownCount={shownAreaCount}
          totalCount={totalAreaMarkerCount}
          onAreaHover={onAreaHover}
          highlightedAreaKeys={highlightedAreaKeys}
        />
      </div>
    );
  }

  // Issue #1607 — mock-aligned hero title. When a real city label is supplied
  // (e.g. "Udupi") it reads "Choose an area in Udupi"; the neutral default keeps
  // non-city contexts (tests) clean without a dangling "in this city".
  const cityHeading =
    cityLabel && cityLabel !== 'this city'
      ? `Choose an area in ${cityLabel}`
      : 'Choose an area';

  // Issue #1607 — render the in-panel city + Buy/Rent controls card only when all four
  // control props are wired in (production). Unit tests that omit them simply skip it.
  const showControls =
    city != null && onCityChange != null && intent != null && onIntentChange != null;

  // Mock-faithful single-scroll layout (mirrors GuidedEntryPanel): the eyebrow, Fraunces
  // hero, subcopy and controls card scroll with the content instead of a compact sticky
  // header, so the panel reads like the approved area-first mock.
  return (
    <div
      className="flex-1 overflow-y-auto bg-background px-5 py-7 lg:px-11 lg:py-10"
      aria-busy={isLoading}
      aria-label="Area groups"
    >
      <div className="mx-auto max-w-[560px]">
        {/* Eyebrow row: Area-first tag + Start over */}
        <div className="mb-[14px] flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-secondary-foreground">
            <Layers className="h-[13px] w-[13px]" aria-hidden="true" />
            Area-first
          </span>
          {onStartOver && (
            // Issue #1817 (AC8) — this is the group-BROWSE landing (no specific group
            // drilled into yet), i.e. only-a-region-equivalent state, so it resets
            // directly with no confirm (design §8).
            <StartOverButton
              onStartOver={onStartOver}
              hasSubstantialState={false}
              cityLabel={cityLabel ?? ''}
              className="ml-auto h-auto gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-muted/40"
            />
          )}
        </div>

        {/* Hero */}
        <h1 className="mb-[13px] font-['Fraunces',_ui-serif,_Georgia,_serif] text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-3xl lg:text-[38px]">
          {cityHeading}
        </h1>
        <p className="mb-6 max-w-[48ch] text-[14.5px] leading-relaxed text-muted-foreground lg:text-[16px]">
          Pick a group to narrow to its areas, or jump straight to an area with search.
        </p>

        {/* Scoped Search with Area/School switch */}
        <ScopedSearch
          cityLabel={cityLabel}
          citySlug={city}
          areas={fallbackAreas}
          onSelectArea={onSelectArea}
          onSelectSchool={onSelectSchool}
          onQueryChange={onSearchQueryChange}
        />

        {/* Controls card: city + Buy/Rent (mock parity, mirrors GuidedEntryPanel) */}
        {showControls && (
          <>
            <p className="mb-4 text-[13px] text-muted-foreground">
              {intent === 'rent'
                ? 'Showing monthly rents — same properties, reworded for renting.'
                : 'Showing sale prices in ₹ across every area.'}
            </p>
            <div className="mb-8 flex flex-wrap items-end gap-3.5 rounded-xl border border-border bg-card p-4 shadow-sm">
              <label className="flex min-w-[150px] flex-1 flex-col gap-1.5">
                <span className={CONTROL_EYEBROW}>City</span>
                <CitySelect
                  value={city as string}
                  onChange={onCityChange as (city: string) => void}
                  className="h-11 w-full rounded-md border-border bg-[hsl(var(--input-bg))] px-3 text-sm font-semibold text-foreground"
                />
              </label>
              <div className="flex min-w-[150px] flex-1 flex-col gap-1.5">
                <span className={CONTROL_EYEBROW}>Looking to</span>
                <IntentSelector
                  intent={intent as DiscoverIntent}
                  onIntentChange={onIntentChange as (intent: DiscoverIntent) => void}
                  hideLabel
                  fill
                />
              </div>
            </div>
          </>
        )}

        {/* Body: skeletons → group cards → browse-all fallback */}
        {isLoading ? (
          <div className="space-y-3.5" data-testid="area-groups-loading">
            {[0, 1, 2, 3].map((i) => (
              <GroupCardSkeleton key={i} />
            ))}
          </div>
        ) : groups.length > 0 ? (
          // ── Level 1: no resolved group (or invalid groupId) → show group cards ─
          <div className="space-y-6" data-testid="area-groups-list">
            {showInvalidGroupMessage && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground"
                data-testid="area-group-invalid-message"
              >
                This group is not available. Please select a group below.
              </div>
            )}

            <AreaGroupsIntro
              groupCount={displayGroups.length}
              areaCount={totalAreaCount}
              forSaleCount={totalForSale}
              cityLabel={cityLabel}
              activeScopeLabel={activeScopeLabel}
            />

            {activeScope && (
              <div
                data-testid="macro-region-filter-banner"
                className="flex items-center justify-between rounded-xl border border-copper/30 bg-copper-tint/30 p-4 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-copper" aria-hidden="true" />
                  <span className="text-sm font-semibold text-foreground">
                    Showing zones in {activeScopeLabel}
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="clear-scope-button"
                  onClick={handleClearScope}
                  className="inline-flex items-center gap-1 rounded-md bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground shadow-sm hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear filter
                </button>
              </div>
            )}

            {activeScope ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                      Zones in {activeScopeLabel}
                    </p>
                  </div>
                  <span className="font-mono text-[11.5px] font-semibold text-muted-foreground">
                    {displayGroups.length} group{displayGroups.length === 1 ? '' : 's'}
                  </span>
                </div>

                {displayGroups.length === 0 ? (
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-8 text-center text-sm text-muted-foreground shadow-sm">
                    {activeScope === 'other' || activeScope === 'unmapped'
                      ? 'These properties belong to localities across the city that are not currently grouped into a named corridor or zone.'
                      : 'No zones found matching this region filter.'}
                  </div>
                ) : (
                  displayGroups.map((group) => (
                    <GroupCard
                      key={group.id}
                      group={group}
                      onSelect={onSelectGroup}
                      isSelected={group.id === focusedGroup?.id}
                      forSale={forSaleForKeys(group.area_keys, listingIndex)}
                      areaNameSummary={formatMemberAreaSummary(group.area_keys, areaNameIndex)}
                      intent={intent}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {macroRegionSections.map((section) => (
                  <div key={section.label} className="space-y-3" data-testid={`macro-region-section-${section.label}`}>
                    <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-copper" aria-hidden="true" />
                        <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-foreground">
                          {section.label}
                        </h3>
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                        {section.groups.length} group{section.groups.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {section.groups.map((group) => (
                        <GroupCard
                          key={group.id}
                          group={group}
                          onSelect={onSelectGroup}
                          isSelected={group.id === focusedGroup?.id}
                          forSale={forSaleForKeys(group.area_keys, listingIndex)}
                          areaNameSummary={formatMemberAreaSummary(group.area_keys, areaNameIndex)}
                          intent={intent}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Issue #1607 — trust strip (mock parity, mirrors GuidedEntryPanel). */}
            <TrustStrip />
          </div>
        ) : (
          // ── No groups: Browse-all fallback across all city areas ────────────────
          <BrowseAllFallback
            areas={fallbackAreas as DiscoverArea[]}
            // onSelectArea is guaranteed by the discriminated union when fallbackAreas is present
            onSelectArea={onSelectArea!}
          />
        )}
      </div>
    </div>
  );
}
