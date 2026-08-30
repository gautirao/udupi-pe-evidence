/**
 * EditListing — commercial-exclusive fields tests (Issue #1838 slice-5b)
 *
 * Primary regression anchor for useCommercialFields() extraction. Authored
 * baseline-first against the UNMODIFIED component; must stay GREEN after
 * the state-ownership extraction into useCommercialFields.ts.
 *
 * (a) Prefill round-trip: a commercial_building listing with all 5
 *     commercial fields set renders those values in the corresponding inputs.
 * (b) null -> '' handling: a listing with all 5 fields null renders empty
 *     inputs (not '0'/'null').
 * (c) Save-payload round-trip: editing + submitting step 1 sends the 5
 *     commercial fields to the mocked update mutation with correct coercion
 *     (numeric -> number, commercialUsage trimmed).
 * (d) Type-scoping: numberOfUnits is hidden for base 'commercial' but shown
 *     for commercial_building (fieldVisible gate, mirrors CONFIG_MAP).
 *
 * #2281 [#1684 parity] test-update note: `getByLabelText(/washrooms/i)` was
 * changed to the exact string `getByLabelText('Washrooms')`. Restoring the 28
 * commercial subtype-gated fields makes "Public washrooms"/"Private washrooms"
 * ALSO visible for a resolved commercial_building fixture (BUILDING subtype),
 * so the old loose regex now matches 3 elements and getByLabelText throws
 * "multiple elements found". This is the intended, spec'd behaviour change
 * (parity restoration), not a workaround for a bug — the exact string still
 * targets the pre-existing legacy "Washrooms" field these tests exercise.
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

// Controllable listing data — tests mutate .current before render
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

// Layout / UI stubs
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
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
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

/**
 * #2281 — the mocked `@/components/ui/select` above renders SelectTrigger's
 * `id` on a plain `<span>` (not the real `<select>`), so `getByLabelText` (which
 * requires a labellable control) cannot resolve a Select-based field the way it
 * resolves a real `<Input id>`. The existing EditListing.agri.test.tsx suite hits
 * the same constraint and works around it with `container.querySelectorAll('select')`
 * positional lookups; this helper instead finds the `<select>` via DOM proximity to
 * its visible `<Label>` text (each Select field is `<div class="space-y-2"><Label>
 * {text}</Label><Select>...</Select></div>` — a same-wrapper sibling), which is more
 * resilient to field-ordering changes than a positional index.
 */
function selectNearLabel(labelText: string): HTMLSelectElement {
  const label = screen.getByText(labelText);
  const wrapper = label.closest('div');
  const select = wrapper?.querySelector('select');
  if (!select) {
    throw new Error(`selectNearLabel: no <select> found in the same wrapper as label "${labelText}"`);
  }
  return select as HTMLSelectElement;
}

/** Base listing fixture — status DRAFT so it's editable (not locked). */
function makeBaseListing(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-id',
    status: 'DRAFT',
    propertyType: 'commercial_building',
    title: 'Test Commercial Listing',
    locality: 'Manipal',
    price: 15000000,
    description: 'A test commercial listing',
    landArea: 5,
    landAreaUnit: 'cent',
    bedrooms: null,
    builtArea: 4000,
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
    ...overrides,
  };
}

beforeEach(() => {
  mockUpdateMutate.mockReset();
  mockNavigate.mockReset();
  mockListingData.current = null;
});

// ── (a) Prefill round-trip: 5 commercial fields load into inputs ────────────

