/**
 * Issue #2553 — the commit-boundary allowlists discard `commercialSubtypes`.
 *
 * RED BY DESIGN at 432679b7. Each `onFiltersChange` handler below rebuilds the
 * committed-filter object from an explicit key allowlist rather than forwarding
 * what the panel emitted, so an axis the panel CAN emit but the allowlist does
 * not name is dropped at the commit boundary — it never reaches URL state, the
 * map query, or the card list. The loss is silent at the point it happens and
 * only surfaces as "this filter does nothing".
 *
 * WHY A HANDLER-LEVEL TEST AND NOT A UI-DRIVEN ONE. `AreaSelectedPanel`'s
 * subtype row is gated behind `isCommercialSubtypeSupported`, which defaults
 * false and has ZERO production call sites passing true (see that prop's own
 * doc: "Nothing here is buyer-reachable today"). A test that drove the real
 * chip would therefore assert against a control that never renders in
 * production, and would pass for the wrong reason. These tests instead pin the
 * seam that is actually defective — what the view does with what a panel hands
 * it — by invoking the real `onFiltersChange` the view passes down. That seam
 * is live today and is what every future axis will travel through.
 *
 * SITE COUNT. Issue #2553 cites four sites. There are SIX: both files carry an
 * `onCommittedFiltersChange` branch and an `actions.setFiltersCommitted`
 * fallback, and `DiscoverAreasJourneyPanel` has TWO such pairs — the AREA-leaf
 * surface the issue found, plus the school-combined branch above it, which the
 * issue does not mention. That second pair is worse: it never received the
 * Issue #2023 `readyToMove` fix either, so it drops two axes, not one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { FlatPropsAreasJourneyPanel } from '@/features/discover/areas-journey/testing/FlatPropsAreasJourneyPanel';
import { NodeListingsSurface } from '../NodeListingsSurface';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const NOOP_BUILD_HREF = () => null;

// Prevent "supabaseUrl is required" crash from transitive usePropertyListings import.
// Without this the whole FILE fails to collect and contributes zero tests — a
// collection error here is silent and total, and reads identically to a pass.
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

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isLoading: false }),
}));

// Mutable so a single mock module can serve both the plain AREA-leaf branch
// (schoolId null) and the school-combined branch (schoolId set).
let mockSchoolId: string | null = null;
const mockSetFiltersCommitted = vi.fn();

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'bangalore',
    q: '',
    intent: 'sale' as const,
    selectedListing: null,
    get schoolId() {
      return mockSchoolId;
    },
    // The fallback branch spreads THIS object as its base, so it carries a key
    // outside the allowlist to prove the base survives the fix.
    filters: {
      propertyTypes: [],
      bedrooms: [],
      priceMin: undefined,
      priceMax: undefined,
      sellerTypes: ['owner'],
    },
  }),
  useDiscoverActions: () => ({
    setSelectedListing: vi.fn(),
    setFiltersCommitted: mockSetFiltersCommitted,
    setSearchQuery: vi.fn(),
    enterSchoolPicking: vi.fn(),
    commitResultScope: vi.fn(),
  }),
  useDiscoverShell: () => ({
    mobileView: 'LIST',
    setMobileView: vi.fn(),
    isMobileShell: false,
    isAreaSetDraftOpen: false,
    openAreaSetDraft: vi.fn(),
    closeAreaSetDraft: vi.fn(),
    fitAreaSet: vi.fn(),
    focusAreaSetMember: vi.fn(),
    startDrawSearchArea: vi.fn(),
    registerAreaSetCameraActions: vi.fn(),
    getAreaSetCameraRestoreRequest: vi.fn(() => null),
    setAreaSetCameraRestoreRequest: vi.fn(),
    // Issue #2729 (R1 fix) — new required shell member (see context/types.ts).
    canonicalScopeLabel: null,
    setCanonicalScopeLabel: vi.fn(),
  }),
}));

vi.mock('@/features/discover/state/useDiscoverSearchState', () => ({
  useDiscoverSearchState: () => ({
    searchQuery: '',
    debouncedSearch: '',
    handleSearchChange: vi.fn(),
  }),
}));

const mockUseDiscoverCityListings = vi.fn(() => ({
  data: { areas: [] },
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));
vi.mock('@/hooks/useDiscoverCityListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDiscoverCityListings')>();
  return {
    ...actual,
    useDiscoverCityListings: (...args: unknown[]) => mockUseDiscoverCityListings(...(args as [])),
  };
});

vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: () => ({
    isLoading: false,
    isError: false,
    data: { content: [], totalPages: 1, totalElements: 0, number: 0, size: 20 },
    refetch: vi.fn(),
  }),
}));

/**
 * Both panel stubs emit EXACTLY what the real `AreaSelectedPanel` emits from
 * `handleToggleSubtype` — `{ ...filters, commercialSubtypes: [...] }` — so the
 * `next` object reaching the handler under test has the real production shape
 * rather than an invented one. They also echo the `filters` prop they were
 * given, which pins the READ projection (see the effectiveFilters tests).
 *
 * Issue #2658 (C5) — the real component now takes {view, commands}, not flat
 * `filters`/`onFiltersChange` props; the stub reads/writes the same nested
 * paths (`view.filters.filters`, `commands.filters.change`) the real
 * component destructures, so it still exercises exactly the seam this file
 * is about — what the caller does with what the panel hands it.
 */
