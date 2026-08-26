/**
 * CommercialListingForm — draft resume/hydration on refresh (issue #2348).
 *
 * Before this fix, CommercialListingForm never persisted its `listingId`
 * anywhere retrievable (no URL param, no storage) and never hydrated from a
 * fetched listing beyond one incidental locality binding — a hard browser
 * refresh mid-Create silently discarded the entire in-progress draft.
 *
 * Mirrors CommercialListingForm.parity.test.tsx's mocking pattern (same
 * heavy child stubs) and ResidentialListingForm's analogous #2039 fix.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockCreateMutate = vi.hoisted(() => vi.fn());
const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockSubmitMutate = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());
const mockListingData = vi.hoisted(() => ({
  current: undefined as Record<string, unknown> | undefined,
}));
const mockImageCount = vi.hoisted(() => ({ current: 0 }));
// #2348 review follow-up — isError/isLoading are now independently
// configurable per test (previously hardcoded false/false, which meant the
// "stale draft" test never actually exercised the isError:true branch it
// claimed to).
const mockGetListingState = vi.hoisted(() => ({ isError: false, isLoading: false }));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/hooks/useBrokerListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBrokerListings')>();
  return {
    ...actual,
    useCreateListing: () => ({ mutate: mockCreateMutate, isPending: false }),
    useUpdateListing: () => ({ mutate: mockUpdateMutate, isPending: false }),
    useSubmitListing: () => ({ mutate: mockSubmitMutate, isPending: false }),
    useGetListing: () => ({
      data: mockListingData.current,
      isError: mockGetListingState.isError,
      isLoading: mockGetListingState.isLoading,
    }),
  };
});

vi.mock('@/hooks/useListingImages', () => ({
  useListingImages: () => ({
    images: [],
    isLoading: false,
    fetchError: null,
    uploads: {},
    isUploading: false,
    imageCount: mockImageCount.current,
    canSubmit: mockImageCount.current >= 3,
    remainingSlots: 10,
    maxImages: 10,
    uploadImage: vi.fn(),
    retryUpload: vi.fn(),
    retryFinalize: vi.fn(),
    dismissUpload: vi.fn(),
    deleteImage: vi.fn(),
    isDeleting: false,
    reorderImages: vi.fn(),
    isReordering: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/components/broker/residential/InlineNearby', () => ({
  InlineNearby: () => <div data-testid="mock-inline-nearby" />,
}));

const MANIPAL_RESULT = vi.hoisted(() => ({
  lat: 13.34,
  lon: 74.74,
  display_name: 'Manipal, Udupi District, Karnataka, India',
  address: { suburb: 'Manipal', city: 'Udupi' },
}));

vi.mock('@/lib/geocode', () => ({
  searchNominatim: vi.fn().mockResolvedValue([MANIPAL_RESULT]),
  reverseGeocode: vi.fn(),
}));

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

import { CommercialListingForm } from '../CommercialListingForm';

// ─── Helpers ──────────────────────────────────────────────────────────────

function renderWithDraft(draftId: string, propertyType: 'commercial' | 'commercial_building' | 'warehouse' | 'commercial_land' = 'commercial') {
  render(
    <MemoryRouter>
      <CommercialListingForm
        initialPropertyType={propertyType}
        initialDraftId={draftId}
        onSwitchToGenericFlow={vi.fn()}
        navigate={vi.fn()}
      />
    </MemoryRouter>,
  );
}

function renderFresh(propertyType: 'commercial' | 'commercial_building' | 'warehouse' | 'commercial_land' = 'commercial') {
  render(
    <MemoryRouter>
      <CommercialListingForm
        initialPropertyType={propertyType}
        onSwitchToGenericFlow={vi.fn()}
        navigate={vi.fn()}
      />
    </MemoryRouter>,
  );
}

function baseDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-2348',
    addressConfirmed: false,
    latitude: null,
    longitude: null,
    locality: 'Manipal',
    title: 'Prime shop on MG Road',
    description: 'A great commercial space near the market.',
    price: 4_500_000,
    listingPurpose: 'sale',
    propertyType: 'commercial',
    commercialSubtype: null,
    landArea: null,
    landAreaUnit: null,
    builtArea: 800,
    builtAreaUnit: 'sqft',
    ...overrides,
  };
}

beforeEach(() => {
  mockCreateMutate.mockReset();
  mockUpdateMutate.mockReset();
  mockSubmitMutate.mockReset();
  mockToast.mockReset();
  mockListingData.current = undefined;
  mockImageCount.current = 0;
  mockGetListingState.isError = false;
  mockGetListingState.isLoading = false;
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('CommercialListingForm — draft resume/hydration on refresh (#2348)', () => {
  it('a fresh (never-saved) Create session with no draftId renders a clean blank form', () => {
    renderFresh();
    expect(screen.getByRole('heading', { name: 'Create a listing' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Listing title/)).toHaveValue('');
    expect(screen.queryByTestId('commercial-draft-load-error')).not.toBeInTheDocument();
  });

  it('restores common fields (title, locality, price, description) from a URL-seeded draft', () => {
    mockListingData.current = baseDraft();
    renderWithDraft('draft-2348');

    expect(screen.getByLabelText(/Listing title/)).toHaveValue('Prime shop on MG Road');
    expect(screen.getByLabelText(/Price \(INR\)/)).toHaveValue('45 lakh');
    expect(screen.getByPlaceholderText('Write a short, factual description of the property…')).toHaveValue('A great commercial space near the market.');
    // Locality restore is owned by useResidentialLocation via
    // ResidentialLocationBridge (issue #2039's fix-cycle-2 pattern, mirrored
    // for Commercial) — a persisted, non-addressConfirmed `locality` hydrates
    // through the hook's decoupled locality-only seed branch into the same
    // search box the broker typed into originally.
    expect(screen.getByLabelText('Search for a location')).toHaveValue('Manipal');
  });

  it('restores Office subtype-specific fields (officeSeats) from a URL-seeded draft', () => {
    mockListingData.current = baseDraft({
      commercialSubtype: 'OFFICE',
      officeSeats: 24,
    });
    renderWithDraft('draft-2348', 'commercial');

    expect(screen.getByLabelText('Seats')).toHaveValue(24);
  });

  it('restores Shop/Retail subtype-specific fields (suitableUses) from a URL-seeded draft', async () => {
    const user = userEvent.setup();
    mockListingData.current = baseDraft({
      commercialSubtype: 'SHOP',
      suitableUses: ['RETAIL'],
    });
    renderWithDraft('draft-2348', 'commercial');

    // suitableUses lives in the collapsed "More details" section — expand it
    // before asserting the hydrated chip selection.
    await user.click(screen.getByRole('button', { name: /More details/ }));

    expect(screen.getByRole('button', { name: 'Retail' })).toHaveAttribute('data-state', 'on');
  });

  it('restores Warehouse/Industrial subtype-specific fields (warehouseClearHeightFt) from a URL-seeded draft', () => {
    mockListingData.current = baseDraft({
      propertyType: 'warehouse',
      warehouseClearHeightFt: 18,
    });
    renderWithDraft('draft-2348', 'warehouse');

    expect(screen.getByLabelText('Clear height (ft)')).toHaveValue(18);
  });

  it('restores Building subtype-specific fields (powerLoadKva) from a URL-seeded draft', () => {
    mockListingData.current = baseDraft({
      propertyType: 'commercial_building',
      powerLoadKva: 50,
    });
    renderWithDraft('draft-2348', 'commercial_building');

    expect(screen.getByLabelText('Power load (KVA)')).toHaveValue(50);
  });

  it('restores Land subtype-specific fields (commercialZoning) from a URL-seeded draft', () => {
    mockListingData.current = baseDraft({
      propertyType: 'commercial_land',
      landArea: 12,
      landAreaUnit: 'cent',
      builtArea: null,
      builtAreaUnit: null,
      commercialZoning: 'Commercial zone',
    });
    renderWithDraft('draft-2348', 'commercial_land');

    expect(screen.getByLabelText('Zoning')).toHaveValue('Commercial zone');
  });

  it('degrades to a usable blank create form when a URL-seeded draftId fails to load', () => {
    mockListingData.current = undefined;
    mockGetListingState.isError = true;
    render(
      <MemoryRouter>
        <CommercialListingForm
          initialPropertyType="commercial"
          initialDraftId="missing-draft"
          onSwitchToGenericFlow={vi.fn()}
          navigate={vi.fn()}
        />
      </MemoryRouter>,
    );
    // The AC4 error-fallback effect drops listingId and surfaces the inline
    // banner — the form re-enables as a normal, editable blank create form
    // rather than hanging on a 403/404/network failure.
    expect(screen.getByRole('heading', { name: 'Create a listing' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Listing title/)).toHaveValue('');
    expect(screen.getByTestId('commercial-draft-load-error')).toHaveTextContent(
      "We couldn't load your saved draft",
    );
    expect(screen.queryByTestId('draft-recovery-loading')).not.toBeInTheDocument();
  });

  it('bounds recovery to DRAFT_RECOVERY_TIMEOUT_MS when the draft fetch never settles', () => {
    vi.useFakeTimers();
    try {
      mockListingData.current = undefined;
      mockGetListingState.isLoading = true;
      render(
        <MemoryRouter>
          <CommercialListingForm
            initialPropertyType="commercial"
            initialDraftId="slow-draft"
            onSwitchToGenericFlow={vi.fn()}
            navigate={vi.fn()}
          />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('draft-recovery-loading')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(15_000);
      });

      expect(screen.queryByTestId('draft-recovery-loading')).not.toBeInTheDocument();
      expect(screen.getByTestId('commercial-draft-load-error')).toHaveTextContent(
        'taking longer than expected',
      );
      expect(screen.getByLabelText(/Listing title/)).toHaveValue('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('disables the form and blocks Save draft/Review while a URL-seeded draft is still loading (no premature PUT)', () => {
    mockListingData.current = undefined;
    mockGetListingState.isLoading = true;
    render(
      <MemoryRouter>
        <CommercialListingForm
          initialPropertyType="commercial"
          initialDraftId="loading-draft"
          onSwitchToGenericFlow={vi.fn()}
          navigate={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('draft-recovery-loading')).toBeInTheDocument();
    // Every descendant form control is disabled via the wrapping <fieldset>
    // — proven here by the title input, which would otherwise be the very
    // field a broker types a soon-to-be-lost value into.
    expect(screen.getByLabelText(/Listing title/)).toBeDisabled();
    // The price Slider (Radix) is not a form-associated element, so
    // <fieldset disabled> alone never reaches it — PriceField now threads
    // an explicit `disabled` prop through to it (code review follow-up).
    expect(screen.getByRole('slider')).toHaveAttribute('data-disabled', '');
    // The Save draft / Review actions live in the sticky footer, OUTSIDE the
    // fieldset, so they need (and get) their own explicit guard.
    expect(screen.getByRole('button', { name: /Save draft/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
    expect(mockUpdateMutate).not.toHaveBeenCalled();
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });
});
