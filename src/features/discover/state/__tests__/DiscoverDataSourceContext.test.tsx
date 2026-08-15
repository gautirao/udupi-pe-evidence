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

const PREVIEW_SOURCE: DiscoverDataSource = {
  mode: 'preview',
  cityId: 7,
  revisionId: 42,
  citySlug: 'udupi',
};

function previewWrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(DiscoverDataSourceProvider, { value: PREVIEW_SOURCE, children });
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

  // Issue #2171 — the backend now honors ?propertyType on the preview /areas
  // endpoint (real per-area Agri parcel counts). discoverPath must forward it
  // instead of silently discarding the query string in preview mode.
  it('preview mode appends ?propertyType=agricultural_land to the /areas path when set', () => {
    expect(
      discoverPath(PREVIEW_SOURCE, livePath, { kind: 'areas', propertyType: 'agricultural_land' }),
    ).toBe('/api/admin/city-launch/cities/7/revisions/42/preview/areas?propertyType=agricultural_land');
  });

  it('preview mode appends both propertyType and purpose to the /areas path when both are set', () => {
    expect(
      discoverPath(PREVIEW_SOURCE, livePath, {
        kind: 'areas',
        propertyType: 'agricultural_land',
        purpose: 'sale',
      }),
    ).toBe(
      '/api/admin/city-launch/cities/7/revisions/42/preview/areas?propertyType=agricultural_land&purpose=sale',
    );
  });

  it('preview mode /areas path is unchanged when propertyType/purpose are omitted (existing callers)', () => {
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

  // Issue #1955 (Areas PR A) — the 4 navigation hierarchy kinds resolve to
  // the REVISION base (no `/preview` segment), unlike every kind above.
  it('preview mode returns .../navigation/tree, NOT under /preview', () => {
    expect(discoverPath(PREVIEW_SOURCE, livePath, { kind: 'navigationTree' })).toBe(
      '/api/admin/city-launch/cities/7/revisions/42/navigation/tree',
    );
  });

  it('preview mode returns .../navigation/diff?against=BASE', () => {
    expect(
      discoverPath(PREVIEW_SOURCE, livePath, { kind: 'navigationDiff', against: 'BASE' }),
    ).toBe('/api/admin/city-launch/cities/7/revisions/42/navigation/diff?against=BASE');
  });

  it('preview mode returns .../navigation/diff?against=PREVIOUS_REVISION', () => {
    expect(
      discoverPath(PREVIEW_SOURCE, livePath, { kind: 'navigationDiff', against: 'PREVIOUS_REVISION' }),
    ).toBe('/api/admin/city-launch/cities/7/revisions/42/navigation/diff?against=PREVIOUS_REVISION');
  });

  it('preview mode returns .../navigation/overrides', () => {
    expect(discoverPath(PREVIEW_SOURCE, livePath, { kind: 'navigationOverrides' })).toBe(
      '/api/admin/city-launch/cities/7/revisions/42/navigation/overrides',
    );
  });

  it('preview mode returns .../navigation/overrides/{overrideId}', () => {
    expect(
      discoverPath(PREVIEW_SOURCE, livePath, { kind: 'navigationOverrideDelete', overrideId: 9 }),
    ).toBe('/api/admin/city-launch/cities/7/revisions/42/navigation/overrides/9');
  });

  it('live mode returns livePath unchanged for the navigation kinds too', () => {
    expect(discoverPath({ mode: 'live' }, livePath, { kind: 'navigationTree' })).toBe(livePath);
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