function makePanelStub(testid: string) {
  return function PanelStub({
    view,
    commands,
  }: {
    view?: { filters?: { filters?: PropertyFilters } };
    commands?: { filters?: { change?: (next: PropertyFilters) => void } };
  }) {
    const filters = view?.filters?.filters;
    const onFiltersChange = commands?.filters?.change;
    return (
      <div data-testid={testid}>
        <pre data-testid={`${testid}-filters`}>{JSON.stringify(filters ?? {})}</pre>
        <button
          data-testid={`${testid}-toggle-subtype`}
          onClick={() => onFiltersChange?.({ ...(filters ?? {}), commercialSubtypes: ['SHOP'] })}
        >
          toggle subtype
        </button>
        <button
          data-testid={`${testid}-toggle-ready`}
          onClick={() => onFiltersChange?.({ ...(filters ?? {}), readyToMove: true })}
        >
          toggle ready
        </button>
        {/*
          Emits EXACTLY what AreaSelectedPanel's `handleClearPropertyFilters`
          emits — every cleared axis present with an explicit `undefined`,
          including five that sit OUTSIDE this surface's projection. Under the
          old allowlist those five were never read off `next`, so the base
          object's values survived and "Clear" did not clear them.
        */}
        <button
          data-testid={`${testid}-clear-filters`}
          onClick={() =>
            onFiltersChange?.({
              ...(filters ?? {}),
              propertyTypes: undefined,
              commercialSubtypes: undefined,
              bedrooms: undefined,
              priceMin: undefined,
              priceMax: undefined,
              localities: undefined,
              sellerTypes: undefined,
              backOnMarket: undefined,
              newToMarket: undefined,
              reraRegistered: undefined,
              readyToMove: undefined,
            })
          }
        >
          clear filters
        </button>
      </div>
    );
  };
}

/**
 * Issue #2661 commit 5 — `AreaSchoolCombinedPanel`'s public props narrowed to
 * `{view, commands}`. This stub reads `view.propertyFilters.value` and calls
 * `commands.propertyFilters.replace(next)` instead of flat `filters`/
 * `onFiltersChange`, mirroring the real panel's new contract exactly — the
 * call site under test (`DiscoverAreasJourneyPanel`'s school-combined branch)
 * constructs that same `view`/`commands` shape, so this mock must match it or
 * every button here silently no-ops (see the mutation-check note below).
 */
