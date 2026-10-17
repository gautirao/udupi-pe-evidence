/**
 * Issue #2824 — `MapContainerResizeSync` must not call `invalidateSize` on a
 * map that Leaflet has already removed.
 *
 * Mechanism (see PropertyMap.tsx MapLifecycleGuard): the guard calls
 * `map.remove()` from a LAYOUT-effect cleanup, i.e. during the commit that
 * deletes the tree, while MapContainerResizeSync's `ro.disconnect()` is a
 * PASSIVE-effect cleanup that React defers until after paint. A
 * ResizeObserver notification delivered in that gap runs `invalidateSize` on
 * a removed map: Leaflet's `remove()` never clears `_loaded` but does
 * `delete this._mapPane`, so `_rawPanBy` -> `getPosition(undefined)` throws
 * `Cannot read properties of undefined (reading '_leaflet_pos')`.
 *
 * Real react-leaflet + real Leaflet; only ResizeObserver and the container's
 * pixel size (jsdom has no layout) are stubbed.
 */
import { act, render } from '@testing-library/react';
import type { Map as LeafletMap } from 'leaflet';
import { MapContainer, useMap } from 'react-leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MapContainerResizeSync } from '../PropertyMap';

// PropertyMap.tsx transitively imports lib/api -> the Supabase client, which
// throws at import time without env. Nothing in this test touches it.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

type ROCallback = () => void;
interface ROInstance {
  cb: ROCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

const roInstances: ROInstance[] = [];
let containerWidth = 800;
const OriginalResizeObserver = globalThis.ResizeObserver;
const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

class ResizeObserverStub {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  constructor(cb: ROCallback) {
    roInstances.push({ cb, observe: this.observe, disconnect: this.disconnect });
  }
}

let capturedMap: LeafletMap | null = null;
function MapProbe() {
  capturedMap = useMap();
  return null;
}

function renderMap() {
  return render(
    <MapContainer center={[13.34, 74.74]} zoom={12} style={{ height: 400, width: 800 }}>
      <MapProbe />
      <MapContainerResizeSync />
    </MapContainer>,
  );
}

describe('MapContainerResizeSync after map.remove() (#2824)', () => {
  beforeEach(() => {
    roInstances.length = 0;
    capturedMap = null;
    containerWidth = 800;
    // jsdom has no layout: without a nonzero, CHANGING size Leaflet's
    // invalidateSize returns early on a zero offset and these arms are vacuous.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => containerWidth,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 400,
    });
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = OriginalResizeObserver;
    if (widthDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDescriptor);
    if (heightDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientHeight', heightDescriptor);
    vi.restoreAllMocks();
  });

  it('control A: on a live map a resize notification calls invalidateSize and changes Leaflet size', () => {
    renderMap();
    const map = capturedMap as LeafletMap | null;
    expect(map).not.toBeNull();
    if (!map) return;
    const spy = vi.spyOn(map, 'invalidateSize');
    expect(roInstances).toHaveLength(1);
    expect(roInstances[0].observe).toHaveBeenCalledWith(map.getContainer());
    expect(map.getSize().x).toBe(800);

    containerWidth = 400;
    act(() => roInstances[0].cb());

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ animate: false, pan: true, debounceMoveend: true });
    // Non-vacuous: the size really changed, so the early-return path was not taken.
    expect(map.getSize().x).toBe(400);
  });

  it('RED arm: a resize notification delivered after map.remove() (before passive cleanup) does not throw', () => {
    renderMap();
    const map = capturedMap as LeafletMap | null;
    expect(map).not.toBeNull();
    if (!map) return;
    expect(map.getSize().x).toBe(800);

    const invalidateSpy = vi.spyOn(map, 'invalidateSize');

    // Layout-phase removal (MapLifecycleGuard) while the observer is still
    // connected; the passive cleanup has not run yet.
    map.remove();
    // react-leaflet's own passive cleanup calls remove() a second time, which
    // throws in Leaflet; production neutralises that in MapLifecycleGuard.
    // Mirror it so RTL's auto-unmount stays quiet and cannot mask this arm.
    (map as unknown as { remove: () => LeafletMap }).remove = () => map;

    // Invoke the captured callback directly: it models a notification already
    // queued/delivered for this frame regardless of any disconnect().
    containerWidth = 400;
    expect(() => roInstances[0].cb()).not.toThrow();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('control B: unmount disconnects the observer', () => {
    const { unmount } = renderMap();
    expect(roInstances[0].disconnect).not.toHaveBeenCalled();
    unmount();
    expect(roInstances[0].disconnect).toHaveBeenCalled();
  });
});
