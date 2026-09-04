import { useMemo } from 'react';
import { GLYPH_SVG_PATHS, getPropertyTypeVisual } from '@/lib/propertyTypeConfig';
import type { PropertyTypeGlyph } from '@/lib/propertyTypeConfig';

/**
 * R-B — Property-type legend for the area-first selected-area results state.
 *
 * Replaces the old 'Listing/Selected' two-row legend with a per-type count legend
 * derived from the actual listings in the current area. Only types with count > 0
 * are shown. Types that share a colour + label (e.g. villa/house both render as copper
 * 'Villas'/'Houses') are shown as separate rows if both are present.
 *
 * Rendered by MapDiscovery at `absolute bottom-10 left-4 z-[1000]` ONLY when
 * resolvedPanelContent === 'area-selected' AND areaMarkerListings.length > 0.
 */
interface MapMarkerLegendProps {
  /** The current area's resolved marker listings — used to derive per-type counts. */
  listings: Array<{ property_type: string }>;
}

interface LegendRow {
  type: string;
  label: string;
  colour: string;
  glyph: PropertyTypeGlyph;
  count: number;
}

export function MapMarkerLegend({ listings }: MapMarkerLegendProps) {
  // Derive per-type counts from listings, preserving insertion order of first occurrence.
  const rows = useMemo<LegendRow[]>(() => {
    const countMap = new Map<string, number>();
    for (const listing of listings) {
      const t = listing.property_type ?? 'other';
      countMap.set(t, (countMap.get(t) ?? 0) + 1);
    }

    const result: LegendRow[] = [];
    for (const [type, count] of countMap) {
      if (count === 0) continue;
      const visual = getPropertyTypeVisual(type);
      // Issue #2430 — the legend is a COUNT context, so it renders the plural
      // form of the shared label authority ("Apartments 12"). Same owner as the
      // card/popover singular label, so a Commercial row can no longer read
      // 'Other' here while the card next to it says something else.
      result.push({ type, label: visual.pluralLabel, colour: visual.colour, glyph: visual.glyph, count });
    }
    return result;
  }, [listings]);

  if (rows.length === 0) return null;

  return (
    <div
      className="rounded-lg border border-border bg-white/95 px-3.5 py-2.5 font-sans shadow-md backdrop-blur-sm"
      aria-label="Property type legend"
    >
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
        Property type
      </p>
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const pathData = GLYPH_SVG_PATHS[row.glyph];
          return (
            <div key={row.type} className="flex items-center gap-2">
              {/* Type colour disc with white glyph */}
              <span
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                style={{ background: row.colour }}
                aria-hidden="true"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={pathData} />
                </svg>
              </span>
              <span className="text-xs font-semibold text-foreground">{row.label}</span>
              <span className="ml-auto font-mono text-[11px] font-bold text-muted-foreground">
                {row.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
