/**
 * InlineNearby unit tests — issue #1722 (AC4, 3-state model negative case).
 *
 * InlineNearby gates the REAL PoiManager (GET /api/listings/{id}/pois/suggestions)
 * on the addressConfirmed prop, which the parent (ResidentialListingForm) sources
 * from the PERSISTED listing, not from InlineLocation's local "resolved starting
 * location" state. Selecting a search result (state 2) must never cause this gate
 * to open — only a persisted pin-confirm (state 3) does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPoiManager = vi.hoisted(() => vi.fn());

vi.mock('@/components/poi/PoiManager', () => ({
  PoiManager: (props: unknown) => {
    mockPoiManager(props);
    return <div data-testid="mock-poi-manager" />;
  },
}));

import { InlineNearby } from '../InlineNearby';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InlineNearby — AC4: gated on the persisted addressConfirmed flag', () => {
  it('shows the "not yet confirmed" placeholder and never mounts PoiManager (no suggestions fetch) when addressConfirmed is false', () => {
    render(<InlineNearby listingId="listing-1" propertyType="apartment" addressConfirmed={false} />);

    expect(screen.getByText(/location not yet confirmed/i)).toBeInTheDocument();
    expect(screen.queryByTestId('mock-poi-manager')).not.toBeInTheDocument();
    expect(mockPoiManager).not.toHaveBeenCalled();
  });

  it('mounts the real PoiManager (which fetches suggestions) once addressConfirmed is true', () => {
    render(<InlineNearby listingId="listing-1" propertyType="apartment" addressConfirmed />);

    expect(screen.queryByText(/location not yet confirmed/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-poi-manager')).toBeInTheDocument();
    expect(mockPoiManager).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: 'listing-1', propertyType: 'apartment' }),
    );
  });
});

describe('InlineNearby — 3-state confirmed-pin header (issue #2642)', () => {
  it('shows the "location resolved, pin not confirmed" message (not the generic placeholder) when locationResolved is true and addressConfirmed is false', () => {
    render(
      <InlineNearby listingId="listing-1" propertyType="apartment" addressConfirmed={false} locationResolved />,
    );

    expect(screen.getByText(/location resolved.{0,3}pin not confirmed/i)).toBeInTheDocument();
    expect(screen.queryByText(/^location not yet confirmed$/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-poi-manager')).not.toBeInTheDocument();
  });

  it('still shows the generic "not yet confirmed" placeholder when locationResolved is omitted (default-safe for Commercial/Agricultural callers)', () => {
    render(<InlineNearby listingId="listing-1" propertyType="apartment" addressConfirmed={false} />);

    expect(screen.getByText(/^location not yet confirmed$/i)).toBeInTheDocument();
  });

  it('renders a "Pin confirmed" banner with a working "Change location" action once addressConfirmed is true and onChangeLocation is provided', () => {
    const onChangeLocation = vi.fn();
    render(
      <InlineNearby
        listingId="listing-1"
        propertyType="apartment"
        addressConfirmed
        onChangeLocation={onChangeLocation}
      />,
    );

    expect(screen.getByText('Pin confirmed')).toBeInTheDocument();
    const changeButton = screen.getByRole('button', { name: 'Change location' });
    changeButton.click();
    expect(onChangeLocation).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mock-poi-manager')).toBeInTheDocument();
  });

  it('omits the "Change location" action when onChangeLocation is not provided (default-safe for Commercial/Agricultural callers)', () => {
    render(<InlineNearby listingId="listing-1" propertyType="apartment" addressConfirmed />);

    expect(screen.getByText('Pin confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change location' })).not.toBeInTheDocument();
  });
});

describe('InlineNearby — full mock parity for states (b)/(c) (issue #2647)', () => {
  it('state (b): suffixes the resolved locality onto the header instead of the generic copy', () => {
    render(
      <InlineNearby
        listingId="listing-1"
        propertyType="apartment"
        addressConfirmed={false}
        locationResolved
        publicLoc="Manipal"
      />,
    );

    expect(screen.getByText('Location resolved — Manipal')).toBeInTheDocument();
    // Discrimination: the pre-#2647 generic string must be GONE, not merely
    // accompanied by the locality — otherwise this passes on a component that
    // renders both.
    expect(screen.queryByText('Location resolved — pin not confirmed')).not.toBeInTheDocument();
  });

  it('state (b): renders the "Pin location on map" CTA and delegates the click to onOpenPicker (never its own picker)', async () => {
    const user = userEvent.setup();
    const onOpenPicker = vi.fn();
    render(
      <InlineNearby
        listingId="listing-1"
        propertyType="apartment"
        addressConfirmed={false}
        locationResolved
        publicLoc="Manipal"
        onOpenPicker={onOpenPicker}
      />,
    );

    await user.click(screen.getByRole('button', { name: /pin location on map/i }));

    expect(onOpenPicker).toHaveBeenCalledTimes(1);
    // InlineNearby itself never mounts a picker/dialog — the handler is the
    // only thing it contributes (see InlineNearby.pickerWiring.test.tsx for
    // the proof that the handler raises MapPin's EXISTING dialog).
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('state (b): omits the CTA when onOpenPicker is absent, and keeps the generic copy when publicLoc is absent (Commercial/Agricultural unchanged)', () => {
    render(
      <InlineNearby listingId="listing-1" propertyType="apartment" addressConfirmed={false} locationResolved />,
    );

    expect(screen.getByText('Location resolved — pin not confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pin location on map/i })).not.toBeInTheDocument();
  });

  it('state (b): a whitespace-only publicLoc falls back to the generic copy rather than rendering a dangling em dash', () => {
    render(
      <InlineNearby
        listingId="listing-1"
        propertyType="apartment"
        addressConfirmed={false}
        locationResolved
        publicLoc="   "
      />,
    );

    expect(screen.getByText('Location resolved — pin not confirmed')).toBeInTheDocument();
  });

  it('state (c): renders "Pin confirmed — {publicLoc}" and still mounts PoiManager', () => {
    render(
      <InlineNearby listingId="listing-1" propertyType="apartment" addressConfirmed publicLoc="Manipal" />,
    );

    expect(screen.getByText('Pin confirmed — Manipal')).toBeInTheDocument();
    expect(screen.queryByText(/^Pin confirmed$/)).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-poi-manager')).toBeInTheDocument();
  });

  it('state (c): falls back to plain "Pin confirmed" when publicLoc is absent (Commercial/Agricultural unchanged)', () => {
    render(<InlineNearby listingId="listing-1" propertyType="apartment" addressConfirmed />);

    expect(screen.getByText('Pin confirmed')).toBeInTheDocument();
  });

  it('never renders a private formatted address or coordinates — it can only render the coarse publicLoc it is handed', () => {
    const PRIVATE = 'Plot 14, 2nd Cross, Manipal, Udupi District, Karnataka 576104, India';
    render(
      <InlineNearby
        listingId="listing-1"
        propertyType="apartment"
        addressConfirmed={false}
        locationResolved
        publicLoc="Manipal, Udupi"
        onOpenPicker={vi.fn()}
      />,
    );

    expect(screen.getByText('Location resolved — Manipal, Udupi')).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(PRIVATE.slice(0, 20), 'i'))).not.toBeInTheDocument();
    expect(screen.queryByText(/13\.34|74\.74/)).not.toBeInTheDocument();
  });
});
