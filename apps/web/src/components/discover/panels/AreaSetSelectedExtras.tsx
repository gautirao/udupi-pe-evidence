import { useMemo, type ReactNode } from 'react';
import { ChevronRight, GraduationCap, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDiscoverAreas, type DiscoverArea } from '@/hooks/useDiscoverAreas';

/**
 * Issue #2017 — multi-area AREA_SET committed-scope extras for
 * `AreaSelectedPanel`. Split out of the main panel file rather than inlined
 * because the plural header replaces a >100-line JSX block; keeping it
 * separate lets the single-area path in `AreaSelectedPanel.tsx` stay
 * byte-identical to before this issue (the only change there is a
 * `multiAreaKeys ? <these> : <existing>` branch).
 *
 * Deliberately self-sources `useDiscoverAreas(city)` rather than accepting
 * area names/counts as props — this mirrors `AreaSetChips.tsx`'s own
 * established self-sourcing convention for the same data (see its
 * `combinedTotal`/`labelByKey` computation, which this file's "why" line is
 * adapted from) and keeps `AreaSelectedPanel`'s prop surface unchanged.
 */

/** Ghost action-row button — copper tokens, matching AreaSetChips.tsx's chip styling. */
function EPGhost({
  children,
  onClick,
  disabled = false,
  title,
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={cn(
        'inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border border-copper/40 px-2.5 text-xs font-semibold text-copper transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-copper-tint hover:text-copper',
      )}
    >
      {children}
    </button>
  );
}

export interface AreaSetSelectedHeaderProps {
  /** The committed AREA_SET's areaKeys (already confirmed length > 1 by the caller). */
  areaKeys: string[];
  city: string;
  /** Combined listing count for the header's count block (same source as the single-area header). */
  count: number;
  intentNoun: 'sale' | 'rent';
  isLoadingListings: boolean;
  onEditAreas: () => void;
  onClearAreas: () => void;
  /**
   * Issue #2017 (Fit all / focus-one, confirmed MUST-HAVE) — republishes the
   * union camera framing for the currently committed areaKeys. Camera intent
   * only; must never mutate the committed result scope.
   */
  onFitAll: () => void;
  /**
   * Frames the camera on ONE committed area's own bounds, leaving the other
   * committed areas — and the combined result set — untouched. Camera intent
   * only; must never mutate the committed result scope.
   */
  onFocusArea: (areaKey: string) => void;
}

/**
 * Plural committed-header: action row ("Edit areas" / "Clear selected
 * areas" / "Draw search area" / "Create alert") + heading with joined area
 * names + a "why" line summing per-area counts.
 *
 * "Draw search area" and "Create alert" are rendered disabled — no real
 * `drawArea`/alert-creation action exists anywhere in this app yet (only in
 * the design-mock docs), so wiring a fake handler would be worse than an
 * honest disabled state. See the calling report's "Issues noticed but not
 * fixed" for detail.
 */
