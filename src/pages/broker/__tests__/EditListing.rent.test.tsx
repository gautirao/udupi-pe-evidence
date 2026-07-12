/**
 * EditListing — rent-exclusive fields tests (Issue #1838 slice-5c)
 *
 * Primary regression anchor for useRentFields() extraction. Authored
 * baseline-first against the UNMODIFIED component; must stay GREEN after
 * the state-ownership extraction into useRentFields.ts.
 *
 * (a) Prefill round-trip: a rent listing with monthlyRent/securityDepositMonths/
 *     lockInMonths set renders those values in the corresponding inputs.
 * (b) null -> '' handling: a listing with all 3 fields null renders empty
 *     inputs (not '0'/'null').
 * (c) Save-payload round-trip: editing + submitting step 1 sends the 3 rent
 *     fields to the mocked update mutation with int coercion.
 * (d) Purpose-scoping both directions: the rent fixture renders the 'Rent
 *     Details' block; a sale fixture does NOT render it, and the 3 rent
 *     fields are omitted (undefined) from the save payload.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

// shadcn Select stub — same pattern as EditListing.commercial.test.tsx
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

/** Base listing fixture — status DRAFT so it's editable (not locked). */
function makeBaseListing(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-id',
    status: 'DRAFT',
    propertyType: 'apartment',
    title: 'Test Rent Listing',
    locality: 'Manipal',
    price: null,
    description: 'A test rent listing',
    landArea: null,
    landAreaUnit: null,
    bedrooms: null,
    builtArea: null,
    builtAreaUnit: 'sqft',
    latitude: 13.34,
    longitude: 74.74,
    addressConfirmed: false,
    imageCount: 3,
    firstImageUrl: null,
    rejectionReason: null,
    videoUrl: null,
    reraNumber: null,
    listingPurpose: 'rent',
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

// ── (a) Prefill round-trip: 3 rent fields load into inputs ──────────────────

describe('EditListing — rent (a) Prefill: existing values pre-populate inputs', () => {
  it('reflects monthlyRent, securityDepositMonths, lockInMonths', async () => {
    mockListingData.current = makeBaseListing({
      monthlyRent: 15000,
      securityDepositMonths: 10,
      lockInMonths: 12,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText(/monthly rent/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/monthly rent/i)).toHaveValue(15000);
    expect(screen.getByLabelText(/security deposit/i)).toHaveValue(10);
    expect(screen.getByLabelText(/lock-in period/i)).toHaveValue(12);
  });
});

// ── (b) null -> '' handling ────────────────────────────────────────────────

describe('EditListing — rent (b) null -> empty: unset fields render empty, not 0/null', () => {
  it('renders empty inputs (not "0" or "null") when all 3 rent fields are null', async () => {
    mockListingData.current = makeBaseListing({
      monthlyRent: null,
      securityDepositMonths: null,
      lockInMonths: null,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText(/monthly rent/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/monthly rent/i)).toHaveValue(null);
    expect(screen.getByLabelText(/security deposit/i)).toHaveValue(null);
    expect(screen.getByLabelText(/lock-in period/i)).toHaveValue(null);
  });
});

// ── (c) Save-payload round-trip ──────────────────────────────────────────────

describe('EditListing — rent (c) Save: changed values reach mutate with correct coercion', () => {
  it('sends the 3 rent fields to useUpdateListing.mutate with int coercion', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      monthlyRent: null,
      securityDepositMonths: null,
      lockInMonths: null,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText(/monthly rent/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/monthly rent/i), '20000');
    await user.type(screen.getByLabelText(/security deposit/i), '8');
    await user.type(screen.getByLabelText(/lock-in period/i), '6');

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.monthlyRent).toBe(20000);
    expect(payload.securityDepositMonths).toBe(8);
    expect(payload.lockInMonths).toBe(6);
  });
});

// ── (d) Purpose-scoping both directions ──────────────────────────────────────

describe('EditListing — rent (d) Purpose-scoping: Rent Details block + payload gated by isRent', () => {
  it('renders the Rent Details block for a rent listing', async () => {
    mockListingData.current = makeBaseListing({ listingPurpose: 'rent' });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByText(/rent details/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/monthly rent/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/security deposit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/lock-in period/i)).toBeInTheDocument();
  });

  it('does NOT render the Rent Details block for a sale listing, and omits rent fields from the payload', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      listingPurpose: 'sale',
      price: 15000000,
      monthlyRent: null,
      securityDepositMonths: null,
      lockInMonths: null,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByLabelText(/^title$/i)).toBeInTheDocument();
    });

    expect(screen.queryByLabelText(/monthly rent/i)).not.toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.monthlyRent).toBeUndefined();
    expect(payload.securityDepositMonths).toBeUndefined();
    expect(payload.lockInMonths).toBeUndefined();
  });
});
