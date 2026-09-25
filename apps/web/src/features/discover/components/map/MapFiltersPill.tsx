// Issue #2628 — the mobile Map "Filters" entry (design doc MAP_FILTERS_2627.md, Decisions #1/#5).
//
// Outlined at rest, navy fill + an accent count badge once at least one refinement is applied.
// The badge counts REFINEMENTS ONLY — Buy/Rent (`purpose`) and the Residential/Commercial family
// are always stated by the results heading, never by this badge (owner ruling 2 in the design
// doc: "Filters N counts only refinements beyond intent and family"). Never icon-only: the visible
// word "Filters" always renders alongside the sliders icon (design doc Accessibility section).
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { summariseActiveFilters } from '@/components/discover/zeroRecoveryCopy';

/**
 * The SAME six axes `usePropertyFilterGroups`'s own `hasPropertyFilters` tracks (see that hook's
 * header for why each one counts as "a real narrowing"), collapsed to a per-AXIS count rather than
 * a per-VALUE count: two selected bedroom chips or a min+max budget pair is still ONE refinement,
 * matching the design doc's "Filtered: 2+ BHK · Apartment · up to ₹1.20 Cr" (three axes, not five
 * values). `commercialSubtypes` and `propertyTypes` are mutually exclusive by family (see
 * PropertyFilterGroups.tsx's `activeFamily` derivation), so summing both never double-counts one
 * selection as two axes.
 */
export function computeMapFilterRefinementCount(filters: PropertyFilters): number {
  let count = 0;
  if (filters.propertyTypes?.length) count += 1;
  if (filters.commercialSubtypes?.length) count += 1;
  if (filters.bedrooms?.length) count += 1;
  if (filters.priceMin != null || filters.priceMax != null) count += 1;
  if (filters.areaMinSqft != null || filters.areaMaxSqft != null) count += 1;
  if (filters.readyToMove) count += 1;
  return count;
}

// Issue #2628 (steps 4-6/8) — the same COMMERCIAL family markers AreaSelectedPanel.tsx's
// module-level `COMMERCIAL_FAMILY_TOKENS` names (that constant is not exported, so this is a
// same-values, independently-declared copy, not an import).
const MAP_COMMERCIAL_FAMILY_TOKENS = new Set([
  'commercial',
  'commercial_building',
  'warehouse',
  'commercial_land',
]);

/** Design doc State-mapping row "Residential/Commercial — existing filters.family". `PropertyFilters`
 * carries no `family` field of its own; this is a plain, stateless derivation from `propertyTypes`/
 * `commercialSubtypes`, deliberately NOT `usePropertyFilterGroups`'s own `activeFamily` (that also
 * layers a local optimistic `familyOverride` — a second call reading it purely for display can
 * disagree with the caller's own instance; see PropertyFilterGroups.tsx's file header). */
export function deriveMapFiltersFamily(filters: PropertyFilters): 'residential' | 'commercial' {
  return filters.propertyTypes?.some((t) => MAP_COMMERCIAL_FAMILY_TOKENS.has(t)) ||
    (filters.commercialSubtypes?.length ?? 0) > 0
    ? 'commercial'
    : 'residential';
}

/** Design doc Decision #5/#6 — "N ⟨homes for sale | homes to rent | commercial properties⟩ ·
 * Residential | Commercial". Commercial gets one umbrella noun regardless of Buy/Rent, since the
 * design's own example does not split commercial by intent. */
export function computeMapResultsUnitPhrase(
  family: 'residential' | 'commercial',
  intent: DiscoverIntent,
): string {
  if (family === 'commercial') return 'commercial properties';
  return intent === 'rent' ? 'homes to rent' : 'homes for sale';
}

export function computeMapResultsHeadingText(
  count: number,
  family: 'residential' | 'commercial',
  intent: DiscoverIntent,
): string {
  const familyLabel = family === 'commercial' ? 'Commercial' : 'Residential';
  return `${count.toLocaleString('en-IN')} ${computeMapResultsUnitPhrase(family, intent)} · ${familyLabel}`;
}

/**
 * Issue #2628 (step 4/8) — "Filtered: … Edit" summary line (Decision #5): the SAME axes
 * `computeMapFilterRefinementCount` counts, worded for a shopper. Reuses `summariseActiveFilters`
 * — the EXISTING label logic `AreaZeroResultRecovery` (List's own zero-result banner) already
 * uses — rather than a second parallel labeller. Its first element is always the Buy/Rent word,
 * which the results heading already states via the noun above, so it is dropped (`slice(1)`) per
 * "badge count excludes Buy/Rent + family". The bare family-marker propertyType (e.g.
 * `['commercial']` with no subtype chosen — "All commercial") is stripped before summarising for
 * the same reason; a genuine commercial SUBTYPE selection is then appended from
 * `commercialSubtypes` (a field `summariseActiveFilters` does not cover).
 */
export function computeMapFilteredSummaryParts(filters: PropertyFilters, intent: DiscoverIntent): string[] {
  const withoutFamilyMarkers: PropertyFilters = {
    ...filters,
    propertyTypes: filters.propertyTypes?.filter((t) => !MAP_COMMERCIAL_FAMILY_TOKENS.has(t)),
  };
  const parts = summariseActiveFilters(withoutFamilyMarkers, intent).slice(1);
  if (filters.commercialSubtypes?.length) {
    const subtypeLabel = filters.commercialSubtypes
      .map((s) => s.charAt(0) + s.slice(1).toLowerCase())
      .join(' / ');
    parts.unshift(subtypeLabel);
  }
  return parts;
}

export interface MapFiltersPillProps {
  /** Refinement count — see `computeMapFilterRefinementCount`. 0 renders the outlined "at rest" state. */
  count: number;
  onClick: () => void;
  /** Short human summary of the current intent+family, e.g. "homes to rent, Residential" — spoken
   * in the accessible name per the design doc's Accessibility section ("Intent is always spoken"). */
  intentFamilySummary: string;
}

export function MapFiltersPill({ count, onClick, intentFamilySummary }: MapFiltersPillProps) {
  const isActive = count > 0;
  const ariaLabel = isActive
    ? `Filters, ${count} active. Showing ${intentFamilySummary}.`
    : `Filters, no refinements. Showing ${intentFamilySummary}.`;

  return (
    <button
      type="button"
      id="mf-entry"
      data-testid="map-filters-pill"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={false}
      aria-controls="mf-sheet"
      aria-label={ariaLabel}
      className={cn(
        'pointer-events-auto flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold shadow-md transition-colors',
        isActive
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border bg-background/95 text-foreground hover:border-border-strong',
      )}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
      Filters
      {isActive && (
        <Badge
          variant="secondary"
          className="ml-0.5 h-4 min-w-4 justify-center rounded-full bg-background/90 px-1 text-[10px] leading-none text-primary"
          data-testid="map-filters-pill-count"
        >
          {count}
        </Badge>
      )}
    </button>
  );
}