function makeViewCommandsPanelStub(testid: string) {
  return function ViewCommandsPanelStub({
    view,
    commands,
  }: {
    view?: { propertyFilters?: { value?: PropertyFilters } };
    commands?: { propertyFilters?: { replace?: (next: PropertyFilters) => void } };
  }) {
    const filters = view?.propertyFilters?.value;
    const onFiltersChange = commands?.propertyFilters?.replace;
    return (
      <div data-testid={testid}>
        <pre data-testid={`${testid}-filters`}>{JSON.stringify(filters ?? {})}</pre>
        <button
          data-testid={`${testid}-toggle-subtype`}
          onClick={() => onFiltersChange?.({ ...(filters ?? {}), commercialSubtypes: ['SHOP'] })}
        >
          toggle subtype
        </button>
        <button
          data-testid={`${testid}-toggle-ready`}
          onClick={() => onFiltersChange?.({ ...(filters ?? {}), readyToMove: true })}
        >
          toggle ready
        </button>
        <button
          data-testid={`${testid}-clear-filters`}
          onClick={() =>
            onFiltersChange?.({
              ...(filters ?? {}),
              propertyTypes: undefined,
              commercialSubtypes: undefined,
              bedrooms: undefined,
              priceMin: undefined,
              priceMax: undefined,
              localities: undefined,
              sellerTypes: undefined,
              backOnMarket: undefined,
              newToMarket: undefined,
              reraRegistered: undefined,
              readyToMove: undefined,
            })
          }
        >
          clear filters
        </button>
      </div>
    );
  };
}

vi.mock('@/components/discover/panels/AreaSelectedPanel', () => ({
  AreaSelectedPanel: makePanelStub('area-selected-panel'),
}));

vi.mock('@/components/discover/panels/SchoolJourneyPanels', () => ({
  AreaSchoolCombinedPanel: makeViewCommandsPanelStub('area-school-combined-panel'),
  SchoolsInAreaPanel: () => <div data-testid="schools-in-area-panel" />,
}));

function makeAreaLeafNode(): NavigationNodeResponse {
  return {
    nodeKey: 'a:rr-nagar',
    nodeType: 'AREA',
    displayLabel: 'RR Nagar',
    depth: 2,
    regionKey: 'west',
    ancestry: [
      { nodeKey: 'd:w', nodeType: 'DIRECTION', displayLabel: 'West Bangalore', displayOrder: 0 },
      { nodeKey: 'c:w:rr-belt', nodeType: 'CLUSTER', displayLabel: 'RR Belt', displayOrder: 0 },
    ],
    nextLevelType: 'LISTINGS',
    children: [],
    revisionId: 1,
    bounds: { centreLat: 12.92, centreLon: 77.52, minLat: 12.9, minLon: 77.5, maxLat: 12.95, maxLon: 77.55 },
    descendantAreaKeys: null,
    areaKey: 'IN|KA|Bengaluru|RR Nagar',
  };
}

function makeBrowseNode(): NavigationNodeResponse {
  return {
    ...makeAreaLeafNode(),
    nodeKey: 'c:rr-belt',
    nodeType: 'CLUSTER' as NavigationNodeResponse['nodeType'],
    nextLevelType: 'AREA' as NavigationNodeResponse['nextLevelType'],
    descendantAreaKeys: ['IN|KA|Bengaluru|RR Nagar'],
    areaKey: null,
  };
}

function makeJourney(overrides: Partial<UseAreasNavigationJourneyResult> = {}): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node: null,
    levelKind: 'empty',
    children: [],
    wasTruncated: false,
    resolutionNotice: null,
    nodeCount: null,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
    ...overrides,
  } as UseAreasNavigationJourneyResult;
}

