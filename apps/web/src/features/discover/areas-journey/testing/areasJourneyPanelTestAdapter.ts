/**
 * Issue #2660 (Commit 0) — test adapter for `DiscoverAreasJourneyPanel`,
 * written against its then-flat, 48-prop contract (C5 replaced that contract
 * with `{view, commands}`; see `FlatAreasJourneyPanelProps` below).
 *
 * Purpose: characterization tests (and the later commits' regression specs)
 * describe what they want in terms of a small, named `ResultSourceScenario`
 * union instead of hand-assembling the panel's full prop list at every call
 * site. When C4 changes the component's own public contract, only this
 * adapter's `propsForScenario` needs to change — the scenario descriptors
 * themselves, and every test assertion built on top of them, stay put.
 *
 * This is deliberately a thin, additive mapping layer: it does not change,
 * wrap, or reinterpret any of the panel's existing behaviour. It exists
 * purely so C0-C3's tests have one seam to update instead of many.
 *
 * No existing `*TestAdapter.ts` file was found anywhere in this repository
 * (searched both this worktree's and main's `features/discover` trees,
 * including issue #2658's full C2-C6 history) to follow as a sibling
 * pattern, so this file establishes the convention rather than reusing one.
 */
import { vi } from 'vitest';
import type { DiscoverAreasJourneyPanelProps as GroupedPanelProps } from '@/features/discover/views/DiscoverAreasJourneyPanel';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { toAreaLeafScopeSource } from '@/features/discover/areas-journey/results/areaLeafResultSources';

/**
 * Issue #2660 (C5) — the panel's FORMER flat, 48-prop contract, kept ONLY as
 * a test-authoring vocabulary. The pre-existing specs describe scenarios in
 * these names; `toAreasJourneyPanelProps` maps them onto the real
 * `{view, commands}` contract (typed against it, so any drift in the real
 * contract is a compile error here), and `FlatPropsAreasJourneyPanel` renders
 * the real `DiscoverAreasJourneyPanel` with the result. The mapping mirrors the
 * production caller (`AreaFirstJourneyPanel`) and uses the SAME
 * `toAreaLeafScopeSource` adapter, so scope precedence cannot differ between
 * test and production. Production code never sees this type.
 */
export interface FlatAreasJourneyPanelProps {
  journey: UseAreasNavigationJourneyResult;
  representativeAreaNamesByNodeKey?: ReadonlyMap<string, string[]>;
  selectedNodeKey?: string | null;
  hoveredNodeKey?: string | null;
  onHoverChange?: (nodeKey: string | null) => void;
  buildNodeHref: (nodeKey: string) => string | null;
  focusedClusterMemberAreaKeys?: readonly string[] | null;
  onClusterFocusChange?: (memberAreaKeys: readonly string[] | null) => void;
  areaLeafFilters?: PropertyFilters;
  onAreaLeafFiltersChange?: (next: PropertyFilters) => void;
  mapAreaListings?: DiscoverCityListingItem[];
  mapAreaListingsLoading?: boolean;
  mapAreaListingsError?: boolean;
  mapAreaListingsAreaKey?: string | null;
  mapAreaListingsRefetch?: () => void;
  onRedrawPolygon?: () => void;
  mapAreaListingsFetching?: boolean;
  /** Issue #1793 PR-C — the map's area query is serving the PREVIOUS key's response (keepPreviousData). */
  mapAreaListingsPlaceholder?: boolean;
  /** Issue #1793 PR-C — the anon viewport query is serving the previous viewport's response. */
  isPlaceholderAnonViewport?: boolean;
  isAnonViewport?: boolean;
  anonViewportListings?: DiscoverCityListingItem[];
  anonViewportListingsLoading?: boolean;
  isAuthViewport?: boolean;
  authViewportListings?: DiscoverCityListingItem[];
  authViewportListingsLoading?: boolean;
  isPolygonScope?: boolean;
  polygonListings?: DiscoverCityListingItem[];
  polygonListingsLoading?: boolean;
  isErrorPolygonListings?: boolean;
  refetchPolygonListings?: () => void;
  onAddSchool?: () => void;
  onSelectedListingPreviewChange?: (preview: SelectedListingPreview | null) => void;
  cityLabel?: string;
  isNodeListingsActive?: boolean;
  onClearNodeListings?: () => void;
  onBrowseListings?: () => void;
  schools?: SchoolResult[];
  schoolsLoading?: boolean;
  schoolsError?: boolean;
  onSchoolsRetry?: () => void;
  schoolsFetching?: boolean;
  selectedSchool?: SchoolResult | null;
  schoolListings?: DiscoverCityListingItem[];
  schoolListingsLoading?: boolean;
  /** Issue #1793 PR-C — the school-radius card source's own settled signal + the anon page-cap flag. */
  schoolListingsSettled?: boolean;
  schoolListingsHasMore?: boolean;
  radiusKm?: number | null;
  onRadiusChange?: (radiusKm: number) => void;
  onClearSchool?: () => void;
  onSelectSchool?: (schoolId: string) => void;
  onStartOver?: () => void;
  onBackFromSchoolFlow?: () => void;
}

