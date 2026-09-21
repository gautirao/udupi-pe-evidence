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
