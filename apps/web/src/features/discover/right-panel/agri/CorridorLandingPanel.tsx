// Issue #2657 C2b — verbatim extraction of the CorridorLandingPanel leaf
// (previously inline in components/discover/DiscoverRightPanel.tsx, lines
// 59-523 as of C1). Byte-identical render output; only the surrounding
// module boundary (imports/exports) changed. See
// DiscoverRightPanel.leafSnapshots2657.test.tsx (C2a) for the DOM proof.
import React from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  Loader2,
  MapPin,
  Route,
  Sprout,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { CorridorGroupData, CumulativeDistanceTier } from '@/hooks/useRegionalAreaGroups';
import { buildAreaNameIndex } from '@/utils/areaNameSummary';

// ─── CorridorLandingPanel — corridor-first two-level UX (Issue #1429) ─────────

// Directional cues are derived purely from the corridor's directionCode (already
// in the data) — no new fields are introduced. The cardinal letter is the cue;
// the four primary directions also get a subtle edge arrow on the compass badge.
const CARDINAL_ARROW: Record<
  string,
  { Arrow: typeof ArrowUp; pos: string }
> = {
  N: { Arrow: ArrowUp, pos: 'top-1 left-1/2 -translate-x-1/2' },
  E: { Arrow: ArrowRight, pos: 'right-1 top-1/2 -translate-y-1/2' },
  S: { Arrow: ArrowDown, pos: 'bottom-1 left-1/2 -translate-x-1/2' },
  W: { Arrow: ArrowLeft, pos: 'left-1 top-1/2 -translate-y-1/2' },
};

export const BEARING_LABELS: Record<string, string> = {
  N: 'North',
  E: 'East',
  S: 'South',
  W: 'West',
  NE: 'North-east',
  NW: 'North-west',
  SE: 'South-east',
  SW: 'South-west',
};

/** Compass-style badge: the corridor's cardinal letter on a solid evergreen disc
 *  (mock parity, Issue #1771), with a subtle edge arrow for the four primary
 *  directions. Decorative — labelled by the card's aria-label. */
function DirectionBadge({ code }: { code: string }) {
  const arrow = CARDINAL_ARROW[code];
  const Arrow = arrow?.Arrow;
  return (
    <div
      aria-hidden="true"
      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-evergreen text-white shadow-sm transition-transform group-hover:scale-105"
    >
      {Arrow && arrow && (
        <Arrow className={cn('absolute h-3 w-3 text-white/60', arrow.pos)} />
      )}
      <span className="font-mono text-lg font-bold tracking-tight">
        {code}
      </span>
    </div>
  );
}

export interface CorridorLandingPanelProps {
  corridorGroups: CorridorGroupData[];
  isLoading: boolean;
  /** True when the regional-area-groups fetch errored. Renders error+retry UI. */
  isError?: boolean;
  /**
   * #2151 Track 3 landing-panel gap fix — true when the active source is a PREVIEW revision
   * that has zero sandbox Agri rows (backend 503 AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION).
   * Mirrors AgriGroupSelectedPanel's `isNotGeneratedForRevision` carve-out: must render as its
   * own distinct state, never folded into the generic retryable-error state below.
   */
  isNotGeneratedForRevision?: boolean;
  /** Called when the user clicks Retry in the error state. */
  onRetry?: () => void;
  selectedRegion: string | null;
  selectedMaxKm: 10 | 25 | 50 | 100 | null;
  /** Called when a corridor card is clicked — sets both region and default maxKm in one PUSH. */
  onSetRegionWithMaxKm: (dir: string, km?: number) => void;
  onSetMaxKm: (km: 10 | 25 | 50 | 100) => void;
  onClearRegionAndMaxKm: () => void;
  discoverAreas?: DiscoverArea[];
  onSelectAreaKey?: (areaKey: string) => void;
  cityLabel?: string;
}

interface AgriLandingIntroProps {
  corridorCount: number;
  parcelCount: number;
  cityLabel?: string;
}

function AgriLandingIntro({
  corridorCount,
  parcelCount,
  cityLabel,
}: AgriLandingIntroProps) {
  const displayCity = cityLabel && cityLabel !== 'this city' ? cityLabel : 'Udupi';

  return (
    <div
      className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-lg text-white"
      data-testid="agri-landing-intro"
    >
      {/* Breadcrumb / Eyebrow */}
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
        <span>Discover {displayCity}</span>
        <span className="text-slate-600">›</span>
        <span className="text-evergreen uppercase tracking-wider">Agricultural land</span>
      </div>

      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-evergreen-tint text-evergreen">
          <Sprout className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white">
            Agricultural land near {displayCity}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">
            Farmland is searched by corridor, direction and distance from town — not by residential neighbourhood.
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 border-t border-slate-800 pt-4">
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-xl font-bold leading-none tracking-tight tabular-nums text-white">
            {corridorCount}
          </span>
          <span className="mt-1.5 text-xs text-slate-400">{corridorCount === 1 ? 'corridor' : 'corridors'}</span>
        </div>
        <div className="flex min-w-0 flex-col border-l border-slate-800 pl-4">
          <span className="font-mono text-xl font-bold leading-none tracking-tight tabular-nums text-evergreen">
            {parcelCount}
          </span>
          <span className="mt-1.5 text-xs text-slate-400">{parcelCount === 1 ? 'parcel' : 'parcels'}</span>
        </div>
      </div>
    </div>
  );
}

