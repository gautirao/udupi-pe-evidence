interface MapAreaLegendProps {
  /**
   * Whether to show the muted "Areas with no listings yet" row. False on the normal
   * landing (zero-property markers are hidden there, #1588), true on the all-zero
   * state where muted markers are intentionally displayed.
   */
  showZeroRow?: boolean;
}

/**
 * Bottom-left map legend explaining the area-count markers on the Discover landing
 * (Issue #1588). Copper filled dot = areas with properties; hollow grey ring = areas
 * with no listings yet (only shown when zero-count markers are actually on the map).
 */
export function MapAreaLegend({ showZeroRow = true }: MapAreaLegendProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-card/90 px-3 py-2.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm">
      <span className="flex items-center gap-2">
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
          <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--copper))]" />
        </span>
        Areas with properties
      </span>
      {showZeroRow && (
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
            <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-muted-foreground/60" />
          </span>
          Areas with no listings yet
        </span>
      )}
    </div>
  );
}
