import React from 'react';
import { Layers, MapPin, GraduationCap } from 'lucide-react';

/**
 * Bottom-left map legend for the school-first journey (visual-parity polish).
 *
 * Contextual per drill-down stage (mirrors MapAgriLegend's #1771 pattern):
 *   - 'landing' → School zones (zone clusters on the city overview)
 *   - 'zone'    → Areas (member-area markers inside the selected zone)
 *   - 'area'    → Schools (individual school markers inside the selected area)
 *
 * The fourth school-first stage — a specific school selected, with its search
 * radius — keeps the existing `SchoolRadiusLegend` (SchoolRadiusMapOverlay.tsx),
 * which already shows the school marker + radius-circle swatches; this legend
 * is intentionally NOT rendered for that stage (MapDiscovery gates on
 * `schoolRadiusOverlay` before rendering this component).
 */
export type SchoolLegendStage = 'landing' | 'zone' | 'area';

interface MapSchoolLegendProps {
  stage?: SchoolLegendStage;
}

export function MapSchoolLegend({ stage = 'landing' }: MapSchoolLegendProps) {
  return (
    <div
      data-testid="school-map-legend"
      data-stage={stage}
      aria-label="School map markers legend"
      className="flex flex-col gap-1.5 rounded-md border border-border bg-card/90 px-3 py-2.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm"
    >
      {stage === 'landing' && (
        <span className="flex items-center gap-2">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-plum">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          School zones
        </span>
      )}
      {stage === 'zone' && (
        <span className="flex items-center gap-2">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-plum">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          Areas
        </span>
      )}
      {stage === 'area' && (
        <span className="flex items-center gap-2">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-plum">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          Schools
        </span>
      )}
    </div>
  );
}
