import { PropertyFilters } from '@/hooks/usePropertyListings';
import { shouldSubmitBedrooms } from '@/features/discover/filters/bedroomApplicability';
import { resolveEffectiveQueryFilters } from '@/features/discover/selectors/effectiveDiscoverContext';

export interface DiscoverSearchParamsOptions {
  city: string;
  filters: PropertyFilters;
  page?: number;
  size?: number;
  includeAggregates?: boolean;
  snapped?: [number, number, number, number] | null;
  sortedAreaKeys?: string[] | null;
  trimmedQ?: string | null;
  listingPurpose?: string | null;
  excludePropertyType?: string | null;
  nodeKey?: string | null;
  /**
   * Issue #2016 — opaque scope+filters+listingPurpose identity (see
   * computeScopeFingerprint). The server echoes it back unchanged so a
   * response answering a since-superseded scope can be identified.
   */
  scopeFingerprint?: string | null;
  /**
   * Issue #2016 — committed VIEWPORT scope bounds, distinct from the
   * always-on `bbox` render-prefilter (which stays untouched and is sent
   * independently). Only present when VIEWPORT is the COMMITTED result
   * scope — never populated by ordinary camera pan/zoom.
   */
  viewportScope?: { s: number; w: number; n: number; e: number } | null;
}

/**
 * Unifies search parameter serialization logic for discover listings and marker hooks.
 * Preserve existing endpoint paths, enabled guards, bbox snapping, cache behaviour, and API behaviour.
 */
export function buildDiscoverSearchParams({
  city,
  filters,
  page,
  size,
  includeAggregates,
  snapped,
  sortedAreaKeys,
  trimmedQ,
  listingPurpose,
  excludePropertyType,
  nodeKey,
  scopeFingerprint,
  viewportScope,
}: DiscoverSearchParamsOptions): URLSearchParams {
  const params = new URLSearchParams();
  params.set('city', city);

  const effectiveFilters = resolveEffectiveQueryFilters(filters);

  if (page !== undefined && page !== null) {
    params.set('page', String(page));
  }
  if (size !== undefined && size !== null) {
    params.set('size', String(size));
  }
  if (includeAggregates) {
    params.set('includeAggregates', 'true');
  }

  if (snapped) {
    const [s, w, n, e] = snapped;
    params.set('bbox', `${s},${w},${n},${e}`);
  }

  if (sortedAreaKeys !== null && sortedAreaKeys !== undefined) {
    sortedAreaKeys.forEach((k) => params.append('areaKeys', k));
  }
  
  if (nodeKey) {
    params.set('nodeKey', nodeKey);
  }

  effectiveFilters.propertyTypes?.forEach((t) => params.append('propertyTypes', t));
  // Issue #2431 — Commercial subtype. Emitted here, in the ONE builder both the listings hook and
  // the markers hook call, which is what makes cards and map markers ask the server the same
  // question. Adding it at either hook instead would let the two drift.
  effectiveFilters.commercialSubtypes?.forEach((s) => params.append('commercialSubtypes', s));
  effectiveFilters.localities?.forEach((l) => params.append('localities', l));

  if (effectiveFilters.priceMin != null) {
    params.set('priceMin', String(effectiveFilters.priceMin));
  }
  if (effectiveFilters.priceMax != null) {
    params.set('priceMax', String(effectiveFilters.priceMax));
  }


  // Issue #2459 — contextual square-foot bounds. Emitted here, in the ONE builder both the
  // listings hook and the markers hook call, for the same reason `commercialSubtypes` is: the two
  // endpoints share a single server-side validator (`AreaBoundsParam.validate`) and so cannot
  // accept different ranges. Emitting at either hook instead would let cards and markers drift.
  // Always SQUARE FEET — the per-row column the server compares against varies, the unit does not.
  if (effectiveFilters.areaMinSqft != null) {
    params.set('areaMinSqft', String(effectiveFilters.areaMinSqft));
  }
  if (effectiveFilters.areaMaxSqft != null) {
    params.set('areaMaxSqft', String(effectiveFilters.areaMaxSqft));
  }

  // dateFrom/dateTo: PropertyFilters may hold Date objects — always serialise to ISO string
  if (effectiveFilters.dateFrom != null) {
    params.set(
      'dateFrom',
      effectiveFilters.dateFrom instanceof Date ? effectiveFilters.dateFrom.toISOString() : String(effectiveFilters.dateFrom)
    );
  }
  if (effectiveFilters.dateTo != null) {
    params.set(
      'dateTo',
      effectiveFilters.dateTo instanceof Date ? effectiveFilters.dateTo.toISOString() : String(effectiveFilters.dateTo)
    );
  }

  // Issue #2459 AC2 — a plot-only OR commercial-only selection submits NO bedroom predicate
  // (BOTH sentences of the rule; see bedroomApplicability.ts). Suppressed here, in the ONE builder
  // both `/api/discover/listings` and `/api/discover/markers` call, so cards and map markers
  // cannot disagree about whether a bedroom constraint was applied. Nothing is mutated:
  // `filters.bedrooms` is left intact for the moment the buyer returns to a dwelling type.
  if (effectiveFilters.bedrooms != null && shouldSubmitBedrooms(effectiveFilters)) {
    effectiveFilters.bedrooms.forEach((b) => params.append('bedrooms', String(b)));
  }

  effectiveFilters.sellerTypes?.forEach((st) => params.append('sellerTypes', st));

  if (effectiveFilters.backOnMarket) {
    params.set('backOnMarket', 'true');
  }
  if (effectiveFilters.newToMarket) {
    params.set('newToMarket', 'true');
  }
  if (effectiveFilters.reraRegistered) {
    params.set('reraRegistered', 'true');
  }
  if (effectiveFilters.readyToMove) {
    params.set('readyToMove', 'true');
  }

  if (effectiveFilters.polygon) {
    params.set('polygon', JSON.stringify(effectiveFilters.polygon));
  }

  if (effectiveFilters.schoolLat != null) {
    params.set('schoolLat', String(effectiveFilters.schoolLat));
  }
  if (effectiveFilters.schoolLon != null) {
    params.set('schoolLon', String(effectiveFilters.schoolLon));
  }
  if (effectiveFilters.schoolRadiusKm != null) {
    params.set('schoolRadiusKm', String(effectiveFilters.schoolRadiusKm));
  }

  if (trimmedQ) {
    params.set('q', trimmedQ);
  }
  if (listingPurpose) {
    params.set('listingPurpose', listingPurpose);
  }
  if (excludePropertyType) {
    params.set('excludePropertyType', excludePropertyType);
  }
  if (scopeFingerprint) {
    params.set('scopeFingerprint', scopeFingerprint);
  }
  if (viewportScope) {
    params.set('viewportScope', `${viewportScope.s},${viewportScope.w},${viewportScope.n},${viewportScope.e}`);
  }

  return params;
}
