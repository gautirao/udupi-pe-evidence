/**
 * Issue #2655 — Create Listing: move pin-location workflow into the
 * "Location & Nearby Places" panel.
 *
 * Proves the RECOMPOSITION at the real ResidentialListingForm call site (not
 * an isolated harness): Section 6 ("Photos") no longer owns any pin-location
 * control, Section 7 ("Location & Nearby Places") owns the single, relocated
 * <MapPin> instance, and only one authoritative location/pin state machine
 * exists in the mounted tree (asserted by there being exactly one "Pin
 * location on map" control — MapPin's, not a second one built into
 * InlineNearby or duplicated across sections).
 *
 * The cross-flow wiring proof that Commercial/Agricultural hand InlineNearby
 * the SAME hook values lives in InlineNearbyCrossFlowWiring.test.tsx; the
 * proof that InlineNearby's CTA opens MapPin's own dialog (not a second
 * picker) lives in residential/__tests__/InlineNearby.pickerWiring.test.tsx.
 * This file's job is narrower: prove the two Sections were actually
 * recomposed as the issue describes, at the real form.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockCreateMutate = vi.hoisted(() => vi.fn());
const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockSubmitMutate = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());
const mockListingData = vi.hoisted(() => ({
  current: undefined as { id: string; addressConfirmed: boolean; latitude: number | null; longitude: number | null } | undefined,
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

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
    images: [], isLoading: false, fetchError: null, uploads: {}, isUploading: false,
    imageCount: 0, canSubmit: false, remainingSlots: 10, maxImages: 10,
    uploadImage: vi.fn(), retryUpload: vi.fn(), retryFinalize: vi.fn(), dismissUpload: vi.fn(),
    deleteImage: vi.fn(), isDeleting: false, reorderImages: vi.fn(), isReordering: false, refetch: vi.fn(),
  }),
}));

// PoiManager (mounted once addressConfirmed) makes its own API calls — stub
// it the same way InlineNearby's own test suites do. InlineNearby itself is
// left REAL here (unlike the parity suite) — that is the component under
// test for section ownership.
vi.mock('@/components/poi/PoiManager', () => ({
  PoiManager: () => <div data-testid="mock-poi-manager" />,
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

if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

import { ResidentialListingForm } from '../ResidentialListingForm';

function renderForm() {
  render(
    <MemoryRouter>
      <ResidentialListingForm initialPropertyType="apartment" onSwitchToGenericFlow={vi.fn()} navigate={vi.fn()} />
    </MemoryRouter>,
  );
}

function mockCreateSucceeds() {
  mockCreateMutate.mockImplementation((_payload: unknown, opts?: { onSuccess?: (d: { id: string }) => void }) => {
    mockListingData.current = { id: 'listing-1', addressConfirmed: false, latitude: null, longitude: null };
    opts?.onSuccess?.({ id: 'listing-1' });
  });
}

async function resolveManipal(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
  await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: /^use$/i }));
}

async function saveDraft(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListingData.current = undefined;
  mockCreateMutate.mockReset();
  mockUpdateMutate.mockReset();
  mockSubmitMutate.mockReset();
});

describe('ResidentialListingForm — Section recomposition (issue #2655)', () => {
  it('renders "Photos" and "Location & Nearby Places" as the section titles (not "Photos & location" / "Nearby places")', async () => {
    mockCreateSucceeds();
    const user = userEvent.setup();
    renderForm();
    await resolveManipal(user);
    await user.type(screen.getByLabelText(/price \(inr\)/i), '90 lakh');
    await saveDraft(user);

    // Scoped to the section heading (h2) — InlinePhotos also renders its
    // own "Photos" label, so a bare getByText would be ambiguous.
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Photos' })).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 2, name: 'Location & Nearby Places' })).toBeInTheDocument();
    expect(screen.queryByText('Photos & location')).not.toBeInTheDocument();
    expect(screen.queryByText('Nearby places')).not.toBeInTheDocument();
  });

  it('the Photos section carries no pin-location control; the Location & Nearby Places section owns the single MapPin instance', async () => {
    mockCreateSucceeds();
    const user = userEvent.setup();
    renderForm();
    await resolveManipal(user);
    await user.type(screen.getByLabelText(/price \(inr\)/i), '90 lakh');
    await saveDraft(user);

    const photosSection = (await screen.findByRole('heading', { level: 2, name: 'Photos' })).closest('section') as HTMLElement;
    expect(photosSection).not.toBeNull();
    expect(within(photosSection).queryByTestId('map-pin-open-picker')).not.toBeInTheDocument();
    expect(within(photosSection).queryByText(/^Location$/)).not.toBeInTheDocument();

    const locationSection = screen.getByText('Location & Nearby Places').closest('section') as HTMLElement;
    expect(locationSection).not.toBeNull();
    expect(within(locationSection).getByTestId('map-pin-open-picker')).toBeInTheDocument();
    expect(within(locationSection).getByText(/^Location$/)).toBeInTheDocument();

    // Single authoritative picker control in the whole mounted tree — no
    // second picker/location model was introduced by the relocation.
    expect(screen.getAllByTestId('map-pin-open-picker')).toHaveLength(1);
  });

  it('resolved-but-not-pinned state: exactly ONE actionable "Pin location on map" control exists (no InlineNearby duplicate)', async () => {
    // Reviewer finding on head acf4bfb03 — InlineNearby's OWN "Pin location on
    // map" CTA (rendered when locationResolved && onOpenPicker && !addressConfirmed,
    // added in #2647 to preview this move) is a SEPARATE control with the
    // IDENTICAL accessible name to MapPin's. Co-locating both in one section
    // without dropping InlineNearby's onOpenPicker produces two adjacent,
    // identically-labelled actions wired to the same picker. This is the
    // "resolved/not-pinned" state that surfaces it: addressConfirmed is still
    // false (no draft-hydration/refetch to flip it), and locationResolved is
    // true because the locality search above already resolved.
    mockCreateSucceeds();
    const user = userEvent.setup();
    renderForm();
    await resolveManipal(user);
    await user.type(screen.getByLabelText(/price \(inr\)/i), '90 lakh');
    await saveDraft(user);

    await screen.findByRole('heading', { level: 2, name: 'Location & Nearby Places' });

    // getAllByRole over the ACCESSIBLE NAME both controls share — this is
    // exactly the axis a strict-mode getByRole would throw on, and exactly
    // what a screen-reader user or a Playwright getByRole selector would hit.
    expect(screen.getAllByRole('button', { name: /pin location on map/i })).toHaveLength(1);
    // InlineNearby's own CTA testid must not exist at all in this recomposed
    // panel — only its locality/status copy is retained.
    expect(screen.queryByTestId('inline-nearby-open-picker')).not.toBeInTheDocument();
  });

  it('confirming the pin from Location & Nearby Places persists it (single picker, single confirm path) and the section reflects the confirmed pin', async () => {
    mockCreateSucceeds();
    mockUpdateMutate.mockImplementation((_payload, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    const user = userEvent.setup();
    renderForm();
    await resolveManipal(user);
    await user.type(screen.getByLabelText(/price \(inr\)/i), '90 lakh');
    await saveDraft(user);

    const locationSection = screen.getByText('Location & Nearby Places').closest('section') as HTMLElement;
    await user.click(within(locationSection).getByTestId('map-pin-open-picker'));
    await user.click(await screen.findByTestId('mock-address-picker-confirm'));

    // Persisted through the SAME useResidentialLocation instance the form
    // already owned — no second location model or picker was introduced.
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      { latitude: 13.34, longitude: 74.74, addressConfirmed: true },
      expect.any(Object),
    );
    // MapPin's own local pinConfirmed state (set by confirmPin(), independent
    // of the mocked server refetch) now shows the confirmed banner, still
    // inside the SAME Location & Nearby Places section.
    expect(within(locationSection).getByTestId('map-pin-status')).toHaveTextContent('Pin confirmed');
  });
});
