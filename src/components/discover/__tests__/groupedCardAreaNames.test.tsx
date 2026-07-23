/**
 * Integration tests — grouped discovery card area name display (Issue #1659)
 *
 * Tests:
 * 1. area-first GroupCard shows member area names from fallbackAreas
 * 2. school-first ZoneCard shows member area names from memberAreas
 * 3. Long member lists are capped at 3 with "+ n more"
 * 4. agri-first corridor card shows covered area/locality names where data exists
 * 5. Fallback to description/subtitle when no member names resolve
 * 6. Raw area keys are never shown
 * 7. Grouped marker behaviour from #1655 is not regressed (group cards still navigate)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';

// ── Shared mocks ────────────────────────────────────────────────────────────────

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet },
  ApiError: class extends Error {},
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

// ── Test helpers ────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// Issue #1953 (build step 2) — SchoolBrowsePanel (rendered by DiscoverRightPanel
// for 'school-browse') now consumes the DiscoverProvider facade instead of
// calling useDiscoverUrlState() directly, so every render needs a real
// provider ancestor (inside the Router, since DiscoverProvider itself reads
// useSearchParams).
function wrap(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={makeQC()}>
        <DiscoverProvider>{ui}</DiscoverProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// ── Imports under test ──────────────────────────────────────────────────────────

import { AreaGroupsLandingPanel } from '../panels/AreaGroupsLandingPanel';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

// ── Fixtures ────────────────────────────────────────────────────────────────────

const makeArea = (key: string, name: string): DiscoverArea => ({
  areaKey: key,
  name,
  geoCenterLat: 13.0,
  geoCenterLon: 74.8,
  listingCount: 5,
  schoolCount: 2,
});

const WHITEFIELD_AREA = makeArea('IN|KA|Bangalore|Whitefield', 'Whitefield');
const MARATHAHALLI_AREA = makeArea('IN|KA|Bangalore|Marathahalli', 'Marathahalli');
const SARJAPUR_AREA = makeArea('IN|KA|Bangalore|SarjapurRoad', 'Sarjapur Road');
const ELECTRONIC_CITY_AREA = makeArea('IN|KA|Bangalore|ElectronicCity', 'Electronic City');

const TECH_CORRIDOR_GROUP: AreaGroup = {
  id: 'tech-corridor',
  name: 'Tech Corridor',
  subtitle: 'IT hubs and tech parks',
  region_label: 'East Bangalore',
  school_count: 0,
  area_keys: [
    'IN|KA|Bangalore|Whitefield',
    'IN|KA|Bangalore|Marathahalli',
    'IN|KA|Bangalore|SarjapurRoad',
    'IN|KA|Bangalore|ElectronicCity',
  ],
};

const NORTH_ZONE_GROUP: AreaGroup = {
  id: 'north-zone',
  name: 'North Zone',
  subtitle: 'Northern localities',
  region_label: null,
  school_count: 5,
  area_keys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Hebri'],
};

const ALL_AREAS = [
  WHITEFIELD_AREA,
  MARATHAHALLI_AREA,
  SARJAPUR_AREA,
  ELECTRONIC_CITY_AREA,
  makeArea('IN|KA|Udupi|Manipal', 'Manipal'),
  makeArea('IN|KA|Udupi|Hebri', 'Hebri'),
];

// ── area-first: AreaGroupsLandingPanel / GroupCard ──────────────────────────────

describe('area-first GroupCard — area name display (Issue #1659)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows member area names when fallbackAreas contains matches (cap=3)', () => {
    wrap(
      <AreaGroupsLandingPanel
        groups={[TECH_CORRIDOR_GROUP]}
        isLoading={false}
        onSelectGroup={vi.fn()}
        onStartOver={vi.fn()}
        fallbackAreas={ALL_AREAS}
        onSelectArea={vi.fn()}
      />,
    );

    // Expect the area names line to be visible (shows first 3)
    const areaNames = screen.getByTestId('group-card-area-names');
    expect(areaNames).toBeInTheDocument();
    // First 3 shown
    expect(areaNames.textContent).toContain('Whitefield');
    expect(areaNames.textContent).toContain('Marathahalli');
    expect(areaNames.textContent).toContain('Sarjapur Road');
    // 4th area is capped; shown as "+ 1 more"
    expect(areaNames.textContent).toContain('+ 1 more');
  });

  it('shows all area names when 2 or fewer areas resolve', () => {
    wrap(
      <AreaGroupsLandingPanel
        groups={[NORTH_ZONE_GROUP]}
        isLoading={false}
        onSelectGroup={vi.fn()}
        onStartOver={vi.fn()}
        fallbackAreas={ALL_AREAS}
        onSelectArea={vi.fn()}
      />,
    );

    const areaNames = screen.getByTestId('group-card-area-names');
    expect(areaNames.textContent).toBe('Manipal, Hebri');
    // No "+ n more" when all fit
    expect(areaNames.textContent).not.toContain('+');
  });

  it('falls back to subtitle when no area keys resolve to names', () => {
    const groupWithUnknownKeys: AreaGroup = {
      ...TECH_CORRIDOR_GROUP,
      area_keys: ['IN|KA|Unknown|Key1', 'IN|KA|Unknown|Key2'],
      subtitle: 'IT hubs and tech parks',
    };
    wrap(
      <AreaGroupsLandingPanel
        groups={[groupWithUnknownKeys]}
        isLoading={false}
        onSelectGroup={vi.fn()}
        onStartOver={vi.fn()}
        fallbackAreas={ALL_AREAS}
        onSelectArea={vi.fn()}
      />,
    );

    // No area-names element when no keys resolve
    expect(screen.queryByTestId('group-card-area-names')).not.toBeInTheDocument();
    // Falls back to subtitle
    expect(screen.getByText('IT hubs and tech parks')).toBeInTheDocument();
  });

  it('does not show raw area keys', () => {
    wrap(
      <AreaGroupsLandingPanel
        groups={[TECH_CORRIDOR_GROUP]}
        isLoading={false}
        onSelectGroup={vi.fn()}
        onStartOver={vi.fn()}
        fallbackAreas={ALL_AREAS}
        onSelectArea={vi.fn()}
      />,
    );

    // No raw areaKey format should appear in any rendered text
    const container = document.body.textContent ?? '';
    expect(container).not.toContain('IN|KA|Bangalore|Whitefield');
    expect(container).not.toContain('IN|KA|Bangalore|Marathahalli');
  });

  it('group card is clickable and calls onSelectGroup (#1655 regression)', async () => {
    const user = userEvent.setup();
    const onSelectGroup = vi.fn();
    wrap(
      <AreaGroupsLandingPanel
        groups={[NORTH_ZONE_GROUP]}
        isLoading={false}
        onSelectGroup={onSelectGroup}
        onStartOver={vi.fn()}
        fallbackAreas={ALL_AREAS}
        onSelectArea={vi.fn()}
      />,
    );

    const card = screen.getByTestId(`area-group-card-${NORTH_ZONE_GROUP.id}`);
    await user.click(card);
    expect(onSelectGroup).toHaveBeenCalledWith(NORTH_ZONE_GROUP.id);
  });
});

// ── school-first: ZoneCard — tested via SchoolJourneyPanels ──────────────────────

// Import the zone card via the panel it renders in:
// We test ZoneCard behaviour through SchoolBrowsePanel which is part of SchoolJourneyPanels.
// For focused unit tests without the full panel, import ZoneCard props via
// SchoolJourneyPanels export. The ZoneCard is an internal sub-component; we test
// it through the public panel surface.

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: [], isLoading: false, error: null })),
}));
vi.mock('@/hooks/usePopularSchools', () => ({
  usePopularSchools: vi.fn(() => ({ data: [], isLoading: false, error: null })),
}));
vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: vi.fn(() => ({
    data: { pages: [] },
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}));
vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: { city: 'bangalore', areas: [] },
    isLoading: false,
    error: null,
  })),
}));

import { DiscoverRightPanel } from '../DiscoverRightPanel';
import type { CorridorGroupData } from '@/hooks/useRegionalAreaGroups';

describe('school-first ZoneCard — area name display (Issue #1659)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders zone-card area names when discoverAreas contains matches', () => {
    // school-browse renders SchoolBrowsePanel which contains ZoneCard.
    // The ZoneCard's area-names data-testid is school-zone-card-area-names.
    wrap(
      <DiscoverRightPanel
        panelContent="school-browse"
        city="bangalore"
        areas={[]}
        onStartOver={vi.fn()}
        onSelectJourney={vi.fn()}
        journey="school-first"
        areaGroups={[TECH_CORRIDOR_GROUP]}
        isLoadingAreaGroups={false}
        discoverAreas={ALL_AREAS}
        onSelectGroup={vi.fn()}
      />,
    );

    // The ZoneCard should show area names
    const areaNames = screen.getByTestId('school-zone-card-area-names');
    expect(areaNames).toBeInTheDocument();
    expect(areaNames.textContent).toContain('Whitefield');
    expect(areaNames.textContent).toContain('Marathahalli');
    // 4 areas total: Whitefield, Marathahalli, Sarjapur Road + 1 more
    expect(areaNames.textContent).toContain('+ 1 more');
  });

  it('school ZoneCard does not show raw area keys', () => {
    wrap(
      <DiscoverRightPanel
        panelContent="school-browse"
        city="bangalore"
        areas={[]}
        onStartOver={vi.fn()}
        onSelectJourney={vi.fn()}
        journey="school-first"
        areaGroups={[TECH_CORRIDOR_GROUP]}
        isLoadingAreaGroups={false}
        discoverAreas={ALL_AREAS}
        onSelectGroup={vi.fn()}
      />,
    );

    const container = document.body.textContent ?? '';
    expect(container).not.toContain('IN|KA|Bangalore|Whitefield');
  });
});

// ── agri-first: CorridorLandingPanel — area name display ───────────────────────

const NORTH_CORRIDOR: CorridorGroupData = {
  directionCode: 'N',
  groupName: 'N towards Brahmavar',
  availableMaxDistances: [
    {
      maxKm: 10,
      distanceLabel: 'Within 10 km',
      includedBandCodes: ['0_10'],
      listingCount: 3,
      areaKeys: ['IN|KA|Udupi|Parkala', 'IN|KA|Udupi|Hiriadka'],
    },
    {
      maxKm: 25,
      distanceLabel: 'Up to 25 km',
      includedBandCodes: ['0_10', '10_25'],
      listingCount: 7,
      areaKeys: ['IN|KA|Udupi|Parkala', 'IN|KA|Udupi|Hiriadka', 'IN|KA|Udupi|Perampalli'],
    },
  ],
};

const NW_CORRIDOR_EMPTY_KEYS: CorridorGroupData = {
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
  ],
};

const AGRI_AREAS: DiscoverArea[] = [
  makeArea('IN|KA|Udupi|Parkala', 'Parkala'),
  makeArea('IN|KA|Udupi|Hiriadka', 'Hiriadka'),
  makeArea('IN|KA|Udupi|Perampalli', 'Perampalli'),
];

describe('agri-first corridor card — area name display (Issue #1659)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows covered area names on corridor card when discoverAreas resolves', () => {
    wrap(
      <DiscoverRightPanel
        panelContent="agri-landing"
        city="udupi"
        areas={[]}
        onStartOver={vi.fn()}
        onSelectJourney={vi.fn()}
        journey="agri-first"
        corridorGroups={[NORTH_CORRIDOR]}
        isLoadingRegionalGroups={false}
        selectedRegion={null}
        selectedMaxKm={null}
        onSetRegion={vi.fn()}
        onSetRegionWithMaxKm={vi.fn()}
        onSetMaxKm={vi.fn()}
        onClearRegionAndMaxKm={vi.fn()}
        discoverAreas={AGRI_AREAS}
      />,
    );

    const areaNames = screen.getByTestId('corridor-card-area-names');
    expect(areaNames).toBeInTheDocument();
    // Union of areaKeys across tiers: Parkala, Hiriadka, Perampalli (= 3 => all shown)
    expect(areaNames.textContent).toContain('Parkala');
    expect(areaNames.textContent).toContain('Hiriadka');
    expect(areaNames.textContent).toContain('Perampalli');
  });

  it('falls back to distance badge when no area keys resolve for a corridor', () => {
    wrap(
      <DiscoverRightPanel
        panelContent="agri-landing"
        city="udupi"
        areas={[]}
        onStartOver={vi.fn()}
        onSelectJourney={vi.fn()}
        journey="agri-first"
        corridorGroups={[NW_CORRIDOR_EMPTY_KEYS]}
        isLoadingRegionalGroups={false}
        selectedRegion={null}
        selectedMaxKm={null}
        onSetRegion={vi.fn()}
        onSetRegionWithMaxKm={vi.fn()}
        onSetMaxKm={vi.fn()}
        onClearRegionAndMaxKm={vi.fn()}
        discoverAreas={AGRI_AREAS}
      />,
    );

    // No area names element (no keys)
    expect(screen.queryByTestId('corridor-card-area-names')).not.toBeInTheDocument();
    // Distance badge should appear instead
    expect(screen.getByText(/Up to 25 km/)).toBeInTheDocument();
  });

  it('does not show raw area keys in corridor card output', () => {
    wrap(
      <DiscoverRightPanel
        panelContent="agri-landing"
        city="udupi"
        areas={[]}
        onStartOver={vi.fn()}
        onSelectJourney={vi.fn()}
        journey="agri-first"
        corridorGroups={[NORTH_CORRIDOR]}
        isLoadingRegionalGroups={false}
        selectedRegion={null}
        selectedMaxKm={null}
        onSetRegion={vi.fn()}
        onSetRegionWithMaxKm={vi.fn()}
        onSetMaxKm={vi.fn()}
        onClearRegionAndMaxKm={vi.fn()}
        discoverAreas={AGRI_AREAS}
      />,
    );

    const container = document.body.textContent ?? '';
    expect(container).not.toContain('IN|KA|Udupi|Parkala');
    expect(container).not.toContain('IN|KA|Udupi|Hiriadka');
  });

  it('corridor card click still calls onSetRegionWithMaxKm (#1655 regression)', async () => {
    const user = userEvent.setup();
    const onSetRegionWithMaxKm = vi.fn();
    wrap(
      <DiscoverRightPanel
        panelContent="agri-landing"
        city="udupi"
        areas={[]}
        onStartOver={vi.fn()}
        onSelectJourney={vi.fn()}
        journey="agri-first"
        corridorGroups={[NORTH_CORRIDOR]}
        isLoadingRegionalGroups={false}
        selectedRegion={null}
        selectedMaxKm={null}
        onSetRegion={vi.fn()}
        onSetRegionWithMaxKm={onSetRegionWithMaxKm}
        onSetMaxKm={vi.fn()}
        onClearRegionAndMaxKm={vi.fn()}
        discoverAreas={AGRI_AREAS}
      />,
    );

    const card = screen.getByTestId('corridor-card');
    await user.click(card);
    expect(onSetRegionWithMaxKm).toHaveBeenCalledWith('N');
  });
});
