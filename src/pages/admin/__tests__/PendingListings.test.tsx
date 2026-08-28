/**
 * Issue #2369 — redesigned pending-approvals review queue.
 *
 * Covers: filtering, humanized enum rendering, drawer open/close + focus
 * restore, truthful risk-check rendering (pass and fail states), return-for-edits
 * requiring a reason, reject requiring a reason, approve success, and the
 * 409-conflict fix (query invalidation + honest messaging + drawer close).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import PendingListings from '../PendingListings';
import type { ListingResponse } from '@/hooks/useBrokerListings';

// jsdom does not implement PointerEvent capture APIs that Radix Select's
// jsdom-only pointer-interaction path calls into (repo convention — see
// AgriculturalListingForm.test.tsx).
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

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  },
}));

import { api, ApiError } from '@/lib/api';

/**
 * Builds the full `PageResponse<T>` shape the query now reads (`response.page.*`)
 * instead of a bare `{ content }` — see the #2369 blocker-2 fix (bounded
 * all-pages aggregation) in PendingListings.tsx.
 */
function makePage<T>(content: T[], overrides: Partial<{ size: number; number: number; totalElements: number; totalPages: number }> = {}) {
  return {
    content,
    page: {
      size: 200,
      number: 0,
      totalElements: content.length,
      totalPages: 1,
      ...overrides,
    },
  };
}

function makeListing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'listing-1',
    status: 'PENDING_REVIEW',
    propertyType: 'commercial_building',
    title: 'Spacious 3BHK near MIT',
    locality: 'Manipal',
    price: 5000000,
    description: 'A lovely home close to campus.',
    landArea: null,
    landAreaUnit: null,
    bedrooms: 3,
    builtArea: 1200,
    builtAreaUnit: 'sqft',
    latitude: 13.35,
    longitude: 74.79,
    addressConfirmed: true,
    imageCount: 4,
    firstImageUrl: 'https://example.com/photo.jpg',
    rejectionReason: null,
    videoUrl: null,
    reraNumber: null,
    listingNumber: 101,
    displayId: 'PS-101',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    areaKey: 'KA|UDUPI|MANIPAL',
    // Fields below are unused by this feature but required by the type.
    listingPurpose: null,
    carpetArea: null,
    carpetAreaUnit: null,
    floorNumber: null,
    totalFloors: null,
    furnishingStatus: null,
    washrooms: null,
    parkingCount: null,
    roadFrontageFt: null,
    commercialUsage: null,
    numberOfUnits: null,
    monthlyRent: null,
    securityDepositMonths: null,
    lockInMonths: null,
    sellerType: null,
    earnedBadgeCount: 0,
    waterSource: null,
    soilType: null,
    roadAccess: null,
    cultivationStatus: null,
    ownershipType: null,
    surveyNumber: null,
    ...overrides,
  } as ListingResponse;
}