/** The committed-filter object a buyer already has when they reach for a subtype. */
const COMMITTED: PropertyFilters = {
  propertyTypes: ['commercial'],
  bedrooms: undefined,
  priceMin: 1_000_000,
  priceMax: 9_000_000,
  readyToMove: true,
  // Outside every allowlist — proves the spread base is preserved, so the fix
  // is "carry more", not "replace the object".
  sellerTypes: ['broker'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSchoolId = null;
});

describe('#2553 — NodeListingsSurface commit boundary', () => {
  function renderSurface(props: Partial<React.ComponentProps<typeof NodeListingsSurface>> = {}) {
    return renderWithProviders(
      <NodeListingsSurface
        node={makeBrowseNode()}
        buildNodeHref={NOOP_BUILD_HREF}
        historyAdjacencyLog={[] as UseAreasNavigationJourneyResult['historyAdjacencyLog']}
        selectNode={vi.fn()}
        {...props}
      />,
    );
  }

  it('forwards commercialSubtypes through the onCommittedFiltersChange branch', () => {
    const onCommittedFiltersChange = vi.fn();
    renderSurface({ committedFilters: COMMITTED, onCommittedFiltersChange });

    fireEvent.click(screen.getByTestId('area-selected-panel-toggle-subtype'));

    expect(onCommittedFiltersChange).toHaveBeenCalledTimes(1);
    expect(onCommittedFiltersChange.mock.calls[0][0]).toMatchObject({
      commercialSubtypes: ['SHOP'],
      // The pre-existing allowlist keys must still arrive.
      propertyTypes: ['commercial'],
      priceMin: 1_000_000,
      readyToMove: true,
      // The base object's out-of-allowlist key must survive.
      sellerTypes: ['broker'],
    });
  });

  it('forwards commercialSubtypes through the setFiltersCommitted fallback', () => {
    renderSurface({ committedFilters: undefined, onCommittedFiltersChange: undefined });

    fireEvent.click(screen.getByTestId('area-selected-panel-toggle-subtype'));

    expect(mockSetFiltersCommitted).toHaveBeenCalledTimes(1);
    expect(mockSetFiltersCommitted.mock.calls[0][0]).toMatchObject({
      commercialSubtypes: ['SHOP'],
      sellerTypes: ['owner'],
    });
  });

  it('projects commercialSubtypes into the panel filters prop (read path)', () => {
    renderSurface({
      committedFilters: { ...COMMITTED, commercialSubtypes: ['WAREHOUSE'] },
      onCommittedFiltersChange: vi.fn(),
    });

    const projected = JSON.parse(screen.getByTestId('area-selected-panel-filters').textContent ?? '{}');
    // A committed subtype must reach the panel, or the chip can never render as
    // selected and the round-trip stays broken even once the write path is fixed.
    expect(projected).toMatchObject({
      propertyTypes: ['commercial'],
      commercialSubtypes: ['WAREHOUSE'],
    });
  });

  /**
   * Issue #2555 — THE AREA (SQ FT) AXIS on the read path, entered through the SURFACE.
   *
   * DELIBERATELY NOT WRITTEN by handing `AreaSelectedPanel` a filters object directly. #2583
   * established that a spec shaped that way is structurally BLIND to this defect class: the panel
   * would hold the area keys because the test put them there, and the projection that never builds
   * the axis would simply never be consulted. The bug lives in the projection, so the test must
   * enter through the projection.
   *
   * RED before `65b5dc7c`, where `effectiveFilters` projected exactly propertyTypes /
   * commercialSubtypes / bedrooms / priceMin / priceMax / readyToMove. `areaMinSqft` was dropped
   * before reaching the panel, so the AREA chip read "Any size" while the map — which forwards
   * `filters` wholesale to `buildDiscoverSearchParams` — was already narrowed to the chosen size.
   */
  it('projects the AREA bounds into the panel filters prop (read path)', () => {
    renderSurface({
      committedFilters: { ...COMMITTED, areaMinSqft: 1200, areaMaxSqft: 4800 },
      onCommittedFiltersChange: vi.fn(),
    });

    const projected = JSON.parse(screen.getByTestId('area-selected-panel-filters').textContent ?? '{}');
    expect(projected).toMatchObject({ areaMinSqft: 1200, areaMaxSqft: 4800 });
    // Positive control on a pre-existing key: a projection returning `{}`, or a panel that failed
    // to render at all, must not be able to satisfy the assertion above by accident.
    expect(projected).toMatchObject({ propertyTypes: ['commercial'] });
  });
});

