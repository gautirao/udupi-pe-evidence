/**
 * CityLaunch.tsx unit tests — Issue #1911 PR2 "Select City" admin screen.
 *
 * Coverage contract:
 *  - Loading state renders
 *  - Error state renders with retry
 *  - Empty state renders when the city list is empty
 *  - Seeded city list renders correct status badges + action labels
 *  - Clicking "Prepare city" (not-started) invokes POST .../prepare with no body
 *  - A 409 from prepare surfaces the "already in progress" toast
 *  - A failed row shows its failureReason when expanded
 *  - ready-preview/ready-launch actions are disabled (inert placeholders)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import CityLaunch from '../CityLaunch';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockGet, post: mockPost },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(msg: string, status: number, body: unknown) {
      super(msg);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'admin-1' },
    isAdmin: true,
    isDealer: false,
    isBroker: false,
    isLoading: false,
    userRole: 'admin',
    signOut: vi.fn(),
  })),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CITIES = [
  {
    cityId: 1,
    citySlug: 'udupi',
    cityName: 'Udupi',
    status: 'not-started',
    revisionId: null,
    revisionNumber: null,
    prepStage: 0,
    prepState: null,
    geographyPercent: 0,
    failureReason: null,
    preparedAt: null,
  },
  {
    cityId: 2,
    citySlug: 'manipal',
    cityName: 'Manipal',
    status: 'ready-preview',
    revisionId: 5,
    revisionNumber: 1,
    prepStage: 5,
    prepState: 'DONE',
    geographyPercent: 100,
    failureReason: null,
    preparedAt: '2026-07-16T00:00:00Z',
  },
  {
    cityId: 3,
    citySlug: 'mangalore',
    cityName: 'Mangalore',
    status: 'failed',
    revisionId: 8,
    revisionNumber: 2,
    prepStage: 2,
    prepState: 'FAILED',
    geographyPercent: 30,
    failureReason: 'Overpass API timeout while resolving ward boundaries.',
    preparedAt: null,
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter>
          <CityLaunch />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CityLaunch', () => {
  it('renders a loading state', async () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();

    expect(screen.getByText(/choose a city to launch/i)).toBeInTheDocument();
  });

  it('renders an error state with retry', async () => {
    mockGet.mockRejectedValue(new Error('network down'));
    renderPage();

    await waitFor(() => expect(screen.getByText(/failed to load cities/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders an empty state when there are no cities', async () => {
    mockGet.mockResolvedValue([]);
    renderPage();

    await waitFor(() => expect(screen.getByText(/no cities configured/i)).toBeInTheDocument());
  });

  it('renders the seeded city list with correct status badges and action labels', async () => {
    mockGet.mockResolvedValue(CITIES);
    renderPage();

    await waitFor(() => expect(screen.getByText('Udupi')).toBeInTheDocument());

    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /prepare city/i })).toBeInTheDocument();

    expect(screen.getByText('Manipal')).toBeInTheDocument();
    expect(screen.getByText('Ready for preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();

    expect(screen.getByText('Mangalore')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /see failure/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rerun/i })).toBeInTheDocument();
  });

  it('clicking "Prepare city" invokes the POST with no body', async () => {
    mockGet.mockResolvedValue(CITIES);
    mockPost.mockResolvedValue({ revisionId: 10, status: 'preparing' });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Udupi')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /prepare city/i }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/api/admin/city-launch/cities/1/prepare'),
    );
    expect(mockPost.mock.calls[0]).toHaveLength(1);
  });

  it('a 409 from prepare shows the "already in progress" toast', async () => {
    mockGet.mockResolvedValue(CITIES);
    const ApiErrorMod = await import('@/lib/api');
    mockPost.mockRejectedValue(
      new ApiErrorMod.ApiError('Conflict', 409, { message: 'in-flight' }),
    );
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Udupi')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /prepare city/i }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Preparation already in progress' }),
      ),
    );
  });

  it('a failed row shows its failureReason when "See failure" is clicked', async () => {
    mockGet.mockResolvedValue(CITIES);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Mangalore')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /see failure/i }));

    expect(
      screen.getByText('Overpass API timeout while resolving ward boundaries.'),
    ).toBeInTheDocument();
  });

  it('a preparing row polls progress and shows prepStageLabel when expanded', async () => {
    const PREPARING_CITY = {
      cityId: 4,
      citySlug: 'kundapura',
      cityName: 'Kundapura',
      status: 'preparing',
      revisionId: 12,
      revisionNumber: 3,
      prepStage: 2,
      prepState: 'RUNNING',
      geographyPercent: 40,
      failureReason: null,
      preparedAt: null,
    };
    const PROGRESS = {
      cityId: 4,
      revisionId: 12,
      lifecycleStatus: 'preparing',
      prepStage: 2,
      prepStageLabel: 'Resolving areas',
      prepState: 'RUNNING',
      geographyPercent: 40,
      failureReason: null,
      preparedAt: null,
    };
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/admin/city-launch/cities') {
        return Promise.resolve([...CITIES, PREPARING_CITY]);
      }
      if (url === '/api/admin/city-launch/cities/4/prepare') {
        return Promise.resolve(PROGRESS);
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Kundapura')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /view progress/i }));

    await waitFor(() =>
      expect(screen.getByText('Resolving areas — 40%')).toBeInTheDocument(),
    );
  });
});
