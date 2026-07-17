import { MapPin } from 'lucide-react';

/**
 * Discover map marker redesign — "EXPLORE THE MAP" instructional card shown
 * only at the bare city landing (5 macro-region bubbles, no scope/journey
 * picked yet — mapLayerKind === 'macro-region-bubbles'). Ported from the
 * ReTrends design system's PortalMap.jsx `DPMap` overlay (gated there on
 * `layer === "region-bubbles"`), positioned/styled against this app's real
 * tokens: var(--paper)/var(--radius-lg)/var(--shadow-md)/var(--accent) map
 * to bg-card/rounded-lg/shadow-md/hsl(var(--copper)). Sits beneath the
 * top-left city chip (DiscoverMapContextOverlay's AreaIndicatorOverlay "city"
 * variant, at top-4/left-4); never covers the map centre or the top-right
 * CitySelect control. Purely presentational — no URL/camera writes.
 */
export function ExploreMapPanel() {
  return (
    <div
      data-testid="explore-map-panel"
      className="absolute z-[1000] top-[66px] left-[18px] max-w-[min(300px,calc(100%-36px))] rounded-lg border border-border border-l-[3px] border-l-[hsl(var(--copper))] bg-card shadow-md px-3.5 py-2.5"
    >
      <div className="flex items-center gap-[7px] mb-[3px]">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--copper))]" aria-hidden="true" />
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[hsl(var(--copper))]">
          Explore the map
        </span>
      </div>
      <p className="m-0 text-[12.5px] leading-[1.45] text-foreground [text-wrap:pretty]">
        Select a region to zoom in, or choose one from the list — both start the same journey.
      </p>
    </div>
  );
}
