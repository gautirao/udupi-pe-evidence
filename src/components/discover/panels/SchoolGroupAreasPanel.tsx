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
 * Visual: ReTrends school-first polish — a calm warm-neutral zone summary,
 * a guided "How school search works" strip, and premium area cards using the
 * plum school accent (schools) + copper property accent (homes). All figures
 * are derived from the real DiscoverArea counts — nothing is fabricated.
 */
import React from 'react';
import { ChevronLeft, ChevronRight, GraduationCap, Home, Layers, ListChecks, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  /** Called when the user clicks an area card (set areaKey, keep groupId). */
  onSelectAreaKey: (areaKey: string) => void;
  /** Start Over handler for PanelHeader. */
  onStartOver: () => void;
  /** Journey for PanelHeader styling. */
  journey?: DiscoverJourney | null;
}

// ─── Zone summary card ──────────────────────────────────────────────────────

interface SummaryStatProps {
  value: number;
  label: string;
  tone?: 'neutral' | 'school' | 'home';
}

function SummaryStat({ value, label, tone = 'neutral' }: SummaryStatProps) {
  return (
    <div className="flex flex-col">
      <span
        className={cn(
          'text-lg font-bold leading-none tabular-nums',
          tone === 'school' && 'text-plum',
          tone === 'home' && 'text-copper',
          tone === 'neutral' && 'text-foreground',
        )}
      >
        {value}
      </span>
      <span className="mt-1 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

interface ZoneSummaryProps {
  group: AreaGroup;
  areaCount: number;
  schoolCount: number;
  listingCount: number;
}

function ZoneSummaryCard({ group, areaCount, schoolCount, listingCount }: ZoneSummaryProps) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid="school-zone-summary"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-plum-tint text-plum">
          <Layers className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground truncate">{group.name}</h3>
          {group.subtitle && (
            <span className="mt-1 inline-flex items-center rounded-full bg-plum-tint px-2 py-0.5 text-xs font-medium text-plum">
              {group.subtitle}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-7 border-t border-border pt-3">
        <SummaryStat value={areaCount} label={areaCount === 1 ? 'area' : 'areas'} />
        <SummaryStat value={schoolCount} label={schoolCount === 1 ? 'school' : 'schools'} tone="school" />
        <SummaryStat value={listingCount} label={listingCount === 1 ? 'home' : 'homes'} tone="home" />
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-plum" aria-hidden="true" />
        Choose an area to see nearby schools and homes.
      </div>
    </div>
  );
}

// ─── How school search works ────────────────────────────────────────────────

const HOW_IT_WORKS_STEPS: ReadonlyArray<{ title: string; body: string }> = [
  { title: 'Choose an area', body: 'Pick a neighbourhood inside this zone.' },
  { title: 'Pick a school', body: 'Browse the schools in that area.' },
  { title: 'Set a radius', body: 'See homes within 3, 5 or 10 km of it.' },
];

function HowSchoolSearchWorks() {
  return (
    <div className="rounded-xl border border-plum/15 bg-plum-tint/50 p-4" data-testid="school-how-it-works">
      <div className="flex items-center gap-2">
        <ListChecks className="h-3.5 w-3.5 text-plum" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wide text-plum">How school search works</p>
      </div>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3">
        {HOW_IT_WORKS_STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-2.5 sm:flex-col sm:gap-1.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-plum text-[11px] font-bold text-plum-foreground tabular-nums">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">{step.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Area card ────────────────────────────────────────────────────────────────

interface AreaCardProps {
  area: DiscoverArea;
  onSelect: (areaKey: string) => void;
}

function AreaMetricTile({
  icon,
  count,
  label,
  tone,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
  tone: 'school' | 'home' | 'muted';
}) {
  return (
    <div
      className={cn(
        'flex flex-1 items-center gap-2 rounded-lg px-3 py-2',
        tone === 'school' && 'bg-plum-tint',
        tone === 'home' && 'bg-copper-tint',
        tone === 'muted' && 'bg-muted',
      )}
    >
      <span
        className={cn(
          'shrink-0',
          tone === 'school' && 'text-plum',
          tone === 'home' && 'text-copper',
          tone === 'muted' && 'text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <span className="text-xs text-muted-foreground">
        <span
          className={cn(
            'font-mono text-sm font-semibold tabular-nums',
            tone === 'muted' ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {count}
        </span>{' '}
        {label}
      </span>
    </div>
  );
}

function AreaCard({ area, onSelect }: AreaCardProps) {
  const noHomes = area.listingCount === 0;
  return (
    <button
      type="button"
      data-testid={`school-group-area-row-${area.areaKey}`}
      onClick={() => onSelect(area.areaKey)}
      aria-label={`${area.name}, ${area.schoolCount} school${area.schoolCount === 1 ? '' : 's'}, ${area.listingCount} listing${area.listingCount === 1 ? '' : 's'}`}
      className="group w-full text-left rounded-xl border border-border bg-card p-4 transition-all hover:border-plum/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-plum-tint text-plum">
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-foreground truncate">{area.name}</span>
            {noHomes && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Schools only
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Metric tiles — schools (plum) + listings (copper, greyed when none). */}
      <div className="mt-3 flex gap-2">
        <AreaMetricTile
          tone="school"
          icon={<GraduationCap className="h-4 w-4" aria-hidden="true" />}
          count={area.schoolCount}
          label={`school${area.schoolCount === 1 ? '' : 's'}`}
        />
        <AreaMetricTile
          tone={noHomes ? 'muted' : 'home'}
          icon={<Home className="h-4 w-4" aria-hidden="true" />}
          count={area.listingCount}
          label={`listing${area.listingCount === 1 ? '' : 's'}`}
        />
      </div>

      {/* Zero-listing helper — reads as a valid school area, never broken. */}
      {noHomes && (
        <p className="mt-3 text-xs leading-snug text-muted-foreground">
          No homes listed yet — view the schools in this area.
        </p>
      )}

      {/* Adaptive CTA. */}
      <div className="mt-3 flex items-center justify-end border-t border-border/70 pt-3">
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground transition-colors group-hover:text-plum">
          {noHomes ? `View schools in ${area.name}` : `Explore ${area.name}`}
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
}: SchoolGroupAreasPanelProps) {
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

      {/* Back to zones affordance */}
      <div className="px-4 pt-3 pb-2 shrink-0 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-1 px-0 text-muted-foreground hover:text-foreground"
          onClick={onBack}
          aria-label="Back to all school zones"
          data-testid="school-group-areas-back-btn"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm">{group.name}</span>
        </Button>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        aria-busy={isLoading}
        aria-label={`Areas in ${group.name}`}
        data-testid="school-group-areas-list"
      >
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
            <ZoneSummaryCard
              group={group}
              areaCount={groupAreas.length}
              schoolCount={totalSchools}
              listingCount={totalListings}
            />

            <HowSchoolSearchWorks />

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Areas inside {group.name}
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
      </div>
    </div>
  );
}
