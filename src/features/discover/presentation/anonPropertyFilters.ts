import type { SchoolRadiusListingItem } from '@/hooks/useSchoolRadiusListings';
import { clampSchoolRadiusKm, PropertyListing, PropertyImage, PropertyFilters } from '@/hooks/usePropertyListings';
import { cityListingToPropertyListing } from '@/lib/discoverMappers';

// ── Anon client-side PropertyFilter parity (Issue #1261, DECISION-1) ──────────
//
// The public /school-radius-listings endpoint takes NO property-filter params, so
// when an anon user has active PropertyFilters we must apply them client-side over
// the endpoint content to match the auth path's filtered result.
//
// Only filters whose backing field is present in the 20-field anon contract are
// honoured:
//   propertyTypes → propertyType        bedrooms → bedrooms (4 = "4 or more")
//   priceMin/Max  → pricePaise (rupees) dateFrom/To → createdAt
//   backOnMarket  → backOnMarket        newToMarket → daysOnMarket (1..7)
//   readyToMove   → possessionStatus
//
// reraRegistered and sellerTypes are intentionally NOT applied — they rely on
// reraNumber / sellerType which the server EXCLUDES from the anon payload (AC6).
// Pure + exported so it can be unit-tested without mounting the page.
export function applyAnonPropertyFilters(
  listings: SchoolRadiusListingItem[],
  filters: {
    propertyTypes?: string[];
    bedrooms?: number[];
    priceMin?: number;
    priceMax?: number;
    dateFrom?: Date | null;
    dateTo?: Date | null;
    backOnMarket?: boolean;
    newToMarket?: boolean;
    readyToMove?: boolean;
  },
): SchoolRadiusListingItem[] {
  let result = listings;

  if (filters.propertyTypes && filters.propertyTypes.length > 0) {
    const wanted = new Set(filters.propertyTypes.map((t) => t.toLowerCase()));
    result = result.filter((l) => l.propertyType != null && wanted.has(l.propertyType.toLowerCase()));
  }

  if (filters.bedrooms && filters.bedrooms.length > 0) {
    const has4Plus = filters.bedrooms.includes(4);
    const exact = new Set(filters.bedrooms.filter((b) => b < 4));
    result = result.filter((l) => {
      if (l.bedrooms == null) return false;
      if (has4Plus && l.bedrooms >= 4) return true;
      return exact.has(l.bedrooms);
    });
  }

  // pricePaise is in paise; filters.priceMin/Max are in rupees (×100).
  if (filters.priceMin != null) {
    const minPaise = filters.priceMin * 100;
    result = result.filter((l) => l.pricePaise != null && l.pricePaise >= minPaise);
  }
  if (filters.priceMax != null) {
    const maxPaise = filters.priceMax * 100;
    result = result.filter((l) => l.pricePaise != null && l.pricePaise <= maxPaise);
  }

  if (filters.dateFrom) {
    const fromMs = filters.dateFrom.getTime();
    result = result.filter((l) => {
      if (!l.createdAt) return false;
      const t = new Date(l.createdAt).getTime();
      return Number.isFinite(t) && t >= fromMs;
    });
  }
  if (filters.dateTo) {
    const toMs = filters.dateTo.getTime();
    result = result.filter((l) => {
      if (!l.createdAt) return false;
      const t = new Date(l.createdAt).getTime();
      return Number.isFinite(t) && t <= toMs;
    });
  }

  if (filters.backOnMarket) {
    result = result.filter((l) => l.backOnMarket === true);
  }
  if (filters.newToMarket) {
    result = result.filter(
      (l) => typeof l.daysOnMarket === 'number' && l.daysOnMarket > 0 && l.daysOnMarket <= 7,
    );
  }
  if (filters.readyToMove) {
    result = result.filter((l) => l.possessionStatus === 'ready_to_move');
  }

  return result;
}

/**
 * Issue #2183 — the 'area-school-combined' panel state (derivePanelContent:
 * areaKey + schoolId both present, which is the DEFAULT shape of a school-first
 * selection since handleSchoolSelect always writes the picked school's own
 * areaKey to the URL as breadcrumb context) scopes the AUTHENTICATED path's
 * badge/panel count to the intersection of the selected area's bounding box AND
 * the school radius — see useDiscoverMapDataController.ts's `effectiveFilters`
 * AC4 comment, which injects that same bbox as a `polygon` param on the
 * authenticated /api/discover/listings request.
 *
 * schoolRadiusListings (this file's other helpers) comes from the PUBLIC
 * /school-radius-listings endpoint, which has no polygon/area param, so before
 * this fix the anon panel count and the map's pre-CTA fallback markers
 * (schoolRadiusFallbackMarkers, active for anon AND for authenticated users
 * before the bounded-search CTA) ignored the area bound entirely — showing
 * homes outside the area the authenticated badge/panel had already excluded,
 * and disagreeing with the panel's own "N homes" count (#2183).
 *
 * Applying the SAME rectangle bound client-side keeps every surface
 * consistent: the polygon injected server-side for the authenticated path IS
 * literally the area's bbox rectangle (not a precise area shape), so a
 * rectangle bounds check here is an exact equivalent, not an approximation.
 * No-op (returns `listings` unchanged) when `bbox` is null — i.e. pure
 * school-first with no area context, unchanged from prior behaviour.
 */
