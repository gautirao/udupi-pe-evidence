/**
 * EditListingForm — background-refetch hydration clobber (Issue #2294 Mode-3
 * Stage A, BUG_REPRO).
 *
 * EditListingForm.tsx:200-231 hydrates ALL local form state from the
 * `listing` prop inside a `useEffect` whose dep array is `[listing,
 * agri.hydrate, commercial.hydrate, rent.hydrate, residential.hydrate,
 * shared.hydrate]`. All five `hydrate` fns are `useCallback(..., [])` and
 * therefore stable — so `listing` object IDENTITY is the sole unstable dep.
 * Any background refetch that returns a fresh object for the SAME listing id
 * (e.g. useUpdateListing.onSuccess -> invalidateQueries(['listing-broker',
 * id]) on every in-wizard save) re-runs the effect and destroys the broker's
 * unsaved edits.
 *
 * This suite originated as a BUG_REPRO before the fix landed: tests 2 and 3
 * were written to FAIL against the pre-fix EditListingForm.tsx, and that
 * failure was the evidence of the defect (see bug-repro-report.toml). The fix
 * has since landed and all tests below pass; they now serve as the permanent
 * regression guard for this defect.
 *
 * Harness copied in structure from ../__tests__/EditListingForm.crops.test.tsx
 * (same mock set, same renderForm/makeListing shape). Kept LOCAL to this file
 * per Stage-A instructions — no shared test helper touched.
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

// shadcn Select stub — same pattern as EditListingForm.crops.test.tsx (Radix
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

// ── Helpers (LOCAL to this file — no shared test helper touched) ───────────

/**
 * Minimal ListingResponse fixture — mirrors EditListingForm.crops.test.tsx's
 * makeListing(). Every field used by this suite (title, commercialSubtype,
 * officeSeats) is a real ListingResponse field — no structural widening
 * needed.
 */
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
  } as ListingResponse;
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

