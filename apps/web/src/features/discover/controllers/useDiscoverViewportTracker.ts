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
  /**
   * Cancels any pending debounced `handleBoundsChange` update and seeds
   * `mapBbox` synchronously with `bbox` instead. See issue #2426 fix-cycle-2
   * — call this at the moment a VIEWPORT scope commits, with the exact
   * bounds being committed, so a settle that predates the commit (already
   * in flight when the commit happened) can never land afterward and
   * overwrite the just-committed value with stale bounds.
   */
  commitBbox: (bbox: [number, number, number, number]) => void;
  /**
   * Monotonically increasing counter, bumped once per genuine user camera
   * gesture (via `handleUserCameraGesture`, wired to PropertyMap's
   * `onUserCameraGesture`). Issue #2426 fix cycle 4 — read fresh at each
   * render (a plain ref, not state — a gesture bump must not itself force a
   * re-render; whatever value it holds is picked up correctly the next time
   * `mapBbox` changes and this component re-renders anyway). Lets
   * `useDiscoverViewportSearch` gate `isDirty` on "a real gesture happened
   * since the last commit", independent of settle/debounce timing — closes
   * the trailing-inertia-settle gap that `commitBbox` alone cannot (it only
   * cancels a timer already pending at the commit instant, not a genuine
   * new settle that arrives afterward).
   */
  userCameraGestureSeq: number;
  /** Bumps `userCameraGestureSeq`. Wire to PropertyMap's `onUserCameraGesture`. */
  handleUserCameraGesture: () => void;
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
  const userCameraGestureSeqRef = useRef(0);
  const handleUserCameraGesture = useCallback(() => {
    userCameraGestureSeqRef.current += 1;
  }, []);

  const handleBoundsChange = useCallback(
    (bbox: [number, number, number, number]) => {
      if (bboxTimerRef.current) clearTimeout(bboxTimerRef.current);
      bboxTimerRef.current = setTimeout(() => {
        setMapBbox(bbox);
      }, 300);
    },
    [],
  );

  // Issue #2426 fix-cycle-2 — a settle immediately preceding a VIEWPORT
  // commit (e.g. trailing pan momentum) can still have its debounced
  // handleBoundsChange update in flight when the commit reads the CURRENT
  // mapBbox to commit. If that pending update later lands unchanged, no
  // harm; but if two settles landed close together, the commit may have
  // used an earlier settle's already-applied bbox while a later settle's
  // update is still pending — and that pending update, landing after the
  // commit with no further real user gesture, fabricates a dirty viewport
  // (isDirty flips true purely from the tracker catching up, not from any
  // new pan/zoom). Cancelling the pending timer and seeding mapBbox
  // synchronously with the exact bounds just committed closes that gap: no
  // stale settle can ever land after this point and diverge from what was
  // committed.
  const commitBbox = useCallback((bbox: [number, number, number, number]) => {
    if (bboxTimerRef.current) {
      clearTimeout(bboxTimerRef.current);
      bboxTimerRef.current = null;
    }
    setMapBbox(bbox);
  }, []);

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

  return {
    mapBbox,
    handleBoundsChange,
    commitBbox,
    userCameraGestureSeq: userCameraGestureSeqRef.current,
    handleUserCameraGesture,
  };
}
