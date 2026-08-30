import { useEffect, useState } from 'react';

/**
 * Issue #1808 §8 — reduced-motion detection for the guidance ring/nudge.
 * JS-driven (not CSS-only) so behaviour is deterministically testable; the
 * CSS @media (prefers-reduced-motion: reduce) fallback in index.css is
 * defense-in-depth for the same rule.
 *
 * Issue #1824 Slice S2a — extracted verbatim out of MapDiscovery. This is a
 * read-only environment flag (no mutations), so it returns a plain boolean
 * rather than a ControllerResult view/commands shape.
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mql.matches);
    const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}
