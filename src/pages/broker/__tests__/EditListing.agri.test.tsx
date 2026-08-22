/**
 * EditListing — agricultural_land structured fields tests (Issue #1458)
 *
 * (a) Load: edit form loads existing values for all 4 structured agri fields.
 * (b) Save: changed values are passed to useUpdateListing.mutate.
 * (c) Null load: null/absent values load safely — no crash, controls show placeholder.
 * (d) Residential unaffected: agri section absent for non-agri propertyType.
 * (e) Legacy waterSource preserved: non-enum waterSource value is kept in payload
 *     when saved without changing.
 * (f) Change from legacy: selecting an enum value replaces the legacy value.
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

// shadcn Select stub — same pattern as NewListing.agri.test.tsx
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
    propertyType: 'agricultural_land',
    title: 'Test Agri Listing',
    locality: 'Manipal',
    price: 5000000,
    description: 'A test agri listing',
    landArea: 2.5,
    landAreaUnit: 'acre',
    bedrooms: null,
    builtArea: null,
    builtAreaUnit: null,
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
    agriConversionStatus: null,
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

/** Get the agri-fields section (throws if absent). */
function getAgriSection(): HTMLElement {
  return screen.getByTestId('agri-fields-section');
}

/** Get all native <select> elements within the agri section. */
function getAgriSelects(): NodeListOf<HTMLSelectElement> {
  return getAgriSection().querySelectorAll('select');
}

beforeEach(() => {
  mockUpdateMutate.mockReset();
  mockNavigate.mockReset();
  mockListingData.current = null;
});

// ── (a) Load: existing values pre-populate the 4 structured fields ─────────

describe('EditListing — agri (a) Load: existing values pre-populate selects', () => {
  it('reflects landCategory, farmhouseAvailable, fencingDone, waterSource in Select controls', async () => {
    mockListingData.current = makeBaseListing({
      landCategory: 'FARMLAND',
      farmhouseAvailable: true,
      fencingDone: false,
      waterSource: 'BOREWELL',
    });

    renderEditListing();

    // Wait for the agri section to appear (listing loaded, propertyType = agricultural_land)
    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const selects = getAgriSelects();
    // Order in the JSX: landCategory, waterSource, farmhouseAvailable, fencingDone
    // We verify by data-select-value attribute which reflects the controlled value prop.
    const selectValues = Array.from(selects).map((s) => s.getAttribute('data-select-value'));

    expect(selectValues).toContain('FARMLAND');
    expect(selectValues).toContain('BOREWELL');
    expect(selectValues).toContain('true');
    expect(selectValues).toContain('false');
  });
});

// ── (b) Save: changed values reach useUpdateListing.mutate ───────────────────

describe('EditListing — agri (b) Save: changed values passed to mutate', () => {
  it('calls mutate with updated landCategory when changed and Save & Continue clicked', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      landCategory: 'FARMLAND',
      farmhouseAvailable: true,
      fencingDone: false,
      waterSource: 'BOREWELL',
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    // Find the landCategory select: it has data-select-value="FARMLAND"
    const agriSection = getAgriSection();
    const landCategorySelect = Array.from(agriSection.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-select-value') === 'FARMLAND',
    ) as HTMLSelectElement;
    expect(landCategorySelect).toBeTruthy();

    await user.selectOptions(landCategorySelect, 'PLANTATION');

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.landCategory).toBe('PLANTATION');
    // Other agri fields should pass through unchanged
    expect(payload.waterSource).toBe('BOREWELL');
    expect(payload.farmhouseAvailable).toBe(true);
    expect(payload.fencingDone).toBe(false);
  });
});

// ── (c) Null load: null fields don't crash; selects show placeholder/unset ──

describe('EditListing — agri (c) Null load: null agri fields load safely', () => {
  it('renders form without crash when all 4 agri fields are null', async () => {
    mockListingData.current = makeBaseListing({
      landCategory: null,
      farmhouseAvailable: null,
      fencingDone: null,
      waterSource: null,
    });

    // Should not throw
    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    // All selects should show 'empty' (no value selected)
    const selects = getAgriSelects();
    const selectValues = Array.from(selects).map((s) => s.getAttribute('data-select-value'));
    // All four structured field selects should be in 'empty' state (no value set)
    // landCategory, waterSource, farmhouseAvailable, fencingDone
    const emptyCount = selectValues.filter((v) => v === 'empty').length;
    expect(emptyCount).toBeGreaterThanOrEqual(4);
  });
});

