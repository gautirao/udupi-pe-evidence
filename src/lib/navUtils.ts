import { CITY_CONFIG, DEFAULT_CITY } from './localityUtils';

export type PublicNavJourney = 'area-first' | 'school-first' | 'agri-first';

/**
 * Returns canonical Discover route URL with selected city coordinates and journey state.
 * Coordinates are formatted to 5 decimal places per useDiscoverUrlState contract.
 */
export function getDiscoverRoute(
  citySlug?: string | null,
  journey?: PublicNavJourney
): string {
  const slug = citySlug && CITY_CONFIG[citySlug] ? citySlug : DEFAULT_CITY;
  if (!journey) {
    return `/discover?city=${encodeURIComponent(slug)}`;
  }
  const cfg = CITY_CONFIG[slug];
  const lat = cfg.center[0].toFixed(5);
  const lon = cfg.center[1].toFixed(5);
  const zoom = cfg.zoom;

  const params = new URLSearchParams();
  params.set('city', slug);
  params.set('lat', lat);
  params.set('lon', lon);
  params.set('zoom', String(zoom));
  params.set('journey', journey);

  return `/discover?${params.toString()}`;
}

/**
 * Returns canonical Trends route URL for selected city.
 */
export function getTrendsRoute(citySlug?: string | null): string {
  const slug = citySlug && CITY_CONFIG[citySlug] ? citySlug : DEFAULT_CITY;
  return `/trends?city=${encodeURIComponent(slug)}`;
}

/**
 * Returns canonical Saved route URL based on auth status.
 */
export function getSavedRoute(isAuthenticated: boolean): string {
  if (isAuthenticated) {
    return '/saved-areas';
  }
  return `/auth?returnTo=${encodeURIComponent('/saved-areas')}`;
}
