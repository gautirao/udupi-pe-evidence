import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

const mockUseAreasNavigationJourney = vi.hoisted(() => vi.fn());
const mockUseClusterFocusUrlParam = vi.hoisted(() => vi.fn());

vi.mock('@/features/discover/navigation/useAreasNavigationJourney', () => ({
  useAreasNavigationJourney: mockUseAreasNavigationJourney,
}));
vi.mock('@/features/discover/state/url/clusterFocus', () => ({
  useClusterFocusUrlParam: mockUseClusterFocusUrlParam,
}));

import { useDiscoverNavigationController } from './useDiscoverNavigationController';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';

function makeNav(overrides: Partial<DiscoverNavContextValue> = {}): DiscoverNavContextValue {
  return {
    city: 'udupi',
    journey: null,
    areaKey: null,
    schoolId: null,
    groupId: null,
    scope: null,
    radiusKm: null,
    selectedLocality: null,
    filters: {},
    rawNodeParam: null,
    intent: null,
    ...overrides,
  } as DiscoverNavContextValue;
}

const NODE_JOURNEY_RESULT = { node: null, children: [], isLoading: false, error: null, selectNode: vi.fn() };
const CLUSTER_FOCUS_RESULT = { clusterFocus: null, setClusterFocus: vi.fn() };

