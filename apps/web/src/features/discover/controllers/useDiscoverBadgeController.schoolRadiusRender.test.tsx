/**
 * #2750 PILOT N2 — retires e2e/discover/school-badge-suppression.spec.ts SBS-1 / SBS-2 (render arm).
 *
 * The legacy spec asserted, in a browser, that an ANON school-radius search renders the count pill with the
 * RADIUS count (0 or 2) and never the area/city total. This test reproduces the same seam without a browser:
 *
 *   REAL useDiscoverBadgeController (renderHook)
 *     -> its REAL discoverBadge / schoolRadiusActive / cityTotal / schoolRadiusPillNoun
 *     -> REAL isDrillDownCountBadgeVisible gate
 *     -> REAL DiscoverMapCountBadge, journey 'school-first'.
 *
 * Nothing on that chain is hand-built or mocked: a defect anywhere between the controller's school arm and the
 * rendered pill text reddens it. (A hand-built discoverBadge would only test the component against itself.)
 */
import { describe, it, expect } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import {
  useDiscoverBadgeController,
  type UseDiscoverBadgeControllerParams,
} from './useDiscoverBadgeController';
import { DiscoverMapCountBadge } from '@/components/discover/DiscoverMapCountBadge';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { SchoolRadiusListingItem } from '@/hooks/useSchoolRadiusListings';

function area(key: string, label: string, listingCount: number): AreaPoint {
  return {
    areaKey: `IN|KA|Bengaluru|${key}`,
    areaLabel: label,
    geo_center_lat: 13.05,
    geo_center_lon: 77.65,
    bbox: null,
    listingCount,
  };
}

// cityTotal = 18 + 7 + 11 = 36. Every competing figure (9 area-listings, 18 area, 36 city) is > 0 and
// different from the radius counts (0 and 2) used below.
const DISCOVER_AREAS: AreaPoint[] = [
  area('Kothanur', 'Kothanur', 18),
  area('Hebbal', 'Hebbal', 7),
  area('Yelahanka', 'Yelahanka', 11),
];

// Radius search is expressed ONLY as filters; schoolRadiusActive is derived from them by the controller.
const RADIUS_FILTERS = { schoolLat: 13.05, schoolLon: 77.65, schoolRadiusKm: 3 };

function items<T>(count: number): T[] {
  return Array.from({ length: count }, (_, i) => ({ id: `listing-${i}` })) as unknown as T[];
}

// Codex CX-1 — the legacy SBS-2 URL carries `areaKey`, so the real page resolves 'area-school-combined' with a
// NON-null selected area (distinct listingCount 18 here). 'school-selected' is the area-less arm.
type PanelState = 'school-selected' | 'area-school-combined';
const COMBINED_SELECTED_AREA = DISCOVER_AREAS[0]; // Kothanur, listingCount 18 !== radius count

function params(radiusCount: number, state: PanelState): UseDiscoverBadgeControllerParams {
  return {
    effectiveSelectedArea: state === 'area-school-combined' ? COMBINED_SELECTED_AREA : null,
    focusedGroup: null,
    groupId: null,
    discoverAreas: DISCOVER_AREAS,
    city: 'bangalore',
    filters: RADIUS_FILTERS,
    areaListings: items<DiscoverCityListingItem>(9), // area inventory the radius result must NOT leak
    isLoadingAreaListings: false,
    listingDataLoading: false,
    isAuthenticated: false,
    // Anon path: schoolListings is the post-filter radius set; with no property filters it equals the radius set.
    schoolListings: items<DiscoverCityListingItem>(radiusCount),
    schoolRadiusListings: items<SchoolRadiusListingItem>(radiusCount),
    schoolRadiusListingsLoading: false,
    debouncedSearch: '',
    navQ: '',
    intent: 'buy',
  };
}

