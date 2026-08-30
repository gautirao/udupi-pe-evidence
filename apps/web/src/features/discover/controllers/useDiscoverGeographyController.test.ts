import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockUseDiscoverRegionSummary = vi.hoisted(() => vi.fn());
const mockUseRegionScopedAreaGroups = vi.hoisted(() => vi.fn());
const mockUseDiscoverAreas = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useDiscoverRegionSummary', () => ({ useDiscoverRegionSummary: mockUseDiscoverRegionSummary }));
vi.mock('@/hooks/useRegionScopedAreaGroups', () => ({ useRegionScopedAreaGroups: mockUseRegionScopedAreaGroups }));
vi.mock('@/hooks/useDiscoverAreas', () => ({ useDiscoverAreas: mockUseDiscoverAreas }));

import { useDiscoverGeographyController } from './useDiscoverGeographyController';
import type { useAreaGroups } from '@/hooks/useAreaGroups';

const REGION_SUMMARY_RESULT = {
  data: { regions: [{ key: 'north', label: 'North', listingCount: 42 }] },
};
const REGION_SCOPED_RESULT = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
const AREAS_RESULT = { data: { areas: [{ areaKey: 'IN|KA|Udupi|Manipal', name: 'Manipal' }] } };

const AREA_GROUPS: ReturnType<typeof useAreaGroups>['data'] = {
  groups: [
    { id: 'kr-puram-belt', name: 'K R Puram Belt', subtitle: null, region_label: null, school_count: 0, area_keys: [] },
  ],
};

describe('useDiscoverGeographyController (#2142 Commit 3 — moved verbatim from MapDiscovery.tsx, composition test)', () => {
  beforeEach(() => {
    mockUseDiscoverRegionSummary.mockReset().mockReturnValue(REGION_SUMMARY_RESULT);
    mockUseRegionScopedAreaGroups.mockReset().mockReturnValue(REGION_SCOPED_RESULT);
    mockUseDiscoverAreas.mockReset().mockReturnValue(AREAS_RESULT);
  });

  it('derives summaryRegions from useDiscoverRegionSummary as a 1:1 map (no client-side aggregation)', () => {
    const { result } = renderHook(() =>
      useDiscoverGeographyController({
        city: 'udupi',
        isCityValid: true,
        navCity: 'udupi',
        scope: null,
        intentListingPurpose: 'sale',
        areaGroupsData: AREA_GROUPS,
      }),
    );
    expect(result.current.summaryRegions).toEqual([{ regionKey: 'north', regionLabel: 'North', listingCount: 42 }]);
  });

  it('scopeNamespaces includes both labelToSlug AND lowercased-name fallbacks for each group (issue #1910 PR2 fix-up)', () => {
    const { result } = renderHook(() =>
      useDiscoverGeographyController({
        city: 'udupi',
        isCityValid: true,
        navCity: 'udupi',
        scope: null,
        intentListingPurpose: 'sale',
        areaGroupsData: AREA_GROUPS,
      }),
    );
    // labelToSlug('K R Puram Belt') !== 'kr-puram-belt' (the DB slug) — both the
    // slug-derived AND lowercased-literal fallback must map to the real group id.
    expect(result.current.scopeNamespaces.groupSlugs.has('kr-puram-belt')).toBe(true);
    expect(result.current.scopeNamespaces.groupNameSlugs.get('k r puram belt')).toBe('kr-puram-belt');
  });

  it('resolvedUrlScope resolves to none for a null scope', () => {
    const { result } = renderHook(() =>
      useDiscoverGeographyController({
        city: 'udupi',
        isCityValid: true,
        navCity: 'udupi',
        scope: null,
        intentListingPurpose: 'sale',
        areaGroupsData: AREA_GROUPS,
      }),
    );
    expect(result.current.resolvedUrlScope.kind).toBe('none');
  });

  it('resolvedUrlScope resolves a matching region key, and that key gates useRegionScopedAreaGroups', () => {
    renderHook(() =>
      useDiscoverGeographyController({
        city: 'udupi',
        isCityValid: true,
        navCity: 'udupi',
        scope: 'north',
        intentListingPurpose: 'rent',
        areaGroupsData: AREA_GROUPS,
      }),
    );
    expect(mockUseRegionScopedAreaGroups).toHaveBeenCalledWith('udupi', 'north', 'rent');
  });

  it('a non-region scope (no match) passes null regionKey to useRegionScopedAreaGroups', () => {
    renderHook(() =>
      useDiscoverGeographyController({
        city: 'udupi',
        isCityValid: true,
        navCity: 'udupi',
        scope: 'unmatched-scope-value',
        intentListingPurpose: 'sale',
        areaGroupsData: AREA_GROUPS,
      }),
    );
    expect(mockUseRegionScopedAreaGroups).toHaveBeenCalledWith('udupi', null, 'sale');
  });

  it('useDiscoverAreas is called with the empty string (disabled) when isCityValid is false', () => {
    renderHook(() =>
      useDiscoverGeographyController({
        city: 'not-a-real-city',
        isCityValid: false,
        navCity: 'not-a-real-city',
        scope: null,
        intentListingPurpose: 'sale',
        areaGroupsData: AREA_GROUPS,
      }),
    );
    expect(mockUseDiscoverAreas).toHaveBeenCalledWith('');
  });

  it('discoverAreasForPanel defaults to [] when the query has not resolved', () => {
    mockUseDiscoverAreas.mockReturnValue({ data: undefined });
    const { result } = renderHook(() =>
      useDiscoverGeographyController({
        city: 'udupi',
        isCityValid: true,
        navCity: 'udupi',
        scope: null,
        intentListingPurpose: 'sale',
        areaGroupsData: AREA_GROUPS,
      }),
    );
    expect(result.current.discoverAreasForPanel).toEqual([]);
  });
});
