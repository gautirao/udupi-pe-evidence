import { describe, it, expect } from 'vitest';
import { normalizeAreaGroupResponse, type AreaGroup } from '../useAreaGroups';

describe('normalizeAreaGroupResponse', () => {
  it('maps backend camelCase to frontend snake_case fields', () => {
    const backendResponse = {
      city: 'udupi',
      groups: [
        {
          slug: 'coastal-belt',
          name: 'Coastal Belt',
          subtitle: 'Udupi, Manipal, Karkala',
          regionLabel: 'West Coast',
          displayOrder: 1,
          areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Karkala'],
          focusLat: 13.35,
          focusLon: 74.79,
          minLat: 13.0,
          minLon: 74.5,
          maxLat: 13.5,
          maxLon: 75.0,
        },
      ],
    };

    const result = normalizeAreaGroupResponse(backendResponse);

    expect(result.groups).toHaveLength(1);
    const group = result.groups[0];
    expect(group).toEqual({
      id: 'coastal-belt',
      name: 'Coastal Belt',
      subtitle: 'Udupi, Manipal, Karkala',
      region_label: 'West Coast',
      school_count: 0,
      area_keys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Karkala'],
      focus_lat: 13.35,
      focus_lon: 74.79,
      description: null,
    });
  });

  it('handles null/missing subtitle and regionLabel', () => {
    const backendResponse = {
      groups: [
        {
          slug: 'zone-a',
          name: 'Zone A',
          subtitle: null,
          regionLabel: null,
          areaKeys: ['IN|KA|Udupi|Area1'],
        },
      ],
    };

    const result = normalizeAreaGroupResponse(backendResponse);

    expect(result.groups[0]).toEqual({
      id: 'zone-a',
      name: 'Zone A',
      subtitle: null,
      region_label: null,
      school_count: 0,
      area_keys: ['IN|KA|Udupi|Area1'],
      focus_lat: null,
      focus_lon: null,
      description: null,
    });
  });

  it('defaults school_count to 0 (not returned by backend)', () => {
    const backendResponse = {
      groups: [
        {
          slug: 'test-group',
          name: 'Test Group',
          subtitle: null,
          regionLabel: null,
          areaKeys: [],
        },
      ],
    };

    const result = normalizeAreaGroupResponse(backendResponse);
    expect(result.groups[0].school_count).toBe(0);
  });

  it('handles missing areaKeys by defaulting to empty array', () => {
    const backendResponse = {
      groups: [
        {
          slug: 'no-areas',
          name: 'No Areas Group',
          subtitle: null,
          regionLabel: null,
          areaKeys: null,
        },
      ],
    };

    const result = normalizeAreaGroupResponse(backendResponse);
    expect(result.groups[0].area_keys).toEqual([]);
  });

  it('handles missing areaKeys field entirely', () => {
    const backendResponse = {
      groups: [
        {
          slug: 'missing-keys',
          name: 'Missing Keys Group',
        },
      ],
    };

    const result = normalizeAreaGroupResponse(backendResponse);
    expect(result.groups[0].area_keys).toEqual([]);
  });

  it('uses slug as id fallback if slug is present', () => {
    const backendResponse = {
      groups: [
        {
          slug: 'fallback-id',
          name: 'Group Name',
          areaKeys: [],
        },
      ],
    };

    const result = normalizeAreaGroupResponse(backendResponse);
    expect(result.groups[0].id).toBe('fallback-id');
  });

  it('uses name as id if slug is missing', () => {
    const backendResponse = {
      groups: [
        {
          name: 'Fallback Name',
          areaKeys: [],
        },
      ],
    };

    const result = normalizeAreaGroupResponse(backendResponse);
    expect(result.groups[0].id).toBe('Fallback Name');
  });

  it('filters out groups with neither name nor slug', () => {
    const backendResponse = {
      groups: [
        {
          slug: 'valid-group',
          name: 'Valid Group',
          areaKeys: [],
        },
        {
          // Missing both name and slug — should be filtered out
          regionLabel: 'Invalid',
          areaKeys: [],
        },
        {
          name: 'Another Valid',
          areaKeys: [],
        },
      ],
    };

    const result = normalizeAreaGroupResponse(backendResponse);
    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((g) => g.name)).toEqual(['Valid Group', 'Another Valid']);
  });

  it('returns empty groups when input groups is null', () => {
    const backendResponse = {
      city: 'unknown',
      groups: null,
    };

    const result = normalizeAreaGroupResponse(backendResponse);
    expect(result.groups).toEqual([]);
  });

  it('returns empty groups when input groups is not an array', () => {
    const backendResponse = {
      groups: {} as unknown as Parameters<typeof normalizeAreaGroupResponse>[0]['groups'],
    };

    const result = normalizeAreaGroupResponse(backendResponse);
    expect(result.groups).toEqual([]);
  });

  it('returns empty groups when input is undefined', () => {
    const result = normalizeAreaGroupResponse(undefined as unknown as Parameters<typeof normalizeAreaGroupResponse>[0]);
    expect(result.groups).toEqual([]);
  });

  it('returns empty groups when input groups field is missing', () => {
    const result = normalizeAreaGroupResponse({ city: 'udupi' });
    expect(result.groups).toEqual([]);
  });

  it('handles multiple groups with mixed data quality', () => {
    const backendResponse = {
      groups: [
        {
          slug: 'complete',
          name: 'Complete Group',
          subtitle: 'Has everything',
          regionLabel: 'Region 1',
          areaKeys: ['area1', 'area2'],
        },
        {
          slug: 'partial',
          name: 'Partial Group',
          areaKeys: null,
        },
        {
          name: 'No Slug',
          regionLabel: 'Region 2',
          areaKeys: ['area3'],
        },
      ],
    };

    const result = normalizeAreaGroupResponse(backendResponse);
    expect(result.groups).toHaveLength(3);

    expect(result.groups[0]).toEqual({
      id: 'complete',
      name: 'Complete Group',
      subtitle: 'Has everything',
      region_label: 'Region 1',
      school_count: 0,
      area_keys: ['area1', 'area2'],
      focus_lat: null,
      focus_lon: null,
      description: null,
    });

    expect(result.groups[1]).toEqual({
      id: 'partial',
      name: 'Partial Group',
      subtitle: null,
      region_label: null,
      school_count: 0,
      area_keys: [],
      focus_lat: null,
      focus_lon: null,
      description: null,
    });

    expect(result.groups[2]).toEqual({
      id: 'No Slug',
      name: 'No Slug',
      subtitle: null,
      region_label: 'Region 2',
      school_count: 0,
      area_keys: ['area3'],
      focus_lat: null,
      focus_lon: null,
      description: null,
    });
  });

  it('preserves string values in areaKeys (does not filter/validate)', () => {
    const backendResponse = {
      groups: [
        {
          slug: 'test',
          name: 'Test',
          areaKeys: ['IN|KA|Udupi|Area1', 'IN|KA|Udupi|Area2', ''],
        },
      ],
    };

    const result = normalizeAreaGroupResponse(backendResponse);
    // Should preserve all values as-is, even empty strings
    expect(result.groups[0].area_keys).toEqual(['IN|KA|Udupi|Area1', 'IN|KA|Udupi|Area2', '']);
  });
});
