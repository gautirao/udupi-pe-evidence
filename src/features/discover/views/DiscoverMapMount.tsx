import { Suspense, lazy } from 'react';
import { useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { MapSkeleton } from '@/components/discover/MapSkeleton';
import type { DiscoverMapCanvasProps } from './DiscoverMapCanvas';

/**
 * Issue #1953 (build step 4) — the true-unmount gate for the mobile List/Map
 * shell. ONE component serves both the desktop always-mounted case and the
 * mobile mounted-only-in-MAP case:
 *
 *  - Desktop (isMobileShell === false): shouldMount is always true, so
 *    DiscoverMapCanvas/Leaflet mounts exactly like it always has.
 *  - Mobile LIST (isMobileShell && mobileView === 'LIST'): shouldMount is
 *    false and this component returns `null`. This is a REAL unmount — no
 *    hidden attribute, no display:none/visibility:hidden/opacity:0, no
 *    off-screen positioning. Leaflet is never constructed and no tiles are
 *    requested while the user is on the List view.
 *  - Mobile MAP (isMobileShell && mobileView === 'MAP'): shouldMount is true
 *    and the map (re)mounts fresh.
 *
 * The ~100-prop DiscoverMapCanvasProps surface passes straight through
 * unchanged — this component adds no props of its own and restructures
 * nothing. It is the ONLY thing standing between MapDiscovery.tsx's call
 * site and the (unchanged) DiscoverMapCanvas.
 */
const LazyDiscoverMapCanvas = lazy(() =>
  import('./DiscoverMapCanvas').then((mod) => ({ default: mod.DiscoverMapCanvas })),
);

// Desktop must be unchanged by construction: /discover is eagerly imported on
// desktop, so kick off the dynamic import at module-eval time (before first
// render) whenever the viewport is already wider than the mobile-shell
// breakpoint (820px, matching DiscoverContext.tsx's useMediaQuery call).
// React.lazy then resolves in the same commit as first paint, so no visible
// Suspense flash occurs on desktop. Guarded on `window` existing (SSR/test
// environments without a DOM) and left a no-op for a genuinely mobile first
// load, which should not pay for an unused prefetch.
if (typeof window !== 'undefined' && window.innerWidth > 820) {
  void import('./DiscoverMapCanvas');
}

export function DiscoverMapMount(props: DiscoverMapCanvasProps) {
  const { isMobileShell, mobileView } = useDiscoverShell();
  const shouldMount = !isMobileShell || mobileView === 'MAP';

  if (!shouldMount) {
    return null;
  }

  return (
    <Suspense fallback={<MapSkeleton />}>
      <LazyDiscoverMapCanvas {...props} />
    </Suspense>
  );
}
