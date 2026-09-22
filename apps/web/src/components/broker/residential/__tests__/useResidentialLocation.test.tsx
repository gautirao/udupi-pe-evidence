/**
 * useResidentialLocation unit tests — issue #1722 correction #4.
 *
 * Renders <AddressSearch> + <MapPin> together sharing ONE hook instance (a
 * Harness component), matching how ResidentialListingForm mounts them, so
 * these tests exercise the real cross-section "resolving via either surface
 * enables the other" contract, not two independently-stubbed views.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockIsPending = vi.hoisted(() => ({ value: false }));
const mockSearchNominatim = vi.hoisted(() => vi.fn());
const mockReverseGeocode = vi.hoisted(() => vi.fn());
const mockAddressPickerProps = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useBrokerListings', () => ({
  useUpdateListing: () => ({ mutate: mockUpdateMutate, isPending: mockIsPending.value }),
}));

vi.mock('@/lib/geocode', () => ({
  searchNominatim: mockSearchNominatim,
  reverseGeocode: mockReverseGeocode,
}));

vi.mock('@/components/broker/AddressPicker', () => ({
  AddressPicker: (props: {
    initialLatitude?: number | null;
    initialLongitude?: number | null;
    onConfirm: (v: { lat: number; lng: number; address_confirmed: boolean }) => void;
  }) => {
    mockAddressPickerProps(props);
    return (
      <button
        type="button"
        data-testid="mock-address-picker-confirm"
        onClick={() => props.onConfirm({ lat: 13.34, lng: 74.74, address_confirmed: true })}
      >
        Mock confirm pin
      </button>
    );
  },
}));

import { AddressSearch } from '../AddressSearch';
import { MapPin } from '../MapPin';
import { useResidentialLocation, type UseResidentialLocationParams } from '../useResidentialLocation';

const MANIPAL_RESULT = {
  lat: 13.34,
  lon: 74.74,
  display_name: 'Manipal, Udupi District, Karnataka, India',
  address: { suburb: 'Manipal', city: 'Udupi' },
};

function Harness(overrides: Partial<UseResidentialLocationParams> & { onPublicLoc: (v: string) => void }) {
  const location = useResidentialLocation({
    listingId: 'listing-1',
    addressConfirmed: false,
    initialLatitude: null,
    initialLongitude: null,
    initialLocality: '',
    ...overrides,
  });
  return (
    <>
      <AddressSearch location={location} />
      <MapPin location={location} />
    </>
  );
}

function renderHarness(overrides: Partial<UseResidentialLocationParams> = {}) {
  const onPublicLoc = vi.fn();
  const utils = render(<Harness onPublicLoc={onPublicLoc} {...overrides} />);
  return {
    onPublicLoc,
    rerenderWith: (next: Partial<UseResidentialLocationParams> = {}) =>
      utils.rerender(<Harness onPublicLoc={onPublicLoc} {...next} />),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsPending.value = false;
});

describe('useResidentialLocation — 3-state model preserved', () => {
  it('state 2 (resolved via search "Use"): local only, never persists addressConfirmed', async () => {
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);
    const user = userEvent.setup();
    const { onPublicLoc } = renderHarness();

    await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
    await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^use$/i }));

    expect(screen.getByText(/location confirmed — Manipal, Udupi District/i)).toBeInTheDocument();
    expect(onPublicLoc).toHaveBeenCalledWith('Manipal, Udupi');
    expect(mockUpdateMutate).not.toHaveBeenCalled();
    // Resolving via Section 2 enables the Section 6 pin CTA (shared hook, contract §A).
    expect(screen.getByRole('button', { name: /pin location on map/i })).toBeEnabled();
  });

  it('state 3 (pin confirmed): only the modal Confirm persists addressConfirmed via the existing PUT', async () => {
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);
    const user = userEvent.setup();
    renderHarness();

    await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
    await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^use$/i }));
    await user.click(screen.getByRole('button', { name: /pin location on map/i }));
    await user.click(screen.getByTestId('mock-address-picker-confirm'));

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      { latitude: 13.34, longitude: 74.74, addressConfirmed: true },
      expect.any(Object),
    );
  });
});

describe('useResidentialLocation — privacy: publicLoc vs formatted', () => {
  it('onPublicLoc never receives the full display_name', async () => {
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);
    const user = userEvent.setup();
    const { onPublicLoc } = renderHarness();

    await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
    await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^use$/i }));

    expect(onPublicLoc).not.toHaveBeenCalledWith(MANIPAL_RESULT.display_name);
    expect(onPublicLoc).toHaveBeenCalledWith('Manipal, Udupi');
  });

  it('the pin modal privacy caption shows the publicLoc, never the private formatted string', async () => {
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);
    const user = userEvent.setup();
    renderHarness();

    await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
    await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^use$/i }));
    await user.click(screen.getByRole('button', { name: /pin location on map/i }));

    expect(screen.getByTestId('map-pin-privacy-caption')).toHaveTextContent('Buyers see only "Manipal, Udupi"');
  });
});

describe('useResidentialLocation — query-edit invalidation', () => {
  it('editing the query after a persisted pin confirm resets local state and unconfirms the server pin', async () => {
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);
    const user = userEvent.setup();
    const { onPublicLoc } = renderHarness({
      addressConfirmed: true,
      initialLatitude: 13.34,
      initialLongitude: 74.74,
      initialLocality: 'Manipal, Udupi',
    });

    // Hydrated from a persisted confirmed pin.
    expect(await screen.findByText(/pin confirmed/i)).toBeInTheDocument();
    onPublicLoc.mockClear();

    // A real edit to the search box diverges from the resolved backing value.
    await user.type(screen.getByLabelText(/search for a location/i), 'x');

    expect(onPublicLoc).toHaveBeenCalledWith('');
    expect(mockUpdateMutate).toHaveBeenCalledWith({ addressConfirmed: false });
    expect(screen.queryByText(/pin confirmed/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pin location on map/i })).toBeDisabled();
  });

  it('the "Change" link performs the same reset', async () => {
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);
    const user = userEvent.setup();
    const { onPublicLoc } = renderHarness({
      addressConfirmed: true,
      initialLatitude: 13.34,
      initialLongitude: 74.74,
      initialLocality: 'Manipal, Udupi',
    });

    expect(await screen.findByText(/pin confirmed/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /^change$/i })[0]);

    expect(onPublicLoc).toHaveBeenCalledWith('');
    expect(mockUpdateMutate).toHaveBeenCalledWith({ addressConfirmed: false });
  });

  it('a resolved-but-never-pinned location produces no pointless unconfirm PUT on edit', async () => {
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);
    const user = userEvent.setup();
    renderHarness();

    await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
    await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^use$/i }));
    expect(screen.getByText(/location confirmed — Manipal, Udupi District/i)).toBeInTheDocument();

    // Editing the query is a real edit (resolved != null) and resets local
    // state, but no pin was ever confirmed server-side — nothing to unconfirm.
    await user.type(screen.getByLabelText(/search for a location/i), 'x');

    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // Issue #2645 — race window: confirmPin's PUT succeeds and the local
  // `pinConfirmed` flips true immediately (confirmPin's onSuccess), but the
  // `addressConfirmed` PROP is server state (useGetListing) that only
  // updates once useUpdateListing's onSuccess invalidateQueries triggers a
  // refetch AND that refetch resolves — an async gap, not a same-tick
  // update. If Change/edit-query happens inside that gap, the OLD code's
  // `if (addressConfirmed)` guard reads the still-stale `false` prop and
  // silently skips unconfirmPersisted(), leaving the server's
  // addressConfirmed:true stuck even though the local UI has already reset.
  // ---------------------------------------------------------------------
  it('race window — confirmPin succeeded locally but the addressConfirmed prop has not yet caught up: editing the query still unconfirms exactly once', async () => {
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);
    mockUpdateMutate.mockImplementation((_payload, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    const user = userEvent.setup();
    // Mounted with addressConfirmed: false throughout — deliberately NEVER
    // rerendered with addressConfirmed: true, simulating the window before
    // the listing-query refetch has propagated the new server state back
    // into props.
    renderHarness({ addressConfirmed: false, initialLatitude: null, initialLongitude: null, initialLocality: '' });

    await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
    await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^use$/i }));
    await user.click(screen.getByRole('button', { name: /pin location on map/i }));
    await user.click(screen.getByTestId('mock-address-picker-confirm'));

    // confirmPin's PUT fired and succeeded — local pinConfirmed is true,
    // the banner shows it — but the addressConfirmed PROP is still false.
    expect(screen.getByText(/pin confirmed — Manipal, Udupi/i)).toBeInTheDocument();
    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    mockUpdateMutate.mockClear();

    // Edit the query inside the race window.
    await user.type(screen.getByLabelText(/search for a location/i), 'x');

    // Exactly one unconfirm PUT — not zero (the bug), not more than one
    // (no duplicate/loop).
    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutate).toHaveBeenCalledWith({ addressConfirmed: false });
    expect(screen.queryByText(/pin confirmed/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pin location on map/i })).toBeDisabled();
  });

  it('race window — "Change" during the same gap also unconfirms exactly once', async () => {
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);
    mockUpdateMutate.mockImplementation((_payload, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    const user = userEvent.setup();
    renderHarness({ addressConfirmed: false, initialLatitude: null, initialLongitude: null, initialLocality: '' });

    await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
    await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^use$/i }));
    await user.click(screen.getByRole('button', { name: /pin location on map/i }));
    await user.click(screen.getByTestId('mock-address-picker-confirm'));

    expect(screen.getByText(/pin confirmed — Manipal, Udupi/i)).toBeInTheDocument();
    mockUpdateMutate.mockClear();

    await user.click(screen.getAllByRole('button', { name: /^change$/i })[0]);

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutate).toHaveBeenCalledWith({ addressConfirmed: false });
  });
});

describe('useResidentialLocation — not-found threshold (AC-4.4)', () => {
  it('treats a too-short query as not-found without calling the search API', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.type(screen.getByLabelText(/search for a location/i), 'ab');
    await user.click(screen.getByRole('button', { name: /^find location$/i }));

    expect(mockSearchNominatim).not.toHaveBeenCalled();
    expect(await screen.findByText(/no results for "ab"/i)).toBeInTheDocument();
  });

  it('treats an all-numeric query as not-found without calling the search API', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.type(screen.getByLabelText(/search for a location/i), '576104');
    await user.click(screen.getByRole('button', { name: /^find location$/i }));

    expect(mockSearchNominatim).not.toHaveBeenCalled();
    expect(await screen.findByText(/no results for "576104"/i)).toBeInTheDocument();
  });

  it('a legitimate short-but-lettered query still searches', async () => {
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);
    const user = userEvent.setup();
    renderHarness();

    await user.type(screen.getByLabelText(/search for a location/i), 'MG Road');
    await user.click(screen.getByRole('button', { name: /^find location$/i }));

    await waitFor(() => expect(mockSearchNominatim).toHaveBeenCalledWith('MG Road'));
  });
});

describe('useResidentialLocation — geo rationale gate (AC-4.5)', () => {
  it('shows a rationale card before calling navigator.geolocation, only calling it on Allow', async () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(global.navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole('button', { name: /use my current location/i }));
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /use current location/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^allow$/i }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('"Not now" dismisses the rationale card without calling the geolocation API', async () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(global.navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole('button', { name: /use my current location/i }));
    await user.click(screen.getByRole('button', { name: /not now/i }));

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /use current location/i })).not.toBeInTheDocument();
  });

  it('reuses the existing denied fallback message', async () => {
    const getCurrentPosition = vi.fn((_success, error) => error({ code: 1 }));
    Object.defineProperty(global.navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole('button', { name: /use my current location/i }));
    await user.click(screen.getByRole('button', { name: /^allow$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/location access denied/i);
  });
});

describe('useResidentialLocation — picker Cancel / Adjust pin', () => {
  it('Cancel closes the dialog without persisting and preserves the resolved-not-pinned state', async () => {
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);
    const user = userEvent.setup();
    renderHarness();

    await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
    await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^use$/i }));
    await user.click(screen.getByRole('button', { name: /pin location on map/i }));

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(mockUpdateMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/location confirmed — Manipal/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pin location on map/i })).toBeEnabled();
  });

  it('Adjust pin reopens the picker seeded with the current confirmed pin', async () => {
    const user = userEvent.setup();
    renderHarness({
      addressConfirmed: true,
      initialLatitude: 13.34,
      initialLongitude: 74.74,
      initialLocality: 'Manipal, Udupi',
    });

    expect(await screen.findByText(/pin confirmed/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /adjust pin/i }));

    await waitFor(() =>
      expect(mockAddressPickerProps).toHaveBeenCalledWith(
        expect.objectContaining({ initialLatitude: 13.34, initialLongitude: 74.74 }),
      ),
    );
  });
});

describe('useResidentialLocation — issue #2065: localityResolved reload signal', () => {
  it('a search-only reload (locality persisted, no confirmed pin) seeds localityResolved:true WITHOUT fabricating resolved.center — the #2039 guard', async () => {
    let capturedState: import('../useResidentialLocation').LocationState | null = null;
    function Probe(props: UseResidentialLocationParams) {
      const location = useResidentialLocation(props);
      capturedState = location.state;
      return (
        <>
          <AddressSearch location={location} />
          <MapPin location={location} />
        </>
      );
    }
    const onPublicLoc = vi.fn();
    render(
      <Probe
        listingId="listing-1"
        addressConfirmed={false}
        initialLatitude={null}
        initialLongitude={null}
        initialLocality="Manipal, Udupi"
        onPublicLoc={onPublicLoc}
      />,
    );

    await waitFor(() => expect(capturedState?.localityResolved).toBe(true));

    // The #2039 guard: no coordinate is ever fabricated for an unconfirmed
    // search-only draft. `resolved` (which carries a `center`) stays null,
    // pin/pinConfirmed stay unset, and — critically — MapPin's
    // `seedLat = pin?.lat ?? resolved?.center.lat ?? null` therefore has
    // nothing to seed from, so the broker cannot mistakenly confirm a
    // bogus/never-picked coordinate.
    expect(capturedState?.resolved).toBeNull();
    expect(capturedState?.pin).toBeNull();
    expect(capturedState?.pinConfirmed).toBe(false);
    expect(onPublicLoc).toHaveBeenCalledWith('Manipal, Udupi');

    // No confirmed-pin UI renders — only the unresolved search state.
    expect(screen.queryByText(/pin confirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/location confirmed/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pin location on map/i })).toBeDisabled();
  });

  it('a fresh create (no persisted locality) leaves localityResolved false', async () => {
    let capturedState: import('../useResidentialLocation').LocationState | null = null;
    function Probe(props: UseResidentialLocationParams) {
      const location = useResidentialLocation(props);
      capturedState = location.state;
      return <AddressSearch location={location} />;
    }
    const onPublicLoc = vi.fn();
    render(
      <Probe
        listingId="listing-1"
        addressConfirmed={false}
        initialLatitude={null}
        initialLongitude={null}
        initialLocality=""
        onPublicLoc={onPublicLoc}
      />,
    );

    await waitFor(() => expect(capturedState).not.toBeNull());
    expect(capturedState?.localityResolved).toBe(false);
    expect(onPublicLoc).not.toHaveBeenCalled();
    // No confirmed/resolved UI — nothing seeded.
    expect(screen.queryByText(/location confirmed/i)).not.toBeInTheDocument();
  });

  it('editing the query after a locality-only reload clears localityResolved (same reset as any real edit)', async () => {
    let capturedState: import('../useResidentialLocation').LocationState | null = null;
    function Probe(props: UseResidentialLocationParams) {
      const location = useResidentialLocation(props);
      capturedState = location.state;
      return <AddressSearch location={location} />;
    }
    const user = userEvent.setup();
    render(
      <Probe
        listingId="listing-1"
        addressConfirmed={false}
        initialLatitude={null}
        initialLongitude={null}
        initialLocality="Manipal, Udupi"
        onPublicLoc={vi.fn()}
      />,
    );

    await waitFor(() => expect(capturedState?.localityResolved).toBe(true));

    await user.type(screen.getByLabelText(/search for a location/i), 'x');

    await waitFor(() => expect(capturedState?.localityResolved).toBe(false));
  });
});

describe('useResidentialLocation — code-review fix: hydration effect runs at most once, on mount', () => {
  it('does not re-fire (and does not clobber the live resolved.formatted) after a confirmPin-triggered prop refetch', async () => {
    // mount with addressConfirmed:false (normal create-flow case) — the
    // hydration effect's seed condition is unmet on this first run, but it
    // must still latch so it can never fire again.
    mockSearchNominatim.mockResolvedValue([MANIPAL_RESULT]);
    mockUpdateMutate.mockImplementation((_payload, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    const user = userEvent.setup();
    const { rerenderWith } = renderHarness({ addressConfirmed: false, initialLatitude: null, initialLongitude: null, initialLocality: '' });

    // In-session resolve -> confirm flow (unaffected by the fix).
    await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
    await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^use$/i }));
    await user.click(screen.getByRole('button', { name: /pin location on map/i }));
    await user.click(screen.getByTestId('mock-address-picker-confirm'));

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      { latitude: 13.34, longitude: 74.74, addressConfirmed: true },
      expect.any(Object),
    );
    // Locally confirmed with the full, detailed formatted string still intact.
    expect(screen.getByText(/pin confirmed — Manipal, Udupi/i)).toBeInTheDocument();

    // Simulate useUpdateListing's post-success query invalidation: the
    // parent refetches useGetListing and passes the now-persisted (coarser)
    // props back down — addressConfirmed/lat/lng/locality all change identity.
    rerenderWith({ addressConfirmed: true, initialLatitude: 13.34, initialLongitude: 74.74, initialLocality: 'Manipal, Udupi' });

    // The hydration effect must NOT re-fire: the confirmed banner still
    // shows the live publicLoc summary, unaffected by the refetch (it was
    // never clobbered/reset to begin with).
    expect(screen.getByText(/pin confirmed — Manipal, Udupi/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adjust pin/i })).toBeEnabled();
  });

  it('a truly pre-existing confirmed draft (data present at mount) still hydrates AND seeds locality via onPublicLoc', async () => {
    const { onPublicLoc } = renderHarness({
      addressConfirmed: true,
      initialLatitude: 13.34,
      initialLongitude: 74.74,
      initialLocality: 'Manipal, Udupi',
    });

    expect(await screen.findByText(/pin confirmed — Manipal, Udupi/i)).toBeInTheDocument();
    expect(onPublicLoc).toHaveBeenCalledWith('Manipal, Udupi');
  });
});