// ── (d) Residential: agri section absent for non-agri propertyType ───────────

describe('EditListing — agri (d) Residential: agri section absent for apartment', () => {
  it('does NOT render agri-fields-section for apartment propertyType', async () => {
    mockListingData.current = makeBaseListing({
      propertyType: 'apartment',
      // Agri fields irrelevant; set to null to be safe
      landCategory: null,
      farmhouseAvailable: null,
      fencingDone: null,
      waterSource: null,
    });

    renderEditListing();

    // Give React time to render the loaded listing
    await waitFor(() => {
      // The form renders (page-level content visible)
      expect(screen.getByRole('button', { name: /save & continue/i })).toBeInTheDocument();
    });

    expect(screen.queryByTestId('agri-fields-section')).not.toBeInTheDocument();
  });
});

// ── (e) Legacy waterSource preserved on save-without-change ──────────────────

describe('EditListing — agri (e) Legacy waterSource preserved in payload', () => {
  it('keeps non-enum waterSource value in payload when saved without touching the select', async () => {
    const user = userEvent.setup();
    // 'Borewell' is a legacy free-text value (not in the KNOWN_WATER_SOURCES enum)
    mockListingData.current = makeBaseListing({
      waterSource: 'Borewell',
      landCategory: 'FARMLAND',
      farmhouseAvailable: null,
      fencingDone: null,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    // The legacy value should be visible in the select (rendered as a legacy option)
    const agriSection = getAgriSection();
    const waterSourceSelect = Array.from(agriSection.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-select-value') === 'Borewell',
    ) as HTMLSelectElement;
    expect(waterSourceSelect).toBeTruthy();

    // Save without changing the water source
    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    // Legacy value must be preserved — not wiped to undefined
    expect(payload.waterSource).toBe('Borewell');
  });
});

// ── (f) Change from legacy: selecting enum value replaces legacy ──────────────

describe('EditListing — agri (f) Change from legacy waterSource to enum value', () => {
  it('payload contains new enum value when broker selects WELL from legacy Borewell', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      waterSource: 'Borewell',
      landCategory: 'FARMLAND',
      farmhouseAvailable: null,
      fencingDone: null,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    // Find the water source select by its current legacy value
    const agriSection = getAgriSection();
    const waterSourceSelect = Array.from(agriSection.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-select-value') === 'Borewell',
    ) as HTMLSelectElement;
    expect(waterSourceSelect).toBeTruthy();

    // Change to the WELL enum value
    await user.selectOptions(waterSourceSelect, 'WELL');

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.waterSource).toBe('WELL');
  });
});

// ── (g) Boolean save: change farmhouseAvailable AND fencingDone; both reach mutate ──

describe('EditListing — agri (g) Boolean save: changed farmhouseAvailable and fencingDone reach mutate', () => {
  it('payload contains changed farmhouseAvailable=false and fencingDone=true after explicit changes', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      landCategory: 'FARMLAND',
      farmhouseAvailable: true,  // will change → false
      fencingDone: false,        // will change → true
      waterSource: 'BOREWELL',
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const agriSection = getAgriSection();

    // farmhouseAvailable select: initial value 'true' ('true' is unique among agri selects here)
    const farmhouseSelect = Array.from(agriSection.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-select-value') === 'true',
    ) as HTMLSelectElement;
    expect(farmhouseSelect).toBeTruthy();

    // fencingDone select: initial value 'false'
    const fencingSelect = Array.from(agriSection.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-select-value') === 'false',
    ) as HTMLSelectElement;
    expect(fencingSelect).toBeTruthy();

    // Change farmhouse true→false, fencing false→true
    await user.selectOptions(farmhouseSelect, 'false');
    await user.selectOptions(fencingSelect, 'true');

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.farmhouseAvailable).toBe(false); // changed from true — null≠false: this is EXPLICIT false
    expect(payload.fencingDone).toBe(true);          // changed from false
    // Other fields pass through unchanged
    expect(payload.landCategory).toBe('FARMLAND');
    expect(payload.waterSource).toBe('BOREWELL');
  });
});

// ── (i) Issue #1459 — water source includes RIVER and RAIN_FED options ───────

