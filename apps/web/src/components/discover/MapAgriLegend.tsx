import React from 'react';
import { Sprout, MapPin, Route } from 'lucide-react';

/**
 * Bottom-left map legend for the agri-first journey (Issue #1771).
 *
 * Contextual per drill-down stage (mock parity):
 *   - 'landing'  → Corridors (direction clusters on the city overview)
 *   - 'corridor' → Corridors + Village clusters (sector overlay + town clusters)
 *   - 'locality' → Parcels (individual parcel markers)
 */
export type AgriLegendStage = 'landing' | 'corridor' | 'locality';

interface MapAgriLegendProps {
  stage?: AgriLegendStage;
}

export function MapAgriLegend({ stage = 'landing' }: MapAgriLegendProps) {
  return (
    <div
      data-testid="agri-map-legend"
      data-stage={stage}
      aria-label="Agricultural map markers legend"
      className="flex flex-col gap-1.5 rounded-md border border-border bg-card/90 px-3 py-2.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm"
    >
      {stage !== 'locality' && (
        <span className="flex items-center gap-2">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-evergreen">
            <Route className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          Corridors
        </span>
      )}
      {stage === 'corridor' && (
        <span className="flex items-center gap-2">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          Village clusters
        </span>
      )}
      {stage === 'locality' && (
        <span className="flex items-center gap-2">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-evergreen">
            <Sprout className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          Parcels
        </span>
      )}
    </div>
  );
}

export { MapAgriLegend as AgriMapLegend };
