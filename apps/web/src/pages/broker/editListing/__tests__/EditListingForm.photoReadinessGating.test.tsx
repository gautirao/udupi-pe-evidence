/**
 * EditListingForm — photo-readiness gating characterization test
 * (Issue #1838 PR A deliverable #5).
 *
 * Locks in the current wiring of `canSubmitImages` (EditListingForm.tsx:73,
 * a plain `useState(false)`) into the Review step's submit gate:
 *
 *   - `canSubmitImages` is set exclusively via `ImageUploader`'s
 *     `onCanSubmitChange` prop, wired through PhotosStep.tsx:47
 *     (`<ImageUploader listingId={id!} onCanSubmitChange={setCanSubmitImages} />`).
 *   - `allConditionsMet` (EditListingForm.tsx:571) is
 *     `canSubmitImages && !!listing.addressConfirmed && requiredFieldsComplete
 *      && !showTitleLocalityWarning` — i.e. `canSubmitImages` is a hard AND
 *     term, not advisory.
 *   - `allConditionsMet` flows into ReviewStep as a prop and disables the
 *     "Submit for Review" button (ReviewStep.tsx:
 *     `disabled={submitListing.isPending || updateListing.isPending || !allConditionsMet}`).
 *
 * This is a golden-master lock-in, not a correctness claim — PRs B–E must
 * preserve this exact gate (photos not ready => submit disabled; photos
 * ready + every other condition met => submit enabled) unless a later PR
 * explicitly changes it (and updates this test to match).
 *
 * Reuses the mocking convention from EditListingForm.crops.test.tsx /
 * EditListingForm.stepperNavigation.test.tsx (real EditListingForm mounted,
 * heavy leaf components stubbed, shadcn Select stubbed, react-leaflet
 * stubbed). Unlike those files' inert `ImageUploader` stub, this suite's
 * `ImageUploader` mock exposes two buttons that call the real
 * `onCanSubmitChange` prop with `true`/`false`, so the test can drive the
 * real `canSubmitImages` state from outside without reimplementing
 * ImageUploader's own upload-count logic (already covered by
 * ImageUploader.test.tsx / PhotosStep.test.tsx).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ListingResponse } from '@/hooks/useBrokerListings';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockSubmitMutate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useBrokerListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBrokerListings')>();
  return {
    ...actual,
    useUpdateListing: vi.fn(() => ({
      mutate: mockUpdateMutate,
      isPending: false,
    })),
    useSubmitListing: vi.fn(() => ({
      mutate: mockSubmitMutate,
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

// StepIndicator isn't the SUT here — stub to null like EditListingForm.crops.test.tsx,
// since this suite navigates via the `?step=` URL param, not step-click gating
// (already covered by EditListingForm.stepperNavigation.test.tsx).
vi.mock('@/components/broker/StepIndicator', () => ({
  StepIndicator: () => null,
}));

// Exposes the real `onCanSubmitChange` callback via two plain buttons, so the
// test can flip the real `canSubmitImages` state from outside without
// reimplementing ImageUploader's own photo-count logic.
vi.mock('@/components/broker/ImageUploader', () => ({
  ImageUploader: ({
    onCanSubmitChange,
  }: {
    onCanSubmitChange: (canSubmit: boolean) => void;
  }) => (
    <div data-testid="image-uploader-stub">
      <button type="button" onClick={() => onCanSubmitChange(true)}>
        mark-photos-ready
      </button>
      <button type="button" onClick={() => onCanSubmitChange(false)}>
        mark-photos-not-ready
      </button>
    </div>
  ),
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

// ReviewStep renders the real PoiManager whenever listing.addressConfirmed is
// true, and PoiManager calls useQueryClient() internally — this suite has no
// QueryClientProvider ancestor (irrelevant to the photo-readiness gate being
// characterized here), so PoiManager must be stubbed. Same mock as
// ReviewStep.test.tsx (the existing suite for this same render path).
vi.mock('@/components/poi/PoiManager', () => ({
  PoiManager: ({ listingId }: { listingId: string }) => (
    <div data-testid="poi-manager-stub">{listingId}</div>
  ),
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
    bedrooms: '2',
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

// Non-agri listing => reviewStep === 4 (BASE_STEPS.length). `?step=4` seeds
// `currentStep` directly (useEditListingNavigation.ts:62) with no gating on
// initial mount, so the Review panel — otherwise only reachable via a
// completed-step click chain, already covered by
// EditListingForm.stepperNavigation.test.tsx — renders immediately.
function renderOnReviewStep(listing: ListingResponse) {
  return render(
    <MemoryRouter initialEntries={['/broker/listings/edit/test-id?step=4']}>
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
  mockSubmitMutate.mockReset();
});

// The step-2 panel (containing ImageUploader) is always mounted per the
// CSS display-toggle convention (EditListingForm.tsx: "CRITICAL:
// always-mounted (display:none toggle...)") but is `display: none` while
// viewing the review step (currentStep === reviewStep !== 2). Testing
// Library's byRole queries exclude inaccessible (display:none) elements by
// default, so the photo-readiness trigger buttons need `{ hidden: true }`
// to be found — the "Submit for Review" button itself needs no such option
// since the review panel is the one actually visible.
function getPhotoReadinessButton(name: 'mark-photos-ready' | 'mark-photos-not-ready') {
  return screen.getByRole('button', { name, hidden: true });
}

describe('EditListingForm — photo-readiness gating (Issue #1838 PR A)', () => {
  it('disables Submit for Review while canSubmitImages is false, with every other condition already met', () => {
    // addressConfirmed:true, price/propertyType/locality set (via makeListing
    // defaults) => requiredFieldsComplete && addressConfirmed both true;
    // canSubmitImages defaults to false (EditListingForm.tsx:73) and nothing
    // here flips it, so allConditionsMet must be false on that term alone.
    renderOnReviewStep(makeListing());

    const submitButton = screen.getByRole('button', { name: 'Submit for Review' });
    expect(submitButton).toBeDisabled();
  });

  it('enables Submit for Review once ImageUploader reports canSubmitImages via onCanSubmitChange, all else already met', async () => {
    const user = userEvent.setup();
    renderOnReviewStep(makeListing());

    const submitButton = screen.getByRole('button', { name: 'Submit for Review' });
    expect(submitButton).toBeDisabled();

    await user.click(getPhotoReadinessButton('mark-photos-ready'));

    expect(submitButton).toBeEnabled();
  });

  it('re-disables Submit for Review if canSubmitImages flips back to false after being ready', async () => {
    const user = userEvent.setup();
    renderOnReviewStep(makeListing());

    const submitButton = screen.getByRole('button', { name: 'Submit for Review' });

    await user.click(getPhotoReadinessButton('mark-photos-ready'));
    expect(submitButton).toBeEnabled();

    await user.click(getPhotoReadinessButton('mark-photos-not-ready'));
    expect(submitButton).toBeDisabled();
  });

  it('keeps Submit for Review disabled when photos are ready but another allConditionsMet term is unmet (address not confirmed)', async () => {
    const user = userEvent.setup();
    renderOnReviewStep(makeListing({ addressConfirmed: false }));

    const submitButton = screen.getByRole('button', { name: 'Submit for Review' });

    await user.click(getPhotoReadinessButton('mark-photos-ready'));

    // canSubmitImages is now true, but addressConfirmed is false, so
    // allConditionsMet's `!!listing.addressConfirmed` term still fails the
    // overall AND — proves canSubmitImages is one gate among several, not
    // the sole gate.
    expect(submitButton).toBeDisabled();
  });
});
