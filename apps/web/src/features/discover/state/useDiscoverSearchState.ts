import { useCallback, useEffect, useState } from 'react';
import type React from 'react';

/**
 * Issue #1824 Slice S4 — search-keyword state extracted verbatim out of
 * MapDiscovery (searchQuery + debouncedSearch useState pair, the reverse
 * URL-sync effect, the 250ms local debounce effect, and handleSearchChange).
 *
 * KNOWN, INTENTIONAL split-brain preserved from #1666 (S4): debouncedSearch
 * (this hook, 250ms) drives the badge + map markers; urlState.q (URL-side
 * debounce in useDiscoverUrlState, 300ms) drives ActiveContextChips. These
 * are deliberately NOT the same signal — do NOT unify here (that is
 * #1824-4b/4c, a behaviour change needing its own approved issue + badge
 * re-characterisation). Byte-identical badge output is the correctness
 * invariant.
 *
 * The hook does NOT import useDiscoverUrlState — URL ownership stays
 * single-owner in the page. It takes the URL coupling as two injected
 * params: `urlQ` (current urlState.q, drives reverse-sync) and
 * `setUrlSearch` (= urlActions.setSearchQuery, already URL-side debounced).
 */
export interface UseDiscoverSearchStateParams {
  urlQ: string;
  setUrlSearch: (q: string) => void;
}

export function useDiscoverSearchState({ urlQ, setUrlSearch }: UseDiscoverSearchStateParams): {
  searchQuery: string;
  debouncedSearch: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  handleSearchChange: (q: string) => void;
} {
  const [searchQuery, setSearchQuery] = useState(() => urlQ);
  const [debouncedSearch, setDebouncedSearch] = useState(() => urlQ);

  // Trigger key: [urlQ] — only react to URL changes (e.g. browser back/forward), not local
  // state changes. `searchQuery` is read as an in-body guard (compared against the fresh
  // `urlQ`) but deliberately excluded from deps: including it would make every local edit
  // (typed searchQuery change) re-run this effect, which is exactly the reverse-sync loop
  // this split (searchQuery local vs urlQ URL-owned) is designed to avoid.
  useEffect(() => {
    if (urlQ !== searchQuery) {
      setSearchQuery(urlQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see trigger-key note above
  }, [urlQ]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const handleSearchChange = useCallback(
    (q: string) => {
      setSearchQuery(q);
      setUrlSearch(q);
    },
    [setUrlSearch],
  );

  return { searchQuery, debouncedSearch, setSearchQuery, handleSearchChange };
}
