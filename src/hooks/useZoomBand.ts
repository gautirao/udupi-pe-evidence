import { useRef } from 'react';
import { resolveZoomBand, type ZoomBand } from '@/lib/map/zoomPolicy';

/**
 * Issue #1882 (Track A PR3, Slice S2) — stateful zoom-hysteresis hook.
 *
 * Holds the last COMMITTED zoom band in a ref and delegates the actual
 * enter/exit/dead-band decision to the pure `resolveZoomBand` (zoomPolicy.ts).
 * Recomputes synchronously on every render (no effect, no extra render) so
 * the returned band is always consistent with the `rawZoom` passed this
 * render — a subsequent render with an unchanged `rawZoom` simply reproduces
 * the same committed band with zero incremental cost.
 *
 * MUST be called from a component that stays mounted across zoom changes so
 * the ref persists — this is called from inside `PropertyMap` against its
 * existing `mapZoom` prop (PropertyMap does not unmount during zoom/pan), NOT
 * from a per-navigation component that might remount and lose the ref.
 */
export function useZoomBand(rawZoom: number): ZoomBand {
  const bandRef = useRef<ZoomBand>('overview');
  bandRef.current = resolveZoomBand(rawZoom, bandRef.current);
  return bandRef.current;
}
