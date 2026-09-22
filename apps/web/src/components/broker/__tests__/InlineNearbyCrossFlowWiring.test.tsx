/**
 * Issue #2647 — cross-flow wiring proof for InlineNearby's `publicLoc` /
 * `onOpenPicker` props, per the owner decision on PR #2654 (comment
 * 5773021097, Option B: extend the same fidelity to all three listing flows).
 *
 * WHY THIS FILE EXISTS. Every pre-existing form suite stubs InlineNearby out
 * as a bare `<div data-testid="mock-inline-nearby" />`, so none of them can
 * observe what the forms actually pass to it — a call site could be left
 * unwired, or wired to the wrong field, and all of them would stay green.
 * Here InlineNearby is mocked as a PROP RECORDER instead, and the REAL
 * CommercialListingForm / AgriculturalListingForm are mounted and driven
 * through resolve -> save-draft, so the assertions are about the forms'
 * genuine wiring rather than about a harness that re-derives it.
 *
 * The Residential call site is covered separately, and more deeply, by
 * residential/__tests__/InlineNearby.pickerWiring.test.tsx (which proves the
 * CTA raises MapPin's EXISTING dialog rather than a second picker). The
 * shared-architecture claim is what makes that proof transfer: all three
 * flows hand InlineNearby the same two values drawn from the same
 * useResidentialLocation instance.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockCreateMutate = vi.hoisted(() => vi.fn());
const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockSubmitMutate = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());
const mockListingData = vi.hoisted(() => ({
  current: undefined as { id: string; addressConfirmed: boolean; latitude: number | null; longitude: number | null } | undefined,
}));

/** Every set of props InlineNearby has been rendered with, in order. */
const inlineNearbyProps = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));

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

// The prop recorder. Renders the identifying text the real component would,
// so the surrounding form still behaves normally.
vi.mock('@/components/broker/residential/InlineNearby', () => ({
  InlineNearby: (props: Record<string, unknown>) => {
    inlineNearbyProps.calls.push(props);
    return <div data-testid="mock-inline-nearby" />;
  },
}));

const MANIPAL_RESULT = vi.hoisted(() => ({
  lat: 13.34,
  lon: 74.74,
  display_name: 'Manipal, Udupi District, Karnataka, India',
  address: { suburb: 'Manipal', city: 'Udupi' },
}));

/** What derivePublicLoc() produces for MANIPAL_RESULT — suburb + city. */
const PUBLIC_LOC = 'Manipal, Udupi';
/** The PRIVATE geocoded string that must never be handed to InlineNearby. */
const PRIVATE_FORMATTED = MANIPAL_RESULT.display_name;

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

import { CommercialListingForm } from '../CommercialListingForm';
import { AgriculturalListingForm } from '../AgriculturalListingForm';

function lastProps() {
  const { calls } = inlineNearbyProps;
  if (calls.length === 0) throw new Error('InlineNearby was never rendered — the form did not mount it');
  return calls[calls.length - 1];
}

async function resolveLocation(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
  await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: /^use$/i }));
}

/** Draft create succeeds; `addressConfirmed` models the SERVER flag afterwards. */
function mockCreateSucceeds(addressConfirmed: boolean) {
  mockCreateMutate.mockImplementation((_payload: unknown, opts?: { onSuccess?: (d: { id: string }) => void }) => {
    mockListingData.current = {
      id: 'listing-1',
      addressConfirmed,
      latitude: addressConfirmed ? 13.34 : null,
      longitude: addressConfirmed ? 74.74 : null,
    };
    opts?.onSuccess?.({ id: 'listing-1' });
  });
}

async function saveDraft(user: ReturnType<typeof userEvent.setup>) {
  const buttons = screen.getAllByRole('button', { name: /save draft/i });
  await user.click(buttons[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  inlineNearbyProps.calls = [];
  mockListingData.current = undefined;
  mockCreateMutate.mockReset();
  mockUpdateMutate.mockReset();
  mockSubmitMutate.mockReset();
});

describe('CommercialListingForm — InlineNearby wiring (#2647 Option B)', () => {
  it('passes the COARSE publicLoc and an onOpenPicker callback once a locality resolves', async () => {
    mockCreateSucceeds(false);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CommercialListingForm initialPropertyType="warehouse" onSwitchToGenericFlow={vi.fn()} navigate={vi.fn()} />
      </MemoryRouter>,
    );

    await resolveLocation(user);
    await user.type(screen.getByLabelText(/price \(inr\)/i), '90 lakh');
    await saveDraft(user);

    await waitFor(() => expect(screen.getByTestId('mock-inline-nearby')).toBeInTheDocument());

    const props = lastProps();
    expect(props.publicLoc).toBe(PUBLIC_LOC);
    expect(props.locationResolved).toBe(true);
    expect(typeof props.onOpenPicker).toBe('function');
    expect(typeof props.onChangeLocation).toBe('function');
    // PRIVACY: the private geocoded string must never cross this boundary.
    expect(props.publicLoc).not.toBe(PRIVATE_FORMATTED);
    expect(String(props.publicLoc)).not.toMatch(/Karnataka|India|13\.34|74\.74/);
  });

  it('withholds onOpenPicker while nothing is resolved (no seed coordinate to open the picker on)', async () => {
    mockCreateSucceeds(false);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CommercialListingForm initialPropertyType="warehouse" onSwitchToGenericFlow={vi.fn()} navigate={vi.fn()} />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/price \(inr\)/i), '90 lakh');
    await saveDraft(user);

    await waitFor(() => expect(screen.getByTestId('mock-inline-nearby')).toBeInTheDocument());

    const props = lastProps();
    expect(props.onOpenPicker).toBeUndefined();
    expect(props.locationResolved).toBe(false);
  });
});

describe('AgriculturalListingForm — InlineNearby wiring (#2647 Option B)', () => {
  it('passes the COARSE publicLoc and an onOpenPicker callback once a locality resolves', async () => {
    mockCreateSucceeds(false);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AgriculturalListingForm onSwitchToGenericFlow={vi.fn()} navigate={vi.fn()} />
      </MemoryRouter>,
    );

    await resolveLocation(user);
    await user.type(screen.getByLabelText(/price \(inr\)/i), '78 lakh');
    await saveDraft(user);

    await waitFor(() => expect(screen.getByTestId('mock-inline-nearby')).toBeInTheDocument());

    const props = lastProps();
    expect(props.publicLoc).toBe(PUBLIC_LOC);
    expect(props.locationResolved).toBe(true);
    expect(typeof props.onOpenPicker).toBe('function');
    expect(typeof props.onChangeLocation).toBe('function');
    expect(props.publicLoc).not.toBe(PRIVATE_FORMATTED);
    expect(String(props.publicLoc)).not.toMatch(/Karnataka|India|13\.34|74\.74/);
  });

  it('withholds onOpenPicker while nothing is resolved (no seed coordinate to open the picker on)', async () => {
    mockCreateSucceeds(false);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AgriculturalListingForm onSwitchToGenericFlow={vi.fn()} navigate={vi.fn()} />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/price \(inr\)/i), '78 lakh');
    await saveDraft(user);

    await waitFor(() => expect(screen.getByTestId('mock-inline-nearby')).toBeInTheDocument());

    const props = lastProps();
    expect(props.onOpenPicker).toBeUndefined();
    expect(props.locationResolved).toBe(false);
  });
});