describe('EditListing — commercial (a) Prefill: existing values pre-populate inputs', () => {
  it('reflects washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits', async () => {
    mockListingData.current = makeBaseListing({
      washrooms: 2,
      parkingCount: 4,
      roadFrontageFt: 50.5,
      commercialUsage: 'Office',
      numberOfUnits: 3,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText('Washrooms')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Washrooms')).toHaveValue(2);
    expect(screen.getByLabelText(/parking spots/i)).toHaveValue(4);
    expect(screen.getByLabelText(/road frontage/i)).toHaveValue(50.5);
    expect(screen.getByLabelText(/usage \/ business type/i)).toHaveValue('Office');
    expect(screen.getByLabelText(/number of units/i)).toHaveValue(3);
  });
});

// ── (b) null -> '' handling ────────────────────────────────────────────────

describe('EditListing — commercial (b) null -> empty: unset fields render empty, not 0/null', () => {
  it('renders empty inputs (not "0" or "null") when all 5 commercial fields are null', async () => {
    mockListingData.current = makeBaseListing({
      washrooms: null,
      parkingCount: null,
      roadFrontageFt: null,
      commercialUsage: null,
      numberOfUnits: null,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText('Washrooms')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Washrooms')).toHaveValue(null);
    expect(screen.getByLabelText(/parking spots/i)).toHaveValue(null);
    expect(screen.getByLabelText(/road frontage/i)).toHaveValue(null);
    expect(screen.getByLabelText(/usage \/ business type/i)).toHaveValue('');
    expect(screen.getByLabelText(/number of units/i)).toHaveValue(null);
  });
});

// ── (c) Save-payload round-trip ──────────────────────────────────────────────

describe('EditListing — commercial (c) Save: changed values reach mutate with correct coercion', () => {
  it('sends the 5 commercial fields to useUpdateListing.mutate with numeric coercion and trimmed text', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      washrooms: null,
      parkingCount: null,
      roadFrontageFt: null,
      commercialUsage: null,
      numberOfUnits: null,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText('Washrooms')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Washrooms'), '3');
    await user.type(screen.getByLabelText(/parking spots/i), '5');
    await user.type(screen.getByLabelText(/road frontage/i), '42.5');
    await user.type(screen.getByLabelText(/usage \/ business type/i), '  Retail Store  ');
    await user.type(screen.getByLabelText(/number of units/i), '7');

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.washrooms).toBe(3);
    expect(payload.parkingCount).toBe(5);
    expect(payload.roadFrontageFt).toBe(42.5);
    expect(payload.commercialUsage).toBe('Retail Store');
    expect(payload.numberOfUnits).toBe(7);
  });
});

// ── (d) Type-scoping: numberOfUnits hidden for base 'commercial' ────────────

describe('EditListing — commercial (d) Type-scoping: numberOfUnits visibility gate', () => {
  it('does NOT render numberOfUnits input for base "commercial" propertyType', async () => {
    mockListingData.current = makeBaseListing({
      propertyType: 'commercial',
      numberOfUnits: null,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText('Washrooms')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText(/number of units/i)).not.toBeInTheDocument();
  });

  it('DOES render numberOfUnits input for "commercial_building" propertyType', async () => {
    mockListingData.current = makeBaseListing({
      propertyType: 'commercial_building',
      numberOfUnits: null,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText('Washrooms')).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/number of units/i)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// #2281 [#1684 parity] — the 28 commercial subtype-gated fields.
// ═════════════════════════════════════════════════════════════════════════

/**
 * A commercial_building fixture (resolves to BUILDING subtype) with every
 * non-subtype-gated field null, PLUS the 28 subtype-gated keys set to
 * representative values. Individual tests override propertyType/
 * commercialSubtype/values as needed.
 */
function makeCommercialListing(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return makeBaseListing({
    propertyType: 'commercial_building',
    commercialSubtype: null,
    floorChoice: null,
    hubType: null,
    floorMode: null,
    powerLoadKva: null,
    occupancyStatus: null,
    officeSeats: null,
    officeCabins: null,
    officeMeetingRooms: null,
    warehouseClearHeightFt: null,
    warehouseLoadingBays: null,
    warehouseTruckAccess: null,
    warehouseFlooring: null,
    commercialZoning: null,
    commercialOwnership: null,
    commercialApprovals: null,
    washroomsPublic: null,
    washroomsPrivate: null,
    parkingPublicCount: null,
    parkingPrivateCount: null,
    commercialFurnishingStatus: null,
    utilities: null,
    suitableUses: null,
    commercialAvailability: null,
    commercialAreaUnit: null,
    expectedRentalYieldPct: null,
    currentMonthlyIncomePaise: null,
    leaseTermMonths: null,
    leaseEscalationPct: null,
    listingPurpose: 'sale',
    ...overrides,
  });
}

// ── AC1 — OFFICE subtype: prefill + render ──────────────────────────────

describe('EditListing — commercial (#2281 AC1) OFFICE subtype fields render + hydrate', () => {
  it('renders officeSeats/officeCabins/officeMeetingRooms with hydrated stored values', async () => {
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial',
      commercialSubtype: 'OFFICE',
      officeSeats: 12,
      officeCabins: 3,
      officeMeetingRooms: 2,
      floorChoice: 'FIRST_FLOOR',
      hubType: 'IT_PARK',
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText('Seats')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Seats')).toHaveValue(12);
    expect(screen.getByLabelText('Cabins')).toHaveValue(3);
    expect(screen.getByLabelText('Meeting rooms')).toHaveValue(2);
    expect(selectNearLabel('Floor')).toHaveValue('FIRST_FLOOR');
    expect(selectNearLabel('Location type')).toHaveValue('IT_PARK');
  });
});

// ── AC2 — WAREHOUSE subtype: prefill + render ───────────────────────────

describe('EditListing — commercial (#2281 AC2) WAREHOUSE subtype fields render + hydrate', () => {
  it('renders warehouse-only fields with hydrated stored values, including the boolean truck-access tri-state', async () => {
    mockListingData.current = makeCommercialListing({
      propertyType: 'warehouse',
      warehouseClearHeightFt: 18.5,
      warehouseLoadingBays: 4,
      warehouseTruckAccess: true,
      warehouseFlooring: 'EPOXY_COATED',
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText('Clear height (ft)')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Clear height (ft)')).toHaveValue(18.5);
    expect(screen.getByLabelText('Loading bays')).toHaveValue(4);
    expect(selectNearLabel('Truck access')).toHaveValue('true');
    expect(selectNearLabel('Flooring')).toHaveValue('EPOXY_COATED');
    // OFFICE/SHOP-only fields must not render for WAREHOUSE.
    expect(screen.queryByLabelText('Seats')).not.toBeInTheDocument();
    expect(screen.queryByText('Floor')).not.toBeInTheDocument();
  });
});

// ── AC3 — SHOP subtype: prefill + render ────────────────────────────────

describe('EditListing — commercial (#2281 AC3) SHOP subtype fields render + hydrate', () => {
  it('renders floorChoice/hubType/occupancyStatus with hydrated stored values', async () => {
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial',
      commercialSubtype: 'SHOP',
      floorChoice: 'GROUND_FLOOR',
      hubType: 'MALL',
      occupancyStatus: 'VACANT',
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByText('Floor')).toBeInTheDocument();
    });

    expect(selectNearLabel('Floor')).toHaveValue('GROUND_FLOOR');
    expect(selectNearLabel('Location type')).toHaveValue('MALL');
    expect(selectNearLabel('Occupancy status')).toHaveValue('VACANT');
    // OFFICE-only field must not render for SHOP.
    expect(screen.queryByLabelText('Seats')).not.toBeInTheDocument();
  });
});

// ── AC11 — BUILDING and LAND subtype coverage (qa-fast-identified gap) ──

describe('EditListing — commercial (#2281 AC11) BUILDING subtype fields render + hydrate', () => {
  it('renders floorMode/powerLoadKva (BUILDING-only) plus occupancyStatus (SHOP+BUILDING)', async () => {
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial_building',
      floorMode: 'GF_PLUS_1',
      powerLoadKva: 25.5,
      occupancyStatus: 'PARTLY_OCCUPIED',
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByText('Floors available')).toBeInTheDocument();
    });

    expect(selectNearLabel('Floors available')).toHaveValue('GF_PLUS_1');
    expect(screen.getByLabelText('Power load (KVA)')).toHaveValue(25.5);
    expect(selectNearLabel('Occupancy status')).toHaveValue('PARTLY_OCCUPIED');
    // WAREHOUSE/LAND-only fields must not render for BUILDING.
    expect(screen.queryByLabelText('Clear height (ft)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Zoning')).not.toBeInTheDocument();
  });
});

describe('EditListing — commercial (#2281 AC11) LAND subtype fields render + hydrate', () => {
  it('renders commercialZoning/commercialOwnership/commercialApprovals (LAND-only), omits built-space fields', async () => {
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial_land',
      commercialZoning: 'Commercial zone A',
      commercialOwnership: 'FREEHOLD',
      commercialApprovals: 'Building plan approved',
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText('Zoning')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Zoning')).toHaveValue('Commercial zone A');
    expect(selectNearLabel('Ownership')).toHaveValue('FREEHOLD');
    expect(screen.getByLabelText('Approvals')).toHaveValue('Building plan approved');
    // Built-space fields (washrooms/parking/furnishing/utilities) are excluded for LAND.
    expect(screen.queryByLabelText('Public washrooms')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-group-utilities')).not.toBeInTheDocument();
    // suitableUses/commercialAvailability/commercialAreaUnit ARE shown for LAND.
    expect(screen.getByTestId('chip-group-suitable-uses')).toBeInTheDocument();
    expect(screen.getByText('Availability')).toBeInTheDocument();
  });
});

// ── AC5 / F2 — null / unrecognized stored subtype: safe, no crash, nothing subtype-gated renders ──

describe('EditListing — commercial (#2281 AC5/F2) null/unrecognized stored commercialSubtype', () => {
  it('null commercialSubtype (legacy V102 row): renders with NO crash and NONE of the 28 subtype-gated fields visible', async () => {
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial',
      commercialSubtype: null,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByText('Is this a shop or an office?')).toBeInTheDocument();
    });

    // Representative sample spanning every subtype-gated group, incl. the
    // 13 keys F2 warns would flip TRUE if null were not normalised to undefined.
    expect(screen.queryByLabelText('Seats')).not.toBeInTheDocument();
    expect(screen.queryByText('Floor')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Zoning')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Public washrooms')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-group-suitable-uses')).not.toBeInTheDocument();
    expect(screen.queryByText('Availability')).not.toBeInTheDocument();
    // The explicit SHOP/OFFICE chooser itself still renders — it's how the broker resolves
    // it. Asserted via the mocked Select's `data-select-value` attribute (set directly from
    // the React `value` prop) rather than the native <select>.value, because the mocked
    // <select> has no blank placeholder <option>, so an unset value falls back to the
    // browser's "select the first option" behaviour — a test-mock quirk, not a real app bug
    // (the real Radix-based Select renders its placeholder text instead).
    expect(selectNearLabel('Is this a shop or an office?')).toHaveAttribute('data-select-value', 'empty');
  });

  it('unrecognized legacy string commercialSubtype: same safe no-crash, nothing subtype-gated renders', async () => {
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial',
      commercialSubtype: 'RETAIL_KIOSK', // pre-#1684 legacy free-text value, not in the enum
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByText('Is this a shop or an office?')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Seats')).not.toBeInTheDocument();
    expect(screen.queryByText('Floor')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Zoning')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Public washrooms')).not.toBeInTheDocument();
    // The unrecognized value must not leak into the SHOP/OFFICE chooser either
    // (see the sibling test above for why `data-select-value` is used, not `.value`).
    expect(selectNearLabel('Is this a shop or an office?')).toHaveAttribute('data-select-value', 'empty');
  });
});

