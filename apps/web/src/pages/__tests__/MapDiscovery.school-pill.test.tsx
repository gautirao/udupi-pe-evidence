/**
 * Visual-parity polish (cycles 3–4) — school-first status-pill count derivations
 * + school-marker-layer visibility gate.
 *
 * Pure helper tests — no page mount required (mirrors the existing
 * MapDiscovery.issue1152.test.ts / MapDiscovery.issue1175.test.ts convention for
 * deriveDiscoverBadge).
 *
 * Covers:
 *   (a) deriveShowSchoolMarkers — false at school-browse/school-group-areas
 *       (school-first, no areaKey); true at schools-in-area/school-selected/
 *       area-school-combined (school-first + areaKey); area-first school-picking
 *       and area-school-combined sub-states unchanged.
 *   (b) One assertion per status-pill branch: landing schools count, zone schools
 *       count, area schools count. (School-selected homes/rentals wording and the
 *       non-school-journey fallback are existing deriveDiscoverBadge behaviour,
 *       already covered by MapDiscovery.issue1152/1175.test.ts — not re-tested here.)
 *   (c) All three school-count derivations return null (pill hidden) while
 *       areasLoading=true, exactly like the schoolListingsCount null-while-loading
 *       pattern.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveShowSchoolMarkers,
  deriveSchoolFirstLandingSchoolCount,
  deriveSchoolFirstZoneSchoolCount,
  deriveSchoolFirstAreaSchoolCount,
  deriveSchoolRadiusPillNoun,
} from '@/features/discover/presentation/schoolFirstCounts';
import { deriveDiscoverBadge } from '@/features/discover/presentation/discoverBadge';

// ── deriveShowSchoolMarkers ─────────────────────────────────────────────────────

describe('deriveShowSchoolMarkers (Issue #1157 rev-5 DEFECT A + cycle-3 areaKey gate)', () => {
  it('school-browse (school-first, no areaKey) → false', () => {
    expect(
      deriveShowSchoolMarkers({
        journey: 'school-first',
        areaKey: null,
        schoolPicking: false,
        schoolId: null,
      }),
    ).toBe(false);
  });

  it('school-group-areas (school-first, groupId set but no areaKey) → false', () => {
    expect(
      deriveShowSchoolMarkers({
        journey: 'school-first',
        areaKey: null,
        schoolPicking: false,
        schoolId: null,
      }),
    ).toBe(false);
  });

  it('schools-in-area (school-first, areaKey set) → true', () => {
    expect(
      deriveShowSchoolMarkers({
        journey: 'school-first',
        areaKey: 'IN|KA|Udupi|Manipal',
        schoolPicking: false,
        schoolId: null,
      }),
    ).toBe(true);
  });

  it('school-selected (school-first, areaKey resolved + schoolId set) → true', () => {
    expect(
      deriveShowSchoolMarkers({
        journey: 'school-first',
        areaKey: 'IN|KA|Udupi|Manipal',
        schoolPicking: false,
        schoolId: 'sch-1',
      }),
    ).toBe(true);
  });

  it('area-school-combined (school-first, areaKey + schoolId set) → true', () => {
    expect(
      deriveShowSchoolMarkers({
        journey: 'school-first',
        areaKey: 'IN|KA|Udupi|Manipal',
        schoolPicking: false,
        schoolId: 'sch-1',
      }),
    ).toBe(true);
  });

  it('area-first school-picking sub-step (schoolPicking=true, no areaKey needed) → true — unchanged', () => {
    expect(
      deriveShowSchoolMarkers({
        journey: 'area-first',
        areaKey: 'IN|KA|Udupi|Manipal',
        schoolPicking: true,
        schoolId: null,
      }),
    ).toBe(true);
  });

  it('area-first area-school-combined (areaKey + schoolId set) → true — unchanged', () => {
    expect(
      deriveShowSchoolMarkers({
        journey: 'area-first',
        areaKey: 'IN|KA|Udupi|Manipal',
        schoolPicking: false,
        schoolId: 'sch-1',
      }),
    ).toBe(true);
  });

  it('area-first, area selected but no school → false', () => {
    expect(
      deriveShowSchoolMarkers({
        journey: 'area-first',
        areaKey: 'IN|KA|Udupi|Manipal',
        schoolPicking: false,
        schoolId: null,
      }),
    ).toBe(false);
  });

  it('agri-first journey → always false', () => {
    expect(
      deriveShowSchoolMarkers({
        journey: 'agri-first',
        areaKey: 'IN|KA|Udupi|Manipal',
        schoolPicking: false,
        schoolId: 'sch-1',
      }),
    ).toBe(false);
  });
});

// ── School-first status-pill school counts ──────────────────────────────────────

const AREAS = [
  { areaKey: 'IN|KA|Udupi|Manipal', schoolCount: 12 },
  { areaKey: 'IN|KA|Udupi|Malpe', schoolCount: 5 },
  { areaKey: 'IN|KA|Udupi|Hebri', schoolCount: 3 },
];

const ZONE_GROUP = { area_keys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Malpe'] };

describe('deriveSchoolFirstLandingSchoolCount', () => {
  it('landing (school-first, no groupId/area): sums schoolCount across discoverAreas', () => {
    const result = deriveSchoolFirstLandingSchoolCount({
      journey: 'school-first',
      groupId: null,
      selectedArea: null,
      areasLoading: false,
      discoverAreas: AREAS,
    });
    expect(result).toBe(20); // 12 + 5 + 3
  });

  it('returns null while areasLoading=true (never flashes "Showing 0 schools")', () => {
    const result = deriveSchoolFirstLandingSchoolCount({
      journey: 'school-first',
      groupId: null,
      selectedArea: null,
      areasLoading: true,
      discoverAreas: AREAS,
    });
    expect(result).toBeNull();
  });

  it('returns null when a zone is selected (falls through to zone derivation)', () => {
    const result = deriveSchoolFirstLandingSchoolCount({
      journey: 'school-first',
      groupId: 'university-belt',
      selectedArea: null,
      areasLoading: false,
      discoverAreas: AREAS,
    });
    expect(result).toBeNull();
  });

  it('returns null for non-school-first journeys', () => {
    const result = deriveSchoolFirstLandingSchoolCount({
      journey: 'area-first',
      groupId: null,
      selectedArea: null,
      areasLoading: false,
      discoverAreas: AREAS,
    });
    expect(result).toBeNull();
  });
});

describe('deriveSchoolFirstZoneSchoolCount', () => {
  it('zone selected (school-first, groupId set, no area): sums schoolCount across member areas only', () => {
    const result = deriveSchoolFirstZoneSchoolCount({
      journey: 'school-first',
      groupId: 'university-belt',
      selectedArea: null,
      focusedGroup: ZONE_GROUP,
      areasLoading: false,
      discoverAreas: AREAS,
    });
    // Manipal (12) + Malpe (5); Hebri (3) is NOT a member of the zone.
    expect(result).toBe(17);
  });

  it('returns null while areasLoading=true', () => {
    const result = deriveSchoolFirstZoneSchoolCount({
      journey: 'school-first',
      groupId: 'university-belt',
      selectedArea: null,
      focusedGroup: ZONE_GROUP,
      areasLoading: true,
      discoverAreas: AREAS,
    });
    expect(result).toBeNull();
  });

  it('returns null when focusedGroup has not resolved yet (group metadata still loading)', () => {
    const result = deriveSchoolFirstZoneSchoolCount({
      journey: 'school-first',
      groupId: 'university-belt',
      selectedArea: null,
      focusedGroup: null,
      areasLoading: false,
      discoverAreas: AREAS,
    });
    expect(result).toBeNull();
  });

  it('returns null when an area is also selected (falls through to area derivation)', () => {
    const result = deriveSchoolFirstZoneSchoolCount({
      journey: 'school-first',
      groupId: 'university-belt',
      selectedArea: { schoolCount: 12 },
      focusedGroup: ZONE_GROUP,
      areasLoading: false,
      discoverAreas: AREAS,
    });
    expect(result).toBeNull();
  });
});

describe('deriveSchoolFirstAreaSchoolCount', () => {
  it('area selected (school-first, no school picked yet): returns selectedArea.schoolCount', () => {
    const result = deriveSchoolFirstAreaSchoolCount({
      journey: 'school-first',
      selectedArea: { schoolCount: 12 },
      areasLoading: false,
    });
    expect(result).toBe(12);
  });

  it('returns null while areasLoading=true', () => {
    const result = deriveSchoolFirstAreaSchoolCount({
      journey: 'school-first',
      selectedArea: { schoolCount: 12 },
      areasLoading: true,
    });
    expect(result).toBeNull();
  });

  it('returns null when schoolCount is not yet resolved on the area (never fabricates 0)', () => {
    const result = deriveSchoolFirstAreaSchoolCount({
      journey: 'school-first',
      selectedArea: { schoolCount: null },
      areasLoading: false,
    });
    expect(result).toBeNull();
  });

  it('returns null when no area is selected', () => {
    const result = deriveSchoolFirstAreaSchoolCount({
      journey: 'school-first',
      selectedArea: null,
      areasLoading: false,
    });
    expect(result).toBeNull();
  });

  it('returns null for non-school-first journeys', () => {
    const result = deriveSchoolFirstAreaSchoolCount({
      journey: 'area-first',
      selectedArea: { schoolCount: 12 },
      areasLoading: false,
    });
    expect(result).toBeNull();
  });
});

// ── Status-pill branch: school-selected (school-radius-active) — "homes"/"rentals" ──

describe('deriveSchoolRadiusPillNoun (school-first, school-selected pill wording)', () => {
  it('intent=buy (default) → "homes"', () => {
    expect(deriveSchoolRadiusPillNoun('buy')).toBe('homes');
    expect(deriveSchoolRadiusPillNoun(undefined)).toBe('homes');
    expect(deriveSchoolRadiusPillNoun(null)).toBe('homes');
  });

  it('intent=rent → "rentals"', () => {
    expect(deriveSchoolRadiusPillNoun('rent')).toBe('rentals');
  });

  it('paired with deriveDiscoverBadge — school-radius active + N results shows the badge count that the "N homes"/"N rentals" pill wraps', () => {
    // Mirrors the JSX branch: urlState.journey === 'school-first' && schoolRadiusActive
    // → discoverBadge.count + deriveSchoolRadiusPillNoun(intent).
    const badge = deriveDiscoverBadge({
      selectedArea: null,
      filters: {},
      isLoadingAreaListings: false,
      cityTotal: 50,
      schoolListingsCount: 4,
    });
    expect(badge.visible).toBe(true);
    expect(badge.count).toBe(4);
    expect(deriveSchoolRadiusPillNoun('rent')).toBe('rentals');
  });
});

// ── Status-pill branch: non-school-journey fallback — plain "N properties" ──────

describe('Status pill — non-school-first / generic fallback branch', () => {
  it('area-first, no group/area context → deriveDiscoverBadge falls back to cityTotal, none of the school-count helpers apply', () => {
    expect(
      deriveSchoolFirstLandingSchoolCount({
        journey: 'area-first',
        groupId: null,
        selectedArea: null,
        areasLoading: false,
        discoverAreas: AREAS,
      }),
    ).toBeNull();
    expect(
      deriveSchoolFirstZoneSchoolCount({
        journey: 'area-first',
        groupId: null,
        selectedArea: null,
        focusedGroup: null,
        areasLoading: false,
        discoverAreas: AREAS,
      }),
    ).toBeNull();
    expect(
      deriveSchoolFirstAreaSchoolCount({
        journey: 'area-first',
        selectedArea: null,
        areasLoading: false,
      }),
    ).toBeNull();

    // With no school-count override applicable, the JSX falls through to the
    // existing generic "N properties" branch driven by deriveDiscoverBadge.
    const badge = deriveDiscoverBadge({
      selectedArea: null,
      filters: {},
      isLoadingAreaListings: false,
      cityTotal: 42,
    });
    expect(badge.visible).toBe(true);
    expect(badge.count).toBe(42);
  });
});
