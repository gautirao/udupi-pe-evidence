/**
 * EditListing — M38-13A (#1626) residential typed-listing field-visibility regression tests.
 *
 * Code-review fix (post #1626 REQUEST_CHANGES): type-scoped residential fields (scalars,
 * booleans, amenities) were previously sent UNCONDITIONALLY on every PUT. Because
 * PropertyTypeCardSelector is live-editable within the same form, switching type mid-edit
 * (e.g. house→apartment) left stale prior-type values in React state that then got sent
 * and would be REJECTED 400 by the backend's validateResidentialFieldSet/validateFamilyFields.
 *
 * This file asserts: switching type mid-edit omits the now-hidden prior-type fields from
 * the PUT payload — the SAME fieldVisible('...') predicate that governs rendering now also
 * governs what is sent.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockNavigate = vi.hoisted(() => vi.fn());

const mockListingData = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    userRole: 'dealer',
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useBrokerListings', () => ({
  useGetListing: vi.fn(() => ({
    data: mockListingData.current,
    isLoading: false,
    isError: false,
  })),
  useUpdateListing: vi.fn(() => ({
    mutate: mockUpdateMutate,
    isPending: false,
  })),
  useSubmitListing: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

vi.mock('@/hooks/useListingImages', () => ({
  useListingImages: vi.fn(() => ({ images: [] })),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/broker/StepIndicator', () => ({
  StepIndicator: () => null,
}));

vi.mock('@/components/broker/ImageUploader', () => ({
  ImageUploader: () => <div data-testid="image-uploader-stub" />,
}));

vi.mock('@/components/broker/AddressPicker', () => ({
  AddressPicker: () => <div data-testid="address-picker-stub" />,
}));

vi.mock('@/components/poi/PoiManager', () => ({
  PoiManager: () => <div data-testid="poi-manager-stub" />,
}));

vi.mock('@/components/dealer/BoundaryDrawStep', () => ({
  BoundaryDrawStep: () => <div data-testid="boundary-draw-stub" />,
}));

vi.mock('@/components/broker/PriceField', () => ({
  PriceField: ({ onChange }: { onChange: (v: number | null) => void }) => (
    <input
      data-testid="price-field"
      type="number"
      onChange={(e) => onChange(parseFloat(e.target.value) || null)}
    />
  ),
}));

vi.mock('@/components/broker/AreaField', () => ({
  AreaField: () => <div data-testid="area-field" />,
}));

// shadcn Select stub — same pattern as EditListing.agri.test.tsx
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      data-select-value={value || 'empty'}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <span id={id}>{children}</span>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    },
  },
}));

vi.mock('react-leaflet', () => ({
  MapContainer: () => null,
  TileLayer: () => null,
  Marker: () => null,
  Popup: () => null,
  useMap: () => ({ flyTo: vi.fn(), invalidateSize: vi.fn(), fitBounds: vi.fn() }),
  useMapEvents: () => null,
  Circle: () => null,
  Polygon: () => null,
  ZoomControl: () => null,
}));

// ── Import under test ─────────────────────────────────────────────────────────

import EditListing from '../EditListing';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderEditListing() {
  return render(
    <MemoryRouter initialEntries={['/broker/listings/edit/test-id']}>
      <QueryClientProvider client={makeQC()}>
        <Routes>
          <Route path="/broker/listings/edit/:id" element={<EditListing />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** Base listing fixture — status DRAFT so it's editable (not locked). */
