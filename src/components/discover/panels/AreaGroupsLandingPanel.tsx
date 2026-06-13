import React from 'react';
import { ChevronLeft, LayoutGrid, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PanelHeader } from '../PanelHeader';
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
} & (
  | { fallbackAreas: DiscoverArea[]; onSelectArea: (areaKey: string) => void }
  | { fallbackAreas?: never; onSelectArea?: never }
);

// ─── Loading skeletons ────────────────────────────────────────────────────────

function GroupCardSkeleton() {
  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
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
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
        Browse all areas
      </p>
      <ul className="space-y-1" role="list" aria-label="All areas in city">
        {areas.map((area) => (
          <li key={area.areaKey}>
            <button
              type="button"
              className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onSelectArea(area.areaKey)}
              aria-label={`Browse ${area.name}, ${area.listingCount} listing${area.listingCount === 1 ? '' : 's'}`}
              data-testid={`browse-all-area-${area.areaKey}`}
            >
              <span className="font-medium truncate">{area.name}</span>
              <span className="text-xs text-muted-foreground shrink-0 ml-2">
                {area.listingCount} listing{area.listingCount === 1 ? '' : 's'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

interface GroupCardProps {
  group: AreaGroup;
  onSelect: (groupId: string) => void;
  /** Issue #1178 — highlight this card as the active (deep-linked) group. */
  isSelected: boolean;
}

function GroupCard({ group, onSelect, isSelected }: GroupCardProps) {
  const areaCount = group.area_keys.length;

  return (
    <button
      type="button"
      className={`w-full text-left rounded-lg transition-colors p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isSelected
          ? 'border-2 border-primary bg-muted'
          : 'border border-border bg-card hover:bg-muted/50'
      }`}
      onClick={() => onSelect(group.id)}
      aria-current={isSelected ? 'true' : undefined}
      aria-label={`Select group ${group.name}${group.region_label ? `, ${group.region_label}` : ''}, ${areaCount} area${areaCount === 1 ? '' : 's'}`}
      data-testid={`area-group-card-${group.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{group.name}</p>
          {group.subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{group.subtitle}</p>
          )}
          {group.region_label && (
            <p className="text-xs text-muted-foreground/70 mt-1">{group.region_label}</p>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">
          {areaCount} area{areaCount === 1 ? '' : 's'}
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
        ) : showLevel2 ? (
          // ── Level 2: resolved group → show that group's area rows ──────────────
          <div data-testid="area-group-level2" className="flex flex-col">
            {/* "Up to all groups" back affordance */}
            {onClearGroup && (
              <div className="px-4 pt-3 pb-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 px-0 text-muted-foreground hover:text-foreground"
                  onClick={onClearGroup}
                  aria-label="Back to all groups"
                  data-testid="area-group-back-to-all"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  <span className="text-sm">
                    {(focusedGroup as AreaGroup).name}
                  </span>
                </Button>
              </div>
            )}
            {/* onSelectArea cast: safe — showLevel2 guarantees it is defined (see comment above). */}
            <BrowseAllFallback
              areas={level2Areas}
              onSelectArea={onSelectArea as (areaKey: string) => void}
            />
          </div>
        ) : groups.length > 0 ? (
          // ── Level 1: no resolved group (or invalid groupId) → show group cards ─
          <div className="space-y-3 p-4" data-testid="area-groups-list">
            {showInvalidGroupMessage && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-md bg-muted p-3 text-sm text-foreground"
                data-testid="area-group-invalid-message"
              >
                This group is not available. Please select a group below.
              </div>
            )}
            <div className="flex items-center gap-2 mb-1">
              <LayoutGrid className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Neighbourhood groups
              </p>
            </div>
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                onSelect={onSelectGroup}
                isSelected={group.id === focusedGroup?.id}
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