describe('EditListing — agri (i) #1459 water source has RIVER and RAIN_FED options', () => {
  it('renders RIVER option in water source select', async () => {
    mockListingData.current = makeBaseListing({ waterSource: null });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const agriSection = getAgriSection();
    // Water source select is the second select in JSX order (after landCategory)
    const waterSourceSelect = agriSection.querySelectorAll('select')[1] as HTMLSelectElement;

    // RIVER option must be present as a <option value="RIVER">
    const riverOption = waterSourceSelect.querySelector('option[value="RIVER"]');
    expect(riverOption).not.toBeNull();
    expect(riverOption?.textContent).toBe('River');
  });

  it('renders RAIN_FED option in water source select', async () => {
    mockListingData.current = makeBaseListing({ waterSource: null });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const agriSection = getAgriSection();
    const waterSourceSelect = agriSection.querySelectorAll('select')[1] as HTMLSelectElement;

    const rainFedOption = waterSourceSelect.querySelector('option[value="RAIN_FED"]');
    expect(rainFedOption).not.toBeNull();
    expect(rainFedOption?.textContent).toBe('Rain-fed');
  });

  it('selecting RIVER sets waterSource in mutate payload', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({ waterSource: null });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const agriSection = getAgriSection();
    const waterSourceSelect = agriSection.querySelectorAll('select')[1] as HTMLSelectElement;

    await user.selectOptions(waterSourceSelect, 'RIVER');

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.waterSource).toBe('RIVER');
  });
});

// ── (j) Issue #1459 — soil type select uses canonical machine values ───────────

describe('EditListing — agri (j) #1459 soil type canonical select', () => {
  it('renders RED_LATERITE option with display text "Red laterite" (not "RED_LATERITE")', async () => {
    mockListingData.current = makeBaseListing({ soilType: null });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const agriSection = getAgriSection();
    // soilType is the 5th select (index 4): landCategory[0], waterSource[1], farmhouse[2], fencing[3], soilType[4]
    const soilTypeSelect = agriSection.querySelectorAll('select')[4] as HTMLSelectElement;

    const redLateriteOption = soilTypeSelect.querySelector('option[value="RED_LATERITE"]');
    expect(redLateriteOption).not.toBeNull();
    expect(redLateriteOption?.textContent).toBe('Red laterite');
  });

  it('soil type select value attribute holds canonical key "RED_LATERITE" when loaded', async () => {
    mockListingData.current = makeBaseListing({ soilType: 'RED_LATERITE' });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const agriSection = getAgriSection();
    const soilTypeSelect = Array.from(agriSection.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-select-value') === 'RED_LATERITE',
    ) as HTMLSelectElement;

    expect(soilTypeSelect).toBeTruthy();
    // The select's value/data-select-value is the machine key, not the display string
    expect(soilTypeSelect.getAttribute('data-select-value')).toBe('RED_LATERITE');
  });

  it('selecting RED_LATERITE sends "RED_LATERITE" in mutate payload (not "Red laterite")', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({ soilType: null });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const agriSection = getAgriSection();
    const soilTypeSelect = agriSection.querySelectorAll('select')[4] as HTMLSelectElement;

    await user.selectOptions(soilTypeSelect, 'RED_LATERITE');

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.soilType).toBe('RED_LATERITE');
  });

  it('shows a "(legacy)" option for a soil type free-text value not in KNOWN_SOIL_TYPES', async () => {
    // 'Red loam' is a hypothetical legacy free-text value not in the enum
    mockListingData.current = makeBaseListing({ soilType: 'Red loam' });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const agriSection = getAgriSection();
    // The legacy select has data-select-value = 'Red loam'
    const soilTypeSelect = Array.from(agriSection.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-select-value') === 'Red loam',
    ) as HTMLSelectElement;

    expect(soilTypeSelect).toBeTruthy();

    // A legacy option with value="Red loam" and text "Red loam (legacy)" must appear
    const legacyOption = soilTypeSelect.querySelector('option[value="Red loam"]');
    expect(legacyOption).not.toBeNull();
    expect(legacyOption?.textContent).toBe('Red loam (legacy)');
  });
});

// ── (k) Issue #1459 — road access select has canonical options ────────────────

