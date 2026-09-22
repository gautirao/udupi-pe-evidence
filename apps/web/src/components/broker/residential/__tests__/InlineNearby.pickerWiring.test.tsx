/**
 * Issue #2647 — Residential wiring proof for InlineNearby's new
 * `publicLoc` / `onOpenPicker` props.
 *
 * The load-bearing claim this file exists to prove is NOT "a button calls a
 * callback" (InlineNearby.test.tsx already covers that in isolation) — it is
 * that InlineNearby's "Pin location on map" CTA opens the EXISTING Section 6
 * picker rather than a second implementation. That can only be shown by
 * mounting MapPin and InlineNearby against ONE shared useResidentialLocation
 * instance, exactly as ResidentialListingForm does (MapPin lives inside
 * ResidentialPhotosLocationSection, InlineNearby inside Section 7, both fed
 * from the single hook value lifted by useResidentialListingLocation), and
 * then asserting that a click on InlineNearby's CTA makes MAPPIN's dialog
 * appear. InlineNearby renders no Dialog of its own, so the dialog that shows
 * up can only be MapPin's.
 *
 * Mocks mirror useResidentialLocation.test.tsx (same AddressPicker/geocode/
 * useUpdateListing stubs) so this file exercises the real hook, not a fake.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockSearchNominatim = vi.hoisted(() => vi.fn());
const mockReverseGeocode = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useBrokerListings', () => ({
  useUpdateListing: () => ({ mutate: mockUpdateMutate, isPending: false }),
}));

vi.mock('@/lib/geocode', () => ({
  searchNominatim: mockSearchNominatim,
  reverseGeocode: mockReverseGeocode,
}));

vi.mock('@/components/broker/AddressPicker', () => ({
  AddressPicker: (props: { onConfirm: (v: { lat: number; lng: number; address_confirmed: boolean }) => void }) => (
    <button
      type="button"
      data-testid="mock-address-picker-confirm"
      onClick={() => props.onConfirm({ lat: 13.34, lng: 74.74, address_confirmed: true })}
    >
      Mock confirm pin
    </button>
  ),
}));

vi.mock('@/components/poi/PoiManager', () => ({
  PoiManager: () => <div data-testid="mock-poi-manager" />,
}));

import { AddressSearch } from '../AddressSearch';
import { MapPin } from '../MapPin';
import { InlineNearby } from '../InlineNearby';
import { useResidentialLocation } from '../useResidentialLocation';

const MANIPAL_RESULT = {
  lat: 13.34,
  lon: 74.74,
  display_name: 'Manipal, Udupi District, Karnataka, India',
  address: { suburb: 'Manipal', city: 'Udupi' },
};

/** The coarse locality deriveResolvedLocation produces for MANIPAL_RESULT. */
const PUBLIC_LOC = 'Manipal, Udupi';

/**
 * Mirrors ResidentialListingForm's composition: ONE hook instance, MapPin in
 * Section 6, InlineNearby in Section 7, with InlineNearby's four optional
 * props wired exactly as the call site wires them (ResidentialListingForm.tsx
 * Section 6b) — including the `resolved != null` gate on onOpenPicker.
 */
function Harness({ addressConfirmed }: { addressConfirmed: boolean }) {
  const location = useResidentialLocation({
    listingId: 'listing-1',
    addressConfirmed,
    initialLatitude: null,
    initialLongitude: null,
    initialLocality: '',
    onPublicLoc: () => {},
  });

  return (
    <>
      <AddressSearch location={location} />
      <MapPin location={location} />
      <InlineNearby
        listingId="listing-1"
        propertyType="apartment"
        addressConfirmed={addressConfirmed}
        locationResolved={location.state.resolved != null || location.state.localityResolved}
        publicLoc={location.state.resolved?.publicLoc}
        onOpenPicker={location.state.resolved != null ? location.openPicker : undefined}
        onChangeLocation={location.clear}
      />
    </>
  );
}

/**
 * InlineNearby's own CTA and status line, addressed by testid.
 *
 * This scoping is load-bearing, not cosmetic: MapPin renders an
 * IDENTICALLY-NAMED "Pin location on map" button (MapPin.tsx:73) and an
 * identically-worded "Pin confirmed — {locality}" line (MapPin.tsx:39) in
 * Section 6. An unscoped getByRole/getByText here would either throw on
 * multiple matches or — worse — silently assert against MapPin's element and
 * pass without InlineNearby having changed at all.
 */
