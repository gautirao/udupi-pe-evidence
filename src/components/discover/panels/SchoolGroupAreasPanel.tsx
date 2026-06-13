/**
 * SchoolGroupAreasPanel — Level 2 in the school-first grouped hierarchy.
 *
 * Issue #1485: school-first zone → areas-in-zone → schools-in-area → listings.
 *
 * Receives the selected group and the full city discoverAreas list; filters to
 * only the areas belonging to this group (client-side join via area_keys).
 * Each row shows area name, school count, and listing count.
 * Clicking a row calls onSelectAreaKey with the canonical composite areaKey.
 */
import React from 'react';
import { ChevronLeft, GraduationCap, Home, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PanelHeader } from '../PanelHeader';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchoolGroupAreasPanelProps {
  /** The resolved group (zone) for which we are showing areas. */
  group: AreaGroup;
  /** All city areas — filtered client-side to group.area_keys. */
  discoverAreas: DiscoverArea[];
  /** True while discoverAreas is still loading. */
  isLoading: boolean;
  /** Called when the user clicks Back (clear groupId, return to school-browse). */
  onBack: () => void;
  /** Called when the user clicks an area row (set areaKey, keep groupId). */
  onSelectAreaKey: (areaKey: string) => void;
  /** Start Over handler for PanelHeader. */
  onStartOver: () => void;
  /** Journey for PanelHeader styling. */
  journey?: DiscoverJourney | null;
}

// ─── Area row ─────────────────────────────────────────────────────────────────

interface AreaRowProps {
  area: DiscoverArea;
  onSelect: (areaKey: string) => void;
}

function AreaRow({ area, onSelect }: AreaRowProps) {
  return (
    <button
      type="button"
      data-testid={`school-group-area-row-${area.areaKey}`}
      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onSelect(area.areaKey)}
      aria-label={`${area.name}, ${area.schoolCount} school${area.schoolCount === 1 ? '' : 's'}, ${area.listingCount} listing${area.listingCount === 1 ? '' : 's'}`}
    >
      <span className="text-sm font-medium text-foreground block truncate">{area.name}</span>
      <span className="flex items-center gap-3 mt-0.5">
        <span className="flex items-center gap-1 text-xs text-purple-700 dark:text-purple-400">
          <GraduationCap className="h-3 w-3 shrink-0" aria-hidden="true" />
          {area.schoolCount} school{area.schoolCount === 1 ? '' : 's'}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Home className="h-3 w-3 shrink-0" aria-hidden="true" />
          {area.listingCount} listing{area.listingCount === 1 ? '' : 's'}
        </span>
      </span>
    </button>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function SchoolGroupAreasPanel({
  group,
  discoverAreas,
  isLoading,
  onBack,
  onSelectAreaKey,
  onStartOver,
  journey,
}: SchoolGroupAreasPanelProps) {
  // Client-side join: keep only areas that belong to this group.
  // O(k·n) where k = area_keys.length (2–8) and n = discoverAreas (< 100 per city).
  // Areas not in discoverAreas (partial membership, data gap) are silently dropped.
  const groupAreas = discoverAreas.filter((a) => group.area_keys.includes(a.areaKey));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader
        title="Find homes near a school"
        journey={journey}
        onStartOver={onStartOver}
      />

      {/* Back to zones affordance */}
      <div className="px-4 pt-3 pb-1 shrink-0 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-1 px-0 text-muted-foreground hover:text-foreground"
          onClick={onBack}
          aria-label="Back to all zones"
          data-testid="school-group-areas-back-btn"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm">{group.name}</span>
        </Button>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        aria-busy={isLoading}
        aria-label={`Areas in ${group.name}`}
        data-testid="school-group-areas-list"
      >
        {isLoading ? (
          // Skeleton state — while discoverAreas is still loading
          <div className="space-y-0 divide-y divide-border" data-testid="school-group-areas-loading">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="px-4 py-3">
                <Skeleton className="h-4 w-2/3 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : groupAreas.length === 0 ? (
          // Empty state — group exists but no areas resolved (data gap or all filtered)
          <div
            className="flex flex-col items-center justify-center py-12 px-4 text-center"
            data-testid="school-group-areas-empty"
          >
            <MapPin className="h-8 w-8 text-muted-foreground/40 mb-3" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground mb-1">No areas in this zone</p>
            <p className="text-xs text-muted-foreground">Try a different zone or search by school name.</p>
          </div>
        ) : (
          // Area rows
          <div className="divide-y divide-border">
            {groupAreas.map((area) => (
              <AreaRow key={area.areaKey} area={area} onSelect={onSelectAreaKey} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
