/**
 * Viewport URL domain — Issue #2001 Slice 2 PR2.
 *
 * Owns: `lat`/`lon`/`zoom` read + the debounced `reportViewport` write.
 * See useDiscoverUrlState.ts's module doc for the full param contract.
 */
import { useCallback } from 'react';
import type { UrlDomainCtx, UrlDomainModule } from './_shared';
import type {
  DiscoverUrlActions,
  DiscoverUrlState,
  DiscoverViewport,
} from '@/hooks/useDiscoverUrlState';

const DEBOUNCE_MS = 300;
const LAT_LON_PRECISION = 5;

function round(n: number, dp: number): number {
  const factor = Math.pow(10, dp);
  return Math.round(n * factor) / factor;
}

type ViewportState = Pick<DiscoverUrlState, 'viewport'>;
type ViewportActions = Pick<DiscoverUrlActions, 'reportViewport'>;

export function useViewportUrlDomain(
  ctx: UrlDomainCtx,
): UrlDomainModule<ViewportState, ViewportActions> {
  const { urlParams, setUrlParams, timers, liveUrlParamsRef } = ctx;

  const rawLat = urlParams.get('lat');
  const rawLon = urlParams.get('lon');
  const rawZoom = urlParams.get('zoom');
  const lat = rawLat ? parseFloat(rawLat) : null;
  const lon = rawLon ? parseFloat(rawLon) : null;
  const zoom = rawZoom ? parseInt(rawZoom, 10) : null;
  const viewport: DiscoverViewport | null =
    lat != null && !isNaN(lat) && lon != null && !isNaN(lon) && zoom != null && !isNaN(zoom)
      ? { lat, lon, zoom }
      : null;

  const reportViewport = useCallback(
    (vp: DiscoverViewport) => {
      if (timers.viewport.current) clearTimeout(timers.viewport.current);
      timers.viewport.current = setTimeout(() => {
        timers.viewport.current = null;
        // Issue #2083 RC_A part 2 — read the LIVE params via the facade-owned
        // ref, NOT `setUrlParams`'s functional-updater `prev`. `prev` is the
        // `searchParams` closed over from the render that produced this
        // `setUrlParams` identity (react-router-dom 6.30.1), which can be
        // stale by the time this 300ms timer fires — a stale `prev` would
        // navigate to the ENTIRE pre-flush query string plus this delta,
        // reviving params (e.g. filters) the user cleared in the meantime.
        // See _shared.ts's `liveUrlParamsRef` doc for the full rationale.
        const next = new URLSearchParams(liveUrlParamsRef.current);
        next.set('lat', round(vp.lat, LAT_LON_PRECISION).toFixed(LAT_LON_PRECISION));
        next.set('lon', round(vp.lon, LAT_LON_PRECISION).toFixed(LAT_LON_PRECISION));
        next.set('zoom', String(Math.round(vp.zoom)));
        setUrlParams(
          next,
          { replace: true }, // REPLACE — viewport is bookmarkable but not a history destination
        );
      }, DEBOUNCE_MS);
    },
    [setUrlParams, timers, liveUrlParamsRef],
  );

  return { state: { viewport }, actions: { reportViewport } };
}
