import { describe, it, expect } from 'vitest';
import { getDiscoverRoute, getTrendsRoute, getSavedRoute } from '../navUtils';

describe('navUtils — selected-city route resolution (Issue #1646)', () => {
  it('resolves canonical journey routes for Udupi deployment', () => {
    expect(getDiscoverRoute('udupi', 'area-first')).toBe(
      '/discover?city=udupi&lat=13.34090&lon=74.74210&zoom=11&journey=area-first'
    );
    expect(getDiscoverRoute('udupi', 'school-first')).toBe(
      '/discover?city=udupi&lat=13.34090&lon=74.74210&zoom=11&journey=school-first'
    );
    expect(getDiscoverRoute('udupi', 'agri-first')).toBe(
      '/discover?city=udupi&lat=13.34090&lon=74.74210&zoom=11&journey=agri-first'
    );
  });

  it('defaults to Udupi when city is null, undefined, or unsupported', () => {
    expect(getDiscoverRoute(null)).toBe('/discover?city=udupi');
    expect(getDiscoverRoute(undefined)).toBe('/discover?city=udupi');
    expect(getDiscoverRoute('unknown-city')).toBe('/discover?city=udupi');
  });

  it('resolves city-aware Trends URL', () => {
    expect(getTrendsRoute('udupi')).toBe('/trends?city=udupi');
    expect(getTrendsRoute('mangalore')).toBe('/trends?city=mangalore');
    expect(getTrendsRoute(null)).toBe('/trends?city=udupi');
  });

  it('resolves Saved URL based on auth status', () => {
    expect(getSavedRoute(true)).toBe('/saved-areas');
    expect(getSavedRoute(false)).toBe('/auth?returnTo=%2Fsaved-areas');
  });
});
