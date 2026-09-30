// Issue #2762 PR-B — Agricultural's compact-FilterBar adapter. Wraps `AgriFiltersPanel`'s
// existing, UNMODIFIED controls (acreage/price/land-category/farmhouse/fencing/water-source, its
// own staged-draft local state and single "Apply Filters" commit) as a single render-slot group
// for the shared `CompactFilterBar`. `AgriFiltersPanel` owns one internal staged draft across all
// its fields (not per-field immediate commit like By-area's pills), so it is NOT split into
// separate pills here — that would require forking its internal state, which the extraction
// contract explicitly forbids ("reuse them as render slots", not reimplement). One "Land filters"
// pill opens the panel's full existing form unchanged.
import type { AgriFilterValues } from './AgriFiltersPanel';
import { AgriFiltersPanel } from './AgriFiltersPanel';
import type { FilterBarGroup } from '@/features/discover/buyer-filters/sections/CompactFilterBar';

export interface UseAgriFilterBarGroupsParams {
  acresMin?: number;
  acresMax?: number;
  priceMinRupees?: number;
  priceMaxRupees?: number;
  isAuthenticated: boolean;
  onApply: (filters: AgriFilterValues) => void;
  onClear: () => void;
  agriLandCategory?: string | null;
  agriFarmhouseAvailable?: boolean | null;
  agriFencingDone?: boolean | null;
  agriWaterSource?: string | null;
}

/** True when any agri filter is currently committed (URL-driven props), matching the same
 * "is anything active" convention `MapFilters.tsx`'s `hasActiveFilters` uses elsewhere. */
function hasActiveAgriFilters(p: UseAgriFilterBarGroupsParams): boolean {
  return (
    p.acresMin != null ||
    p.acresMax != null ||
    p.priceMinRupees != null ||
    p.priceMaxRupees != null ||
    p.agriLandCategory != null ||
    p.agriFarmhouseAvailable != null ||
    p.agriFencingDone != null ||
    p.agriWaterSource != null
  );
}

export function useAgriFilterBarGroups(params: UseAgriFilterBarGroupsParams): FilterBarGroup[] {
  return [
    {
      id: 'agri-filters',
      label: 'Land filters',
      isActive: hasActiveAgriFilters(params),
      testId: 'filter-pill-agri-filters',
      renderPopover: () => (
        <AgriFiltersPanel
          acresMin={params.acresMin}
          acresMax={params.acresMax}
          priceMinRupees={params.priceMinRupees}
          priceMaxRupees={params.priceMaxRupees}
          isAuthenticated={params.isAuthenticated}
          onApply={params.onApply}
          onClear={params.onClear}
          agriLandCategory={params.agriLandCategory}
          agriFarmhouseAvailable={params.agriFarmhouseAvailable}
          agriFencingDone={params.agriFencingDone}
          agriWaterSource={params.agriWaterSource}
        />
      ),
    },
  ];
}
