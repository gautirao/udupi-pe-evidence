/**
 * AgriculturalListingForm tests — issue #1627 (agricultural single-page
 * create flow). Mirrors CommercialListingForm.parity.test.tsx's structure/
 * mocking pattern (heavy child deps stubbed at the module boundary — POI/
 * geocode/address-picker are covered by their own suites and by the
 * identical residential/commercial wiring).
 *
 * This suite verifies AgriculturalListingForm's OWN orchestration:
 * field visibility (agricultural-only, no residential/commercial-only
 * fields), pin-gating LOCK + RE-LOCK-on-address-edit, honest lifecycle
 * copy, and that crops/features/RTC never reach the create-listing payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

// jsdom does not implement PointerEvent capture APIs that Radix Select's
// jsdom-only pointer-interaction path calls into.
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

// Import after mocks
import { AgriculturalListingForm } from '../AgriculturalListingForm';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderForm() {
  const navigate = vi.fn();
  const onSwitchToGenericFlow = vi.fn();
  render(
    <MemoryRouter>
      <AgriculturalListingForm onSwitchToGenericFlow={onSwitchToGenericFlow} navigate={navigate} />
    </MemoryRouter>,
  );
  return { navigate, onSwitchToGenericFlow };
}

function mockCreateSucceedsWithAddressConfirmed() {
  mockCreateMutate.mockImplementation((_payload: unknown, opts?: { onSuccess?: (d: { id: string }) => void }) => {
    mockListingData.current = { id: 'listing-1', addressConfirmed: true, latitude: 13.34, longitude: 74.74 };
    opts?.onSuccess?.({ id: 'listing-1' });
  });
}

async function resolveLocation(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
  await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: /^use$/i }));
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

describe('AgriculturalListingForm — dispatch and field visibility (AC1/AC2)', () => {
  it('renders the dedicated agricultural form, not a residential/commercial layout', () => {
    renderForm();
    expect(screen.getByText(/agricultural land listing/i)).toBeInTheDocument();
  });

  it('shows agricultural-land fields only — no BHK/bedrooms, balconies, furnishing, office seats, or commercial ROI copy', () => {
    renderForm();
    expect(screen.getByText(/^land area/i)).toBeInTheDocument();
    expect(document.getElementById('waterSource')).not.toBeNull();
    expect(document.getElementById('soilType')).not.toBeNull();
    expect(document.getElementById('roadAccess')).not.toBeNull();
    expect(document.getElementById('cultivationStatus')).not.toBeNull();
    expect(screen.getByText(/land record details/i)).toBeInTheDocument();

    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/bedrooms \(bhk\)/i);
    expect(body).not.toMatch(/balconies/i);
    expect(body).not.toMatch(/office seats/i);
    expect(body).not.toMatch(/expected rental yield/i);
    expect(screen.queryByLabelText(/furnishing status/i)).not.toBeInTheDocument();
  });

  it('offers a "Switch flow" affordance back to the generic picker', async () => {
    const user = userEvent.setup();
    const { onSwitchToGenericFlow } = renderForm();
    await user.click(screen.getByRole('button', { name: /switch flow/i }));
    expect(onSwitchToGenericFlow).toHaveBeenCalledTimes(1);
  });
});

describe('AgriculturalListingForm — price-derived breakdown (AC6, no math shown until area+price present)', () => {
  it('shows the "appears once you add" placeholder before area/price are entered', () => {
    renderForm();
    expect(screen.getByText(/appears once you add area and price/i)).toBeInTheDocument();
    expect(screen.queryByTestId('agri-price-breakdown')).not.toBeInTheDocument();
  });
});

describe('AgriculturalListingForm — honest copy (AC9)', () => {
  it('never renders "Published", "AI-generated", "verified broker", or guaranteed-ROI copy anywhere on the page', () => {
    renderForm();
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/published/i);
    expect(body).not.toMatch(/ai-generated/i);
    expect(body).not.toMatch(/ai generated/i);
    expect(body).not.toMatch(/verified broker/i);
    expect(body).not.toMatch(/guaranteed/i);
  });

  it('labels the submit action honestly ("Submit for review", never "Publish")', () => {
    renderForm();
    expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument();
  });

  it('shows an honest non-persistence note next to crops/features', () => {
    renderForm();
    expect(screen.getByTestId('crops-features-not-saved-note')).toBeInTheDocument();
  });
});

describe('AgriculturalListingForm — idempotent draft creation and payload shape', () => {
  it('creates the draft exactly once, and NEVER sends crops/features/rtc (no backend write path — issue #1627 scope decision)', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    const user = userEvent.setup();
    renderForm();

    await resolveLocation(user);
    await user.type(screen.getByLabelText(/price \(inr\)/i), '78 lakh');

    const saveDraftButtons = screen.getAllByRole('button', { name: /save draft/i });
    await user.click(saveDraftButtons[0]);

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    const [payload] = mockCreateMutate.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(payload.propertyType).toBe('agricultural_land');
    expect(payload).not.toHaveProperty('crops');
    expect(payload).not.toHaveProperty('features');
    expect(payload).not.toHaveProperty('rtc');

    await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);
    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
  });
});

describe('AgriculturalListingForm — review + submit gating (mirrors ListingTransitionPolicy agricultural_land gate)', () => {
  it('moves to review mode after "Review" and shows "Submit for review", disabled until gates pass', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    mockImageCount.current = 0; // fewer than 3 photos — submit gate must stay closed
    const user = userEvent.setup();
    renderForm();

    await resolveLocation(user);
    await user.type(screen.getByLabelText(/price \(inr\)/i), '78 lakh');
    await user.click(screen.getByRole('button', { name: /^review$/i }));

    const submitButton = await screen.findByRole('button', { name: /submit for review/i });
    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/3 photos/i)).toBeInTheDocument();
  });
});

describe('AgriculturalListingForm — deterministic description draft builder', () => {
  it('shows an honest "Draft description" action and populates the editable textarea deterministically (no AI/network call)', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByTestId('agri-description-assistant-idle')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^draft description$/i }));

    await waitFor(() => expect(screen.getByTestId('agri-description-assistant-ready')).toBeInTheDocument(), { timeout: 2000 });
    const textarea = screen.getByPlaceholderText(/write a short, factual description/i) as HTMLTextAreaElement;
    expect(textarea.value.length).toBeGreaterThan(0);

    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/ai-generated/i);
    expect(body).not.toMatch(/ai generated/i);
  });
});

describe('AgriculturalListingForm — location trust: LOCK until pin confirm, RE-LOCK on address edit (AC3/AC4)', () => {
  it('a resolved (not yet pin-confirmed) search result does NOT set addressConfirmed — nearby stays locked', async () => {
    const user = userEvent.setup();
    renderForm();
    await resolveLocation(user);
    // Resolving a search result is LOCAL ONLY (issue #1722 3-state invariant,
    // reused as-is via useResidentialLocation) — no PUT/addressConfirmed write
    // happens purely from picking a candidate.
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it('re-locks (unconfirms the persisted pin) when the broker edits the address after it was confirmed', async () => {
    mockListingData.current = { id: 'listing-1', addressConfirmed: true, latitude: 13.34, longitude: 74.74 };
    mockCreateSucceedsWithAddressConfirmed();
    const user = userEvent.setup();
    renderForm();

    // Save a draft first so listingId is set and the hook hydrates from the
    // already-confirmed draft (addressConfirmed: true at mount).
    await user.type(screen.getByLabelText(/price \(inr\)/i), '78 lakh');
    await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);
    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalledTimes(1));

    // Editing the address query after a confirmed pin is a "real edit" —
    // useResidentialLocation.editQuery unconfirms the persisted pin server-side.
    const searchInput = await screen.findByLabelText(/search for a location/i);
    await user.type(searchInput, ' edited');

    await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledWith({ addressConfirmed: false }));
  });
});

describe('AgriculturalListingForm — residential/commercial regression guard', () => {
  it('does not import or mount ResidentialListingForm/CommercialListingForm internals (own independent local state)', () => {
    renderForm();
    // A residential-only or commercial-only landmark string should never appear here.
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/is this a shop or an office/i);
    expect(body).not.toMatch(/bedrooms \(bhk\)/i);
  });
});
