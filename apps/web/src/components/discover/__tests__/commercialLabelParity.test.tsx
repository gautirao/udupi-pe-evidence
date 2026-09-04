/**
 * Issue #2430 — buyer-facing Commercial identity parity across Discover surfaces.
 *
 * Before this PR the four buyer surfaces disagreed:
 *   - PropertyCard applied a one-character `capitalize` to the RAW enum, so
 *     `commercial_building` rendered as "Commercial_building";
 *   - propertyTypeConfig labelled the whole Commercial family "Other", which the
 *     map legend rendered verbatim;
 *   - MarkerPopoverCard / MobileListingPreviewSheet kept their own, different map
 *     ("Comm. Building", "Comm. Land").
 *
 * These tests pin the outcome the issue requires: ONE label authority
 * (`getPropertyTypeLabel` in `@/lib/propertyTypeConfig`), no `Other` for any
 * Commercial type, and no raw enum token on any buyer surface.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PropertyCard } from '../PropertyCard';
import { MapMarkerLegend } from '../MapMarkerLegend';
import { MarkerPopoverCard } from '../MarkerPopoverCard';
import { getPropertyTypeLabel } from '@/lib/propertyTypeConfig';
import { COMMERCIAL_TYPES } from '@/lib/listing-constants';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

// PropertyCard's server-backed save affordance + preview fetch are irrelevant to
// label rendering; mock them so the card renders standalone.
vi.mock('@/hooks/useSavedListings', () => ({
  useSavedListingIds: () => ({ idSet: new Set<string>() }),
  useSaveListing: () => ({ mutate: vi.fn(), isPending: false }),
  useUnsaveListing: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/contexts/AuthModalContext', () => ({
  useAuthModal: () => ({ isOpen: false, openAuthModal: vi.fn(), closeAuthModal: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

/**
 * The four Commercial property_type enum values (from `COMMERCIAL_TYPES`) paired
 * with the human label the issue pins for each. Generic `commercial` with no
 * subtype must read "Commercial" — never "Other", never a guessed Shop/Office.
 */
const COMMERCIAL_LABEL_CASES: ReadonlyArray<readonly [string, string]> = [
  ['commercial', 'Commercial'],
  ['commercial_building', 'Commercial Building'],
  ['warehouse', 'Warehouse / Godown'],
  ['commercial_land', 'Commercial Land'],
];

const makeCardListing = (
  overrides: Partial<DiscoverCityListingItem> = {},
): DiscoverCityListingItem => ({
  id: 'l1',
  title: 'Test listing',
  locality: 'Manipal',
  primaryImageUrl: null,
  propertyType: 'commercial',
  listingPurpose: 'sale',
  pricePaise: 5_000_000 * 100,
  bedrooms: null,
  bathrooms: null,
  builtArea: null,
  builtAreaUnit: null,
  landArea: null,
  landAreaUnit: null,
  totalFloors: null,
  parkingCount: null,
  furnishingStatus: null,
  createdAt: null,
  trustBadge: null,
  ...overrides,
});

const makePopoverListing = (
  propertyType: string,
): PropertyListingWithImages => ({
  id: 'p1',
  // `property_type` is the `PropertyType` union; these tests deliberately drive
  // every Commercial member of it, so the parameter is widened at the factory
  // boundary rather than at each call site.
  property_type: propertyType as PropertyListingWithImages['property_type'],
  title: 'Test listing',
  locality: 'Manipal',
  price: 5_000_000,
  price_unit: 'INR',
  land_area: null,
  land_area_unit: null,
  built_area: null,
  built_area_unit: null,
  bedrooms: null,
  bathrooms: null,
  description: null,
  latitude: 13.35,
  longitude: 74.79,
  confidence_score: null,
  language_detected: null,
  price_per_cent_paise: null,
  is_valid: true,
  is_duplicate: false,
  status: 'LIVE',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  raw_post_id: null,
  listing_purpose: 'sale',
  carpet_area: null,
  carpet_area_unit: null,
  floor_number: null,
  total_floors: null,
  furnishing_status: null,
  washrooms: null,
  parking_count: null,
  road_frontage_ft: null,
  commercial_usage: null,
  number_of_units: null,
  monthly_rent: null,
  security_deposit_months: null,
  lock_in_months: null,
  seller_type: null,
});

const renderCard = (listing: DiscoverCityListingItem) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <PropertyCard listing={listing} isAuthenticated onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const renderPopover = (propertyType: string) => {
  const mapContainerRef = { current: null };
  return render(
    <MarkerPopoverCard
      listing={makePopoverListing(propertyType)}
      isAuthenticated
      markerPixelPos={{ x: 100, y: 200 }}
      mapContainerRef={mapContainerRef}
      onDismiss={vi.fn()}
      onViewDetails={vi.fn()}
      onShowInList={vi.fn()}
    />,
  );
};

