/**
 * #2859 B3 — EditListingForm replacement for
 *   e2e/broker-address-reconciliation.spec.ts AR3 (title/locality gate composite, csv11) and
 *   e2e/broker-listing-form.spec.ts P5 (PUT body price after '75 lakh', csv16).
 *
 * Mock harness copied from EditListingForm.commands.test.tsx EXCEPT PriceField, which is
 * the REAL component here (P5a). AddressPicker is a stub that fires onLocalityConfirmed,
 * so the pin pick itself is covered elsewhere (AddressPicker.test.tsx). The PUT is the
 * client request only (mocked useUpdateListing.mutate); persistence is not claimed.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ListingResponse } from '@/hooks/useBrokerListings';

const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockSubmitMutate = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useBrokerListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBrokerListings')>();
  return {
    ...actual,
    useUpdateListing: vi.fn(() => ({ mutate: mockUpdateMutate, isPending: false })),
    useSubmitListing: vi.fn(() => ({ mutate: mockSubmitMutate, isPending: false })),
  };
});
vi.mock('@/hooks/useListingImages', () => ({ useListingImages: vi.fn(() => ({ images: [] })) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/components/broker/StepIndicator', () => ({ StepIndicator: () => null }));
vi.mock('@/components/broker/ImageUploader', () => ({
  ImageUploader: ({ onCanSubmitChange }: { onCanSubmitChange: (v: boolean) => void }) => {
    React.useEffect(() => {
      onCanSubmitChange(true);
    }, [onCanSubmitChange]);
    return <div data-testid="image-uploader-stub" />;
  },
}));
vi.mock('@/components/broker/AddressPicker', () => ({
  AddressPicker: (props: {
    onLocalityConfirmed: (locality: string, lat: number, lng: number) => void;
  }) => (
    <div data-testid="address-picker-stub">
      <button type="button" onClick={() => props.onLocalityConfirmed('Manipal, Udupi', 13.35, 74.75)}>
        confirm-locality
      </button>
    </div>
  ),
}));
vi.mock('@/components/dealer/BoundaryDrawStep', () => ({ BoundaryDrawStep: () => null }));
vi.mock('@/components/poi/PoiManager', () => ({ PoiManager: () => null }));
vi.mock('@/components/broker/AreaField', () => ({ AreaField: () => <div data-testid="area-field" /> }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>
  ),
  SelectTrigger: ({ children, id }: { children: React.ReactNode; id?: string }) => <span id={id}>{children}</span>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
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

import { EditListingForm } from '../EditListingForm';

function makeListing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'listing-2859', status: 'DRAFT', propertyType: 'apartment', title: 'Property in Manipal',
    locality: 'Manipal', price: 5_000_000, description: null, landArea: null, landAreaUnit: null,
    bedrooms: '2', builtArea: 1200, builtAreaUnit: 'sqft', latitude: 13.34, longitude: 74.74,
    addressConfirmed: true, imageCount: 3, firstImageUrl: null, rejectionReason: null, videoUrl: null,
    reraNumber: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    listingPurpose: 'sale', carpetArea: null, carpetAreaUnit: null, floorNumber: null, totalFloors: null,
    furnishingStatus: null, washrooms: null, parkingCount: null, roadFrontageFt: null, commercialUsage: null,
    numberOfUnits: null, monthlyRent: null, securityDepositMonths: null, lockInMonths: null, sellerType: null,
    earnedBadgeCount: 0, areaKey: null, waterSource: null, soilType: null, roadAccess: null,
    cultivationStatus: null, ownershipType: null, surveyNumber: null,
    ...overrides,
  };
}

function renderForm(listing: ListingResponse, step: number) {
  return render(
    <MemoryRouter initialEntries={[`/broker/listings/edit/test-id?step=${step}`]}>
      <Routes>
        <Route path="/broker/listings/edit/:id" element={<EditListingForm listing={listing} />} />
        <Route path="/broker/listings" element={<div>listings-page-marker</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const submitBtn = () => screen.getByRole('button', { name: /submit for review/i, hidden: true });

beforeEach(() => {
  mockUpdateMutate.mockReset();
  mockSubmitMutate.mockReset();
  mockToast.mockClear();
});

describe('EditListingForm — title/locality gate composite (#2859 B3 csv11 AR3i-k)', () => {
  it('a manually edited title without the confirmed locality shows the warning and disables submit; Update title clears both', async () => {
    renderForm(makeListing(), 3);
    const title = document.querySelector<HTMLInputElement>('input#title')!;
    expect(title).toHaveValue('Property in Manipal');

    // step 3: pick confirms the locality; Save & Continue -> step 4 (handleStep3Continue)
    fireEvent.click(screen.getByRole('button', { name: 'confirm-locality' }));
    fireEvent.click(screen.getByRole('button', { name: /save & continue/i }));
    await screen.findByRole('button', { name: /submit for review/i });

    // control: the title still contains the confirmed locality -> no banner, submit enabled
    expect(screen.queryByTestId('title-locality-warning')).not.toBeInTheDocument();
    expect(submitBtn()).toBeEnabled();

    // manual edit (step-1 input stays mounted) that drops the locality -> banner + submit disabled
    fireEvent.change(title, { target: { value: 'Beautiful Property Near Sea' } });
    const banner = await screen.findByTestId('title-locality-warning');
    expect(banner).toHaveTextContent('Your title doesn\'t mention the confirmed location (Manipal).');
    expect(submitBtn()).toBeDisabled();

    // Update title -> banner gone, submit re-enabled, title regenerated with the locality
    fireEvent.click(screen.getByRole('button', { name: 'Update title', hidden: true }));
    await waitFor(() => expect(screen.queryByTestId('title-locality-warning')).not.toBeInTheDocument());
    expect(submitBtn()).toBeEnabled();
    expect(title.value).toContain('Manipal');
    expect(title.value).not.toBe('Beautiful Property Near Sea');
  });
});

describe('EditListingForm — real PriceField save payload (#2859 B3 csv16 P5a)', () => {
  it('typing "75 lakh" then Save & Continue sends price 7,500,000 (was 50 lakh)', async () => {
    const user = userEvent.setup();
    renderForm(makeListing(), 1);
    const price = document.querySelector<HTMLInputElement>('input#price')!;
    expect(price).toHaveValue('50 lakh');
    fireEvent.change(price, { target: { value: '75 lakh' } });
    await user.click(screen.getByRole('button', { name: /save & continue/i }));
    await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
    const payload = mockUpdateMutate.mock.calls[0][0] as { price?: unknown };
    expect(payload.price).toBe(7_500_000);
  });
});
