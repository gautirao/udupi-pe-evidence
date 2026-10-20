/**
 * Issue #2843 — reloading a saved residential SALE draft
 * (/broker/listings/new/residential?draftId=<id>) must show the saved price
 * in #price. PriceField is uncontrolled (it seeds its text from
 * `initialRupees` and re-syncs only when that prop changes), so the fix wires
 * a one-shot hydration seed — never the live price, which would reformat the
 * text on every keystroke.
 *
 * BOUNDARY: the real ResidentialListingForm, its draft/state/location hooks and
 * the real useGetListing run. Only the HTTP client (`@/lib/api`) is mocked;
 * `@/hooks/use-toast` and the Supabase storage client are inert stubs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());
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

import { ResidentialListingForm } from '../ResidentialListingForm';

const DRAFT_ID = 'listing-2843';
const DRAFT_TITLE = 'Saved 2843 Draft';

function serveDraft(fields: Record<string, unknown>) {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/images') || url.includes('/pois')) return Promise.resolve([]);
    return Promise.resolve({
      id: DRAFT_ID,
      title: DRAFT_TITLE,
      propertyType: 'APARTMENT',
      addressConfirmed: false,
      latitude: null,
      longitude: null,
      locality: '',
      ...fields,
    });
  });
}

function renderWithDraftId() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResidentialListingForm
        initialPropertyType="apartment"
        initialDraftId={DRAFT_ID}
        onSwitchToGenericFlow={() => {}}
        navigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

async function waitForHydration() {
  await waitFor(() => expect(screen.getByLabelText('Listing title *')).toHaveValue(DRAFT_TITLE));
}

describe('ResidentialListingForm — saved price restored on draft reload (#2843)', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiPut.mockReset();
    mockApiDelete.mockReset();
  });

  it('a hydrated SALE draft shows its saved price in #price', async () => {
    serveDraft({ listingPurpose: 'sale', price: 4_200_000 });
    renderWithDraftId();
    await waitForHydration();

    await waitFor(() => expect(screen.getByLabelText('Price (INR) *')).toHaveValue('42 lakh'));
    expect(screen.getByText('Preview: ₹42 L')).toBeInTheDocument();
  });

  it('typing after hydration is not reformatted or reset by the hydrated value', async () => {
    serveDraft({ listingPurpose: 'sale', price: 4_200_000 });
    const user = userEvent.setup();
    renderWithDraftId();
    await waitForHydration();
    const price = screen.getByLabelText('Price (INR) *');
    await waitFor(() => expect(price).toHaveValue('42 lakh'));

    await user.clear(price);
    await user.type(price, '55 lakh');
    expect(price).toHaveValue('55 lakh');

    // An unrelated rerender of the form must not push the old seed back in.
    await user.type(screen.getByLabelText('Listing title *'), ' edited');
    expect(price).toHaveValue('55 lakh');
  });

  it('after the user edits the price, remounting PriceField never re-shows the stale hydrated price', async () => {
    serveDraft({ listingPurpose: 'sale', price: 4_200_000 });
    const user = userEvent.setup();
    renderWithDraftId();
    await waitForHydration();
    await waitFor(() => expect(screen.getByLabelText('Price (INR) *')).toHaveValue('42 lakh'));

    await user.clear(screen.getByLabelText('Price (INR) *'));
    await user.type(screen.getByLabelText('Price (INR) *'), '55 lakh');

    // Sale -> Rent -> Sale unmounts and remounts PriceField.
    await user.click(screen.getByRole('button', { name: 'For Rent' }));
    expect(screen.queryByLabelText('Price (INR) *')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'For Sale' }));

    expect(screen.getByLabelText('Price (INR) *')).not.toHaveValue('42 lakh');
  });

  it('control — a hydrated RENT draft already shows its saved monthly rent and deposit (controlled inputs)', async () => {
    serveDraft({ listingPurpose: 'rent', monthlyRent: 25_000, securityDepositMonths: 2 });
    renderWithDraftId();
    await waitForHydration();

    await waitFor(() => expect(screen.getByLabelText('Monthly rent (₹) *')).toHaveValue(25000));
    expect(screen.getByLabelText('Security deposit (months)')).toHaveValue(2);
  });
});
