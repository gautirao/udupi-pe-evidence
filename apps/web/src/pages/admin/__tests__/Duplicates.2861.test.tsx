/**
 * Issue #2861 — Lower-level replacement suite for L188
 * (`e2e/journey/admin-duplicates.spec.ts` assertions AD1..AD6).
 *
 * Covers the routed `/admin/duplicates` page (`SuspectedDuplicates.tsx` +
 * `useSuspectedDuplicates.ts` + `ProtectedRoute requireAdmin` as wired in
 * `App.tsx:347-353`) at the HTTP boundary (`@/lib/api` mocked):
 *   - AD1: Admin renders `/admin/duplicates`, sees `Suspected Duplicates`
 *     heading, pair count, and `<tbody />` (both populated and empty state
 *     `No duplicate candidates found.`, plus error + Retry state).
 *   - AD2: Clicking `Confirm` on a `PENDING` row prompts `window.confirm`,
 *     calls `POST /api/admin/duplicates/{id}/confirm`, updates the row badge
 *     to `CONFIRMED`, replaces `Confirm`/`Dismiss` with `Undo`, and toasts
 *     `Duplicate confirmed` (plus negative control when `window.confirm` is
 *     cancelled).
 *   - AD4: Clicking `Undo` on a `CONFIRMED` row calls
 *     `POST /api/admin/duplicates/{id}/undo`, reverts the row badge to
 *     `PENDING`, and restores `Confirm` and `Dismiss` buttons.
 *   - AD3: Clicking `Dismiss` on a `PENDING` row calls
 *     `POST /api/admin/duplicates/{id}/dismiss` (without `window.confirm`),
 *     updates the row badge to `DISMISSED`, and renders `Undo`.
 *   - AD5: Pagination controls (`Page 1 of 2` -> `Next` -> `Page 2 of 2` with
 *     `page=1` query param, and hidden pagination when `totalPages === 1`).
 *   - AD6: Unauthenticated user is redirected to `/auth?redirect=%2Fadmin%2Fduplicates`
 *     and non-admin user is redirected to `/discover`, never rendering
 *     `Suspected Duplicates`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import SuspectedDuplicates from '../SuspectedDuplicates';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import type { DuplicateCandidate, DuplicateCandidatesPage } from '@/hooks/useSuspectedDuplicates';

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
    post: (...args: unknown[]) => apiPostMock(...args),
  },
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

interface MockAuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  isBroker: boolean;
  activeRole: 'ADMIN' | 'BROKER' | 'USER' | null;
  user: {
    id: string;
    email: string;
    name: string;
    roles: ('ADMIN' | 'BROKER' | 'USER')[];
    primaryRole: 'ADMIN' | 'BROKER' | 'USER';
    onboardingCompleted: boolean;
  } | null;
}

const ADMIN_AUTH_STATE: MockAuthState = {
  isAuthenticated: true,
  isLoading: false,
  isAdmin: true,
  isBroker: false,
  activeRole: 'ADMIN',
  user: {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin User',
    roles: ['ADMIN'],
    primaryRole: 'ADMIN',
    onboardingCompleted: true,
  },
};

let currentAuthState: MockAuthState = ADMIN_AUTH_STATE;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => currentAuthState,
}));

function makeCandidate(overrides: Partial<DuplicateCandidate> = {}): DuplicateCandidate {
  return {
    id: 'dup-1',
    listingIdA: '11111111-aaaa-bbbb-cccc-000000000001',
    listingIdB: '22222222-aaaa-bbbb-cccc-000000000002',
    similarityScore: 0.93,
    distanceMeters: 42.5,
    status: 'PENDING',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-04-20T10:00:00Z',
    ...overrides,
  };
}

function makeDuplicatePage(
  content: DuplicateCandidate[],
  pageOverrides: Partial<DuplicateCandidatesPage['page']> = {},
): DuplicateCandidatesPage {
  return {
    content,
    page: {
      totalElements: content.length,
      totalPages: content.length > 0 ? 1 : 0,
      number: 0,
      size: 20,
      ...pageOverrides,
    },
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

function renderAdminDuplicatesRoute(initialEntry = '/admin/duplicates') {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/admin/duplicates"
            element={
              <ProtectedRoute requireAdmin>
                <SuspectedDuplicates />
              </ProtectedRoute>
            }
          />
          <Route path="/auth" element={<div data-testid="auth-route">Auth Login Page</div>} />
          <Route path="/discover" element={<div data-testid="discover-route">Discover Page</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SuspectedDuplicates (/admin/duplicates) — #2861 L188 replacement (AD1..AD6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAuthState = ADMIN_AUTH_STATE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AD1: admin loads /admin/duplicates and sees heading, pair count, and table body', () => {
    it('renders populated duplicate candidate rows with similarity badges and no error boundary', async () => {
      const candidates = [
        makeCandidate({
          id: 'dup-1',
          listingIdA: 'aaaa1111-0000-0000-0000-000000000001',
          listingIdB: 'bbbb2222-0000-0000-0000-000000000002',
          similarityScore: 0.93,
          distanceMeters: 42.5,
          status: 'PENDING',
        }),
        makeCandidate({
          id: 'dup-2',
          listingIdA: 'cccc3333-0000-0000-0000-000000000003',
          listingIdB: 'dddd4444-0000-0000-0000-000000000004',
          similarityScore: 0.64,
          distanceMeters: null,
          status: 'PENDING',
        }),
      ];
      apiGetMock.mockResolvedValue(makeDuplicatePage(candidates));

      const { container } = renderAdminDuplicatesRoute();

      expect(
        await screen.findByRole('heading', { name: 'Suspected Duplicates' }),
      ).toBeInTheDocument();
      expect(await screen.findByText('2 pairs pending review')).toBeInTheDocument();

      const tbody = container.querySelector('tbody');
      expect(tbody).not.toBeNull();

      const row1 = screen.getByTestId('dup-1');
      const row2 = screen.getByTestId('dup-2');
      expect(within(row1).getByText('aaaa1111')).toBeInTheDocument();
      expect(within(row1).getByText('bbbb2222')).toBeInTheDocument();
      expect(within(row1).getByText('42.5 m')).toBeInTheDocument();
      expect(within(row1).getByText('93%')).toBeInTheDocument();
      expect(within(row1).getByText('PENDING')).toBeInTheDocument();

      expect(within(row2).getByText('cccc3333')).toBeInTheDocument();
      expect(within(row2).getByText('64%')).toBeInTheDocument();
      expect(within(row2).getByText('—')).toBeInTheDocument();
      expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
    });

    it('renders empty state "No duplicate candidates found." when zero pairs exist', async () => {
      apiGetMock.mockResolvedValue(makeDuplicatePage([]));

      const { container } = renderAdminDuplicatesRoute();

      expect(
        await screen.findByRole('heading', { name: 'Suspected Duplicates' }),
      ).toBeInTheDocument();
      expect(await screen.findByText('No duplicate candidates found.')).toBeInTheDocument();
      expect(screen.getByText('0 pairs pending review')).toBeInTheDocument();
      expect(container.querySelector('tbody')).not.toBeNull();
    });

    it('renders error banner and retries GET /api/admin/duplicates on Retry click', async () => {
      apiGetMock
        .mockRejectedValueOnce(new Error('500 Internal Server Error'))
        .mockResolvedValueOnce(makeDuplicatePage([makeCandidate({ id: 'dup-recovered' })]));

      renderAdminDuplicatesRoute();

      expect(
        await screen.findByText('Failed to load duplicate candidates.'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

      expect(await screen.findByTestId('dup-recovered')).toBeInTheDocument();
      expect(apiGetMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('AD2 & AD4: Confirm action transitions PENDING -> CONFIRMED, and Undo reverts CONFIRMED -> PENDING', () => {
    it('AD2: Confirm prompts window.confirm, posts /confirm, updates badge to CONFIRMED, and shows Undo; AD4: Undo posts /undo, reverts badge to PENDING, and restores Confirm/Dismiss', async () => {
      let currentStatus: DuplicateCandidate['status'] = 'PENDING';
      apiGetMock.mockImplementation(() =>
        Promise.resolve(
          makeDuplicatePage([
            makeCandidate({
              id: 'dup-1',
              status: currentStatus,
              reviewedAt: currentStatus === 'PENDING' ? null : '2026-04-20T12:00:00Z',
            }),
          ]),
        ),
      );
      apiPostMock.mockImplementation((url: string) => {
        if (url === '/api/admin/duplicates/dup-1/confirm') {
          currentStatus = 'CONFIRMED';
          return Promise.resolve(makeCandidate({ id: 'dup-1', status: 'CONFIRMED' }));
        }
        if (url === '/api/admin/duplicates/dup-1/undo') {
          currentStatus = 'PENDING';
          return Promise.resolve(makeCandidate({ id: 'dup-1', status: 'PENDING' }));
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      renderAdminDuplicatesRoute();

      const targetRow = await screen.findByTestId('dup-1');
      expect(within(targetRow).getByText('PENDING')).toBeInTheDocument();

      // AD2: Click Confirm on the PENDING row.
      const confirmBtn = within(targetRow).getByRole('button', { name: /Confirm/i });
      fireEvent.click(confirmBtn);

      expect(confirmSpy).toHaveBeenCalledWith(
        'Mark this listing as a confirmed duplicate? The newer listing will be archived.',
      );

      await waitFor(() => {
        expect(apiPostMock).toHaveBeenCalledWith('/api/admin/duplicates/dup-1/confirm');
      });

      // Status badge transitions to CONFIRMED; Undo button appears; Confirm & Dismiss disappear.
      await waitFor(() => {
        expect(within(targetRow).getByText('CONFIRMED')).toBeInTheDocument();
      });
      const undoBtn = within(targetRow).getByRole('button', { name: /Undo/i });
      expect(undoBtn).toBeInTheDocument();
      expect(within(targetRow).queryByRole('button', { name: /Confirm/i })).not.toBeInTheDocument();
      expect(within(targetRow).queryByRole('button', { name: /Dismiss/i })).not.toBeInTheDocument();
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Duplicate confirmed' }),
      );

      // AD4: Click Undo on the CONFIRMED row -> reverts to PENDING and restores Confirm & Dismiss.
      fireEvent.click(undoBtn);

      await waitFor(() => {
        expect(apiPostMock).toHaveBeenCalledWith('/api/admin/duplicates/dup-1/undo');
      });

      await waitFor(() => {
        expect(within(targetRow).getByText('PENDING')).toBeInTheDocument();
      });
      expect(within(targetRow).getByRole('button', { name: /Confirm/i })).toBeInTheDocument();
      expect(within(targetRow).getByRole('button', { name: /Dismiss/i })).toBeInTheDocument();
      expect(within(targetRow).queryByRole('button', { name: /Undo/i })).not.toBeInTheDocument();
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Review undone' }),
      );
    });

    it('AD2 negative control: cancelling window.confirm does not call POST /confirm', async () => {
      apiGetMock.mockResolvedValue(
        makeDuplicatePage([makeCandidate({ id: 'dup-cancel', status: 'PENDING' })]),
      );
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      renderAdminDuplicatesRoute();

      const row = await screen.findByTestId('dup-cancel');
      fireEvent.click(within(row).getByRole('button', { name: /Confirm/i }));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(apiPostMock).not.toHaveBeenCalled();
      expect(within(row).getByText('PENDING')).toBeInTheDocument();
    });
  });

  describe('AD3: Dismiss action transitions PENDING -> DISMISSED without window.confirm', () => {
    it('posts /api/admin/duplicates/{id}/dismiss, updates badge to DISMISSED, and shows Undo', async () => {
      let currentStatus: DuplicateCandidate['status'] = 'PENDING';
      apiGetMock.mockImplementation(() =>
        Promise.resolve(
          makeDuplicatePage([
            makeCandidate({
              id: 'dup-dismiss-1',
              status: currentStatus,
              reviewedAt: currentStatus === 'PENDING' ? null : '2026-04-20T12:05:00Z',
            }),
          ]),
        ),
      );
      apiPostMock.mockImplementation((url: string) => {
        if (url === '/api/admin/duplicates/dup-dismiss-1/dismiss') {
          currentStatus = 'DISMISSED';
          return Promise.resolve(makeCandidate({ id: 'dup-dismiss-1', status: 'DISMISSED' }));
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      const confirmSpy = vi.spyOn(window, 'confirm');

      renderAdminDuplicatesRoute();

      const targetRow = await screen.findByTestId('dup-dismiss-1');
      expect(within(targetRow).getByText('PENDING')).toBeInTheDocument();

      fireEvent.click(within(targetRow).getByRole('button', { name: /Dismiss/i }));

      expect(confirmSpy).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(apiPostMock).toHaveBeenCalledWith('/api/admin/duplicates/dup-dismiss-1/dismiss');
      });

      await waitFor(() => {
        expect(within(targetRow).getByText('DISMISSED')).toBeInTheDocument();
      });
      expect(within(targetRow).getByRole('button', { name: /Undo/i })).toBeInTheDocument();
      expect(within(targetRow).queryByRole('button', { name: /Confirm/i })).not.toBeInTheDocument();
      expect(within(targetRow).queryByRole('button', { name: /Dismiss/i })).not.toBeInTheDocument();
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Candidate dismissed' }),
      );
    });
  });

  describe('AD5: pagination controls work across multiple pages and hide on single page', () => {
    it('navigates from Page 1 of 2 to Page 2 of 2 on Next click and back on Prev click', async () => {
      apiGetMock.mockImplementation((url: string) => {
        if (url === '/api/admin/duplicates?page=0&size=20') {
          return Promise.resolve(
            makeDuplicatePage([makeCandidate({ id: 'dup-page-1' })], {
              totalElements: 21,
              totalPages: 2,
              number: 0,
              size: 20,
            }),
          );
        }
        if (url === '/api/admin/duplicates?page=1&size=20') {
          return Promise.resolve(
            makeDuplicatePage([makeCandidate({ id: 'dup-page-2' })], {
              totalElements: 21,
              totalPages: 2,
              number: 1,
              size: 20,
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected GET ${url}`));
      });

      renderAdminDuplicatesRoute();

      expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
      expect(screen.getByTestId('dup-page-1')).toBeInTheDocument();

      const prevBtn = screen.getByRole('button', { name: /Prev/i });
      const nextBtn = screen.getByRole('button', { name: /Next/i });
      expect(prevBtn).toBeDisabled();
      expect(nextBtn).not.toBeDisabled();

      fireEvent.click(nextBtn);

      expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
      expect(screen.getByTestId('dup-page-2')).toBeInTheDocument();
      expect(apiGetMock).toHaveBeenCalledWith('/api/admin/duplicates?page=1&size=20');
      expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: /Prev/i }));
      expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    });

    it('hides pagination controls when all rows fit on a single page (totalPages === 1)', async () => {
      apiGetMock.mockResolvedValue(
        makeDuplicatePage([makeCandidate({ id: 'dup-only-1' })], {
          totalElements: 1,
          totalPages: 1,
          number: 0,
        }),
      );

      renderAdminDuplicatesRoute();

      expect(await screen.findByTestId('dup-only-1')).toBeInTheDocument();
      expect(screen.queryByText(/Page 1 of/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Next/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Prev/i })).not.toBeInTheDocument();
    });
  });

  describe('AD6: unauthenticated and non-admin users are redirected away from /admin/duplicates', () => {
    it('redirects unauthenticated users to /auth?redirect=%2Fadmin%2Fduplicates and does not render Suspected Duplicates', async () => {
      currentAuthState = {
        isAuthenticated: false,
        isLoading: false,
        isAdmin: false,
        isBroker: false,
        activeRole: null,
        user: null,
      };

      renderAdminDuplicatesRoute('/admin/duplicates');

      expect(await screen.findByTestId('auth-route')).toBeInTheDocument();
      expect(screen.getByTestId('location-probe')).toHaveTextContent(
        '/auth?redirect=%2Fadmin%2Fduplicates',
      );
      expect(
        screen.queryByRole('heading', { name: 'Suspected Duplicates' }),
      ).not.toBeInTheDocument();
      expect(apiGetMock).not.toHaveBeenCalled();
    });

    it('redirects authenticated non-admin users to /discover and does not render Suspected Duplicates', async () => {
      currentAuthState = {
        isAuthenticated: true,
        isLoading: false,
        isAdmin: false,
        isBroker: false,
        activeRole: 'USER',
        user: {
          id: 'buyer-1',
          email: 'buyer@example.com',
          name: 'Buyer User',
          roles: ['USER'],
          primaryRole: 'USER',
          onboardingCompleted: true,
        },
      };

      renderAdminDuplicatesRoute('/admin/duplicates');

      expect(await screen.findByTestId('discover-route')).toBeInTheDocument();
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover');
      expect(
        screen.queryByRole('heading', { name: 'Suspected Duplicates' }),
      ).not.toBeInTheDocument();
      expect(apiGetMock).not.toHaveBeenCalled();
    });
  });
});
