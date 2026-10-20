/**
 * #2859 B3 — ResidentialListingForm location flow, replacement for
 * e2e/residential-create-listing-1722.spec.ts AC-4.1 (R2), AC-4.2 (R3), AC-4.3 (R4),
 * area chips (R10) and the confirmed-pin header (R11), csv210.
 *
 * Harness = ResidentialListingForm.locationNearbyRecomposition.test.tsx: real form,
 * real AddressSearch / MapPin / InlineNearby / StrengthMeter / BuyerPreviewCard.
 * Mocked: @/lib/geocode (UI behaviour given a geocode response only), AddressPicker
 * (a confirm button; the real picker is MapPin.pinDialog2859), PoiManager (a sentinel:
 * "nearby shows/hides" = InlineNearby mounts/unmounts PoiManager; the POI heading text
 * itself lives in PoiManager), useBrokerListings (STATEFUL fake: create/update mutate
 * write into the listing the next useGetListing render returns). Payloads are the
 * client request only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

type FakeListing = { id: string; addressConfirmed: boolean; latitude: number | null; longitude: number | null };
const mockCreateMutate = vi.hoisted(() => vi.fn());
const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());
const server = vi.hoisted(() => ({ listing: undefined as FakeListing | undefined, updates: 0 }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/hooks/useBrokerListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBrokerListings')>();
  return {
    ...actual,
    useCreateListing: () => ({ mutate: mockCreateMutate, isPending: false }),
    useUpdateListing: () => ({ mutate: mockUpdateMutate, isPending: false }),
    useSubmitListing: () => ({ mutate: vi.fn(), isPending: false }),
    useGetListing: () => ({ data: server.listing }),
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
vi.mock('@/components/poi/PoiManager', () => ({ PoiManager: () => <div data-testid="mock-poi-manager" /> }));

const FORWARD_RESULT = vi.hoisted(() => ({
  lat: 13.3492,
  lon: 74.7863,
  display_name: '123, MIT Road, Manipal, Udupi Taluk, Udupi District, Karnataka, 576104, India',
  address: { road: 'MIT Road', suburb: 'Manipal', city: 'Udupi', county: 'Udupi District', state: 'Karnataka', postcode: '576104', country: 'India' },
}));
vi.mock('@/lib/geocode', () => ({
  searchNominatim: vi.fn().mockResolvedValue([FORWARD_RESULT]),
  reverseGeocode: vi.fn(),
}));
vi.mock('@/components/broker/AddressPicker', () => ({
  AddressPicker: ({ onConfirm }: { onConfirm: (v: { lat: number; lng: number; address_confirmed: boolean }) => void }) => (
    <button type="button" data-testid="mock-address-picker-confirm" onClick={() => onConfirm({ lat: 13.3492, lng: 74.7863, address_confirmed: true })}>
      Mock confirm pin
    </button>
  ),
}));

if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

import { ResidentialListingForm } from '../ResidentialListingForm';

const PUBLIC_LOC = 'Manipal, Udupi';
const PRIVATE_ONLY_MARKERS = [/576104/, /taluk/i, /karnataka/i, /india/i];

function renderForm() {
  render(
    <MemoryRouter>
      <ResidentialListingForm initialPropertyType="apartment" onSwitchToGenericFlow={vi.fn()} navigate={vi.fn()} />
    </MemoryRouter>,
  );
}

type U = ReturnType<typeof userEvent.setup>;
async function resolve(user: U) {
  await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
  await user.click(screen.getByRole('button', { name: 'Find location' }));
  await user.click(await screen.findByRole('button', { name: /^use$/i }));
  await screen.findByText(/location confirmed —/i);
}
async function saveDraft(user: U) {
  await user.type(screen.getByLabelText(/price \(inr\)/i), '50 lakh');
  await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);
  await screen.findByTestId('map-pin-open-picker');
}
async function confirmPin(user: U) {
  await user.click(screen.getByTestId('map-pin-open-picker'));
  await user.click(await screen.findByTestId('mock-address-picker-confirm'));
}
const gateMet = (label: string) => {
  const li = within(screen.getByTestId('strength-meter-sidebar')).getByText(label).closest('li') as HTMLElement;
  return (li.querySelector('span') as HTMLElement).className.includes('border-primary');
};

beforeEach(() => {
  vi.clearAllMocks();
  server.listing = undefined;
  server.updates = 0;
  mockCreateMutate.mockImplementation((_p: unknown, opts?: { onSuccess?: (d: { id: string }) => void }) => {
    server.listing = { id: 'listing-2859', addressConfirmed: false, latitude: null, longitude: null };
    opts?.onSuccess?.({ id: 'listing-2859' });
  });
  mockUpdateMutate.mockImplementation((p: Partial<FakeListing>, opts?: { onSuccess?: () => void }) => {
    server.updates += 1;
    server.listing = { ...(server.listing as FakeListing), ...p };
    opts?.onSuccess?.();
  });
});

describe('ResidentialListingForm — location flow (#2859 B3 csv210)', () => {
  it('R2 AC-4.1: captions and buyer preview show only the public locality; the private string never reaches the preview', async () => {
    const user = userEvent.setup();
    renderForm();
    await saveDraft(user);
    await resolve(user);

    // positive control: the private formatted string IS on the page (AddressSearch's own chip)
    expect(document.body.textContent).toContain('576104');

    expect(screen.getByTestId('address-search-privacy-caption')).toHaveTextContent(`Buyers see only "${PUBLIC_LOC}".`);
    const preview = screen.getByTestId('buyer-preview-card');
    expect(within(preview).getByText(PUBLIC_LOC, { exact: true })).toBeInTheDocument();
    for (const m of PRIVATE_ONLY_MARKERS) expect(within(preview).queryByText(m)).not.toBeInTheDocument();

    await confirmPin(user);
    expect(within(preview).getByText(PUBLIC_LOC, { exact: true })).toBeInTheDocument();
    for (const m of PRIVATE_ONLY_MARKERS) expect(within(preview).queryByText(m)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /adjust pin/i }));
    expect(await screen.findByTestId('map-pin-privacy-caption')).toHaveTextContent(
      `Buyers see only "${PUBLIC_LOC}" — the exact pin and address stay private.`,
    );
  });

  it('R3 AC-4.2: "Location entered" and "Map pin confirmed" toggle independently', async () => {
    const user = userEvent.setup();
    renderForm();
    await saveDraft(user);
    expect(gateMet('Location entered')).toBe(false);
    expect(gateMet('Map pin confirmed')).toBe(false);
    await resolve(user);
    expect(gateMet('Location entered')).toBe(true);
    expect(gateMet('Map pin confirmed')).toBe(false);
    await confirmPin(user);
    await waitFor(() => expect(gateMet('Map pin confirmed')).toBe(true));
    expect(gateMet('Location entered')).toBe(true);
  });

  it('R4 AC-4.3: editing the query after pin-confirm hides nearby, disables the pin CTA and un-meets the pin gate (stateful fake)', async () => {
    const user = userEvent.setup();
    renderForm();
    await saveDraft(user);
    await resolve(user);
    expect(screen.queryByTestId('mock-poi-manager')).not.toBeInTheDocument();
    await confirmPin(user);
    expect(server.listing?.addressConfirmed).toBe(true);
    expect(await screen.findByTestId('mock-poi-manager')).toBeInTheDocument();
    expect(gateMet('Map pin confirmed')).toBe(true);
    const updatesBefore = server.updates;

    await user.type(screen.getByLabelText(/search for a location/i), ' extra');

    await waitFor(() => expect(screen.getByTestId('map-pin-open-picker')).toBeDisabled());
    expect(server.updates).toBe(updatesBefore + 1);
    expect(server.listing?.addressConfirmed).toBe(false);
    await waitFor(() => expect(screen.queryByTestId('mock-poi-manager')).not.toBeInTheDocument());
    expect(gateMet('Map pin confirmed')).toBe(false);
  });

  it('R11 confirmed-pin header: not-confirmed -> resolved-not-pinned -> pin-confirmed copy, PoiManager only in the last state', async () => {
    const user = userEvent.setup();
    renderForm();
    await saveDraft(user);
    const status = () => screen.getByTestId('inline-nearby-status');

    expect(status()).toHaveTextContent('Location not yet confirmed');
    expect(screen.getByText(/confirm the pin location above to see nearby places/i)).toBeInTheDocument();
    expect(screen.queryByTestId('mock-poi-manager')).not.toBeInTheDocument();

    await resolve(user);
    expect(status()).toHaveTextContent(/^Location resolved — Manipal, Udupi$/);
    expect(status()).not.toHaveTextContent('MIT Road');
    expect(status()).not.toHaveTextContent('576104');
    expect(screen.getByText(/a resolved locality is not a confirmed pin/i)).toBeInTheDocument();
    expect(screen.queryByText('Location not yet confirmed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-poi-manager')).not.toBeInTheDocument();

    await confirmPin(user);
    await waitFor(() => expect(status()).toHaveTextContent(/^Pin confirmed — Manipal, Udupi$/));
    expect(screen.getByText(/nearby places will be shown for this location/i)).toBeInTheDocument();
    expect(screen.queryByTestId('inline-nearby-open-picker')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-poi-manager')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /change location/i }));
    await waitFor(() => expect(status()).toHaveTextContent('Location not yet confirmed'));
    expect(screen.queryByTestId('mock-poi-manager')).not.toBeInTheDocument();
  });

  it('R10 area chips: Carpet and Built-up chips set the inputs, track manual edits, and flow into the draft payload', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/price \(inr\)/i), '50 lakh');
    const groups = screen.getAllByRole('radiogroup', { name: /common area sizes/i });
    const carpet = document.querySelector<HTMLInputElement>('#carpetArea')!;
    const built = document.querySelector<HTMLInputElement>('#builtArea')!;
    const c1200 = within(groups[0]).getByRole('radio', { name: '1,200 sqft' });

    expect(c1200).toHaveAttribute('aria-checked', 'false');
    await user.click(c1200);
    expect(carpet.value).toBe('1200');
    expect(c1200).toHaveAttribute('aria-checked', 'true');
    await user.clear(carpet);
    await user.type(carpet, '1173');
    expect(c1200).toHaveAttribute('aria-checked', 'false');
    await user.clear(carpet);
    await user.type(carpet, '1500');
    expect(within(groups[0]).getByRole('radio', { name: '1,500 sqft' })).toHaveAttribute('aria-checked', 'true');

    const b800 = within(groups[1]).getByRole('radio', { name: '800 sqft' });
    expect(b800).toHaveAttribute('aria-checked', 'false');
    await user.click(b800);
    expect(built.value).toBe('800');
    expect(b800).toHaveAttribute('aria-checked', 'true');
    expect(carpet.value).toBe('1500');

    await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);
    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalledTimes(1));
    expect(mockCreateMutate.mock.calls[0][0]).toEqual(expect.objectContaining({ carpetArea: 1500, builtArea: 800 }));
  });
});
