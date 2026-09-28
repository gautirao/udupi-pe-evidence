/**
 * Regression test for Issue #1409 Fix 1 — DiscoverRightPanel agri-landing crash.
 *
 * UPDATED for Issue #1429 — corridor-first cumulative-distance model.
 * The agri-landing panel now uses CorridorLandingPanel (not AgriRegionalGroupsPanel).
 * Props renamed: regionalGroups[] → corridorGroups[], callbacks updated.
 *
 * Before the fix: the four props regionalGroups, isLoadingRegionalGroups,
 * selectedGroup, onSelectRegionalGroup were not destructured from the function
 * parameters, causing a ReferenceError crash.
 *
 * After Issue #1429: agri-landing renders CorridorLandingPanel with corridorGroups[].
 *
 * Issue #1453 — TC1–TC6 cover the new isRegionalGroupsError / onRetryRegionalGroups
 * error+retry branch in CorridorLandingPanel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverRightPanel } from '@/features/discover/right-panel/testing/flatPropsRightPanel';
import type { CorridorGroupData } from '@/hooks/useRegionalAreaGroups';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet },
  ApiError: class extends Error {},
}));

// Prevent "supabaseUrl is required" crash from transitive usePropertyListings import
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_CORRIDOR: CorridorGroupData = {
  directionCode: 'N',
  groupName: 'N towards Brahmavar',
  availableMaxDistances: [
    {
      maxKm: 10,
      distanceLabel: 'Within 10 km',
      includedBandCodes: ['0_10'],
      listingCount: 3,
      agriAcreage: 45.5,
      areaKeys: ['IN|KA|Udupi|Area1'],
    },
    {
      maxKm: 25,
      distanceLabel: 'Up to 25 km',
      includedBandCodes: ['0_10', '10_25'],
      listingCount: 7,
      areaKeys: ['IN|KA|Udupi|Area1', 'IN|KA|Udupi|Area2'],
    },
  ],
};

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

interface RenderProps {
  corridorGroups?: CorridorGroupData[];
  isLoadingRegionalGroups?: boolean;
  isRegionalGroupsError?: boolean;
  isRegionalGroupsNotGeneratedForRevision?: boolean;
  onRetryRegionalGroups?: () => void;
  selectedRegion?: string | null;
  selectedMaxKm?: 10 | 25 | 50 | 100 | null;
}

function renderLanding(props: RenderProps = {}) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={makeQueryClient()}>
        <DiscoverRightPanel
          panelContent="agri-landing"
          city="udupi"
          areas={[]}
          onStartOver={vi.fn()}
          onSelectJourney={vi.fn()}
          journey="agri-first"
          onSetRegion={vi.fn()}
          onSetMaxKm={vi.fn()}
          onClearRegionAndMaxKm={vi.fn()}
          selectedRegion={props.selectedRegion ?? null}
          selectedMaxKm={props.selectedMaxKm ?? null}
          {...props}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const NORTH_CORRIDOR: CorridorGroupData = {
  directionCode: 'N',
  groupName: 'North towards Kundapur',
  availableMaxDistances: [
    {
      maxKm: 25,
      distanceLabel: 'Up to 25 km',
      includedBandCodes: ['0_25'],
      listingCount: 5,
      areaKeys: ['IN|KA|Udupi|North1'],
    },
  ],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('DiscoverRightPanel agri-landing — corridor-first UX (Issue #1429)', () => {
  it('renders corridor cards when corridorGroups has entries', () => {
    renderLanding({ corridorGroups: [SAMPLE_CORRIDOR] });

    // Level 1: corridor cards list
    expect(screen.getByTestId('corridor-landing-list')).toBeInTheDocument();
    expect(screen.getAllByTestId('corridor-card')).toHaveLength(1);
    expect(screen.getByTestId('corridor-group-name')).toHaveTextContent(
      'N towards Brahmavar',
    );
  });

  it('renders empty state when corridorGroups is empty (no crash)', () => {
    renderLanding({ corridorGroups: [] });

    expect(screen.getByTestId('corridor-landing-empty')).toBeInTheDocument();
    expect(screen.getByText(/No corridors found/i)).toBeInTheDocument();
  });

  it('renders loading skeleton when isLoadingRegionalGroups is true', () => {
    renderLanding({ corridorGroups: [], isLoadingRegionalGroups: true });

    expect(screen.getByTestId('corridor-landing-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('corridor-landing-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('corridor-landing-empty')).not.toBeInTheDocument();
  });

  it('renders distance chips when selectedRegion is set (Level 2)', () => {
    renderLanding({
      corridorGroups: [SAMPLE_CORRIDOR],
      selectedRegion: 'N',
      selectedMaxKm: null,
    });

    expect(screen.getByTestId('corridor-distance-chips')).toBeInTheDocument();
    // Back button should be present
    expect(screen.getByTestId('corridor-back-btn')).toBeInTheDocument();
    // Distance chips for each tier
    expect(screen.getByTestId('distance-chip-10')).toBeInTheDocument();
    expect(screen.getByTestId('distance-chip-25')).toBeInTheDocument();
  });

  it('highlights selected distance chip with aria-pressed=true', () => {
    renderLanding({
      corridorGroups: [SAMPLE_CORRIDOR],
      selectedRegion: 'N',
      selectedMaxKm: 25,
    });

    const chip25 = screen.getByTestId('distance-chip-25');
    expect(chip25).toHaveAttribute('aria-pressed', 'true');
    const chip10 = screen.getByTestId('distance-chip-10');
    expect(chip10).toHaveAttribute('aria-pressed', 'false');
  });
});

// ─── Issue #1453 — Error+Retry branch (TC1–TC6) ──────────────────────────────

describe('CorridorLandingPanel — fetch error + retry (Issue #1453)', () => {
  // TC1: error with empty groups → error message + Retry visible, empty state absent
  it('TC1: isRegionalGroupsError=true, corridorGroups=[] → error UI renders, "No corridors found" absent', () => {
    renderLanding({ isRegionalGroupsError: true, corridorGroups: [] });

    expect(screen.getByTestId('corridor-landing-error')).toBeInTheDocument();
    expect(screen.getByTestId('corridor-landing-retry-btn')).toBeInTheDocument();
    expect(screen.getByText(/could not load corridors/i)).toBeInTheDocument();
    expect(screen.queryByText(/No corridors found/i)).not.toBeInTheDocument();
  });

  // TC2: explicit isLoading=false + isError=true → same as TC1
  it('TC2: isLoading=false, isRegionalGroupsError=true, corridorGroups=[] → error UI renders', () => {
    renderLanding({ isLoadingRegionalGroups: false, isRegionalGroupsError: true, corridorGroups: [] });

    expect(screen.getByTestId('corridor-landing-error')).toBeInTheDocument();
    expect(screen.getByTestId('corridor-landing-retry-btn')).toBeInTheDocument();
    expect(screen.queryByText(/No corridors found/i)).not.toBeInTheDocument();
  });

  // TC3: no error, empty groups → empty state shows, error state absent
  it('TC3: isRegionalGroupsError=false, corridorGroups=[] → "No corridors found" renders, error absent', () => {
    renderLanding({ isRegionalGroupsError: false, corridorGroups: [] });

    expect(screen.getByTestId('corridor-landing-empty')).toBeInTheDocument();
    expect(screen.getByText(/No corridors found/i)).toBeInTheDocument();
    expect(screen.queryByTestId('corridor-landing-error')).not.toBeInTheDocument();
  });

  // TC4: Retry click calls onRetryRegionalGroups exactly once
  it('TC4: clicking Retry calls onRetryRegionalGroups once', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderLanding({ isRegionalGroupsError: true, corridorGroups: [], onRetryRegionalGroups: onRetry });

    await user.click(screen.getByTestId('corridor-landing-retry-btn'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // TC5: no error with corridors → corridor cards render, no error state
  it('TC5: isRegionalGroupsError=false, corridorGroups populated → corridor cards visible, no error', () => {
    renderLanding({ isRegionalGroupsError: false, corridorGroups: [NORTH_CORRIDOR] });

    expect(screen.getByTestId('corridor-landing-list')).toBeInTheDocument();
    expect(screen.getByTestId('corridor-group-name')).toHaveTextContent('North towards Kundapur');
    expect(screen.queryByTestId('corridor-landing-error')).not.toBeInTheDocument();
  });

  // TC6: loading → skeleton shows, neither error nor empty state
  it('TC6: isLoading=true → loading skeleton, no error state, no empty state', () => {
    renderLanding({ isLoadingRegionalGroups: true, corridorGroups: [], isRegionalGroupsError: false });

    expect(screen.getByTestId('corridor-landing-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('corridor-landing-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('corridor-landing-empty')).not.toBeInTheDocument();
  });
});

// ─── #2151 Track 3 landing-panel gap fix — not-generated-for-revision branch ──
//
// A preview revision with zero sandbox Agri rows must render its own distinct,
// non-retryable state at the LANDING panel — not the generic "Could not load
// corridors" error (the original #2151 bug, previously only fixed for the
// drill-down AgriGroupSelectedPanel).

describe('CorridorLandingPanel — not-generated-for-revision (#2151 Track 3)', () => {
  it('renders the distinct not-generated-for-revision state, not the generic error state', () => {
    renderLanding({
      isRegionalGroupsNotGeneratedForRevision: true,
      isRegionalGroupsError: false,
      corridorGroups: [],
    });

    expect(screen.getByTestId('corridor-landing-not-generated-for-revision')).toBeInTheDocument();
    expect(
      screen.getByText(/hasn't generated Agricultural corridors yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('corridor-landing-error')).not.toBeInTheDocument();
    expect(screen.queryByText(/could not load corridors/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('corridor-landing-empty')).not.toBeInTheDocument();
  });

  it('takes priority over the generic error state when both flags are somehow true', () => {
    renderLanding({
      isRegionalGroupsNotGeneratedForRevision: true,
      isRegionalGroupsError: true,
      corridorGroups: [],
    });

    expect(screen.getByTestId('corridor-landing-not-generated-for-revision')).toBeInTheDocument();
    expect(screen.queryByTestId('corridor-landing-error')).not.toBeInTheDocument();
  });

  it('does not render the not-generated-for-revision state when the flag is false', () => {
    renderLanding({
      isRegionalGroupsNotGeneratedForRevision: false,
      corridorGroups: [],
    });

    expect(screen.queryByTestId('corridor-landing-not-generated-for-revision')).not.toBeInTheDocument();
    expect(screen.getByTestId('corridor-landing-empty')).toBeInTheDocument();
  });
});
