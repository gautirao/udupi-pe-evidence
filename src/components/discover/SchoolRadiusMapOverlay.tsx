import React from 'react';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';

/**
 * Map overlays for the school-first selected-school / radius state:
 *   1. SchoolJourneyBreadcrumb — full resolved journey pill (City › Zone › Area › School)
 *   2. SchoolRadiusLegend      — Schools / Homes / "{n} km radius" key
 *
 * Both are presentational and take already-resolved labels/values — they never read
 * raw IDs and never fabricate names. Missing segments are omitted gracefully.
 *
 * Swatch colours intentionally MATCH the real Leaflet markers rendered by PropertyMap
 * (school pin + radius ring = #2563eb; the dashed ring uses dashArray '6 4') rather than
 * an idealised palette, so the legend is an honest key for what's actually on the map.
 */

/** Map marker / ring colours — kept in sync with PropertyMap.tsx (schoolMarkerIcon + schoolCircle). */
const SCHOOL_MARKER_COLOR = '#2563eb';

/** Title-case a kebab slug for display (e.g. "university-belt" → "University Belt"). */
export function prettifyZoneSlug(slug: string | null | undefined): string | null {
  if (!slug || !slug.trim()) return null;
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Derive a display label from a composite areaKey (e.g. "IN|KA|Udupi|Manipal" →
 * "Manipal"). The final pipe-segment is the area name — truthful, the same value
 * the hydrated AreaPoint.areaLabel carries — so the breadcrumb's area segment can
 * resolve immediately on a deep link, before async area hydration completes.
 */
export function areaKeyToLabel(areaKey: string | null | undefined): string | null {
  if (!areaKey || !areaKey.trim()) return null;
  const last = areaKey.split('|').pop();
  return last && last.trim() ? last.trim() : null;
}

/**
 * True only for the selected-school radius states (a school IS selected and the panel is
 * school-selected or area-school-combined). Used to gate the overlays so area-first,
 * agri-first, listing detail, etc. never render the school-journey breadcrumb or radius legend.
 */
export function isSchoolRadiusOverlayState(
  panelContent: DiscoverPanelContent,
  hasSelectedSchool: boolean,
): boolean {
  return (
    hasSelectedSchool &&
    (panelContent === 'school-selected' || panelContent === 'area-school-combined')
  );
}

export interface SchoolJourneyBreadcrumbProps {
  cityLabel?: string | null;
  zoneLabel?: string | null;
  areaLabel?: string | null;
  /** Resolved school NAME (never an id). Omitted while the school is still loading. */
  schoolName?: string | null;
  className?: string;
}

/**
 * White pill breadcrumb showing the resolved journey: City › Zone › Area › School.
 * Any segment whose label is null/blank is omitted (no "undefined", no raw UUIDs). The
 * school segment is accented in the plum school-journey colour. Returns null if nothing
 * resolves yet.
 */
export function SchoolJourneyBreadcrumb({
  cityLabel,
  zoneLabel,
  areaLabel,
  schoolName,
  className,
}: SchoolJourneyBreadcrumbProps) {
  const segments = [
    { key: 'city', label: cityLabel, isSchool: false },
    { key: 'zone', label: zoneLabel, isSchool: false },
    { key: 'area', label: areaLabel, isSchool: false },
    { key: 'school', label: schoolName, isSchool: true },
  ].filter((s) => typeof s.label === 'string' && s.label.trim().length > 0);

  if (segments.length === 0) return null;

  return (
    <nav
      aria-label="Journey breadcrumb"
      data-testid="school-journey-breadcrumb"
      className={cn(
        'flex max-w-[min(88vw,520px)] items-center gap-1.5 rounded-full border border-border/60',
        'bg-card/95 px-3 py-1.5 shadow-md backdrop-blur-sm select-none',
        className,
      )}
    >
      <GraduationCap
        className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--plum))]"
        aria-hidden
      />
      <ol className="flex items-center gap-1 overflow-hidden text-xs">
        {segments.map((s, i) => (
          <li key={s.key} className="flex min-w-0 items-center gap-1">
            {i > 0 && (
              <ChevronRight
                className="h-3 w-3 shrink-0 text-muted-foreground/50"
                aria-hidden
              />
            )}
            <span
              data-testid={`breadcrumb-seg-${s.key}`}
              className={cn(
                'truncate',
                s.isSchool
                  ? 'font-semibold text-[hsl(var(--plum))] max-w-[180px]'
                  : 'text-muted-foreground',
              )}
            >
              {s.label}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export interface SchoolRadiusLegendProps {
  /** Effective radius in km — should match the radius ring drawn on the map. */
  radiusKm: number;
  className?: string;
}

/**
 * Bottom-left map legend for the selected-school radius state. Swatches match the real
 * markers: blue school pin, copper home pins, dashed-blue radius ring. The radius row
 * reflects the live radius so changing 3 → 5 → 10 km updates the "{n} km radius" text.
 */
export function SchoolRadiusLegend({ radiusKm, className }: SchoolRadiusLegendProps) {
  return (
    <div
      data-testid="school-radius-legend"
      className={cn(
        'rounded-xl border border-border/60 bg-card/95 px-3 py-2.5 shadow-md backdrop-blur-sm select-none',
        className,
      )}
    >
      <ul className="space-y-1.5 text-xs text-foreground tabular-nums">
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: SCHOOL_MARKER_COLOR }}
            aria-hidden
          />
          Schools
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-copper" aria-hidden />
          Homes
        </li>
        <li className="flex items-center gap-2" data-testid="school-radius-legend-radius">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-dashed bg-transparent"
            style={{ borderColor: SCHOOL_MARKER_COLOR }}
            aria-hidden
          />
          {radiusKm} km radius
        </li>
      </ul>
    </div>
  );
}
