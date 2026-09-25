/**
 * Issue #2708 — the ONE canonical Buy/Rent intent-transition rule, extracted so List
 * (`DiscoverControlBar` → `city.ts`'s `setIntent`) and Map (`MapFilterSheet`'s
 * `handleSelectIntent`) apply the exact same reset/drop logic instead of each carrying
 * its own copy that can silently drift.
 *
 * Rule (approved design doc `MAP_FILTERS_2627.md` §7, "the exact List rule" — which,
 * pre-#2708, List itself did not actually implement; this file is now the single source
 * of truth both sides call):
 *   - Switching intent ALWAYS resets both budget bounds (`priceMin`/`priceMax`),
 *     regardless of direction.
 *   - Switching TO Rent additionally drops Buy-only `residential_plot` from
 *     `propertyTypes` (Plot has no rental inventory contract). Switching TO Buy leaves
 *     `propertyTypes` untouched.
 *   - Every other filter field is preserved unchanged (AC4) — this function only ever
 *     touches `priceMin`/`priceMax`/`propertyTypes`.
 */
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';

export interface IntentTransitionFilters {
  propertyTypes?: string[];
  priceMin?: number;
  priceMax?: number;
}

const RESIDENTIAL_PLOT = 'residential_plot';

/**
 * Pure — no URL, no React state. Callers own how the result is written back (staged
 * draft for Map, a single atomic URLSearchParams write for List).
 */
export function applyIntentTransition<F extends IntentTransitionFilters>(
  filters: F,
  nextIntent: DiscoverIntent,
): F {
  const filteredTypes = (filters.propertyTypes ?? []).filter((t) => t !== RESIDENTIAL_PLOT);
  return {
    ...filters,
    priceMin: undefined,
    priceMax: undefined,
    propertyTypes:
      nextIntent === 'rent'
        ? filteredTypes.length > 0
          ? filteredTypes
          : undefined
        : filters.propertyTypes,
  };
}
