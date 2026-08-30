/**
 * ResidentialListingForm parity tests — issue #1718 (residential single-page
 * create flow: inline reuse of ImageUploader/AddressPicker/PoiManager,
 * early-DRAFT persistence, review preview, honest submit copy).
 *
 * Heavy child dependencies (AddressPicker's Leaflet map, PoiManager's own
 * API calls) are stubbed at the module boundary — they're covered by their
 * own test suites (AddressPicker.test.tsx) and by EditListing.tsx's existing
 * identical wiring pattern. This suite verifies ResidentialListingForm's OWN
 * orchestration: idempotent draft creation, review-mode gating, and honest copy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockCreateMutate = vi.hoisted(() => vi.fn());
const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockSubmitMutate = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());
const mockListingData = vi.hoisted(() => ({
  current: undefined as { id: string; addressConfirmed: boolean; latitude: number | null; longitude: number | null } | undefined,
}));
const mockImageCount = vi.hoisted(() => ({ current: 0 }));

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
    useGetListing: () => ({ data: mockListingData.current }),
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

// Heavy children stubbed — their own wiring is covered elsewhere.
vi.mock('@/components/broker/residential/InlineNearby', () => ({
  InlineNearby: () => <div data-testid="mock-inline-nearby" />,
}));

// Issue #1722 correction #4 — Section 2's <AddressSearch> now drives locality
// via a real search-select (see useResidentialLocation.test.tsx for the
// hook's own coverage); stub the geocode client so fillCoreFields can resolve
// a location without hitting the network. AddressPicker's Leaflet map (used
// inside Section 6's <MapPin> modal) is stubbed the same way AddressPicker's
// own test suite and useResidentialLocation.test.tsx do.
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

vi.mock('@/components/broker/AddressPicker', () => ({
  AddressPicker: ({ onConfirm }: { onConfirm: (v: { lat: number; lng: number; address_confirmed: boolean }) => void }) => (
    <button
      type="button"
      data-testid="mock-address-picker-confirm"
      onClick={() => onConfirm({ lat: 13.34, lng: 74.74, address_confirmed: true })}
    >
      Mock confirm pin
    </button>
  ),
}));

// Import after mocks
import { ResidentialListingForm } from '../ResidentialListingForm';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderForm() {
  const navigate = vi.fn();
  const onSwitchToGenericFlow = vi.fn();
  render(
    <MemoryRouter>
      <ResidentialListingForm
        initialPropertyType="apartment"
        onSwitchToGenericFlow={onSwitchToGenericFlow}
        navigate={navigate}
      />
    </MemoryRouter>,
  );
  return { navigate };
}

/** Mocks a successful create -> sets listingId + backs useGetListing with a confirmed address. */
function mockCreateSucceedsWithAddressConfirmed() {
  mockCreateMutate.mockImplementation((_payload: unknown, opts?: { onSuccess?: (d: { id: string }) => void }) => {
    mockListingData.current = { id: 'listing-1', addressConfirmed: true, latitude: 13.34, longitude: 74.74 };
    opts?.onSuccess?.({ id: 'listing-1' });
  });
}

async function fillCoreFields(user: ReturnType<typeof userEvent.setup>) {
  // Issue #1722 correction #4 — locality is now set via AddressSearch's
  // search-select flow (onPublicLoc), not free typing.
  await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
  await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: /^use$/i }));

  await user.type(screen.getByLabelText(/listing title/i), '3 BHK Apartment in Manipal');
  await user.type(screen.getByLabelText(/price \(inr\)/i), '50 lakh');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListingData.current = undefined;
  mockImageCount.current = 0;
  mockCreateMutate.mockReset();
  mockUpdateMutate.mockReset();
  mockSubmitMutate.mockReset();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ResidentialListingForm — idempotent draft creation', () => {
  it('creates the draft exactly once across repeated "Save draft" clicks', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    const user = userEvent.setup();
    renderForm();

    await fillCoreFields(user);

    const saveDraftButtons = screen.getAllByRole('button', { name: /save draft/i });
    await user.click(saveDraftButtons[0]);
    expect(mockCreateMutate).toHaveBeenCalledTimes(1);

    // Second click after listingId is set must route to update, never a second create.
    await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);
    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
  });
});

