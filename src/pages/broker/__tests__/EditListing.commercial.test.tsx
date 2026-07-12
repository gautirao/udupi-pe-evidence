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
      expect(screen.getByLabelText(/washrooms/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/washrooms/i)).toHaveValue(2);
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
      expect(screen.getByLabelText(/washrooms/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/washrooms/i)).toHaveValue(null);
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
      expect(screen.getByLabelText(/washrooms/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/washrooms/i), '3');
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
      expect(screen.getByLabelText(/washrooms/i)).toBeInTheDocument();
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
      expect(screen.getByLabelText(/washrooms/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/number of units/i)).toBeInTheDocument();
  });
});
