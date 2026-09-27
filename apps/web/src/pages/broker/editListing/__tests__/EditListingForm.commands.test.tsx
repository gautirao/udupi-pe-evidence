/**
 * EditListingForm — save/submit command characterization tests
 * (Issue #1838 PR C commit 1).
 *
 * Written against the CURRENT (pre-extraction) EditListingForm.tsx, before
 * any of its save/submit handlers move into useEditListingCommands.ts. This
 * is the regression oracle PR C's extraction must keep green, UNCHANGED.
 *
 * Covers, per the PR C commit-1 spec:
 *   1. handleSubmitForReview's onError 3-way message precedence (all 3 arms)
 *   2. Step-1 save success: toast + advance-to-step-2 / advance-to-review
 *   3. Step-2 continue: payload shape + advance to step 3
 *   4. Agri step-4 (boundary) continue: payload shape + advance to review
 *   5. Submit success: toast shown AND navigation to /broker/listings
 *   6. Step-1 save clears landAreaUnitError/builtAreaUnitError before mutate
 *   7. LocationStep's isPending guard on confirm/unconfirm
 *   8. advanceAfterSave(n) called with the correct step number per call site
 *
 * Mocking convention mirrors EditListingForm.crops.test.tsx /
 * EditListingForm.stepperNavigation.test.tsx / EditListingForm.
 * photoReadinessGating.test.tsx (real EditListingForm mounted, heavy leaf
 * components stubbed, shadcn Select stubbed, react-leaflet stubbed).
 *
 * Unlike those suites, the `toast` mock here is a single HOISTED, STABLE
 * vi.fn() (not a fresh one per render) so its call arguments can actually be
 * asserted on — the existing per-render `useToast: () => ({ toast: vi.fn() })`
 * pattern elsewhere in this directory cannot be asserted against and must
 * not be copied for this file.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import { toGeoJsonString } from '@/lib/geoJsonUtils';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockSubmitMutate = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());
// Mutable per-test knob for useUpdateListing().isPending — module-level so
// the vi.mock factory (hoisted, runs once) can read the current value on
// every call, letting individual tests simulate an in-flight save.
const updatePendingState = vi.hoisted(() => ({ value: false }));

vi.mock('@/hooks/useBrokerListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBrokerListings')>();
  return {
    ...actual,
    useUpdateListing: vi.fn(() => ({
      mutate: mockUpdateMutate,
      get isPending() {
        return updatePendingState.value;
      },
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
  useToast: () => ({ toast: mockToast }),
}));

// Real StepIndicator isn't the SUT here — every test seeds `currentStep`
// directly via the `?step=` URL param (useEditListingNavigation.ts's lazy
// initializer), matching EditListingForm.photoReadinessGating.test.tsx's
// convention. Step-click gating itself is covered by
// EditListingForm.stepperNavigation.test.tsx.
vi.mock('@/components/broker/StepIndicator', () => ({
  StepIndicator: () => null,
}));

// Auto-reports "photos ready" on mount so allConditionsMet can be satisfied
// without a separate interaction step in the submit-path tests. Photo
// readiness itself is already covered by EditListingForm.photoReadinessGating.test.tsx.
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
    onConfirm: (addr: { lat: number; lng: number }) => void;
    onUnconfirm: () => void;
    onLocalityConfirmed: (locality: string, lat: number, lng: number) => void;
  }) => (
    <div data-testid="address-picker-stub">
      <button type="button" onClick={() => props.onConfirm({ lat: 13.35, lng: 74.75 })}>
        confirm-pin
      </button>
      <button type="button" onClick={() => props.onUnconfirm()}>
        unconfirm-pin
      </button>
      <button
        type="button"
        onClick={() => props.onLocalityConfirmed('Manipal, Udupi', 13.35, 74.75)}
      >
        confirm-locality
      </button>
    </div>
  ),
}));

vi.mock('@/components/dealer/BoundaryDrawStep', () => ({
  BoundaryDrawStep: (props: {
    onSave: (coords: [number, number][]) => void;
    onSkip: () => void;
  }) => (
    <div data-testid="boundary-draw-stub">
      <button
        type="button"
        onClick={() => props.onSave([[13.34, 74.74], [13.35, 74.74], [13.35, 74.75]])}
      >
        save-boundary
      </button>
      <button type="button" onClick={() => props.onSkip()}>
        skip-boundary
      </button>
    </div>
  ),
}));

vi.mock('@/components/poi/PoiManager', () => ({
  PoiManager: ({ listingId }: { listingId: string }) => (
    <div data-testid="poi-manager-stub">{listingId}</div>
  ),
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

// Requirement 6 — spies on the two unit-error setters so "cleared before
// mutate" is directly observable, since neither error string is ever
// rendered anywhere in the current DescribeStep/PhotosStep JSX (verified
// against DescribeStepProps — landAreaUnitError/builtAreaUnitError are not
// among its props). Wraps the REAL hook rather than replacing state
// wholesale, so every other field this hook owns keeps behaving normally.
const setLandAreaUnitErrorSpy = vi.hoisted(() => vi.fn());
const setBuiltAreaUnitErrorSpy = vi.hoisted(() => vi.fn());

vi.mock('../useEditListingUiState', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useEditListingUiState')>();
  return {
    ...actual,
    useEditListingUiState: () => {
      const real = actual.useEditListingUiState();
      return {
        ...real,
        setters: {
          ...real.setters,
          setLandAreaUnitError: (v: string) => {
            setLandAreaUnitErrorSpy(v);
            real.setters.setLandAreaUnitError(v);
          },
          setBuiltAreaUnitError: (v: string) => {
            setBuiltAreaUnitErrorSpy(v);
            real.setters.setBuiltAreaUnitError(v);
          },
        },
      };
    },
  };
});

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

function renderForm(listing: ListingResponse, step?: number) {
  const path = step != null
    ? `/broker/listings/edit/test-id?step=${step}`
    : '/broker/listings/edit/test-id';
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/broker/listings/edit/:id"
          element={<EditListingForm listing={listing} />}
        />
        <Route path="/broker/listings" element={<div>listings-page-marker</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUpdateMutate.mockReset();
  mockSubmitMutate.mockReset();
  mockToast.mockClear();
  setLandAreaUnitErrorSpy.mockClear();
  setBuiltAreaUnitErrorSpy.mockClear();
  updatePendingState.value = false;
});

describe('EditListingForm — save/submit commands (Issue #1838 PR C commit 1)', () => {
  // ── 1. handleSubmitForReview onError 3-way precedence ──────────────────────
  describe('handleSubmitForReview onError message precedence', () => {
    function getCapturedOnError() {
      const [, options] = mockSubmitMutate.mock.calls[0] as [
        unknown,
        { onSuccess: () => void; onError: (error: Error) => void },
      ];
      return options.onError;
    }

    it('arm 1: body.message present -> toast shows body.message', async () => {
      const user = userEvent.setup();
      renderForm(makeListing(), 4);

      await user.click(screen.getByRole('button', { name: /submit for review/i }));
      await waitFor(() => expect(mockSubmitMutate).toHaveBeenCalledOnce());

      const onError = getCapturedOnError();
      const error = Object.assign(new Error('js error message'), {
        body: { message: 'body message wins', error: 'body error field' },
      });
      act(() => onError(error));

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Submit failed',
          description: 'body message wins',
          variant: 'destructive',
        }),
      );
    });

    it('arm 2: no body.message, body.error present -> toast shows body.error', async () => {
      const user = userEvent.setup();
      renderForm(makeListing(), 4);

      await user.click(screen.getByRole('button', { name: /submit for review/i }));
      await waitFor(() => expect(mockSubmitMutate).toHaveBeenCalledOnce());

      const onError = getCapturedOnError();
      const error = Object.assign(new Error('js error message'), {
        body: { error: 'body error field wins' },
      });
      act(() => onError(error));

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Submit failed',
          description: 'body error field wins',
          variant: 'destructive',
        }),
      );
    });

    it('arm 3: neither body.message nor body.error -> toast falls back to error.message', async () => {
      const user = userEvent.setup();
      renderForm(makeListing(), 4);

      await user.click(screen.getByRole('button', { name: /submit for review/i }));
      await waitFor(() => expect(mockSubmitMutate).toHaveBeenCalledOnce());

      const onError = getCapturedOnError();
      const error = Object.assign(new Error('js error message wins'), { body: {} });
      act(() => onError(error));

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Submit failed',
          description: 'js error message wins',
          variant: 'destructive',
        }),
      );
    });
  });

  // ── 2. Step-1 save success ──────────────────────────────────────────────────
  describe('Step-1 save success', () => {
    it('shows the "Listing updated" toast and advances to step 2', async () => {
      const user = userEvent.setup();
      renderForm(makeListing());

      await user.click(screen.getByRole('button', { name: /save & continue/i }));
      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledOnce());

      const [, options] = mockUpdateMutate.mock.calls[0] as [
        unknown,
        { onSuccess: () => void },
      ];
      act(() => options.onSuccess());

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Listing updated' }),
      );
      expect(screen.getByTestId('step-2-panel')).toHaveStyle({ display: 'block' });
      expect(screen.getByTestId('step-1-panel')).toHaveStyle({ display: 'none' });
    });

    it('advances back to Review instead of step 2 when the save came from Review (cameFromReview)', async () => {
      const user = userEvent.setup();
      renderForm(makeListing(), 4);

      // Property Details "Edit" button sets cameFromReview(true) + currentStep(1).
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
      expect(screen.getByTestId('step-1-panel')).toHaveStyle({ display: 'block' });

      await user.click(screen.getByRole('button', { name: /save & continue/i }));
      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledOnce());

      const [, options] = mockUpdateMutate.mock.calls[0] as [
        unknown,
        { onSuccess: () => void },
      ];
      act(() => options.onSuccess());

      expect(screen.getByTestId('step-review-panel')).toBeInTheDocument();
      // step-2-panel is always mounted (CSS display-toggle) — assert it is
      // hidden rather than absent.
      expect(screen.getByTestId('step-2-panel')).toHaveStyle({ display: 'none' });
    });
  });

  // ── 6. Step-1 save clears both unit errors before mutate ──────────────────
  it('clears landAreaUnitError and builtAreaUnitError before calling updateListing.mutate', async () => {
    const user = userEvent.setup();
    renderForm(makeListing());

    await user.click(screen.getByRole('button', { name: /save & continue/i }));
    await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledOnce());

    expect(setLandAreaUnitErrorSpy).toHaveBeenCalledWith('');
    expect(setBuiltAreaUnitErrorSpy).toHaveBeenCalledWith('');
    // Both clears happen synchronously, ahead of the mutate call, within the
    // same handleStep1Save invocation.
    expect(setLandAreaUnitErrorSpy.mock.invocationCallOrder[0])
      .toBeLessThan(mockUpdateMutate.mock.invocationCallOrder[0]);
    expect(setBuiltAreaUnitErrorSpy.mock.invocationCallOrder[0])
      .toBeLessThan(mockUpdateMutate.mock.invocationCallOrder[0]);
  });

  // ── 3. Step-2 continue ──────────────────────────────────────────────────────
  it('step-2 continue sends {videoUrl, applyVideoUrl:true} and advances to step 3 on success', async () => {
    const user = userEvent.setup();
    renderForm(makeListing({ videoUrl: null }), 2);

    const videoInput = screen.getByPlaceholderText(/youtube.com\/watch/i);
    await user.type(videoInput, 'https://www.youtube.com/watch?v=abc123');

    await user.click(screen.getByRole('button', { name: /save & continue/i }));
    await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledOnce());

    const [payload, options] = mockUpdateMutate.mock.calls[0] as [
      Record<string, unknown>,
      { onSuccess: () => void },
    ];
    expect(payload).toEqual({
      videoUrl: 'https://www.youtube.com/watch?v=abc123',
      applyVideoUrl: true,
    });

    act(() => options.onSuccess());
    expect(screen.getByTestId('step-3-panel')).toHaveStyle({ display: 'block' });
  });

  // ── 4. Agri step-4 (boundary) continue ─────────────────────────────────────
  it('agri step-4 boundary continue sends {boundary: <GeoJSON string>} and advances to review on success', async () => {
    const user = userEvent.setup();
    const listing = makeListing({ propertyType: 'agricultural_land', landArea: 2, landAreaUnit: 'acre' });
    renderForm(listing, 4);

    await user.click(screen.getByRole('button', { name: 'save-boundary' }));
    await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledOnce());

    const coords: [number, number][] = [[13.34, 74.74], [13.35, 74.74], [13.35, 74.75]];
    const [payload, options] = mockUpdateMutate.mock.calls[0] as [
      Record<string, unknown>,
      { onSuccess: () => void },
    ];
    expect(payload).toEqual({ boundary: toGeoJsonString(coords) });

    act(() => options.onSuccess());
    // Agri reviewStep === 5 (AGRI_STEPS.length)
    expect(screen.getByTestId('step-review-panel')).toBeInTheDocument();
  });

  // ── 5. Submit success: toast + navigation ──────────────────────────────────
  it('submit success shows a toast and navigates to /broker/listings', async () => {
    const user = userEvent.setup();
    renderForm(makeListing(), 4);

    await user.click(screen.getByRole('button', { name: /submit for review/i }));
    await waitFor(() => expect(mockSubmitMutate).toHaveBeenCalledOnce());

    const [, options] = mockSubmitMutate.mock.calls[0] as [
      unknown,
      { onSuccess: () => void },
    ];
    act(() => options.onSuccess());

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Listing submitted for review' }),
    );
    expect(await screen.findByText('listings-page-marker')).toBeInTheDocument();
  });

  // ── 7. LocationStep isPending guard ────────────────────────────────────────
  it('does not call updateListing.mutate a second time from confirm/unconfirm while a save is already pending', async () => {
    const user = userEvent.setup();
    updatePendingState.value = true;
    renderForm(makeListing(), 3);

    await user.click(screen.getByRole('button', { name: 'confirm-pin' }));
    await user.click(screen.getByRole('button', { name: 'unconfirm-pin' }));

    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  // ── 8. advanceAfterSave(n) called with the correct step per call site ─────
  // Covered directly by the step-1 (-> 2) and step-2 (-> 3) success assertions
  // above (each asserts the resulting VISIBLE step, not merely that a
  // function was called).
});
