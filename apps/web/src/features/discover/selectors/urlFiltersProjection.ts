/**
 * Issue #2528 — the ONE URL-filters -> PropertyFilters projection.
 *
 * ## Why this module exists
 *
 * This mapping was written out twice, field for field, in two places that
 * disagreed about WHEN it ran:
 *
 *   - `hooks/useDiscoverPageState.ts` — in a `useState` lazy initializer, so it
 *     ran exactly once, at mount. Its output feeds the visible filter controls
 *     AND (via `useDiscoverMapDataController` -> `useDiscoverMapData`) the main
 *     listings/markers request predicate.
 *   - `features/discover/controllers/useDiscoverPageContext.ts` — in a `useMemo`
 *     over `nav.filters`, so it re-derived LIVE. Its output feeds the
 *     group-results and bounded-browse query paths.
 *
 * Two copies of one rule, one of them frozen at mount, is why a history
 * traversal left the page self-contradictory: the group-results path followed
 * the URL while the main path and every visible control stayed on the pre-POP
 * value. Both call sites now read THIS function, so the axis list cannot drift
 * again — adding a filter axis in one place and forgetting the other is no
 * longer expressible.
 *
 * ## Ownership
 *
 * The URL owns committed filter state for every axis it can express. Local
 * `PropertyFilters` state in `useDiscoverPageState` owns only what the URL
 * cannot express: `schoolLat`/`schoolLon`/`schoolRadiusKm` (written by the
 * school journey), `polygon` (a derived projection of the committed
 * `ResultScope`), and `localities` (a legacy field, only ever cleared). Those
 * are left untouched by {@link mergeUrlFiltersIntoLocal}.
 *
 * This is deliberately NOT a bidirectional binding. There is exactly one writer
 * in each direction: URL -> local via the sync in `useDiscoverPageState`, and
 * local -> URL only on an explicit user commit through `handleFiltersChange`.
 * The merge returns the PREVIOUS object unchanged whenever the URL-owned axes
 * already agree, so the round trip terminates on the first pass instead of
 * ping-ponging between two owners.
 */
import { shouldSubmitBedrooms } from '@/features/discover/filters/bedroomApplicability';
import type { DiscoverUrlFilters } from '@/hooks/useDiscoverUrlState';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

/**
 * The axes the URL owns. Anything not listed here is local-only state that a URL
 * sync must never overwrite — see this module's "Ownership" note.
 */
export const URL_OWNED_FILTER_AXES = [
  'propertyTypes',
  'commercialSubtypes',
  'bedrooms',
  'priceMin',
  'priceMax',
  'areaMinSqft',
  'areaMaxSqft',
  'sellerTypes',
  'boardFilters',
  'categoryFilters',
  'backOnMarket',
  'newToMarket',
  'reraRegistered',
  'readyToMove',
  'dateFrom',
  'dateTo',
] as const satisfies readonly (keyof PropertyFilters)[];

/**
 * Map the URL's filter params onto the `PropertyFilters` shape the controls and
 * the query both read. Pure; no local state is consulted.
 *
 * `dateFrom`/`dateTo` are ISO `YYYY-MM-DD` strings in URL state and `Date`s in
 * `PropertyFilters`, so they are converted here — the one non-identity mapping.
 */
export function projectUrlFilters(f: DiscoverUrlFilters): PropertyFilters {
  return {
    propertyTypes: f.propertyTypes as PropertyFilters['propertyTypes'],
    // Issue #2431 / #2531 — carried so a shared ?type=commercial&subtype=SHOP link
    // opens with the Shop box ticked AND reaches the wire. The URL domain has
    // already allowlisted these values, so the cast cannot widen the union.
    commercialSubtypes: f.commercialSubtypes as PropertyFilters['commercialSubtypes'],
    bedrooms: f.bedrooms,
    priceMin: f.priceMin,
    priceMax: f.priceMax,
    // Issue #2459 — the area bound must travel with the URL, or a reload or a Back
    // step silently drops the predicate while the results stay on screen.
    areaMinSqft: f.areaMinSqft,
    areaMaxSqft: f.areaMaxSqft,
    sellerTypes: f.sellerTypes,
    // Issue #1132 — board/category drive the school-journey context chips.
    boardFilters: f.boardFilters,
    categoryFilters: f.categoryFilters,
    backOnMarket: f.backOnMarket,
    newToMarket: f.newToMarket,
    reraRegistered: f.reraRegistered,
    readyToMove: f.readyToMove,
    dateFrom: f.dateFrom ? new Date(f.dateFrom) : undefined,
    dateTo: f.dateTo ? new Date(f.dateTo) : undefined,
  };
}

