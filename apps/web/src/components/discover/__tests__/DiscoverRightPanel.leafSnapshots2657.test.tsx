/**
 * Issue #2657 C2a — pre-move DOM snapshots for the four leaves C2b extracts
 * verbatim into features/discover/right-panel/{agri,entry,shared}/*.tsx:
 *   - CorridorLandingPanel (agri-landing: loading / not-generated / error /
 *     region chips / empty / list)
 *   - agri-selected inline render (loading / empty / list / acreage)
 *   - anon "Search this area" viewport list (loading / error / empty / grid /
 *     retry banner)
 *   - area hydration states (hydrating / not-found), for both area-selected
 *     and schools-in-area
 *
 * This file makes NO production change. It renders the PUBLIC DiscoverRightPanel
 * with fixed, deterministic fixtures (no dates/random ids beyond fixed literals)
 * and snapshots `container.innerHTML` for every branch above. C2b must NOT
 * change any of these snapshots — a diff after the move is a regression, not
 * something to `-u` away.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { DiscoverRightPanel } from '@/features/discover/right-panel/testing/flatPropsRightPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { AnonViewportListingItem } from '@/lib/anonViewportListing';
import type { CorridorGroupData } from '@/hooks/useRegionalAreaGroups';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

// SchoolsInAreaPanel (rendered for the schools-in-area hydration branches)
// internally calls useDiscoverAreas — stub it deterministically, mirroring
// DiscoverRightPanel.issue1064.test.tsx.
vi.mock('@/hooks/useDiscoverAreas', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useDiscoverAreas')>(
    '@/hooks/useDiscoverAreas',
  );
  return {
    ...actual,
    useDiscoverAreas: vi.fn(() => ({ data: { city: 'udupi', areas: [] }, isLoading: false })),
  };
});

const baseProps = {
  onStartOver: vi.fn(),
  onSelectJourney: vi.fn(),
};

const renderPanel = (ui: React.ReactElement) =>
  renderWithProviders(
    <DiscoverProvider>
      <AreaSetDraftProvider>{ui}</AreaSetDraftProvider>
    </DiscoverProvider>,
  );

// ─── Fixtures (fixed, deterministic — no Date.now()/random ids) ──────────────

const AREA_KEY = 'IN|KA|Udupi|Manipal';

const AREA: AreaPoint = {
  areaKey: AREA_KEY,
  areaLabel: 'Manipal',
  geo_center_lat: 13.35,
  geo_center_lon: 74.79,
  bbox: null,
  listingCount: 42,
};

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

const AGRI_AREA_EMPTY: DiscoverArea = {
  areaKey: AREA_KEY,
  name: 'Manipal',
  geoCenterLat: 13.35,
  geoCenterLon: 74.79,
  listingCount: 0,
  schoolCount: 3,
};

const AGRI_AREA_LIST: DiscoverArea = { ...AGRI_AREA_EMPTY, listingCount: 5 };
const AGRI_AREA_ACREAGE: DiscoverArea = { ...AGRI_AREA_LIST, agriAcreage: 8.3 };

const AREA_LISTING: DiscoverCityListingItem = {
  id: 'l1',
  title: 'Farm plot near Manipal',
  locality: 'Manipal',
  landArea: 2,
  landAreaUnit: 'acres',
} as unknown as DiscoverCityListingItem;

const makeAnonViewportListing = (id: string): AnonViewportListingItem =>
  ({
    id,
    priceBand: 'BAND_2',
    monthlyRentBand: null,
    propertyType: 'apartment',
    locality: 'Manipal',
    primaryImageUrl: null,
    listingPurpose: 'sale',
    bedrooms: 2,
    title: `Listing ${id}`,
    bathrooms: 2,
    builtArea: null,
    builtAreaUnit: null,
    landArea: null,
    landAreaUnit: null,
    totalFloors: null,
    parkingCount: null,
    furnishingStatus: null,
    createdAt: '2026-01-01T00:00:00Z',
    confirmedAt: null,
    trustBadge: null,
    lat: 13.35,
    lon: 74.79,
    latitude: 13.35,
    longitude: 74.79,
    kind: 'ANON_VIEWPORT',
    areaKey: 'udupi|manipal',
  }) as unknown as AnonViewportListingItem;

const KNOWN_SCHOOL: SchoolResult = {
  id: 's-1',
  name: 'Kodavoor School',
  latitude: 13.354,
  longitude: 74.708,
  board: 'STATE',
  category: 'PRIMARY',
  city: 'udupi',
  areaKey: AREA_KEY,
} as unknown as SchoolResult;

// ─── CorridorLandingPanel (agri-landing) ─────────────────────────────────────

describe('C2a snapshot — CorridorLandingPanel (agri-landing)', () => {
  it('loading', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-landing"
        areas={[]}
        corridorGroups={[]}
        isLoadingRegionalGroups
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('not-generated-for-revision', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-landing"
        areas={[]}
        corridorGroups={[]}
        isRegionalGroupsNotGeneratedForRevision
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('error', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-landing"
        areas={[]}
        corridorGroups={[]}
        isRegionalGroupsError
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('region chips (level 2)', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-landing"
        areas={[]}
        corridorGroups={[SAMPLE_CORRIDOR]}
        selectedRegion="N"
        selectedMaxKm={25}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('empty', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-landing"
        areas={[]}
        corridorGroups={[]}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('list', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-landing"
        areas={[]}
        corridorGroups={[SAMPLE_CORRIDOR]}
        cityLabel="Udupi"
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});

// ─── agri-selected (inline render) ───────────────────────────────────────────

describe('C2a snapshot — agri-selected', () => {
  it('loading', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-selected"
        areas={[AREA]}
        selectedArea={AREA}
        areaListings={[]}
        isLoadingListings
        isLoadingAgriAreas
        journey="agri-first"
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('empty', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-selected"
        areas={[AREA]}
        selectedArea={AREA}
        areaListings={[]}
        isLoadingListings={false}
        agriAreasData={[AGRI_AREA_EMPTY]}
        isLoadingAgriAreas={false}
        journey="agri-first"
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('list', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-selected"
        areas={[AREA]}
        selectedArea={AREA}
        areaListings={[AREA_LISTING]}
        isLoadingListings={false}
        agriAreasData={[AGRI_AREA_LIST]}
        isLoadingAgriAreas={false}
        journey="agri-first"
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('acreage', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-selected"
        areas={[AREA]}
        selectedArea={AREA}
        areaListings={[AREA_LISTING]}
        isLoadingListings={false}
        agriAreasData={[AGRI_AREA_ACREAGE]}
        isLoadingAgriAreas={false}
        journey="agri-first"
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});

// ─── Anon "Search this area" viewport list ───────────────────────────────────

describe('C2a snapshot — anon viewport listings', () => {
  const anonBaseProps = {
    ...baseProps,
    panelContent: 'guided-entry' as const,
    areas: [],
    isAnonViewport: true,
  };

  it('loading', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel {...anonBaseProps} anonViewportListingsLoading />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('error', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel {...anonBaseProps} anonViewportListings={[]} isErrorAnonViewport />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('empty', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel {...anonBaseProps} anonViewportListings={[]} />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('grid', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...anonBaseProps}
        anonViewportListings={[makeAnonViewportListing('anon-1')]}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('retry banner', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...anonBaseProps}
        anonViewportListings={[makeAnonViewportListing('retained-1')]}
        isErrorAnonViewport
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});

// ─── Area hydration states — area-selected and schools-in-area ──────────────

describe('C2a snapshot — area hydration states', () => {
  it('area-selected hydrating', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[]}
        selectedArea={null}
        urlAreaKey={AREA_KEY}
        isLoadingAreas
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('area-selected not-found', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[]}
        selectedArea={null}
        urlAreaKey={AREA_KEY}
        isLoadingAreas={false}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('schools-in-area hydrating', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="schools-in-area"
        areas={[]}
        selectedArea={null}
        urlAreaKey={AREA_KEY}
        isLoadingAreas
        schools={[KNOWN_SCHOOL]}
        schoolsLoading={false}
        journey="school-first"
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('schools-in-area not-found', () => {
    const { container } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="schools-in-area"
        areas={[]}
        selectedArea={null}
        urlAreaKey={AREA_KEY}
        isLoadingAreas={false}
        schools={[KNOWN_SCHOOL]}
        schoolsLoading={false}
        journey="school-first"
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});