function makeBaseListing(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-id',
    status: 'DRAFT',
    propertyType: 'house',
    title: 'Test House Listing',
    locality: 'Manipal',
    price: 5000000,
    description: 'A test house listing',
    landArea: null,
    landAreaUnit: null,
    bedrooms: 3,
    builtArea: 1500,
    builtAreaUnit: 'sqft',
    latitude: 13.34,
    longitude: 74.74,
    addressConfirmed: false,
    imageCount: 3,
    firstImageUrl: null,
    rejectionReason: null,
    videoUrl: null,
    reraNumber: null,
    listingPurpose: 'sale',
    carpetArea: null,
    carpetAreaUnit: null,
    floorNumber: null,
    totalFloors: null,
    furnishingStatus: null,
    washrooms: null,
    parkingCount: null,
    roadFrontageFt: null,
    commercialUsage: null,
    numberOfUnits: null,
    monthlyRent: null,
    securityDepositMonths: null,
    lockInMonths: null,
    waterSource: null,
    soilType: null,
    roadAccess: null,
    cultivationStatus: null,
    ownershipType: null,
    surveyNumber: null,
    boundary: null,
    landCategory: null,
    farmhouseAvailable: null,
    fencingDone: null,
    computedAreaAcres: null,
    sellerType: null,
    earnedBadgeCount: 0,
    areaKey: null,
    listingNumber: null,
    displayId: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    // M38-13A (#1626) residential fields
    bathrooms: 2,
    balconies: null,
    facing: 'EAST',
    availabilityTimeline: null,
    superBuiltArea: null,
    superBuiltAreaUnit: null,
    propertyAge: 'NEW',
    residentialWaterSource: 'BOREWELL',
    parking2wCount: 1,
    parking4wCount: 1,
    roadWidthFt: null,
    plotDimensions: null,
    conversionStatus: null,
    khataNumber: null,
    propertyTaxPid: null,
    approvingAuthority: null,
    projectName: null,
    builderName: null,
    maintenancePaise: null,
    possessionStatus: null,
    hasLift: null,
    hasPowerBackup: null,
    isGated: true,
    hasGarden: true,
    hasTerrace: true,
    hasCompound: false,
    hasServantRoom: null,
    isCornerPlot: null,
    hasBoundaryWall: null,
    isGatedLayout: null,
    hasWaterConnection: null,
    hasElectricityConnection: null,
    hasDrainage: null,
    priceNegotiable: null,
    rentNegotiable: null,
    petsAllowed: null,
    maintenanceIncluded: null,
    amenities: ['RAINWATER_HARVESTING'],
    specialLocationViews: [],
    preferredTenants: [],
    ...overrides,
  };
}

async function selectPropertyType(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
): Promise<void> {
  await user.click(screen.getByRole('radio', { name: label }));
}

beforeEach(() => {
  mockUpdateMutate.mockReset();
  mockNavigate.mockReset();
  mockListingData.current = null;
});

