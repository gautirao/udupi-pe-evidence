import React, { useCallback, useMemo, useRef } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Layers, MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import { getAreaGroupContent, getLocalityDescription } from '@/lib/discoverGroupContent';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AreaGroupSelectedPanelProps {
  /** The resolved (deep-linked / selected) neighbourhood group. */
  group: AreaGroup;
  /** Member areas already filtered to this group and resolved against live area data. */
  areas: DiscoverArea[];
  /** Human-readable city label (e.g. "Udupi") for the breadcrumb + heading. */
  cityLabel: string;
  /**
   * Back to the all-groups (Level-1) list. When omitted the affordance is not rendered
   * (mirrors AreaGroupsLandingPanel's onClearGroup contract).
   */
  onBack?: () => void;
  /** Start over → return to journey selection. Rendered top-right when provided. */
  onStartOver?: () => void;
  /** Select a member locality → drill into its results page (PUSH areaKey). */
  onSelectArea: (areaKey: string) => void;
}

// ─── Summary stat tile ──────────────────────────────────────────────────────

function Stat({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) {
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

// ─── Locality (member-area) card ────────────────────────────────────────────
//
// Active when the locality has live properties → leads to its results page.
// Muted / passive when zero — visibly present but non-interactive (never "broken").

function LocalityCard({
  area,
  onSelectArea,
}: {
  area: DiscoverArea;
  onSelectArea: (areaKey: string) => void;
}) {
  const count = area.listingCount ?? 0;
  const hasProperties = count > 0;
  const description = getLocalityDescription(area.name);

  // data-testid stays `browse-all-area-${areaKey}` for both states so the existing
  // routing/e2e contract (click → onSelectArea(areaKey)) is preserved unchanged.
  const testId = `browse-all-area-${area.areaKey}`;

  if (!hasProperties) {
    return (
      <li>
        <div
          data-testid={testId}
          aria-disabled="true"
          className="rounded-2xl border border-border/60 bg-muted/40 p-4"
        >
          <div className="flex items-start gap-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground/60">
              <MapPin className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-muted-foreground">{area.name}</p>
              {description && (
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground/70">{description}</p>
              )}
              <p className="mt-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground/70">
                No properties yet
              </p>
            </div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        data-testid={testId}
        onClick={() => onSelectArea(area.areaKey)}
        aria-label={`View ${count} propert${count === 1 ? 'y' : 'ies'} in ${area.name}`}
        className="group w-full rounded-2xl border border-border/70 bg-card p-4 text-left shadow-[0_1px_2px_rgba(24,16,12,0.03)] transition-all hover:-translate-y-px hover:border-copper/40 hover:shadow-[0_1px_2px_rgba(24,16,12,0.04),0_10px_20px_-14px_rgba(176,92,58,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start gap-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-copper-tint text-copper ring-1 ring-copper/15">
            <MapPin className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{area.name}</p>
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
            )}
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold tabular-nums text-copper">{count}</span>{' '}
                propert{count === 1 ? 'y' : 'ies'}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground transition-colors group-hover:text-copper">
                View properties
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
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
  onBack,
  onStartOver,
  onSelectArea,
}: AreaGroupSelectedPanelProps) {
  const areasRef = useRef<HTMLDivElement | null>(null);

  // Truthful aggregates — derived only from live area data (never fabricated).
  const areaCount = areas.length;
  const totalProperties = useMemo(
    () => areas.reduce((sum, a) => sum + (a.listingCount ?? 0), 0),
    [areas],
  );

  // Backend-first, adapter-fallback (see discoverGroupContent.ts).
  const fallback = getAreaGroupContent(group.id);
  const description = group.subtitle?.trim() || fallback?.description;
  const regionLabel = group.region_label?.trim() || fallback?.regionLabel;

  // "View all" is an in-panel affordance: there is no separate group-results page in
  // the area-first flow (group → area → results), so it scrolls to the locality list
  // below rather than inventing new navigation.
  const handleViewAll = useCallback(() => {
    const node = areasRef.current;
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, []);

  return (
    <>
      {/* ── Header: Start over, heading + "By area", back-to-all ──
          The City › Group breadcrumb lives on the map (top-left) for this step
          (Issue #1595 Option A), so it is intentionally not repeated here. */}
      <div className="sticky top-0 z-20 flex-shrink-0 flex flex-col gap-2.5 bg-background border-b border-border/50 px-4 pt-3 pb-3.5">
        {onStartOver && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={onStartOver}
              aria-label="Start over and return to journey selection"
              data-testid="start-over-button"
            >
              Start over
              <X className="h-3.5 w-3.5" />
            </Button>
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

        {onBack && (
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
        )}
      </div>

      {/* ── Body: selected-group card + member-area list ── */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {/* Selected-group context card */}
        <article
          data-testid="area-group-selected-card"
          className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(24,16,12,0.04),0_8px_24px_-12px_rgba(24,16,12,0.12)]"
        >
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-copper-tint text-copper ring-1 ring-copper/15">
              <Layers className="h-[22px] w-[22px]" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-['Fraunces',_ui-serif,_Georgia,_serif] text-[1.35rem] font-semibold leading-tight tracking-tight text-foreground">
                  {group.name}
                </h2>
                {regionLabel && (
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
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
            <button
              type="button"
              onClick={handleViewAll}
              data-testid="area-group-view-all"
              className="mt-3.5 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-copper transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View all {totalProperties} properties across {group.name}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
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
                  <LocalityCard key={area.areaKey} area={area} onSelectArea={onSelectArea} />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