/**
 * DELIBERATE BEHAVIOUR CHANGE, beyond the defect #2553 reports. It gets its own
 * named arm because it is user-visible and a reviewer must not meet it by accident.
 *
 * `AreaSelectedPanel`'s "Clear property filters" explicitly emits `localities`,
 * `sellerTypes`, `backOnMarket`, `newToMarket` and `reraRegistered` as `undefined`.
 * None of those five were named by the commit allowlist, so the clears were
 * swallowed at the boundary and the committed object kept its old values — a clear
 * affordance that did not clear. Forwarding what the panel emitted makes the
 * control do what its name, and its own handler, already say it does.
 *
 * This arm FAILS on the pre-fix code (the base object's `sellerTypes: ['broker']`
 * survived the clear), so it is a real guard, not a restatement of behaviour that
 * already held.
 */
describe('#2553 — "Clear property filters" now genuinely clears out-of-projection axes', () => {
  it('forwards the cleared out-of-projection axes instead of preserving stale base values', () => {
    const onCommittedFiltersChange = vi.fn();
    renderWithProviders(
      <NodeListingsSurface
        node={makeBrowseNode()}
        buildNodeHref={NOOP_BUILD_HREF}
        historyAdjacencyLog={[] as UseAreasNavigationJourneyResult['historyAdjacencyLog']}
        selectNode={vi.fn()}
        committedFilters={COMMITTED}
        onCommittedFiltersChange={onCommittedFiltersChange}
      />,
    );

    fireEvent.click(screen.getByTestId('area-selected-panel-clear-filters'));

    expect(onCommittedFiltersChange).toHaveBeenCalledTimes(1);
    const committed = onCommittedFiltersChange.mock.calls[0][0];
    // THE behaviour change: COMMITTED carries sellerTypes: ['broker'], and a
    // "Clear" that leaves it set is precisely the defect being removed.
    expect(committed.sellerTypes).toBeUndefined();
    // The axes inside the projection keep clearing as they always did.
    expect(committed.propertyTypes).toBeUndefined();
    expect(committed.priceMin).toBeUndefined();
    expect(committed.readyToMove).toBeUndefined();
    expect(committed.commercialSubtypes).toBeUndefined();
  });
});

