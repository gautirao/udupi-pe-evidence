import React from 'react';
import { ChevronRight, Layers, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { PanelHeader } from '../PanelHeader';
import { AreaGroupSelectedPanel } from './AreaGroupSelectedPanel';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

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
}

function Stat({ value, label, accent = false }: StatProps) {
  return (
    <div className="flex flex-col">
      <span
        className={cn(
          'text-lg font-bold leading-none tabular-nums',
          accent ? 'text-copper' : 'text-foreground',
        )}
      >
        {value}
      </span>
      <span className="mt-1 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ─── Loading skeletons ────────────────────────────────────────────────────────

function GroupCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-3 w-1/3" />
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
}

function AreaGroupsIntro({ groupCount, areaCount, forSaleCount }: AreaGroupsIntroProps) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid="area-groups-intro"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-copper-tint text-copper">
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">
            Explore by neighbourhood
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Start with a neighbourhood group, then narrow down to a local area to
            see the homes inside it.
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-7 border-t border-border pt-3">
        <Stat value={groupCount} label={groupCount === 1 ? 'group' : 'groups'} />
        <Stat value={areaCount} label={areaCount === 1 ? 'area' : 'areas'} />
        {forSaleCount != null && (
          <Stat value={forSaleCount} label="for sale" accent />
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
}

function GroupCard({ group, onSelect, isSelected, forSale }: GroupCardProps) {
  const areaCount = group.area_keys.length;

  return (
    <button
      type="button"
      className={cn(
        'group w-full text-left rounded-xl p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'border-2 border-primary bg-muted shadow-sm'
          : 'border border-border bg-card hover:border-copper/40 hover:shadow-sm',
      )}
      onClick={() => onSelect(group.id)}
      aria-current={isSelected ? 'true' : undefined}
      aria-label={`Select group ${group.name}${group.region_label ? `, ${group.region_label}` : ''}, ${areaCount} area${areaCount === 1 ? '' : 's'}`}
      data-testid={`area-group-card-${group.id}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Layers className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm text-foreground truncate">{group.name}</p>
            <span className="shrink-0 text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">
              {areaCount} area{areaCount === 1 ? '' : 's'}
            </span>
          </div>
          {group.subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{group.subtitle}</p>
          )}
          {group.region_label && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {group.region_label}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
        {forSale != null ? (
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-copper tabular-nums">{forSale}</span>{' '}
            home{forSale === 1 ? '' : 's'} for sale
          </span>
        ) : (
          <span />
        )}
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground transition-colors group-hover:text-copper">
          Explore group
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
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
  fallbackAreas = [],
  onSelectArea,
}: AreaGroupsLandingPanelProps) {
  // Issue #1178 — a groupId is "active" only when it is a non-blank string.
  // Trim guards against whitespace-only deep links (e.g. `?groupId=%20`), which
  // must behave like normal browse (no highlight, no message). Store the trimmed
  // value so padded-but-valid deep links (e.g. `?groupId=%20group-A%20`) still
  // match `g.id` and highlight instead of showing the invalid-group notice.
  const activeGroupId = groupId?.trim() || null;
  const focusedGroup = activeGroupId
    ? groups.find((g) => g.id === activeGroupId) ?? null
    : null;

  // Show the non-alarming "not available" notice only once groups have loaded and
  // the active groupId matched nothing. The `!isLoading` gate prevents the message
  // flashing during the cold-load window, and `groups.length > 0` keeps the
  // Browse-all fallback (no-groups) path untouched.
  const showInvalidGroupMessage =
    !isLoading && !!activeGroupId && !focusedGroup && groups.length > 0;

  // Issue #1483 — Level-2: when a valid group is resolved, build the area rows by
  // joining focusedGroup.area_keys against the discoverAreas passed as fallbackAreas.
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
  //
  // The casts below are safe: showLevel2 being true guarantees onSelectArea is defined
  // (checked above) and focusedGroup is non-null (checked above). TypeScript cannot
  // narrow the discriminated union through the boolean flag, so we assert explicitly
  // rather than re-checking inline.
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
    for (const g of groups) for (const k of g.area_keys) set.add(k);
    return set;
  }, [groups]);
  const totalAreaCount = distinctAreaKeys.size;
  const totalForSale = React.useMemo(
    () => forSaleForKeys([...distinctAreaKeys], listingIndex),
    [distinctAreaKeys, listingIndex],
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
          onBack={onClearGroup}
          onStartOver={onStartOver}
          // onSelectArea cast: safe — showLevel2 guarantees it is defined (see comment above).
          onSelectArea={onSelectArea as (areaKey: string) => void}
        />
      </div>
    );
  }

  return (
    <>
      <PanelHeader
        title="Select area"
        journey="area-first"
        onStartOver={onStartOver}
      />

      <div
        className="flex-1 overflow-y-auto"
        aria-busy={isLoading}
        aria-label="Area groups"
      >
        {isLoading ? (
          <div className="space-y-3 p-4" data-testid="area-groups-loading">
            {[0, 1, 2, 3].map((i) => (
              <GroupCardSkeleton key={i} />
            ))}
          </div>
        ) : groups.length > 0 ? (
          // ── Level 1: no resolved group (or invalid groupId) → show group cards ─
          <div className="space-y-3 p-4" data-testid="area-groups-list">
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
              groupCount={groups.length}
              areaCount={totalAreaCount}
              forSaleCount={totalForSale}
            />

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Neighbourhood groups
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {groups.length} group{groups.length === 1 ? '' : 's'}
              </span>
            </div>

            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                onSelect={onSelectGroup}
                isSelected={group.id === focusedGroup?.id}
                forSale={forSaleForKeys(group.area_keys, listingIndex)}
              />
            ))}
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
    </>
  );
}
