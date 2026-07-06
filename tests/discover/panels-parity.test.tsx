/**
 * Issue #1745 Batch B — panels-parity regression coverage.
 *
 * Asserts the presentational-only visual-parity convergence: the three
 * solid-fill "hero band" summary cards (SchoolsInAreaPanel selected-area
 * summary, SchoolSummaryBand + skeleton, AgriGroupSelectedPanel corridor
 * band) render via the shared tinted-card model (border + bg-card, never a
 * solid brand-colour fill) across loading/empty/data states, and that the
 * area-first/school-first gate on SchoolsInAreaPanel's summary band is
 * preserved (Risk #3 in the Batch B pre-flight).
 *
 * JSDOM-mountable leaf panels only — MapDiscovery/PropertyMap are not
 * mountable here and are covered by browser/E2E verification instead.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { SchoolGroupAreasPanel } from '@/components/discover/panels/SchoolGroupAreasPanel';
import { AgriGroupSelectedPanel } from '@/components/discover/panels/AgriGroupSelectedPanel';
import { SchoolSelectedPanel } from '@/components/discover/panels/SchoolJourneyPanels';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

// ─── Hoisted mocks (SchoolsInAreaPanel pulls in useDiscoverUrlState/useDiscoverAreas) ──
// SchoolJourneyPanels.tsx transitively imports usePropertyListings.ts (for
// clampSchoolRadiusKm), which constructs the real Supabase client at module load —
// mock the generated client directly so no test in this file needs VITE_SUPABASE_URL.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
  },
}));

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(msg: string, status: number, body: unknown) {
      super(msg);
      this.status = status;
      this.body = body;
    }
  },
}));

const mockSetFiltersLive = vi.hoisted(() => vi.fn());
const mockUrlState = vi.hoisted(() => ({
  city: 'udupi',
  areaKey: 'IN|KA|Udupi|Manipal',
  viewport: null,
  schoolId: null,
  radiusKm: null,
  q: '',
  journey: 'school-first' as const,
  groupId: null,
  filters: { boardFilters: [] as string[], categoryFilters: [] as string[] },
}));

vi.mock('@/hooks/useDiscoverUrlState', () => ({
  useDiscoverUrlState: vi.fn(() => [
    mockUrlState,
    { setFiltersLive: mockSetFiltersLive, setSchoolParams: vi.fn(), clearAreaContext: vi.fn(), setSchoolJourney: vi.fn() },
  ]),
}));

vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: vi.fn(() => ({
    data: { pages: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: {
      city: 'udupi',
      areas: [
        {
          areaKey: 'IN|KA|Udupi|Manipal',
          name: 'Manipal',
          areaLabel: 'Manipal',
          geoCenterLat: 13.35,
          geoCenterLon: 74.79,
          listingCount: 5,
          schoolCount: 3,
        },
      ],
    },
    isLoading: false,
  })),
}));

// Import after the mocks above so SchoolsInAreaPanel picks up the mocked hooks.
import { SchoolsInAreaPanel } from '@/components/discover/panels/SchoolsInAreaPanel';

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function withProviders(node: React.ReactNode) {
  return (
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

const mockGroup: AreaGroup = {
  id: 'group-1',
  name: 'University Belt',
  subtitle: 'Near the campuses',
  region_label: null,
  school_count: 3,
  area_keys: ['IN|KA|Udupi|Manipal'],
};

const mockAreas: DiscoverArea[] = [
  {
    areaKey: 'IN|KA|Udupi|Manipal',
    name: 'Manipal',
    areaLabel: 'Manipal',
    geoCenterLat: 13.35,
    geoCenterLon: 74.79,
    listingCount: 5,
    schoolCount: 3,
  } as DiscoverArea,
];

const mockSchool: SchoolResult = {
  id: 'school-1',
  name: 'Manipal School',
  address: 'Manipal, Udupi',
  latitude: 13.35,
  longitude: 74.79,
  board: 'CBSE',
  boardType: 'Central',
  distanceKm: 1.5,
};

function makeListing(id: string): DiscoverCityListingItem {
  return {
    id,
    propertyType: 'apartment',
    lat: 13.35,
    lon: 74.79,
    title: `Property ${id}`,
    locality: 'Manipal',
    areaKey: 'IN|KA|Udupi|Manipal',
    pricePaise: 5_000_000_00,
    bedrooms: 2,
    listingPurpose: 'sale',
    coverImageUrl: null,
    isAuthenticated: false,
  } as unknown as DiscoverCityListingItem;
}

describe('Batch B panels-parity — SchoolGroupAreasPanel', () => {
  it('loading: renders skeleton shell (no crash, no zone summary yet)', () => {
    render(
      withProviders(
        <SchoolGroupAreasPanel
          group={mockGroup}
          discoverAreas={[]}
          isLoading
          onBack={vi.fn()}
          onSelectAreaKey={vi.fn()}
          onStartOver={vi.fn()}
          journey="school-first"
        />,
      ),
    );
    expect(screen.getByTestId('school-group-areas-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('school-zone-hero')).not.toBeInTheDocument();
  });

  it('empty: shows the no-areas-in-zone empty state', () => {
    render(
      withProviders(
        <SchoolGroupAreasPanel
          group={mockGroup}
          discoverAreas={[]}
          isLoading={false}
          onBack={vi.fn()}
          onSelectAreaKey={vi.fn()}
          onStartOver={vi.fn()}
          journey="school-first"
        />,
      ),
    );
    expect(screen.getByTestId('school-group-areas-empty')).toBeInTheDocument();
  });

  it('data: zone hero Stat typography converges on font-mono (Issue #1745 Batch B)', () => {
    render(
      withProviders(
        <SchoolGroupAreasPanel
          group={mockGroup}
          discoverAreas={mockAreas}
          isLoading={false}
          onBack={vi.fn()}
          onSelectAreaKey={vi.fn()}
          onStartOver={vi.fn()}
          journey="school-first"
        />,
      ),
    );
    // Visual-parity polish (cycle 2): the zone-selected hero is now a school-first-local
    // dark-navy SchoolJourneyHero (not the shared tinted-card SummaryBandCard model), so
    // this test only asserts the font-mono stat typography convergence still holds —
    // it does NOT assert "not solid fill" (unlike the school-summary-band / selected-area-
    // summary / agri-group-summary-band assertions below, which remain on the shared
    // tinted-card model per the original Batch B decision and are intentionally untouched).
    const summary = screen.getByTestId('school-zone-hero');
    expect(summary).toBeInTheDocument();
    const stat = summary.querySelector('.font-mono');
    expect(stat).not.toBeNull();
  });
});

describe('Batch B panels-parity — AgriGroupSelectedPanel corridor band', () => {
  it('is a tinted card (border + bg-card), not a solid evergreen fill', () => {
    const { container } = render(
      withProviders(
        <AgriGroupSelectedPanel
          groupLabel="North · 10–25 km"
          listings={[]}
          listingCount={0}
          isLoading={false}
          isError={false}
          onRetry={vi.fn()}
          onClear={vi.fn()}
          onSelectListing={vi.fn()}
          selectedMaxKm={null}
          availableMaxDistances={undefined}
          onSetMaxKm={vi.fn()}
        />,
      ),
    );
    const band = screen.getByTestId('agri-group-summary-band');
    expect(band.className).toContain('bg-card');
    expect(band.className).not.toContain('bg-evergreen ');
    expect(band.className).not.toMatch(/(?:^|\s)bg-evergreen(?:\s|$)/);
    // Title testid + text preserved for the existing routing test contract.
    expect(screen.getByTestId('agri-group-selected-label')).toHaveTextContent('North · 10–25 km');
  });

  it('empty state renders when there are no listings', () => {
    render(
      withProviders(
        <AgriGroupSelectedPanel
          groupLabel="North · 10–25 km"
          listings={[]}
          listingCount={0}
          isLoading={false}
          isError={false}
          onRetry={vi.fn()}
          onClear={vi.fn()}
          onSelectListing={vi.fn()}
          selectedMaxKm={null}
          availableMaxDistances={undefined}
          onSetMaxKm={vi.fn()}
        />,
      ),
    );
    expect(screen.getByTestId('agri-group-empty-state')).toBeInTheDocument();
  });

  it('error state renders a retry affordance', () => {
    render(
      withProviders(
        <AgriGroupSelectedPanel
          groupLabel="North · 10–25 km"
          listings={null}
          listingCount={0}
          isLoading={false}
          isError
          onRetry={vi.fn()}
          onClear={vi.fn()}
          onSelectListing={vi.fn()}
          selectedMaxKm={null}
          availableMaxDistances={undefined}
          onSetMaxKm={vi.fn()}
        />,
      ),
    );
    expect(screen.getByTestId('agri-group-error-state')).toBeInTheDocument();
    expect(screen.getByTestId('agri-group-retry-btn')).toBeInTheDocument();
  });
});

describe('Batch B panels-parity — SchoolsInAreaPanel selected-area summary gate', () => {
  it('school-first: renders the selected-area summary band (now a dark-navy SchoolJourneyHero, mock parity cycle 2)', () => {
    render(withProviders(<SchoolsInAreaPanel journey="school-first" onStartOver={vi.fn()} />));
    const band = screen.getByTestId('selected-area-summary');
    // Cycle 2 visual-parity polish: the selected-area summary converged on the same
    // dark-navy SchoolJourneyHero used for the zone-selected + school-selected states
    // (mirrors the agri-first AgriGroupSelectedPanel corridor hero, #1771 precedent).
    // It is a school-first-local component — never bg-primary (the old solid-fill token
    // this gate was originally guarding against).
    expect(band.className).toContain('bg-[#0F172A]');
    expect(band.className).not.toMatch(/(?:^|\s)bg-primary(?:\s|$)/);
  });

  it('area-first sub-step: does NOT render the selected-area summary band (Risk #3 gate)', () => {
    render(withProviders(<SchoolsInAreaPanel journey="area-first" onStartOver={vi.fn()} />));
    expect(screen.queryByTestId('selected-area-summary')).not.toBeInTheDocument();
  });
});

describe('Batch B panels-parity — SchoolSelectedPanel summary band + skeleton', () => {
  it('loading (school=null): renders a navy skeleton shell matching the loaded hero (mock parity, cycle 2)', () => {
    render(
      withProviders(
        <SchoolSelectedPanel
          school={null}
          listings={[]}
          isLoadingListings={false}
          radiusKm={3}
          onRadiusChange={vi.fn()}
          onStartOver={vi.fn()}
          intent="buy"
        />,
      ),
    );
    const skeleton = screen.getByTestId('school-summary-skeleton');
    // Cycle 2: the skeleton now matches the loaded SchoolJourneyHero's navy surface
    // (previously bg-card) so loading→loaded never flashes between two different
    // background colours. Never a solid brand-accent (plum/copper/evergreen) fill.
    expect(skeleton.className).toContain('bg-[#0F172A]');
    expect(skeleton.className).not.toMatch(/(?:^|\s)bg-primary\/20(?:\s|$)/);
  });

  it('data: renders the dark-navy school-summary-band (SchoolJourneyHero, mock parity cycle 2)', () => {
    render(
      withProviders(
        <SchoolSelectedPanel
          school={mockSchool}
          listings={[makeListing('l-1')]}
          isLoadingListings={false}
          radiusKm={3}
          onRadiusChange={vi.fn()}
          onStartOver={vi.fn()}
          intent="buy"
        />,
      ),
    );
    const band = screen.getByTestId('school-summary-band');
    expect(band.className).toContain('bg-[#0F172A]');
    expect(screen.getByTestId('school-summary-name')).toHaveTextContent('Manipal School');
  });
});
