import React from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RegionalAreaGroup } from '@/hooks/useRegionalAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgriRegionalGroupsPanelProps {
  city: string;
  groups: RegionalAreaGroup[];
  isLoading: boolean;
  selectedGroup: { directionKey: string; distanceBandKey: string } | null;
  onSelectGroup: (g: { directionKey: string; distanceBandKey: string } | null) => void;
  discoverAreas?: DiscoverArea[];
  onSelectAreaKey?: (areaKey: string) => void;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function RegionalGroupSkeleton() {
  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
}

// ─── Browse-all area fallback ─────────────────────────────────────────────────

interface BrowseAreasFallbackProps {
  areas: DiscoverArea[];
  onSelectAreaKey: (areaKey: string) => void;
}

function BrowseAreasFallback({ areas, onSelectAreaKey }: BrowseAreasFallbackProps) {
  if (areas.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 px-4 text-center"
        role="status"
        aria-label="No areas available"
      >
        <MapPin className="h-8 w-8 text-muted-foreground/40 mb-3" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground mb-1">No areas found</p>
        <p className="text-xs text-muted-foreground">Try selecting a different city.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground px-1 pb-1">Browse all areas</p>
      {areas.map((area) => (
        <button
          key={area.areaKey}
          type="button"
          onClick={() => onSelectAreaKey(area.areaKey)}
          className="w-full rounded-lg border border-border bg-card hover:bg-muted/50 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Select area ${area.name}`}
        >
          <span className="text-sm font-medium text-foreground">{area.name}</span>
          {area.listingCount > 0 && (
            <span className="ml-2 text-xs text-muted-foreground">
              {area.listingCount} listing{area.listingCount !== 1 ? 's' : ''}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Group row ────────────────────────────────────────────────────────────────

interface GroupRowProps {
  group: RegionalAreaGroup;
  isSelected: boolean;
  onSelect: () => void;
  onClear: () => void;
}

function GroupRow({ group, isSelected, onSelect, onClear }: GroupRowProps) {
  return (
    <div
      data-testid="agri-regional-group-row"
      className={[
        'rounded-lg border px-4 py-3 transition-colors cursor-pointer',
        isSelected
          ? 'border-green-500 bg-green-50 dark:bg-green-950/20 ring-2 ring-green-500'
          : 'border-border bg-card hover:bg-muted/50',
      ].join(' ')}
      onClick={isSelected ? undefined : onSelect}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Select regional group ${group.label}`}
      onKeyDown={(e) => {
        if (!isSelected && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span
            data-testid="agri-regional-group-label"
            className="text-sm font-medium text-foreground"
          >
            {group.label}
          </span>
          <span
            data-testid="agri-regional-group-count"
            className="text-xs text-muted-foreground"
          >
            {group.listingCount} listing{group.listingCount !== 1 ? 's' : ''}
          </span>
          {typeof group.agriAcreage === 'number' && group.agriAcreage > 0 && (
            <span
              data-testid="agri-regional-group-acreage"
              className="text-xs text-muted-foreground"
            >
              {group.agriAcreage.toFixed(1)} acres
            </span>
          )}
        </div>
        {isSelected && (
          <Button
            data-testid="agri-regional-group-clear"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30"
            aria-label="Clear regional group selection"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function AgriRegionalGroupsPanel({
  city: _city,
  groups,
  isLoading,
  selectedGroup,
  onSelectGroup,
  discoverAreas,
  onSelectAreaKey,
}: AgriRegionalGroupsPanelProps) {
  // ── Loading ──
  if (isLoading) {
    return (
      <div
        data-testid="agri-regional-groups-loading"
        className="flex flex-col gap-3 p-4"
        aria-busy="true"
        aria-label="Loading agricultural regional groups"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground pb-1">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Loading regions…</span>
        </div>
        {[0, 1, 2].map((i) => (
          <RegionalGroupSkeleton key={i} />
        ))}
      </div>
    );
  }

  // ── Empty ──
  if (groups.length === 0) {
    return (
      <div
        data-testid="agri-regional-groups-empty"
        className="flex flex-col gap-3 p-4"
      >
        <p className="text-sm text-muted-foreground">
          No regional groupings found. Browse individual areas below.
        </p>
        {discoverAreas && onSelectAreaKey ? (
          <BrowseAreasFallback areas={discoverAreas} onSelectAreaKey={onSelectAreaKey} />
        ) : null}
      </div>
    );
  }

  // ── Groups list ──
  return (
    <div
      data-testid="agri-regional-groups"
      className="flex flex-col gap-2 p-4"
      aria-label="Agricultural regional groups"
    >
      {groups.map((group) => {
        const isSelected =
          selectedGroup !== null &&
          selectedGroup.directionKey === group.directionKey &&
          selectedGroup.distanceBandKey === group.distanceBandKey;

        return (
          <GroupRow
            key={`${group.directionKey}:${group.distanceBandKey}`}
            group={group}
            isSelected={isSelected}
            onSelect={() =>
              onSelectGroup({
                directionKey: group.directionKey,
                distanceBandKey: group.distanceBandKey,
              })
            }
            onClear={() => onSelectGroup(null)}
          />
        );
      })}
    </div>
  );
}
