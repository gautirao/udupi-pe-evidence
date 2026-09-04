import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

/**
 * Issue #2419 (PR-2) — draft vs committed polygon styling.
 *
 * PR review of head `a409692b` found that a just-closed shape was restyled to
 * COMMITTED immediately, before #2420 validation and before #2016's
 * replacement dialog. That made a draft look settled during exactly the
 * window where the shopper is being asked whether to accept it, and left a
 * REJECTED polygon wearing committed styling.
 *
 * The values asserted are the design kit's own (`ExpMap.jsx:461-462`), so
 * these also pin the mock-authority styling ruled for this PR.
 */

const { mapOn, capturedHandlers, polygonFactory, createdLayer } = vi.hoisted(() => {
  const capturedHandlers: Record<string, (e: unknown) => void> = {};
  const createdLayer = {
    setStyle: vi.fn(),
    getLatLngs: () => [[{ lat: 12.9, lng: 77.6 }, { lat: 13.0, lng: 77.6 }, { lat: 13.0, lng: 77.7 }]],
  };
  return {
    capturedHandlers,
    createdLayer,
    polygonFactory: vi.fn(),
    mapOn: vi.fn((event: string, handler: (e: unknown) => void) => {
      capturedHandlers[event] = handler;
    }),
  };
});

const featureGroupLayers: unknown[] = [];

vi.mock('react-leaflet', () => ({
  useMap: () => ({
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    addControl: vi.fn(),
    removeControl: vi.fn(),
    getContainer: () => document.createElement('div'),
    on: mapOn,
    off: vi.fn(),
  }),
}));

vi.mock('leaflet-draw', () => ({}));
vi.mock('leaflet-draw/dist/leaflet.draw.css', () => ({}));

vi.mock('leaflet', () => {
  const FeatureGroup = class {
    addLayer(l: unknown) { featureGroupLayers.push(l); }
    clearLayers() { featureGroupLayers.length = 0; }
    getLayers() { return featureGroupLayers; }
  };
  const L = {
    FeatureGroup,
    latLng: (lat: number, lng: number) => ({ lat, lng }),
    polygon: polygonFactory,
    Control: { Draw: class { } },
    Draw: {
      Polygon: class { enable() {} disable() {} deleteLastVertex() {} },
      Event: { CREATED: 'draw:created', DRAWVERTEX: 'draw:drawvertex', DRAWSTOP: 'draw:drawstop' },
    },
  };
  return { default: L, ...L };
});

import { DrawControl } from '../DrawControl';

const DRAFT_NAVY = '#1B2A45';
const COMMITTED_COPPER = '#B05C3A';

beforeEach(() => {
  vi.clearAllMocks();
  featureGroupLayers.length = 0;
  for (const key of Object.keys(capturedHandlers)) delete capturedHandlers[key];
});

describe('DrawControl — draft vs committed polygon styling', () => {
  it('keeps a just-closed shape in DRAFT styling, not committed', () => {
    render(<DrawControl onPolygonDrawn={vi.fn()} onPolygonCleared={vi.fn()} />);

    capturedHandlers['draw:created']?.({ layer: createdLayer });

    expect(createdLayer.setStyle).toHaveBeenCalledTimes(1);
    const style = createdLayer.setStyle.mock.calls[0][0] as Record<string, unknown>;
    // Navy and dashed — the mock's draft treatment. A committed-looking shape
    // here would be claiming the scope is settled before it has been accepted.
    expect(style.color).toBe(DRAFT_NAVY);
    expect(style.dashArray).toBeDefined();
    expect(style.color).not.toBe(COMMITTED_COPPER);
  });

  it('still reports the finished polygon to the caller', () => {
    const onPolygonDrawn = vi.fn();
    render(<DrawControl onPolygonDrawn={onPolygonDrawn} onPolygonCleared={vi.fn()} />);

    capturedHandlers['draw:created']?.({ layer: createdLayer });

    expect(onPolygonDrawn).toHaveBeenCalledTimes(1);
    expect(onPolygonDrawn.mock.calls[0][0]).toHaveLength(3);
  });

  // The authoritative committed scope is the ONLY source of committed styling.
  it('renders a committed polygon prop in COMMITTED styling', () => {
    render(
      <DrawControl
        onPolygonDrawn={vi.fn()}
        onPolygonCleared={vi.fn()}
        polygon={[[12.9, 77.6], [13.0, 77.6], [13.0, 77.7]]}
      />,
    );

    expect(polygonFactory).toHaveBeenCalledTimes(1);
    const style = polygonFactory.mock.calls[0][1] as Record<string, unknown>;
    expect(style.color).toBe(COMMITTED_COPPER);
    expect(style.dashArray).toBeUndefined();
  });

  // The draft layer drawn above is still on the map when the commit lands, so
  // it must be RESTYLED in place. An earlier revision early-returned here,
  // which — once the draft correctly stayed navy — would have left a
  // committed polygon wearing draft styling for the rest of its life.
  it('restyles the existing draft layer to committed once the scope commits', () => {
    const { rerender } = render(<DrawControl onPolygonDrawn={vi.fn()} onPolygonCleared={vi.fn()} />);
    capturedHandlers['draw:created']?.({ layer: createdLayer });
    createdLayer.setStyle.mockClear();

    rerender(
      <DrawControl
        onPolygonDrawn={vi.fn()}
        onPolygonCleared={vi.fn()}
        polygon={[[12.9, 77.6], [13.0, 77.6], [13.0, 77.7]]}
      />,
    );

    expect(createdLayer.setStyle).toHaveBeenCalled();
    const style = createdLayer.setStyle.mock.lastCall?.[0] as Record<string, unknown>;
    expect(style.color).toBe(COMMITTED_COPPER);
    // Restyled in place rather than replaced, so the shape stays the one the
    // shopper actually drew.
    expect(polygonFactory).not.toHaveBeenCalled();
  });
});