// ── AC12 — purpose-gated financial pairs ────────────────────────────────

describe('EditListing — commercial (#2281 AC12) purpose-gated financial fields', () => {
  it('sale purpose: shows expectedRentalYieldPct/currentMonthlyIncomePaise, hides lease fields', async () => {
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial_building',
      listingPurpose: 'sale',
      expectedRentalYieldPct: 5.5,
      currentMonthlyIncomePaise: 25000,
      leaseTermMonths: 24,
      leaseEscalationPct: 5,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText('Expected rental yield (%)')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Expected rental yield (%)')).toHaveValue(5.5);
    expect(screen.getByLabelText('Current monthly income (₹)')).toHaveValue(25000);
    expect(screen.queryByLabelText('Lease term (months)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Lease escalation (%)')).not.toBeInTheDocument();
  });

  it('rent purpose: shows leaseTermMonths/leaseEscalationPct, hides sale-only financials', async () => {
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial_building',
      listingPurpose: 'rent',
      expectedRentalYieldPct: 5.5,
      currentMonthlyIncomePaise: 25000,
      leaseTermMonths: 24,
      leaseEscalationPct: 5,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText('Lease term (months)')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Lease term (months)')).toHaveValue(24);
    expect(screen.getByLabelText('Lease escalation (%)')).toHaveValue(5);
    expect(screen.queryByLabelText('Expected rental yield (%)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Current monthly income (₹)')).not.toBeInTheDocument();
  });

  it('changing listing purpose mid-edit (sale -> rent via the UI toggle) swaps visibility live', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial_building',
      listingPurpose: 'sale',
      expectedRentalYieldPct: 5.5,
      currentMonthlyIncomePaise: 25000,
      leaseTermMonths: 24,
      leaseEscalationPct: 5,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText('Expected rental yield (%)')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Lease term (months)')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'For Rent' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Lease term (months)')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Expected rental yield (%)')).not.toBeInTheDocument();
  });
});

