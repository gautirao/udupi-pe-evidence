/**
 * Issue #2658 (C2) — pure extraction of AreaSelectedPanel's two independent
 * city-fallback chains, characterized and guarded in this issue's C0 phase
 * (see areaCityResolutionFourCallSites.c0.guard.test.ts and
 * AreaSelectedPanel.p1p11gaps.c2.test.tsx).
 *
 * These are two DIFFERENT chains for two different purposes — do not
 * conflate them:
 *
 * 1. `resolveAreasCity` — `city || nav.city || DEFAULT_CITY`. Feeds
 *    `useDiscoverAreas` and every `city={...}` prop that needs a REAL city
 *    slug the areas API can query. Uses `||` (not `??`) because a bare
 *    `/discover` URL leaves `nav.city === ''`, which `??` would not catch.
 *
 * 2. `resolveDisplayCityLabel` — `(cityLabel ?? city ?? '') || areaLabel`.
 *    Feeds display-only props (breadcrumb, StartOverButton) that want a
 *    human label, falling all the way to the area's own label rather than
 *    an empty string or a city slug.
 */
export const resolveAreasCity = (
  city: string | undefined,
  navCity: string,
  defaultCity: string,
): string => city || navCity || defaultCity;

export const resolveDisplayCityLabel = (
  cityLabel: string | undefined,
  city: string | undefined,
  areaLabel: string,
): string => (cityLabel ?? city ?? '') || areaLabel;
