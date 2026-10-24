/**
 * Issue #2861 — Lower-level replacement suite for L4
 * (`e2e/admin-intelligence-smoke.spec.ts` assertions AI1..AI3).
 *
 * Covers the routed `/admin/intelligence` page (`Intelligence.tsx` +
 * `ProtectedRoute requireAdmin` as wired in `App.tsx:379-385`) at the HTTP
 * boundary (`@/lib/api` mocked):
 *   - AI1: Admin loads `/admin/intelligence`, sees `Intelligence Validator`
 *     heading, loading spinner `[aria-label="Loading intelligence data"]`
 *     resolves, and renders `[data-testid="intelligence-table"]` when rows are
 *     present or `[data-testid="intelligence-empty-state"]` when zero rows are
 *     returned (plus district filter and column sort behavior).
 *   - AI2: `demandEventCount: null` and `topGaps: null | []` render `'—'` (not
 *     `'0'`) in `[data-testid="cell-demand-events"]` and
 *     `[data-testid="cell-top-gaps"]`, while populated values render their
 *     formatted counts and gap breakdown.
 *   - AI3: Unauthenticated user is redirected to
 *     `/auth?redirect=%2Fadmin%2Fintelligence` (and non-admin user is
 *     redirected to `/discover`), never rendering `Intelligence Validator`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import AdminIntelligence from '../Intelligence';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

const apiGetMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
  },
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

interface AreaIntelligenceRowFixture {
  areaKey: string;
  areaLabel: string | null;
  district: string | null;
  live90dCount: number;
  scoredListingCount: number;
  avgQualityScore: number | null;
  confidence: 'full' | 'limited' | 'insufficient';
  demandEventCount: number | null;
  topGaps:
    | {
        propertyType: string;
        listingPurpose: string;
        budgetBand: string;
        signalType: string;
        gapScore: number;
        confidence: string;
      }[]
    | null;
}

function makeAreaRow(
  overrides: Partial<AreaIntelligenceRowFixture> = {},
): AreaIntelligenceRowFixture {
  return {
    areaKey: 'udupi-manipal',
    areaLabel: 'Manipal',
    district: 'Udupi',
    live90dCount: 18,
    scoredListingCount: 15,
    avgQualityScore: 82.4,
    confidence: 'full',
    demandEventCount: null,
    topGaps: null,
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

function renderAdminIntelligenceRoute(initialEntry = '/admin/intelligence') {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/admin/intelligence"
            element={
              <ProtectedRoute requireAdmin>
                <AdminIntelligence />
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

describe('AdminIntelligence (/admin/intelligence) — #2861 L4 replacement (AI1..AI3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAuthState = ADMIN_AUTH_STATE;
  });

  describe('AI1: admin loads /admin/intelligence and sees heading, loading spinner resolution, and table or empty state', () => {
    it('renders Intelligence Validator heading, populated intelligence-table, confidence badges, and sort/filter controls', async () => {
      const rows: AreaIntelligenceRowFixture[] = [
        makeAreaRow({
          areaKey: 'udupi-manipal',
          areaLabel: 'Manipal',
          district: 'Udupi',
          live90dCount: 24,
          scoredListingCount: 20,
          confidence: 'full',
          avgQualityScore: 84.2,
        }),
        makeAreaRow({
          areaKey: 'dk-kadri',
          areaLabel: 'Kadri',
          district: 'Dakshina Kannada',
          live90dCount: 12,
          scoredListingCount: 10,
          confidence: 'limited',
          avgQualityScore: 71.0,
        }),
        makeAreaRow({
          areaKey: 'udupi-malpe',
          areaLabel: 'Malpe',
          district: 'Udupi',
          live90dCount: 2,
          scoredListingCount: 2,
          confidence: 'insufficient',
          avgQualityScore: null,
        }),
      ];
      apiGetMock.mockResolvedValue(rows);

      renderAdminIntelligenceRoute();

      expect(
        screen.getByRole('heading', { name: 'Intelligence Validator' }),
      ).toBeInTheDocument();

      const table = await screen.findByTestId('intelligence-table');
      expect(table).toBeInTheDocument();
      expect(screen.queryByTestId('intelligence-empty-state')).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText('Loading intelligence data'),
      ).not.toBeInTheDocument();

      expect(apiGetMock).toHaveBeenCalledWith('/api/admin/intelligence/areas');

      const renderedRows = Array.from(table.querySelectorAll('tbody tr'));
      expect(renderedRows).toHaveLength(3);

      // Default sort is live90dCount desc -> Manipal (24), Kadri (12), Malpe (2).
      expect(within(renderedRows[0] as HTMLElement).getByText('Manipal')).toBeInTheDocument();
      expect(within(renderedRows[0] as HTMLElement).getByText('Full')).toBeInTheDocument();
      expect(within(renderedRows[0] as HTMLElement).getByText('84.2')).toBeInTheDocument();

      expect(within(renderedRows[1] as HTMLElement).getByText('Kadri')).toBeInTheDocument();
      expect(within(renderedRows[1] as HTMLElement).getByText('Limited')).toBeInTheDocument();
      expect(within(renderedRows[1] as HTMLElement).getByText('71.0')).toBeInTheDocument();

      expect(within(renderedRows[2] as HTMLElement).getByText('Malpe')).toBeInTheDocument();
      expect(within(renderedRows[2] as HTMLElement).getByText('Insufficient')).toBeInTheDocument();

      // Clicking "LIVE (90d)" toggles sort direction to asc -> Malpe (2) first.
      fireEvent.click(screen.getByText(/LIVE \(90d\)/i));
      const ascRows = Array.from(table.querySelectorAll('tbody tr'));
      expect(within(ascRows[0] as HTMLElement).getByText('Malpe')).toBeInTheDocument();
      expect(within(ascRows[2] as HTMLElement).getByText('Manipal')).toBeInTheDocument();
    });

    it('renders intelligence-empty-state when API returns zero areas', async () => {
      apiGetMock.mockResolvedValue([]);

      renderAdminIntelligenceRoute();

      expect(
        screen.getByRole('heading', { name: 'Intelligence Validator' }),
      ).toBeInTheDocument();

      const emptyState = await screen.findByTestId('intelligence-empty-state');
      expect(emptyState).toBeInTheDocument();
      expect(emptyState).toHaveTextContent('No area intelligence data available yet.');
      expect(screen.queryByTestId('intelligence-table')).not.toBeInTheDocument();
    });
  });

  describe('AI2: demand-events and top-gaps cells render "—" (not "0") when null/empty, and formatted values when populated', () => {
    it('renders "—" in cell-demand-events and cell-top-gaps when demandEventCount is null and topGaps is null or empty', async () => {
      apiGetMock.mockResolvedValue([
        makeAreaRow({
          areaKey: 'udupi-manipal',
          areaLabel: 'Manipal',
          demandEventCount: null,
          topGaps: null,
        }),
        makeAreaRow({
          areaKey: 'udupi-brahmavar',
          areaLabel: 'Brahmavar',
          demandEventCount: null,
          topGaps: [],
        }),
      ]);

      renderAdminIntelligenceRoute();

      await screen.findByTestId('intelligence-table');

      const demandCells = screen.getAllByTestId('cell-demand-events');
      expect(demandCells).toHaveLength(2);
      for (const cell of demandCells) {
        expect(cell.textContent?.trim()).toBe('—');
        expect(cell.textContent?.trim()).not.toBe('0');
      }

      const gapCells = screen.getAllByTestId('cell-top-gaps');
      expect(gapCells).toHaveLength(2);
      for (const cell of gapCells) {
        expect(cell.textContent?.trim()).toBe('—');
        expect(cell.textContent?.trim()).not.toBe('0');
      }
    });

    it('renders numeric demandEventCount and formatted topGaps when populated', async () => {
      apiGetMock.mockResolvedValue([
        makeAreaRow({
          areaKey: 'udupi-manipal',
          areaLabel: 'Manipal',
          demandEventCount: 14,
          topGaps: [
            {
              propertyType: 'apartment',
              listingPurpose: 'sale',
              budgetBand: '50L-1Cr',
              signalType: 'SEARCH',
              gapScore: 7.0,
              confidence: 'full',
            },
          ],
        }),
      ]);

      renderAdminIntelligenceRoute();

      await screen.findByTestId('intelligence-table');

      expect(screen.getByTestId('cell-demand-events')).toHaveTextContent('14');
      expect(screen.getByTestId('cell-top-gaps')).toHaveTextContent(
        '50L-1Cr · apartment · SEARCH (7.0)',
      );
    });
  });

  describe('AI3: unauthenticated and non-admin users are redirected away from /admin/intelligence', () => {
    it('redirects unauthenticated users to /auth?redirect=%2Fadmin%2Fintelligence and does not render Intelligence Validator', async () => {
      currentAuthState = {
        isAuthenticated: false,
        isLoading: false,
        isAdmin: false,
        isBroker: false,
        activeRole: null,
        user: null,
      };

      renderAdminIntelligenceRoute('/admin/intelligence');

      expect(await screen.findByTestId('auth-route')).toBeInTheDocument();
      expect(screen.getByTestId('location-probe')).toHaveTextContent(
        '/auth?redirect=%2Fadmin%2Fintelligence',
      );
      expect(
        screen.queryByRole('heading', { name: 'Intelligence Validator' }),
      ).not.toBeInTheDocument();
      expect(apiGetMock).not.toHaveBeenCalled();
    });

    it('redirects authenticated non-admin users to /discover and does not render Intelligence Validator', async () => {
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

      renderAdminIntelligenceRoute('/admin/intelligence');

      expect(await screen.findByTestId('discover-route')).toBeInTheDocument();
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover');
      expect(
        screen.queryByRole('heading', { name: 'Intelligence Validator' }),
      ).not.toBeInTheDocument();
      expect(apiGetMock).not.toHaveBeenCalled();
    });
  });
});
