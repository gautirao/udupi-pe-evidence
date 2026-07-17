/**
 * DiscoverDataSourceContext — Issue #1911 PR3.
 *
 * Tests:
 * 1. useDiscoverSource() defaults to {mode:'live'} outside any provider
 * 2. useDiscoverSource() returns the provided preview source inside a provider
 * 3. discoverPath: live mode returns livePath UNCHANGED, ignoring endpoint
 * 4. discoverPath: preview mode returns the admin preview path per endpoint kind,
 *    ignoring livePath entirely
 * 5. discoverKey: live mode returns liveKey UNCHANGED
 * 6. discoverKey: preview mode prepends ['preview', cityId, revisionId]
 * 7. useDiscoverActionsEnabled: true in live, false in preview
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import {
  DiscoverDataSourceProvider,
  useDiscoverSource,
  useDiscoverActionsEnabled,
  discoverPath,
  discoverKey,
  type DiscoverDataSource,
} from '../DiscoverDataSourceContext';

const PREVIEW_SOURCE: DiscoverDataSource = { mode: 'preview', cityId: 7, revisionId: 42 };

function previewWrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(DiscoverDataSourceProvider, { value: PREVIEW_SOURCE }, children);
}

describe('useDiscoverSource', () => {
  it('defaults to {mode:"live"} outside any provider', () => {
    const { result } = renderHook(() => useDiscoverSource());
    expect(result.current).toEqual({ mode: 'live' });
  });

  it('returns the provided preview source inside a DiscoverDataSourceProvider', () => {
    const { result } = renderHook(() => useDiscoverSource(), { wrapper: previewWrapper });
    expect(result.current).toEqual(PREVIEW_SOURCE);
  });
});

describe('discoverPath', () => {
  const livePath = '/api/discover/cities/bangalore/regions?listingPurpose=sale';

  it('live mode returns livePath unchanged, regardless of endpoint', () => {
    expect(discoverPath({ mode: 'live' }, livePath, { kind: 'regions' })).toBe(livePath);
    expect(
      discoverPath({ mode: 'live' }, livePath, { kind: 'regionGroups', regionKey: 'north' }),
    ).toBe(livePath);
  });

  it('preview mode returns the admin preview /regions path, ignoring livePath', () => {
    expect(discoverPath(PREVIEW_SOURCE, livePath, { kind: 'regions' })).toBe(
      '/api/admin/city-launch/cities/7/revisions/42/preview/regions',
    );
  });

  it('preview mode returns the admin preview /regions/{regionKey}/groups path', () => {
    expect(
      discoverPath(PREVIEW_SOURCE, livePath, { kind: 'regionGroups', regionKey: 'north' }),
    ).toBe('/api/admin/city-launch/cities/7/revisions/42/preview/regions/north/groups');
  });

  it('preview mode returns the admin preview /areas path', () => {
    expect(discoverPath(PREVIEW_SOURCE, livePath, { kind: 'areas' })).toBe(
      '/api/admin/city-launch/cities/7/revisions/42/preview/areas',
    );
  });

  it('preview mode returns the admin preview /markers path', () => {
    expect(discoverPath(PREVIEW_SOURCE, livePath, { kind: 'markers' })).toBe(
      '/api/admin/city-launch/cities/7/revisions/42/preview/markers',
    );
  });

  it('preview mode returns the admin preview /listings path', () => {
    expect(discoverPath(PREVIEW_SOURCE, livePath, { kind: 'listings' })).toBe(
      '/api/admin/city-launch/cities/7/revisions/42/preview/listings',
    );
  });

  it('preview mode returns the admin preview /listings/{areaKey} path, URI-encoded', () => {
    expect(
      discoverPath(PREVIEW_SOURCE, livePath, { kind: 'listingDetail', areaKey: 'IN|KA|Udupi|Manipal' }),
    ).toBe('/api/admin/city-launch/cities/7/revisions/42/preview/listings/IN%7CKA%7CUdupi%7CManipal');
  });
});

describe('discoverKey', () => {
  it('live mode returns liveKey unchanged', () => {
    const key = discoverKey({ mode: 'live' }, 'discover-areas', 'udupi');
    expect(key).toEqual(['discover-areas', 'udupi']);
  });

  it('preview mode prepends [\'preview\', cityId, revisionId] to liveKey', () => {
    const key = discoverKey(PREVIEW_SOURCE, 'discover-areas', 'udupi');
    expect(key).toEqual(['preview', 7, 42, 'discover-areas', 'udupi']);
  });
});

describe('useDiscoverActionsEnabled', () => {
  it('returns true in live mode', () => {
    const { result } = renderHook(() => useDiscoverActionsEnabled());
    expect(result.current).toBe(true);
  });

  it('returns false in preview mode', () => {
    const { result } = renderHook(() => useDiscoverActionsEnabled(), { wrapper: previewWrapper });
    expect(result.current).toBe(false);
  });
});
