import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDiscoverJourneyChromeController } from './useDiscoverJourneyChromeController';
import type { UseDiscoverJourneyChromeControllerParams } from './useDiscoverJourneyChromeController';

const AREA_POINT = {
  areaKey: 'IN|KA|Udupi|Katapadi',
  areaLabel: 'Katapadi',
  geo_center_lat: 13.34,
  geo_center_lon: 74.78,
  bbox: null,
  listingCount: 4,
} as never;

function baseParams(
  overrides: Partial<UseDiscoverJourneyChromeControllerParams> = {},
): UseDiscoverJourneyChromeControllerParams {
  return {
    nav: {
      journey: 'area-first',
      areaKey: null,
      groupId: null,
      schoolId: null,
      schoolPicking: null,
    } as never,
    resolvedPanelContent: 'area-groups-landing' as never,
    effectiveSelectedArea: null,
    legacySelectedArea: null,
    focusedGroup: null,
    selectedSchool: null,
    city: 'udupi',
    ...overrides,
  };
}

describe('useDiscoverJourneyChromeController — isAreaFirstSelectedAreaState (issue #2408)', () => {
  it('is TRUE for a canonical node= drill-down to a single area (area-groups-landing + effectiveSelectedArea, no focused group) — previously FALSE, the reported bug', () => {
    const { result } = renderHook(() =>
      useDiscoverJourneyChromeController(
        baseParams({
          resolvedPanelContent: 'area-groups-landing' as never,
          effectiveSelectedArea: AREA_POINT,
          legacySelectedArea: null, // node journey never sets the legacy field
          focusedGroup: null,
        }),
      ),
    );
    expect(result.current.isAreaFirstSelectedAreaState).toBe(true);
  });

  it('is TRUE for the legacy areaKey= path (resolvedPanelContent === "area-selected") — no regression', () => {
    const { result } = renderHook(() =>
      useDiscoverJourneyChromeController(
        baseParams({
          resolvedPanelContent: 'area-selected' as never,
          effectiveSelectedArea: AREA_POINT,
          legacySelectedArea: AREA_POINT,
          focusedGroup: null,
        }),
      ),
    );
    expect(result.current.isAreaFirstSelectedAreaState).toBe(true);
  });

  it('is FALSE for the group-overview step (area-groups-landing, focused group, no area drilled into yet)', () => {
    const { result } = renderHook(() =>
      useDiscoverJourneyChromeController(
        baseParams({
          resolvedPanelContent: 'area-groups-landing' as never,
          effectiveSelectedArea: null,
          focusedGroup: { name: 'Katapadi & Manipal' } as never,
        }),
      ),
    );
    expect(result.current.isAreaFirstSelectedAreaState).toBe(false);
  });

  it('is TRUE when a focused group AND a resolved AREA node are BOTH present (node/groupId are independent URL axes — reviewer-caught gap in the first cut of this fix)', () => {
    const { result } = renderHook(() =>
      useDiscoverJourneyChromeController(
        baseParams({
          resolvedPanelContent: 'area-groups-landing' as never,
          effectiveSelectedArea: AREA_POINT,
          focusedGroup: { name: 'Katapadi & Manipal' } as never,
        }),
      ),
    );
    expect(result.current.isAreaFirstSelectedAreaState).toBe(true);
    // Sanity: isSelectedGroupState must stay false for this same state — the
    // two predicates are mutually exclusive by construction (it requires
    // !effectiveSelectedArea), never both true for one render.
    expect(result.current.isSelectedGroupState).toBe(false);
  });

  it('is FALSE for the plain area-groups-landing browse state (no area, no group)', () => {
    const { result } = renderHook(() =>
      useDiscoverJourneyChromeController(baseParams()),
    );
    expect(result.current.isAreaFirstSelectedAreaState).toBe(false);
  });

  it('is FALSE outside the area-first journey even if effectiveSelectedArea is resolved (e.g. school-first)', () => {
    const { result } = renderHook(() =>
      useDiscoverJourneyChromeController(
        baseParams({
          nav: { journey: 'school-first', areaKey: null, groupId: null, schoolId: null, schoolPicking: null } as never,
          resolvedPanelContent: 'schools-in-area' as never,
          effectiveSelectedArea: AREA_POINT,
        }),
      ),
    );
    expect(result.current.isAreaFirstSelectedAreaState).toBe(false);
  });
});
