/**
 * Issue #2837 (#2750 PR-6 batch C, stage B1 part 2) — replacement coverage for the
 * rows of the legacy e2e/journey/broker-listing-creation.spec.ts (DL1) that no
 * existing component test covers at the HTTP boundary:
 *
 *   DL1-2   each residential subtype radio (House / Villa / Residential Plot) is
 *           selectable (aria-checked) AND the saved POST /api/listings body carries
 *           the matching propertyType.
 *   DL1-4   residential_plot: #plotArea is rendered only for the plot subtype
 *           (negative on House sits next to a positive control in the same render),
 *           and the typed land area reaches the saved body.
 *   DL1-9/10 pin flow: the picker dialog opens once a location is resolved, and
 *           confirming the pin issues PUT /api/listings/{id} with EXACTLY
 *           {latitude, longitude, addressConfirmed:true}; the dialog closes and the
 *           confirmed status shows.
 *
 * BOUNDARY (disclosed): the real ResidentialListingForm, its draft/state/location
 * hooks, the real useCreateListing / useUpdateListing / useGetListing and the real
 * radio selector run. Only the HTTP client (`@/lib/api`) is mocked; no data hook is
 * mocked and the query cache is never seeded. Two further boundary stubs, both
 * non-data: `@/lib/geocode` (the external Nominatim HTTP call) and the Leaflet map
 * widget `AddressPicker` (a button that reports a fixed pin through the real
 * `onConfirm` -> confirmPin path). `@/hooks/use-toast` and the Supabase storage
 * client are inert stubs. No auth context is needed or mocked.
 *
 * NOT covered here (honest gap, see docs/testing/e2e-retirement-map-pr6c.md DL1-7):
 * the legacy spec asserted that #price is restored after reloading ?draftId=<id>.
 * The product does NOT restore price (ResidentialTermsSection passes
 * initialRupees={null}); the existing draftRecovery.repro test documents that. A
 * green "price restored" test cannot be written without a production change.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiPost = vi.hoisted(() => vi.fn());
const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPut = vi.hoisted(() => vi.fn());
const mockApiDelete = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet, post: mockApiPost, put: mockApiPut, delete: mockApiDelete },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(msg: string, status: number, body: unknown) {
      super(msg);
      this.status = status;
      this.body = body;
    }
  },
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } },
}));

const MANIPAL_RESULT = vi.hoisted(() => ({
  lat: 13.34,
  lon: 74.74,
  display_name: 'Manipal, Udupi District, Karnataka, India',
  address: { suburb: 'Manipal', city: 'Udupi' },
}));

// External Nominatim HTTP call (not app data) - boundary stub.
vi.mock('@/lib/geocode', () => ({
  searchNominatim: vi.fn().mockResolvedValue([MANIPAL_RESULT]),
  reverseGeocode: vi.fn(),
}));

// Leaflet map widget stub: reports a fixed pin through the REAL onConfirm -> confirmPin path.
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
import { searchNominatim } from '@/lib/geocode';

type Subtype = 'apartment' | 'house' | 'villa' | 'residential_plot';

// --- tolerant matchers (named consts with accept AND reject self-tests) -------------------------
const RADIO_NAME_RE: Record<Subtype, RegExp> = {
  apartment: /^\s*apartment\s*$/i,
  house: /^\s*house\s*$/i,
  villa: /^\s*villa\s*$/i,
  residential_plot: /^\s*residential\s+plot\s*$/i,
};
const PIN_DIALOG_RE = /pin\s+the\s+exact\s+location/i;

const LISTING_ID = 'listing-2837';

interface ServedListing {
  id: string;
  addressConfirmed: boolean;
  latitude: number | null;
  longitude: number | null;
  locality: string;
}
const served: { current: ServedListing } = {
  current: { id: LISTING_ID, addressConfirmed: false, latitude: null, longitude: null, locality: 'Manipal' },
};

function wireHttp() {
  served.current = { id: LISTING_ID, addressConfirmed: false, latitude: null, longitude: null, locality: 'Manipal' };
  mockApiPost.mockResolvedValue({ id: LISTING_ID });
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/images') || url.includes('/pois')) return Promise.resolve([]);
    return Promise.resolve({ ...served.current });
  });
  mockApiPut.mockImplementation((_url: string, body: Partial<ServedListing>) => {
    served.current = { ...served.current, ...body };
    return Promise.resolve({ ...served.current });
  });
}

function renderForm(initialPropertyType: Subtype) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResidentialListingForm initialPropertyType={initialPropertyType} onSwitchToGenericFlow={() => {}} navigate={vi.fn()} />
    </QueryClientProvider>,
  );
}

function subtypeRadio(type: Subtype): HTMLElement {
  const group = screen.getByRole('radiogroup', { name: 'Property type' });
  return within(group).getByRole('radio', { name: RADIO_NAME_RE[type] });
}

async function fillTitleAndPrice(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Listing title *'), 'Subtype create 2837');
  await user.type(screen.getByLabelText('Price (INR) *'), '5000000');
}

async function saveDraftAndGetPostBody(user: ReturnType<typeof userEvent.setup>): Promise<Record<string, unknown>> {
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));
  const [url, body] = mockApiPost.mock.calls[0] as [string, Record<string, unknown>];
  expect(url).toBe('/api/listings');
  return body;
}

beforeEach(() => {
  mockApiPost.mockReset();
  mockApiGet.mockReset();
  mockApiPut.mockReset();
  mockApiDelete.mockReset();
  vi.mocked(searchNominatim).mockClear();
  wireHttp();
});

describe('matcher self-tests (accept AND reject)', () => {
  it('RADIO_NAME_RE accepts the real card labels and rejects every other subtype / lookalike', () => {
    const labels: Record<Subtype, string> = {
      apartment: 'Apartment',
      house: 'House',
      villa: 'Villa',
      residential_plot: 'Residential Plot',
    };
    (Object.keys(RADIO_NAME_RE) as Subtype[]).forEach((type) => {
      expect(RADIO_NAME_RE[type].test(labels[type])).toBe(true);
      expect(RADIO_NAME_RE[type].test(labels[type].toUpperCase())).toBe(true);
      (Object.keys(labels) as Subtype[])
        .filter((other) => other !== type)
        .forEach((other) => expect(RADIO_NAME_RE[type].test(labels[other])).toBe(false));
    });
    expect(RADIO_NAME_RE.house.test('Warehouse / Godown')).toBe(false);
    expect(RADIO_NAME_RE.house.test('Greenhouse')).toBe(false);
    expect(RADIO_NAME_RE.residential_plot.test('Commercial Land')).toBe(false);
  });

  it('PIN_DIALOG_RE accepts the dialog title in any case/spacing and rejects another dialog', () => {
    expect(PIN_DIALOG_RE.test('Pin the exact location')).toBe(true);
    expect(PIN_DIALOG_RE.test('PIN  THE  EXACT  LOCATION')).toBe(true);
    expect(PIN_DIALOG_RE.test('Pin location on map')).toBe(false);
    expect(PIN_DIALOG_RE.test('Sign in')).toBe(false);
  });
});

const LOCATION_CONFIRMED_RE = /location\s+confirmed\s*[—–-]\s*manipal/i;
const NOT_FOUND_RE = /no\s+results\s+for\s+["“]?manipal["”]?/i;

describe('DL1-3: "Find location" button click path (CX-1)', () => {
  it('LOCATION_CONFIRMED_RE self-test: accepts the banner (dash variants, any case), rejects other copy', () => {
    expect(LOCATION_CONFIRMED_RE.test('Location confirmed — Manipal, Udupi District')).toBe(true);
    expect(LOCATION_CONFIRMED_RE.test('location  confirmed - Manipal')).toBe(true);
    expect(LOCATION_CONFIRMED_RE.test('Pin confirmed — Manipal')).toBe(false);
    expect(LOCATION_CONFIRMED_RE.test('Location confirmed — Mangalore')).toBe(false);
    expect(LOCATION_CONFIRMED_RE.test('Search above or use your current location')).toBe(false);
  });

  describe('with a controlled clock (CX-2: deterministic, no real waiting)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('clicking "Find location" BEFORE the 400 ms debounce elapses fires the geocode request itself, lists a "Use" result, and "Use" shows "Location confirmed — Manipal..."', async () => {
      // fireEvent (synchronous, no userEvent delays) under fake timers: the clock only moves when this test advances it,
      // so the click provably happens before the 400 ms debounce, however slow the runner is.
      const geocode = vi.mocked(searchNominatim);
      renderForm('apartment');

      fireEvent.change(screen.getByLabelText(/search for a location/i), { target: { value: 'Manipal' } });
      expect(geocode).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: /^use$/i })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /^find location$/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      // Clock still at 0 ms: the request came from the button, not from the debounce.
      expect(geocode).toHaveBeenCalledTimes(1);
      expect(geocode).toHaveBeenCalledWith('Manipal');
      const useBtn = screen.getByRole('button', { name: /^use$/i });
      expect(screen.queryByText(LOCATION_CONFIRMED_RE)).not.toBeInTheDocument();

      fireEvent.click(useBtn);
      expect(screen.getByText(LOCATION_CONFIRMED_RE)).toBeInTheDocument();

      // Advance well past the debounce: the click cleared it, so there is still exactly one search.
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(geocode).toHaveBeenCalledTimes(1);
    });

    it.each(['returns no results', 'rejects'] as const)(
      'CX-6: a VALID query "Manipal" whose geocoder %s shows the not-found alert and no "Use" result',
      async (mode) => {
        const geocode = vi.mocked(searchNominatim);
        if (mode === 'rejects') geocode.mockRejectedValueOnce(new Error('geocoder down'));
        else geocode.mockResolvedValueOnce([]);
        renderForm('apartment');

        fireEvent.change(screen.getByLabelText(/search for a location/i), { target: { value: 'Manipal' } });
        fireEvent.click(screen.getByRole('button', { name: /^find location$/i }));
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        // The query is valid (it reached the geocoder): this is runSearch's empty/error branch, not the "too short" branch.
        expect(geocode).toHaveBeenCalledTimes(1);
        expect(geocode).toHaveBeenCalledWith('Manipal');
        expect(screen.getByRole('alert')).toHaveTextContent(NOT_FOUND_RE);
        expect(screen.queryByRole('button', { name: /^use$/i })).not.toBeInTheDocument();
        expect(screen.queryByText(LOCATION_CONFIRMED_RE)).not.toBeInTheDocument();
      },
    );
  });

  it('NOT_FOUND_RE self-test: accepts the alert copy for the query, rejects other alerts and another query', () => {
    expect(NOT_FOUND_RE.test('No results for "Manipal". Try adding a landmark, road name, or PIN code.')).toBe(true);
    expect(NOT_FOUND_RE.test('no  results for “Manipal”')).toBe(true);
    expect(NOT_FOUND_RE.test('Geolocation is not supported by your browser.')).toBe(false);
    expect(NOT_FOUND_RE.test('No results for "Mangalore".')).toBe(false);
  });
});

describe('DL1-2: residential subtype radio -> aria-checked and saved propertyType', () => {
  it.each([
    ['house', 'House'],
    ['villa', 'Villa'],
    ['residential_plot', 'Residential Plot'],
  ] as const)('DL1-2 %s: clicking the "%s" radio checks it (and unchecks Apartment) and Save draft POSTs that propertyType', async (type) => {
    const user = userEvent.setup();
    renderForm('apartment');

    // Positive control on the same render: the form really starts on Apartment.
    expect(subtypeRadio('apartment')).toHaveAttribute('aria-checked', 'true');
    expect(subtypeRadio(type)).toHaveAttribute('aria-checked', 'false');

    await user.click(subtypeRadio(type));

    expect(subtypeRadio(type)).toHaveAttribute('aria-checked', 'true');
    expect(subtypeRadio('apartment')).toHaveAttribute('aria-checked', 'false');

    await fillTitleAndPrice(user);
    const body = await saveDraftAndGetPostBody(user);
    expect(body.propertyType).toBe(type);
    expect(body.title).toBe('Subtype create 2837');
    expect(body.price).toBe(5000000);
  });
});

describe('DL1-4: residential_plot area field', () => {
  it('#plotArea is absent for House (while #builtArea is present - positive control), appears for Residential Plot (while #builtArea goes away), and the typed land area is in the saved body', async () => {
    const user = userEvent.setup();
    renderForm('house');

    // House arm: negative with a positive control on the same render.
    expect(document.getElementById('builtArea')).not.toBeNull();
    expect(document.getElementById('plotArea')).toBeNull();

    await user.click(subtypeRadio('residential_plot'));

    // Plot arm: the field exists, the House field is gone (so the swap is real, not a stale DOM).
    expect(document.getElementById('plotArea')).not.toBeNull();
    expect(document.getElementById('builtArea')).toBeNull();

    await user.type(document.getElementById('plotArea') as HTMLInputElement, '8');
    expect((document.getElementById('plotArea') as HTMLInputElement).value).toBe('8');

    await fillTitleAndPrice(user);
    const body = await saveDraftAndGetPostBody(user);
    expect(body.propertyType).toBe('residential_plot');
    expect(body.landArea).toBe(8);
    expect(body.landAreaUnit).toBe('cent');
    expect(body.builtArea).toBeUndefined();
  });
});

describe('DL1-9 / DL1-10: pin dialog and confirmed-pin PUT body at the HTTP boundary', () => {
  it('after a location is resolved and the draft saved, the picker opens a "Pin the exact location" dialog; confirming PUTs exactly {latitude, longitude, addressConfirmed:true}, closes the dialog and shows the confirmed status', async () => {
    const user = userEvent.setup();
    renderForm('apartment');

    await user.type(screen.getByLabelText(/search for a location/i), 'Manipal');
    await waitFor(() => expect(screen.getByText(/Manipal, Udupi District/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^use$/i }));
    await user.type(screen.getByLabelText('Price (INR) *'), '5000000');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));

    const picker = await screen.findByTestId('map-pin-open-picker');
    expect(picker).toBeEnabled();
    // Nothing has been PUT yet: the pin is not persisted by merely resolving a location.
    expect(mockApiPut).not.toHaveBeenCalled();

    await user.click(picker);
    expect(await screen.findByRole('dialog', { name: PIN_DIALOG_RE })).toBeVisible();

    await user.click(await screen.findByTestId('mock-address-picker-confirm'));

    await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(1));
    expect(mockApiPut).toHaveBeenCalledWith(`/api/listings/${LISTING_ID}`, {
      latitude: 13.34,
      longitude: 74.74,
      addressConfirmed: true,
    });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: PIN_DIALOG_RE })).not.toBeInTheDocument());
    expect(await screen.findByTestId('map-pin-status')).toHaveTextContent('Pin confirmed');
  });
});
