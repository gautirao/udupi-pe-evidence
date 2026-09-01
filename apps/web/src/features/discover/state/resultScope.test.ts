import { describe, it, expect } from 'vitest';
import {
  computeScopeFingerprint,
  resultScopeToMarkerScope,
  type ResultScope,
} from './resultScope';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

const BASE_FILTERS: PropertyFilters = { propertyTypes: ['house'], priceMin: 1_000_000 };

describe('computeScopeFingerprint', () => {
  it('is_stable_for_identical_inputs', () => {
    const scope: ResultScope = { kind: 'AREA_SET', areaKeys: ['hebbal', 'jakkur'] };
    const a = computeScopeFingerprint(scope, BASE_FILTERS, 'sale');
    const b = computeScopeFingerprint({ kind: 'AREA_SET', areaKeys: ['hebbal', 'jakkur'] }, { ...BASE_FILTERS }, 'sale');
    expect(a).toBe(b);
  });

  it('is_order_independent_for_area_keys', () => {
    const a = computeScopeFingerprint({ kind: 'AREA_SET', areaKeys: ['jakkur', 'hebbal'] }, BASE_FILTERS, 'sale');
    const b = computeScopeFingerprint({ kind: 'AREA_SET', areaKeys: ['hebbal', 'jakkur'] }, BASE_FILTERS, 'sale');
    expect(a).toBe(b);
  });

  it('differs_for_different_area_sets', () => {
    const a = computeScopeFingerprint({ kind: 'AREA_SET', areaKeys: ['hebbal'] }, BASE_FILTERS, 'sale');
    const b = computeScopeFingerprint({ kind: 'AREA_SET', areaKeys: ['nagawara'] }, BASE_FILTERS, 'sale');
    expect(a).not.toBe(b);
  });

  it('differs_for_different_filters', () => {
    const scope: ResultScope = { kind: 'AREA_SET', areaKeys: ['hebbal'] };
    const a = computeScopeFingerprint(scope, BASE_FILTERS, 'sale');
    const b = computeScopeFingerprint(scope, { ...BASE_FILTERS, priceMin: 2_000_000 }, 'sale');
    expect(a).not.toBe(b);
  });

  it('differs_for_different_listing_purpose', () => {
    const scope: ResultScope = { kind: 'AREA_SET', areaKeys: ['hebbal'] };
    const a = computeScopeFingerprint(scope, BASE_FILTERS, 'sale');
    const b = computeScopeFingerprint(scope, BASE_FILTERS, 'rent');
    expect(a).not.toBe(b);
  });

  it('differs_across_scope_kinds_for_otherwise_identical_filters', () => {
    const coordinates: [number, number][] = [[12.9, 77.5], [12.95, 77.55], [12.9, 77.6]];
    const areaSet = computeScopeFingerprint({ kind: 'AREA_SET', areaKeys: ['hebbal'] }, BASE_FILTERS, 'sale');
    const polygon = computeScopeFingerprint({ kind: 'POLYGON', coordinates }, BASE_FILTERS, 'sale');
    const viewport = computeScopeFingerprint(
      { kind: 'VIEWPORT', bounds: { s: 12.9, w: 77.5, n: 13.0, e: 77.6 } },
      BASE_FILTERS,
      'sale',
    );
    const none = computeScopeFingerprint(null, BASE_FILTERS, 'sale');

    const all = [areaSet, polygon, viewport, none];
    expect(new Set(all).size).toBe(all.length);
  });

  it('ignores_a_legacy_bridge_polygon_field_on_filters', () => {
    // filters.polygon is a derived read-only projection of the committed
    // scope (see useDiscoverPageState.ts) — it must never make two
    // otherwise-identical requests fingerprint differently.
    const scope: ResultScope = { kind: 'AREA_SET', areaKeys: ['hebbal'] };
    const a = computeScopeFingerprint(scope, BASE_FILTERS, 'sale');
    const b = computeScopeFingerprint(scope, { ...BASE_FILTERS, polygon: [[1, 2], [3, 4], [5, 6]] }, 'sale');
    expect(a).toBe(b);
  });
});

describe('resultScopeToMarkerScope', () => {
  it('maps_AREA_SET_to_the_areas_marker_scope_shape', () => {
    expect(resultScopeToMarkerScope({ kind: 'AREA_SET', areaKeys: ['hebbal', 'jakkur'] })).toEqual({
      kind: 'areas',
      areaKeys: ['hebbal', 'jakkur'],
    });
  });

  it('returns_null_for_POLYGON', () => {
    expect(resultScopeToMarkerScope({ kind: 'POLYGON', coordinates: [[1, 2], [3, 4], [5, 6]] })).toBeNull();
  });

  it('returns_null_for_VIEWPORT', () => {
    expect(
      resultScopeToMarkerScope({ kind: 'VIEWPORT', bounds: { s: 1, w: 2, n: 3, e: 4 } }),
    ).toBeNull();
  });

  it('returns_null_for_null', () => {
    expect(resultScopeToMarkerScope(null)).toBeNull();
  });
});
