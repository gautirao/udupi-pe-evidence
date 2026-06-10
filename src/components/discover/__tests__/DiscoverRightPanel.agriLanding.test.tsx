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
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverRightPanel } from '../DiscoverRightPanel';
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

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
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
