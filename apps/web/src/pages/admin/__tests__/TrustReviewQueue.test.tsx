/**
 * Issue #2663 — decomposition of TrustReviewQueue into query/mutation hooks
 * and presentational components. These tests lock in the behaviors called
 * out as highest-risk in the decomposition:
 *  - the asymmetric cross-invalidation matrix (badge-approve invalidates
 *    both keys, badge-reject invalidates badge-only, both identity
 *    mutations invalidate both keys)
 *  - the single combined `isBusy` flag disabling every approve/reject
 *    button across BOTH tabs while any one of the 4 mutations is in flight
 *  - the reject-reason asymmetry (badge optional, identity required)
 *  - `data-testid="identity-evidence-*"` present only on identity rows
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import TrustReviewQueue from '../TrustReviewQueue';
import type {
  IdentityPendingResponse,
  PendingIdentityEvidence,
  PendingTrustReview,
} from '@/components/admin/trust-review/trustReviewTypes';

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

import { api } from '@/lib/api';

function makeBadgeReview(overrides: Partial<PendingTrustReview> = {}): PendingTrustReview {
  return {
    dimensionId: 'dim-1',
    listingId: 'listing-1',
    dimensionType: 'PHOTOS',
    badgeState: 'PENDING',
    submittedAt: new Date().toISOString(),
    verificationAssetUrl: null,
    listingTitle: 'Spacious 3BHK',
    listingLocality: 'Manipal',
    listingSellerType: 'owner',
    ...overrides,
  };
}

function makeIdentityEvidence(overrides: Partial<PendingIdentityEvidence> = {}): PendingIdentityEvidence {
  return {
    evidenceId: 'ev-1',
    profileId: 'profile-1',
    listingId: 'listing-1',
    legalName: 'Jane Doe',
    phoneNumber: '9999999999',
    documentType: 'AADHAAR',
    documentUrl: 'https://example.com/doc.pdf',
    submittedAt: new Date().toISOString(),
    listingTitle: 'Spacious 3BHK',
    listingLocality: 'Manipal',
    ...overrides,
  };
}

function makeIdentityResponse(items: PendingIdentityEvidence[]): IdentityPendingResponse {
  return { items, page: 0, totalPages: 1, totalElements: items.length };
}

function renderPage(client?: QueryClient) {
  const queryClient = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TrustReviewQueue />
    </QueryClientProvider>,
  );
  return queryClient;
}

/** Routes api.get by URL so both queries can be mocked independently. */
function mockGetByUrl(badgeReviews: PendingTrustReview[], identityItems: PendingIdentityEvidence[]) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.includes('/identity/pending')) {
      return Promise.resolve(makeIdentityResponse(identityItems));
    }
    return Promise.resolve(badgeReviews);
  });
}

