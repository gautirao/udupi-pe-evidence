/**
 * EditListingForm — ImageUploader always-mounted lifecycle characterization
 * (Issue #1838 PR F, requirement 7 investigation).
 *
 * The issue asked us to INVESTIGATE whether lazy-mounting ImageUploader
 * (only rendering it once the broker visits step 2) would be safe, given
 * the hypothesis: "canSubmitImages (stepper step-2 completion + the
 * allConditionsMet submit gate) is only reported once ImageUploader
 * mounts."
 *
 * VERDICT: CONFIRMED — lazy-mounting would be unsafe. This suite proves it
 * with the REAL ImageUploader + REAL useListingImages (not the inert stub
 * every other EditListingForm.*.test.tsx in this directory uses), backed by
 * a mocked `api.get` that resolves 3 images immediately:
 *
 *   1. PhotosStep's `data-testid="step-2-panel"` wrapper is always mounted
 *      (CSS display:none toggle — EditListingForm.tsx's own CRITICAL
 *      comment), independent of `currentStep`.
 *   2. PhotosStep itself renders ImageUploader whenever `isSubmittable` is
 *      true (steps/PhotosStep.tsx) — NOT gated on `currentStep === 2`.
 *   3. So for a DRAFT/REJECTED listing with >= 3 images already saved,
 *      ImageUploader mounts on the very FIRST render (step 1, before the
 *      broker ever visits step 2), its `useEffect` reports
 *      `onCanSubmitChange(true)` once the image fetch resolves, and
 *      step2Complete (== canSubmitImages) flips true — visible both in the
 *      stepper's own completion gate and in allConditionsMet on Review —
 *      without the broker ever opening the Add Photos step.
 *
 * If ImageUploader were instead mounted only on `currentStep === 2`, a
 * broker reopening an already-complete listing (deep-linked straight to the
 * Review step via `?step=N`, or resuming later) would see step 2 report
 * incomplete and the submit gate stay disabled until they revisited a step
 * they had no reason to touch — a real regression. Hence: KEEP the
 * always-mounted lifecycle (see EditListingForm.tsx's own CRITICAL comment
 * on the step-2-panel wrapper, and steps/PhotosStep.tsx's header comment).
 *
 * Mocking convention: `@/lib/api` is mocked (api.get resolves 3 images)
 * rather than `@/hooks/useListingImages` itself, so the REAL query + the
 * REAL ImageUploader/onCanSubmitChange wiring is exercised end to end. A
 * real QueryClientProvider is supplied (retry: false) since no other
 * EditListingForm suite needs one — they all mock useListingImages/
 * ImageUploader away entirely.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ListingResponse } from '@/hooks/useBrokerListings';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockApiGet = vi.hoisted(() => vi.fn());

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

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// The REAL useListingImages hook is used (not mocked) — only its `@/lib/api`
// dependency is stubbed, so the real useQuery + onCanSubmitChange wiring runs.
vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet, post: vi.fn(), delete: vi.fn(), put: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/components/broker/StepIndicator', () => ({
  StepIndicator: () => null,
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

function makeListing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'listing-1',
    status: 'DRAFT',
    propertyType: 'apartment',
    title: 'Test listing',
    locality: 'Manipal',
    price: 5000000,
    description: null,
    landArea: null,
    landAreaUnit: null,
    bedrooms: 2,
    builtArea: 1200,
    builtAreaUnit: 'sqft',
    latitude: 13.34,
    longitude: 74.74,
    addressConfirmed: true,
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

function renderOnReviewStep(listing: ListingResponse) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/broker/listings/edit/test-id?step=4']}>
        <Routes>
          <Route
            path="/broker/listings/edit/:id"
            element={<EditListingForm listing={listing} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const THREE_IMAGES = [
  { id: 'img-1', url: 'https://example.com/1.jpg', position: 0 },
  { id: 'img-2', url: 'https://example.com/2.jpg', position: 1 },
  { id: 'img-3', url: 'https://example.com/3.jpg', position: 2 },
];

describe('EditListingForm — ImageUploader always-mounted lifecycle (Issue #1838 PR F requirement 7)', () => {
  it('marks step 2 complete (Submit for Review enabled) on initial render — landing directly on Review via ?step=4 — for a listing with >= 3 images, without ever visiting step 2', async () => {
    mockApiGet.mockResolvedValue(THREE_IMAGES);

    renderOnReviewStep(makeListing());

    // Initial render lands on the Review panel (step=4); the step-2 panel
    // (containing the REAL, always-mounted ImageUploader) is display:none
    // but present in the DOM the whole time — never conditionally mounted.
    const submitButton = screen.getByRole('button', { name: 'Submit for Review' });

    // Before the image fetch resolves, canSubmitImages is still its initial
    // `false` (useEditListingUiState's default) — the gate is genuinely
    // driven by ImageUploader's report, not pre-seeded.
    expect(submitButton).toBeDisabled();

    // Once the mocked fetch resolves with 3 images, ImageUploader's
    // useEffect reports onCanSubmitChange(true) — with the broker never
    // having navigated to currentStep === 2.
    await waitFor(() => expect(submitButton).toBeEnabled());

    expect(mockApiGet).toHaveBeenCalledWith('/api/listings/test-id/images');
  });
});