describe('EditListing — M38-13A residential type-switch payload safety', () => {
  it('switching house→apartment mid-edit omits stale house-only fields from the PUT payload', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      propertyType: 'house',
      hasGarden: true,
      hasTerrace: true,
      propertyAge: 'NEW',
      residentialWaterSource: 'BOREWELL',
    });

    renderEditListing();

    // Confirm the house-only section loaded with the prefilled state.
    await waitFor(() => {
      expect(screen.getByText('Water source')).toBeInTheDocument();
    });

    // Switch property type to Apartment — house-only fields (garden/terrace/age/waterSource)
    // must disappear from the DOM, but their React state remains populated ('true'/'NEW'/etc.)
    // until the user explicitly changes them — this is exactly the stale-state scenario.
    await selectPropertyType(user, 'Apartment');

    await waitFor(() => {
      expect(screen.queryByText('Water source')).not.toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];

    // House-only fields must be omitted (undefined) now that type is apartment —
    // sending them would be REJECTED 400 by validateResidentialFieldSet.
    expect(payload.hasGarden).toBeUndefined();
    expect(payload.hasTerrace).toBeUndefined();
    expect(payload.hasCompound).toBeUndefined();
    expect(payload.propertyAge).toBeUndefined();
    expect(payload.residentialWaterSource).toBeUndefined();

    // propertyType itself updates to the new selection.
    expect(payload.propertyType).toBe('apartment');
  });

  it('switching house→residential_plot mid-edit omits stale residence-unit fields (bathrooms, isGated, amenities)', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      propertyType: 'house',
      bathrooms: 2,
      isGated: true,
      amenities: ['RAINWATER_HARVESTING'],
      // bedrooms=3 (base fixture default), furnishingStatus/totalFloors given non-null
      // values here so the completed fix (gating PRE-EXISTING type-scoped fields, not
      // just the new M38-13A ones) is actually exercised below — residential_plot
      // excludes all three per CONFIG_MAP (PLOT_ONLY_FIELDS has none of bedrooms/
      // furnishingStatus/totalFloors), so a regression would resend the stale house value.
      furnishingStatus: 'furnished',
      totalFloors: 1,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByText('Bathrooms')).toBeInTheDocument();
    });

    await selectPropertyType(user, 'Residential Plot');

    await waitFor(() => {
      expect(screen.queryByText('Bathrooms')).not.toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];

    expect(payload.bathrooms).toBeUndefined();
    expect(payload.isGated).toBeUndefined();
    expect(payload.amenities).toBeUndefined();
    expect(payload.propertyType).toBe('residential_plot');

    // Code-review follow-up (this fix): PRE-EXISTING type-scoped fields (bedrooms,
    // furnishingStatus, totalFloors) must ALSO be omitted — residential_plot doesn't
    // include them in CONFIG_MAP, so the stale house-typed values must not resend.
    expect(payload.bedrooms).toBeUndefined();
    expect(payload.furnishingStatus).toBeUndefined();
    expect(payload.totalFloors).toBeUndefined();
  });

  it('switching house→commercial mid-edit omits stale residential-only fields (bedrooms, bathrooms, totalFloors)', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      propertyType: 'house',
      bedrooms: 3,
      bathrooms: 2,
      furnishingStatus: 'furnished',
      totalFloors: 1,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByText('Bathrooms')).toBeInTheDocument();
    });

    await selectPropertyType(user, 'Commercial Shop/Office');

    await waitFor(() => {
      expect(screen.queryByText('Bathrooms')).not.toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];

    // house's residence-only fields must be omitted now that type is commercial —
    // commercial's CONFIG_MAP doesn't include bedrooms/bathrooms/totalFloors (backend
    // would 400 otherwise). furnishingStatus IS shared between house and commercial
    // (COMMERCIAL_NON_LAND_FIELDS), so it correctly stays sent — not asserted here.
    expect(payload.bedrooms).toBeUndefined();
    expect(payload.bathrooms).toBeUndefined();
    expect(payload.totalFloors).toBeUndefined();
    expect(payload.propertyType).toBe('commercial');
  });

  it('saving WITHOUT a type switch still sends the currently-visible fields unchanged (sanity/no-regression)', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      propertyType: 'house',
      hasGarden: true,
      propertyAge: 'NEW',
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByText('Water source')).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.hasGarden).toBe(true);
    expect(payload.propertyAge).toBe('NEW');
    expect(payload.propertyType).toBe('house');
  });

  it('code-review follow-up (last gate): switching apartment sale→rent hides ownershipType (sale-gated) and omits it from the PUT payload', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      propertyType: 'apartment',
      listingPurpose: 'sale',
      ownershipType: 'FREEHOLD',
    });

    renderEditListing();

    // ownershipType is visible for apartment+sale (RESIDENCE_SHARED_FIELDS).
    await waitFor(() => {
      expect(screen.getByText('Ownership type')).toBeInTheDocument();
    });

    // Switch purpose to Rent — ownershipType is sale-gated for apartment/house/villa,
    // so it must disappear from the DOM even though React state still holds 'FREEHOLD'.
    await user.click(screen.getByRole('button', { name: 'For Rent' }));

    await waitFor(() => {
      expect(screen.queryByText('Ownership type')).not.toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];

    // The last gate (this fix): ownershipType must now be omitted (undefined), not
    // resent as the stale 'FREEHOLD' state — sending it would be REJECTED 400 by the
    // backend for a rent listing of this type.
    expect(payload.ownershipType).toBeUndefined();
    expect(payload.listingPurpose).toBe('rent');
  });
});

// ---------------------------------------------------------------------------
// M38-13A (#1626) code-review follow-up — HARD no-regression proof: per-visibility
// gating must NOT strip legitimate commercial fields when editing a commercial-family
// listing. Proves the fieldVisible('...') gate is PER-TYPE-VISIBILITY (send when
// visible for the listing's OWN type), not a blanket field removal.
// ---------------------------------------------------------------------------

