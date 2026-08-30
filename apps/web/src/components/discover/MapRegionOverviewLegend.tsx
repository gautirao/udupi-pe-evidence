import type { RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';

interface MapRegionOverviewLegendProps {
  /** Short region label, e.g. "East" (region name with the city suffix stripped). */
  regionShortLabel: string;
  /** Marker-accurate variant per user decision q1 — mirrors the guidance-card body. */
  markerKind: RegionOverviewMarkerKind;
}

/**
 * Issue #1808 — region-aware legend variant shown ONLY at the region-overview
 * state (scope set, journey null). Replaces the generic MapAreaLegend for this
 * state only; MapAreaLegend's city-landing (scope=null) rendering is unchanged.
 * Line 2 is marker-accurate to what `overviewAreas` actually renders — never a
 * withholding phrase (declined by user decision q1).
 */
export function MapRegionOverviewLegend({ regionShortLabel, markerKind }: MapRegionOverviewLegendProps) {
  const line2 =
    markerKind === 'zones'
      ? 'Zones in this region'
      : markerKind === 'areas'
        ? 'Areas in this region'
        : 'Zones and areas in this region';

  return (
    <div
      data-testid="region-overview-legend"
      className="flex flex-col gap-1 rounded-md border border-border bg-card/90 px-3 py-2.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm"
    >
      <span>{regionShortLabel} overview</span>
      <span className="font-normal text-muted-foreground">{line2}</span>
    </div>
  );
}
