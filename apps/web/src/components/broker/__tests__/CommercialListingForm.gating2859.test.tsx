/**
 * #2859 B3 — CommercialListingForm form-level gating, replacement for
 * e2e/commercial-create-listing-1684.spec.ts (csv33). The spec's navigation through
 * /broker/listings/new is STALE (journey selector, NewListingJourneyRouting.test.tsx:99-103),
 * so the form is mounted directly with initialPropertyType (parity(C) pattern) instead of
 * via "Switch flow".
 *
 * The Radix Select is replaced by a FILE-SCOPED native <select> pass-through (SelectTrigger
 * keeps its id so `#hubType` etc. still resolve), so every Select pick gesture is RETAIN
 * (R_injected, row C.select); what is proven is the form's field gating / vocab / payload
 * GIVEN the picked value. Payloads are client requests only.
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockCreateMutate = vi.hoisted(() => vi.fn());
const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());
const listing = vi.hoisted(() => ({
  current: undefined as { id: string; addressConfirmed: boolean; latitude: number | null; longitude: number | null } | undefined,
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/hooks/useBrokerListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBrokerListings')>();
  return {
    ...actual,
    useCreateListing: () => ({ mutate: mockCreateMutate, isPending: false }),
    useUpdateListing: () => ({ mutate: mockUpdateMutate, isPending: false }),
    useSubmitListing: () => ({ mutate: vi.fn(), isPending: false }),
    useGetListing: () => ({ data: listing.current }),
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
vi.mock('@/components/broker/residential/InlineNearby', () => ({ InlineNearby: () => <div data-testid="mock-inline-nearby" /> }));
vi.mock('@/lib/geocode', () => ({
  searchNominatim: vi.fn().mockResolvedValue([
    { lat: 13.34, lon: 74.74, display_name: 'Manipal, Udupi District, Karnataka, India', address: { suburb: 'Manipal', city: 'Udupi' } },
  ]),
  reverseGeocode: vi.fn(),
}));
vi.mock('@/components/broker/AddressPicker', () => ({ AddressPicker: () => null }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: ReactNode }) => (
    <select data-testid="select-pass-through" value={value ?? ''} onChange={(e) => onValueChange?.(e.target.value)}>
      <option value="">--</option>
      {children}
    </select>
  ),
  SelectTrigger: ({ id }: { id?: string; children?: ReactNode }) => (id ? <span id={id} data-select-trigger /> : null),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectLabel: () => null,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

import { CommercialListingForm } from '../CommercialListingForm';

type PT = 'commercial' | 'commercial_building' | 'warehouse' | 'commercial_land';
function renderForm(pt: PT) {
  return render(
    <MemoryRouter>
      <CommercialListingForm initialPropertyType={pt} onSwitchToGenericFlow={vi.fn()} navigate={vi.fn()} />
    </MemoryRouter>,
  );
}
const has = (id: string) => document.getElementById(id) !== null;
const selectOf = (id: string) => {
  const s = document.getElementById(id)?.closest('select');
  if (!s) throw new Error(`no pass-through select for #${id}`);
  return s as HTMLSelectElement;
};
const optionTexts = (id: string) => Array.from(selectOf(id).options).map((o) => o.textContent ?? '');
function pick(id: string, text: string) {
  const sel = selectOf(id);
  const opt = Array.from(sel.options).find((o) => o.textContent === text);
  if (!opt) throw new Error(`no option "${text}" in #${id}`);
  fireEvent.change(sel, { target: { value: opt.value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  listing.current = undefined;
  mockCreateMutate.mockImplementation((_p: unknown, opts?: { onSuccess?: (d: { id: string }) => void }) => {
    listing.current = { id: 'listing-2859c', addressConfirmed: true, latitude: 13.34, longitude: 74.74 };
    opts?.onSuccess?.({ id: 'listing-2859c' });
  });
  mockUpdateMutate.mockImplementation((_p: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
});

describe('CommercialListingForm — subtype field gating (#2859 B3 csv33 C1)', () => {
  it('C1 SHOP: nothing subtype-specific before the pick; after SHOP floorChoice/hubType(shop vocab)/occupancy, no office or floorMode', () => {
    renderForm('commercial');
    expect(has('floorChoice')).toBe(false);
    expect(has('officeSeats')).toBe(false);
    pick('commercialSubtype', 'Shop');
    expect(has('floorChoice')).toBe(true);
    expect(has('hubType')).toBe(true);
    expect(has('occupancyStatus')).toBe(true);
    expect(has('officeSeats')).toBe(false);
    expect(has('floorMode')).toBe(false);
    expect(optionTexts('hubType')).toContain('Mall');
    expect(optionTexts('hubType')).not.toContain('IT park');
  });

  it('C1 OFFICE: office seats/cabins/meeting rooms + office hub vocab; no occupancy status', () => {
    renderForm('commercial');
    pick('commercialSubtype', 'Office');
    expect(has('officeSeats')).toBe(true);
    expect(has('officeCabins')).toBe(true);
    expect(has('officeMeetingRooms')).toBe(true);
    expect(has('occupancyStatus')).toBe(false);
    expect(optionTexts('hubType')).toContain('IT park');
    expect(optionTexts('hubType')).not.toContain('Mall');
  });

  it('C1 BUILDING: no subtype picker; floorMode/powerLoadKva/occupancy present; floorChoice/hubType/officeSeats absent', () => {
    renderForm('commercial_building');
    expect(has('commercialSubtype')).toBe(false);
    expect(has('floorMode')).toBe(true);
    expect(has('powerLoadKva')).toBe(true);
    expect(has('occupancyStatus')).toBe(true);
    expect(has('floorChoice')).toBe(false);
    expect(has('hubType')).toBe(false);
    expect(has('officeSeats')).toBe(false);
  });

  it('C1 WAREHOUSE: clear height/loading bays/truck access/flooring present; occupancy/floorMode/floorChoice absent', () => {
    renderForm('warehouse');
    expect(has('warehouseClearHeightFt')).toBe(true);
    expect(has('warehouseLoadingBays')).toBe(true);
    expect(screen.getByRole('switch', { name: /truck access/i })).toBeInTheDocument();
    expect(has('warehouseFlooring')).toBe(true);
    expect(has('occupancyStatus')).toBe(false);
    expect(has('floorMode')).toBe(false);
    expect(has('floorChoice')).toBe(false);
  });

  it('C1 LAND: zoning/ownership/approvals present, warehouse fields absent; More details hides washrooms/parking/utilities but keeps suitable uses', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderForm('commercial_land');
    expect(has('commercialZoning')).toBe(true);
    expect(has('commercialOwnership')).toBe(true);
    expect(has('commercialApprovals')).toBe(true);
    expect(has('warehouseClearHeightFt')).toBe(false);
    await user.click(screen.getByRole('button', { name: /more details/i }));
    expect(screen.getByTestId('chip-group-suitable-uses')).toBeInTheDocument();
    expect(screen.queryByText('Public washrooms')).not.toBeInTheDocument();
    expect(screen.queryByText('Private parking')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-group-utilities')).not.toBeInTheDocument();
  });
});

describe('CommercialListingForm — purpose gating + vocab (#2859 B3 csv33 C2/C3)', () => {
  it('C2 Sale shows price + yield and hides rent/lease-term; Rent / Lease flips both sets', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderForm('commercial_building');
    expect(screen.getByLabelText(/price \(inr\)/i)).toBeInTheDocument();
    expect(has('expectedRentalYieldPct')).toBe(true);
    expect(has('monthlyRent')).toBe(false);
    expect(has('leaseTermMonths')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'For Rent / Lease' }));
    expect(has('monthlyRent')).toBe(true);
    expect(has('leaseTermMonths')).toBe(true);
    expect(has('leaseEscalationPct')).toBe(true);
    expect(screen.queryByLabelText(/price \(inr\)/i)).not.toBeInTheDocument();
    expect(has('expectedRentalYieldPct')).toBe(false);
  });

  it('C3 the purpose group offers exactly For Sale and For Rent / Lease (no For Lease)', () => {
    renderForm('commercial_building');
    const group = screen.getByRole('group', { name: 'Listing purpose' });
    expect(within(group).getByRole('button', { name: 'For Sale' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'For Rent / Lease' })).toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: 'For Lease' })).not.toBeInTheDocument();
    expect(within(group).getAllByRole('button')).toHaveLength(2);
  });
});

describe('CommercialListingForm — chips + payload (#2859 B3 csv33 C4i-k / C5i)', () => {
  it('C4i-k SHOP utilities and suitable-use chips toggle on; Co-working is absent for SHOP but offered for OFFICE', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderForm('commercial');
    pick('commercialSubtype', 'Shop');
    await user.click(screen.getByRole('button', { name: /more details/i }));
    const utilities = screen.getByTestId('chip-group-utilities');
    await user.click(within(utilities).getByRole('button', { name: 'CCTV' }));
    await user.click(within(utilities).getByRole('button', { name: 'Internet' }));
    expect(within(utilities).getByRole('button', { name: 'CCTV' })).toHaveAttribute('data-state', 'on');
    expect(within(utilities).getByRole('button', { name: 'Internet' })).toHaveAttribute('data-state', 'on');
    const uses = screen.getByTestId('chip-group-suitable-uses');
    await user.click(within(uses).getByRole('button', { name: 'Retail' }));
    expect(within(uses).getByRole('button', { name: 'Retail' })).toHaveAttribute('data-state', 'on');
    expect(within(uses).queryByRole('button', { name: 'Co-working' })).not.toBeInTheDocument();

    pick('commercialSubtype', 'Office');
    expect(within(screen.getByTestId('chip-group-suitable-uses')).getByRole('button', { name: 'Co-working' })).toBeInTheDocument();
  });

  it('C5i BUILDING + SALE draft payload carries floorMode WHOLE_BUILDING and no commercialSubtype', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderForm('commercial_building');
    await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
    await user.click(screen.getByRole('button', { name: 'Find location' }));
    await user.click(await screen.findByRole('button', { name: /^use$/i }));
    await user.type(screen.getByLabelText(/listing title/i), '3-storey commercial building, Udupi');
    await user.type(screen.getByLabelText(/price \(inr\)/i), '3.5 crore');
    pick('floorMode', 'Whole building');
    await user.click(screen.getAllByRole('button', { name: /save draft/i })[0]);
    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalledTimes(1));
    const payload = mockCreateMutate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.floorMode).toBe('WHOLE_BUILDING');
    expect(payload.propertyType).toBe('commercial_building');
    // wire semantics: the JSON body (undefined keys dropped) carries no commercialSubtype
    expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty('commercialSubtype');
  });
});
