import * as React from 'react';

/**
 * Generic matchMedia-backed media query hook. Mirrors the matchMedia +
 * addEventListener('change') + cleanup pattern in src/hooks/use-mobile.tsx,
 * but is intentionally NOT a replacement for useIsMobile there (that hook is
 * pinned at 768px and owned by an unrelated sidebar). This hook takes an
 * arbitrary query string so callers (e.g. the Discover mobile shell at
 * 820px) can each own their own breakpoint.
 */
export function useMediaQuery(query: string): boolean {
  const getMatches = React.useCallback((): boolean => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  }, [query]);

  const [matches, setMatches] = React.useState<boolean>(getMatches);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    // Re-sync in case `query` changed between render and effect, or the
    // environment's matches changed before the listener was attached.
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
