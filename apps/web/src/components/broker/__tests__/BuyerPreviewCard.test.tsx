/**
 * BuyerPreviewCard unit tests — issue #1722 (AC6, honesty guardrail).
 *
 * (1) Cover thumbnail renders from the real cover image URL (image[0]).
 * (2) Confirmed location is reflected honestly (only when locationConfirmed).
 * (3) No unconditional "Verified"/"Published"/"Details confirmed" badge —
 *     the always-on "Verified broker" claim removed in #1722 must never
 *     regress back in.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuyerPreviewCard } from '../BuyerPreviewCard';

const baseProps = {
  title: '3 BHK Apartment in Manipal',
  locality: 'Manipal, Udupi',
  priceRupees: 5_000_000,
  monthlyRent: null,
  isRent: false,
  areaSqft: 1200,
  specChips: [],
  photoCount: 0,
  coverImageUrl: null as string | null,
  locationConfirmed: false,
};

describe('BuyerPreviewCard — AC6 honesty', () => {
  it('never renders an unconditional Verified/Published/Details-confirmed claim', () => {
    render(<BuyerPreviewCard {...baseProps} />);
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/verified broker/i);
    expect(body).not.toMatch(/details confirmed/i);
    expect(body).not.toMatch(/published/i);
  });

  it('renders the real cover thumbnail when a cover image URL is provided', () => {
    render(<BuyerPreviewCard {...baseProps} photoCount={2} coverImageUrl="https://example.com/cover.jpg" />);
    const img = screen.getByTestId('buyer-preview-cover-image') as HTMLImageElement;
    expect(img.src).toBe('https://example.com/cover.jpg');
  });

  it('falls back to an honest empty state when there is no cover image', () => {
    render(<BuyerPreviewCard {...baseProps} photoCount={0} coverImageUrl={null} />);
    expect(screen.queryByTestId('buyer-preview-cover-image')).not.toBeInTheDocument();
    expect(screen.getByText(/no photos yet/i)).toBeInTheDocument();
  });

  it('reflects confirmed location only when locationConfirmed is true', () => {
    const { rerender } = render(<BuyerPreviewCard {...baseProps} locationConfirmed={false} />);
    expect(screen.queryByTestId('buyer-preview-location-confirmed')).not.toBeInTheDocument();

    rerender(<BuyerPreviewCard {...baseProps} locationConfirmed />);
    expect(screen.getByTestId('buyer-preview-location-confirmed')).toBeInTheDocument();
  });
});

describe('BuyerPreviewCard — rent vs sale price line (#2859 B3 csv33 C4m/C5e)', () => {
  it('C4m rent: shows the monthly rent with "/mo" and ignores the sale price', () => {
    render(<BuyerPreviewCard {...baseProps} isRent monthlyRent={45_000} priceRupees={35_000_000} />);
    expect(screen.getByText('₹45K/mo')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toContain('₹3.50 Cr');
    // no per-sqft line for a rental
    expect(document.body.textContent ?? '').not.toContain('/sqft');
  });

  it('C5e sale: shows the sale price without "/mo" and ignores the monthly rent', () => {
    render(<BuyerPreviewCard {...baseProps} isRent={false} monthlyRent={45_000} priceRupees={35_000_000} />);
    expect(screen.getByText('₹3.50 Cr')).toBeInTheDocument();
    const body = document.body.textContent ?? '';
    expect(body).not.toContain('/mo');
    expect(body).not.toContain('₹45K');
  });
});

describe('BuyerPreviewCard — issue #1722 correction #4: renders publicLoc only, never the private formatted string', () => {
  // The full Nominatim display_name that useResidentialLocation keeps PRIVATE
  // (map/pin/POI use only) — must never reach this buyer-facing surface.
  const PRIVATE_FORMATTED = '12/3-A, MG Road, Manipal, Udupi District, Karnataka, 576104, India';
  const PUBLIC_LOC = 'Manipal, Udupi';

  it('renders only the coarse publicLoc string passed as `locality`', () => {
    render(<BuyerPreviewCard {...baseProps} locality={PUBLIC_LOC} />);
    expect(screen.getByText(PUBLIC_LOC)).toBeInTheDocument();
    const body = document.body.textContent ?? '';
    expect(body).not.toContain(PRIVATE_FORMATTED);
    expect(body).not.toContain('576104');
    expect(body).not.toContain('MG Road');
  });
});
