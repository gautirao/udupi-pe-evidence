/**
 * scope-aware markersEnabled gate — Issue #1882 (Track A PR2 Slice S3).
 *
 * markersEnabled = (scope.kind === 'group' || scope.kind === 'area') &&
 * zoomPolicy.shouldShowMarkers(zoom). City/region scopes stay aggregated
 * (never fetch raw city-wide listing markers, regardless of zoom); only
 * group/area scopes fetch individual markers, and only once zoomed in past
 * the area-overview band.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveDiscoverScopeKind,
  deriveScopeAwareMarkersEnabled,
  type DiscoverScopeKind,
} from '../useDiscoverMapData';

describe('deriveDiscoverScopeKind', () => {
  it("resolves to 'area' once an areaKey is set, regardless of groupId/scope", () => {
    expect(deriveDiscoverScopeKind({ areaKey: 'IN|KA|Bengaluru|Hebbal', groupId: 'g1', scope: 'north' })).toBe('area');
    expect(deriveDiscoverScopeKind({ areaKey: 'IN|KA|Bengaluru|Hebbal' })).toBe('area');
  });

  it("resolves to 'group' once groupId is set and no areaKey", () => {
    expect(deriveDiscoverScopeKind({ groupId: 'university-belt', scope: 'north' })).toBe('group');
    expect(deriveDiscoverScopeKind({ groupId: 'university-belt' })).toBe('group');
  });

  it("resolves to 'region' once scope is set and no groupId/areaKey", () => {
    expect(deriveDiscoverScopeKind({ scope: 'north' })).toBe('region');
  });

  it("resolves to 'city' when nothing is set", () => {
    expect(deriveDiscoverScopeKind({})).toBe('city');
    expect(deriveDiscoverScopeKind({ areaKey: null, groupId: null, scope: null })).toBe('city');
  });
});

describe('deriveScopeAwareMarkersEnabled', () => {
  const ZOOM_BELOW_BAND = 11;
  const ZOOM_AT_BAND = 12;
  const ZOOM_ABOVE_BAND = 13;

  const scopes: DiscoverScopeKind[] = ['city', 'region', 'group', 'area'];
  const zooms = [ZOOM_BELOW_BAND, ZOOM_AT_BAND, ZOOM_ABOVE_BAND];

  it('city scope is NEVER marker-enabled at any zoom (stays aggregated)', () => {
    for (const zoom of zooms) {
      expect(deriveScopeAwareMarkersEnabled('city', zoom)).toBe(false);
    }
  });

  it('region scope is NEVER marker-enabled at any zoom (shows next hierarchy level, not raw markers)', () => {
    for (const zoom of zooms) {
      expect(deriveScopeAwareMarkersEnabled('region', zoom)).toBe(false);
    }
  });

  it('group scope is marker-enabled only once zoomed in past the area-overview band', () => {
    expect(deriveScopeAwareMarkersEnabled('group', ZOOM_BELOW_BAND)).toBe(false);
    expect(deriveScopeAwareMarkersEnabled('group', ZOOM_AT_BAND)).toBe(false);
    expect(deriveScopeAwareMarkersEnabled('group', ZOOM_ABOVE_BAND)).toBe(true);
  });

  it('area scope is marker-enabled only once zoomed in past the area-overview band', () => {
    expect(deriveScopeAwareMarkersEnabled('area', ZOOM_BELOW_BAND)).toBe(false);
    expect(deriveScopeAwareMarkersEnabled('area', ZOOM_AT_BAND)).toBe(false);
    expect(deriveScopeAwareMarkersEnabled('area', ZOOM_ABOVE_BAND)).toBe(true);
  });

  it('full city/region/group/area x zoom matrix matches the documented contract', () => {
    const expected: Record<DiscoverScopeKind, Record<number, boolean>> = {
      city: { [ZOOM_BELOW_BAND]: false, [ZOOM_AT_BAND]: false, [ZOOM_ABOVE_BAND]: false },
      region: { [ZOOM_BELOW_BAND]: false, [ZOOM_AT_BAND]: false, [ZOOM_ABOVE_BAND]: false },
      group: { [ZOOM_BELOW_BAND]: false, [ZOOM_AT_BAND]: false, [ZOOM_ABOVE_BAND]: true },
      area: { [ZOOM_BELOW_BAND]: false, [ZOOM_AT_BAND]: false, [ZOOM_ABOVE_BAND]: true },
    };
    for (const scope of scopes) {
      for (const zoom of zooms) {
        expect(deriveScopeAwareMarkersEnabled(scope, zoom)).toBe(expected[scope][zoom]);
      }
    }
  });
});
