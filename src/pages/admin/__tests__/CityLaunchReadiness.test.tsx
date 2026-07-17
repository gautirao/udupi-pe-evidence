/**
 * Issue #1911 PR5 — CityLaunchReadiness tests.
 *
 * PR4 shipped an INERT Launch entry (disabled, no onClick, no confirm
 * input). PR5 wires it into a real type-to-confirm launch, confirming
 * against the real city NAME (resolved via useCityLaunchList()), not the
 * city id:
 *  - while the city list is loading (or has no matching row), Launch stays
 *    disabled with loading/blocked copy — never falls back to the city id
 *  - wrong/empty confirm text keeps Launch disabled
 *  - the exact city name enables it
 *  - clicking Launch fires the useCityLaunchPromotion mutation
 *  - PROMOTED success renders a "city is now live" confirmation
 *  - 409/422 render distinct error states
 *  - a wire-contract test inlines the RAW backend PromotionReport JSON
 *    verbatim so a future backend shape drift fails this FE test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import CityLaunchReadiness from '../CityLaunchReadiness';
import type { ValidationStateDto } from '@/hooks/useCityLaunchValidation';
import type { PromotionReport } from '@/hooks/useCityLaunchPromotion';
import type { CityLaunchStatusDto } from '@/hooks/useCityLaunch';

const CITY_NAME = 'Udupi';

const mockUseCityLaunchList = vi.fn();
vi.mock('@/hooks/useCityLaunch', () => ({
  useCityLaunchList: () => mockUseCityLaunchList(),
}));

function mockCityListLoaded(rows: CityLaunchStatusDto[]) {
  mockUseCityLaunchList.mockReturnValue({ data: rows, isLoading: false, isFetching: false });
}

function mockCityListLoading() {
  mockUseCityLaunchList.mockReturnValue({ data: undefined, isLoading: true, isFetching: true });
}

// CityLaunchReadiness only imports the ValidationStateDto TYPE from
// useCityLaunchValidation.ts, but that module also imports '@/lib/api',
// which imports the Supabase client — and Supabase throws at module-load
// time when VITE_SUPABASE_URL isn't set in the test environment (see repo
// convention in CityLaunchPreview.test.tsx). Stub it out the same way.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  },
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

const VALIDATED_STATE: ValidationStateDto = {
  revisionId: 42,
  cityId: 7,
  revisionNumber: 3,
  lifecycleStatus: 'VALIDATED',
  checks: { landing: true, regions: true, areaGroups: true, areas: true, listing: true },
  allValidated: true,
  editable: false,
  preparedAt: '2026-07-01T00:00:00Z',
  validatedAt: '2026-07-02T00:00:00Z',
  supersededBy: null,
};

function renderWithClient(validation: ValidationStateDto) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(CityLaunchReadiness, { validation }),
    ),
  );
  return client;
}

const CITY_ROW: CityLaunchStatusDto = {
  cityId: 7,
  citySlug: 'udupi',
  cityName: CITY_NAME,
  status: 'PREPARED',
  revisionId: 42,
  revisionNumber: 3,
  prepStage: 5,
  prepState: 'DONE',
  geographyPercent: 100,
  failureReason: null,
  preparedAt: '2026-07-01T00:00:00Z',
};

beforeEach(() => {
  mockToast.mockReset();
  mockCityListLoaded([CITY_ROW]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CityLaunchReadiness', () => {
  it('renders the VALIDATED summary with all 5 checks shown ticked', () => {
    renderWithClient(VALIDATED_STATE);

    expect(screen.getByText('VALIDATED')).toBeInTheDocument();
    expect(screen.getByText(/rev 3/)).toBeInTheDocument();

    for (const label of ['Landing', 'Regions', 'Area Groups', 'Areas', 'Listing']) {
      expect(screen.getByText(new RegExp(`^${label} —`))).toBeInTheDocument();
    }
    expect(screen.getAllByText('pass')).toHaveLength(5);
  });

  it('renders preparedAt/validatedAt', () => {
    renderWithClient(VALIDATED_STATE);
    expect(screen.getByText('2026-07-01T00:00:00Z')).toBeInTheDocument();
    expect(screen.getByText('2026-07-02T00:00:00Z')).toBeInTheDocument();
  });

  describe('type-to-confirm gating', () => {
    it('Launch is disabled with an empty confirm field', () => {
      renderWithClient(VALIDATED_STATE);
      expect(screen.getByTestId('launch-entry')).toBeDisabled();
    });

    it('Launch stays disabled when the confirm text does not match the city name', async () => {
      const user = userEvent.setup();
      renderWithClient(VALIDATED_STATE);

      await user.type(screen.getByLabelText(/type the city name/i), 'wrong-value');
      expect(screen.getByTestId('launch-entry')).toBeDisabled();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('Launch is enabled once the exact city name is typed', async () => {
      const user = userEvent.setup();
      renderWithClient(VALIDATED_STATE);

      await user.type(screen.getByLabelText(/type the city name/i), CITY_NAME);
      expect(screen.getByTestId('launch-entry')).toBeEnabled();
    });

    it('keeps Launch disabled with loading copy while the city list has not resolved', () => {
      mockCityListLoading();
      renderWithClient(VALIDATED_STATE);

      expect(screen.getByTestId('launch-name-loading')).toBeInTheDocument();
      expect(screen.getByText(/loading city details/i)).toBeInTheDocument();
      expect(screen.getByTestId('launch-entry')).toBeDisabled();
      expect(screen.queryByLabelText(/type the city name/i)).not.toBeInTheDocument();
    });

    it('keeps Launch disabled with a non-crashing blocked state when no row matches cityId', () => {
      mockCityListLoaded([{ ...CITY_ROW, cityId: 999 }]);
      renderWithClient(VALIDATED_STATE);

      expect(screen.getByTestId('launch-name-unavailable')).toBeInTheDocument();
      expect(screen.getByText(/unable to load city name/i)).toBeInTheDocument();
      expect(screen.getByTestId('launch-entry')).toBeDisabled();
    });
  });

  it('clicking Launch (with a matching confirm) fires the promotion mutation with confirmCityName', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({
      revisionId: 42,
      lifecycleStatus: 'PROMOTED',
      promotedAt: '2026-07-17T05:45:07.845819Z',
      areasPromoted: 1,
      aliasesPromoted: 0,
      regionsPromoted: 1,
      membershipsPromoted: 1,
      groupsPromoted: 0,
      groupMembersPromoted: 0,
      cityActivated: true,
      idempotentNoop: false,
    } satisfies PromotionReport);

    renderWithClient(VALIDATED_STATE);

    await user.type(screen.getByLabelText(/type the city name/i), CITY_NAME);
    await user.click(screen.getByTestId('launch-entry'));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/admin/city-launch/cities/7/revisions/42/launch',
        { confirmCityName: CITY_NAME },
      ),
    );
  });

  it('renders a "city is now live" success confirmation on PROMOTED, echoing promotedAt', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({
      revisionId: 42,
      lifecycleStatus: 'PROMOTED',
      promotedAt: '2026-07-17T05:45:07.845819Z',
      areasPromoted: 1,
      aliasesPromoted: 0,
      regionsPromoted: 1,
      membershipsPromoted: 1,
      groupsPromoted: 0,
      groupMembersPromoted: 0,
      cityActivated: true,
      idempotentNoop: false,
    } satisfies PromotionReport);

    renderWithClient(VALIDATED_STATE);

    await user.type(screen.getByLabelText(/type the city name/i), CITY_NAME);
    await user.click(screen.getByTestId('launch-entry'));

    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeInTheDocument());
    expect(screen.getByText(/city is now live/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-17T05:45:07\.845819Z/)).toBeInTheDocument();
  });

  it('handles an idempotent-noop retry as a still-success render', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({
      revisionId: 42,
      lifecycleStatus: 'PROMOTED',
      promotedAt: '2026-07-17T05:45:07.845819Z',
      areasPromoted: 0,
      aliasesPromoted: 0,
      regionsPromoted: 0,
      membershipsPromoted: 0,
      groupsPromoted: 0,
      groupMembersPromoted: 0,
      cityActivated: false,
      idempotentNoop: true,
    } satisfies PromotionReport);

    renderWithClient(VALIDATED_STATE);

    await user.type(screen.getByLabelText(/type the city name/i), CITY_NAME);
    await user.click(screen.getByTestId('launch-entry'));

    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeInTheDocument());
    expect(screen.getByText(/already launched/i)).toBeInTheDocument();
  });

  it('renders a distinct error state on 409 (not promotable)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new ApiError('conflict', 409, null));

    renderWithClient(VALIDATED_STATE);

    await user.type(screen.getByLabelText(/type the city name/i), CITY_NAME);
    await user.click(screen.getByTestId('launch-entry'));

    await waitFor(() => expect(screen.getByTestId('launch-error')).toBeInTheDocument());
    expect(screen.getByText(/not ready to launch/i)).toBeInTheDocument();
  });

  it('renders a distinct error state on 422 (checksum drift) directing to re-run prepare', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new ApiError('unprocessable', 422, null));

    renderWithClient(VALIDATED_STATE);

    await user.type(screen.getByLabelText(/type the city name/i), CITY_NAME);
    await user.click(screen.getByTestId('launch-entry'));

    await waitFor(() => expect(screen.getByTestId('launch-error')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /preview has drifted/i })).toBeInTheDocument();
    expect(screen.getByText(/re-run prepare/i)).toBeInTheDocument();
  });

  it('does not show the launch affordance when the revision is not VALIDATED', () => {
    renderWithClient({ ...VALIDATED_STATE, lifecycleStatus: 'PREPARED' });
    expect(screen.getByTestId('launch-not-ready')).toBeInTheDocument();
    expect(screen.queryByTestId('launch-entry')).not.toBeInTheDocument();
  });

  describe('wire-contract: raw backend PromotionReport JSON', () => {
    it('consumes the exact raw backend JSON shape (camelCase, verbatim) for a PROMOTED response', async () => {
      const user = userEvent.setup();
      // Inlined verbatim from the backend contract — NOT via a fixture
      // helper — so a future field rename/shape drift fails this test.
      vi.mocked(api.post).mockResolvedValue({
        "revisionId": 5,
        "lifecycleStatus": "PROMOTED",
        "promotedAt": "2026-07-17T05:45:07.845819Z",
        "areasPromoted": 1,
        "aliasesPromoted": 0,
        "regionsPromoted": 1,
        "membershipsPromoted": 1,
        "groupsPromoted": 0,
        "groupMembersPromoted": 0,
        "cityActivated": true,
        "idempotentNoop": false
      });

      renderWithClient(VALIDATED_STATE);

      await user.type(screen.getByLabelText(/type the city name/i), CITY_NAME);
      await user.click(screen.getByTestId('launch-entry'));

      await waitFor(() => expect(screen.getByTestId('launch-success')).toBeInTheDocument());
      expect(screen.getByText(/2026-07-17T05:45:07\.845819Z/)).toBeInTheDocument();
      expect(screen.queryByTestId('launch-error')).not.toBeInTheDocument();
    });
  });
});
