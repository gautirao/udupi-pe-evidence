/**
 * ResidentialListingForm — #2387 review follow-up: the existing review-mode
 * tests (parity.test.tsx) prove the "Back to editing" button is present and
 * that submit gating works, but never assert that entered form data actually
 * SURVIVES the Review -> Back/Edit transition. This is the state-preservation
 * contract the composition-root's `mode` state (owned by
 * useResidentialListingDraft) and the untouched form-state hook together
 * guarantee: switching `mode` does not remount (and therefore does not reset)
 * useResidentialListingFormState.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockCreateMutate = vi.hoisted(() => vi.fn());
const mockListingData = vi.hoisted(() => ({
  current: undefined as { id: string; addressConfirmed: boolean; latitude: number | null; longitude: number | null } | undefined,
}));
const mockImageCount = vi.hoisted(() => ({ current: 0 }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/hooks/useBrokerListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBrokerListings')>();
  return {
    ...actual,
    useCreateListing: () => ({ mutate: mockCreateMutate, isPending: false }),
    useUpdateListing: () => ({ mutate: vi.fn(), isPending: false }),
    useSubmitListing: () => ({ mutate: vi.fn(), isPending: false }),
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

import { ResidentialListingForm } from '../ResidentialListingForm';

function renderForm() {
  render(
    <MemoryRouter>
      <ResidentialListingForm
        initialPropertyType="apartment"
        onSwitchToGenericFlow={vi.fn()}
        navigate={vi.fn()}
      />
    </MemoryRouter>,
  );
}

function mockCreateSucceedsWithAddressConfirmed() {
  mockCreateMutate.mockImplementation((_payload: unknown, opts?: { onSuccess?: (d: { id: string }) => void }) => {
    mockListingData.current = { id: 'listing-1', addressConfirmed: true, latitude: 13.34, longitude: 74.74 };
    opts?.onSuccess?.({ id: 'listing-1' });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListingData.current = undefined;
  mockImageCount.current = 3; // >= 3 photos gate satisfied, so Review is reachable
  mockCreateMutate.mockReset();
});

describe('ResidentialListingForm — Review -> Back to editing preserves entered data', () => {
  it('title, locality, bedrooms and built-up area entered before Review are all still present after Back to editing', async () => {
    mockCreateSucceedsWithAddressConfirmed();
    const user = userEvent.setup();
    renderForm();

    // Enter representative field values across multiple sections.
    await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
    await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^use$/i }));

    await user.type(screen.getByLabelText(/listing title/i), '3 BHK Apartment in Manipal');
    await user.type(screen.getByLabelText(/price \(inr\)/i), '50 lakh');

    const bedroomsGroup = document.getElementById('bedrooms');
    expect(bedroomsGroup).not.toBeNull();
    await user.click(within(bedroomsGroup as HTMLElement).getByRole('radio', { name: '3 BHK' }));

    await user.click(screen.getByRole('button', { name: /more details.*ownership/i }));
    const builtAreaInput = document.getElementById('builtArea');
    expect(builtAreaInput).not.toBeNull();
    await user.type(builtAreaInput as HTMLElement, '1150');

    // Reach Review (all gates satisfied: price, locality, images, pin,
    // bedrooms+builtArea for apartment).
    await user.click(screen.getByRole('button', { name: /^review$/i }));
    await waitFor(() => expect(screen.getByText('Review your listing')).toBeInTheDocument());

    // Back to editing. Two controls match this name in review mode (the
    // top "← Back to editing" link-style button and the sticky-footer
    // "Back to editing" button) — either exercises the same onBackToEdit
    // handler, so the first is sufficient.
    await user.click(screen.getAllByRole('button', { name: /back to editing/i })[0]);
    await waitFor(() => expect(screen.queryByText('Review your listing')).not.toBeInTheDocument());

    // ---- The actual substance of this test: nothing was reset. ----
    expect(screen.getByLabelText(/listing title/i)).toHaveValue('3 BHK Apartment in Manipal');
    expect((screen.getByLabelText(/search for a location/i) as HTMLInputElement).value).toMatch(/Manipal/);

    const bedroomsGroupAfter = document.getElementById('bedrooms');
    expect(within(bedroomsGroupAfter as HTMLElement).getByRole('radio', { name: '3 BHK' })).toHaveAttribute('aria-checked', 'true');

    // "More details" is collapsed again by default on re-entering edit mode
    // (moreDetailsOpen is local UI state, not persisted data) — reopen it to
    // read the builtArea value back.
    await user.click(screen.getByRole('button', { name: /more details.*ownership/i }));
    expect(document.getElementById('builtArea')).toHaveValue(1150);

    // The buyer preview card (driven by the same form state) also still
    // reflects the entered title/locality — a second, independent read of
    // the same underlying state.
    const previewCard = screen.getByTestId('buyer-preview-card');
    expect(within(previewCard).getByText('3 BHK Apartment in Manipal')).toBeInTheDocument();
  });
});