beforeEach(() => {
  mockToast.mockReset();
  mockUseAuth.mockReturnValue({ isAdmin: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('TrustReviewQueue', () => {
  it('renders both tabs with their pending counts', async () => {
    mockGetByUrl([makeBadgeReview()], [makeIdentityEvidence()]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Badges (1)')).toBeInTheDocument());
    expect(screen.getByText('Identity Evidence (1)')).toBeInTheDocument();
  });

  it('data-testid="identity-evidence-*" is present only on identity rows', async () => {
    const user = userEvent.setup();
    mockGetByUrl([makeBadgeReview({ dimensionId: 'dim-1' })], [makeIdentityEvidence({ evidenceId: 'ev-1' })]);
    renderPage();

    await waitFor(() => expect(screen.getByRole('tab', { name: /identity evidence/i })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /identity evidence/i }));

    await waitFor(() => expect(screen.getByTestId('identity-evidence-ev-1')).toBeInTheDocument());
    expect(screen.queryByTestId('identity-evidence-dim-1')).not.toBeInTheDocument();
  });

  describe('cross-invalidation matrix', () => {
    it('badge approve invalidates BOTH badge and identity keys', async () => {
      const user = userEvent.setup();
      mockGetByUrl([makeBadgeReview()], []);
      vi.mocked(api.post).mockResolvedValue({ message: 'ok' });
      const queryClient = renderPage();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await waitFor(() => expect(screen.getByRole('button', { name: /approve photos badge/i })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /approve photos badge/i }));

      await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: 'Badge approved' }));
      const keys = invalidateSpy.mock.calls.map((call) => JSON.stringify(call[0]));
      expect(keys).toContain(JSON.stringify({ queryKey: ['admin', 'trust', 'pending-reviews'] }));
      expect(keys).toContain(JSON.stringify({ queryKey: ['admin', 'trust', 'identity', 'pending'] }));
    });

    it('badge reject invalidates ONLY the badge key', async () => {
      const user = userEvent.setup();
      mockGetByUrl([makeBadgeReview()], []);
      vi.mocked(api.post).mockResolvedValue({ message: 'ok' });
      const queryClient = renderPage();

      await waitFor(() => expect(screen.getByRole('button', { name: /reject photos badge/i })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /reject photos badge/i }));
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      await user.click(screen.getByRole('button', { name: 'Reject' }));

      await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: 'Badge submission rejected' }));
      const keys = invalidateSpy.mock.calls.map((call) => JSON.stringify(call[0]));
      expect(keys).toEqual([JSON.stringify({ queryKey: ['admin', 'trust', 'pending-reviews'] })]);
    });

    it('identity approve invalidates BOTH keys', async () => {
      const user = userEvent.setup();
      mockGetByUrl([], [makeIdentityEvidence()]);
      vi.mocked(api.post).mockResolvedValue({ message: 'ok' });
      const queryClient = renderPage();

      await waitFor(() => expect(screen.getByRole('tab', { name: /identity evidence/i })).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /identity evidence/i }));
      await waitFor(() => expect(screen.getByTestId('identity-evidence-ev-1')).toBeInTheDocument());

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      await user.click(screen.getByRole('button', { name: /approve identity evidence/i }));

      await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: 'Identity evidence approved' }));
      const keys = invalidateSpy.mock.calls.map((call) => JSON.stringify(call[0]));
      expect(keys).toContain(JSON.stringify({ queryKey: ['admin', 'trust', 'identity', 'pending'] }));
      expect(keys).toContain(JSON.stringify({ queryKey: ['admin', 'trust', 'pending-reviews'] }));
    });

    it('identity reject invalidates BOTH keys and requires a non-empty reason', async () => {
      const user = userEvent.setup();
      mockGetByUrl([], [makeIdentityEvidence()]);
      vi.mocked(api.post).mockResolvedValue({ message: 'ok' });
      const queryClient = renderPage();

      await waitFor(() => expect(screen.getByRole('tab', { name: /identity evidence/i })).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /identity evidence/i }));
      await waitFor(() => expect(screen.getByTestId('identity-evidence-ev-1')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /reject identity evidence/i }));
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      const submit = screen.getByRole('button', { name: 'Reject' });
      expect(submit).toBeDisabled();

      await user.type(screen.getByLabelText(/reason/i), 'Blurry document');
      expect(submit).not.toBeDisabled();

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      await user.click(submit);

      await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: 'Identity evidence rejected' }));
      const keys = invalidateSpy.mock.calls.map((call) => JSON.stringify(call[0]));
      expect(keys).toContain(JSON.stringify({ queryKey: ['admin', 'trust', 'identity', 'pending'] }));
      expect(keys).toContain(JSON.stringify({ queryKey: ['admin', 'trust', 'pending-reviews'] }));
    });
  });

  it('badge reject reason is optional (submit enabled with an empty reason)', async () => {
    const user = userEvent.setup();
    mockGetByUrl([makeBadgeReview()], []);
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /reject photos badge/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /reject photos badge/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Reject' })).not.toBeDisabled();
  });

  it('isBusy disables approve/reject buttons on BOTH tabs while one mutation is in flight', async () => {
    const user = userEvent.setup();
    mockGetByUrl([makeBadgeReview({ dimensionId: 'dim-1' })], [makeIdentityEvidence({ evidenceId: 'ev-1' })]);
    let resolveApprove!: (value: { message: string }) => void;
    vi.mocked(api.post).mockImplementation(
      () => new Promise((resolve) => { resolveApprove = resolve; }),
    );
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /approve photos badge/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /approve photos badge/i }));

    // While the badge-approve mutation is in flight, every approve/reject
    // button in BOTH tabs must be disabled (single combined isBusy flag).
    // Switch to the identity tab to make its (Radix-hidden-while-inactive)
    // buttons queryable, then assert both tabs' buttons are disabled.
    await waitFor(() => expect(screen.getByRole('button', { name: /approve photos badge/i })).toBeDisabled());
    expect(screen.getByRole('button', { name: /reject photos badge/i })).toBeDisabled();

    await user.click(screen.getByRole('tab', { name: /identity evidence/i }));
    expect(screen.getByRole('button', { name: /approve identity evidence/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /reject identity evidence/i })).toBeDisabled();

    // Switch back to the badges tab — Radix Tabs hides the inactive panel's
    // content via the `hidden` attribute, which getByRole excludes.
    await user.click(screen.getByRole('tab', { name: /^badges/i }));
    resolveApprove({ message: 'ok' });
    await waitFor(() => expect(screen.getByRole('button', { name: /approve photos badge/i })).not.toBeDisabled());
  });
});