describe('ResidentialListingForm — honest copy', () => {
  it('never renders "Published" or "AI-generated" anywhere on the page', () => {
    renderForm();
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/published/i);
    expect(body).not.toMatch(/ai-generated/i);
    expect(body).not.toMatch(/ai generated/i);
  });

  it('labels the description CTA honestly ("Generate draft description")', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /generate draft description/i })).toBeInTheDocument();
  });
});

describe('ResidentialListingForm — single Listing strength widget (issue #1727)', () => {
  it('pre-draft: renders exactly one Listing strength widget (legacy meter only)', () => {
    renderForm();

    // Before any draft/listingId exists the legacy pre-draft meter is the only widget.
    expect(screen.getByTestId('listing-strength-meter')).toBeInTheDocument();
    expect(screen.queryByTestId('strength-meter-sidebar')).not.toBeInTheDocument();
    // The two widgets must never co-render → exactly one "Listing strength" heading.
    expect(screen.getAllByText('Listing strength')).toHaveLength(1);
  });

  it('post-draft: renders exactly one Listing strength widget (authoritative StrengthMeter only)', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    const user = userEvent.setup();
    renderForm();

    await fillCoreFields(user);
    await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);

    // Once a draft/listingId exists the newer StrengthMeter is authoritative and the
    // legacy ListingStrengthMeter must not render — the two never co-render.
    expect(await screen.findByTestId('strength-meter-sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('listing-strength-meter')).not.toBeInTheDocument();
    expect(screen.getAllByText('Listing strength')).toHaveLength(1);
  });

  it('post-draft: preserves the "Location entered" vs "Map pin confirmed" distinction', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    const user = userEvent.setup();
    renderForm();

    await fillCoreFields(user);
    await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);

    const sidebar = await screen.findByTestId('strength-meter-sidebar');
    expect(within(sidebar).getByText(/location entered/i)).toBeInTheDocument();
    expect(within(sidebar).getByText(/map pin confirmed/i)).toBeInTheDocument();
  });
});

describe('ResidentialListingForm — review + submit gating', () => {
  it('moves to review mode after "Review" and shows "Submit for review", disabled until gates pass', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    mockImageCount.current = 0; // fewer than 3 photos — submit gate must stay closed
    const user = userEvent.setup();
    renderForm();

    await fillCoreFields(user);
    await user.click(screen.getByRole('button', { name: /^review$/i }));

    const submitButton = await screen.findByRole('button', { name: /submit for review/i });
    expect(submitButton).toBeDisabled();
    // Missing-items panel must surface the real gate that's unmet.
    expect(screen.getByText(/3 photos/i)).toBeInTheDocument();
    // Honesty (#1622): no broker-verification/KYC signal exists in the codebase —
    // the review preview must never claim "verified broker".
    expect(document.body.textContent ?? '').not.toMatch(/verified broker/i);
  });

  it('enables "Submit for review" once every real gate is met, and shows honest success copy on submit', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    mockImageCount.current = 3; // >= 3 photos gate satisfied
    mockSubmitMutate.mockImplementation((_arg: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    const user = userEvent.setup();
    renderForm();

    await fillCoreFields(user);
    // Apartment type gate also needs bedrooms + built-up area (issue #1718 —
    // real submit gate mirror; scope by container id since multiple "3" chips
    // exist across the bedrooms/bathrooms/balconies groups).
    const bedroomsGroup = document.getElementById('bedrooms');
    expect(bedroomsGroup).not.toBeNull();
    await user.click(within(bedroomsGroup as HTMLElement).getByRole('radio', { name: '3 BHK' }));

    // Issue #1722 (AC8) — apartment's built-up area is a secondary/optional
    // metric (carpet area is primary) and now lives under the collapsed
    // "More details" section; open it before interacting with the field.
    await user.click(screen.getByRole('button', { name: /more details.*ownership/i }));
    const builtAreaInput = document.getElementById('builtArea');
    expect(builtAreaInput).not.toBeNull();
    await user.type(builtAreaInput as HTMLElement, '1150');

    await user.click(screen.getByRole('button', { name: /^review$/i }));

    const submitButton = await screen.findByRole('button', { name: /submit for review/i });
    await waitFor(() => expect(submitButton).not.toBeDisabled());

    await user.click(submitButton);

    expect(mockSubmitMutate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/submitted for review/i)).toBeInTheDocument();
    expect(screen.getByText(/pending admin approval/i)).toBeInTheDocument();
  });
});