export function filterSchoolRadiusListingsByAreaBbox<
  T extends { lat?: number | null; lon?: number | null },
>(
  listings: T[],
  bbox: [[number, number], [number, number]] | null | undefined,
): T[] {
  if (!bbox) return listings;
  const [[south, west], [north, east]] = bbox;
  return listings.filter(
    (l) => l.lat != null && l.lon != null && l.lat >= south && l.lat <= north && l.lon >= west && l.lon <= east,
  );
}

/**
 * Issue #1261 rev2 (AC11) — derive Leaflet-pin shape from the anon school-radius
 * listings already fetched + filtered for the right panel. Mirrors the
 * `areaMarkerListings` recipe in useDiscoverMapData.ts: filter null coordinates,
 * normalise lat/lon, then reuse `cityListingToPropertyListing` so the resulting
 * shape, popup content, and clustering pipeline are byte-identical to the existing
 * anon area-marker pins. Pure function — exported for unit-test parity.
 *
 * Caller MUST pass the post-applyAnonPropertyFilters set (DECISION-1 parity) so the
 * map and right panel reflect the same filtered universe. Empty input → empty output
 * (preserves the #1118 area-fallback's role for the "no radius hits yet" case).
 *
 * ANON-SAFE: consumes only fields from the 20-field public contract carried on
 * SchoolRadiusListingItem (id/propertyType/title/locality/pricePaise/primaryImageUrl/
 * listingPurpose/bedrooms/builtArea/landArea + units/createdAt/lat/lon). Does NOT read or rely
 * on trustTier/reraNumber/reraValid/sellerType/status/updatedAt/lastUpdatedAt/
 * firstPublishedAt — those are excluded server-side and never reach this helper.
 */
export function deriveAnonSchoolRadiusMarkers(
  listings: SchoolRadiusListingItem[],
): (PropertyListing & { images?: PropertyImage[] })[] {
  if (listings.length === 0) return [];
  const now = new Date().toISOString();
  return listings
    .filter((l) => l.lat != null && l.lon != null)
    .map((l) =>
      cityListingToPropertyListing(
        { ...l, lat: l.lat as number, lon: l.lon as number },
        now,
      ),
    );
}

/**
 * Issue #1261 delta (FINDING 1) — true when any client-side PropertyFilter that
 * applyAnonPropertyFilters can SHRINK the result by is active.
 *
 * The "showing first N" hint (school-radius-more-hint) gates visibility on the
 * server's UNFILTERED size+1 probe (`hasMore`) but displays the POST-filter count
 * (`schoolListings.length`). When a property filter is active those extra unseen
 * server rows may not match the filter, so the hint would dishonestly imply that
 * more *matching* homes exist beyond the shown N. We suppress the hint in that case
 * (AC8 truthfulness): the displayed filtered set IS the complete match over the
 * fetched page, and the endpoint takes no filter params so there is no honest way to
 * promise more matching results. The radius-only (no property filter) case keeps the
 * accurate hint, since then the displayed count equals the unfiltered server page.
 *
 * Mirrors exactly the keys applyAnonPropertyFilters honours — schoolLat/schoolLon/
 * schoolRadiusKm are deliberately excluded (they define the radius, not a refinement).
 */
export function hasActiveAnonPropertyFilter(filters: {
  propertyTypes?: string[];
  bedrooms?: number[];
  priceMin?: number;
  priceMax?: number;
  dateFrom?: Date | string | null;
  dateTo?: Date | string | null;
  backOnMarket?: boolean;
  newToMarket?: boolean;
  readyToMove?: boolean;
}): boolean {
  return Boolean(
    (filters.propertyTypes && filters.propertyTypes.length > 0) ||
      (filters.bedrooms && filters.bedrooms.length > 0) ||
      filters.priceMin != null ||
      filters.priceMax != null ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.backOnMarket ||
      filters.newToMarket ||
      filters.readyToMove,
  );
}

/**
 * Issue #1457 — convert rupees (as stored in URL) to paise for comparison against pricePaise.
 *
 * Exported (unlike the original page-private helper) solely so MapDiscovery.tsx can import
 * it back for its L1037/1040 agri-price-filter call sites — it is intentionally NOT part of
 * the S9a re-export shim (no external importer references it; MapDiscovery.test.tsx exercises
 * it indirectly via applyAnonPropertyFilters, per its own R3 comment).
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