function renderPage(client?: QueryClient) {
  const queryClient = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/pending']}>
        <PendingListings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  mockToast.mockReset();
  mockUseAuth.mockReturnValue({ isAdmin: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('PendingListings', () => {
  it('shows the humanized property type and renders the queue', async () => {
    vi.mocked(api.get).mockResolvedValue(makePage([makeListing()]));
    renderPage();

    await waitFor(() => expect(screen.getByTestId('pending-row-listing-1')).toBeInTheDocument());
    expect(screen.getByText('Commercial building')).toBeInTheDocument();
    expect(screen.getByText('No issues detected')).toBeInTheDocument();
  });

  it('shows an empty state when there are no pending listings', async () => {
    vi.mocked(api.get).mockResolvedValue(makePage([]));
    renderPage();

    await waitFor(() => expect(screen.getByText('No listings pending review.')).toBeInTheDocument());
  });

  it('filters the queue by search term', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue(
      makePage([
        makeListing({ id: 'a', title: 'Riverside villa', locality: 'Udupi' }),
        makeListing({ id: 'b', title: 'City apartment', locality: 'Manipal' }),
      ]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId('pending-row-a')).toBeInTheDocument());

    await user.type(screen.getByLabelText(/search title, listing id/i), 'Riverside');

    expect(screen.getByTestId('pending-row-a')).toBeInTheDocument();
    expect(screen.queryByTestId('pending-row-b')).not.toBeInTheDocument();
  });

  it('flags a listing missing photos/address in the status column', async () => {
    vi.mocked(api.get).mockResolvedValue(
      makePage([makeListing({ imageCount: 0, addressConfirmed: false })]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId('pending-row-listing-1')).toBeInTheDocument());
    expect(screen.getByText('No photos')).toBeInTheDocument();
    expect(screen.getByText('Location not confirmed')).toBeInTheDocument();
  });

  describe('review drawer', () => {
    it('opens on Review click, renders truthful pass-state checks, and restores focus on close', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(makePage([makeListing()]));
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-listing-1')).toBeInTheDocument());
      const reviewButton = screen.getByTestId('review-button-listing-1');
      await user.click(reviewButton);

      const drawer = await screen.findByTestId('listing-review-drawer');
      expect(within(drawer).getByText('Listing details complete')).toBeInTheDocument();
      expect(within(drawer).getByText('Photos submitted')).toBeInTheDocument();
      // "Location confirmed" appears twice: the badge in the LOCATION section and
      // the risk-check heading — both are real pass states, so assert both exist.
      expect(within(drawer).getAllByText('Location confirmed')).toHaveLength(2);

      // Close via Escape (Radix Sheet) and confirm focus returns to the trigger.
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByTestId('listing-review-drawer')).not.toBeInTheDocument());
      await waitFor(() => expect(reviewButton).toHaveFocus());
    });

    it('renders truthful fail-state check language (not the mock\'s positive-heading bug)', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(
        makePage([makeListing({ imageCount: 0, addressConfirmed: false, title: null, price: null })]),
      );
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-listing-1')).toBeInTheDocument());
      await user.click(screen.getByTestId('review-button-listing-1'));

      const drawer = await screen.findByTestId('listing-review-drawer');
      expect(within(drawer).getByText('Listing details incomplete')).toBeInTheDocument();
      expect(within(drawer).getByText('No photos submitted')).toBeInTheDocument();
      expect(within(drawer).getByText('Location could not be verified')).toBeInTheDocument();
      // Must not show a positive heading for a check that actually failed.
      expect(within(drawer).queryByText('Location verified')).not.toBeInTheDocument();
    });
  });

  describe('approve', () => {
    it('shows a confirm dialog with listing identity, and does not call the API on Cancel', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(makePage([makeListing()]));
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-listing-1')).toBeInTheDocument());
      await user.click(screen.getByTestId('review-button-listing-1'));
      const drawer = await screen.findByTestId('listing-review-drawer');
      await user.click(within(drawer).getByRole('button', { name: /^approve$/i }));

      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText(/Spacious 3BHK near MIT/)).toBeInTheDocument();
      expect(within(dialog).getByText(/PS-101/)).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(api.post).not.toHaveBeenCalled();
    });

    it('approves and invalidates the queue on success once the confirm dialog is accepted', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(makePage([makeListing()]));
      vi.mocked(api.post).mockResolvedValue({});
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-listing-1')).toBeInTheDocument());
      await user.click(screen.getByTestId('review-button-listing-1'));
      const drawer = await screen.findByTestId('listing-review-drawer');
      await user.click(within(drawer).getByRole('button', { name: /^approve$/i }));

      // Clicking the drawer's own "Approve" trigger must NOT call the API by itself.
      expect(api.post).not.toHaveBeenCalled();

      await user.click(await screen.findByTestId('confirm-approve-action'));

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith('/api/admin/listings/listing-1/approve'),
      );
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Listing approved' }),
      ));
    });

    it('closes the drawer when the approved listing was the only one left to review (terminal case)', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(makePage([makeListing()]));
      vi.mocked(api.post).mockResolvedValue({});
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-listing-1')).toBeInTheDocument());
      await user.click(screen.getByTestId('review-button-listing-1'));
      await screen.findByTestId('listing-review-drawer');
      await user.click(within(screen.getByTestId('listing-review-drawer')).getByRole('button', { name: /^approve$/i }));
      await user.click(await screen.findByTestId('confirm-approve-action'));

      await waitFor(() => expect(screen.queryByTestId('listing-review-drawer')).not.toBeInTheDocument());
    });

    it('advances the drawer to the next item in the filtered/sorted queue instead of closing (issue #2369 moderation-throughput requirement)', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(
        makePage([
          makeListing({ id: 'a', title: 'Oldest listing', createdAt: '2026-08-01T00:00:00Z' }),
          makeListing({ id: 'b', title: 'Middle listing', createdAt: '2026-08-15T00:00:00Z' }),
          makeListing({ id: 'c', title: 'Newest listing', createdAt: '2026-08-27T00:00:00Z' }),
        ]),
      );
      vi.mocked(api.post).mockResolvedValue({});
      renderPage();

      // Default sort is oldest-first, so the queue order is a, b, c.
      await waitFor(() => expect(screen.getByTestId('pending-row-a')).toBeInTheDocument());
      await user.click(screen.getByTestId('review-button-a'));
      const drawer = await screen.findByTestId('listing-review-drawer');
      expect(within(drawer).getByText('Oldest listing')).toBeInTheDocument();

      await user.click(within(drawer).getByRole('button', { name: /^approve$/i }));
      await user.click(await screen.findByTestId('confirm-approve-action'));

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith('/api/admin/listings/a/approve'),
      );
      // The drawer stays open and now shows the next item in queue order (b),
      // not the table — the admin never has to go back and reselect.
      await waitFor(() =>
        expect(within(screen.getByTestId('listing-review-drawer')).getByText('Middle listing')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('listing-review-drawer')).toBeInTheDocument();
    });
  });

  describe('reject', () => {
    it('requires a reason before Reject listing is enabled', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(makePage([makeListing()]));
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-listing-1')).toBeInTheDocument());
      await user.click(screen.getByTestId('review-button-listing-1'));
      const drawer = await screen.findByTestId('listing-review-drawer');
      await user.click(within(drawer).getByRole('button', { name: /^reject$/i }));

      const submit = within(drawer).getByRole('button', { name: /reject listing/i });
      expect(submit).toBeDisabled();

      await user.click(within(drawer).getByLabelText('Reason'));
      await user.click(await screen.findByText('Incomplete info'));

      expect(submit).toBeEnabled();
    });

    it('shows a confirm dialog with listing identity and the chosen reason, and only calls the API once confirmed', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(makePage([makeListing()]));
      vi.mocked(api.post).mockResolvedValue({});
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-listing-1')).toBeInTheDocument());
      await user.click(screen.getByTestId('review-button-listing-1'));
      const drawer = await screen.findByTestId('listing-review-drawer');
      await user.click(within(drawer).getByRole('button', { name: /^reject$/i }));

      await user.click(within(drawer).getByLabelText('Reason'));
      await user.click(await screen.findByText('Incomplete info'));

      const submit = within(drawer).getByRole('button', { name: /reject listing/i });
      await user.click(submit);

      // Clicking "Reject listing" alone must NOT call the API — the confirm
      // dialog must appear first.
      expect(api.post).not.toHaveBeenCalled();

      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText(/Spacious 3BHK near MIT/)).toBeInTheDocument();
      expect(within(dialog).getByText(/Incomplete info/)).toBeInTheDocument();
      expect(within(dialog).getByText(/permanently reject/i)).toBeInTheDocument();

      await user.click(within(dialog).getByTestId('confirm-reject-action'));

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith('/api/admin/listings/listing-1/reject', {
          rejectionReason: 'INCOMPLETE_INFO',
        }),
      );
    });
  });

  describe('return for edits', () => {
    it('requires at least one reason before submit is enabled, and includes reasons in the note', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(makePage([makeListing()]));
      vi.mocked(api.post).mockResolvedValue({});
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-listing-1')).toBeInTheDocument());
      await user.click(screen.getByTestId('review-button-listing-1'));
      const drawer = await screen.findByTestId('listing-review-drawer');
      await user.click(within(drawer).getByRole('button', { name: /return for edits/i }));

      const submit = within(drawer).getByRole('button', { name: /send back to broker/i });
      expect(submit).toBeDisabled();

      await user.click(within(drawer).getByLabelText('Better photos required'));
      expect(submit).toBeEnabled();

      await user.click(submit);

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(
          '/api/admin/listings/listing-1/return-for-edits',
          { note: 'Reasons: Better photos required' },
        ),
      );
    });
  });

  describe('409 conflict handling', () => {
    it('invalidates the queue, closes the drawer, and shows an honest conflict message', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(makePage([makeListing()]));
      vi.mocked(api.post).mockRejectedValue(new ApiError('conflict', 409, { error: 'already processed' }));
      const queryClient = renderPage();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await waitFor(() => expect(screen.getByTestId('pending-row-listing-1')).toBeInTheDocument());
      await user.click(screen.getByTestId('review-button-listing-1'));
      const drawer = await screen.findByTestId('listing-review-drawer');
      await user.click(within(drawer).getByRole('button', { name: /^approve$/i }));
      await user.click(await screen.findByTestId('confirm-approve-action'));

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Already processed',
            description: 'This listing was already processed by another admin.',
          }),
        ),
      );
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pending-listings'] });
      await waitFor(() => expect(screen.queryByTestId('listing-review-drawer')).not.toBeInTheDocument());
    });
  });

  describe('bulk selection', () => {
    function threeListings() {
      return [
        makeListing({ id: 'a', title: 'Eligible listing A' }),
        makeListing({ id: 'b', title: 'Flagged listing B', imageCount: 0 }),
        makeListing({ id: 'c', title: 'Eligible listing C' }),
      ];
    }

    it('selects and deselects individual rows, showing the bulk bar only while something is selected', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(makePage(threeListings()));
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-a')).toBeInTheDocument());
      expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('select-row-a'));
      expect(await screen.findByTestId('bulk-action-bar')).toHaveTextContent('1 selected');

      await user.click(screen.getByTestId('select-row-a'));
      await waitFor(() => expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument());
    });

    it('select-all on the page selects every row and computes eligible vs excluded counts', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(makePage(threeListings()));
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-a')).toBeInTheDocument());
      await user.click(screen.getByRole('checkbox', { name: /select all listings on this page/i }));

      const bar = await screen.findByTestId('bulk-action-bar');
      expect(bar).toHaveTextContent('3 selected');
      expect(bar).toHaveTextContent('1 flagged, excluded from bulk approval');
      expect(within(bar).getByTestId('bulk-approve-trigger')).toHaveTextContent('Approve 2 eligible');
    });

    it('Clear selection empties the selection and hides the bulk bar', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(makePage(threeListings()));
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-a')).toBeInTheDocument());
      await user.click(screen.getByTestId('select-row-a'));
      const bar = await screen.findByTestId('bulk-action-bar');
      await user.click(within(bar).getByRole('button', { name: /clear selection/i }));

      await waitFor(() => expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument());
      expect(screen.getByTestId('select-row-a')).not.toBeChecked();
    });

    it('row checkboxes are keyboard-accessible (space toggles selection)', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(makePage(threeListings()));
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-a')).toBeInTheDocument());
      const checkbox = screen.getByTestId('select-row-a');
      checkbox.focus();
      await user.keyboard(' ');

      expect(await screen.findByTestId('bulk-action-bar')).toHaveTextContent('1 selected');
    });

    it('bulk-approves only the eligible selected listings, never an ineligible one, and requires confirmation', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(makePage(threeListings()));
      vi.mocked(api.post).mockResolvedValue({});
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-a')).toBeInTheDocument());
      // Select the flagged listing B alongside eligible A and C.
      await user.click(screen.getByRole('checkbox', { name: /select all listings on this page/i }));

      const bar = await screen.findByTestId('bulk-action-bar');
      await user.click(within(bar).getByTestId('bulk-approve-trigger'));

      // Confirmation must appear before any API call is made.
      const dialog = await screen.findByRole('alertdialog');
      expect(api.post).not.toHaveBeenCalled();
      expect(within(dialog).getByText(/Approve 2 listings/i)).toBeInTheDocument();

      await user.click(within(dialog).getByTestId('confirm-bulk-approve-action'));

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
      expect(api.post).toHaveBeenCalledWith('/api/admin/listings/a/approve');
      expect(api.post).toHaveBeenCalledWith('/api/admin/listings/c/approve');
      expect(api.post).not.toHaveBeenCalledWith('/api/admin/listings/b/approve');

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: '2 listings approved' })),
      );
    });

    it('reports a partial failure honestly when a selected listing was already processed, and keeps the failed item selected for retry', async () => {
      const user = userEvent.setup();
      vi.mocked(api.get).mockResolvedValue(makePage(threeListings()));
      vi.mocked(api.post).mockImplementation(async (url: string) => {
        if (url.includes('/a/')) return {};
        throw new ApiError('conflict', 409, { error: 'already processed' });
      });
      const queryClient = renderPage();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await waitFor(() => expect(screen.getByTestId('pending-row-a')).toBeInTheDocument());
      await user.click(screen.getByTestId('select-row-a'));
      await user.click(screen.getByTestId('select-row-c'));

      const bar = await screen.findByTestId('bulk-action-bar');
      await user.click(within(bar).getByTestId('bulk-approve-trigger'));
      const dialog = await screen.findByRole('alertdialog');
      await user.click(within(dialog).getByTestId('confirm-bulk-approve-action'));

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Bulk approval partially failed' }),
        ),
      );
      const failures = await screen.findByTestId('bulk-approve-failures');
      expect(failures).toHaveTextContent('Eligible listing C');
      expect(failures).toHaveTextContent('Already processed by another admin.');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pending-listings'] });

      // The succeeded listing (a) is dropped from selection; the failed one
      // (c) is never silently approved and stays selected so the admin can retry.
      expect(screen.getByTestId('select-row-a')).not.toBeChecked();
      expect(screen.getByTestId('select-row-c')).toBeChecked();
    });
  });

  describe('pagination and queue totals', () => {
    it('aggregates listings across multiple backend pages and shows the true total in the header', async () => {
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.includes('page=0')) {
          return makePage(
            [makeListing({ id: 'a' }), makeListing({ id: 'b' })],
            { number: 0, totalElements: 3, totalPages: 2 },
          );
        }
        return makePage([makeListing({ id: 'c' })], { number: 1, totalElements: 3, totalPages: 2 });
      });
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-a')).toBeInTheDocument());
      expect(screen.getByTestId('pending-row-b')).toBeInTheDocument();
      expect(screen.getByTestId('pending-row-c')).toBeInTheDocument();
      // The badge must reflect the server's authoritative totalElements, not
      // just the length of whatever array happens to be in scope.
      expect(screen.getByText('3 pending')).toBeInTheDocument();
    });

    it('paginates the table client-side at 20 rows per page with working Previous/Next controls', async () => {
      const user = userEvent.setup();
      const listings = Array.from({ length: 25 }, (_, i) =>
        makeListing({
          id: `listing-${i}`,
          title: `Listing number ${i}`,
          createdAt: new Date(Date.now() - (25 - i) * 60_000).toISOString(),
        }),
      );
      vi.mocked(api.get).mockResolvedValue(makePage(listings));
      renderPage();

      await waitFor(() => expect(screen.getByTestId('pending-row-listing-0')).toBeInTheDocument());
      expect(screen.getByTestId('pending-row-listing-19')).toBeInTheDocument();
      expect(screen.queryByTestId('pending-row-listing-20')).not.toBeInTheDocument();
      expect(screen.getByText('Showing 1-20 of 25')).toBeInTheDocument();

      const nav = screen.getByRole('navigation', { name: /pagination/i });
      await user.click(within(nav).getByRole('button', { name: /^next$/i }));

      await waitFor(() => expect(screen.getByTestId('pending-row-listing-20')).toBeInTheDocument());
      expect(screen.queryByTestId('pending-row-listing-0')).not.toBeInTheDocument();
      expect(screen.getByText('Showing 21-25 of 25')).toBeInTheDocument();
      expect(within(nav).getByRole('button', { name: /^next$/i })).toBeDisabled();

      await user.click(within(nav).getByRole('button', { name: /^previous$/i }));
      await waitFor(() => expect(screen.getByTestId('pending-row-listing-0')).toBeInTheDocument());
    });
  });
});
