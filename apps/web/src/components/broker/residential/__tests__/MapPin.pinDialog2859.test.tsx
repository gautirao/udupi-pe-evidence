/**
 * #2859 B3 — MapPin "Adjust pin" dialog with the REAL AddressPicker
 * (e2e/residential-create-listing-1722.spec.ts AC-4.6, ids R8f-j, csv210).
 *
 * react-leaflet / leaflet are mocked exactly as AddressPicker.test.tsx does (the map
 * itself is RETAIN); @/lib/geocode is mocked, so this proves UI behaviour given the
 * seeded pin only (R_injected). The Radix Dialog is real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockUpdateMutate = vi.hoisted(() => vi.fn());
// Stable identities: AddressPicker's sync effect depends on `toast`, so a fresh fn per
// render would re-fire it forever.
const mockToast = vi.hoisted(() => vi.fn());
const onPublicLoc = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useBrokerListings', () => ({
  useUpdateListing: () => ({ mutate: mockUpdateMutate, isPending: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/lib/geocode', () => ({
  searchNominatim: vi.fn().mockResolvedValue([]),
  reverseGeocode: vi.fn().mockResolvedValue(null),
  parseAddress: vi.fn().mockReturnValue({ address_line1: '' }),
}));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  useMap: () => ({ invalidateSize: vi.fn(), getSize: () => ({ x: 0, y: 0 }), flyTo: vi.fn() }),
  useMapEvents: () => null,
}));
vi.mock('leaflet', () => {
  const Icon = { Default: { prototype: {}, mergeOptions: vi.fn() } };
  return { default: { Icon }, Icon };
});
vi.mock('leaflet/dist/leaflet.css', () => ({}));

import { MapPin } from '../MapPin';
import { AddressPicker } from '@/components/broker/AddressPicker';
import { useResidentialLocation } from '../useResidentialLocation';

function Harness() {
  const location = useResidentialLocation({
    listingId: 'listing-2859',
    addressConfirmed: true,
    initialLatitude: 13.34,
    initialLongitude: 74.74,
    initialLocality: 'Manipal, Udupi',
    onPublicLoc,
  });
  return <MapPin location={location} />;
}

const EMPTY_STATE = /search for a location above, click the map/i;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MapPin — Adjust pin re-opens the real AddressPicker seeded with the confirmed pin (#2859 B3 R8f-j)', () => {
  it('shows "Confirm Location" (not the empty search state); Cancel closes and keeps the confirmed banner', async () => {
    // positive control for the negative below: an unseeded picker DOES render the empty-state copy
    const ctl = render(<AddressPicker initialLatitude={null} initialLongitude={null} initialLocality="" onConfirm={vi.fn()} />);
    expect(screen.getByText(EMPTY_STATE)).toBeInTheDocument();
    ctl.unmount();

    const user = userEvent.setup();
    render(<Harness />);
    expect(await screen.findByTestId('map-pin-status')).toHaveTextContent('Pin confirmed — Manipal, Udupi');

    await user.click(screen.getByRole('button', { name: /adjust pin/i }));
    const dialog = await screen.findByRole('dialog', { name: /pin the exact location/i });
    expect(within(dialog).getByRole('button', { name: /confirm location/i })).toBeInTheDocument();
    expect(within(dialog).queryByText(EMPTY_STATE)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /pin the exact location/i })).not.toBeInTheDocument());
    expect(screen.getByTestId('map-pin-status')).toBeInTheDocument();
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });
});
