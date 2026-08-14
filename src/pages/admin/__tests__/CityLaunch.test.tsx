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
const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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
    // Issue #2163: geographyReady=false must NOT disable the Prepare action
    // any more — the backend self-materializes prerequisites now.
    geographyReady: false,
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
    geographyReady: true,
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
    geographyReady: false,
  },
  {
    cityId: 5,
    citySlug: 'live-city',
    cityName: 'Live City',
    status: 'live',
    revisionId: 20,
    revisionNumber: 3,
    prepStage: 5,
    prepState: 'DONE',
    geographyPercent: 100,
    failureReason: null,
    preparedAt: '2026-07-10T00:00:00Z',
    geographyReady: true,
  },
  {
    cityId: 6,
    citySlug: 'ready-launch-city',
    cityName: 'Launch City',
    status: 'ready-launch',
    revisionId: 22,
    revisionNumber: 4,
    prepStage: 5,
    prepState: 'DONE',
    geographyPercent: 100,
    failureReason: null,
    preparedAt: '2026-07-11T00:00:00Z',
    geographyReady: true,
  },
  {
    cityId: 7,
    citySlug: 'null-rev-city',
    cityName: 'Null Rev City',
    status: 'ready-preview',
    revisionId: null,
    revisionNumber: null,
    prepStage: 5,
    prepState: 'DONE',
    geographyPercent: 100,
    failureReason: null,
    preparedAt: null,
    geographyReady: true,
  }
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
    expect(screen.getAllByText('Ready for preview').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /continue/i })[0]).toBeEnabled();

    expect(screen.getByText('Mangalore')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /see failure/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rerun/i })).toBeInTheDocument();

    expect(screen.getByText('Live City')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate new revision/i })).toBeEnabled();

    expect(screen.getByText('Launch City')).toBeInTheDocument();
    expect(screen.getByText('Ready to launch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review & launch/i })).toBeEnabled();
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

  it('Issue #2163: a not-started city with geographyReady=false renders Prepare as ENABLED', async () => {
    mockGet.mockResolvedValue(CITIES);
    renderPage();

    await waitFor(() => expect(screen.getByText('Udupi')).toBeInTheDocument());

    const prepareButton = screen.getByRole('button', { name: /prepare city/i });
    expect(prepareButton).toBeEnabled();
  });

  it('Issue #2163: a 422 CITY_PREREQUISITES_NOT_GENERATED shows message/remediation and a Retry action', async () => {
    mockGet.mockResolvedValue(CITIES);
    const ApiErrorMod = await import('@/lib/api');
    mockPost.mockRejectedValueOnce(
      new ApiErrorMod.ApiError('Unprocessable Entity', 422, {
        error: 'CITY_PREREQUISITES_NOT_GENERATED',
        reason: 'MISSING_POLICY',
        message: 'No area classification policy exists for this city.',
        remediation: 'Configure an area classification policy, then retry.',
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Udupi')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /prepare city/i }));

    await waitFor(() =>
      expect(
        screen.getByText('No area classification policy exists for this city.'),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText('Configure an area classification policy, then retry.'),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeEnabled();

    // Retry just re-triggers prepare — no new backend call shape.
    mockPost.mockResolvedValueOnce({ revisionId: 11, status: 'preparing' });
    await user.click(retryButton);

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/api/admin/city-launch/cities/1/prepare'),
    );
    expect(mockPost).toHaveBeenCalledTimes(2);
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

  it('clicking LIVE action invokes prepare mutation for that city ID', async () => {
    mockGet.mockResolvedValue(CITIES);
    mockPost.mockResolvedValue({ revisionId: 21, status: 'preparing' });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Live City')).toBeInTheDocument());
    expect(mockPost).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /generate new revision/i }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/api/admin/city-launch/cities/5/prepare'),
    );
  });

  it('rendering a LIVE row alone does not invoke prepare', async () => {
    mockGet.mockResolvedValue(CITIES);
    renderPage();

    await waitFor(() => expect(screen.getByText('Live City')).toBeInTheDocument());
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('READY_PREVIEW Continue navigates to the exact current revision', async () => {
    mockGet.mockResolvedValue(CITIES);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Manipal')).toBeInTheDocument());
    // Use getAllByRole to get the first "Continue" button since there might be multiple
    await user.click(screen.getAllByRole('button', { name: /continue/i })[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/admin/city-launch/2/preview/5');
  });

  it('missing/null revisionId does not navigate', async () => {
    mockGet.mockResolvedValue(CITIES);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Null Rev City')).toBeInTheDocument());
    // Get the "Continue" button for the city with null revisionId (the second one)
    await user.click(screen.getAllByRole('button', { name: /continue/i })[1]);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('READY_LAUNCH Review & launch navigates to existing flow', async () => {
    mockGet.mockResolvedValue(CITIES);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Launch City')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /review & launch/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/admin/city-launch/6/preview/22');
  });
});
