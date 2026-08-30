/**
 * Unit tests for computeZoneLabelPoints — truthful school-zone label positioning.
 */
import { describe, it, expect } from 'vitest';
import { computeZoneLabelPoints } from '@/lib/schoolZoneLabels';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

function area(areaKey: string, lat: number, lon: number, schoolCount: number | null = null): AreaPoint {
  return {
    areaKey,
    areaLabel: areaKey.split('|').pop() ?? areaKey,
    geo_center_lat: lat,
    geo_center_lon: lon,
    bbox: null,
    schoolCount,
  };
}

function group(id: string, areaKeys: string[], focus?: { lat: number; lon: number }): AreaGroup {
  return {
    id,
    name: id.replace(/-/g, ' '),
    subtitle: null,
    region_label: null,
    school_count: 0,
    area_keys: areaKeys,
    focus_lat: focus?.lat ?? null,
    focus_lon: focus?.lon ?? null,
  };
}

const MANIPAL = area('IN|KA|Udupi|Manipal', 13.35, 74.79, 12);
const KATAPADI = area('IN|KA|Udupi|Katapadi', 13.39, 74.75, 3);
const HEBRI = area('IN|KA|Udupi|Hebri', 13.48, 75.05, 1); // not in any group below

describe('computeZoneLabelPoints', () => {
  it('prefers the group focus point when present', () => {
    const g = group('university-belt', [MANIPAL.areaKey, KATAPADI.areaKey], { lat: 13.4, lon: 74.7 });
    const [pt] = computeZoneLabelPoints([g], [MANIPAL, KATAPADI]);
    expect(pt.lat).toBe(13.4);
    expect(pt.lon).toBe(74.7);
    expect(pt.groupId).toBe('university-belt');
    expect(pt.label).toBe('university belt');
  });

  it('falls back to the bounds-centre of member-area coordinates when no focus point', () => {
    const g = group('university-belt', [MANIPAL.areaKey, KATAPADI.areaKey]);
    const [pt] = computeZoneLabelPoints([g], [MANIPAL, KATAPADI]);
    // bounds-centre = midpoint of min/max lat & lon
    expect(pt.lat).toBeCloseTo((13.35 + 13.39) / 2, 6);
    expect(pt.lon).toBeCloseTo((74.79 + 74.75) / 2, 6);
  });

  it('sums schoolCount across resolved member areas only', () => {
    const g = group('university-belt', [MANIPAL.areaKey, KATAPADI.areaKey]);
    const [pt] = computeZoneLabelPoints([g], [MANIPAL, KATAPADI, HEBRI]);
    expect(pt.schoolCount).toBe(15); // 12 + 3, Hebri excluded (not a member)
  });

  it('drops a group with no focus point and no resolvable member areas', () => {
    const g = group('ghost-zone', ['IN|KA|Udupi|DoesNotExist']);
    expect(computeZoneLabelPoints([g], [MANIPAL, KATAPADI])).toEqual([]);
  });

  it('keeps a group positioned by focus even when its member areas are missing coords', () => {
    const g = group('config-zone', ['IN|KA|Udupi|DoesNotExist'], { lat: 13.2, lon: 74.8 });
    const [pt] = computeZoneLabelPoints([g], [MANIPAL]);
    expect(pt.lat).toBe(13.2);
    expect(pt.schoolCount).toBeNull(); // no resolved members → unknown, never 0-faked
  });

  it('returns null schoolCount when members resolve but none report a count', () => {
    const noCounts = area('IN|KA|Udupi|Parkala', 13.36, 74.77, null);
    const g = group('z', [noCounts.areaKey]);
    const [pt] = computeZoneLabelPoints([g], [noCounts]);
    expect(pt.schoolCount).toBeNull();
  });
});