function inlineNearbyCta() {
  return screen.getByTestId('inline-nearby-open-picker');
}

function inlineNearbyStatus() {
  return screen.getByTestId('inline-nearby-status');
}

async function resolveManipal(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
  await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: /^use$/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);
});

describe('InlineNearby — Residential wiring (issue #2647)', () => {
  it('state (a) -> (b): before resolving there is no CTA and no locality; after resolving, the locality-suffixed header and the CTA appear', async () => {
    const user = userEvent.setup();
    render(<Harness addressConfirmed={false} />);

    // State (a) — control arm. Neither the locality nor the CTA exists yet.
    expect(inlineNearbyStatus()).toHaveTextContent('Location not yet confirmed');
    expect(screen.queryByTestId('inline-nearby-open-picker')).not.toBeInTheDocument();

    await resolveManipal(user);

    // State (b) — full mock parity.
    expect(inlineNearbyStatus()).toHaveTextContent(`Location resolved — ${PUBLIC_LOC}`);
    expect(inlineNearbyCta()).toBeInTheDocument();
    expect(inlineNearbyStatus()).not.toHaveTextContent('pin not confirmed');
  });

  it('state (b): the CTA opens the EXISTING MapPin picker dialog (InlineNearby renders no dialog of its own)', async () => {
    const user = userEvent.setup();
    render(<Harness addressConfirmed={false} />);
    await resolveManipal(user);

    // The dialog is closed before the click — so its later presence is caused
    // by this click, not by the mount.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-address-picker-confirm')).not.toBeInTheDocument();

    await user.click(inlineNearbyCta());

    const dialog = await screen.findByRole('dialog');
    // Identity of the dialog: it is MapPin's <PinDialog> — same title, same
    // privacy caption, same AddressPicker instance. A second picker built
    // inside InlineNearby could not produce these.
    expect(within(dialog).getByText('Pin the exact location')).toBeInTheDocument();
    expect(within(dialog).getByTestId('map-pin-privacy-caption')).toHaveTextContent(
      `Buyers see only "${PUBLIC_LOC}"`,
    );
    expect(within(dialog).getByTestId('mock-address-picker-confirm')).toBeInTheDocument();

    // Exactly one picker exists in the tree.
    expect(screen.getAllByTestId('mock-address-picker-confirm')).toHaveLength(1);
  });

  it('state (b) -> (c): confirming from the dialog the CTA opened persists the pin and renders "Pin confirmed — {locality}"', async () => {
    // The PUT's success is what flips local pinConfirmed; the server flag then
    // catches up on refetch, which the rerender below models.
    mockUpdateMutate.mockImplementation((_payload, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    const user = userEvent.setup();
    const { rerender } = render(<Harness addressConfirmed={false} />);
    await resolveManipal(user);

    await user.click(inlineNearbyCta());
    await user.click(await screen.findByTestId('mock-address-picker-confirm'));

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      { latitude: 13.34, longitude: 74.74, addressConfirmed: true },
      expect.any(Object),
    );

    // Server addressConfirmed catches up (useGetListing refetch).
    rerender(<Harness addressConfirmed />);

    expect(inlineNearbyStatus()).toHaveTextContent(`Pin confirmed — ${PUBLIC_LOC}`);
    expect(screen.getByTestId('mock-poi-manager')).toBeInTheDocument();
    // The state-(b) CTA is gone once pinned.
    expect(screen.queryByTestId('inline-nearby-open-picker')).not.toBeInTheDocument();
  });

  it('never surfaces the private formatted address, even though the hook holds it', async () => {
    const user = userEvent.setup();
    render(<Harness addressConfirmed={false} />);
    await resolveManipal(user);

    const header = inlineNearbyStatus();
    expect(header).toHaveTextContent(`Location resolved — ${PUBLIC_LOC}`);
    // AddressSearch legitimately echoes the full display_name in its own
    // confirmed-chip; the assertion here is scoped to InlineNearby's header,
    // which must carry the coarse publicLoc ONLY.
    expect(header).not.toHaveTextContent('Karnataka');
    expect(header).not.toHaveTextContent('India');
    expect(header).not.toHaveTextContent('13.34');
  });
});
