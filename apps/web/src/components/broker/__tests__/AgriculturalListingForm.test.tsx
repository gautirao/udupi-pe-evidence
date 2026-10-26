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
  current: undefined as Record<string, unknown> | undefined,
  isLoading: false,
  isError: false,
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
    useGetListing: () => ({
      data: mockListingData.current,
      isLoading: mockListingData.isLoading,
      isError: mockListingData.isError,
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

function renderForm(props?: { initialDraftId?: string | null; onDraftPersisted?: (id: string) => void }) {
  const navigate = vi.fn();
  const onSwitchToGenericFlow = vi.fn();
  const onDraftPersisted = props?.onDraftPersisted ?? vi.fn();
  render(
    <MemoryRouter>
      <AgriculturalListingForm
        initialDraftId={props?.initialDraftId}
        onDraftPersisted={onDraftPersisted}
        onSwitchToGenericFlow={onSwitchToGenericFlow}
        navigate={navigate}
      />
    </MemoryRouter>,
  );
  return { navigate, onSwitchToGenericFlow, onDraftPersisted };
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
  mockListingData.isLoading = false;
  mockListingData.isError = false;
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

  it('shows an honest note: crops ARE saved, features are not (issue #2044 corrects the pre-#2044 blanket claim)', () => {
    renderForm();
    const note = screen.getByTestId('crops-saved-features-not-saved-note');
    expect(note).toBeInTheDocument();
    expect(note.textContent).toMatch(/crops you select are saved/i);
    expect(note.textContent).toMatch(/features aren't saved as structured/i);
  });
});

describe('AgriculturalListingForm — idempotent draft creation and payload shape (issue #2044)', () => {
  it('creates the draft exactly once, sends crops as canonical machine values, and NEVER sends features/rtc (no backend write path for those)', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    const user = userEvent.setup();
    renderForm();

    await resolveLocation(user);
    await user.type(screen.getByLabelText(/price \(inr\)/i), '78 lakh');
    // Select the "Areca / supari" chip — the old FE-only label was "Areca nut";
    // the payload must carry the canonical backend code, not the old display string.
    await user.click(screen.getByRole('button', { name: 'Areca / supari' }));

    const saveDraftButtons = screen.getAllByRole('button', { name: /save draft/i });
    await user.click(saveDraftButtons[0]);

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    const [payload] = mockCreateMutate.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(payload.propertyType).toBe('agricultural_land');
    expect(payload.crops).toEqual(['ARECA_SUPARI']);
    expect(payload).not.toHaveProperty('features');
    expect(payload).not.toHaveProperty('rtc');

    await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);
    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
  });

  it('CROP_OPTIONS renders all 12 canonical crops and never renders an "Other" crop chip (DP-1)', () => {
    renderForm();
    const cropGroup = screen.getByTestId('chip-group-crops');
    const canonicalLabels = [
      'Paddy', 'Coconut', 'Areca / supari', 'Cashew', 'Banana', 'Sugarcane',
      'Vegetables', 'Mango', 'Rubber', 'Pepper', 'Mixed plantation', 'Fallow / open',
    ];
    canonicalLabels.forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });
    // 12 crop chips, no more (no leftover 'Other' or legacy 'Areca nut' chip).
    expect(cropGroup.querySelectorAll('button')).toHaveLength(12);
    expect(screen.queryByRole('button', { name: /^other$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /areca nut/i })).not.toBeInTheDocument();
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

describe('AgriculturalListingForm — conversion status (issue #2043)', () => {
  it('renders an optional conversion status control with an honest "not verified" caption', async () => {
    const user = userEvent.setup();
    renderForm();
    // "Land record details" (Section 4) is collapsed by default — expand it first.
    await user.click(screen.getByText(/land record details/i));
    expect(document.getElementById('agriConversionStatus')).not.toBeNull();
    expect(screen.getByText(/conversion status \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByText(/declared by the seller\/broker/i)).toBeInTheDocument();
    expect(screen.getByText(/not verified by retrends/i)).toBeInTheDocument();
  });

  it('omits agriConversionStatus from the create-draft payload when left unset (parity with landCategory)', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    const user = userEvent.setup();
    renderForm();

    await resolveLocation(user);
    await user.type(screen.getByLabelText(/price \(inr\)/i), '78 lakh');
    await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    const [payload] = mockCreateMutate.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(payload.agriConversionStatus).toBeUndefined();
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

describe('AgriculturalListingForm — positive submit lifecycle (PR #2405 evidence gap): confirmed pin + enough photos -> Review allowed -> Submit for review succeeds', () => {
  it('opens every ListingTransitionPolicy agricultural_land submit gate (price, locality, area, >=3 photos, location entered, confirmed pin), enables Submit for review, and drives a real successful submit end-to-end', async () => {
    // Gate 1/6 (price) + Gate 2/6 (locality) + Gate 5/6 (location entered):
    // resolveLocation() resolves a search result (sets locality + locationEntered).
    // Gate 6/6 (confirmed pin): mockCreateSucceedsWithAddressConfirmed() makes the
    // create-listing response report addressConfirmed: true, exactly like a broker
    // who confirmed the map pin before saving — the SAME mechanism the existing
    // pin re-lock test (above) uses to reach a confirmed-pin state.
    mockCreateSucceedsWithAddressConfirmed();
    // Gate 4/6 (>=3 photos): unlike every other test in this file (which leaves
    // this at 0 to prove the BLOCKED state), this is the one test that opens it.
    mockImageCount.current = 3;
    const user = userEvent.setup();
    const { navigate } = renderForm();

    await resolveLocation(user);
    await user.type(screen.getByLabelText(/price \(inr\)/i), '78 lakh');
    // Gate 3/6 (area + unit): the "1 acre" quick-pick chip sets both landArea
    // and landAreaUnit in one click (AreaField's radiogroup).
    await user.click(screen.getByRole('radio', { name: '1 acre' }));

    // "Review" persists the draft (create-listing succeeds -> addressConfirmed
    // hydrates true) and switches mode to 'review' in one round-trip, mirroring
    // the existing blocked-submit test's own path into AgriculturalReviewScreen.
    await user.click(screen.getByRole('button', { name: /^review$/i }));

    const submitButton = await screen.findByRole('button', { name: /submit for review/i });
    // All six ListingTransitionPolicy agricultural_land gates are met — unlike
    // the existing blocked-submit test (0 photos), Submit for review must be
    // enabled here. This is the positive assertion PR #2405's evidence gate
    // flagged as missing: the unit suite previously only proved the disabled/
    // blocked case, never that the button actually becomes clickable.
    await waitFor(() => expect(submitButton).toBeEnabled());
    expect(screen.getByText(/ready to submit for review/i)).toBeInTheDocument();

    // Drive the actual submit mutation through to a real success transition —
    // not just "button enabled". useSubmitListing is mocked at the module
    // boundary (same boundary as create/update, consistent with this file's
    // established mocking pattern); here it resolves successfully.
    mockSubmitMutate.mockImplementation((_vars: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });

    await user.click(submitButton);

    // useAgriculturalListingDraft.handleSubmitForReview success path: fires the
    // "Submitted for review" toast and flips draft.submitted, which swaps the
    // whole form out for the dedicated confirmation panel
    // (data-testid="agricultural-submitted-panel" in AgriculturalListingForm.tsx).
    expect(mockSubmitMutate).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('agricultural-submitted-panel')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /submitted for review/i })).toBeInTheDocument();
    expect(screen.getByText(/pending admin approval/i)).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Submitted for review', description: 'Pending admin approval.' }),
    );

    // "Back to dashboard" on the confirmation panel navigates away — confirms
    // the success state is a real terminal UI, not just an unasserted toast.
    await user.click(screen.getByRole('button', { name: /back to dashboard/i }));
    expect(navigate).toHaveBeenCalledWith('/broker/listings');
  });
});

describe('AgriculturalListingForm — URL-seeded draft hydration & recovery (issue #2811)', () => {
  it('invokes onDraftPersisted exactly once on initial draft create, and never on later updates', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    const user = userEvent.setup();
    const { onDraftPersisted } = renderForm();

    await resolveLocation(user);
    await user.type(screen.getByLabelText(/price \(inr\)/i), '45 lakh');
    await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    expect(onDraftPersisted).toHaveBeenCalledTimes(1);
    expect(onDraftPersisted).toHaveBeenCalledWith('listing-1');

    // Subsequent Save draft issues PUT and does NOT re-fire onDraftPersisted
    await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);
    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    expect(onDraftPersisted).toHaveBeenCalledTimes(1);
  });

  it('hydrates all persisted agricultural fields (including crops) and gate state from initialDraftId, preserves them on PUT round-trip, and never fabricates UI-only rtc/features', async () => {
    mockListingData.current = {
      id: 'agri-draft-2811',
      propertyType: 'agricultural_land',
      listingPurpose: 'sale',
      title: 'Hydrated 3 Acre Areca Farm',
      locality: 'Rajarajeshwari Nagar',
      price: 4_500_000,
      description: 'Well-irrigated agricultural parcel near RR Nagar.',
      landArea: 3,
      landAreaUnit: 'acre',
      facing: 'EAST',
      waterSource: 'BOREWELL',
      soilType: 'RED_LATERITE',
      roadAccess: 'TAR_ROAD',
      cultivationStatus: 'CULTIVATED',
      landCategory: 'DRY',
      agriConversionStatus: 'AGRICULTURAL_ONLY',
      ownershipType: 'FREEHOLD',
      surveyNumber: 'SY-2811/4A',
      farmhouseAvailable: true,
      fencingDone: false,
      crops: ['COCONUT', 'ARECA_SUPARI'],
      addressConfirmed: true,
      latitude: 12.9255,
      longitude: 77.5176,
    };
    mockImageCount.current = 3;
    mockUpdateMutate.mockImplementation((_payload: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());

    const user = userEvent.setup();
    renderForm({ initialDraftId: 'agri-draft-2811' });

    // Core inputs hydrated
    await waitFor(() => expect(document.getElementById('title')).toHaveValue('Hydrated 3 Acre Areca Farm'));
    expect(document.getElementById('landArea')).toHaveValue(3);
    await waitFor(() => expect(document.getElementById('price')).toHaveValue('45 lakh'));
    expect(screen.getByTestId('agri-price-breakdown')).toBeInTheDocument();

    // Location & confirmed pin hydrated
    await waitFor(() => expect(screen.getByLabelText(/search for a location/i)).toHaveValue('Rajarajeshwari Nagar'));
    expect(screen.getByText('Location confirmed — Rajarajeshwari Nagar')).toBeInTheDocument();
    expect(screen.getByText('Pin confirmed — Rajarajeshwari Nagar')).toBeInTheDocument();

    // Persisted crops hydrated
    expect(screen.getByRole('button', { name: 'Coconut' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Areca / supari' })).toHaveAttribute('aria-pressed', 'true');

    // Hydrated description shown in ready textarea
    const descReady = await screen.findByTestId('agri-description-assistant-ready');
    expect(descReady.querySelector('textarea')).toHaveValue('Well-irrigated agricultural parcel near RR Nagar.');

    // Expand Section 4 ("Land record details") and verify surveyNumber hydrated while UI-only RTC stays empty
    await user.click(screen.getByText(/land record details/i));
    expect(document.getElementById('surveyNumber')).toHaveValue('SY-2811/4A');
    expect(document.getElementById('rtc')).toHaveValue('');

    // Save draft issues PUT with all hydrated fields preserved
    await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);
    expect(mockCreateMutate).not.toHaveBeenCalled();
    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    const [putPayload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(putPayload).toMatchObject({
      propertyType: 'agricultural_land',
      title: 'Hydrated 3 Acre Areca Farm',
      locality: 'Rajarajeshwari Nagar',
      price: 4_500_000,
      description: 'Well-irrigated agricultural parcel near RR Nagar.',
      landArea: 3,
      landAreaUnit: 'acre',
      facing: 'EAST',
      waterSource: 'BOREWELL',
      soilType: 'RED_LATERITE',
      roadAccess: 'TAR_ROAD',
      cultivationStatus: 'CULTIVATED',
      landCategory: 'DRY',
      agriConversionStatus: 'AGRICULTURAL_ONLY',
      ownershipType: 'FREEHOLD',
      surveyNumber: 'SY-2811/4A',
      farmhouseAvailable: true,
      fencingDone: false,
      crops: ['COCONUT', 'ARECA_SUPARI'],
    });
    expect(putPayload).not.toHaveProperty('rtc');
    expect(putPayload).not.toHaveProperty('features');
  });

  it('survives edit -> review -> edit -> review mode switch on a hydrated draft and submits through the real UI button', async () => {
    mockListingData.current = {
      id: 'agri-draft-submit',
      propertyType: 'agricultural_land',
      listingPurpose: 'sale',
      title: 'Submittable Hydrated Parcel',
      locality: 'Rajarajeshwari Nagar',
      price: 4_200_000,
      landArea: 2,
      landAreaUnit: 'acre',
      addressConfirmed: true,
      latitude: 12.9255,
      longitude: 77.5176,
    };
    mockImageCount.current = 3;
    mockUpdateMutate.mockImplementation((_payload: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    mockSubmitMutate.mockImplementation((_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());

    const user = userEvent.setup();
    renderForm({ initialDraftId: 'agri-draft-submit' });

    await waitFor(() => expect(document.getElementById('title')).toHaveValue('Submittable Hydrated Parcel'));
    await waitFor(() => expect(screen.getByText('Pin confirmed — Rajarajeshwari Nagar')).toBeInTheDocument());

    // Enter review mode
    await user.click(screen.getByRole('button', { name: /^review$/i }));
    expect(await screen.findByRole('heading', { name: /review your listing/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeEnabled();

    // Switch back to edit mode — restored location and price must still be intact
    await user.click(screen.getAllByRole('button', { name: /back to editing/i })[0]);
    expect(screen.getByText('Pin confirmed — Rajarajeshwari Nagar')).toBeInTheDocument();
    expect(screen.getByLabelText(/search for a location/i)).toHaveValue('Rajarajeshwari Nagar');

    // Re-enter review mode and click Submit for review
    await user.click(screen.getByRole('button', { name: /^review$/i }));
    const submitBtn = await screen.findByRole('button', { name: /submit for review/i });
    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);

    expect(mockSubmitMutate).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('agricultural-submitted-panel')).toBeInTheDocument();
  });

  it('shows loading state while recovering a URL-seeded draft and degrades to a recoverable blank form on 403/404 error', async () => {
    mockListingData.isLoading = true;
    const { unmount } = render(
      <MemoryRouter>
        <AgriculturalListingForm
          initialDraftId="stale-draft-404"
          onSwitchToGenericFlow={vi.fn()}
          navigate={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('draft-recovery-loading')).toBeInTheDocument();
    expect(document.getElementById('title')).toBeDisabled();
    expect(screen.getByRole('button', { name: /^save draft$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^review$/i })).toBeDisabled();
    unmount();

    // Now simulate 403/404 error on draft recovery
    mockListingData.isLoading = false;
    mockListingData.isError = true;
    renderForm({ initialDraftId: 'stale-draft-404' });

    const alert = await screen.findByTestId('draft-recovery-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent(/couldn't load your saved draft/i);
    expect(screen.queryByTestId('draft-recovery-loading')).not.toBeInTheDocument();
    expect(document.getElementById('title')).toBeEnabled();
    expect(document.getElementById('title')).toHaveValue('');
  });
});
