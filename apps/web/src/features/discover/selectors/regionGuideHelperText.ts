import type { RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';
import type { SummaryRegionRef } from '@/utils/macroRegionResolver';

/**
 * Issue #2657 commit C1 — pure selector lifted VERBATIM in semantics from
 * DiscoverRightPanel.tsx :2136-2142 (Issue #1808, relocated in #1953 build
 * step 6). Computes the region-guide helper copy shown under the persistent
 * JourneySwitcher from `summaryRegions`/`scope`/markerKind — data the panel
 * already receives as props, sourced from the same backend region-summary
 * rollup MapDiscovery fetches once.
 */
export interface RegionGuideHelperTextInput {
  summaryRegions: SummaryRegionRef[];
  scope: string | null | undefined;
  markerKind: RegionOverviewMarkerKind | null | undefined;
}

export function buildRegionGuideHelperText({
  summaryRegions,
  scope,
  markerKind,
}: RegionGuideHelperTextInput): string {
  const selectedRegionLabel =
    summaryRegions.find((r) => r.regionKey === scope)?.regionLabel ?? scope ?? '';
  if (markerKind === 'zones') {
    return `${selectedRegionLabel} selected. The map shows this region's zones — choose how you want to continue below.`;
  }
  if (markerKind === 'areas') {
    return `${selectedRegionLabel} selected. The map shows this region's areas — choose how you want to continue below.`;
  }
  return `${selectedRegionLabel} selected. The map shows an overview of this region — choose how you want to continue below.`;
}
