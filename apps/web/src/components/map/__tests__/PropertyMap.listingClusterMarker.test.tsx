/**
 * Listing-cluster marker redesign — dark-navy "{count} / HOMES" badge.
 *
 * Confirms:
 *   1. Cluster icon HTML contains the real count number and the "HOMES" label.
 *   2. .custom-marker-cluster (+ the size-tier modifier class) is preserved on
 *      the outer element — several E2E specs select on this class for
 *      presence/visibility only (see PropertyMap.tsx MarkerClusterLayer comment).
 *   3. Correct size tier for count <=10 (small), 11-50 (medium), >50 (large).
 *   4. role="button", tabindex="0", and an aria-label with correct singular/
 *      plural "home"/"homes" grammar.
 *   5. Enter/Space keydown on a cluster element triggers the same click path
 *      as a pointer click (via the container-level keyboard delegation bridge).
 *   6. The "Tap to zoom in ›" hover/focus caption is present in the rendered
 *      HTML with the CSS-reveal class, not inline-visible by default.
 *   7. AgriMarkerClusterLayer / .agri-cluster markup is unaffected (regression
 *      guard — re-verified in full by PropertyMap.agri.test.tsx).
 */

// ─── Mocks (must precede imports) ────────────────────────────────────────────

const capturedDivIconCalls: Array<{ html: string; iconSize?: { x: number; y: number } }> = [];

const mockAddLayer = vi.fn();
const mockRemoveLayer = vi.fn();
const mockClusterGroupAddLayer = vi.fn();

// A stable, real DOM node so the keyboard-delegation listener registered on
// `map.getContainer()` in MarkerClusterLayer can be exercised with real
// dispatchEvent/bubbling in these tests.
const mockContainer = document.createElement('div');

vi.mock('leaflet', () => {
  return {
    default: {
      Icon: {
        Default: {
          prototype: {},
          mergeOptions: vi.fn(),
        },
      },
      divIcon: vi.fn((opts: { html: string; className?: string; iconSize?: { x: number; y: number } }) => {
        capturedDivIconCalls.push({ html: opts.html ?? '', iconSize: opts.iconSize });
        return { options: opts };
      }),
      marker: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
      })),
      markerClusterGroup: vi.fn(() => ({
        addLayer: mockClusterGroupAddLayer,
        // Issue #1762 — MarkerClusterLayer now registers/unregisters a
        // clusterclick/clusterkeypress listener on the group itself.
        on: vi.fn().mockReturnThis(),
        off: vi.fn().mockReturnThis(),
      })),
      point: vi.fn((x: number, y: number) => ({ x, y })),
    },
  };
});

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TileLayer: () => null,
  ZoomControl: () => null,
  useMap: vi.fn(() => ({
    addLayer: mockAddLayer,
    removeLayer: mockRemoveLayer,
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    getBounds: vi.fn(() => ({
      getNorth: vi.fn(() => 14),
      getSouth: vi.fn(() => 13),
      getEast: vi.fn(() => 75),
      getWest: vi.fn(() => 74),
    })),
    getCenter: vi.fn(() => ({ lat: 13.5, lng: 74.7 })),
    getZoom: vi.fn(() => 12),
    setView: vi.fn().mockReturnThis(),
    getContainer: vi.fn(() => mockContainer),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
    // Issue #1762 fix — MarkerClusterLayer registers a general 'moveend'
    // listener directly on the map on mount now, not just inside a
    // cluster-click handler.
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
  })),
  useMapEvents: vi.fn(() => ({
    getBounds: vi.fn(() => ({
      getNorth: vi.fn(() => 14),
      getSouth: vi.fn(() => 13),
      getEast: vi.fn(() => 75),
      getWest: vi.fn(() => 74),
    })),
    getZoom: vi.fn(() => 12),
    getContainer: vi.fn(() => mockContainer),
  })),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.Default.css', () => ({}));
vi.mock('leaflet.markercluster', () => ({}));
vi.mock('leaflet-draw', () => ({}));
vi.mock('leaflet-draw/dist/leaflet.draw.css', () => ({}));