export function AreaSetSelectedHeader({
  areaKeys,
  city,
  count,
  intentNoun,
  isLoadingListings,
  onEditAreas,
  onClearAreas,
  onFitAll,
  onFocusArea,
}: AreaSetSelectedHeaderProps) {
  const { data } = useDiscoverAreas(city);

  const areasByKey = useMemo(() => {
    const map = new Map<string, DiscoverArea>();
    for (const area of data?.areas ?? []) {
      map.set(area.areaKey, area);
    }
    return map;
  }, [data?.areas]);

  const selectedAreas = useMemo(
    () => areaKeys.map((key) => areasByKey.get(key)).filter((area): area is DiscoverArea => Boolean(area)),
    [areaKeys, areasByKey],
  );

  const namesJoined =
    selectedAreas.length > 0 ? selectedAreas.map((area) => area.name).join(' · ') : `${areaKeys.length} areas`;

  // Issue #2017 fix (truthfulness) — this line USED to sum each selected
  // area's own `listingCount` from useDiscoverAreas (per-area metadata: the
  // area's raw/lifetime count, ignoring the shopper's active Buy/Rent,
  // property-type, bedroom, price, etc. filters) and present it as
  // `${sum} = ${a} in X + ${b} in Y`. That number can — and, live-verified,
  // does — visibly DISAGREE with the honest, already-filtered `count` badge
  // shown right above it (e.g. "20 shown for sale" next to "29 = 24 in JP
  // Nagar + 5 in Jayanagar"), because `count` reflects the caller's active
  // filters (areaListings.length) while the per-area `listingCount` never
  // did. Presenting two different totals for the same result set as if they
  // were both authoritative is worse than useless — it reads as a bug (it
  // is one) and erodes trust in whichever number IS correct.
  //
  // Neither this component nor its caller currently has access to a
  // filter-aware, per-area, deduplicated breakdown (that requires either a
  // backend endpoint or grouping the already-fetched, already-filtered
  // `areaListings` by area — out of scope for this fix, and flagged as a
  // follow-up). Rather than keep showing a number that can contradict the
  // one above it, this now states ONLY the qualitative fact this component
  // CAN say honestly — which areas are included — with no numeric claim at
  // all. `count` above remains the single source of truth for "how many".
  const hasFullBreakdown = selectedAreas.length === areaKeys.length && selectedAreas.length > 0;
  const whyText = hasFullBreakdown
    ? `Includes ${selectedAreas.map((area) => area.name).join(' + ')}. No other area is included.`
    : null;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-1.5" data-testid="area-set-action-row">
        <EPGhost onClick={onEditAreas} testId="area-set-edit-areas">
          Edit areas
        </EPGhost>
        <EPGhost onClick={onClearAreas} testId="area-set-clear-areas">
          Clear selected areas
        </EPGhost>
        <EPGhost
          onClick={onFitAll}
          title="Reframe the map to fit every selected area"
          testId="area-set-fit-all"
        >
          Fit all
        </EPGhost>
        <EPGhost disabled title="Draw search area is not available yet" testId="area-set-draw-area">
          Draw search area
        </EPGhost>
        <EPGhost disabled title="Create alert is not available yet" testId="area-set-create-alert">
          Create alert
        </EPGhost>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Result scope — Selected areas
          </p>
          <h1
            className="mt-0.5 flex flex-wrap items-baseline gap-x-1 font-['Fraunces',_ui-serif,_Georgia,_serif] text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground"
            data-testid="area-set-heading"
          >
            {hasFullBreakdown ? (
              selectedAreas.map((area, idx) => (
                <span key={area.areaKey} className="inline-flex items-baseline">
                  {idx > 0 && <span className="mr-1 text-muted-foreground" aria-hidden="true">·</span>}
                  <button
                    type="button"
                    onClick={() => onFocusArea(area.areaKey)}
                    title={`Focus the map on ${area.name}`}
                    aria-label={`Focus the map on ${area.name}`}
                    data-testid={`area-set-focus-${area.areaKey}`}
                    className="rounded-sm text-left underline decoration-transparent decoration-2 underline-offset-4 transition-colors hover:decoration-copper focus-visible:decoration-copper focus-visible:outline-none"
                  >
                    {area.name}
                  </button>
                </span>
              ))
            ) : (
              namesJoined
            )}
          </h1>
        </div>
        {!isLoadingListings && (
          <div className="shrink-0 text-right" data-testid="area-header-count">
            <p className="font-mono text-2xl font-semibold leading-none tabular-nums text-foreground">{count}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {intentNoun === 'rent' ? 'shown for rent' : 'shown for sale'}
            </p>
          </div>
        )}
      </div>

      <p className="mt-1.5 text-[15px] leading-[1.55] text-[hsl(var(--text-body))]" data-testid="area-set-why">
        {whyText ??
          `Explore verified listings across ${areaKeys.length} selected areas, with map context and area-first filters.`}
      </p>
    </>
  );
}

export interface AreaSetTwoTileRowProps {
  /** First area in the committed set — used as the schools-tile label. */
  primaryAreaName: string;
  /** Omit (undefined) to render the schools tile disabled, mirroring the single-area CTA's `onAddSchool &&` gate. */
  onAddSchool?: () => void;
  onAddNearbyAreas: () => void;
}

/**
 * Two-tile panel row shown directly below the multi-area header, replacing
 * the single-area "Add a school in this area" CTA card. "Add nearby areas"
 * reuses the SAME draft popover `AreaSetChips.tsx` already provides (that
 * widget has no external open handle, so both tiles reveal the map — where
 * the widget lives — via `useDiscoverShell().setMobileView('MAP')`, the
 * confirmed real mechanism; on desktop the map is already visible).
 */
export function AreaSetTwoTileRow({ primaryAreaName, onAddSchool, onAddNearbyAreas }: AreaSetTwoTileRowProps) {
  return (
    <div className="grid grid-cols-2 gap-2 border-b border-border px-4 py-3" data-testid="area-set-two-tile-row">
      <button
        type="button"
        onClick={onAddSchool}
        disabled={!onAddSchool}
        data-testid="area-set-schools-tile"
        className={cn(
          'flex flex-col items-start gap-2 rounded-xl border border-plum/20 bg-plum-tint p-3 text-left shadow-sm transition-colors',
          onAddSchool ? 'hover:border-plum/50' : 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="flex w-full items-center justify-between">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-plum text-plum-foreground">
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold text-foreground">Schools in {primaryAreaName}</span>
        <span className="text-xs text-muted-foreground">See nearby schools</span>
      </button>

      <button
        type="button"
        onClick={onAddNearbyAreas}
        data-testid="area-set-add-nearby-tile"
        className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-copper/40"
      >
        <span className="flex w-full items-center justify-between">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <MapPin className="h-4 w-4" aria-hidden="true" />
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold text-foreground">Add nearby areas</span>
        <span className="text-xs text-muted-foreground">Up to 3 areas total</span>
      </button>
    </div>
  );
}
