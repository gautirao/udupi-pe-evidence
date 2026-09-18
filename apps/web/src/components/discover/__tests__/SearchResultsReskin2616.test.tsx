/**
 * Focused tests for Issue #2616 — Search Results Page Reskin (Residential and Commercial)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  formatMarkerContextText,
  createMarkerIcon,
  createSelectedMarkerIcon,
} from '@/components/map/layers/markerIcons';
import { IntentSelector } from '../IntentSelector';
import { PropertyCard } from '../PropertyCard';

import { getClusterNounInfo } from '@/components/map/layers/ResidentialMarkerClusterLayer';

vi.mock('@/hooks/useSavedListings', () => ({
  useSavedListingIds: () => ({ idSet: new Set() }),
  useSaveListing: () => ({ mutate: vi.fn(), isPending: false }),
  useUnsaveListing: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/contexts/AuthModalContext', () => ({
  useAuthModal: () => ({ isOpen: false, openAuthModal: vi.fn(), closeAuthModal: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('Issue #2616 — Map Marker Context Formatting', () => {
  it('formats Residential marker context with BHK and sq ft', () => {
    const text = formatMarkerContextText('apartment', { bedrooms: 3, sqft: 3500 });
    expect(text).toBe('3 BHK · 3,500 sq ft');
  });

  it('formats Residential dwelling with BHK only when sqft is absent', () => {
    const text = formatMarkerContextText('apartment', { bedrooms: 2 });
    expect(text).toBe('2 BHK');
  });

  it('formats Residential Plot with sq ft only (no BHK)', () => {
    const text = formatMarkerContextText('land', { bedrooms: 0, sqft: 1200 });
    expect(text).toBe('1,200 sq ft');
  });

  it('formats Commercial Shop marker context with Subtype and sq ft', () => {
    const text = formatMarkerContextText('shop', { sqft: 2400, subtypeLabel: 'Shop' });
    expect(text).toBe('Shop · 2,400 sq ft');
  });

  it('formats Commercial Office marker context with Subtype and sq ft', () => {
    const text = formatMarkerContextText('office', { sqft: 5800, subtypeLabel: 'Office' });
    expect(text).toBe('Office · 5,800 sq ft');
  });

  it('formats Commercial Warehouse marker context with Subtype and sq ft', () => {
    const text = formatMarkerContextText('warehouse', { sqft: 12000, subtypeLabel: 'Warehouse' });
    expect(text).toBe('Warehouse · 12,000 sq ft');
  });

  it('formats Commercial Land marker context', () => {
    const text = formatMarkerContextText('commercial_land', { sqft: 15000, subtypeLabel: 'Commercial Land' });
    expect(text).toBe('Commercial Land · 15,000 sq ft');
  });

  it('includes context text in DivIcon HTML created by createMarkerIcon', () => {
    const icon = createMarkerIcon('apartment', 67500000, null, null, null, {
      bedrooms: 3,
      sqft: 3500,
    });
    const html = (icon.options as { html: string }).html;
    expect(html).toContain('3 BHK · 3,500 sq ft');
  });

  it('includes context text in DivIcon HTML created by createSelectedMarkerIcon', () => {
    const icon = createSelectedMarkerIcon('shop', 32000000, null, null, null, {
      sqft: 2400,
      subtypeLabel: 'Shop',
    });
    const html = (icon.options as { html: string }).html;
    expect(html).toContain('Shop · 2,400 sq ft');
    expect(html).toContain('data-selected="true"');
  });
});

describe('Issue #2616 — Buy / Rent Selector Prominence', () => {
  it('renders Buy as selected with stateful ink-navy styling', () => {
    const onIntentChange = vi.fn();
    render(<IntentSelector intent="buy" onIntentChange={onIntentChange} />);

    const buyBtn = screen.getByTestId('intent-selector-buy');
    const rentBtn = screen.getByTestId('intent-selector-rent');

    expect(buyBtn).toHaveAttribute('aria-pressed', 'true');
    expect(buyBtn.className).toContain('bg-[#1B2A45]');
    expect(buyBtn.className).toContain('text-white');

    expect(rentBtn).toHaveAttribute('aria-pressed', 'false');
    expect(rentBtn.className).toContain('text-slate-600');
  });

  it('switches selection state when Rent is selected', () => {
    const onIntentChange = vi.fn();
    render(<IntentSelector intent="rent" onIntentChange={onIntentChange} />);

    const buyBtn = screen.getByTestId('intent-selector-buy');
    const rentBtn = screen.getByTestId('intent-selector-rent');

    expect(rentBtn).toHaveAttribute('aria-pressed', 'true');
    expect(rentBtn.className).toContain('bg-[#1B2A45]');
    expect(rentBtn.className).toContain('text-white');

    expect(buyBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(buyBtn);
    expect(onIntentChange).toHaveBeenCalledWith('buy');
  });
});

describe('Issue #2616 — Cluster Noun Heterogeneity & Card-Marker Hover', () => {
  it('applies copper highlight styles to PropertyCard when isHovered is true', () => {
    const mockListing = {
      id: 'listing-1',
      title: 'Luxury Villa',
      locality: 'Manipal',
      pricePaise: 850000000,
      propertyType: 'villa',
      listingPurpose: 'sale',
    };

    const queryClient = new QueryClient();

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PropertyCard
            listing={mockListing as any}
            isAuthenticated={false}
            onNavigate={() => {}}
            isHovered={true}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const card = container.querySelector('[data-testid="listing-card"]');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('border-copper');
    expect(card?.className).toContain('bg-copper-50/20');
  });

  it('determines correct cluster noun labels for homogeneous and heterogeneous clusters', () => {
    // Homogeneous homes
    expect(getClusterNounInfo([{ property_type: 'apartment' }, { property_type: 'villa' }], 2)).toEqual({
      nounLabel: 'HOMES',
      noun: 'homes',
    });

    // Homogeneous plots
    expect(getClusterNounInfo([{ property_type: 'land' }, { property_type: 'plot' }], 2)).toEqual({
      nounLabel: 'PLOTS',
      noun: 'plots',
    });

    // Mixed plots and dwellings -> MUST yield neutral LISTINGS
    expect(getClusterNounInfo([{ property_type: 'land' }, { property_type: 'apartment' }], 2)).toEqual({
      nounLabel: 'LISTINGS',
      noun: 'listings',
    });

    // Homogeneous commercial
    expect(getClusterNounInfo([{ property_type: 'shop' }, { property_type: 'office' }], 2)).toEqual({
      nounLabel: 'LISTINGS',
      noun: 'listings',
    });
  });
});
