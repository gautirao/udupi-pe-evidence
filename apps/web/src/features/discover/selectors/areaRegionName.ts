import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { SummaryRegionRef } from '@/utils/macroRegionResolver';

/**
 * Issue #2657 commit C1 — pure selector lifted VERBATIM in semantics from
 * DiscoverRightPanel.tsx :1758-1762 (the `case 'area-selected'` regionName
 * computation).
 *
 * `prettifyZoneSlug` is injected rather than imported here: it is defined in
 * `@/components/discover/SchoolRadiusMapOverlay.tsx`, a component module, and
 * `selectors/**` must stay renderless / free of `@/components/*` VALUE
 * imports (selectorPurity.guard.test.ts). The caller (DiscoverRightPanel,
 * which already imports the real function) passes it through unchanged.
 */
export interface AreaRegionNameInput {
  scope: string | null | undefined;
  summaryRegions: SummaryRegionRef[] | undefined;
  activeGroup: AreaGroup | null | undefined;
}

export function resolveAreaRegionName(
  { scope, summaryRegions, activeGroup }: AreaRegionNameInput,
  prettifyZoneSlug: (slug: string | null | undefined) => string | null,
): string | null {
  return scope
    ? summaryRegions?.find((r) => r.regionKey.toLowerCase() === scope.toLowerCase())?.regionLabel ??
        prettifyZoneSlug(scope)
    : activeGroup?.region_label ?? null;
}