/** Back-compat alias: the specs' scenario helpers are written against the flat vocabulary. */
export type DiscoverAreasJourneyPanelProps = FlatAreasJourneyPanelProps;

export function toAreasJourneyPanelProps(p: FlatAreasJourneyPanelProps): GroupedPanelProps {
  return {
    view: {
      hierarchy: {
        journey: p.journey,
        isNodeListingsActive: p.isNodeListingsActive,
        selectedNodeKey: p.selectedNodeKey,
        hoveredNodeKey: p.hoveredNodeKey,
        representativeAreaNamesByNodeKey: p.representativeAreaNamesByNodeKey,
      },
      cluster: { focusedMemberAreaKeys: p.focusedClusterMemberAreaKeys },
      results: {
        filters: p.areaLeafFilters,
        source: {
          areaBase: {
            listings: p.mapAreaListings,
            areaKey: p.mapAreaListingsAreaKey ?? null,
            loading: p.mapAreaListingsLoading,
            fetching: p.mapAreaListingsFetching,
            placeholder: p.mapAreaListingsPlaceholder,
            error: p.mapAreaListingsError,
            retry: p.mapAreaListingsRefetch,
          },
          scope: toAreaLeafScopeSource({
            isAnonViewport: p.isAnonViewport,
            anonViewportListings: p.anonViewportListings,
            anonViewportListingsLoading: p.anonViewportListingsLoading,
            isAuthViewport: p.isAuthViewport,
            authViewportListings: p.authViewportListings,
            authViewportListingsLoading: p.authViewportListingsLoading,
            isPolygonScope: p.isPolygonScope,
            polygonListings: p.polygonListings,
            polygonListingsLoading: p.polygonListingsLoading,
            isErrorPolygonListings: p.isErrorPolygonListings,
            refetchPolygonListings: p.refetchPolygonListings,
            isPlaceholderAnonViewport: p.isPlaceholderAnonViewport,
          }),
        },
      },
      schools: {
        inArea: { data: p.schools, loading: p.schoolsLoading, fetching: p.schoolsFetching, error: p.schoolsError },
        selected: p.selectedSchool,
        selectedListings: {
          data: p.schoolListings,
          loading: p.schoolListingsLoading,
          settled: p.schoolListingsSettled,
          hasMore: p.schoolListingsHasMore,
        },
        radiusKm: p.radiusKm,
      },
      city: { label: p.cityLabel },
    },
    commands: {
      hierarchy: { selectNode: p.journey.selectNode, retry: p.journey.refetch, hoverNode: p.onHoverChange },
      cluster: { changeFocus: p.onClusterFocusChange },
      results: {
        changeFilters: p.onAreaLeafFiltersChange,
        reportSelectedListingPreview: p.onSelectedListingPreviewChange,
        redrawPolygon: p.onRedrawPolygon,
      },
      schools: {
        enterPicking: p.onAddSchool,
        select: p.onSelectSchool,
        clear: p.onClearSchool,
        retry: p.onSchoolsRetry,
        changeRadius: p.onRadiusChange,
        back: p.onBackFromSchoolFlow,
      },
      navigation: {
        buildNodeHref: p.buildNodeHref,
        browseListings: p.onBrowseListings,
        clearNodeListings: p.onClearNodeListings,
        startOver: p.onStartOver,
      },
    },
  };
}

export const NOOP_BUILD_HREF = () => null;

export function makeAreaLeafNode(
  overrides: Partial<NavigationNodeResponse> = {},
): NavigationNodeResponse {
  return {
    nodeKey: 'a:IN|KA|Bangalore|Manipal',
    nodeType: 'AREA',
    displayLabel: 'Manipal',
    depth: 2,
    regionKey: 'east',
    ancestry: [],
    nextLevelType: 'LISTINGS',
    children: [],
    revisionId: 1,
    bounds: {
      centreLat: 13.35,
      centreLon: 74.79,
      minLat: 13.3,
      minLon: 74.75,
      maxLat: 13.4,
      maxLon: 74.83,
    },
    descendantAreaKeys: null,
    areaKey: 'IN|KA|Bangalore|Manipal',
    ...overrides,
  };
}

