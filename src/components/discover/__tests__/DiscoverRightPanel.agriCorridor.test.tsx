/**
 * Tests for DiscoverRightPanel — corridor-first two-level agri UX (Issue #1429)
 *
 * Tests:
 * 1. agri-landing + no selectedRegion: renders Level 1 corridor cards; groupName visible
 * 2. agri-landing + empty corridorGroups: renders empty state, no crash
 * 3. agri-landing + isLoadingRegionalGroups: renders loading skeleton
 * 4. agri-landing + selectedRegion set: renders Level 2 distance chips; back button present
 * 5. agri-landing + selectedRegion + selectedMaxKm: correct chip is aria-pressed=true
 * 6. Clicking a corridor card calls onSetRegion with the directionCode
 * 7. Clicking a distance chip calls onSetMaxKm with the correct maxKm value
 * 8. Clicking the back button calls onClearRegionAndMaxKm
 * 9. Level 2: unknown region (no matching corridor) → shows empty distance tiers gracefully
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const NORTH_CORRIDOR: CorridorGroupData = {
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

const NW_CORRIDOR: CorridorGroupData = {
  directionCode: 'NW',
  groupName: 'NW towards Mangalore',
  availableMaxDistances: [
    {
      maxKm: 25,
      distanceLabel: 'Up to 25 km',
      includedBandCodes: ['0_10', '10_25'],
      listingCount: 12,
      areaKeys: [],
    },
    {
      maxKm: 50,
      distanceLabel: 'Up to 50 km',
      includedBandCodes: ['0_10', '10_25', '25_50'],
      listingCount: 25,
      areaKeys: [],
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
  onSetRegion?: (dir: string) => void;
  onSetRegionWithMaxKm?: (dir: string, km?: number) => void;
  onSetMaxKm?: (km: 10 | 25 | 50 | 100) => void;
  onClearRegionAndMaxKm?: () => void;
}

function renderPanel(props: RenderProps = {}) {
  const onSetRegion = props.onSetRegion ?? vi.fn();
  const onSetRegionWithMaxKm = props.onSetRegionWithMaxKm ?? vi.fn();
  const onSetMaxKm = props.onSetMaxKm ?? vi.fn();
  const onClearRegionAndMaxKm = props.onClearRegionAndMaxKm ?? vi.fn();

  return {
    onSetRegion,
    onSetRegionWithMaxKm,
    onSetMaxKm,
    onClearRegionAndMaxKm,
    ...render(
      <MemoryRouter>
        <QueryClientProvider client={makeQueryClient()}>
          <DiscoverRightPanel
            panelContent="agri-landing"
            city="udupi"
            areas={[]}
            onStartOver={vi.fn()}
            onSelectJourney={vi.fn()}
            journey="agri-first"
            corridorGroups={props.corridorGroups ?? [NORTH_CORRIDOR, NW_CORRIDOR]}
            isLoadingRegionalGroups={props.isLoadingRegionalGroups ?? false}
            selectedRegion={props.selectedRegion ?? null}
            selectedMaxKm={props.selectedMaxKm ?? null}
            onSetRegion={onSetRegion}
            onSetRegionWithMaxKm={onSetRegionWithMaxKm}
            onSetMaxKm={onSetMaxKm}
            onClearRegionAndMaxKm={onClearRegionAndMaxKm}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    ),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DiscoverRightPanel agri corridor — Level 1: corridor cards', () => {
  it('renders corridor cards with groupName (not raw DIR:BAND codes)', () => {
    renderPanel({ selectedRegion: null });

    const cards = screen.getAllByTestId('corridor-card');
    expect(cards).toHaveLength(2);
    const names = screen.getAllByTestId('corridor-group-name').map((el) => el.textContent);
    expect(names).toContain('N towards Brahmavar');
    expect(names).toContain('NW towards Mangalore');
    // Must not show raw codes as primary text
    for (const name of names) {
      expect(name).not.toMatch(/^N:/);
      expect(name).not.toMatch(/^NW:/);
    }
  });

  it('renders empty state when corridorGroups is empty', () => {
    renderPanel({ corridorGroups: [], selectedRegion: null });

    expect(screen.getByTestId('corridor-landing-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('corridor-card')).not.toBeInTheDocument();
  });

  it('renders loading skeleton when isLoadingRegionalGroups=true', () => {
    renderPanel({ isLoadingRegionalGroups: true, selectedRegion: null });

    expect(screen.getByTestId('corridor-landing-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('corridor-landing-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('corridor-landing-empty')).not.toBeInTheDocument();
  });

  it('calls onSetRegionWithMaxKm with directionCode when a corridor card is clicked', async () => {
    const user = userEvent.setup();
    const onSetRegionWithMaxKm = vi.fn();
    renderPanel({ onSetRegionWithMaxKm, selectedRegion: null });

    const cards = screen.getAllByTestId('corridor-card');
    // Click first card (N towards Brahmavar)
    await user.click(cards[0]);

    expect(onSetRegionWithMaxKm).toHaveBeenCalledWith('N');
    expect(onSetRegionWithMaxKm).toHaveBeenCalledTimes(1);
  });
});

describe('DiscoverRightPanel agri corridor — Level 2: distance chips', () => {
  it('renders distance chips when selectedRegion is set', () => {
    renderPanel({ selectedRegion: 'N', selectedMaxKm: null });

    expect(screen.getByTestId('corridor-distance-chips')).toBeInTheDocument();
    expect(screen.queryByTestId('corridor-landing-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('distance-chip-10')).toBeInTheDocument();
    expect(screen.getByTestId('distance-chip-25')).toBeInTheDocument();
  });

  it('shows back button at Level 2', () => {
    renderPanel({ selectedRegion: 'N', selectedMaxKm: null });

    expect(screen.getByTestId('corridor-back-btn')).toBeInTheDocument();
  });

  it('correct chip is aria-pressed=true when selectedMaxKm matches', () => {
    renderPanel({ selectedRegion: 'N', selectedMaxKm: 25 });

    expect(screen.getByTestId('distance-chip-25')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('distance-chip-10')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onSetMaxKm with correct maxKm when a chip is clicked', async () => {
    const user = userEvent.setup();
    const onSetMaxKm = vi.fn();
    renderPanel({ onSetMaxKm, selectedRegion: 'N', selectedMaxKm: null });

    await user.click(screen.getByTestId('distance-chip-10'));

    expect(onSetMaxKm).toHaveBeenCalledWith(10);
    expect(onSetMaxKm).toHaveBeenCalledTimes(1);
  });

  it('calls onClearRegionAndMaxKm when the back button is clicked', async () => {
    const user = userEvent.setup();
    const onClearRegionAndMaxKm = vi.fn();
    renderPanel({ onClearRegionAndMaxKm, selectedRegion: 'N', selectedMaxKm: null });

    await user.click(screen.getByTestId('corridor-back-btn'));

    expect(onClearRegionAndMaxKm).toHaveBeenCalledTimes(1);
  });

  it('renders gracefully when selectedRegion has no matching corridor (shows empty distance tiers)', () => {
    // "SE" is not in the fixture corridors — should not crash
    renderPanel({
      corridorGroups: [NORTH_CORRIDOR],
      selectedRegion: 'SE',
      selectedMaxKm: null,
    });

    expect(screen.getByTestId('corridor-distance-chips')).toBeInTheDocument();
    // No distance chip buttons because no tiers available
    expect(screen.queryByTestId('distance-chip-10')).not.toBeInTheDocument();
    expect(screen.getByText(/No distance tiers available/i)).toBeInTheDocument();
  });
});
