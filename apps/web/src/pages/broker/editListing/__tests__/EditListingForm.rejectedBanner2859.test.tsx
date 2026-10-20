/**
 * #2859 B2 (handoff 285902) W3 — the broker's edit page for a REJECTED listing.
 * Replaces e2e/listing-rejection-resubmit.spec.ts RR1.5 (#title renders) and RR1.6 ('Rejection reason:'
 * alert) (csv199). Rendered from a ListingResponse prop (the real edit route + GET is not exercised).
 * Mock harness copied from EditListingForm.titleLocality2859.test.tsx (B3).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ListingResponse } from '@/hooks/useBrokerListings';

vi.mock('@/hooks/useBrokerListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBrokerListings')>();
  return {
    ...actual,
    useUpdateListing: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
    useSubmitListing: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  };
});
vi.mock('@/hooks/useListingImages', () => ({ useListingImages: vi.fn(() => ({ images: [] })) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/broker/StepIndicator', () => ({ StepIndicator: () => null }));
vi.mock('@/components/broker/ImageUploader', () => ({ ImageUploader: () => <div data-testid="image-uploader-stub" /> }));
vi.mock('@/components/broker/AddressPicker', () => ({ AddressPicker: () => <div data-testid="address-picker-stub" /> }));
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
  MapContainer: () => null, TileLayer: () => null, Marker: () => null, Popup: () => null,
  useMap: () => ({ flyTo: vi.fn(), invalidateSize: vi.fn(), fitBounds: vi.fn() }),
  useMapEvents: () => null, Circle: () => null, Polygon: () => null, ZoomControl: () => null,
}));

import { EditListingForm } from '../EditListingForm';

const REASON = 'INCOMPLETE_INFO: Add a floor plan photo';

function makeListing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'listing-2859-b2', status: 'DRAFT', propertyType: 'apartment', title: 'Rejected flat in Manipal',
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
  } as ListingResponse;
}

function renderForm(listing: ListingResponse) {
  return render(
    <MemoryRouter initialEntries={['/broker/listings/edit/listing-2859-b2?step=1']}>
      <Routes>
        <Route path="/broker/listings/edit/:id" element={<EditListingForm listing={listing} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EditListingForm — REJECTED listing edit page (#2859 B2 csv199 RR1.5/RR1.6)', () => {
  it('RR1.5/RR1.6: a REJECTED listing shows #title with its title and the "Rejection reason:" alert with the full reason; a DRAFT listing shows #title but no rejection alert', () => {
    const { unmount } = renderForm(makeListing({ status: 'REJECTED', rejectionReason: REASON }));
    expect(document.querySelector<HTMLInputElement>('#title')).toHaveValue('Rejected flat in Manipal');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(`Rejection reason: ${REASON}`);
    unmount();

    // control: same listing, not rejected
    renderForm(makeListing({ status: 'DRAFT', rejectionReason: null, title: 'Draft flat in Manipal' }));
    expect(document.querySelector<HTMLInputElement>('#title')).toHaveValue('Draft flat in Manipal');
    expect(screen.queryByText(/Rejection reason:/)).not.toBeInTheDocument();
  });
});