describe('EditListing — M38-13A (#1626) no-regression: commercial fields preserved on save', () => {
  it('saving a commercial_building listing with its type-appropriate fields set still sends every visible commercial field in the payload', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      propertyType: 'commercial_building',
      listingPurpose: 'sale',
      landArea: 5000,
      landAreaUnit: 'sqft',
      builtArea: 3000,
      totalFloors: 4,
      numberOfUnits: 12,
      furnishingStatus: 'furnished',
      washrooms: 2,
      parkingCount: 3,
      roadFrontageFt: 40,
      commercialUsage: 'Retail showroom',
    });

    renderEditListing();

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalled(); // rendered without navigating away
    });

    // Save without changing anything — every field visible for commercial_building
    // (per CONFIG_MAP: totalFloors, numberOfUnits, furnishingStatus, washrooms,
    // parkingCount, roadFrontageFt, commercialUsage) must still be present.
    const saveBtn = await screen.findByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];

    expect(payload.totalFloors).toBe(4);
    expect(payload.numberOfUnits).toBe(12);
    expect(payload.furnishingStatus).toBe('furnished');
    expect(payload.washrooms).toBe(2);
    expect(payload.parkingCount).toBe(3);
    expect(payload.roadFrontageFt).toBe(40);
    expect(payload.commercialUsage).toBe('Retail showroom');
    expect(payload.propertyType).toBe('commercial_building');
  });
});

// ---------------------------------------------------------------------------
// M38-13A (#1626) — chip / segmented control rendering + selection (design-spec.md §1).
// Verifies the ToggleGroup-based chip/segmented controls (replacing the plain-number-input
// placeholders) render the correct affordance and that selecting a chip updates the value
// sent on save — the underlying wire value is unchanged, only the control is a chip.
// ---------------------------------------------------------------------------

describe('EditListing — M38-13A chip / segmented controls (design §1)', () => {
  it('BHK chip group: renders 1/2/3/4/5+ chips, pre-selects the current value, and selecting a new chip updates the saved payload', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({ propertyType: 'apartment', bedrooms: 3 });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('chip-group-bedrooms')).toBeInTheDocument();
    });

    const bhkGroup = within(screen.getByTestId('chip-group-bedrooms'));
    // All 5 chip labels present.
    for (const label of ['1', '2', '3', '4', '5+']) {
      expect(bhkGroup.getByRole('radio', { name: label })).toBeInTheDocument();
    }
    // Current value (3) pre-selected.
    expect(bhkGroup.getByRole('radio', { name: '3' })).toHaveAttribute('data-state', 'on');

    await user.click(bhkGroup.getByRole('radio', { name: '5+' }));

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });
    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    // "5+" chip serializes to the same wire value (5) the backend already accepts for bedrooms.
    expect(payload.bedrooms).toBe(5);
  });

  it('Furnishing segmented control: selecting "Furnished" updates the saved payload', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({ propertyType: 'apartment', furnishingStatus: 'unfurnished' });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('chip-group-furnishingStatus')).toBeInTheDocument();
    });

    const furnishingGroup = within(screen.getByTestId('chip-group-furnishingStatus'));
    await user.click(furnishingGroup.getByRole('radio', { name: 'Furnished' }));

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });
    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.furnishingStatus).toBe('furnished');
  });

  it('Amenities multi-chip group: selecting an additional chip adds it to the final saved set (not a delta)', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      propertyType: 'apartment',
      amenities: ['GYM'],
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('chip-group-amenities')).toBeInTheDocument();
    });

    const amenitiesGroup = within(screen.getByTestId('chip-group-amenities'));
    // Previously-selected chip (GYM) is pre-pressed.
    expect(amenitiesGroup.getByRole('button', { name: 'Gym' })).toHaveAttribute('data-state', 'on');

    await user.click(amenitiesGroup.getByRole('button', { name: 'Intercom' }));

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });
    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.amenities).toEqual(expect.arrayContaining(['GYM', 'INTERCOM']));
    expect((payload.amenities as string[]).length).toBe(2);
  });

  it('house→villa (Number of floors chip): Ground/G+1/G+2/G+3/G+4+ chips render for villa and selecting one updates the saved payload', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({ propertyType: 'villa', totalFloors: 1 });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('chip-group-totalFloors')).toBeInTheDocument();
    });

    const floorsGroup = within(screen.getByTestId('chip-group-totalFloors'));
    for (const label of ['Ground', 'G+1', 'G+2', 'G+3', 'G+4+']) {
      expect(floorsGroup.getByRole('radio', { name: label })).toBeInTheDocument();
    }
    expect(floorsGroup.getByRole('radio', { name: 'G+1' })).toHaveAttribute('data-state', 'on');

    await user.click(floorsGroup.getByRole('radio', { name: 'G+2' }));

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });
    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.totalFloors).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// M38-13A (#1626) — per-subtype chip/segmented RENDER matrix (design §1 + §3).
