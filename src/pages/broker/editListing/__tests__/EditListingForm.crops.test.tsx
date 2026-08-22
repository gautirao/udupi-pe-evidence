/**
 * EditListingForm — crops save-path wiring test (Issue #2044 code-review
 * finding N1).
 *
 * EditListingForm.tsx:365 —
 *   `const payloadWithCrops = isAgriListing ? { ...payload, crops } : payload;`
 * — is the ONLY place that merges the edit-flow crop chip state into the PUT
 * request body. buildListingUpdatePayload() (src/lib/editListing/
 * buildUpdatePayload.ts) is out of #2044's allowed-file scope and does not
 * carry `crops` at all. No prior test in this directory (chipGroups,
 * useAgriFields, useEditListingNavigation) exercises the save path, so
 * deleting that line would leave every existing suite green while silently
 * breaking the save half of AC8 (crop round-trip).
 *
 * This suite renders the real EditListingForm (not a stub) so the chip →
 * state → mutate wiring is exercised end to end, following the same
 * mocking convention as the full-form anchors in
 * src/pages/broker/__tests__/EditListing.agri.test.tsx (shadcn Select stub,
 * heavy leaf-component stubs for ImageUploader/AddressPicker/PriceField/
 * AreaField, react-leaflet stub).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ListingResponse } from '@/hooks/useBrokerListings';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mockUpdateMutate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useBrokerListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBrokerListings')>();
  return {
    ...actual,
    useUpdateListing: vi.fn(() => ({
      mutate: mockUpdateMutate,
      isPending: false,
    })),
    useSubmitListing: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
    })),
  };
});

vi.mock('@/hooks/useListingImages', () => ({
  useListingImages: vi.fn(() => ({ images: [] })),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
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

// shadcn Select stub — same pattern as EditListing.agri.test.tsx (Radix
// Select's popover/portal doesn't open via click in jsdom).
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

// ── Import under test ───────────────────────────────────────────────────────

import { EditListingForm } from '../EditListingForm';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Minimal ListingResponse fixture — mirrors useAgriFields.test.ts's
 * makeListing(). `crops` is not declared on ListingResponse (out of #2044's
 * allowed-file scope), so it is spread on afterward as a structural widening
 * — the same pattern useAgriFields.test.ts uses to prove hydrate() reads it.
 */
function makeListing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'listing-1',
    status: 'DRAFT',
    propertyType: 'agricultural_land',
    title: 'Test listing',
    locality: 'Manipal',
    price: 5000000,
    description: null,
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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
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
    sellerType: null,
    earnedBadgeCount: 0,
    areaKey: null,
    waterSource: null,
    soilType: null,
    roadAccess: null,
    cultivationStatus: null,
    ownershipType: null,
    surveyNumber: null,
    ...overrides,
  };
}

function renderForm(listing: ListingResponse) {
  return render(
    <MemoryRouter initialEntries={['/broker/listings/edit/test-id']}>
      <Routes>
        <Route
          path="/broker/listings/edit/:id"
          element={<EditListingForm listing={listing} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUpdateMutate.mockReset();
});

describe('EditListingForm — crops save-path wiring (#2044 review finding N1)', () => {
  it('AGRICULTURAL: toggling the Mango chip on top of a hydrated crop sends the full merged crop set to mutate', async () => {
    const user = userEvent.setup();
    const listing = {
      ...makeListing({ propertyType: 'agricultural_land' }),
      crops: ['COCONUT'],
    };

    renderForm(listing);

    // Wait for the hydration effect to populate the Coconut chip as selected.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Coconut' })).toHaveAttribute(
        'data-state',
        'on',
      );
    });

    await user.click(screen.getByRole('button', { name: 'Mango' }));

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.crops).toEqual(['COCONUT', 'MANGO']);
  });

  it('NON-AGRICULTURAL: the save payload carries no crops key at all', async () => {
    const user = userEvent.setup();
    const listing = makeListing({ propertyType: 'apartment', landArea: null, landAreaUnit: null });

    renderForm(listing);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save & continue/i })).toBeInTheDocument();
    });

    // Crops chips must not even be rendered for a non-agri listing.
    expect(screen.queryByTestId('chip-group-agri-crops')).not.toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect('crops' in payload).toBe(false);
  });
});