describe('EditListing — agri (k) #1459 road access canonical select', () => {
  it('TARRED_ROAD option has display text "Tarred road"', async () => {
    mockListingData.current = makeBaseListing({ roadAccess: null });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const agriSection = getAgriSection();
    // roadAccess is the 6th select (index 5)
    const roadAccessSelect = agriSection.querySelectorAll('select')[5] as HTMLSelectElement;

    const tarredOption = roadAccessSelect.querySelector('option[value="TARRED_ROAD"]');
    expect(tarredOption).not.toBeNull();
    expect(tarredOption?.textContent).toBe('Tarred road');
  });

  it('KACHCHA_ROAD option has display text "Kachcha road"', async () => {
    mockListingData.current = makeBaseListing({ roadAccess: null });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const agriSection = getAgriSection();
    const roadAccessSelect = agriSection.querySelectorAll('select')[5] as HTMLSelectElement;

    const kachchaOption = roadAccessSelect.querySelector('option[value="KACHCHA_ROAD"]');
    expect(kachchaOption).not.toBeNull();
    expect(kachchaOption?.textContent).toBe('Kachcha road');
  });
});

// ── (l) Issue #1459 — ownership type select has FREEHOLD and INHERITED ────────

describe('EditListing — agri (l) #1459 ownership type select', () => {
  it('FREEHOLD option has display text "Freehold"', async () => {
    mockListingData.current = makeBaseListing({ ownershipType: null });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const agriSection = getAgriSection();
    // ownershipType is the 8th select (index 7):
    // landCategory[0], waterSource[1], farmhouse[2], fencing[3], soilType[4], roadAccess[5], cultivationStatus[6], ownershipType[7]
    const ownershipSelect = agriSection.querySelectorAll('select')[7] as HTMLSelectElement;

    const freeholdOption = ownershipSelect.querySelector('option[value="FREEHOLD"]');
    expect(freeholdOption).not.toBeNull();
    expect(freeholdOption?.textContent).toBe('Freehold');
  });

  it('INHERITED option has display text "Inherited"', async () => {
    mockListingData.current = makeBaseListing({ ownershipType: null });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const agriSection = getAgriSection();
    const ownershipSelect = agriSection.querySelectorAll('select')[7] as HTMLSelectElement;

    const inheritedOption = ownershipSelect.querySelector('option[value="INHERITED"]');
    expect(inheritedOption).not.toBeNull();
    expect(inheritedOption?.textContent).toBe('Inherited');
  });

  it('selecting FREEHOLD sends "FREEHOLD" in mutate payload', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({ ownershipType: null });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const agriSection = getAgriSection();
    const ownershipSelect = agriSection.querySelectorAll('select')[7] as HTMLSelectElement;

    await user.selectOptions(ownershipSelect, 'FREEHOLD');

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.ownershipType).toBe('FREEHOLD');
  });
});

// ── (m) Issue #1459 — full round-trip for all 8 canonical agri selects ────────

describe('EditListing — agri (m) #1459 full canonical round-trip: 8 agri selects', () => {
  it('loads all 8 canonical agri values and they appear in mutate payload unchanged', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      landCategory: 'FARMLAND',
      waterSource: 'RIVER',
      farmhouseAvailable: true,
      fencingDone: false,
      soilType: 'RED_LATERITE',
      roadAccess: 'TARRED_ROAD',
      cultivationStatus: 'ARECA_PLANTATION',
      ownershipType: 'FREEHOLD',
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    // Verify all 8 selects pre-populated correctly
    const agriSection = getAgriSection();
    const selectValues = Array.from(agriSection.querySelectorAll('select')).map(
      (s) => s.getAttribute('data-select-value'),
    );
    expect(selectValues).toContain('FARMLAND');
    expect(selectValues).toContain('RIVER');
    expect(selectValues).toContain('true');
    expect(selectValues).toContain('false');
    expect(selectValues).toContain('RED_LATERITE');
    expect(selectValues).toContain('TARRED_ROAD');
    expect(selectValues).toContain('ARECA_PLANTATION');
    expect(selectValues).toContain('FREEHOLD');

    // Save without changing anything
    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.landCategory).toBe('FARMLAND');
    expect(payload.waterSource).toBe('RIVER');
    expect(payload.farmhouseAvailable).toBe(true);
    expect(payload.fencingDone).toBe(false);
    expect(payload.soilType).toBe('RED_LATERITE');
    expect(payload.roadAccess).toBe('TARRED_ROAD');
    expect(payload.cultivationStatus).toBe('ARECA_PLANTATION');
    expect(payload.ownershipType).toBe('FREEHOLD');
  });
});

// ── (h) Null preserved: unset boolean fields must NOT be coerced to false ───────

