/**
 * CommercialListingForm parity tests — issue #1684 [M38-13B] (commercial
 * single-page create flow: inline reuse of ImageUploader/AddressPicker/
 * PoiManager, early-DRAFT persistence, review preview, honest submit copy).
 * Mirrors ResidentialListingForm.parity.test.tsx's structure/mocking pattern.
 *
 * Heavy child dependencies (AddressPicker's Leaflet map, PoiManager's own API
 * calls) are stubbed at the module boundary — they're covered by their own
 * test suites and by ResidentialListingForm's identical wiring pattern. This
 * suite verifies CommercialListingForm's OWN orchestration: idempotent draft
 * creation, subtype-adaptive field visibility, review-mode gating, and honest
 * copy (no fake verified-broker badge, no "Publish", no guaranteed ROI/yield).
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
// jsdom-only pointer-interaction path calls into — without this stub,
// clicking a <Select> trigger throws "target.hasPointerCapture is not a
// function" under userEvent.click (a known Radix+jsdom test-environment gap,
// unrelated to CommercialListingForm's own logic).
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
import { CommercialListingForm } from '../CommercialListingForm';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderForm(initialPropertyType: 'commercial' | 'commercial_building' | 'warehouse' | 'commercial_land' = 'commercial') {
  const navigate = vi.fn();
  const onSwitchToGenericFlow = vi.fn();
  render(
    <MemoryRouter>
      <CommercialListingForm
        initialPropertyType={initialPropertyType}
        onSwitchToGenericFlow={onSwitchToGenericFlow}
        navigate={navigate}
      />
    </MemoryRouter>,
  );
  return { navigate };
}

function mockCreateSucceedsWithAddressConfirmed() {
  mockCreateMutate.mockImplementation((_payload: unknown, opts?: { onSuccess?: (d: { id: string }) => void }) => {
    mockListingData.current = { id: 'listing-1', addressConfirmed: true, latitude: 13.34, longitude: 74.74 };
    opts?.onSuccess?.({ id: 'listing-1' });
  });
}

async function fillCoreFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
  await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: /^use$/i }));

  await user.type(screen.getByLabelText(/listing title/i), '500 sqft Shop in Udupi Town');
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

describe('CommercialListingForm — subtype-adaptive visibility', () => {
  it('shows the SHOP/OFFICE subtype picker for propertyType "commercial", and hides warehouse/land-only fields', () => {
    renderForm('commercial');
    expect(screen.getByText(/is this a shop or an office/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/clear height/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^zoning$/i)).not.toBeInTheDocument();
  });

  it('never shows the explicit subtype picker for commercial_building/warehouse/commercial_land (server-derived subtypes)', () => {
    renderForm('warehouse');
    expect(screen.queryByText(/is this a shop or an office/i)).not.toBeInTheDocument();
  });

  it('shows warehouse-only fields (flooring, clear height) only for propertyType "warehouse"', async () => {
    const user = userEvent.setup();
    renderForm('warehouse');
    expect(screen.getByLabelText(/clear height/i)).toBeInTheDocument();
    expect(screen.getByText(/^flooring$/i)).toBeInTheDocument();
    // Built-space fields (utilities) live in the collapsed "More details" section.
    await user.click(screen.getByRole('button', { name: /more details/i }));
    expect(screen.getByText(/utilities/i)).toBeInTheDocument();
  });

  it('shows LAND-only fields (zoning, ownership) and hides built-space fields (utilities/furnishing) for commercial_land', async () => {
    const user = userEvent.setup();
    renderForm('commercial_land');
    expect(screen.getByLabelText(/^zoning$/i)).toBeInTheDocument();
    expect(screen.getByText(/^ownership$/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /more details/i }));
    expect(screen.queryByText(/utilities/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/furnishing/i)).not.toBeInTheDocument();
  });
});

describe('CommercialListingForm — occupancyStatus visibility (SHOP + BUILDING, not OFFICE/WAREHOUSE/LAND)', () => {
  it('shows Occupancy status for SHOP', async () => {
    const user = userEvent.setup();
    renderForm('commercial');
    const subtypeTrigger = document.getElementById('commercialSubtype');
    expect(subtypeTrigger).not.toBeNull();
    await user.click(subtypeTrigger as HTMLElement);
    await user.click(await screen.findByRole('option', { name: /^shop$/i }));
    expect(screen.getByText(/^occupancy status$/i)).toBeInTheDocument();
  });

  it('shows Occupancy status for commercial_building', () => {
    renderForm('commercial_building');
    expect(screen.getByText(/^occupancy status$/i)).toBeInTheDocument();
  });

  it('hides Occupancy status for warehouse and commercial_land', () => {
    renderForm('warehouse');
    expect(screen.queryByText(/^occupancy status$/i)).not.toBeInTheDocument();
    renderForm('commercial_land');
    expect(screen.queryByText(/^occupancy status$/i)).not.toBeInTheDocument();
  });
});

describe('CommercialListingForm — idempotent draft creation', () => {
  it('creates the draft exactly once across repeated "Save draft" clicks', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    const user = userEvent.setup();
    renderForm('commercial');

    const subtypeTrigger = document.getElementById('commercialSubtype');
    expect(subtypeTrigger).not.toBeNull();
    await user.click(subtypeTrigger as HTMLElement);
    await user.click(await screen.findByRole('option', { name: /^shop$/i }));

    await fillCoreFields(user);

    const saveDraftButtons = screen.getAllByRole('button', { name: /save draft/i });
    await user.click(saveDraftButtons[0]);
    expect(mockCreateMutate).toHaveBeenCalledTimes(1);

    await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);
    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
  });
});

describe('CommercialListingForm — honest copy', () => {
  it('never renders "Published", "AI-generated", "verified broker", or guaranteed-ROI copy anywhere on the page', () => {
    renderForm('commercial_building');
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/published/i);
    expect(body).not.toMatch(/ai-generated/i);
    expect(body).not.toMatch(/ai generated/i);
    expect(body).not.toMatch(/verified broker/i);
    expect(body).not.toMatch(/guaranteed/i);
  });

  it('labels the submit action honestly ("Submit for review", never "Publish")', () => {
    renderForm('commercial_building');
    expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument();
  });
});

describe('CommercialListingForm — review + submit gating', () => {
  it('moves to review mode after "Review" and shows "Submit for review", disabled until gates pass', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    mockImageCount.current = 0; // fewer than 3 photos — submit gate must stay closed
    const user = userEvent.setup();
    renderForm('commercial_building');

    await fillCoreFields(user);
    await user.click(screen.getByRole('button', { name: /^review$/i }));

    const submitButton = await screen.findByRole('button', { name: /submit for review/i });
    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/3 photos/i)).toBeInTheDocument();
  });
});

describe('CommercialListingForm — submit gate mirrors backend required fields (#2341)', () => {
  // Regression coverage for issue #2341: the real Commercial create UI let a
  // broker reach a "Ready to submit for review" state while missing fields
  // the backend's /submit endpoint actually required (builtArea/floorChoice
  // for Office/Shop, builtArea/floorMode for Building) — a false "complete"
  // signal that only surfaced as a 422 at submit time. These tests assert the
  // Review submit button mirrors that real backend contract exactly.

  it('Office (commercial/OFFICE): submit stays disabled with all OTHER gates met but built area + floor missing', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    mockImageCount.current = 3;
    const user = userEvent.setup();
    renderForm('commercial');

    const subtypeTrigger = document.getElementById('commercialSubtype');
    await user.click(subtypeTrigger as HTMLElement);
    await user.click(await screen.findByRole('option', { name: /^office$/i }));

    await fillCoreFields(user);
    await user.click(screen.getByRole('button', { name: /^review$/i }));

    const submitButton = await screen.findByRole('button', { name: /submit for review/i });
    expect(submitButton).toBeDisabled();
  });

  it('Office (commercial/OFFICE): submit becomes enabled once built area + floor are filled', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    mockImageCount.current = 3;
    const user = userEvent.setup();
    renderForm('commercial');

    const subtypeTrigger = document.getElementById('commercialSubtype');
    await user.click(subtypeTrigger as HTMLElement);
    await user.click(await screen.findByRole('option', { name: /^office$/i }));

    await user.click(screen.getByRole('radio', { name: '500 sqft' }));
    const floorTrigger = document.getElementById('floorChoice');
    await user.click(floorTrigger as HTMLElement);
    await user.click(await screen.findByRole('option', { name: /^first floor$/i }));

    await fillCoreFields(user);
    await user.click(screen.getByRole('button', { name: /^review$/i }));

    const submitButton = await screen.findByRole('button', { name: /submit for review/i });
    expect(submitButton).not.toBeDisabled();
  });

  it('Shop (commercial/SHOP): submit stays disabled with all OTHER gates met but built area + floor missing', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    mockImageCount.current = 3;
    const user = userEvent.setup();
    renderForm('commercial');

    const subtypeTrigger = document.getElementById('commercialSubtype');
    await user.click(subtypeTrigger as HTMLElement);
    await user.click(await screen.findByRole('option', { name: /^shop$/i }));

    await fillCoreFields(user);
    await user.click(screen.getByRole('button', { name: /^review$/i }));

    const submitButton = await screen.findByRole('button', { name: /submit for review/i });
    expect(submitButton).toBeDisabled();
  });

  it('Shop (commercial/SHOP): submit becomes enabled once built area + floor are filled', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    mockImageCount.current = 3;
    const user = userEvent.setup();
    renderForm('commercial');

    const subtypeTrigger = document.getElementById('commercialSubtype');
    await user.click(subtypeTrigger as HTMLElement);
    await user.click(await screen.findByRole('option', { name: /^shop$/i }));

    await user.click(screen.getByRole('radio', { name: '500 sqft' }));
    const floorTrigger = document.getElementById('floorChoice');
    await user.click(floorTrigger as HTMLElement);
    await user.click(await screen.findByRole('option', { name: /^first floor$/i }));

    await fillCoreFields(user);
    await user.click(screen.getByRole('button', { name: /^review$/i }));

    const submitButton = await screen.findByRole('button', { name: /submit for review/i });
    expect(submitButton).not.toBeDisabled();
  });

  it('Building (commercial_building): submit stays disabled with built area filled but floors-available missing', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    mockImageCount.current = 3;
    const user = userEvent.setup();
    renderForm('commercial_building');

    await user.click(screen.getByRole('radio', { name: '1,000 sqft' }));

    await fillCoreFields(user);
    await user.click(screen.getByRole('button', { name: /^review$/i }));

    const submitButton = await screen.findByRole('button', { name: /submit for review/i });
    expect(submitButton).toBeDisabled();
  });

  it('Building (commercial_building): submit becomes enabled once built area + floors-available are filled', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    mockImageCount.current = 3;
    const user = userEvent.setup();
    renderForm('commercial_building');

    await user.click(screen.getByRole('radio', { name: '1,000 sqft' }));
    const floorModeTrigger = document.getElementById('floorMode');
    await user.click(floorModeTrigger as HTMLElement);
    await user.click(await screen.findByRole('option', { name: /^multiple floors$/i }));

    await fillCoreFields(user);
    await user.click(screen.getByRole('button', { name: /^review$/i }));

    const submitButton = await screen.findByRole('button', { name: /submit for review/i });
    expect(submitButton).not.toBeDisabled();
  });

  it('Warehouse: submit becomes enabled once built area is filled (no floor field required)', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    mockImageCount.current = 3;
    const user = userEvent.setup();
    renderForm('warehouse');

    await user.click(screen.getByRole('radio', { name: '1,000 sqft' }));

    await fillCoreFields(user);
    await user.click(screen.getByRole('button', { name: /^review$/i }));

    const submitButton = await screen.findByRole('button', { name: /submit for review/i });
    expect(submitButton).not.toBeDisabled();
  });

  it('Land (commercial_land): submit stays disabled until land area is filled', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    mockUpdateMutate.mockImplementation((_payload: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    mockImageCount.current = 3;
    const user = userEvent.setup();
    renderForm('commercial_land');

    await fillCoreFields(user);
    await user.click(screen.getByRole('button', { name: /^review$/i }));
    let submitButton = await screen.findByRole('button', { name: /submit for review/i });
    expect(submitButton).toBeDisabled();

    await user.click(screen.getAllByRole('button', { name: /back to editing/i })[0]);
    await user.click(screen.getByRole('radio', { name: '10 cents' }));
    await user.click(screen.getByRole('button', { name: /^review$/i }));

    submitButton = await screen.findByRole('button', { name: /submit for review/i });
    expect(submitButton).not.toBeDisabled();
  });
});

describe('CommercialListingForm — deterministic commercial description draft builder', () => {
  it('shows an honest "Draft description" action and populates the editable textarea deterministically (no AI/network call)', async () => {
    const user = userEvent.setup();
    renderForm('commercial_building');

    expect(screen.getByTestId('commercial-description-assistant-idle')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^draft description$/i }));

    await waitFor(() => expect(screen.getByTestId('commercial-description-assistant-ready')).toBeInTheDocument(), { timeout: 2000 });
    const textarea = screen.getByPlaceholderText(/write a short, factual description/i) as HTMLTextAreaElement;
    expect(textarea.value.length).toBeGreaterThan(0);

    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/ai-generated/i);
    expect(body).not.toMatch(/ai generated/i);
  });
});

describe('CommercialListingForm — manual description persistence (issue #2340 regression)', () => {
  it('manual description ("Write it myself") survives Review and Back-to-editing, and Review\'s "Description added" checklist agrees with the visible body', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    mockImageCount.current = 0;
    const user = userEvent.setup();
    renderForm('commercial_building');

    await fillCoreFields(user);

    await user.click(screen.getByRole('button', { name: /write it myself/i }));
    const textarea = screen.getByPlaceholderText(/write a short, factual description/i) as HTMLTextAreaElement;
    await user.type(textarea, 'A spacious ground-floor shop in the heart of Manipal, ideal for retail.');

    await user.click(screen.getByRole('button', { name: /^review$/i }));

    const preview = await screen.findByTestId('commercial-review-preview');
    expect(screen.getByText(/A spacious ground-floor shop/i)).toBeInTheDocument();
    expect(preview.textContent).toMatch(/Description added/i);

    const [payload] = mockCreateMutate.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(payload.description).toBe('A spacious ground-floor shop in the heart of Manipal, ideal for retail.');

    await user.click(screen.getAllByRole('button', { name: /back to editing/i })[0]);
    const textareaAfterBack = screen.getByPlaceholderText(/write a short, factual description/i) as HTMLTextAreaElement;
    expect(textareaAfterBack.value).toBe('A spacious ground-floor shop in the heart of Manipal, ideal for retail.');
  });

  it('typing over an AI-drafted description with a manual edit keeps the manual text through Review (no stale AI/manual divergence)', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    mockImageCount.current = 0;
    const user = userEvent.setup();
    renderForm('commercial_building');

    await fillCoreFields(user);

    await user.click(screen.getByRole('button', { name: /^draft description$/i }));
    await waitFor(() => expect(screen.getByTestId('commercial-description-assistant-ready')).toBeInTheDocument());

    const textarea = screen.getByPlaceholderText(/write a short, factual description/i) as HTMLTextAreaElement;
    await user.clear(textarea);
    await user.type(textarea, 'MANUAL OVERRIDE of the AI draft.');

    await user.click(screen.getByRole('button', { name: /^review$/i }));

    const preview = await screen.findByTestId('commercial-review-preview');
    expect(screen.getByText(/MANUAL OVERRIDE of the AI draft/i)).toBeInTheDocument();
    expect(preview.textContent).toMatch(/Description added/i);
    expect(preview.textContent).not.toMatch(/ai-generated/i);
  });
});

describe('CommercialListingForm — commercial_land payload shape (regression: commercialApprovals must be a string, not an array)', () => {
  it('sends commercialApprovals as a single string matching the #1730 backend String contract, alongside commercialZoning/commercialOwnership', async () => {
    const user = userEvent.setup();
    renderForm('commercial_land');

    await fillCoreFields(user);

    await user.type(screen.getByLabelText(/^zoning$/i), 'Commercial zone');

    const ownershipTrigger = document.getElementById('commercialOwnership');
    expect(ownershipTrigger).not.toBeNull();
    await user.click(ownershipTrigger as HTMLElement);
    await user.click(await screen.findByRole('option', { name: /^freehold$/i }));

    await user.type(screen.getByLabelText(/^approvals$/i), 'Building plan approved, Fire NOC');

    const saveDraftButtons = screen.getAllByRole('button', { name: /save draft/i });
    await user.click(saveDraftButtons[0]);

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    const [payload] = mockCreateMutate.mock.calls[0] as [Record<string, unknown>, unknown];

    // The exact bug this regression test guards against: sending a string
    // array here 400s/500s on the backend, which declares commercialApprovals
    // as a single String (same shape as commercialZoning/commercialOwnership).
    expect(Array.isArray(payload.commercialApprovals)).toBe(false);
    expect(payload.commercialApprovals).toBe('Building plan approved, Fire NOC');
    expect(payload.commercialZoning).toBe('Commercial zone');
    expect(payload.commercialOwnership).toBe('FREEHOLD');
  });
});
