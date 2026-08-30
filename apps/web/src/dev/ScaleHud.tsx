import { useState } from 'react';
import { useMapEvents } from 'react-leaflet';
import { createPortal } from 'react-dom';
import type { Map as LeafletMap } from 'leaflet';

interface HudState {
  zoom: number;
  n: number;
  s: number;
  e: number;
  w: number;
}

function takeSnapshot(m: LeafletMap): HudState {
  const b = m.getBounds();
  return { zoom: m.getZoom(), n: b.getNorth(), s: b.getSouth(), e: b.getEast(), w: b.getWest() };
}

function ScaleHudDev() {
  const map = useMapEvents({
    moveend(e) { setState(takeSnapshot(e.target as LeafletMap)); },
    zoomend(e) { setState(takeSnapshot(e.target as LeafletMap)); },
  });
  const [state, setState] = useState<HudState>(() => takeSnapshot(map));

  return createPortal(
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 2000,
        background: 'rgba(0,0,0,0.65)',
        color: '#fff',
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: 1.5,
        padding: '4px 8px',
        borderRadius: 4,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div>z {state.zoom}</div>
      <div>N {state.n.toFixed(4)}  S {state.s.toFixed(4)}</div>
      <div>E {state.e.toFixed(4)}  W {state.w.toFixed(4)}</div>
    </div>,
    map.getContainer(),
  );
}

export function ScaleHud() {
  if (!import.meta.env.DEV) return null;
  return <ScaleHudDev />;
}