function renderPillFromRealController(radiusCount: number, state: PanelState = 'school-selected') {
  const selectedArea = state === 'area-school-combined' ? COMBINED_SELECTED_AREA : null;
  const { result } = renderHook(() => useDiscoverBadgeController(params(radiusCount, state)));
  const c = result.current;
  render(
    <DiscoverMapCountBadge
      resolvedPanelContent={state}
      isAreaFirstCityLanding={false}
      discoverBadge={c.discoverBadge}
      isSelectedGroupState={false}
      // Derived by the real page as `nav.journey === 'area-first' && !!effectiveSelectedArea && panel in
      // ('area-selected' | 'area-groups-landing')` (useDiscoverJourneyChromeController.ts). Journey here is
      // 'school-first' and the panel is school-selected / area-school-combined, so it is FALSE in both arms.
      isAreaFirstSelectedAreaState={false}
      selectedArea={selectedArea}
      focusedGroup={null}
      areaResultSummaryText={c.areaResultSummaryText}
      groupSelectedBadgeCopy={c.groupSelectedBadgeCopy}
      fallbackBadgeCopy={c.fallbackBadgeCopy}
      journey="school-first"
      schoolRadiusActive={c.schoolRadiusActive}
      schoolRadiusPillNoun={c.schoolRadiusPillNoun}
      schoolFirstAreaSchoolCount={null}
      schoolFirstZoneSchoolCount={null}
      schoolFirstLandingSchoolCount={null}
      cityTotal={c.cityTotal}
      city="bangalore"
    />,
  );
  return c;
}

describe('#2750 PILOT N2 — anon school-radius count pill (real controller -> real badge)', () => {
  it('SBS-1: zero radius results still renders the pill, reading "Showing 0 homes", never the area (9/18) or city (36) total', () => {
    const c = renderPillFromRealController(0);

    // Preconditions come from the REAL controller output, not literals.
    expect(c.schoolRadiusActive).toBe(true);
    expect(c.cityTotal).toBe(36);
    expect(c.discoverBadge.visible).toBe(true);
    expect(c.discoverBadge.count).toBe(0);

    const pill = screen.getByTestId('discover-badge');
    expect(pill.textContent?.replace(/\s+/g, ' ').trim()).toBe('Showing 0 homes');
    expect(pill.textContent).not.toMatch(/\b(9|18|36)\b/);
  });

  it('SBS-2: two radius results render "Showing 2 homes", never the area (9/18) or city (36) total', () => {
    const c = renderPillFromRealController(2);

    expect(c.schoolRadiusActive).toBe(true);
    expect(c.cityTotal).toBe(36);
    expect(c.discoverBadge.visible).toBe(true);
    expect(c.discoverBadge.count).toBe(2);

    const pill = screen.getByTestId('discover-badge');
    expect(pill.textContent?.replace(/\s+/g, ' ').trim()).toBe('Showing 2 homes');
    expect(pill.textContent).not.toMatch(/\b(9|18|36)\b/);
  });

  it('SBS-2 (area-school-combined, areaKey present): selected area (18) is in play yet the pill still reads "Showing 2 homes", not the area count', () => {
    const c = renderPillFromRealController(2, 'area-school-combined');

    // Precondition: the area context really flows through the REAL controller (area copy is built from it)...
    expect(COMBINED_SELECTED_AREA.listingCount).toBe(18);
    expect(c.areaResultSummaryText).toContain('Kothanur');
    // ...and the school-radius count still wins at the selector.
    expect(c.schoolRadiusActive).toBe(true);
    expect(c.discoverBadge.visible).toBe(true);
    expect(c.discoverBadge.count).toBe(2);

    const pill = screen.getByTestId('discover-badge');
    expect(pill.textContent?.replace(/\s+/g, ' ').trim()).toBe('Showing 2 homes');
    expect(pill.textContent).not.toMatch(/\b(9|18|36)\b/);
    expect(pill.textContent).not.toContain('Kothanur');
  });
});
