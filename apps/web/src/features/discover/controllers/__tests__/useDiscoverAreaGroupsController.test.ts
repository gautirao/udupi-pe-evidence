/**
 * useDiscoverAreaGroupsController — #2858 batch 1 (Lane C of #2750), lower-level replacement for the retired
 * preview group-scope E2E (#2205).
 *
 * Only the HTTP boundary (`@/lib/api`) is mocked. The REAL useAreaGroups hook, the REAL DiscoverDataSourceContext
 * preview path resolution, the REAL normalizeAreaGroupResponse DTO mapper and the REAL resolveActiveDiscoverGroup
 * resolver all run under a QueryClient + preview DiscoverDataSourceProvider wrapper.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet },
}));

import { useDiscoverAreaGroupsController } from '../useDiscoverAreaGroupsController';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';

const PREVIEW_AREA_GROUPS_PATH = '/api/admin/city-launch/cities/7/revisions/42/preview/area-groups';
const COASTAL_MEMBERS = ['IN|KA|Udupi|Malpe', 'IN|KA|Udupi|Kaup', 'IN|KA|Udupi|Ullal'];

// Backend DTO shape (slug/areaKeys camelCase) — normalised by the real useAreaGroups mapper.
const AREA_GROUPS_DTO = {
  city: 'udupi',
  groups: [
    { slug: 'coastal-belt', name: 'Coastal Belt', areaKeys: COASTAL_MEMBERS },
    // Distractor: a second group whose members must NOT leak into the focused group's scope.
    { slug: 'university-belt', name: 'University Belt', areaKeys: ['IN|KA|Udupi|Manipal'] },
  ],
};

function makePreviewWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(DiscoverDataSourceProvider, {
        value: { mode: 'preview', cityId: 7, revisionId: 42, citySlug: 'udupi' },
        children,
      }),
    );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiGet.mockImplementation((url: string) => {
    if (url === PREVIEW_AREA_GROUPS_PATH) return Promise.resolve(AREA_GROUPS_DTO);
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
});

describe('useDiscoverAreaGroupsController — preview ?groupId scope (#2858/#2205)', () => {
  it("?groupId resolves groupAreaKeysForMapData to that group's area_keys (preview area-groups path served via api.get)", async () => {
    const { result } = renderHook(
      () =>
        useDiscoverAreaGroupsController({
          navCity: 'udupi',
          groupId: 'coastal-belt',
          areaKey: null,
          journey: 'area-first',
          schoolId: null,
        }),
      { wrapper: makePreviewWrapper() },
    );

    await waitFor(() => {
      expect(result.current.focusedGroup?.id).toBe('coastal-belt');
    });

    // The preview area-groups endpoint (not the live /api/discover/area-groups) was the one hit, admin-authed.
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith(PREVIEW_AREA_GROUPS_PATH, { skipAuth: false });
    // Exactly the focused group's members — not [] (cold-load guard) and not the distractor group's keys.
    expect(result.current.groupAreaKeysForMapData).toEqual(COASTAL_MEMBERS);
  });
});