describe('EditListing — agri (h) Null preserved: unset farmhouseAvailable and fencingDone not coerced to false', () => {
  it('payload has undefined (not false) for farmhouseAvailable and fencingDone when loaded null and left unchanged', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      landCategory: 'FARMLAND',
      farmhouseAvailable: null, // not specified — must stay undefined in payload
      fencingDone: null,        // not specified — must stay undefined in payload
      waterSource: 'BOREWELL',
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    // Save without touching farmhouseAvailable or fencingDone
    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    // null-loaded fields MUST NOT be coerced to false — the save path maps '' state → undefined
    // so the backend performs no update (field stays null in DB).
    expect(payload.farmhouseAvailable).toBeUndefined();
    expect(payload.fencingDone).toBeUndefined();
  });
});

// ── (i) M38-13A (#1626) no-regression: per-visibility gating must NOT strip ────
// legitimate agri fields when editing an agricultural_land listing. This proves
// the fieldVisible('...') gate added to handleStep1Save is PER-TYPE-VISIBILITY
// (send when visible for the listing's OWN type), not a blanket field removal.

describe('EditListing — M38-13A (#1626) no-regression: agri fields preserved on save', () => {
  it('saving an agricultural_land listing with all agri fields set still sends every visible agri field in the payload', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      propertyType: 'agricultural_land',
      waterSource: 'BOREWELL',
      soilType: 'RED_LATERITE',
      roadAccess: 'TARRED_ROAD',
      cultivationStatus: 'ARECA_PLANTATION',
      ownershipType: 'FREEHOLD',
      surveyNumber: '123/4A',
      landCategory: 'FARMLAND',
      farmhouseAvailable: true,
      fencingDone: false,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    // Save without changing anything — all fields visible for agricultural_land
    // (per CONFIG_MAP's AGRI_FIELDS) must still be present in the PUT payload.
    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];

    expect(payload.waterSource).toBe('BOREWELL');
    expect(payload.soilType).toBe('RED_LATERITE');
    expect(payload.roadAccess).toBe('TARRED_ROAD');
    expect(payload.cultivationStatus).toBe('ARECA_PLANTATION');
    expect(payload.ownershipType).toBe('FREEHOLD');
    expect(payload.surveyNumber).toBe('123/4A');
    expect(payload.landCategory).toBe('FARMLAND');
    expect(payload.farmhouseAvailable).toBe(true);
    expect(payload.fencingDone).toBe(false);
  });
});

// ── (n) Issue #2043 — agriConversionStatus load, save, and null-safety ─────

describe('EditListing — agri (n) #2043 agriConversionStatus load and save', () => {
  it('reflects agriConversionStatus in its Select control on load', async () => {
    mockListingData.current = makeBaseListing({
      agriConversionStatus: 'CONVERSION_APPLIED',
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const selects = getAgriSelects();
    const selectValues = Array.from(selects).map((s) => s.getAttribute('data-select-value'));
    expect(selectValues).toContain('CONVERSION_APPLIED');
  });

  it('renders safely with agriConversionStatus null (no crash, its select is among the empty ones)', async () => {
    mockListingData.current = makeBaseListing({ agriConversionStatus: null });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    // The 9th select (index 8) in JSX order is agriConversionStatus — placed last,
    // after the other 8 canonical agri selects (landCategory[0]..ownershipType[7]).
    const selects = getAgriSelects();
    const conversionStatusSelect = selects[8];
    expect(conversionStatusSelect.getAttribute('data-select-value')).toBe('empty');
  });

  it('calls mutate with updated agriConversionStatus when changed and Save & Continue clicked', async () => {
    const user = userEvent.setup();
    mockListingData.current = makeBaseListing({
      agriConversionStatus: 'NOT_CONVERTED',
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    });

    const agriSection = getAgriSection();
    const conversionStatusSelect = Array.from(agriSection.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-select-value') === 'NOT_CONVERTED',
    ) as HTMLSelectElement;
    expect(conversionStatusSelect).toBeTruthy();

    await user.selectOptions(conversionStatusSelect, 'APPROVED_FOR_CONVERSION');

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.agriConversionStatus).toBe('APPROVED_FOR_CONVERSION');
  });

  it('does not render the agriConversionStatus select (or agri-fields-section at all) for apartment propertyType', async () => {
    mockListingData.current = makeBaseListing({
      propertyType: 'apartment',
      agriConversionStatus: null,
    });

    renderEditListing();

    await waitFor(() => {
      expect(screen.queryByTestId('agri-fields-section')).not.toBeInTheDocument();
    });
  });
});
