/**
 * Issue #1817 (AC7) — pure empty-state copy routing, keyed off the SAME cause signal
 * the result-count selector already exposes (`DiscoverBadgeState`'s zero-* variants —
 * see deriveDiscoverBadge/formatDiscoverBadgeCopy in src/pages/MapDiscovery.tsx), so
 * the panel empty state and the badge/count copy can never disagree about *why* the
 * list is empty (design §7).
 *
 * A filtered/search zero must never read as "this place has no listings" — it must
 * read as "your filters/search are hiding them", with a way to lift the constraint.
 * A genuinely-empty scope (N=0, no filters/search) is the only case that legitimately
 * says "No listings here yet".
 *
 * Pure and framework-agnostic: callers wire the returned label strings to their own
 * onClick handlers (this module has no knowledge of URL state or callbacks) and pass
 * them into the existing shared `EmptyState` component (src/components/ui/EmptyState.tsx)
 * — never a bespoke error-styled block.
 */

export type DiscoverEmptyCause = 'filters' | 'search' | 'both' | 'empty';

export interface DiscoverEmptyStateCopyInput {
  /** A property FILTER (type/beds/price/seller/date/booleans) is currently active. */
  hasPropertyFilters: boolean;
  /** A non-empty search query is currently active. */
  hasSearch: boolean;
  /** The trimmed search query text (only used when hasSearch). */
  searchQuery?: string;
  /** N — the unfiltered in-scope total. Null when not derivable (falls back to omitting the number). */
  n: number | null;
  /** Current scope's display label, e.g. "Whitefield", "Bangalore". */
  scopeLabel: string;
  /** City display label, for "Search all of {city}" — only offered when scope is narrower than city. */
  cityLabel: string;
  /** True when the active scope IS the city itself (no narrower "search all of city" action to offer). */
  isCityScope: boolean;
  /** Noun for the count, e.g. "homes" / "properties". Defaults to "homes". */
  noun?: string;
}

export interface DiscoverEmptyStateCopy {
  cause: DiscoverEmptyCause;
  heading: string;
  description?: string;
  /** Primary action label — undefined when the genuinely-empty cause offers no filter/search action. */
  primaryLabel?: 'Clear filters' | 'Clear search';
  /** Secondary action label — undefined when there is nothing else useful to offer. */
  secondaryLabel?: string;
  /** True when the secondary action is "Clear filters" (both-active case) rather than a widen/see-all action. */
  secondaryIsClearFilters?: boolean;
}

/**
 * Derive the (cause, heading, description, action labels) tuple for a zero-result
 * panel, per design §7's cause table. Mirrors the precedence used by
 * deriveDiscoverBadge's zeroState: filters win over search when BOTH determine the
 * combined "both" cause; search-only and filters-only are otherwise mutually exclusive.
 */
export function deriveDiscoverEmptyStateCopy({
  hasPropertyFilters,
  hasSearch,
  searchQuery,
  n,
  scopeLabel,
  cityLabel,
  isCityScope,
  noun = 'homes',
}: DiscoverEmptyStateCopyInput): DiscoverEmptyStateCopy {
  const q = searchQuery?.trim() ?? '';
  const nText = n != null ? n.toLocaleString() : null;

  if (hasPropertyFilters && hasSearch) {
    return {
      cause: 'both',
      heading: 'No homes match your search and filters',
      // Design §7: lead with Clear search first (most specific/most-recent constraint).
      primaryLabel: 'Clear search',
      secondaryLabel: 'Clear filters',
      secondaryIsClearFilters: true,
    };
  }

  if (hasSearch) {
    return {
      cause: 'search',
      heading: `No results for "${q}"`,
      description: `Nothing in ${scopeLabel} matches that search.`,
      primaryLabel: 'Clear search',
      secondaryLabel: isCityScope ? undefined : `Search all of ${cityLabel}`,
    };
  }

  if (hasPropertyFilters) {
    return {
      cause: 'filters',
      heading: 'No homes match these filters',
      description:
        nText != null
          ? `All ${nText} ${noun} in ${scopeLabel} are still here — your filters are hiding them.`
          : `Your filters are hiding the ${noun} in ${scopeLabel} — they're still here.`,
      primaryLabel: 'Clear filters',
      secondaryLabel: nText != null ? `See all ${nText} in ${scopeLabel}` : undefined,
    };
  }

  // Scope genuinely empty (N=0, no filters/search active) — the existing low-data
  // treatment; never a filter/search action here (there is nothing to clear).
  return {
    cause: 'empty',
    heading: 'No listings here yet',
    description: `We add more across ${cityLabel} weekly.`,
  };
}
