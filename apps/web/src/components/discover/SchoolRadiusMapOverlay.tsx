import React from 'react';
import { cn } from '@/lib/utils';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';

/**
 * Map overlay + helpers for the school-first selected-school / radius state:
 *   SchoolRadiusLegend — Schools / Homes / "{n} km radius" key.
 *
 * (The journey breadcrumb — City › Zone › Area › School — moved to the shared
 * DiscoverMapBreadcrumb component as part of Issue #1745 P4; MapDiscovery builds its
 * segments using the prettifyZoneSlug/areaKeyToLabel helpers below.)
 *
 * Presentational and takes already-resolved labels/values — never reads raw IDs and
 * never fabricates names.
 *
 * Swatch colours intentionally MATCH the real Leaflet markers rendered by PropertyMap
 * (school pin + radius ring = plum design-system token, hsl(var(--plum)); the dashed
 * ring uses dashArray '6 4') rather than an idealised palette, so the legend is an
 * honest key for what's actually on the map.
 *
 * Issue #1954 — recoloured from blue (#2563eb) to plum, matching the school-first V2
 * identity used throughout SchoolJourneyPanels.
 */

/** Map marker / ring colours — kept in sync with PropertyMap.tsx (schoolMarkerIcon + schoolCircle). */
const SCHOOL_MARKER_COLOR = 'hsl(var(--plum))';

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

export interface SchoolRadiusLegendProps {
  /** Effective radius in km — should match the radius ring drawn on the map. */
  radiusKm: number;
  className?: string;
}

/**
 * Bottom-left map legend for the selected-school radius state. Swatches match the real
 * markers: plum school pin, copper home pins, dashed-plum radius ring. The radius row
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