describe('Issue #2430 — one Commercial label authority', () => {
  it.each(COMMERCIAL_LABEL_CASES)(
    'getPropertyTypeLabel("%s") is "%s"',
    (propertyType, expected) => {
      expect(getPropertyTypeLabel(propertyType)).toBe(expected);
    },
  );

  it('never labels any Commercial property type "Other"', () => {
    for (const propertyType of COMMERCIAL_TYPES) {
      expect(getPropertyTypeLabel(propertyType)).not.toBe('Other');
    }
  });

  it('labels a generic Commercial listing with an unknown subtype honestly, not Shop/Office', () => {
    expect(getPropertyTypeLabel('commercial', null)).toBe('Commercial');
    expect(getPropertyTypeLabel('commercial', undefined)).toBe('Commercial');
    expect(getPropertyTypeLabel('commercial', 'NOT_A_REAL_SUBTYPE')).toBe('Commercial');
  });

  it('distinguishes SHOP from OFFICE once subtype data is available', () => {
    const shop = getPropertyTypeLabel('commercial', 'SHOP');
    const office = getPropertyTypeLabel('commercial', 'OFFICE');
    expect(shop).not.toBe(office);
    expect(shop).toBe('Commercial Shop');
    expect(office).toBe('Commercial Office');
  });

  it('emits no underscore / raw enum token for any Commercial type', () => {
    for (const propertyType of COMMERCIAL_TYPES) {
      const label = getPropertyTypeLabel(propertyType);
      expect(label).not.toContain('_');
      // Case-sensitive: the label must never be the enum token verbatim. Note
      // 'commercial' -> 'Commercial' differs only in case, and that IS the
      // correct human label, so a case-insensitive check would be wrong here.
      expect(label).not.toBe(propertyType);
    }
  });
});

describe('Issue #2430 — buyer surfaces render the shared label', () => {
  it.each(COMMERCIAL_LABEL_CASES)(
    'PropertyCard type pill reads "%s" → "%s"',
    (propertyType, expected) => {
      renderCard(makeCardListing({ propertyType }));
      expect(screen.getByText(expected)).toBeInTheDocument();
    },
  );

  it.each(COMMERCIAL_LABEL_CASES)(
    'MarkerPopoverCard type pill reads "%s" → "%s"',
    (propertyType, expected) => {
      renderPopover(propertyType);
      expect(screen.getByText(expected)).toBeInTheDocument();
    },
  );

  it.each(COMMERCIAL_LABEL_CASES)(
    'the map legend never renders "Other" for "%s"',
    (propertyType) => {
      render(<MapMarkerLegend listings={[{ property_type: propertyType }]} />);
      expect(screen.queryByText('Other')).not.toBeInTheDocument();
    },
  );

  it('card and popover render the SAME string for every Commercial type', () => {
    // Rendered one at a time: React Testing Library scopes queries to
    // document.body, so mounting both surfaces at once makes every shared label
    // an ambiguous multi-match. The comparison is between the two captured
    // strings, not between two live trees.
    for (const [propertyType, expected] of COMMERCIAL_LABEL_CASES) {
      const card = renderCard(makeCardListing({ propertyType }));
      const cardLabel = card.getByText(expected).textContent;
      card.unmount();

      const popover = renderPopover(propertyType);
      const popoverLabel = popover.getByText(expected).textContent;
      popover.unmount();

      expect(cardLabel).toBe(popoverLabel);
      expect(cardLabel).toBe(expected);
    }
  });

  it('renders no raw enum token on the card for any Commercial type', () => {
    for (const [propertyType] of COMMERCIAL_LABEL_CASES) {
      const { container, unmount } = renderCard(makeCardListing({ propertyType, title: null }));
      expect(container.textContent).not.toContain(propertyType);
      expect(container.textContent).not.toContain('Commercial_');
      unmount();
    }
  });

  it('uses the shared label in the card fallback title when the listing has none', () => {
    renderCard(makeCardListing({ propertyType: 'commercial_building', title: null }));
    expect(screen.getByText('Commercial Building For Sale')).toBeInTheDocument();
  });

  it('keeps purpose labels accurate for sale, rent and lease', () => {
    for (const [purpose, expected] of [
      ['sale', 'Commercial Building For Sale'],
      ['rent', 'Commercial Building For Rent'],
      ['lease', 'Commercial Building For Lease'],
    ] as const) {
      const { unmount } = renderCard(
        makeCardListing({ propertyType: 'commercial_building', title: null, listingPurpose: purpose }),
      );
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });
});