vi.mock('@/components/map/DrawControl', () => ({
  DrawControl: () => null,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import L from 'leaflet';
import type { PropertyListingWithImages } from '../PropertyMap';

const houseListing = {
  id: 'house-1',
  title: 'Modern House',
  property_type: 'house' as const,
  latitude: 13.35,
  longitude: 74.75,
  price: 1_000_000,
  status: 'LIVE' as const,
  locality: 'Udupi',
  created_at: '',
  updated_at: '',
};

/** Renders PropertyMap and returns the captured iconCreateFunction passed to L.markerClusterGroup. */
async function renderAndCaptureIconCreateFn() {
  const { PropertyMap } = await import('../PropertyMap');

  let capturedIconCreateFn:
    | ((cluster: { getChildCount: () => number }) => unknown)
    | undefined;
  vi.mocked(L.markerClusterGroup).mockImplementationOnce((opts) => {
    if (opts?.iconCreateFunction) {
      capturedIconCreateFn = opts.iconCreateFunction as typeof capturedIconCreateFn;
    }
    return {
      addLayer: mockClusterGroupAddLayer,
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
    } as unknown as ReturnType<typeof L.markerClusterGroup>;
  });

  render(<PropertyMap listings={[houseListing] as unknown as PropertyListingWithImages[]} />);

  expect(capturedIconCreateFn).toBeDefined();
  return capturedIconCreateFn!;
}

describe('PropertyMap — listing-cluster marker redesign (count + HOMES badge)', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    mockAddLayer.mockClear();
    mockRemoveLayer.mockClear();
    mockClusterGroupAddLayer.mockClear();
    vi.mocked(L.markerClusterGroup).mockClear();
    vi.mocked(L.divIcon).mockClear();
    mockContainer.innerHTML = '';
  });

  it('renders the real count and the "HOMES" label in the cluster icon HTML', async () => {
    const iconCreateFn = await renderAndCaptureIconCreateFn();

    iconCreateFn({ getChildCount: () => 3 });

    const lastCall = capturedDivIconCalls[capturedDivIconCalls.length - 1];
    expect(lastCall).toBeDefined();
    expect(lastCall.html).toContain('>3<');
    expect(lastCall.html).toContain('HOMES');
  });

  it('keeps .custom-marker-cluster on the outer element (E2E-compatibility guard)', async () => {
    const iconCreateFn = await renderAndCaptureIconCreateFn();

    iconCreateFn({ getChildCount: () => 3 });

    const lastCall = capturedDivIconCalls[capturedDivIconCalls.length - 1];
    expect(lastCall.html).toMatch(/class="custom-marker-cluster custom-marker-cluster-small"/);
  });

  it('uses the small size tier for count <= 10', async () => {
    const iconCreateFn = await renderAndCaptureIconCreateFn();

    iconCreateFn({ getChildCount: () => 10 });

    const lastCall = capturedDivIconCalls[capturedDivIconCalls.length - 1];
    expect(lastCall.html).toContain('custom-marker-cluster-small');
    expect(lastCall.html).not.toContain('custom-marker-cluster-medium');
    expect(lastCall.html).not.toContain('custom-marker-cluster-large');
  });

  it('uses the medium size tier for count between 11 and 50', async () => {
    const iconCreateFn = await renderAndCaptureIconCreateFn();

    iconCreateFn({ getChildCount: () => 25 });

    const lastCall = capturedDivIconCalls[capturedDivIconCalls.length - 1];
    expect(lastCall.html).toContain('custom-marker-cluster-medium');
    expect(lastCall.html).not.toContain('custom-marker-cluster-small');
    expect(lastCall.html).not.toContain('custom-marker-cluster-large');
  });

  it('uses the large size tier for count > 50', async () => {
    const iconCreateFn = await renderAndCaptureIconCreateFn();

    iconCreateFn({ getChildCount: () => 51 });

    const lastCall = capturedDivIconCalls[capturedDivIconCalls.length - 1];
    expect(lastCall.html).toContain('custom-marker-cluster-large');
    expect(lastCall.html).not.toContain('custom-marker-cluster-small');
    expect(lastCall.html).not.toContain('custom-marker-cluster-medium');
  });

  it('sets role="button", tabindex="0", and a plural aria-label for count > 1', async () => {
    const iconCreateFn = await renderAndCaptureIconCreateFn();

    iconCreateFn({ getChildCount: () => 3 });

    const lastCall = capturedDivIconCalls[capturedDivIconCalls.length - 1];
    expect(lastCall.html).toContain('role="button"');
    expect(lastCall.html).toContain('tabindex="0"');
    expect(lastCall.html).toContain('aria-label="3 homes in this cluster. Activate to zoom in."');
  });

  it('Issue #2409: never renders a cluster badge for a 1-member cluster — returns the sole child\'s own icon instead', async () => {
    // leaflet.markercluster's own grid-based hierarchical clustering CAN wrap
    // a single, spatially-isolated marker in a childCount===1 MarkerCluster
    // node at intermediate zoom levels — the "1 HOME" badge this test used to
    // assert on is exactly the invariant-violating cluster #2409 forbids.
    // iconCreateFunction must instead return the sole child marker's own icon
    // so a singleton cluster is visually indistinguishable from an individual
    // pin, and must NOT emit any cluster-badge divIcon/aria-label for it.
    const iconCreateFn = await renderAndCaptureIconCreateFn();

    const soleIcon = { options: { html: '<div>individual-pin</div>' } };
    const divIconCallCountBefore = capturedDivIconCalls.length;

    const result = iconCreateFn({
      getChildCount: () => 1,
      getAllChildMarkers: () => [{ options: { icon: soleIcon } }],
    });

    expect(result).toBe(soleIcon);
    expect(capturedDivIconCalls.length).toBe(divIconCallCountBefore);
  });

  it('includes the "Tap to zoom in ›" caption in the HTML with the CSS-reveal class (not inline-visible)', async () => {
    const iconCreateFn = await renderAndCaptureIconCreateFn();

    iconCreateFn({ getChildCount: () => 3 });

    const lastCall = capturedDivIconCalls[capturedDivIconCalls.length - 1];
    expect(lastCall.html).toContain('class="custom-marker-cluster-cap"');
    expect(lastCall.html).toContain('Tap to zoom in');
    // Revealed only via CSS :hover/:focus-visible in index.css — no inline
    // "display:none"/style-based visibility toggle and no native title/tooltip.
    expect(lastCall.html).not.toContain('display:none');
    expect(lastCall.html).not.toMatch(/\btitle="/);
  });

  it('Enter keydown on a cluster element triggers a click via the keyboard-delegation bridge', async () => {
    const { PropertyMap } = await import('../PropertyMap');
    render(<PropertyMap listings={[houseListing] as unknown as PropertyListingWithImages[]} />);

    const clusterEl = document.createElement('div');
    clusterEl.className = 'custom-marker-cluster custom-marker-cluster-small';
    const clickSpy = vi.fn();
    clusterEl.addEventListener('click', clickSpy);
    mockContainer.appendChild(clusterEl);

    clusterEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('Space keydown on a cluster element also triggers a click via the keyboard-delegation bridge', async () => {
    const { PropertyMap } = await import('../PropertyMap');
    render(<PropertyMap listings={[houseListing] as unknown as PropertyListingWithImages[]} />);

    const clusterEl = document.createElement('div');
    clusterEl.className = 'custom-marker-cluster custom-marker-cluster-small';
    const clickSpy = vi.fn();
    clusterEl.addEventListener('click', clickSpy);
    mockContainer.appendChild(clusterEl);

    clusterEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('does not trigger a click for unrelated keys (e.g. Tab)', async () => {
    const { PropertyMap } = await import('../PropertyMap');
    render(<PropertyMap listings={[houseListing] as unknown as PropertyListingWithImages[]} />);

    const clusterEl = document.createElement('div');
    clusterEl.className = 'custom-marker-cluster custom-marker-cluster-small';
    const clickSpy = vi.fn();
    clusterEl.addEventListener('click', clickSpy);
    mockContainer.appendChild(clusterEl);

    clusterEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );

    expect(clickSpy).not.toHaveBeenCalled();
  });

  // Issue #2409 AC (zero members) — from the issue's own "Tests" checklist.
  // (The N→1 active-filter reconciliation scenario from the same checklist is
  // covered in PropertyMap.clusterTapFit.test.tsx, whose stable `mapStub`
  // singleton supports asserting rebuild deltas across a `rerender()`; this
  // file's `useMap` mock returns a fresh object per call, which isn't safe to
  // rerender against.)
  it('Issue #2409 AC (zero members): an empty listings array constructs no NEW marker and adds nothing to the cluster group', async () => {
    const { PropertyMap } = await import('../PropertyMap');
    // `L.marker`/`mockClusterGroupAddLayer` are module-level mocks whose call
    // history is NOT reset in this file's beforeEach (only their icon/group
    // counterparts are) — assert the delta from this render, not an absolute
    // "never called" across the whole suite.
    const markerCallsBefore = vi.mocked(L.marker).mock.calls.length;
    const addLayerCallsBefore = mockClusterGroupAddLayer.mock.calls.length;

    render(<PropertyMap listings={[] as unknown as PropertyListingWithImages[]} />);

    expect(vi.mocked(L.marker).mock.calls.length).toBe(markerCallsBefore);
    expect(mockClusterGroupAddLayer.mock.calls.length).toBe(addLayerCallsBefore);
  });
});