describe('#2553 — DiscoverAreasJourneyPanel AREA-leaf commit boundary', () => {
  function renderPanel(props: Record<string, unknown> = {}) {
    return renderWithProviders(
      <FlatPropsAreasJourneyPanel
        journey={makeJourney({ node: makeAreaLeafNode() })}
        buildNodeHref={NOOP_BUILD_HREF}
        {...props}
      />,
    );
  }

  it('forwards commercialSubtypes through the onCommittedFiltersChange branch', () => {
    const onAreaLeafFiltersChange = vi.fn();
    renderPanel({ areaLeafFilters: COMMITTED, onAreaLeafFiltersChange });

    fireEvent.click(screen.getByTestId('area-selected-panel-toggle-subtype'));

    expect(onAreaLeafFiltersChange).toHaveBeenCalledTimes(1);
    expect(onAreaLeafFiltersChange.mock.calls[0][0]).toMatchObject({
      commercialSubtypes: ['SHOP'],
      propertyTypes: ['commercial'],
      readyToMove: true,
      sellerTypes: ['broker'],
    });
  });

  it('forwards commercialSubtypes through the setFiltersCommitted fallback', () => {
    renderPanel({ areaLeafFilters: undefined, onAreaLeafFiltersChange: undefined });

    fireEvent.click(screen.getByTestId('area-selected-panel-toggle-subtype'));

    expect(mockSetFiltersCommitted).toHaveBeenCalledTimes(1);
    expect(mockSetFiltersCommitted.mock.calls[0][0]).toMatchObject({
      commercialSubtypes: ['SHOP'],
      sellerTypes: ['owner'],
    });
  });

  /**
   * Issue #2555 — the same axis through `resolveEffectiveAreaLeafFilters`, the OTHER projection.
   *
   * BOTH had to be fixed and both are pinned here. Repairing only the `NodeListingsSurface` twin
   * would leave the divergence standing on the AREA-leaf surface — which is precisely where the
   * buyer-facing AREA (SQ FT) row renders, so the one surface the row actually appears on would
   * have kept ignoring it.
   */
  it('projects the AREA bounds into the panel filters prop on the AREA-leaf surface', () => {
    renderPanel({
      areaLeafFilters: { ...COMMITTED, areaMinSqft: 1200, areaMaxSqft: 4800 },
      onAreaLeafFiltersChange: vi.fn(),
    });

    const projected = JSON.parse(screen.getByTestId('area-selected-panel-filters').textContent ?? '{}');
    expect(projected).toMatchObject({ areaMinSqft: 1200, areaMaxSqft: 4800 });
    expect(projected).toMatchObject({ propertyTypes: ['commercial'] });
  });
});

/**
 * The pair Issue #2553 does not mention. This branch never received the Issue
 * #2023 `readyToMove` fix either, so it drops TWO axes — which is the clearest
 * available evidence that enumerating keys at a commit boundary does not hold
 * up over time.
 */
describe('#2553 — DiscoverAreasJourneyPanel school-combined commit boundary', () => {
  function renderPanel(props: Record<string, unknown> = {}) {
    mockSchoolId = 'school-1';
    return renderWithProviders(
      <FlatPropsAreasJourneyPanel
        journey={makeJourney({ node: makeAreaLeafNode() })}
        buildNodeHref={NOOP_BUILD_HREF}
        {...props}
      />,
    );
  }

  it('forwards commercialSubtypes through the onCommittedFiltersChange branch', () => {
    const onAreaLeafFiltersChange = vi.fn();
    renderPanel({ areaLeafFilters: COMMITTED, onAreaLeafFiltersChange });

    fireEvent.click(screen.getByTestId('area-school-combined-panel-toggle-subtype'));

    expect(onAreaLeafFiltersChange).toHaveBeenCalledTimes(1);
    expect(onAreaLeafFiltersChange.mock.calls[0][0]).toMatchObject({
      commercialSubtypes: ['SHOP'],
      sellerTypes: ['broker'],
    });
  });

  it('forwards readyToMove through this branch too (the #2023 fix never reached it)', () => {
    const onAreaLeafFiltersChange = vi.fn();
    renderPanel({ areaLeafFilters: { ...COMMITTED, readyToMove: undefined }, onAreaLeafFiltersChange });

    fireEvent.click(screen.getByTestId('area-school-combined-panel-toggle-ready'));

    expect(onAreaLeafFiltersChange).toHaveBeenCalledTimes(1);
    expect(onAreaLeafFiltersChange.mock.calls[0][0]).toMatchObject({ readyToMove: true });
  });

  it('forwards commercialSubtypes through the setFiltersCommitted fallback', () => {
    renderPanel({ areaLeafFilters: undefined, onAreaLeafFiltersChange: undefined });

    fireEvent.click(screen.getByTestId('area-school-combined-panel-toggle-subtype'));

    expect(mockSetFiltersCommitted).toHaveBeenCalledTimes(1);
    expect(mockSetFiltersCommitted.mock.calls[0][0]).toMatchObject({
      commercialSubtypes: ['SHOP'],
      sellerTypes: ['owner'],
    });
  });
});
