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
vi.mock('@/components/broker/residential/InlineLocation', () => ({
  InlineLocation: () => <div data-testid="mock-inline-location" />,
}));
vi.mock('@/components/broker/residential/InlineNearby', () => ({
  InlineNearby: () => <div data-testid="mock-inline-nearby" />,
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
  await user.type(screen.getByLabelText(/locality \/ area/i), 'Manipal');
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
    await user.click(within(bedroomsGroup as HTMLElement).getByRole('radio', { name: '3' }));

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
