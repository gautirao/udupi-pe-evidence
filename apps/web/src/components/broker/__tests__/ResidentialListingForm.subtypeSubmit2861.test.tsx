/**
 * Issue #2861 — Lower-level replacement suite for L194
 * (`e2e/journey/broker-listing-creation.spec.ts` assertions DL1-7 and DL1-12).
 *
 * Closes the two remaining per-subtype gaps recorded in
 * `docs/testing/e2e-retirement-map-pr6c.md` for `broker-listing-creation.spec.ts`:
 *   1. DL1-7 (re-check after #2843 / PR #2880 `d075cc34`): reloading an existing
 *      residential draft (`initialDraftId`) restores the saved `#price` input
 *      across all three legacy spec subtypes (`house`, `villa`, `residential_plot`),
 *      and saving the hydrated draft without touching `#price` preserves `price`
 *      in the `PUT /api/listings/{id}` payload.
 *   2. DL1-12: form-level per-subtype (`house`, `villa`, `residential_plot`)
 *      create -> pin confirm -> 3 images -> Review -> `Submit for review`
 *      dispatches `POST /api/listings/{id}/submit`, receives `{ status: 'PENDING_REVIEW' }`,
 *      and transitions the UI to `data-testid="residential-submitted-panel"`
 *      (`Submitted for review` / `Pending admin approval`).
 *
 * Boundary: real `ResidentialListingForm`, real `useResidentialListingDraft`,
 * real `useResidentialListingFormState`, real `useResidentialLocation`, real
 * `computeListingStrength`, and real `useCreateListing` / `useUpdateListing` /
 * `useGetListing` / `useSubmitListing` / `useListingImages` hooks. Only the
 * HTTP client `@/lib/api` (plus external Nominatim geocode & Leaflet
 * `AddressPicker` map widget shims) is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ResidentialListingForm } from '../ResidentialListingForm';
import type { Listing } from '@/types/listing';

const apiPostMock = vi.hoisted(() => vi.fn());
const apiPutMock = vi.hoisted(() => vi.fn());
const apiGetMock = vi.hoisted(() => vi.fn());
const apiDeleteMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: {
    post: (...args: unknown[]) => apiPostMock(...args),
    put: (...args: unknown[]) => apiPutMock(...args),
    get: (...args: unknown[]) => apiGetMock(...args),
    delete: (...args: unknown[]) => apiDeleteMock(...args),
  },
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

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }),
    },
  },
}));

const MANIPAL_GEOCODE_RESULT = vi.hoisted(() => ({
  lat: 13.3525,
  lon: 74.7868,
  display_name: 'Manipal, Udupi District, Karnataka, India',
  address: { suburb: 'Manipal', city: 'Udupi' },
}));

vi.mock('@/lib/geocode', () => ({
  searchNominatim: vi.fn().mockResolvedValue([MANIPAL_GEOCODE_RESULT]),
  reverseGeocode: vi.fn(),
}));

vi.mock('@/components/broker/AddressPicker', () => ({
  AddressPicker: ({
    onConfirm,
  }: {
    onConfirm: (v: { lat: number; lng: number; address_confirmed: boolean }) => void;
  }) => (
    <button
      type="button"
      data-testid="mock-address-picker-confirm"
      onClick={() => onConfirm({ lat: 13.3525, lng: 74.7868, address_confirmed: true })}
    >
      Mock confirm pin
    </button>
  ),
}));

if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

type LegacyResidentialSubtype = 'house' | 'villa' | 'residential_plot';

interface SubtypeSpecCase {
  subtype: LegacyResidentialSubtype;
  chipLabel: RegExp;
  title: string;
  priceRupees: number;
  expectedFormattedPrice: string;
}

const SUBTYPE_CASES: readonly SubtypeSpecCase[] = [
  {
    subtype: 'house',
    chipLabel: /^\s*house\s*$/i,
    title: 'Test house Listing 2861',
    priceRupees: 5_000_000,
    expectedFormattedPrice: '50 lakh',
  },
  {
    subtype: 'villa',
    chipLabel: /^\s*villa\s*$/i,
    title: 'Test villa Listing 2861',
    priceRupees: 5_000_000,
    expectedFormattedPrice: '50 lakh',
  },
  {
    subtype: 'residential_plot',
    chipLabel: /^\s*residential\s+plot\s*$/i,
    title: 'Test residential_plot Listing 2861',
    priceRupees: 5_000_000,
    expectedFormattedPrice: '50 lakh',
  },
];

function makeStoredDraft(spec: SubtypeSpecCase, overrides: Partial<Listing> = {}): Listing {
  const isPlot = spec.subtype === 'residential_plot';
  return {
    id: `draft-${spec.subtype}-2861`,
    title: spec.title,
    description: `${spec.subtype} description`,
    propertyCategory: 'RESIDENTIAL',
    propertyType: spec.subtype,
    transactionType: 'SALE',
    listingPurpose: 'sale',
    price: spec.priceRupees,
    priceType: 'TOTAL',
    priceOnRequest: false,
    priceNegotiable: true,
    locality: 'Manipal',
    city: 'Udupi',
    district: 'Udupi',
    state: 'Karnataka',
    pincode: '576104',
    latitude: 13.3525,
    longitude: 74.7868,
    addressConfirmed: false,
    bedrooms: isPlot ? null : 3,
    bathrooms: isPlot ? null : 2,
    balconies: null,
    builtArea: isPlot ? null : 1400,
    builtAreaUnit: isPlot ? null : 'sqft',
    carpetArea: null,
    carpetAreaUnit: null,
    landArea: isPlot ? 8 : null,
    landAreaUnit: isPlot ? 'cent' : null,
    furnishingStatus: isPlot ? null : 'SEMI_FURNISHED',
    facing: null,
    floorNumber: null,
    totalFloors: null,
    coveredParkingCount: null,
    openParkingCount: null,
    possessionStatus: isPlot ? null : 'READY_TO_MOVE',
    ageOfProperty: null,
    maintenancePaise: null,
    monthlyRent: null,
    securityDepositMonths: null,
    lockInMonths: null,
    maintenanceIncluded: null,
    availabilityTimeline: null,
    preferredTenants: null,
    petsAllowed: null,
    rentNegotiable: null,
    status: 'DRAFT',
    createdAt: '2026-04-20T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
    ...overrides,
  } as Listing;
}

const THREE_UPLOADED_IMAGES = [
  {
    id: 'img-1',
    listingId: 'any',
    storagePath: 'listings/img-1.jpg',
    publicUrl: 'https://example.com/img-1.jpg',
    displayOrder: 0,
    isPrimary: true,
    createdAt: '2026-04-20T00:00:00Z',
  },
  {
    id: 'img-2',
    listingId: 'any',
    storagePath: 'listings/img-2.jpg',
    publicUrl: 'https://example.com/img-2.jpg',
    displayOrder: 1,
    isPrimary: false,
    createdAt: '2026-04-20T00:00:00Z',
  },
  {
    id: 'img-3',
    listingId: 'any',
    storagePath: 'listings/img-3.jpg',
    publicUrl: 'https://example.com/img-3.jpg',
    displayOrder: 2,
    isPrimary: false,
    createdAt: '2026-04-20T00:00:00Z',
  },
];

function renderForm(
  props: {
    initialPropertyType?: LegacyResidentialSubtype | 'apartment';
    initialDraftId?: string;
  } = {},
) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ResidentialListingForm
          initialPropertyType={props.initialPropertyType ?? 'apartment'}
          initialDraftId={props.initialDraftId}
          onSwitchToGenericFlow={vi.fn()}
          navigate={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function getSubtypeRadio(chipLabel: RegExp): HTMLElement {
  const group = screen.getByRole('radiogroup', { name: 'Property type' });
  return within(group).getByRole('radio', { name: chipLabel });
}

describe('ResidentialListingForm — #2861 L194 per-subtype draft price reload (DL1-7) & submit (DL1-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DL1-7: reloading a saved residential draft restores #price across all legacy subtypes', () => {
    it.each(SUBTYPE_CASES)(
      'restores saved #title and #price ($expectedFormattedPrice) on reload for subtype=$subtype and preserves price on Save draft',
      async (spec) => {
        const draftId = `draft-${spec.subtype}-2861`;
        const storedDraft = makeStoredDraft(spec);

        apiGetMock.mockImplementation((url: string) => {
          if (url === `/api/listings/${draftId}`) {
            return Promise.resolve(storedDraft);
          }
          if (url === `/api/listings/${draftId}/images` || url.includes('/pois')) {
            return Promise.resolve([]);
          }
          return Promise.reject(new Error(`Unexpected GET ${url}`));
        });
        apiPutMock.mockImplementation((_url: string, body: Record<string, unknown>) =>
          Promise.resolve({ ...storedDraft, ...body }),
        );

        renderForm({ initialDraftId: draftId });

        await waitFor(() => {
          expect(apiGetMock).toHaveBeenCalledWith(`/api/listings/${draftId}`);
        });

        // Title and subtype radio restore from the hydrated draft.
        const titleInput = (await screen.findByLabelText(/Listing title/i)) as HTMLInputElement;
        await waitFor(() => {
          expect(titleInput.value).toBe(spec.title);
        });
        expect(getSubtypeRadio(spec.chipLabel)).toHaveAttribute('aria-checked', 'true');

        // DL1-7: #price input is populated from the hydrated draft's saved price (not blank).
        const priceInput = document.getElementById('price') as HTMLInputElement | null;
        expect(priceInput).not.toBeNull();
        expect(priceInput!.value).toBe(spec.expectedFormattedPrice);
        expect(priceInput!.value).not.toBe('');
        expect(priceInput!.value).not.toBe('75 lakh');

        // Saving the hydrated draft without re-typing #price preserves the 50-lakh rupee value.
        fireEvent.click(screen.getByRole('button', { name: /Save draft/i }));

        await waitFor(() => {
          expect(apiPutMock).toHaveBeenCalledTimes(1);
        });
        const [putUrl, putBody] = apiPutMock.mock.calls[0] as [string, Record<string, unknown>];
        expect(putUrl).toBe(`/api/listings/${draftId}`);
        expect(putBody.propertyType).toBe(spec.subtype);
        expect(putBody.price).toBe(spec.priceRupees);
      },
    );
  });

  describe('DL1-12: per-subtype form submit transitions DRAFT -> PENDING_REVIEW via POST /api/listings/{id}/submit', () => {
    it.each(SUBTYPE_CASES)(
      'creates, confirms pin, reviews, and submits subtype=$subtype to PENDING_REVIEW',
      async (spec) => {
        const createdId = `listing-${spec.subtype}-2861`;
        let currentListing: Listing = makeStoredDraft(spec, {
          id: createdId,
          addressConfirmed: false,
        });
        let lastSubmitResponse: Listing | null = null;

        apiPostMock.mockImplementation((url: string, body?: Record<string, unknown>) => {
          if (url === '/api/listings') {
            currentListing = {
              ...currentListing,
              ...(body as Partial<Listing>),
              id: createdId,
              status: 'DRAFT',
            };
            return Promise.resolve(currentListing);
          }
          if (url === `/api/listings/${createdId}/submit`) {
            currentListing = {
              ...currentListing,
              status: 'PENDING_REVIEW',
            };
            lastSubmitResponse = currentListing;
            return Promise.resolve(currentListing);
          }
          return Promise.reject(new Error(`Unexpected POST ${url}`));
        });

        apiPutMock.mockImplementation((url: string, body: Record<string, unknown>) => {
          if (url === `/api/listings/${createdId}`) {
            currentListing = {
              ...currentListing,
              ...(body as Partial<Listing>),
            };
            return Promise.resolve(currentListing);
          }
          return Promise.reject(new Error(`Unexpected PUT ${url}`));
        });

        apiGetMock.mockImplementation((url: string) => {
          if (url === `/api/listings/${createdId}`) {
            return Promise.resolve(currentListing);
          }
          if (url === `/api/listings/${createdId}/images`) {
            return Promise.resolve(
              THREE_UPLOADED_IMAGES.map((img) => ({ ...img, listingId: createdId })),
            );
          }
          if (url.includes('/pois')) {
            return Promise.resolve([]);
          }
          return Promise.reject(new Error(`Unexpected GET ${url}`));
        });

        renderForm();

        // 1. Select subtype radio (`House`, `Villa`, or `Residential plot`).
        const subtypeChip = getSubtypeRadio(spec.chipLabel);
        fireEvent.click(subtypeChip);
        expect(subtypeChip).toHaveAttribute('aria-checked', 'true');

        // 2. Resolve locality via LocationCaptureCard ("Find location" -> "Use").
        fireEvent.change(screen.getByLabelText(/search for a location/i), {
          target: { value: 'Manipal' },
        });
        fireEvent.click(screen.getByRole('button', { name: /^find location$/i }));
        const useBtn = await screen.findByRole('button', { name: /^use$/i });
        fireEvent.click(useBtn);

        // 3. Fill title and price.
        fireEvent.change(screen.getByLabelText(/Listing title/i), {
          target: { value: spec.title },
        });
        const priceInput = document.getElementById('price') as HTMLInputElement;
        fireEvent.change(priceInput, { target: { value: String(spec.priceRupees) } });
        fireEvent.blur(priceInput);

        // 4. Fill subtype-specific fields (matching broker-listing-creation.spec.ts lines 339-348).
        if (spec.subtype === 'residential_plot') {
          const plotAreaInput = document.getElementById('plotArea') as HTMLInputElement;
          expect(plotAreaInput).not.toBeNull();
          fireEvent.change(plotAreaInput, { target: { value: '8' } });
        } else {
          const builtAreaInput = document.getElementById('builtArea') as HTMLInputElement;
          expect(builtAreaInput).not.toBeNull();
          fireEvent.change(builtAreaInput, { target: { value: '1400' } });
        }

        // 5. Save draft (`POST /api/listings`).
        fireEvent.click(screen.getByRole('button', { name: /Save draft/i }));

        await waitFor(() => {
          expect(apiPostMock).toHaveBeenCalledWith(
            '/api/listings',
            expect.objectContaining({
              propertyType: spec.subtype,
              title: spec.title,
              price: spec.priceRupees,
              locality: 'Manipal, Udupi',
              listingPurpose: 'sale',
            }),
          );
        });

        // 6. Open map pin dialog and confirm pin (`PUT /api/listings/{id}` with `addressConfirmed: true`).
        const openPickerBtn = await screen.findByTestId('map-pin-open-picker');
        fireEvent.click(openPickerBtn);
        const confirmPinBtn = await screen.findByTestId('mock-address-picker-confirm');
        fireEvent.click(confirmPinBtn);

        await waitFor(() => {
          expect(apiPutMock).toHaveBeenCalledWith(
            `/api/listings/${createdId}`,
            expect.objectContaining({
              latitude: 13.3525,
              longitude: 74.7868,
              addressConfirmed: true,
            }),
          );
        });

        // Wait for image list query + confirmed pin so strength gates reach 100%.
        await waitFor(() => {
          expect(apiGetMock).toHaveBeenCalledWith(`/api/listings/${createdId}/images`);
          expect(screen.getByTestId('map-pin-status')).toHaveTextContent('Pin confirmed');
        });

        // 7. Click `Review` to enter `ResidentialReviewScreen`.
        fireEvent.click(screen.getByRole('button', { name: /^Review$/i }));

        const reviewHeading = await screen.findByRole('heading', { name: /Review your listing/i });
        expect(reviewHeading).toBeInTheDocument();

        const submitForReviewBtn = screen.getByRole('button', { name: /Submit for review/i });
        expect(submitForReviewBtn).not.toBeDisabled();

        // 8. Click `Submit for review` -> `POST /api/listings/{id}/submit` -> `PENDING_REVIEW`.
        fireEvent.click(submitForReviewBtn);

        await waitFor(() => {
          expect(apiPostMock).toHaveBeenCalledWith(`/api/listings/${createdId}/submit`);
        });
        expect(lastSubmitResponse).not.toBeNull();
        expect(lastSubmitResponse!.status).toBe('PENDING_REVIEW');

        // Post-submit confirmation screen renders with Pending admin approval status.
        const submittedPanel = await screen.findByTestId('residential-submitted-panel');
        expect(submittedPanel).toBeInTheDocument();
        expect(
          screen.getByRole('heading', { name: /Submitted for review/i }),
        ).toBeInTheDocument();
        expect(screen.getByText(/Pending admin approval/i)).toBeInTheDocument();
      },
    );
  });
});