// ── AC13 — explicit SUBTYPE switch (SHOP -> OFFICE) while propertyType stays 'commercial' ──

describe('EditListing — commercial (#2281 AC13) explicit subtype switch SHOP -> OFFICE', () => {
  it('switching the SHOP/OFFICE chooser removes old-subtype fields from the DOM and adds new-subtype fields', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial',
      commercialSubtype: 'SHOP',
      occupancyStatus: 'VACANT', // SHOP + BUILDING only — NOT OFFICE
      floorChoice: 'GROUND_FLOOR', // SHOP + OFFICE shared
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByText('Occupancy status')).toBeInTheDocument();
    });
    // Pre-switch: SHOP-visible field present, OFFICE-only field absent.
    expect(screen.getByText('Occupancy status')).toBeInTheDocument();
    expect(screen.queryByLabelText('Seats')).not.toBeInTheDocument();

    await user.selectOptions(selectNearLabel('Is this a shop or an office?'), 'OFFICE');

    await waitFor(() => {
      expect(screen.getByLabelText('Seats')).toBeInTheDocument();
    });
    // Post-switch: old-subtype-only field GONE, new-subtype field present.
    expect(screen.queryByText('Occupancy status')).not.toBeInTheDocument();
    // floorChoice is shared by both SHOP and OFFICE, so it stays visible.
    expect(screen.getByText('Floor')).toBeInTheDocument();
  });

  it('the PUT payload omits the old subtype field and includes the new one after the switch', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial',
      commercialSubtype: 'SHOP',
      occupancyStatus: 'VACANT',
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByText('Occupancy status')).toBeInTheDocument();
    });

    await user.selectOptions(selectNearLabel('Is this a shop or an office?'), 'OFFICE');

    await waitFor(() => {
      expect(screen.getByLabelText('Seats')).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText('Seats'), '8');

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.occupancyStatus).toBeUndefined();
    expect(payload.officeSeats).toBe(8);
    expect(payload.commercialSubtype).toBe('OFFICE');
  });
});