export function makeJourney(
  overrides: Partial<UseAreasNavigationJourneyResult> = {},
): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node: null,
    levelKind: 'empty',
    children: [],
    // NOTE: `wasTruncated` is NOT a field on `UseAreasNavigationJourneyResult`
    // (confirmed by direct source read — the interface has no such member).
    // Two existing sibling fixtures
    // (`discoverAreasJourneyPanelAreaLeaf.test.tsx`,
    // `discoverAreasJourneyPanelFilterIdentityAndError.test.tsx`) DO include
    // it and both already fail `tsc --noEmit` with TS2353 for it — a
    // pre-existing, unrelated typecheck failure, not one this adapter
    // reproduces.
    resolutionNotice: null,
    nodeCount: null,
    schoolsNotSimulatedForRevision: false,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
    ...overrides,
  };
}

export function makeListing(overrides: Partial<DiscoverCityListingItem> = {}): DiscoverCityListingItem {
  return {
    id: 'listing-1',
    propertyType: 'apartment',
    bedrooms: 2,
    primaryImageUrl: null,
    priceBand: '₹50L - ₹75L',
    trustBadge: 'verified',
    locality: 'Manipal',
    ...overrides,
  } as DiscoverCityListingItem;
}

/**
 * The 4 result-source "origins" `AreaLeafListingsSurface` currently resolves
 * between (see `DiscoverAreasJourneyPanel.tsx` lines ~955-1079): the map's
 * already-fetched AREA_SET data, a committed anonymous VIEWPORT, a committed
 * authenticated VIEWPORT, a committed POLYGON, or this surface's own
 * `useDiscoverCityListings` fallback query. `mapAreaListingsAreaKey` is
 * fixed to the leaf's own areaKey so the "matched" identity guard always
 * passes for the `map` origin — a MISMATCHED areaKey is a distinct,
 * already-covered scenario (`discoverAreasJourneyPanelAreaLeaf.test.tsx`),
 * not one of these four.
 */
export type ResultSourceOrigin = 'map' | 'viewport-anon' | 'viewport-auth' | 'polygon' | 'own-query';

export interface ResultSourceScenario {
  origin: ResultSourceOrigin;
  listings?: DiscoverCityListingItem[];
  loading?: boolean;
  fetching?: boolean;
  error?: boolean;
  areaKey?: string;
}

/**
 * Maps a `ResultSourceScenario` onto the panel's CURRENT flat props. This is
 * the one function later commits' contract changes need to update — every
 * test built on `propsForScenario` keeps working unchanged.
 */
export function propsForScenario(
  scenario: ResultSourceScenario,
  extra: Partial<DiscoverAreasJourneyPanelProps> = {},
): Partial<DiscoverAreasJourneyPanelProps> {
  const areaKey = scenario.areaKey ?? 'IN|KA|Bangalore|Manipal';
  const listings = scenario.listings ?? [];
  const loading = scenario.loading ?? false;
  const fetching = scenario.fetching ?? false;
  const error = scenario.error ?? false;

  switch (scenario.origin) {
    case 'map':
      return {
        mapAreaListings: listings,
        mapAreaListingsAreaKey: areaKey,
        mapAreaListingsLoading: loading,
        mapAreaListingsFetching: fetching,
        mapAreaListingsError: error,
        mapAreaListingsRefetch: vi.fn(),
        ...extra,
      };
    case 'viewport-anon':
      return {
        isAnonViewport: true,
        anonViewportListings: listings,
        anonViewportListingsLoading: loading,
        ...extra,
      };
    case 'viewport-auth':
      return {
        isAuthViewport: true,
        authViewportListings: listings,
        authViewportListingsLoading: loading,
        ...extra,
      };
    case 'polygon':
      return {
        isPolygonScope: true,
        polygonListings: listings,
        polygonListingsLoading: loading,
        isErrorPolygonListings: error,
        refetchPolygonListings: vi.fn(),
        ...extra,
      };
    case 'own-query':
      // No map/viewport/polygon props supplied — the surface falls back to
      // its own `useDiscoverCityListings` call, which the caller must mock
      // separately (see `mockUseDiscoverCityListings` in the sibling specs).
      return { ...extra };
    default: {
      const _exhaustive: never = scenario.origin;
      return _exhaustive;
    }
  }
}
