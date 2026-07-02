/**
 * ResidentialListingForm field-grouping tests — issue #1722 (AC8).
 *
 * Property Details (Section 3) must show ONLY core buyer-critical fields;
 * optional/secondary fields must live under "More details" (Section 5,
 * collapsed by default — Radix Collapsible does not mount its content until
 * opened). Per-subtype VISIBILITY is unchanged: isListingFieldVisible is not
 * touched by this change, so a residential plot must never show
 * apartment/house-only fields in either section (negative case).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/hooks/useBrokerListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBrokerListings')>();
  return {
    ...actual,
    useCreateListing: () => ({ mutate: vi.fn(), isPending: false }),
    useUpdateListing: () => ({ mutate: vi.fn(), isPending: false }),
    useSubmitListing: () => ({ mutate: vi.fn(), isPending: false }),
    useGetListing: () => ({ data: undefined }),
  };
});

vi.mock('@/hooks/useListingImages', () => ({
  useListingImages: () => ({
    images: [],
    isLoading: false,
    fetchError: null,
    uploads: {},
    isUploading: false,
    imageCount: 0,
    canSubmit: false,
    remainingSlots: 10,
    maxImages: 10,
    uploadImage: vi.fn(),
    retryUpload: vi.fn(),
    retryFinalize: vi.fn(),
    dismissUpload: vi.fn(),
    deleteImage: vi.fn(),
    isDeleting: false,
    reorderImages: vi.fn(),
    isReordering: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/components/broker/residential/InlineNearby', () => ({
  InlineNearby: () => <div data-testid="mock-inline-nearby" />,
}));

import { ResidentialListingForm } from '../ResidentialListingForm';

function renderForm(initialPropertyType: 'apartment' | 'house' | 'villa' | 'residential_plot') {
  render(
    <MemoryRouter>
      <ResidentialListingForm
        initialPropertyType={initialPropertyType}
        onSwitchToGenericFlow={vi.fn()}
        navigate={vi.fn()}
      />
    </MemoryRouter>,
  );
}

async function openMoreDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /more details.*ownership/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ResidentialListingForm — AC8 field grouping (apartment)', () => {
  it('keeps core fields in Property Details, visible before opening More details', () => {
    renderForm('apartment');
    expect(document.getElementById('bedrooms')).not.toBeNull();
    expect(document.getElementById('bathrooms')).not.toBeNull();
    expect(document.getElementById('balconies')).not.toBeNull();
    expect(document.getElementById('furnishingStatus')).not.toBeNull();
    expect(document.getElementById('facing')).not.toBeNull();
    expect(document.getElementById('floorNumber')).not.toBeNull();
    expect(document.getElementById('totalFloors')).not.toBeNull();
    expect(document.getElementById('carpetArea')).not.toBeNull();

    // Optional/secondary fields must NOT be present until More details is opened.
    expect(document.getElementById('builtArea')).toBeNull();
    expect(document.getElementById('superBuiltArea')).toBeNull();
    expect(screen.queryByTestId('chip-group-amenities')).not.toBeInTheDocument();
  });

  it('moves optional/secondary fields into More details', async () => {
    const user = userEvent.setup();
    renderForm('apartment');
    await openMoreDetails(user);

    expect(document.getElementById('builtArea')).not.toBeNull();
    expect(document.getElementById('superBuiltArea')).not.toBeNull();
    expect(document.getElementById('parking2wCount')).not.toBeNull();
    expect(document.getElementById('parking4wCount')).not.toBeNull();
    expect(document.getElementById('isGated')).not.toBeNull();
    expect(document.getElementById('builderName')).not.toBeNull();
    expect(document.getElementById('hasLift')).not.toBeNull();
    expect(document.getElementById('hasPowerBackup')).not.toBeNull();
    expect(screen.getByTestId('chip-group-amenities')).toBeInTheDocument();
    expect(screen.getByTestId('chip-group-special-views')).toBeInTheDocument();
  });
});

describe('ResidentialListingForm — AC8 field grouping (house/villa)', () => {
  it('keeps the primary built-up area field as core (Property Details)', () => {
    renderForm('house');
    // House/villa's PRIMARY area metric is built-up area — it stays core,
    // unlike apartment where built-up area is a secondary/optional metric.
    expect(document.getElementById('builtArea')).not.toBeNull();
    expect(document.getElementById('bedrooms')).not.toBeNull();
    expect(document.getElementById('bathrooms')).not.toBeNull();

    expect(document.getElementById('isGated')).toBeNull();
    expect(document.getElementById('builderName')).toBeNull();
    expect(screen.queryByTestId('chip-group-amenities')).not.toBeInTheDocument();
  });

  it('moves house/villa optional fields into More details', async () => {
    const user = userEvent.setup();
    renderForm('house');
    await openMoreDetails(user);

    expect(document.getElementById('parking2wCount')).not.toBeNull();
    expect(document.getElementById('isGated')).not.toBeNull();
    expect(document.getElementById('builderName')).not.toBeNull();
    expect(screen.getByTestId('chip-group-amenities')).toBeInTheDocument();

    // Apartment-only fields must never appear for house, even in More details.
    expect(document.getElementById('superBuiltArea')).toBeNull();
    expect(document.getElementById('hasLift')).toBeNull();
  });
});

describe('ResidentialListingForm — issue #1722 correction #3 (Property details 2-col layout)', () => {
  it('relabels the BHK section to "Configuration (BHK)" with "N BHK" chip text', () => {
    renderForm('apartment');
    expect(screen.getByText('Configuration (BHK)')).toBeInTheDocument();
    expect(screen.queryByText('Bedrooms (BHK)')).not.toBeInTheDocument();

    const bedroomsGroup = document.getElementById('bedrooms');
    expect(bedroomsGroup).not.toBeNull();
    expect(within(bedroomsGroup as HTMLElement).getByRole('radio', { name: '1 BHK' })).toBeInTheDocument();
    expect(within(bedroomsGroup as HTMLElement).getByRole('radio', { name: '3 BHK' })).toBeInTheDocument();
    expect(within(bedroomsGroup as HTMLElement).getByRole('radio', { name: '5+ BHK' })).toBeInTheDocument();
  });

  it('renders carpet area as a plain input + unit dropdown, with no quick-pick preset chips', () => {
    renderForm('apartment');
    const carpetAreaInput = document.getElementById('carpetArea') as HTMLInputElement | null;
    expect(carpetAreaInput).not.toBeNull();
    expect(carpetAreaInput?.placeholder).toBe('e.g. 1150');

    // Preset area chips (e.g. "600 sqft", "1,200 sqft") must NOT be present for carpet area.
    expect(screen.queryByRole('radiogroup', { name: /common area sizes/i })).not.toBeInTheDocument();
    for (const chipLabel of ['600 sqft', '800 sqft', '1,000 sqft', '1,200 sqft', '1,500 sqft', '2,000 sqft']) {
      expect(screen.queryByText(chipLabel)).not.toBeInTheDocument();
    }
  });

  it('renders Bathrooms/Balconies and Furnishing/Facing as 2-column pairs, with Facing placeholder "Select direction"', () => {
    renderForm('apartment');

    const bathroomsGroup = document.getElementById('bathrooms');
    const balconiesGroup = document.getElementById('balconies');
    expect(bathroomsGroup).not.toBeNull();
    expect(balconiesGroup).not.toBeNull();
    // Both fields share the same 2-column FieldPairRow grid parent.
    expect(bathroomsGroup?.parentElement?.parentElement).toBe(balconiesGroup?.parentElement?.parentElement);

    const furnishingGroup = document.getElementById('furnishingStatus');
    const facingTrigger = document.getElementById('facing');
    expect(furnishingGroup).not.toBeNull();
    expect(facingTrigger).not.toBeNull();
    expect(furnishingGroup?.parentElement?.parentElement).toBe(facingTrigger?.closest('.space-y-2')?.parentElement);

    expect(screen.getByText('Select direction')).toBeInTheDocument();
    expect(screen.queryByText('Select facing')).not.toBeInTheDocument();
  });

  it('renders Floor number/Total floors as a 2-column pair for apartments', () => {
    renderForm('apartment');
    const floorNumber = document.getElementById('floorNumber');
    const totalFloors = document.getElementById('totalFloors');
    expect(floorNumber).not.toBeNull();
    expect(totalFloors).not.toBeNull();
    expect(floorNumber?.closest('.space-y-2')?.parentElement).toBe(totalFloors?.closest('.space-y-2')?.parentElement);
  });
});

describe('ResidentialListingForm — AC8 negative case (residential_plot)', () => {
  it('never shows apartment/house-only fields, in either section', async () => {
    const user = userEvent.setup();
    renderForm('residential_plot');
    await openMoreDetails(user);

    // Note: 'facing' is intentionally excluded — PLOT_ONLY_FIELDS legitimately
    // includes it (listingFieldConfig.ts), so it correctly renders for plots too.
    for (const id of [
      'bedrooms', 'bathrooms', 'balconies', 'furnishingStatus',
      'floorNumber', 'totalFloors', 'carpetArea', 'builtArea', 'superBuiltArea',
      'parking2wCount', 'parking4wCount', 'isGated', 'builderName',
      'hasLift', 'hasPowerBackup', 'hasGarden', 'hasTerrace', 'hasCompound', 'hasServantRoom',
    ]) {
      expect(document.getElementById(id)).toBeNull();
    }
    expect(screen.queryByTestId('chip-group-amenities')).not.toBeInTheDocument();

    // Plot's own fields ARE present (unaffected by AC8 — they stay in "Plot details").
    expect(document.getElementById('plotArea')).not.toBeNull();
    expect(document.getElementById('plotDimensions')).not.toBeNull();
  });
});