describe('EditListingForm — background-refetch hydration clobber (#2294 BUG_REPRO)', () => {
  it('CONTROL (must pass now and after fix): initial hydration renders the listing title', async () => {
    const listing = makeListing({ id: 'listing-1', title: 'Server Title' });

    renderForm(listing);

    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('Server Title');
    });
  });

  it('T2: a same-id background refetch does not clobber an unsaved BASE-field (title) edit', async () => {
    const user = userEvent.setup();
    const listing1 = makeListing({ id: 'listing-1', title: 'Server Title' });

    const { rerender } = renderForm(listing1);

    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('Server Title');
    });

    const titleInput = screen.getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Broker Unsaved Title');

    expect(screen.getByLabelText('Title')).toHaveValue('Broker Unsaved Title');

    // Simulate a background refetch echo: SAME listing id, SAME server
    // values, but a genuinely fresh object reference (never the same
    // reference as listing1 — that's the whole point of the repro).
    const listing2 = makeListing({ id: 'listing-1', title: 'Server Title' });
    expect(listing2).not.toBe(listing1);

    rerender(
      <MemoryRouter initialEntries={['/broker/listings/edit/test-id']}>
        <Routes>
          <Route
            path="/broker/listings/edit/:id"
            element={<EditListingForm listing={listing2} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    // On unfixed code, the hydration effect re-runs (listing identity changed)
    // and stomps the broker's in-progress edit back to the server value.
    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('Broker Unsaved Title');
    });
  });

  it('T3: a same-id background refetch does not clobber an unsaved TYPED-field (officeSeats) edit', async () => {
    const user = userEvent.setup();
    // propertyType: 'commercial' + commercialSubtype: 'OFFICE' resolves via
    // deriveCommercialSubtype (listingFieldConfig.ts) to the OFFICE subtype,
    // making the officeSeats field visible — confirmed by the existing
    // EditListing.commercial.test.tsx AC1 OFFICE-subtype prefill test.
    const listing1 = makeListing({
      id: 'listing-1',
      propertyType: 'commercial',
      commercialSubtype: 'OFFICE',
      officeSeats: 12,
    } as Partial<ListingResponse>);

    const { rerender } = renderForm(listing1);

    await waitFor(() => {
      expect(screen.getByLabelText('Seats')).toHaveValue(12);
    });

    const seatsInput = screen.getByLabelText('Seats');
    await user.clear(seatsInput);
    await user.type(seatsInput, '99');

    expect(screen.getByLabelText('Seats')).toHaveValue(99);

    // Same-id refetch echo: fresh object reference, same server value (12).
    const listing2 = makeListing({
      id: 'listing-1',
      propertyType: 'commercial',
      commercialSubtype: 'OFFICE',
      officeSeats: 12,
    } as Partial<ListingResponse>);
    expect(listing2).not.toBe(listing1);

    rerender(
      <MemoryRouter initialEntries={['/broker/listings/edit/test-id']}>
        <Routes>
          <Route
            path="/broker/listings/edit/:id"
            element={<EditListingForm listing={listing2} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Seats')).toHaveValue(99);
    });
  });

  it('ANTI-OVER-FIX GUARD (must pass now and after fix): switching to a DIFFERENT listing id still hydrates', async () => {
    const listing1 = makeListing({ id: 'listing-1', title: 'First Listing Title' });

    const { rerender } = renderForm(listing1);

    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('First Listing Title');
    });

    const listing2 = makeListing({ id: 'listing-2', title: 'Second Listing Title' });
    expect(listing2).not.toBe(listing1);

    rerender(
      <MemoryRouter initialEntries={['/broker/listings/edit/test-id']}>
        <Routes>
          <Route
            path="/broker/listings/edit/:id"
            element={<EditListingForm listing={listing2} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('Second Listing Title');
    });
  });

  it('T3b: a same-id background refetch does not clobber an unsaved NON-COMMERCIAL typed-field (agri surveyNumber) edit', async () => {
    // Same shape as T3, but for the agricultural_land family instead of
    // commercial — evidences that the fix protects the WHOLE hydration
    // effect (all five hydrate() fan-outs), not just the commercial one.
    const user = userEvent.setup();
    const listing1 = makeListing({
      id: 'listing-1',
      propertyType: 'agricultural_land',
      surveyNumber: 'SY-100/1',
    });

    const { rerender } = renderForm(listing1);

    await waitFor(() => {
      expect(screen.getByLabelText('Survey Number')).toHaveValue('SY-100/1');
    });

    const surveyInput = screen.getByLabelText('Survey Number');
    await user.clear(surveyInput);
    await user.type(surveyInput, 'Broker-Edited-999');

    expect(screen.getByLabelText('Survey Number')).toHaveValue('Broker-Edited-999');

    // Same-id refetch echo: fresh object reference, same server value.
    const listing2 = makeListing({
      id: 'listing-1',
      propertyType: 'agricultural_land',
      surveyNumber: 'SY-100/1',
    });
    expect(listing2).not.toBe(listing1);

    rerender(
      <MemoryRouter initialEntries={['/broker/listings/edit/test-id']}>
        <Routes>
          <Route
            path="/broker/listings/edit/:id"
            element={<EditListingForm listing={listing2} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Survey Number')).toHaveValue('Broker-Edited-999');
    });
  });

  it('T4b (first-listing-arrival): a delayed/placeholder-then-real listing still hydrates the real values', async () => {
    // NOTE (honesty per Stage-B instructions): EditListingForm is only ever
    // rendered by EditListing.tsx:94 AFTER its own loading guard, so `listing`
    // is never undefined in production — this test does NOT and cannot prove
    // an undefined -> defined transition. What it DOES prove: the ref starts
    // at null, so the very first listing object this component instance sees
    // (whatever its id) is treated as unseen and hydrates unconditionally —
    // even when that first object is a placeholder/near-empty one and the
    // "real" data arrives moments later as a different listing id. This
    // guards against a fix that accidentally requires a prior hydrated id to
    // exist before it will hydrate at all.
    const placeholderListing = makeListing({
      id: 'placeholder',
      title: '',
      propertyType: '' as unknown as ListingResponse['propertyType'],
      locality: '',
    });

    const { rerender } = renderForm(placeholderListing);

    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('');
    });

    const realListing = makeListing({ id: 'listing-1', title: 'Real Server Title' });

    rerender(
      <MemoryRouter initialEntries={['/broker/listings/edit/test-id']}>
        <Routes>
          <Route
            path="/broker/listings/edit/:id"
            element={<EditListingForm listing={realListing} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('Real Server Title');
    });
  });

  it('T5 (StrictMode idempotency): initial hydration still happens AND an unsaved edit survives double-invoke', async () => {
    const user = userEvent.setup();
    const listing1 = makeListing({ id: 'listing-1', title: 'Server Title' });

    const { rerender } = render(
      <React.StrictMode>
        <MemoryRouter initialEntries={['/broker/listings/edit/test-id']}>
          <Routes>
            <Route
              path="/broker/listings/edit/:id"
              element={<EditListingForm listing={listing1} />}
            />
          </Routes>
        </MemoryRouter>
      </React.StrictMode>,
    );

    // Initial hydration must still happen under StrictMode's double-invoke —
    // guards against an id-comparison fix that accidentally skips the first
    // hydration (e.g. by seeding the ref eagerly instead of via the effect).
    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('Server Title');
    });

    const titleInput = screen.getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Broker Unsaved Title');

    expect(screen.getByLabelText('Title')).toHaveValue('Broker Unsaved Title');

    const listing2 = makeListing({ id: 'listing-1', title: 'Server Title' });
    expect(listing2).not.toBe(listing1);

    rerender(
      <React.StrictMode>
        <MemoryRouter initialEntries={['/broker/listings/edit/test-id']}>
          <Routes>
            <Route
              path="/broker/listings/edit/:id"
              element={<EditListingForm listing={listing2} />}
            />
          </Routes>
        </MemoryRouter>
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('Broker Unsaved Title');
    });
  });

  it('T6 (regression guard): the step-1 save payload is unaffected by the hydration guard', async () => {
    const user = userEvent.setup();
    const listing = makeListing({
      id: 'listing-1',
      title: 'Server Title',
      price: 5000000,
      propertyType: 'apartment',
      locality: 'Manipal',
    });

    renderForm(listing);

    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('Server Title');
    });

    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.title).toBe('Server Title');
    expect(payload.price).toBe(5000000);
    expect(payload.propertyType).toBe('apartment');
    expect(payload.locality).toBe('Manipal');
  });

  it('T7 (#2295 commercial subtype fields): a WAREHOUSE-derived subtype field hydrates correctly from stored values', async () => {
    // #2295 made all 28 commercial subtype-gated fields editable in broker
    // Edit. T3 already covers the explicit-choice OFFICE subtype
    // (officeSeats). This covers the propertyType-DERIVED subtype path
    // (warehouse -> WAREHOUSE, per deriveCommercialSubtype in
    // listingFieldConfig.ts) via warehouseClearHeightFt, to evidence the fix
    // didn't regress #2295's hydration for the derived-subtype family too.
    const listing = makeListing({
      id: 'listing-1',
      propertyType: 'warehouse',
      warehouseClearHeightFt: 18,
    } as Partial<ListingResponse>);

    renderForm(listing);

    await waitFor(() => {
      expect(screen.getByLabelText('Clear height (ft)')).toHaveValue(18);
    });
  });
});