describe('useDiscoverNavigationController (#2142 Commit 3 — moved verbatim from MapDiscovery.tsx, composition test)', () => {
  beforeEach(() => {
    mockUseAreasNavigationJourney.mockReset();
    mockUseClusterFocusUrlParam.mockReset();
    mockUseAreasNavigationJourney.mockReturnValue(NODE_JOURNEY_RESULT);
    mockUseClusterFocusUrlParam.mockReturnValue(CLUSTER_FOCUS_RESULT);
  });

  it('showAreasNavigationJourney is true for journey=area-first', () => {
    const { result } = renderHook(() =>
      useDiscoverNavigationController({
        nav: makeNav({ journey: 'area-first' }),
        goToNode: vi.fn(),
        intentListingPurpose: 'sale',
      }),
    );
    expect(result.current.showAreasNavigationJourney).toBe(true);
  });

  it('showAreasNavigationJourney is true for the school-first NODE level (no areaKey, no schoolId)', () => {
    const { result } = renderHook(() =>
      useDiscoverNavigationController({
        nav: makeNav({ journey: 'school-first', areaKey: null, schoolId: null }),
        goToNode: vi.fn(),
        intentListingPurpose: 'sale',
      }),
    );
    expect(result.current.showAreasNavigationJourney).toBe(true);
  });

  it('showAreasNavigationJourney is false for school-first once an areaKey is resolved', () => {
    const { result } = renderHook(() =>
      useDiscoverNavigationController({
        nav: makeNav({ journey: 'school-first', areaKey: 'IN|KA|Udupi|Manipal' }),
        goToNode: vi.fn(),
        intentListingPurpose: 'sale',
      }),
    );
    expect(result.current.showAreasNavigationJourney).toBe(false);
  });

  it('showAreasNavigationJourney is false for any other journey', () => {
    const { result } = renderHook(() =>
      useDiscoverNavigationController({
        nav: makeNav({ journey: null }),
        goToNode: vi.fn(),
        intentListingPurpose: 'sale',
      }),
    );
    expect(result.current.showAreasNavigationJourney).toBe(false);
  });

  // Issue #2203 follow-up — symmetric agri-first counterpart to the
  // school-first NODE-level cases above. Agri-first's geography-dependent
  // leaf is `selectedLocality`, not `areaKey`/`schoolId`.
  it('showAreasNavigationJourney is true for the agri-first NODE level (no selectedLocality)', () => {
    const { result } = renderHook(() =>
      useDiscoverNavigationController({
        nav: makeNav({ journey: 'agri-first', selectedLocality: null }),
        goToNode: vi.fn(),
        intentListingPurpose: 'sale',
      }),
    );
    expect(result.current.showAreasNavigationJourney).toBe(true);
  });

  it('showAreasNavigationJourney is false for agri-first once a selectedLocality is resolved', () => {
    const { result } = renderHook(() =>
      useDiscoverNavigationController({
        nav: makeNav({ journey: 'agri-first', selectedLocality: 'Manipal' }),
        goToNode: vi.fn(),
        intentListingPurpose: 'sale',
      }),
    );
    expect(result.current.showAreasNavigationJourney).toBe(false);
  });

  it('passes city with DEFAULT_CITY fallback, requestedNodeKey, onSelectNode, and enabled=showAreasNavigationJourney to useAreasNavigationJourney', () => {
    const goToNode = vi.fn();
    renderHook(() =>
      useDiscoverNavigationController({
        nav: makeNav({ journey: 'area-first', city: '', rawNodeParam: 'n:abc' }),
        goToNode,
        intentListingPurpose: 'rent',
      }),
    );
    expect(mockUseAreasNavigationJourney).toHaveBeenCalledWith(
      expect.objectContaining({
        city: 'bangalore', // DEFAULT_CITY fallback when nav.city is ''
        requestedNodeKey: 'n:abc',
        onSelectNode: goToNode,
        enabled: true,
        filters: expect.objectContaining({ purpose: 'rent' }),
      }),
    );
  });

  it('threads nav.filters through the navigationCountsFilters adapter (issue #2083 RC_C)', () => {
    renderHook(() =>
      useDiscoverNavigationController({
        nav: makeNav({ journey: 'area-first', filters: { propertyTypes: ['house'], bedrooms: [3] } }),
        goToNode: vi.fn(),
        intentListingPurpose: 'sale',
      }),
    );
    expect(mockUseAreasNavigationJourney).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ propertyTypes: ['house'], bedrooms: [3], purpose: 'sale' }),
      }),
    );
  });

  // Issue #2203 follow-up — proves `nodeAreaPoint` actually populates once
  // an AREA leaf resolves, for BOTH school-first and agri-first, via the
  // real `deriveAreaPointFromNode` bridge (not mocked) fed by the mocked
  // `useAreasNavigationJourney.node`. `isNodeAreaLeafActive` must stay false
  // for both — it is hardcoded to `journey === 'area-first'` only (owner
  // ruling on #2203) and must NOT widen.
  const RESOLVED_AREA_NODE = {
    nodeKey: 'a:IN|KA|Udupi|Manipal',
    nodeType: 'AREA' as const,
    areaKey: 'IN|KA|Udupi|Manipal',
    displayLabel: 'Manipal',
    bounds: {
      centreLat: 13.35,
      centreLon: 74.79,
      minLat: 13.3,
      minLon: 74.75,
      maxLat: 13.4,
      maxLon: 74.83,
    },
  };

  it('nodeAreaPoint populates for the school-first NODE level once the node resolves to an AREA leaf, but isNodeAreaLeafActive stays false', () => {
    mockUseAreasNavigationJourney.mockReturnValue({ ...NODE_JOURNEY_RESULT, node: RESOLVED_AREA_NODE });
    const { result } = renderHook(() =>
      useDiscoverNavigationController({
        nav: makeNav({ journey: 'school-first', areaKey: null, schoolId: null }),
        goToNode: vi.fn(),
        intentListingPurpose: 'sale',
      }),
    );
    expect(result.current.nodeAreaPoint).toEqual(
      expect.objectContaining({ areaKey: 'IN|KA|Udupi|Manipal', geo_center_lat: 13.35, geo_center_lon: 74.79 }),
    );
    expect(result.current.isNodeAreaLeafActive).toBe(false);
  });

  it('nodeAreaPoint populates for the agri-first NODE level once the node resolves to an AREA leaf, but isNodeAreaLeafActive stays false', () => {
    mockUseAreasNavigationJourney.mockReturnValue({ ...NODE_JOURNEY_RESULT, node: RESOLVED_AREA_NODE });
    const { result } = renderHook(() =>
      useDiscoverNavigationController({
        nav: makeNav({ journey: 'agri-first', selectedLocality: null }),
        goToNode: vi.fn(),
        intentListingPurpose: 'sale',
      }),
    );
    expect(result.current.nodeAreaPoint).toEqual(
      expect.objectContaining({ areaKey: 'IN|KA|Udupi|Manipal', geo_center_lat: 13.35, geo_center_lon: 74.79 }),
    );
    expect(result.current.isNodeAreaLeafActive).toBe(false);
  });

  it('nodeAreaPoint stays null for agri-first once selectedLocality is resolved (legacy leaf interlock, mirrors school-first)', () => {
    mockUseAreasNavigationJourney.mockReturnValue({ ...NODE_JOURNEY_RESULT, node: RESOLVED_AREA_NODE });
    const { result } = renderHook(() =>
      useDiscoverNavigationController({
        nav: makeNav({ journey: 'agri-first', selectedLocality: 'Manipal' }),
        goToNode: vi.fn(),
        intentListingPurpose: 'sale',
      }),
    );
    expect(result.current.nodeAreaPoint).toBeNull();
  });

  it('returns areasNavigationJourney, hoveredNavigationNodeKey/setter, and focusedClusterMemberAreaKeys/setter', () => {
    const { result } = renderHook(() =>
      useDiscoverNavigationController({
        nav: makeNav({ journey: 'area-first' }),
        goToNode: vi.fn(),
        intentListingPurpose: 'sale',
      }),
    );
    expect(result.current.areasNavigationJourney).toBe(NODE_JOURNEY_RESULT);
    expect(result.current.hoveredNavigationNodeKey).toBeNull();
    expect(typeof result.current.setHoveredNavigationNodeKey).toBe('function');
    expect(result.current.focusedClusterMemberAreaKeys).toBeNull();
    expect(result.current.setFocusedClusterMemberAreaKeys).toBe(CLUSTER_FOCUS_RESULT.setClusterFocus);
  });

  // Static guard (code-reviewer flag on the Commit 1-3 gate): the params
  // interface only ever accepts `goToNode` (a single narrow callback), never
  // the full `DiscoverUrlActions` bundle from useDiscoverActions(). This is
  // currently true only by construction (TypeScript structure) — nothing
  // stopped a future edit from silently widening it to `actions:
  // DiscoverUrlActions` "for convenience". Source-regex guard so that
  // widening fails a test, not just a manual read.
  it('static guard: params never expose the full DiscoverUrlActions bundle, only goToNode', () => {
    const source = fs.readFileSync(path.resolve(__dirname, './useDiscoverNavigationController.ts'), 'utf-8');
    expect(source).not.toMatch(/DiscoverUrlActions/);
    expect(source).not.toMatch(/\bactions\s*:/);
    expect(source).toMatch(/goToNode:\s*\(nodeKey:\s*string\)\s*=>\s*void/);
  });
});
