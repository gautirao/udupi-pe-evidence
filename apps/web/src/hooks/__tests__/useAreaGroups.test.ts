import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { normalizeAreaGroupResponse, useAreaGroups, AREA_GROUPS_QUERY_KEY_BASE, type AreaGroup } from '../useAreaGroups';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';

// ─── Hoisted capture state (used by the useAreaGroups threading tests below) ──

const { capturedOptions } = vi.hoisted(() => ({
  capturedOptions: { queryKey: undefined as unknown, enabled: undefined as unknown },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const real = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...real,
    useQuery: vi.fn((options: Parameters<typeof real.useQuery>[0]) => {
      capturedOptions.queryKey = options.queryKey;
      capturedOptions.enabled = options.enabled;
      return real.useQuery(options);
    }),
  };
});

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

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
          regionKey: 'coastal',
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
      region_key: 'coastal',
      min_lat: 13.0,
      min_lon: 74.5,
      max_lat: 13.5,
      max_lon: 75.0,
    });
  });

  it('surfaces regionKey and the group bbox (min/max lat/lon) — Issue #1882 Slice S2b', () => {
    const backendResponse = {
      groups: [
        {
          slug: 'university-belt',
          name: 'University Belt',
          areaKeys: ['a1'],
          minLat: 13.34,
          minLon: 74.74,
          maxLat: 13.36,
          maxLon: 74.76,
          regionKey: 'central',
        },
      ],
    };

    const result = normalizeAreaGroupResponse(backendResponse);
    expect(result.groups[0].region_key).toBe('central');
    expect(result.groups[0].min_lat).toBe(13.34);
    expect(result.groups[0].min_lon).toBe(74.74);
    expect(result.groups[0].max_lat).toBe(13.36);
    expect(result.groups[0].max_lon).toBe(74.76);
  });

  it('defaults region_key and bbox fields to null when the backend omits them (degenerate/unclassified group)', () => {
    const backendResponse = {
      groups: [
        {
          slug: 'unclassified',
          name: 'Unclassified Group',
          areaKeys: [],
        },
      ],
    };

    const result = normalizeAreaGroupResponse(backendResponse);
    expect(result.groups[0].region_key).toBeNull();
    expect(result.groups[0].min_lat).toBeNull();
    expect(result.groups[0].min_lon).toBeNull();
    expect(result.groups[0].max_lat).toBeNull();
    expect(result.groups[0].max_lon).toBeNull();
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
      region_key: null,
      min_lat: null,
      min_lon: null,
      max_lat: null,
      max_lon: null,
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
      region_key: null,
      min_lat: null,
      min_lon: null,
      max_lat: null,
      max_lon: null,
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
      region_key: null,
      min_lat: null,
      min_lon: null,
      max_lat: null,
      max_lon: null,
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
      region_key: null,
      min_lat: null,
      min_lon: null,
      max_lat: null,
      max_lon: null,
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

// ─── Issue #1911 PR3 rework — useAreaGroups threaded through
// DiscoverDataSourceContext (closes the area-groups isolation gap: before
// this rework, MapDiscovery's unscoped useAreaGroups(city) call always hit
// the LIVE /api/discover/area-groups endpoint even when mounted inside
// CityLaunchPreview's preview provider) ─────────────────────────────────────

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

function makePreviewWrapper(client: QueryClient, cityId: number, revisionId: number) {
  return function PreviewWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(
        DiscoverDataSourceProvider,
        { value: { mode: 'preview', cityId, revisionId, citySlug: 'preview-city' }, children },
      ),
    );
  };
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  capturedOptions.queryKey = undefined;
  capturedOptions.enabled = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAreaGroups — live mode is byte-identical to pre-rework (Issue #1911 PR3)', () => {
  it('live queryKey is unchanged (no preview triple)', () => {
    const client = freshClient();
    renderHook(() => useAreaGroups('udupi'), { wrapper: makeWrapper(client) });
    expect(capturedOptions.queryKey).toEqual([...AREA_GROUPS_QUERY_KEY_BASE, 'udupi']);
  });

  it('live mode requests the unchanged live path with skipAuth:true', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ groups: [] });
    const client = freshClient();
    const { result } = renderHook(() => useAreaGroups('udupi'), { wrapper: makeWrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(vi.mocked(api.get)).toHaveBeenCalledOnce();
    const [path, options] = vi.mocked(api.get).mock.calls[0];
    expect(path).toBe('/api/discover/area-groups?city=udupi');
    expect(options).toEqual({ skipAuth: true });
  });
});

describe('useAreaGroups — preview mode threading (Issue #1911 PR3)', () => {
  it('preview queryKey prepends [preview, cityId, revisionId] to the live key', () => {
    const client = freshClient();
    renderHook(() => useAreaGroups('udupi'), { wrapper: makePreviewWrapper(client, 7, 42) });
    expect(capturedOptions.queryKey).toEqual([
      'preview',
      7,
      42,
      ...AREA_GROUPS_QUERY_KEY_BASE,
      'udupi',
    ]);
  });

  it('preview mode requests the admin preview area-groups path and sends skipAuth:false', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ groups: [] });
    const client = freshClient();
    const { result } = renderHook(() => useAreaGroups('udupi'), {
      wrapper: makePreviewWrapper(client, 7, 42),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(vi.mocked(api.get)).toHaveBeenCalledOnce();
    const [path, options] = vi.mocked(api.get).mock.calls[0];
    expect(path).toBe('/api/admin/city-launch/cities/7/revisions/42/preview/area-groups');
    expect(options).toEqual({ skipAuth: false });
  });

  it('two different revisionIds produce two different preview queryKeys (no cross-revision cache collision)', () => {
    const client = freshClient();
    renderHook(() => useAreaGroups('udupi'), { wrapper: makePreviewWrapper(client, 7, 42) });
    const revision42Key = capturedOptions.queryKey;

    renderHook(() => useAreaGroups('udupi'), { wrapper: makePreviewWrapper(client, 7, 99) });
    const revision99Key = capturedOptions.queryKey;

    expect(revision42Key).not.toEqual(revision99Key);
    expect(revision42Key).toEqual(['preview', 7, 42, ...AREA_GROUPS_QUERY_KEY_BASE, 'udupi']);
    expect(revision99Key).toEqual(['preview', 7, 99, ...AREA_GROUPS_QUERY_KEY_BASE, 'udupi']);
  });
});
