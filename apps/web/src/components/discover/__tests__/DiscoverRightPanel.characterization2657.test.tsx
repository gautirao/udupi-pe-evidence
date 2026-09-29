/**
 * Issue #2657 (C0) — characterization tests for DiscoverRightPanel.tsx gaps
 * G1-G11, G13, G14 identified by the architect plan as load-bearing branches
 * with NO deterministic test today. These are PARITY ORACLES for the C1-C8
 * extraction commits: every assertion here goes through the PUBLIC
 * `DiscoverRightPanel` component (never an internal helper that will move),
 * so this file must still pass, unchanged, once the JSX bodies below are
 * relocated into features/discover/right-panel/*.
 *
 * G12 (bridge wiring: anon price-param strip, onBack journey choice,
 * onBackToRegion, areasCount, footer pager, agriGroupTruncated default) lives
 * in features/discover/surfaces/panel/__tests__/LegacyRightPanelBridge.wiring2657.test.tsx
 * instead, since those closures live in LegacyRightPanelBridge.tsx, not here.
 *
 * G14 (useAgriDestinations gate) is already covered at the observable level
 * by DiscoverRightPanel.agriGroupPeek.test.tsx's two "gates the destinations
 * fetch" tests (one non-locality state + the locality state). This file adds
 * one supplementary sweep over MORE non-locality states for extra confidence
 * only — it does not duplicate the existing pair.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthModalProvider } from '@/contexts/AuthModalContext';
import { renderWithProviders } from '@/test/renderWithProviders';
import { mockMatchMediaWidth } from '@/test-utils/mockMatchMediaWidth';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import { DiscoverRightPanel } from '@/features/discover/right-panel/testing/flatPropsRightPanel';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { CorridorGroupData } from '@/hooks/useRegionalAreaGroups';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { SummaryRegionRef } from '@/utils/macroRegionResolver';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockEmitPanelOpen = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useDiscoverTelemetry', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useDiscoverTelemetry')>(
    '@/hooks/useDiscoverTelemetry',
  );
  return { ...actual, useDiscoverTelemetry: () => ({ ...actual.useDiscoverTelemetry(), emitPanelOpen: mockEmitPanelOpen }) };
});

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Prevent "supabaseUrl is required" crash from transitive usePropertyListings/PropertyCard imports.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
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

const mockUseAgriDestinations = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useAgriDestinations: mockUseAgriDestinations,
}));

const mockUseAgriListingDetail = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAgriListingDetail', () => ({
  useAgriListingDetail: mockUseAgriListingDetail,
}));

vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>('@/contexts/AuthContext');
  return { ...actual, useAuth: vi.fn(() => ({ user: null, session: null, isLoading: false, isAdmin: false, isDealer: false })) };
});

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn((city: string) => ({
    data: {
      city,
      areas: [
        {
          areaKey: 'IN|KA|Udupi|Manipal',
          name: 'Manipal',
          geo_center_lat: 13.3,
          geo_center_lon: 74.7,
          bbox: null,
          listingCount: 5,
          schoolCount: 3,
        },
      ],
    },
    isLoading: false,
    error: null,
  })),
}));

// Issue #1953 (build step 2) — GuidedEntryPanel/SchoolBrowsePanel/SchoolSelectedPanel/
// AreaSchoolCombinedPanel/SchoolsInAreaPanel consume the DiscoverProvider facade.
const mockSetSchoolJourney = vi.hoisted(() => vi.fn());
vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'udupi',
    areaKey: null,
    boardFilters: [],
    categoryFilters: [],
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: 'school-first' as const,
    groupId: null,
    filters: {},
  }),
  useDiscoverViewport: () => null,
  useDiscoverShell: () => ({
    mobileView: 'LIST' as const,
    setMobileView: vi.fn(),
    isMobileShell: false,
    isAreaSetDraftOpen: false,
    openAreaSetDraft: vi.fn(),
    closeAreaSetDraft: vi.fn(),
    fitAreaSet: vi.fn(),
    focusAreaSetMember: vi.fn(),
    registerAreaSetCameraActions: vi.fn(),
    getAreaSetCameraRestoreRequest: vi.fn(() => null),
    setAreaSetCameraRestoreRequest: vi.fn(),
  }),
  useDiscoverActions: () => ({
    selectArea: vi.fn(),
    deselectArea: vi.fn(),
    setSchoolParams: vi.fn(),
    setFiltersLive: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setBoardFilters: vi.fn(),
    setCategoryFilters: vi.fn(),
    clearAreaContext: vi.fn(),
    clearSchoolContext: vi.fn(),
    startOver: vi.fn(),
    setJourney: vi.fn(),
    selectGroup: vi.fn(),
    setSchoolJourney: mockSetSchoolJourney,
    setSearchQuery: vi.fn(),
    reportViewport: vi.fn(),
    setCity: vi.fn(),
    changeCity: vi.fn(),
    setScope: vi.fn(),
  }),
}));

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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeArea = (areaKey: string, areaLabel: string): AreaPoint => ({
  areaKey,
  areaLabel,
  geo_center_lat: 13.3,
  geo_center_lon: 74.7,
  bbox: null,
  listingCount: 5,
});

const makeAgriItem = (id: string, areaKey: string): AgriMapListingItem => ({
  id,
  areaKey,
  latitude: 13.35,
  longitude: 74.79,
  propertyType: 'agricultural_land',
  locality: 'Manipal Village',
  landArea: 2.5,
  landAreaUnit: 'acre',
  computedAreaAcres: 2.5,
  pricePaise: 3000000 * 100,
});

const makeSchool = (id: string, name: string): SchoolResult => ({
  id,
  name,
  board: 'CBSE',
  boardType: null,
  address: 'Manipal, Udupi',
  latitude: 13.3525,
  longitude: 74.7864,
  distanceKm: 1.2,
} as unknown as SchoolResult);

const NORTH_CORRIDOR: CorridorGroupData = {
  directionCode: 'N',
  groupName: 'N towards Brahmavar',
  availableMaxDistances: [
    { maxKm: 10, distanceLabel: 'Within 10 km', includedBandCodes: ['0_10'], listingCount: 3, areaKeys: ['IN|KA|Udupi|Area1'] },
  ],
};

const baseProps = {
  areas: [],
  onStartOver: vi.fn(),
  onSelectJourney: vi.fn(),
};

const renderPanel = (ui: React.ReactElement) =>
  renderWithProviders(<AreaSetDraftProvider>{ui}</AreaSetDraftProvider>);

beforeEach(() => {
  mockNavigate.mockClear();
  mockEmitPanelOpen.mockClear();
  mockSetSchoolJourney.mockClear();
  mockUseAgriDestinations.mockReset();
  mockUseAgriDestinations.mockReturnValue({
    destinations: [],
    isLoading: false,
    isError: false,
    isNotYetPromoted: false,
    error: null,
    refetch: vi.fn(),
  });
  mockUseAgriListingDetail.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
});

// ─────────────────────────────────────────────────────────────────────────────
// G1 — region-guide helper text (3 markerKind variants + scope-label fallback)
// ─────────────────────────────────────────────────────────────────────────────

describe('G1 — region-guide helper text (DiscoverRightPanel.tsx ~2136-2142)', () => {
  const REGIONS: SummaryRegionRef[] = [{ regionKey: 'north', regionLabel: 'North Bangalore' }];

  it('markerKind="zones" renders the zones copy with the resolved region label', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        summaryRegions={REGIONS}
        scope="north"
        regionGuideRingActive
        regionGuideMarkerKind="zones"
      />,
    );
    expect(screen.getByTestId('region-guide-helper')).toHaveTextContent(
      "North Bangalore selected. The map shows this region's zones — choose how you want to continue below.",
    );
  });

  it('markerKind="areas" renders the areas copy (distinct from zones)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        summaryRegions={REGIONS}
        scope="north"
        regionGuideRingActive
        regionGuideMarkerKind="areas"
      />,
    );
    expect(screen.getByTestId('region-guide-helper')).toHaveTextContent(
      "North Bangalore selected. The map shows this region's areas — choose how you want to continue below.",
    );
  });

  it('null markerKind (RegionOverviewMarkerKind is only "zones" | "areas" | null) falls through to the generic copy', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        summaryRegions={REGIONS}
        scope="north"
        regionGuideRingActive
        regionGuideMarkerKind={null}
      />,
    );
    expect(screen.getByTestId('region-guide-helper')).toHaveTextContent(
      'North Bangalore selected. The map shows an overview of this region — choose how you want to continue below.',
    );
  });

  it('falls back to the raw scope key when no summaryRegions entry matches', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        summaryRegions={[]}
        scope="east"
        regionGuideRingActive
        regionGuideMarkerKind="zones"
      />,
    );
    expect(screen.getByTestId('region-guide-helper')).toHaveTextContent(
      "east selected. The map shows this region's zones — choose how you want to continue below.",
    );
  });

  it('ring/nonce/reduced-motion props are forwarded: reduced motion renders a static ring class, not the animated one', () => {
    const { container: motionContainer } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        summaryRegions={REGIONS}
        scope="north"
        regionGuideRingActive
        regionGuideMarkerKind="zones"
        prefersReducedMotion={false}
      />,
    );
    const motionSection = motionContainer.querySelector('[data-testid="journey-switcher-section"]');
    expect(motionSection).toHaveClass('dp-attn-on');
    expect(motionSection).not.toHaveClass('dp-attn-static');

    const { container: staticContainer } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        summaryRegions={REGIONS}
        scope="north"
        regionGuideRingActive
        regionGuideMarkerKind="zones"
        prefersReducedMotion
      />,
    );
    const staticSection = staticContainer.querySelector('[data-testid="journey-switcher-section"]');
    expect(staticSection).toHaveClass('dp-attn-static');
    expect(staticSection).not.toHaveClass('dp-attn-on');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G2 — activeJourney inference (:2218)
// ─────────────────────────────────────────────────────────────────────────────

describe('G2 — activeJourney inference (journey ?? inferJourneyFromPanelContent)', () => {
  // RightPanelFrame no longer renders the desktop compact tab strip for non-guided-entry content, so these exercise the same derivation via the mobile strip instead.
  it('journey-less area-school-combined infers school-first as the active tab', () => {
    const area = makeArea('IN|KA|Udupi|Manipal', 'Manipal');
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-school-combined"
        selectedArea={area}
        selectedSchool={null}
        schoolListings={[]}
        schoolListingsLoading={false}
        radiusKm={3}
        onRadiusChange={vi.fn()}
        isMobileShell
      />,
    );
    expect(screen.getByTestId('journey-card-school-first')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('journey-card-area-first')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('journey-card-agri-first')).toHaveAttribute('aria-selected', 'false');
  });

  it('an explicit journey prop wins over the inference (area-first, not school-first)', () => {
    const area = makeArea('IN|KA|Udupi|Manipal', 'Manipal');
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-school-combined"
        journey="area-first"
        selectedArea={area}
        selectedSchool={null}
        schoolListings={[]}
        schoolListingsLoading={false}
        radiusKm={3}
        onRadiusChange={vi.fn()}
        isMobileShell
      />,
    );
    expect(screen.getByTestId('journey-card-area-first')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('journey-card-school-first')).toHaveAttribute('aria-selected', 'false');
  });

  it('guided-entry (no journey) selects no tab at all', () => {
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" />);
    expect(screen.getByTestId('journey-card-area-first')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('journey-card-school-first')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('journey-card-agri-first')).toHaveAttribute('aria-selected', 'false');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G3 — DiscoverControlBar / desktop journey tabs ownership (:2173)
// ─────────────────────────────────────────────────────────────────────────────

describe('G3 — DiscoverControlBar and the desktop compact journey-tab strip moved to the shared header', () => {
  // Wide enough for the header to host the control bar + journey tabs; the panel must never render its own copy.
  describe('wide desktop (header hosts controls)', () => {
    let matchMediaMock: { restore: () => void };
    beforeEach(() => {
      matchMediaMock = mockMatchMediaWidth(1366);
    });
    afterEach(() => {
      matchMediaMock.restore();
    });

    it('never renders DiscoverControlBar itself', () => {
      renderPanel(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" isMobileShell={false} />);
      expect(screen.queryByTestId('discover-control-bar')).not.toBeInTheDocument();
    });

    it('does not render the compact journey-tab strip for a non-landing panel state (the header owns it)', () => {
      renderPanel(
        <DiscoverRightPanel {...baseProps} panelContent="area-selected" isMobileShell={false} />,
      );
      expect(screen.queryByRole('tablist', { name: /choose how you want to search/i })).not.toBeInTheDocument();
    });

    it('does not render its own JourneySwitcher on the guided-entry landing either — the header is now the sole selector there too', () => {
      renderPanel(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" isMobileShell={false} />);
      expect(screen.queryByRole('tablist', { name: /choose how you want to search/i })).not.toBeInTheDocument();
    });
  });

  // Below the header's threshold: the header has no room for it, so the panel falls back to rendering its own copy — exactly as before the header existed. Regression coverage for the gap between isMobileShell (≤820px) and the header's own width threshold.
  describe('narrow desktop (below the header threshold — panel falls back to its own copy)', () => {
    let matchMediaMock: { restore: () => void };
    beforeEach(() => {
      matchMediaMock = mockMatchMediaWidth(900);
    });
    afterEach(() => {
      matchMediaMock.restore();
    });

    it('renders exactly one DiscoverControlBar for a non-landing panel state', () => {
      renderPanel(
        <DiscoverRightPanel {...baseProps} panelContent="area-selected" isMobileShell={false} />,
      );
      expect(screen.getAllByTestId('discover-control-bar')).toHaveLength(1);
    });

    it('renders exactly one DiscoverControlBar on the guided-entry landing too', () => {
      renderPanel(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" isMobileShell={false} />);
      expect(screen.getAllByTestId('discover-control-bar')).toHaveLength(1);
    });

    it('still renders the compact journey-tab strip for a non-landing panel state (the header does not own it at this width)', () => {
      renderPanel(
        <DiscoverRightPanel {...baseProps} panelContent="area-selected" isMobileShell={false} />,
      );
      expect(screen.getByRole('tablist', { name: /choose how you want to search/i })).toBeInTheDocument();
    });
  });

  it('never renders DiscoverControlBar itself when isMobileShell is true, at any width', () => {
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" isMobileShell />);
    expect(screen.queryByTestId('discover-control-bar')).not.toBeInTheDocument();
  });

  it('still renders the compact journey-tab strip on mobile for every panel state (unchanged)', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="area-selected" isMobileShell />,
    );
    expect(screen.getByRole('tablist', { name: /choose how you want to search/i })).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G4 — top chip-strip rule (PANELS_WITH_INLINE_CHIPS, :2111-2126)
// ─────────────────────────────────────────────────────────────────────────────

describe('G4 — top chip-strip rendered only for panels WITHOUT their own inline chips', () => {
  const marker = <span data-testid="chip-strip-marker">chips</span>;

  it('guided-entry (not in the inline-chip set) renders the top strip wrapper around activeContextChips', () => {
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" activeContextChips={marker} />);
    const el = screen.getByTestId('chip-strip-marker');
    expect(el.parentElement).toHaveClass('border-b', 'border-border', 'shrink-0', 'px-4', 'py-2');
  });

  it('area-selection (not in the inline-chip set) also renders the top strip', () => {
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="area-selection" activeContextChips={marker} />);
    const el = screen.getByTestId('chip-strip-marker');
    expect(el.parentElement).toHaveClass('border-b', 'shrink-0');
  });

  it('school-browse (in the inline-chip set) never renders activeContextChips via the top strip', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="school-browse" journey="school-first" activeContextChips={marker} />,
    );
    expect(screen.queryByTestId('chip-strip-marker')).not.toBeInTheDocument();
  });

  it('agri-group-peek with a null item (in the inline-chip set, renders null body) still suppresses the top strip', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-peek"
        selectedGroupListingItem={null}
        activeContextChips={marker}
      />,
    );
    expect(screen.queryByTestId('chip-strip-marker')).not.toBeInTheDocument();
  });

  it('agri-detail (in the inline-chip set) also suppresses the top strip', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="agri-detail" selectedMarkerListing={null} activeContextChips={marker} />,
    );
    expect(screen.queryByTestId('chip-strip-marker')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G5 — agri-detail (null id -> null; onBack default/explicit)
// ─────────────────────────────────────────────────────────────────────────────

describe('G5 — agri-detail (:2080-2094)', () => {
  it('selectedMarkerListing null id renders nothing (no AgriListingPanel)', () => {
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="agri-detail" selectedMarkerListing={null} />);
    expect(screen.queryByTestId('agri-detail-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agri-detail-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agri-detail-error')).not.toBeInTheDocument();
  });

  it('clicking Back in the error state calls the explicit onClearAgriSelection prop', async () => {
    mockUseAgriListingDetail.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    const onClearAgriSelection = vi.fn();
    const marker = { id: 'listing-1', latitude: 13.35, longitude: 74.79 } as unknown as import('@/components/map/PropertyMap').PropertyListingWithImages;
    const user = userEvent.setup();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-detail"
        selectedMarkerListing={marker}
        onClearAgriSelection={onClearAgriSelection}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Back to area listings' }));
    expect(onClearAgriSelection).toHaveBeenCalledTimes(1);
  });

  it('omitting onClearAgriSelection falls back to a harmless no-op (Back click does not throw)', async () => {
    mockUseAgriListingDetail.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    const marker = { id: 'listing-2', latitude: 13.35, longitude: 74.79 } as unknown as import('@/components/map/PropertyMap').PropertyListingWithImages;
    const user = userEvent.setup();
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="agri-detail" selectedMarkerListing={marker} />);
    await user.click(screen.getByRole('button', { name: 'Back to area listings' }));
    // Still on the error state — the no-op default did not navigate or crash.
    expect(screen.getByTestId('agri-detail-error')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G6 — agri-group-locality (BEARING_LABELS, locality filter, navigate fallback)
// ─────────────────────────────────────────────────────────────────────────────

describe('G6 — agri-group-locality (:1621-1663)', () => {
  it('BEARING_LABELS resolves a known code (N -> North)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-locality"
        selectedLocality="IN|KA|Udupi|Manipal"
        selectedRegion="N"
        agriGroupListings={[]}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
      />,
    );
    expect(screen.getByTestId('agri-locality-close-btn')).toHaveTextContent('Back to towns in North');
  });

  it('an unrecognized bearing code passes through verbatim (never dropped or blanked)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-locality"
        selectedLocality="IN|KA|Udupi|Manipal"
        selectedRegion="XX"
        agriGroupListings={[]}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
      />,
    );
    expect(screen.getByTestId('agri-locality-close-btn')).toHaveTextContent('Back to towns in XX');
  });

  it('no selectedRegion renders the bare "Back to towns" with no "in {region}" suffix', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-locality"
        selectedLocality="IN|KA|Udupi|Manipal"
        selectedRegion={null}
        agriGroupListings={[]}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
      />,
    );
    const btn = screen.getByTestId('agri-locality-close-btn');
    expect(btn).toHaveTextContent('Back to towns');
    expect(btn).not.toHaveTextContent(/Back to towns in/);
  });

  it('filters agriGroupListings to only the selectedLocality areaKey', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-locality"
        selectedLocality="IN|KA|Udupi|Manipal"
        agriGroupListings={[
          makeAgriItem('in-locality', 'IN|KA|Udupi|Manipal'),
          makeAgriItem('other-locality', 'IN|KA|Udupi|Brahmavar'),
        ]}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
      />,
    );
    expect(screen.getAllByTestId('agri-locality-listing-row')).toHaveLength(1);
  });

  it('onSelectAgriGroupListing omitted falls back to navigate(`/listing/:id`)', async () => {
    const user = userEvent.setup();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-locality"
        selectedLocality="IN|KA|Udupi|Manipal"
        agriGroupListings={[makeAgriItem('fallback-nav', 'IN|KA|Udupi|Manipal')]}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
      />,
    );
    await user.click(screen.getByTestId('agri-locality-listing-row'));
    expect(mockNavigate).toHaveBeenCalledWith('/listing/fallback-nav');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G7 — agri-group-selected (corridor/tier lookups, label fallback, citySlug)
// ─────────────────────────────────────────────────────────────────────────────

describe('G7 — agri-group-selected (:1665-1720)', () => {
  it('a matching corridorGroups entry supplies the heading (wins over agriGroupLabel)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-selected"
        selectedRegion="N"
        corridorGroups={[NORTH_CORRIDOR]}
        agriGroupLabel="Stale label"
        agriGroupListings={[]}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
      />,
    );
    expect(screen.getByTestId('agri-group-selected-label')).toHaveTextContent('N towards Brahmavar');
  });

  it('no corridorGroups match falls back to agriGroupLabel', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-selected"
        selectedRegion="S"
        corridorGroups={[NORTH_CORRIDOR]}
        agriGroupLabel="South parcels"
        agriGroupListings={[]}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
      />,
    );
    expect(screen.getByTestId('agri-group-selected-label')).toHaveTextContent('South parcels');
  });

  it('neither corridorGroups match nor agriGroupLabel falls back to "Agricultural land"', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-selected"
        selectedRegion="S"
        corridorGroups={[]}
        agriGroupListings={[]}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
      />,
    );
    expect(screen.getByTestId('agri-group-selected-label')).toHaveTextContent('Agricultural land');
  });

  it('citySlug={city} (raw slug), NOT cityLabel, drives the destinations fetch', () => {
    mockUseAgriDestinations.mockClear();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-selected"
        city="udupi"
        cityLabel="Udupi Town (display)"
        selectedRegion="N"
        corridorGroups={[NORTH_CORRIDOR]}
        agriGroupListings={[]}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
      />,
    );
    // calls[0] is DRP's own gated call (agri-group-selected !== agri-group-locality -> '');
    // calls[1] is AgriGroupSelectedPanel's internal useAgriDestinations(citySlugForDestinations, ...) call.
    expect(mockUseAgriDestinations).toHaveBeenCalledTimes(2);
    const [cityArg] = mockUseAgriDestinations.mock.calls[1];
    expect(cityArg).toBe('udupi');
    expect(cityArg).not.toBe('Udupi Town (display)'.toLowerCase());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G8 — area-selected (regionName resolution, breadcrumb gates, anon-viewport suppression)
// ─────────────────────────────────────────────────────────────────────────────

describe('G8 — area-selected (:1758-1901)', () => {
  const area = makeArea('IN|KA|Udupi|Manipal', 'Manipal');

  it('regionName prefers a case-insensitive summaryRegions match over prettifyZoneSlug', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        journey="area-first"
        scope="NORTH-ZONE"
        summaryRegions={[{ regionKey: 'north-zone', regionLabel: 'North Zone (summary)' }]}
      />,
    );
    expect(screen.getByTestId('breadcrumb-region')).toHaveTextContent('North Zone (summary)');
  });

  it('no summaryRegions match falls back to prettifyZoneSlug(scope)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        journey="area-first"
        scope="east-zone"
        summaryRegions={[]}
      />,
    );
    // prettifyZoneSlug title-cases hyphenated slugs.
    expect(screen.getByTestId('breadcrumb-region')).toHaveTextContent('East Zone');
  });

  it('onCrumbRegion is wired (button enabled) only when BOTH regionName and onBackToRegion are present', async () => {
    const onBackToRegion = vi.fn();
    const user = userEvent.setup();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        journey="area-first"
        scope="north-zone"
        summaryRegions={[{ regionKey: 'north-zone', regionLabel: 'North Zone' }]}
        onBackToRegion={onBackToRegion}
      />,
    );
    const regionCrumb = screen.getByTestId('breadcrumb-region');
    expect(regionCrumb).toBeEnabled();
    await user.click(regionCrumb);
    expect(onBackToRegion).toHaveBeenCalledWith('North Zone');
  });

  it('regionName present but onBackToRegion absent leaves the region crumb disabled (dead-control guard)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        journey="area-first"
        scope="north-zone"
        summaryRegions={[{ regionKey: 'north-zone', regionLabel: 'North Zone' }]}
      />,
    );
    expect(screen.getByTestId('breadcrumb-region')).toBeDisabled();
  });

  it('onCrumbCity is onNavigateAreaLanding and onCrumbGroup is onBack (distinct identities)', async () => {
    const onNavigateAreaLanding = vi.fn();
    const onBack = vi.fn();
    const user = userEvent.setup();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        journey="area-first"
        selectedGroupName="University Belt"
        onNavigateAreaLanding={onNavigateAreaLanding}
        onBack={onBack}
      />,
    );
    await user.click(screen.getByTestId('breadcrumb-city'));
    expect(onNavigateAreaLanding).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('breadcrumb-group'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onNavigateAreaLanding).toHaveBeenCalledTimes(1);
  });

  it('under the anon-viewport substitution, isError is hard-coded false and retry is undefined regardless of the underlying anon error flag', () => {
    const onRetryAnonViewport = vi.fn();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        journey="area-first"
        isAnonViewport
        anonViewportListings={[]}
        anonViewportListingsLoading={false}
        isErrorAnonViewport
        onRetryAnonViewport={onRetryAnonViewport}
        isListingsError
        onRetryListings={vi.fn()}
        areaResultSummaryText="42 of 100 match in Manipal"
      />,
    );
    // The AREA-SELECTED zero/error UI must not claim a request failure here —
    // isError is forced false for the anon-viewport branch (:1823-1830), so
    // ListingsBody's request-failure state (area-listings-error) must NOT render
    // even though isErrorAnonViewport is true and the substituted (viewport)
    // listings array is empty — and the area-specific summary text is
    // suppressed while substituted (:1804).
    expect(screen.queryByText('42 of 100 match in Manipal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-listings-error')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G9 — schools-in-area select gate (:2019)
// ─────────────────────────────────────────────────────────────────────────────

describe('G9 — schools-in-area select gate (journey === "area-first" ? onSelectSchool : undefined)', () => {
  const area = makeArea('IN|KA|Udupi|Manipal', 'Manipal');
  const schools = [makeSchool('sch-1', 'Manipal Public School')];

  it('area-first journey delegates school selection to the parent onSelectSchool', async () => {
    const onSelectSchool = vi.fn();
    const user = userEvent.setup();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="schools-in-area"
        selectedArea={area}
        journey="area-first"
        schools={schools}
        onSelectSchool={onSelectSchool}
      />,
    );
    await user.click(screen.getAllByTestId('school-card')[0]);
    expect(onSelectSchool).toHaveBeenCalledWith('sch-1');
    expect(mockSetSchoolJourney).not.toHaveBeenCalled();
  });

  it('school-first journey does NOT call the parent onSelectSchool (keeps its own internal path)', async () => {
    const onSelectSchool = vi.fn();
    const user = userEvent.setup();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="schools-in-area"
        selectedArea={area}
        journey="school-first"
        schools={schools}
        onSelectSchool={onSelectSchool}
      />,
    );
    await user.click(screen.getAllByTestId('school-card')[0]);
    expect(onSelectSchool).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G10 — school-group-areas invalid-group fallback has no selectJourney (:1956)
// ─────────────────────────────────────────────────────────────────────────────

describe('G10 — school-group-areas invalid/unresolved groupId fallback', () => {
  it('falls back to SchoolBrowsePanel WITHOUT selectJourney wired (area/school toggle control absent)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="school-group-areas"
        journey="school-first"
        groupId="does-not-exist"
        areaGroups={[]}
        isLoadingAreaGroupsForSchool={false}
        onSelectSchool={vi.fn()}
        onSelectAreaKey={vi.fn()}
      />,
    );
    // The MAIN school-browse call wires selectJourney and shows the toggle;
    // the invalid-group FALLBACK quirk omits it — SchoolBrowsePanel gates the
    // whole "Area | School" toggle control on `onSelectJourney` being truthy.
    expect(screen.queryByTestId('area-school-toggle')).not.toBeInTheDocument();
  });

  it('the SAME SchoolBrowsePanel reached via panelContent="school-browse" DOES wire selectJourney (toggle present)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="school-browse"
        journey="school-first"
        onSelectSchool={vi.fn()}
        onSelectAreaKey={vi.fn()}
      />,
    );
    expect(screen.getByTestId('area-school-toggle')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G11 — school-selected boundedSearch undefined without the prop (:2048)
// ─────────────────────────────────────────────────────────────────────────────

describe('G11 — school-selected boundedSearch command group (:2041-2048)', () => {
  it('onBoundedSearch present -> the radius CTA is wired and calling it triggers the prop', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="school-selected"
        selectedSchool={null}
        schoolListings={[]}
        schoolListingsLoading={false}
        radiusKm={3}
        onRadiusChange={vi.fn()}
        onBoundedSearch={vi.fn()}
      />,
    );
    // Presence proof: no crash / no fallback UI substituted — full radius selector renders.
    expect(screen.getByTestId('radius-btn-3')).toBeInTheDocument();
  });

  it('onBoundedSearch omitted -> commands.boundedSearch is undefined, never a dead {trigger} object (no crash, panel still renders)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="school-selected"
        selectedSchool={null}
        schoolListings={[]}
        schoolListingsLoading={false}
        radiusKm={3}
        onRadiusChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('radius-btn-3')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G13 — PANEL_OPEN telemetry fires exactly once per mount (:1279-1282)
// ─────────────────────────────────────────────────────────────────────────────

describe('G13 — PANEL_OPEN fires once on mount, never again across panelContent transitions', () => {
  it('guided-entry -> agri-landing -> school-browse on one mount emits exactly once', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = (ui: React.ReactElement) => (
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <MemoryRouter>
            <AuthProvider>
              <AuthModalProvider>
                <AreaSetDraftProvider>{ui}</AreaSetDraftProvider>
              </AuthModalProvider>
            </AuthProvider>
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>
    );

    const { rerender } = render(wrap(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" />));
    expect(mockEmitPanelOpen).toHaveBeenCalledTimes(1);

    rerender(wrap(<DiscoverRightPanel {...baseProps} panelContent="agri-landing" />));
    expect(mockEmitPanelOpen).toHaveBeenCalledTimes(1);

    rerender(wrap(<DiscoverRightPanel {...baseProps} panelContent="school-browse" journey="school-first" />));
    expect(mockEmitPanelOpen).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G14 (supplementary) — useAgriDestinations gate over MORE non-locality states
// ─────────────────────────────────────────────────────────────────────────────

describe('G14 (supplementary) — useAgriDestinations city gate over additional non-locality panelContent values', () => {
  // Issue #2657 C4 — useAgriDestinations moved (verbatim gate/cache-key) into
  // AgriJourneyPanel, which now mounts ONLY for the 6 agri-first panelContent
  // values. For a non-agri state the hook is no longer called at ALL (not
  // even with an empty, disabled-by-`enabled:false` city) — a STRONGER form
  // of the same G14 property ("no non-empty-city call outside locality"),
  // since a call that never happens can never carry a non-empty city. For an
  // agri state that isn't 'agri-group-locality' (e.g. 'agri-selected'), the
  // hook IS called (AgriJourneyPanel mounts) but still with an empty city.
  it.each(['guided-entry', 'schools-in-area'] as const)(
    'panelContent=%s: useAgriDestinations is not called at all (no non-agri mount)',
    (panelContent) => {
      mockUseAgriDestinations.mockClear();
      const area = makeArea('IN|KA|Udupi|Manipal', 'Manipal');
      renderPanel(
        <DiscoverRightPanel
          {...baseProps}
          city="udupi"
          panelContent={panelContent}
          selectedArea={panelContent === 'schools-in-area' ? area : undefined}
        />,
      );
      expect(mockUseAgriDestinations).not.toHaveBeenCalled();
    },
  );

  it("panelContent=agri-selected: useAgriDestinations IS called (AgriJourneyPanel mounts) but with an empty city (locality gate still off)", () => {
    mockUseAgriDestinations.mockClear();
    renderPanel(<DiscoverRightPanel {...baseProps} city="udupi" panelContent="agri-selected" />);
    const [cityArg] = mockUseAgriDestinations.mock.calls[0];
    expect(cityArg).toBe('');
  });
});