// ── AC8 (component level) — utilities/suitableUses touched-tracking drives the real chip UI ──

describe('EditListing — commercial (#2281 AC8) utilities touched-tracking via the real multi-select UI', () => {
  it('never touched: a hydrated stored set is NOT resent on save (omitted, backend leaves rows intact)', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial_building',
      utilities: ['POWER', 'CCTV'],
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('chip-group-utilities')).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });
    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.utilities).toBeUndefined();
  });

  it('user interaction (touched): sends the COMPLETE current array, not a partial delta', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial_building',
      utilities: ['POWER'],
    });

    renderEditListing();

    const utilitiesGroup = await screen.findByTestId('chip-group-utilities');
    // Add a second utility — the group must now hold BOTH the pre-existing
    // hydrated value and the newly added one (the complete set).
    await user.click(within(utilitiesGroup).getByRole('button', { name: 'CCTV' }));

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });
    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.utilities).toEqual(expect.arrayContaining(['POWER', 'CCTV']));
    expect((payload.utilities as string[]).length).toBe(2);
  });

  it('user clears the last chip (touched, now empty): sends [] — an explicit delete, never omitted', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial_building',
      utilities: ['POWER'],
    });

    renderEditListing();

    const utilitiesGroup = await screen.findByTestId('chip-group-utilities');
    // Toggling the already-selected 'Power' chip off clears the set to [].
    await user.click(within(utilitiesGroup).getByRole('button', { name: 'Power' }));

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });
    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.utilities).toEqual([]);
  });
});

// ── Numeric round-trip — 0 is a real value (not falsy-dropped), floats and integers preserved ──

describe('EditListing — commercial (#2281) numeric round-trip edge cases', () => {
  // #2293 (found during #2281 QA) — `intOrUndef`/`floatOrUndef`
  // (src/lib/listing-utils.ts) used to require `n > 0`, so a legitimate value of
  // exactly 0 was indistinguishable from "not specified" and silently dropped to
  // `undefined`. This affected every numeric field in buildUpdatePayload.ts
  // (washrooms, parkingCount, floorNumber, bathrooms, ... and the 28 #2281 fields:
  // officeSeats, officeCabins, officeMeetingRooms, warehouseLoadingBays,
  // powerLoadKva, etc.). Fixed in #2293 — intOrUndef/floatOrUndef now preserve any
  // finite number, including 0. This test proves the round-trip.
  it('officeSeats: 0 hydrates as "0" (not empty) and round-trips as the number 0', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial',
      commercialSubtype: 'OFFICE',
      officeSeats: 0,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText('Seats')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Seats')).toHaveValue(0);

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });
    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.officeSeats).toBe(0);
  });

  it('warehouseClearHeightFt: a float (12.5) round-trips exactly, not truncated', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeCommercialListing({
      propertyType: 'warehouse',
      warehouseClearHeightFt: 12.5,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText('Clear height (ft)')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Clear height (ft)')).toHaveValue(12.5);

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });
    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.warehouseClearHeightFt).toBe(12.5);
  });

  it('currentMonthlyIncomePaise: sent as an integer, never a raw/comma-formatted string', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeCommercialListing({
      propertyType: 'commercial_building',
      listingPurpose: 'sale',
      currentMonthlyIncomePaise: null,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText('Current monthly income (₹)')).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText('Current monthly income (₹)'), '45000');

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });
    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.currentMonthlyIncomePaise).toBe(45000);
    expect(typeof payload.currentMonthlyIncomePaise).toBe('number');
  });
});