function sameArray(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return sameArray(a as unknown[] | undefined, b as unknown[] | undefined);
  }
  if (a instanceof Date || b instanceof Date) {
    if (!(a instanceof Date) || !(b instanceof Date)) return false;
    return a.getTime() === b.getTime();
  }
  return a === b;
}

/**
 * The bedroom axis is the ONE place where an absent URL param is not an
 * assertion that the buyer cleared the value.
 *
 * `serializeFilters` deletes `beds=` whenever {@link shouldSubmitBedrooms} is
 * false — a plot-only or commercial-only selection — because a bedroom bound on
 * those shapes is a search that can only ever return nothing. The value is
 * deliberately KEPT in `useDiscoverPageState`'s React state so switching back to
 * a dwelling re-offers it with no restore machinery
 * (`features/discover/filters/bedroomApplicability.ts` states this explicitly).
 *
 * So a sync that took the URL literally here would delete the remembered
 * bedrooms the moment the buyer picked Commercial, breaking #2459 AC2. The URL
 * is still the only owner: whether its silence means "cleared" or "suppressed"
 * is itself a total function of the SAME URL state (`type=`/`subtype=`), which
 * is what this reads.
 */
function resolveSyncedBedrooms(
  prev: PropertyFilters,
  projected: PropertyFilters,
): PropertyFilters['bedrooms'] {
  if (projected.bedrooms != null) return projected.bedrooms;
  return shouldSubmitBedrooms(projected) ? undefined : prev.bedrooms;
}

/**
 * Apply the URL-owned axes on top of the current local filters.
 *
 * Returns `prev` UNCHANGED (same object identity) when every URL-owned axis
 * already agrees. That is load-bearing twice over: `filters` is a dependency of
 * the page-reset effect in `useDiscoverPageState`, so a fresh object every
 * render would reset pagination continuously; and the sync effect writes through
 * `setFilters`, so returning `prev` is what lets React bail out instead of
 * scheduling another render.
 *
 * Value equality (not identity) is required because the URL domain re-parses
 * `type=`/`beds=`/`seller=` into BRAND-NEW arrays on every render, so an
 * identity check would report "changed" forever.
 */
export function mergeUrlFiltersIntoLocal(
  prev: PropertyFilters,
  projected: PropertyFilters,
): PropertyFilters {
  const bedrooms = resolveSyncedBedrooms(prev, projected);

  const unchanged = URL_OWNED_FILTER_AXES.every((axis) =>
    axis === 'bedrooms'
      ? sameValue(prev.bedrooms, bedrooms)
      : sameValue(prev[axis], projected[axis]),
  );
  if (unchanged) return prev;

  return { ...prev, ...projected, bedrooms };
}

/**
 * A stable, cheap key for the URL-owned axes, used as the sync effect's trigger.
 *
 * Keys the effect on VALUES rather than on `nav.filters`' object identity, which
 * changes on every render. Order is fixed by {@link URL_OWNED_FILTER_AXES}, so
 * the string is deterministic for a given URL.
 */
export function urlFilterSignature(projected: PropertyFilters): string {
  return JSON.stringify(
    URL_OWNED_FILTER_AXES.map((axis) => {
      const v = projected[axis];
      return v instanceof Date ? v.getTime() : (v ?? null);
    }),
  );
}
