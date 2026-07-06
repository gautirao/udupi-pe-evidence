/**
 * SchoolGroupAreasPanel — Level 2 in the school-first grouped hierarchy.
 *
 * Issue #1485: school-first zone → areas-in-zone → schools-in-area → listings.
 *
 * Receives the selected group and the full city discoverAreas list; filters to
 * only the areas belonging to this group (client-side join via area_keys).
 * Each card shows area name, school count, and listing count.
 * Clicking a card calls onSelectAreaKey with the canonical composite areaKey.
 *
 * Visual: ReTrends school-first polish — a calm warm-neutral zone summary and
 * premium area cards using the plum school accent (schools) + copper property
 * accent (homes). All figures are derived from the real DiscoverArea counts —
 * nothing is fabricated.
 *
 * Visual-parity polish note: the former "How school search works" 3-step
 * instructional strip has been removed here (mock parity — the approved mock
 * has no instructional block on this screen).
 */
import React from 'react';
import { ChevronLeft, ChevronRight, GraduationCap, Home, Layers, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PanelHeader } from '../PanelHeader';
import { PanelColumn } from './_shared';
import { SchoolJourneyHero } from './SchoolJourneyHero';
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
  /** Called when the user clicks an area card (set areaKey, keep groupId). */
  onSelectAreaKey: (areaKey: string) => void;
  /** Start Over handler for PanelHeader. */
  onStartOver: () => void;
  /** Journey for PanelHeader styling. */
  journey?: DiscoverJourney | null;
  /**
   * Human-readable city label for the hero breadcrumb ("Discover {City}"), mirrors
   * the same prop threaded to SchoolBrowsePanel. Falls back to "City" when absent
   * (defensive — DiscoverRightPanel always threads a resolved label in practice).
   */
  cityLabel?: string | null;
}

// ─── Area card ────────────────────────────────────────────────────────────────

interface AreaCardProps {
  area: DiscoverArea;
  onSelect: (areaKey: string) => void;
}

function AreaCard({ area, onSelect }: AreaCardProps) {
  const noHomes = area.listingCount === 0;
  return (
    <button
      type="button"
      data-testid={`school-group-area-row-${area.areaKey}`}
      onClick={() => onSelect(area.areaKey)}
      aria-label={`${area.name}, ${area.schoolCount} school${area.schoolCount === 1 ? '' : 's'}, ${area.listingCount} home${area.listingCount === 1 ? '' : 's'}`}
      className="group w-full text-left rounded-xl border border-border bg-card p-5 transition-all hover:border-plum/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-plum-tint text-plum">
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base leading-tight text-foreground truncate">{area.name}</span>
            {noHomes && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Schools only
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">
            Explore homes and schools in {area.name}.
          </p>
        </div>
      </div>

      {/* "X schools · Y homes" summary line (mock parity) — one line, not table-like tiles. */}
      <p
        className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"
        data-testid="school-group-area-row-summary"
      >
        <GraduationCap className="h-3.5 w-3.5 shrink-0 text-plum" aria-hidden="true" />
        <span className="font-mono font-semibold tabular-nums text-foreground">{area.schoolCount}</span>
        {area.schoolCount === 1 ? ' school' : ' schools'}
        <span aria-hidden="true">·</span>
        <Home className="h-3.5 w-3.5 shrink-0 text-copper" aria-hidden="true" />
        <span className="font-mono font-semibold tabular-nums text-foreground">{area.listingCount}</span>
        {area.listingCount === 1 ? ' home' : ' homes'}
      </p>

      {/* CTA — uniform wording (mock parity: "View schools →"). */}
      <div className="mt-3 flex items-center justify-end border-t border-border/70 pt-3">
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground transition-colors group-hover:text-plum">
          View schools
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </button>
  );
}

// ─── Loading skeleton ───────────────────────────────────────────────────────

function AreaCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <Skeleton className="h-9 flex-1 rounded-lg" />
      </div>
    </div>
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
  cityLabel,
}: SchoolGroupAreasPanelProps) {
  const displayCity = cityLabel?.trim() || 'City';
  // Client-side join: keep only areas that belong to this group.
  // O(k·n) where k = area_keys.length (2–8) and n = discoverAreas (< 100 per city).
  // Areas not in discoverAreas (partial membership, data gap) are silently dropped.
  const groupAreas = React.useMemo(
    () => discoverAreas.filter((a) => group.area_keys.includes(a.areaKey)),
    [discoverAreas, group.area_keys],
  );

  // Truthful rolled-up totals from the resolved areas only — never fabricated.
  const totalSchools = React.useMemo(
    () => groupAreas.reduce((sum, a) => sum + a.schoolCount, 0),
    [groupAreas],
  );
  const totalListings = React.useMemo(
    () => groupAreas.reduce((sum, a) => sum + a.listingCount, 0),
    [groupAreas],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader
        title="Find homes near a school"
        journey={journey}
        onStartOver={onStartOver}
      />

      {/* Back to zones affordance (mock parity copy: "Back to school zones") */}
      <div className="px-4 pt-3 pb-2 shrink-0 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-1 px-0 text-muted-foreground hover:text-foreground"
          onClick={onBack}
          aria-label="Back to school zones"
          data-testid="school-group-areas-back-btn"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm">Back to school zones</span>
        </Button>
      </div>

      <div
        className="flex-1 overflow-y-auto bg-background px-4 py-4"
        aria-busy={isLoading}
        aria-label={`Areas in ${group.name}`}
        data-testid="school-group-areas-list"
      >
        <PanelColumn className="space-y-4">
          {isLoading ? (
            // Skeleton state — while discoverAreas is still loading
            <div className="space-y-3" data-testid="school-group-areas-loading">
              {[0, 1, 2, 3].map((i) => (
                <AreaCardSkeleton key={i} />
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
            <>
              <SchoolJourneyHero
                dataTestId="school-zone-hero"
                breadcrumb={[
                  { key: 'city', label: `Discover ${displayCity}` },
                  { key: 'zone', label: group.name, current: true },
                ]}
                icon={Layers}
                eyebrowLabel="School zone"
                title={group.name}
                description={group.subtitle || 'Explore areas, schools and homes in this zone.'}
                stats={[
                  { key: 'schools', value: totalSchools, label: totalSchools === 1 ? 'school' : 'schools' },
                  { key: 'homes', value: totalListings, label: totalListings === 1 ? 'home for sale' : 'homes for sale' },
                ]}
              />

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <p
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    data-testid="school-group-areas-heading"
                  >
                    Areas in {group.name}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {groupAreas.length} area{groupAreas.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="space-y-3">
                {groupAreas.map((area) => (
                  <AreaCard key={area.areaKey} area={area} onSelect={onSelectAreaKey} />
                ))}
              </div>
            </>
          )}
        </PanelColumn>
      </div>
    </div>
  );
}