// Verifies, per property subtype (apartment / house / villa / residential_plot) and
// purpose (sale / rent), that the correct chip/segmented affordance renders — and,
// per the hard AC in design §3 ("Plot MUST NOT show apartment/residence-only fields
// ... Apartment MUST NOT show plot-only fields"), that subtype-inappropriate chip
// groups are absent from the DOM entirely (not just empty).
// ---------------------------------------------------------------------------

describe('EditListing — M38-13A per-subtype chip/segmented render matrix', () => {
  it('apartment (sale): renders BHK/Bathrooms/Balconies/Parking chips, Furnishing + Property-status segmented, apartment amenities, special-location chips; does NOT render the house/villa "Number of floors" chip or rent-only chips', async () => {
    mockListingData.current = makeBaseListing({
      propertyType: 'apartment',
      listingPurpose: 'sale',
      bedrooms: 2,
      bathrooms: 2,
      balconies: 1,
      parking2wCount: 1,
      parking4wCount: 0,
      furnishingStatus: 'semi_furnished',
      possessionStatus: 'READY_TO_MOVE',
      amenities: ['GYM'],
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('chip-group-bedrooms')).toBeInTheDocument();
    });

    // Single-select chips present for the residence-shared + apartment-only fields.
    expect(screen.getByTestId('chip-group-bathrooms')).toBeInTheDocument();
    expect(screen.getByTestId('chip-group-balconies')).toBeInTheDocument();
    expect(screen.getByTestId('chip-group-parking2wCount')).toBeInTheDocument();
    expect(screen.getByTestId('chip-group-parking4wCount')).toBeInTheDocument();

    // Segmented controls: Furnishing + Property status (sale + residence only).
    const furnishingGroup = within(screen.getByTestId('chip-group-furnishingStatus'));
    expect(furnishingGroup.getByRole('radio', { name: 'Furnished' })).toBeInTheDocument();
    const statusGroup = within(screen.getByTestId('chip-group-possessionStatus'));
    expect(statusGroup.getByRole('radio', { name: 'Ready to move' })).toBeInTheDocument();
    expect(statusGroup.getByRole('radio', { name: 'Under construction' })).toBeInTheDocument();

    // Multi-select chips: apartment amenity list + special-location views.
    const amenitiesGroup = within(screen.getByTestId('chip-group-amenities'));
    expect(amenitiesGroup.getByRole('button', { name: 'Gym' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beach-facing' })).toBeInTheDocument();

    // House/villa-only "Number of floors" chip must NOT render for apartment
    // (apartment shows a plain "Total Floors" numeric input instead — design §3).
    expect(screen.queryByTestId('chip-group-totalFloors')).not.toBeInTheDocument();

    // Rent-only chips must NOT render on a sale listing.
    expect(screen.queryByTestId('chip-group-availabilityTimeline')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-group-maintenanceIncluded')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Family' })).not.toBeInTheDocument();
  });

  it('house (sale): renders the "Number of floors" chip group + house/villa amenities; does NOT render the apartment-only Balconies chip', async () => {
    mockListingData.current = makeBaseListing({
      propertyType: 'house',
      listingPurpose: 'sale',
      bedrooms: 3,
      bathrooms: 2,
      totalFloors: 1,
      furnishingStatus: 'furnished',
      amenities: ['SOLAR_PANEL'],
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('chip-group-totalFloors')).toBeInTheDocument();
    });

    const floorsGroup = within(screen.getByTestId('chip-group-totalFloors'));
    for (const label of ['Ground', 'G+1', 'G+2', 'G+3', 'G+4+']) {
      expect(floorsGroup.getByRole('radio', { name: label })).toBeInTheDocument();
    }

    expect(screen.getByTestId('chip-group-bedrooms')).toBeInTheDocument();
    expect(screen.getByTestId('chip-group-bathrooms')).toBeInTheDocument();
    expect(screen.getByTestId('chip-group-furnishingStatus')).toBeInTheDocument();

    const amenitiesGroup = within(screen.getByTestId('chip-group-amenities'));
    expect(amenitiesGroup.getByRole('button', { name: 'Solar panel' })).toBeInTheDocument();

    // Apartment-only chip must NOT render for house.
    expect(screen.queryByTestId('chip-group-balconies')).not.toBeInTheDocument();
  });

  it('villa (rent): renders Availability chip + Preferred-tenants multi-chip + Maintenance segmented; does NOT render the sale-only Property-status segmented', async () => {
    mockListingData.current = makeBaseListing({
      propertyType: 'villa',
      listingPurpose: 'rent',
      bedrooms: 4,
      bathrooms: 3,
      totalFloors: 2,
      availabilityTimeline: 'IMMEDIATE',
      preferredTenants: ['FAMILY'],
      maintenanceIncluded: 'true',
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('chip-group-totalFloors')).toBeInTheDocument();
    });

    // Single-select chips still render (residence-shared fields).
    expect(screen.getByTestId('chip-group-bedrooms')).toBeInTheDocument();
    expect(screen.getByTestId('chip-group-bathrooms')).toBeInTheDocument();

    // Rent-only Availability chip + Maintenance segmented.
    const availabilityGroup = within(screen.getByTestId('chip-group-availabilityTimeline'));
    for (const label of ['Immediate', 'Within 15 days', 'Within 30 days', 'After 30 days']) {
      expect(availabilityGroup.getByRole('radio', { name: label })).toBeInTheDocument();
    }
    const maintenanceGroup = within(screen.getByTestId('chip-group-maintenanceIncluded'));
    expect(maintenanceGroup.getByRole('radio', { name: 'Included' })).toBeInTheDocument();
    expect(maintenanceGroup.getByRole('radio', { name: 'Excluded' })).toBeInTheDocument();

    // Preferred-tenants multi-chip (no dedicated testId — located by option label).
    expect(screen.getByRole('button', { name: 'Family' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Students' })).toBeInTheDocument();

    // Sale-only Property-status segmented must NOT render on a rent listing.
    expect(screen.queryByTestId('chip-group-possessionStatus')).not.toBeInTheDocument();
  });

  it('residential_plot (sale): renders ONLY the special-location multi-chip among the shared chip vocabulary; does NOT render any residence-only chip/segmented group (BHK, Bathrooms, Balconies, Furnishing, Number of floors, Parking, Amenities)', async () => {
    mockListingData.current = makeBaseListing({
      propertyType: 'residential_plot',
      listingPurpose: 'sale',
      specialLocationViews: ['SEA_VIEW'],
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sea-view' })).toBeInTheDocument();
    });

    // Hard rule (design §3 AC): plot must not render any residence-only chip/segmented control.
    expect(screen.queryByTestId('chip-group-bedrooms')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-group-bathrooms')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-group-balconies')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-group-furnishingStatus')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-group-totalFloors')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-group-parking2wCount')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-group-parking4wCount')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-group-amenities')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-group-possessionStatus')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-group-availabilityTimeline')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-group-maintenanceIncluded')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Family' })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// M38-13A (#1626) frontend design-parity follow-up — UT-j (design-spec.md
// §prototype_only "video_link"): EditListing continues to load/prefill/save a
// residential listing correctly, and the saved payload never includes a new
// `videoLink` key — the UpdateListingRequest DTO field is `videoUrl` (existing,
// step-2-only); no new payload key was introduced by the residential create-flow work.
// ---------------------------------------------------------------------------

describe('EditListing — residential regression: loads/saves + no stray videoLink payload key', () => {
  it('loads and prefills a residential (house) listing, saves step 1, and the PUT payload has no "videoLink" key', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      propertyType: 'house',
      title: 'Charming 3BHK house',
      locality: 'Manipal',
      bedrooms: 3,
      bathrooms: 2,
    });

    renderEditListing();

    // Prefill proof — the residential fixture values render.
    await waitFor(() => {
      expect(screen.getByDisplayValue('Charming 3BHK house')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('Manipal')).toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.propertyType).toBe('house');
    expect(payload.title).toBe('Charming 3BHK house');
    expect('videoLink' in payload).toBe(false);
  });
});
