import { useEffect, useRef, useState, useCallback } from 'react';
import type { MobileView } from '@/features/discover/context/types';

export interface UseDiscoverViewportTrackerParams {
  /** From useDiscoverShell() — used only to key the MAP->LIST leave-cleanup effect. */
  mobileView: MobileView;
  /** From useDiscoverPageState() — used only to key the city-change reset effect. */
  city: string;
}

export interface UseDiscoverViewportTrackerResult {
  mapBbox: [number, number, number, number] | null;
  handleBoundsChange: (bbox: [number, number, number, number]) => void;
}

/**
 * Issue #2142 Commit 3 — moved verbatim out of MapDiscovery.tsx.
 *
 * Owns the transient map viewport bbox (never stored in URL): the debounced
 * `handleBoundsChange` writer, its cleanup-on-unmount effect, the
 * MAP->LIST-transition cleanup effect (issue #1953 RH4 — MapDiscovery
 * itself doesn't unmount on that transition, so the plain unmount cleanup
 * never fires for it), and the city-change reset effect (previous city's
 * viewport is out-of-bounds for a new city).
 *
 * TypeScript-required `mobileView`/`city` inputs are the ordering guard:
 * the composition root cannot call this controller before
 * useDiscoverShell()/useDiscoverPageState() have resolved those values —
 * see controllerOrdering.contract.test.ts.
 */
export function useDiscoverViewportTracker({
  mobileView,
  city,
}: UseDiscoverViewportTrackerParams): UseDiscoverViewportTrackerResult {
  const [mapBbox, setMapBbox] = useState<[number, number, number, number] | null>(null);
  const bboxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBoundsChange = useCallback(
    (bbox: [number, number, number, number]) => {
      if (bboxTimerRef.current) clearTimeout(bboxTimerRef.current);
      bboxTimerRef.current = setTimeout(() => {
        setMapBbox(bbox);
      }, 300);
    },
    [],
  );

  // Cleanup bbox timer on unmount
  useEffect(() => {
    return () => {
      if (bboxTimerRef.current) clearTimeout(bboxTimerRef.current);
    };
  }, []);

  // RH4 (issue #1953, narrowed) — the mobile map view unmounts when switching
  // from MAP to LIST, but MapDiscovery itself does not unmount then, so the
  // unmount-only cleanup above never runs for that transition. Without this, a
  // bboxTimer armed by the last pan/zoom before leaving MAP could still fire
  // setMapBbox after the map is gone. Keyed on mobileView only, so this fires
  // on the MAP -> LIST transition, not on every render.
  useEffect(() => {
    if (mobileView !== 'MAP' && bboxTimerRef.current) {
      clearTimeout(bboxTimerRef.current);
      bboxTimerRef.current = null;
    }
  }, [mobileView]);

  // Reset bbox when city changes — the previous city's viewport is out-of-bounds for the new city.
  useEffect(() => {
    setMapBbox(null);
  }, [city]);

  return { mapBbox, handleBoundsChange };
}
