import { PropertyFilters } from '@/hooks/usePropertyListings';

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
}: DiscoverSearchParamsOptions): URLSearchParams {
  const params = new URLSearchParams();
  params.set('city', city);

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

  filters.propertyTypes?.forEach((t) => params.append('propertyTypes', t));
  filters.localities?.forEach((l) => params.append('localities', l));

  if (filters.priceMin != null) {
    params.set('priceMin', String(filters.priceMin));
  }
  if (filters.priceMax != null) {
    params.set('priceMax', String(filters.priceMax));
  }

  // dateFrom/dateTo: PropertyFilters may hold Date objects — always serialise to ISO string
  if (filters.dateFrom != null) {
    params.set(
      'dateFrom',
      filters.dateFrom instanceof Date ? filters.dateFrom.toISOString() : String(filters.dateFrom)
    );
  }
  if (filters.dateTo != null) {
    params.set(
      'dateTo',
      filters.dateTo instanceof Date ? filters.dateTo.toISOString() : String(filters.dateTo)
    );
  }

  if (filters.bedrooms != null) {
    filters.bedrooms.forEach((b) => params.append('bedrooms', String(b)));
  }

  filters.sellerTypes?.forEach((st) => params.append('sellerTypes', st));

  if (filters.backOnMarket) {
    params.set('backOnMarket', 'true');
  }
  if (filters.newToMarket) {
    params.set('newToMarket', 'true');
  }
  if (filters.reraRegistered) {
    params.set('reraRegistered', 'true');
  }
  if (filters.readyToMove) {
    params.set('readyToMove', 'true');
  }

  if (filters.polygon) {
    params.set('polygon', JSON.stringify(filters.polygon));
  }

  if (filters.schoolLat != null) {
    params.set('schoolLat', String(filters.schoolLat));
  }
  if (filters.schoolLon != null) {
    params.set('schoolLon', String(filters.schoolLon));
  }
  if (filters.schoolRadiusKm != null) {
    params.set('schoolRadiusKm', String(filters.schoolRadiusKm));
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

  return params;
}
