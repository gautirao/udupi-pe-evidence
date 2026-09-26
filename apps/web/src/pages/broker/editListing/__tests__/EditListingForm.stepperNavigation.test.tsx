/**
 * EditListingForm — stepper navigation gating characterization test
 * (Issue #1838 PR A deliverable #4).
 *
 * Locks in `handleStepClick`'s current gating rule (EditListingForm.tsx:267):
 *   `if (n === 1 || steps[n - 1]?.isComplete || n < currentStep) setCurrentStep(n);`
 * — i.e. a click on step n only navigates when: n is step 1, OR step n's OWN
 * completion gate is already met (not any intermediate step's), OR n is
 * behind the current step. Any other forward jump (to an incomplete step
 * ahead of currentStep) is a no-op. This is a golden-master lock-in, not a
 * correctness claim — PRs B–E must preserve this exact behavior unless a
 * later PR explicitly changes it (and updates this test to match).
 *
 * Reuses the mocking convention from EditListingForm.crops.test.tsx (real
 * EditListingForm mounted, heavy leaf components stubbed, shadcn Select
 * stubbed, react-leaflet stubbed). StepIndicator is mocked here to a plain
 * set of buttons + a `current-step` probe div (rather than to `null`, as
 * crops.test.tsx does), since this suite needs to both trigger
 * `onStepClick` and observe the resulting `currentStep` state directly.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

// Exposes the real `currentStep` value and the real `handleStepClick` wiring
// via plain buttons, instead of StepIndicator's actual pill/connector
// markup (irrelevant to this gating test — the SUT here is
// EditListingForm's own step-transition logic, not StepIndicator's render).
vi.mock('@/components/broker/StepIndicator', () => ({
  StepIndicator: ({
    currentStep,
    onStepClick,
    steps,
  }: {
    currentStep: number;
    onStepClick: (n: number) => void;
    steps: Array<{ label: string; isComplete: boolean }>;
  }) => (
    <div>
      <div data-testid="current-step">{currentStep}</div>
      {steps.map((_, i) => (
        <button key={i} type="button" onClick={() => onStepClick(i + 1)}>
          {`goto-step-${i + 1}`}
        </button>
      ))}
    </div>
  ),
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

function renderForm(listing: ListingResponse, initialPath = '/broker/listings/edit/test-id') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
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

describe('EditListingForm — stepper navigation gating (Issue #1838 PR A)', () => {
  it('blocks a forward jump to a step that is not itself complete', async () => {
    const user = userEvent.setup();
    // price:0 => step1Complete false; addressConfirmed:false => step3Complete
    // false; canSubmitImages defaults false => step2Complete false.
    renderForm(makeListing({ price: 0, addressConfirmed: false }));

    expect(screen.getByTestId('current-step')).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: 'goto-step-3' }));
    expect(screen.getByTestId('current-step')).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: 'goto-step-2' }));
    expect(screen.getByTestId('current-step')).toHaveTextContent('1');
  });

  it("allows a forward jump to a step whose OWN completion gate is met, independent of earlier steps", async () => {
    const user = userEvent.setup();
    // addressConfirmed:true => step3Complete true, even though step1/step2
    // are not complete (price:0).
    renderForm(makeListing({ price: 0, addressConfirmed: true }));

    expect(screen.getByTestId('current-step')).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: 'goto-step-3' }));
    expect(screen.getByTestId('current-step')).toHaveTextContent('3');
  });

  it('always allows navigating to step 1 regardless of completion state', async () => {
    const user = userEvent.setup();
    renderForm(
      makeListing({ price: 0, addressConfirmed: false }),
      '/broker/listings/edit/test-id?step=2',
    );

    expect(screen.getByTestId('current-step')).toHaveTextContent('2');

    await user.click(screen.getByRole('button', { name: 'goto-step-1' }));
    expect(screen.getByTestId('current-step')).toHaveTextContent('1');
  });

  it('allows navigating backward to any step already behind currentStep, even if incomplete', async () => {
    const user = userEvent.setup();
    renderForm(
      makeListing({ price: 0, addressConfirmed: false }),
      '/broker/listings/edit/test-id?step=3',
    );

    expect(screen.getByTestId('current-step')).toHaveTextContent('3');

    await user.click(screen.getByRole('button', { name: 'goto-step-2' }));
    expect(screen.getByTestId('current-step')).toHaveTextContent('2');
  });

  it('blocks a forward jump beyond currentStep to an incomplete terminal step', async () => {
    const user = userEvent.setup();
    renderForm(
      makeListing({ price: 0, addressConfirmed: false }),
      '/broker/listings/edit/test-id?step=3',
    );

    expect(screen.getByTestId('current-step')).toHaveTextContent('3');

    // Step 4 (Review & Submit, non-agri) is always isComplete:false, and 4
    // is not < currentStep(3), so this must be a no-op.
    await user.click(screen.getByRole('button', { name: 'goto-step-4' }));
    expect(screen.getByTestId('current-step')).toHaveTextContent('3');
  });
});
