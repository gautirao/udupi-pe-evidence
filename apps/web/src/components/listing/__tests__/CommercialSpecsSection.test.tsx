/**
 * Issue #2432 — rendering behaviour of the Commercial detail section.
 *
 * Gating logic is covered exhaustively against the pure model in commercialDetailModel.test.ts;
 * this file asserts only what rendering itself can get wrong — empty shells, missing attribution,
 * and raw enum text reaching the DOM.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommercialSpecsSection } from '../CommercialSpecsSection';
import type { PublicListingDetail } from '@/pages/ListingDetail';

function listing(over: Partial<PublicListingDetail> = {}): PublicListingDetail {
  return { id: 'l1', propertyType: 'commercial', images: [], ...over } as PublicListingDetail;
}

describe('CommercialSpecsSection', () => {
  it('renders nothing when the listing carries no populated commercial facts', () => {
    const { container } = render(<CommercialSpecsSection listing={listing()} subtype="SHOP" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a residential listing', () => {
    const { container } = render(
      <CommercialSpecsSection listing={listing({ propertyType: 'apartment', officeSeats: 10 })} subtype={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders only the groups that have populated facts, with no empty headings', () => {
    render(
      <CommercialSpecsSection
        listing={listing({ warehouseLoadingBays: 3, warehouseTruckAccess: false })}
        subtype="WAREHOUSE"
      />,
    );
    expect(screen.getByTestId('commercial-group-warehouse')).toBeInTheDocument();
    expect(screen.queryByTestId('commercial-group-facilities')).not.toBeInTheDocument();
    expect(screen.queryByTestId('commercial-group-office')).not.toBeInTheDocument();
    expect(screen.getByTestId('commercial-fact-truck-access')).toHaveTextContent('No');
  });

  it('keeps public and private counts as distinct rows rather than summing them', () => {
    render(
      <CommercialSpecsSection
        listing={listing({ washroomsPublic: 2, washroomsPrivate: 1, parkingPublicCount: 10, parkingPrivateCount: 4 })}
        subtype="SHOP"
      />,
    );
    expect(screen.getByTestId('commercial-fact-washrooms-public')).toHaveTextContent('2');
    expect(screen.getByTestId('commercial-fact-washrooms-private')).toHaveTextContent('1');
    expect(screen.getByTestId('commercial-fact-parking-public')).toHaveTextContent('10');
    expect(screen.getByTestId('commercial-fact-parking-private')).toHaveTextContent('4');
    // A summed "3 washrooms" row would be a different, wrong fact.
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('attributes broker-entered claims to the lister without calling them verified', () => {
    render(
      <CommercialSpecsSection
        listing={listing({ commercialZoning: 'Mixed commercial', commercialApprovals: 'CC obtained' })}
        subtype="LAND"
      />,
    );
    const note = screen.getByTestId('commercial-attribution-note');
    expect(note).toHaveTextContent(/as stated by the lister/i);
    expect(note).toHaveTextContent(/not been independently verified/i);
  });

  it('omits the attribution note when no attributed fact is shown', () => {
    render(<CommercialSpecsSection listing={listing({ officeSeats: 12 })} subtype="OFFICE" />);
    expect(screen.getByTestId('commercial-fact-office-seats')).toBeInTheDocument();
    expect(screen.queryByTestId('commercial-attribution-note')).not.toBeInTheDocument();
  });

  it('renders a legacy null-subtype row rather than an empty card', () => {
    // #1742 — the row carries facts but no subtype; it must still be useful to a buyer.
    render(
      <CommercialSpecsSection
        listing={listing({ carpetArea: 800, commercialAreaUnit: 'SQ_FT', washroomsPublic: 1 })}
        subtype={null}
      />,
    );
    expect(screen.getByTestId('commercial-specs-section')).toBeInTheDocument();
    expect(screen.getByTestId('commercial-fact-area')).toHaveTextContent('800 Sq.ft');
    expect(screen.getByTestId('commercial-fact-washrooms-public')).toHaveTextContent('1');
  });

  it('puts no raw enum token in the DOM', () => {
    const { container } = render(
      <CommercialSpecsSection
        listing={listing({
          commercialFurnishingStatus: 'PLUG_AND_PLAY',
          commercialAvailability: 'WITHIN_15_DAYS',
          occupancyStatus: 'PARTLY_OCCUPIED',
          hubType: 'HIGH_STREET',
          utilities: ['WATER_STORAGE'],
        })}
        subtype="SHOP"
      />,
    );
    expect(container.textContent).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    expect(screen.getByTestId('commercial-fact-furnishing')).toHaveTextContent('Plug and play');
  });
});
