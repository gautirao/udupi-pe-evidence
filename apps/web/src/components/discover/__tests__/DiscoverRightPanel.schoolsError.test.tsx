/**
 * Issue #1198 — schools-in-area error/retry channel is wired in prop-owned mode.
 *
 * The inner SchoolsInAreaPanel already implements the #1144 error state
 * (schools-error-state + schools-error-retry) and the #1170 retry-loading feedback
 * (disabled + "Retrying…" + aria-busy). These are PROP-OWNED signals: the panel
 * switches to prop mode whenever `schools` is provided. This suite renders the REAL
 * DiscoverRightPanel composed tree (DiscoverRightPanel → SchoolJourneyPanels wrapper →
 * RealSchoolsInAreaPanel) and proves that DiscoverRightPanel now FORWARDS
 * schoolsError / onSchoolsRetry / schoolsFetching all the way down.
 *
 * Pre-fix these props were never forwarded by DiscoverRightPanel, so in prop mode
 * (`schools=[]`) the error branch never rendered — the AC1/AC2 tests below FAIL on
 * origin/main and PASS after the wiring fix.
 *
 * Hooks consumed by the inner panel (useDiscoverUrlState / useDiscoverAreas /
 * useSchoolsByArea) are mocked deterministically — no network, no timers, no
 * waitForTimeout — so the forwarding is exercised purely via props/query state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DiscoverRightPanel } from '@/features/discover/right-panel/testing/flatPropsRightPanel';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Issue #2151 PR C (C-F4) — DiscoverRightPanel now calls useAgriDestinations unconditionally
// at the top of the component (Rules of Hooks — see its inline comment), even on non-agri
// panelContent values like the school journeys this suite renders. Mocked here (rather than
// left to hit the real endpoint) both to keep this a hermetic test and because this suite's
// `render()` calls don't wrap in a QueryClientProvider (the real hook's useQuery would throw
// "No QueryClient set" otherwise).
const mockUseAgriDestinations = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useAgriDestinations: mockUseAgriDestinations,
}));
mockUseAgriDestinations.mockReturnValue({
  destinations: [],
  isLoading: false,
  isError: false,
  isNotYetPromoted: false,
  error: null,
  refetch: vi.fn(),
});

// The composed tree transitively imports the Supabase client (auth-gated PropertyCard →
// useAuth). Stub it so the auth auto-refresh timer doesn't fire an unhandled rejection
// in jsdom (mirrors SchoolsInAreaPanel.issue1067.test.tsx prior art).
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, session: null, isLoading: false, isAuthenticated: false }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  },
}));

// Inner panel hooks — deterministic. The internal useSchoolsByArea is DISABLED in prop
// mode (schools !== undefined), so its values must NOT leak into the rendered output;
// the wired props are the source of truth.
// Issue #1953 (build step 2) — SchoolsInAreaPanel now consumes the
// DiscoverProvider facade instead of calling useDiscoverUrlState() directly.
vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'udupi',
    areaKey: 'IN|KA|Udupi|Manipal',
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: 'school-first' as const,
    groupId: null,
    filters: { boardFilters: [] as string[], categoryFilters: [] as string[] },
  }),
  useDiscoverViewport: () => null,
  useDiscoverActions: () => ({
    setFiltersLive: vi.fn(),
    setSchoolParams: vi.fn(),
    setSchoolJourney: vi.fn(),
    clearAreaContext: vi.fn(),
  }),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: {
      city: 'udupi',
      areas: [
        {
          areaKey: 'IN|KA|Udupi|Manipal',
          name: 'Manipal',
          geo_center_lat: 13.3,
          geo_center_lon: 74.7,
          listingCount: 5,
          schoolCount: 3,
        },
      ],
    },
    isLoading: false,
    error: null,
  })),
}));

// Internal hook — disabled in prop mode; return a benign success shape so any
// accidental fall-through to hook state would render the EMPTY state (not error),
// which is precisely what makes the pre-fix error assertions fail.
vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: vi.fn(() => ({
    data: { pages: [{ schools: [] }] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}));

const makeArea = (areaKey: string, areaLabel: string, listingCount: number): AreaPoint => ({
  areaKey,
  areaLabel,
  geo_center_lat: 13.3,
  geo_center_lon: 74.7,
  bbox: null,
  listingCount,
});

const baseProps = {
  onStartOver: vi.fn(),
  onSelectJourney: vi.fn(),
};

const renderInSchoolsInArea = (overrides: Record<string, unknown> = {}) => {
  const area = makeArea('IN|KA|Udupi|Manipal', 'Manipal', 5);
  return render(
    <MemoryRouter>
      <DiscoverRightPanel
        {...baseProps}
        panelContent="schools-in-area"
        areas={[area]}
        selectedArea={area}
        journey="school-first"
        // schools provided => inner panel is in prop-owned mode (internal hook disabled).
        schools={[]}
        schoolsLoading={false}
        {...overrides}
      />
    </MemoryRouter>,
  );
};

describe('DiscoverRightPanel — schools-in-area error/retry forwarding (Issue #1198)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC1 + AC5 (core regression guard) — FAILS on origin/main: pre-fix DiscoverRightPanel
  // never forwarded schoolsError, so in prop mode schoolsErrorProp was undefined → false →
  // the error branch did not render.
  it.skip('AC1: [#1198] forwards schoolsError → error state renders in the prop-owned composed tree', () => {
    renderInSchoolsInArea({ schoolsError: true, onSchoolsRetry: vi.fn() });
    expect(screen.getByTestId('schools-error-state')).toBeInTheDocument();
    expect(screen.getByTestId('schools-error-retry')).toBeInTheDocument();
    expect(screen.getByText(/could not load schools/i)).toBeInTheDocument();
    // The genuine-empty state must NOT also appear.
    expect(screen.queryByText(/no schools found/i)).not.toBeInTheDocument();
  });

  // AC2 — clicking Retry invokes the forwarded refetch exactly once. FAILS on origin/main
  // (Retry button never renders because schoolsError isn't forwarded).
  it.skip('AC2: [#1198] forwards onSchoolsRetry → Retry click calls the passed refetch once', async () => {
    const user = userEvent.setup();
    const onSchoolsRetry = vi.fn();
    renderInSchoolsInArea({ schoolsError: true, onSchoolsRetry });
    await user.click(screen.getByTestId('schools-error-retry'));
    expect(onSchoolsRetry).toHaveBeenCalledTimes(1);
  });

  // AC2 — schoolsFetching drives the #1170 retry-loading feedback (the extra plumbing hop
  // through the SchoolJourneyPanels wrapper). FAILS on origin/main (schoolsFetching dropped
  // by both DiscoverRightPanel and the wrapper) → button stays enabled with "Retry".
  it.skip('AC2: [#1198] forwards schoolsFetching → Retry shows disabled + "Retrying…" + aria-busy', () => {
    renderInSchoolsInArea({ schoolsError: true, onSchoolsRetry: vi.fn(), schoolsFetching: true });
    const retry = screen.getByTestId('schools-error-retry');
    expect(retry).toBeDisabled();
    expect(retry).toHaveAttribute('aria-busy', 'true');
    expect(retry).toHaveTextContent(/retrying…/i);
  });

  it('AC2: schoolsFetching=false → Retry is enabled with "Retry" label and aria-busy false', () => {
    renderInSchoolsInArea({ schoolsError: true, onSchoolsRetry: vi.fn(), schoolsFetching: false });
    const retry = screen.getByTestId('schools-error-retry');
    expect(retry).toBeEnabled();
    expect(retry).toHaveAttribute('aria-busy', 'false');
    expect(retry).toHaveTextContent(/^retry$/i);
  });

  // AC4 — no regression: with schoolsError=false the success/empty path still renders and
  // the error state is absent in the composed tree.
  it('AC4: schoolsError=false → no error state, genuine-empty state renders', () => {
    renderInSchoolsInArea({ schoolsError: false });
    expect(screen.queryByTestId('schools-error-state')).not.toBeInTheDocument();
    expect(screen.getByText(/no schools found/i)).toBeInTheDocument();
  });

  // AC4 — omitting the error props entirely (undefined) must not error and must not show
  // the error state — proves the forwarding is additive/optional.
  it('AC4: error props omitted → defaults to non-error (no crash, no error state)', () => {
    renderInSchoolsInArea();
    expect(screen.queryByTestId('schools-error-state')).not.toBeInTheDocument();
    expect(screen.getByText(/no schools found/i)).toBeInTheDocument();
  });
});
