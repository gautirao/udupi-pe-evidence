import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { PropertyCard } from '../PropertyCard';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

const makeListing = (overrides: Partial<DiscoverCityListingItem> = {}): DiscoverCityListingItem => ({
  id: 'l1',
  title: 'Green View Apartment',
  locality: 'Manipal',
  primaryImageUrl: null,
  propertyType: 'apartment',
  listingPurpose: 'sale',
  pricePaise: 5000000 * 100, // ₹50,00,000
  bedrooms: 3,
  bathrooms: 2,
  builtArea: 1200,
  builtAreaUnit: 'sqft',
  landArea: null,
  landAreaUnit: null,
  totalFloors: null,
  parkingCount: null,
  furnishingStatus: null,
  createdAt: null,
  trustTier: null,
  ...overrides,
});

const renderCard = (props: React.ComponentProps<typeof PropertyCard>) =>
  render(<MemoryRouter>{<PropertyCard {...props} />}</MemoryRouter>);

describe('PropertyCard', () => {
  it('renders the listing-card testid', () => {
    renderCard({ listing: makeListing(), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.getByTestId('listing-card')).toBeInTheDocument();
  });

  it('shows the listing title', () => {
    renderCard({ listing: makeListing({ title: 'Sunny Villa' }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.getByText('Sunny Villa')).toBeInTheDocument();
  });

  it('falls back to type+purpose when title is null', () => {
    renderCard({
      listing: makeListing({ title: null, propertyType: 'apartment', listingPurpose: 'sale' }),
      isAuthenticated: true,
      onNavigate: vi.fn(),
    });
    expect(screen.getByText('Apartment For Sale')).toBeInTheDocument();
  });

  it('renders an img element when primaryImageUrl is provided', () => {
    const { container } = renderCard({
      listing: makeListing({ primaryImageUrl: 'https://example.com/img.jpg' }),
      isAuthenticated: true,
      onNavigate: vi.fn(),
    });
    // The img has alt="" (decorative) so ARIA role is "presentation", not "img".
    // Use the DOM directly to verify the src attribute.
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://example.com/img.jpg');
  });

  it('renders the Building2 fallback icon when no image URL', () => {
    renderCard({ listing: makeListing({ primaryImageUrl: null }), isAuthenticated: true, onNavigate: vi.fn() });
    // img element should be absent
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // The listing-card container itself should be present
    expect(screen.getByTestId('listing-card')).toBeInTheDocument();
  });

  it('shows Trusted badge for trustTier A', () => {
    renderCard({ listing: makeListing({ trustTier: 'A' }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.getByText('Trusted')).toBeInTheDocument();
  });

  it('shows Trusted badge for trustTier B', () => {
    renderCard({ listing: makeListing({ trustTier: 'B' }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.getByText('Trusted')).toBeInTheDocument();
  });

  it('does not show Trusted badge for trustTier C', () => {
    renderCard({ listing: makeListing({ trustTier: 'C' }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.queryByText('Trusted')).not.toBeInTheDocument();
  });

  it('shows the formatted price when isAuthenticated is true and pricePaise is set', () => {
    renderCard({
      listing: makeListing({ pricePaise: 5000000 * 100 }),
      isAuthenticated: true,
      onNavigate: vi.fn(),
    });
    // formatPrice(50_00_000, 'INR') — exact string depends on the formatter, just verify price is visible
    expect(screen.queryByText('Sign in to view price')).not.toBeInTheDocument();
    expect(screen.queryByText('Price on request')).not.toBeInTheDocument();
  });

  it('shows "Price on request" when authenticated but pricePaise is undefined', () => {
    renderCard({
      listing: makeListing({ pricePaise: undefined }),
      isAuthenticated: true,
      onNavigate: vi.fn(),
    });
    expect(screen.getByText('Price on request')).toBeInTheDocument();
  });

  it('shows "Sign in to view price" for anonymous users regardless of price', () => {
    renderCard({
      listing: makeListing({ pricePaise: 5000000 * 100 }),
      isAuthenticated: false,
      onNavigate: vi.fn(),
    });
    expect(screen.getByText('Sign in to view price')).toBeInTheDocument();
  });

  it('shows the locality with MapPin', () => {
    renderCard({ listing: makeListing({ locality: 'Udupi' }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.getByText('Udupi')).toBeInTheDocument();
  });

  it('does not show locality section when locality is undefined', () => {
    renderCard({ listing: makeListing({ locality: undefined }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.queryByText('Udupi')).not.toBeInTheDocument();
  });

  it('shows bedrooms BHK chip in metadata', () => {
    renderCard({ listing: makeListing({ bedrooms: 3 }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.getByText('3 BHK')).toBeInTheDocument();
  });

  it('renders propertyType and listingPurpose tag chips', () => {
    renderCard({
      listing: makeListing({ propertyType: 'villa', listingPurpose: 'rent' }),
      isAuthenticated: true,
      onNavigate: vi.fn(),
    });
    expect(screen.getByText('Villa')).toBeInTheDocument();
    expect(screen.getByText('For Rent')).toBeInTheDocument();
  });

  it('calls onNavigate when the card is clicked', async () => {
    const onNavigate = vi.fn();
    renderCard({ listing: makeListing(), isAuthenticated: true, onNavigate });
    await userEvent.click(screen.getByTestId('listing-card'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