export function CorridorLandingPanel({
  corridorGroups,
  isLoading,
  isError = false,
  isNotGeneratedForRevision = false,
  onRetry = () => {},
  selectedRegion,
  selectedMaxKm,
  onSetRegionWithMaxKm,
  onSetMaxKm,
  onClearRegionAndMaxKm,
  discoverAreas = [],
  cityLabel,
}: CorridorLandingPanelProps) {
  // Issue #1659 — build area-name index once per discoverAreas change.
  const corridorAreaNameIndex = React.useMemo(
    () => buildAreaNameIndex(discoverAreas),
    [discoverAreas],
  );

  const totalParcels = React.useMemo(() => {
    return corridorGroups.reduce((sum, c) => {
      let maxCount = 0;
      for (const t of c.availableMaxDistances || []) {
        if (t.listingCount > maxCount) maxCount = t.listingCount;
      }
      return sum + maxCount;
    }, 0);
  }, [corridorGroups]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <div
        data-testid="corridor-landing-loading"
        className="flex flex-col gap-3 p-4"
        aria-busy="true"
        aria-label="Loading corridor groups"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground pb-1">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Loading corridors…</span>
        </div>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border border-border p-4"
          >
            <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Not-generated-for-revision state (#2151 Track 3) ──
  // Must appear BEFORE the generic error state: a PREVIEW revision with zero sandbox Agri rows
  // is NOT shopper/admin-retryable via the Retry button below (the remediation is re-running
  // city preparation for this revision), and it must never render as "Could not load corridors."
  if (isNotGeneratedForRevision) {
    return (
      <div
        data-testid="corridor-landing-not-generated-for-revision"
        className="flex flex-col items-center justify-center py-12 px-4 gap-3 text-center"
      >
        <AlertCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          This preview hasn&apos;t generated Agricultural corridors yet — re-run city preparation
          for this revision.
        </p>
      </div>
    );
  }

  // ── Error state (Issue #1453) ──
  // Must appear BEFORE selectedRegion and empty-state checks so a failed fetch
  // never silently falls through to "No corridors found".
  if (isError) {
    return (
      <div
        data-testid="corridor-landing-error"
        className="flex flex-col items-center justify-center py-12 px-4 gap-3 text-center"
      >
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Could not load corridors. Check your connection and try again.
        </p>
        <Button
          variant="outline"
          size="sm"
          data-testid="corridor-landing-retry-btn"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    );
  }

  // ── Level 2: corridor selected — show distance chips ──
  if (selectedRegion !== null) {
    const corridor = corridorGroups.find((g) => g.directionCode === selectedRegion);
    const tiers: CumulativeDistanceTier[] = corridor?.availableMaxDistances ?? [];
    // Sort by maxKm ascending
    const sortedTiers = [...tiers].sort((a, b) => a.maxKm - b.maxKm);

    return (
      <div data-testid="corridor-distance-chips" className="flex flex-col gap-3 p-4">
        {/* Back / clear button */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-1 px-0 text-muted-foreground hover:text-foreground"
            onClick={onClearRegionAndMaxKm}
            aria-label="Back to corridor list"
            data-testid="corridor-back-btn"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm">{corridor?.groupName ?? selectedRegion}</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Select a distance range:</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Distance tiers">
          {sortedTiers.map((tier) => {
            const isSelected = selectedMaxKm === tier.maxKm;
            return (
              <button
                key={tier.maxKm}
                type="button"
                data-testid={`distance-chip-${tier.maxKm}`}
                onClick={() => onSetMaxKm(tier.maxKm)}
                aria-pressed={isSelected}
                className={[
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected
                    ? 'border-evergreen bg-evergreen text-evergreen-foreground shadow-sm'
                    : 'border-border bg-card text-foreground hover:border-evergreen/40 hover:bg-evergreen-tint/40',
                ].join(' ')}
              >
                {tier.distanceLabel}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Includes parcels at closer distances too.
        </p>
        {tiers.length === 0 && (
          <p className="text-sm text-muted-foreground">No distance tiers available for this corridor.</p>
        )}
      </div>
    );
  }

  // ── Level 1: no corridor selected — show corridor cards ──
  if (corridorGroups.length === 0) {
    return (
      <div
        data-testid="corridor-landing-empty"
        className="flex flex-col items-center justify-center py-12 px-4 text-center"
      >
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-evergreen/20 bg-evergreen-tint">
          <Sprout className="h-6 w-6 text-evergreen" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium text-foreground mb-1">No corridors found</p>
        <p className="text-xs text-muted-foreground">Try selecting a different city.</p>
      </div>
    );
  }

  return (
    <div
      data-testid="corridor-landing-list"
      className="flex flex-col gap-4 p-4"
      aria-label="Agricultural corridors"
    >
      {/* ReTrends hero-card style: breadcrumb + stats row */}
      <AgriLandingIntro
        corridorCount={corridorGroups.length}
        parcelCount={totalParcels}
        cityLabel={cityLabel}
      />

      {/* Dedicated agricultural model informational banner */}
      <div
        role="note"
        className="rounded-xl border border-evergreen/30 bg-evergreen-tint/30 p-4 text-sm text-foreground shadow-sm flex items-start gap-3"
      >
        <Sprout className="h-5 w-5 text-evergreen shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">Dedicated agricultural model</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Agricultural land is a separate model — parcels, corridors and distances, kept apart from residential counts and neighbourhoods.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Route className="h-3.5 w-3.5 text-evergreen" aria-hidden="true" />
          Direction / Corridor
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {corridorGroups.length} corridor{corridorGroups.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Four directional corridor cards (mock parity, Issue #1771). */}
      <div className="flex flex-col gap-4">
        {corridorGroups.map((corridor) => {
          const maxTier = corridor.availableMaxDistances.reduce(
            (max, t) => (t.maxKm > (max?.maxKm ?? 0) ? t : max),
            corridor.availableMaxDistances[0],
          );
          const maxKm = maxTier?.maxKm ?? 0;

          // Issue #1659 — union of area keys across all tiers for this corridor.
          // The largest tier (maxKm) includes all closer-tier areas cumulatively,
          // so we take the union (de-duplicated) to avoid overcounting.
          const corridorAreaKeys = Array.from(
            new Set(corridor.availableMaxDistances.flatMap((t) => t.areaKeys)),
          );
          // Resolve individual town names for the chips row (dedup by name).
          const townNames = Array.from(
            new Set(
              corridorAreaKeys
                .map((k) => corridorAreaNameIndex.get(k))
                .filter((n): n is string => !!n),
            ),
          );

          return (
            <button
              key={corridor.directionCode}
              type="button"
              data-testid="corridor-card"
              onClick={() => onSetRegionWithMaxKm(corridor.directionCode)}
              className="group relative w-full overflow-hidden rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-evergreen/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Select corridor ${corridor.groupName}`}
            >
              {/* Header row: direction disc + title/subtitle + parcel badge top-right */}
              <div className="flex items-start gap-3.5">
                <DirectionBadge code={corridor.directionCode} />
                <div className="min-w-0 flex-1">
                  <span
                    data-testid="corridor-group-name"
                    className="block truncate text-[16px] font-bold tracking-tight text-foreground"
                  >
                    {corridor.groupName}
                  </span>
                  {maxKm > 0 && (
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">
                      Up to {maxKm} km from the city
                    </span>
                  )}
                </div>
                {maxTier && (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-evergreen-tint px-2.5 py-1 text-xs font-semibold text-evergreen">
                    {maxTier.listingCount} parcel{maxTier.listingCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {/* Pale green stat bands: town count + acreage (mock parity) */}
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <span className="inline-flex items-center gap-2 rounded-lg bg-evergreen-tint/70 px-3 py-2.5">
                  <MapPin className="h-4 w-4 shrink-0 text-evergreen" aria-hidden="true" />
                  <span className="text-sm text-foreground">
                    <strong className="font-mono font-bold tabular-nums">{corridorAreaKeys.length}</strong>{' '}
                    town{corridorAreaKeys.length === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 rounded-lg bg-evergreen-tint/70 px-3 py-2.5">
                  <Sprout className="h-4 w-4 shrink-0 text-evergreen" aria-hidden="true" />
                  <span className="text-sm text-foreground">
                    {maxTier?.agriAcreage != null ? (
                      <>
                        <strong className="font-mono font-bold tabular-nums">{maxTier.agriAcreage}</strong> acres
                      </>
                    ) : (
                      <>
                        <strong className="font-mono font-bold tabular-nums">{maxTier?.listingCount ?? 0}</strong>{' '}
                        parcel{(maxTier?.listingCount ?? 0) === 1 ? '' : 's'}
                      </>
                    )}
                  </span>
                </span>
              </div>

              {/* Town chips row (Issue #1659 names, chip presentation per mock) */}
              {townNames.length > 0 && (
                <div
                  className="mt-3.5 flex flex-wrap items-center gap-1.5"
                  data-testid="corridor-card-area-names"
                >
                  <span className="mr-0.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    Towns
                  </span>
                  {townNames.slice(0, 4).map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground"
                    >
                      {name}
                    </span>
                  ))}
                  {townNames.length > 4 && (
                    <span className="text-xs text-muted-foreground">
                      + {townNames.length - 4} more
                    </span>
                  )}
                </div>
              )}

              {/* Explore CTA — bottom-right (mock parity) */}
              <div className="mt-4 flex justify-end border-t border-border/60 pt-3">
                <span
                  aria-hidden="true"
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-evergreen transition-transform group-hover:translate-x-0.5"
                >
                  Explore direction
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
