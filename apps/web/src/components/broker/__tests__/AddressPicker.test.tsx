/**
 * AddressPicker unit tests
 *
 * AC14 — Forward-geocode fires on first render when locality is set but
 *         lat/lng are null; does NOT fire again for the same locality (cache hit).
 * AC15 — Changing initialLocality prop after mount updates the query state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// vi.hoisted ensures mock handles are defined before vi.mock() hoisting
const mockSearchNominatim = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());

vi.mock('@/lib/geocode', () => ({
  searchNominatim: mockSearchNominatim,
  reverseGeocode: vi.fn().mockResolvedValue(null),
  parseAddress: vi.fn().mockReturnValue({ address_line1: '' }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Leaflet MapContainer requires a DOM with a measured container. In jsdom
// the canvas is 0×0, so MapContainer throws. We mock the entire react-leaflet
// module to render a plain div sentinel instead.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  Marker: () => null,
  useMap: () => ({ invalidateSize: vi.fn(), getSize: () => ({ x: 0, y: 0 }), flyTo: vi.fn() }),
  useMapEvents: () => null,
}));

// Leaflet itself imports browser globals — stub the Icon default setup.
vi.mock('leaflet', () => {
  const Icon = { Default: { prototype: {}, mergeOptions: vi.fn() } };
  return { default: { Icon }, Icon };
});

// leaflet/dist/leaflet.css causes a parse error in jsdom — ignore it.
vi.mock('leaflet/dist/leaflet.css', () => ({}));

// Import component AFTER mocks are set up
import { AddressPicker } from '../AddressPicker';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MANIPAL_RESULT = {
  lat: 13.34,
  lon: 74.74,
  display_name: 'Manipal, Udupi District, Karnataka, India',
  address: {},
};

const BANGALORE_RESULT = {
  lat: 12.97,
  lon: 77.59,
  display_name: 'Bangalore, Bengaluru Urban, Karnataka, India',
  address: {},
};

const noop = () => {};

// ─── Tests ───────────────────────────────────────────────────────────────────

// Use real timers + waitFor so React 18's MessageChannel scheduler and the
// component's setTimeout both work without fake-timer conflicts.
beforeEach(() => {
  vi.clearAllMocks();
});

describe('AddressPicker — AC14: forward-geocode on first render', () => {
  it('calls searchNominatim once with the initial locality when lat/lng are null', async () => {
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);

    render(
      <AddressPicker
        initialLatitude={null}
        initialLongitude={null}
        initialLocality="Manipal"
        onConfirm={noop}
      />,
    );

    // waitFor polls until the async IIFE inside the useEffect resolves and
    // React has flushed the resulting state updates into the DOM.
    await waitFor(() => {
      expect(mockSearchNominatim).toHaveBeenCalledTimes(1);
    });
    expect(mockSearchNominatim).toHaveBeenCalledWith('Manipal');
  });

  it('does NOT call searchNominatim again on re-render with the same locality (cache hit)', async () => {
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);

    const { rerender } = render(
      <AddressPicker
        initialLatitude={null}
        initialLongitude={null}
        initialLocality="Manipal"
        onConfirm={noop}
      />,
    );

    // Wait until the first geocode call has happened
    await waitFor(() => {
      expect(mockSearchNominatim).toHaveBeenCalledTimes(1);
    });

    // Re-render with identical props — geocodedRef already has 'Manipal'
    await act(async () => {
      rerender(
        <AddressPicker
          initialLatitude={null}
          initialLongitude={null}
          initialLocality="Manipal"
          onConfirm={noop}
        />,
      );
    });

    // Give enough time for a second call to appear if it were going to
    await new Promise((r) => setTimeout(r, 400));

    // Still only one call
    expect(mockSearchNominatim).toHaveBeenCalledTimes(1);
  });

  it('does NOT call searchNominatim when lat/lng are already set', async () => {
    render(
      <AddressPicker
        initialLatitude={13.34}
        initialLongitude={74.74}
        initialLocality="Manipal"
        onConfirm={noop}
      />,
    );

    // Give enough time for a call to appear if it were going to
    await new Promise((r) => setTimeout(r, 400));

    expect(mockSearchNominatim).not.toHaveBeenCalled();
  });
});

describe('AddressPicker — AC15: prop reconciliation updates query state', () => {
  it('updates the search input value when initialLocality prop changes after mount', async () => {
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);

    const { rerender } = render(
      <AddressPicker
        initialLatitude={null}
        initialLongitude={null}
        initialLocality="Manipal"
        onConfirm={noop}
      />,
    );

    // Verify initial query value is shown in the input
    const input = screen.getByPlaceholderText(/search for a location/i);
    await waitFor(() => expect(input).toHaveValue('Manipal'));

    // Re-render with changed locality prop. waitFor flushes the effect that
    // calls setQuery('Bangalore') so the DOM updates before the assertion.
    mockSearchNominatim.mockResolvedValue([BANGALORE_RESULT]);
    rerender(
      <AddressPicker
        initialLatitude={null}
        initialLongitude={null}
        initialLocality="Bangalore"
        onConfirm={noop}
      />,
    );

    // AC2: query state reflects the new prop
    await waitFor(() => expect(input).toHaveValue('Bangalore'));
  });

  it('updates pinPosition and does NOT forward-geocode when lat/lng props change', async () => {
    // Single render instance — avoids two inputs with the same placeholder in the DOM.
    const { rerender } = render(
      <AddressPicker
        initialLatitude={13.34}
        initialLongitude={74.74}
        initialLocality="Manipal"
        onConfirm={noop}
      />,
    );

    // No geocode call: lat/lng were already set on initial render
    await new Promise((r) => setTimeout(r, 200));
    expect(mockSearchNominatim).not.toHaveBeenCalled();

    // Rerender with new coords + locality. waitFor flushes the effect that
    // calls setQuery('Bangalore') and setPinPosition([...]).
    rerender(
      <AddressPicker
        initialLatitude={12.97}
        initialLongitude={77.59}
        initialLocality="Bangalore"
        onConfirm={noop}
      />,
    );

    // Still no geocode call — coords were provided on both renders
    await new Promise((r) => setTimeout(r, 200));
    expect(mockSearchNominatim).not.toHaveBeenCalled();

    // Query updated to new locality
    const input = screen.getByPlaceholderText(/search for a location/i);
    await waitFor(() => expect(input).toHaveValue('Bangalore'));
  });
});
