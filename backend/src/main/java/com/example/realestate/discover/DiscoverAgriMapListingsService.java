package com.example.realestate.discover;

import com.example.realestate.geo.GeoCoarsener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Service for GET /api/discover/agri-map-listings.
 *
 * <p>Returns LIVE agricultural_land listings for a given city and set of area keys,
 * optionally filtered to a lat/lon bounding box. Boundary GeoJSON is included only
 * for listings that have a boundary polygon.
 *
 * <p>SQL-injection guard: all user-supplied values are bound as positional '?' parameters.
 * The areaKeys IN clause is constructed from the validated list (size-guarded to &le;50).
 */
@Service
public class DiscoverAgriMapListingsService {

    private static final Logger log = LoggerFactory.getLogger(DiscoverAgriMapListingsService.class);

    /** Maximum number of areaKeys allowed in one request to guard against unbounded IN clauses. */
    static final int MAX_AREA_KEYS = 50;

    /**
     * Maximum number of listings returned in a single response.
     * Requests matching more than this limit return the first N listings
     * with {@code truncated=true} and {@code limit=MAX_LISTINGS_PER_REQUEST}.
     * Uses LIMIT N+1 detection to avoid an expensive COUNT(*) subquery.
     */
    static final int MAX_LISTINGS_PER_REQUEST = 250;

    static final String BASE_SQL = """
            SELECT
                pl.id,
                pl.title,
                pl.area_key,
                pl.latitude,
                pl.longitude,
                pl.property_type,
                pl.locality,
                CASE WHEN pl.property_type = 'agricultural_land'
                     THEN ST_AsGeoJSON(pl.boundary)
                     END AS boundary_geo_json,
                pl.land_area,
                pl.land_area_unit,
                ROUND(ST_Area(pl.boundary)::numeric / 4046.8564224, 2) AS computed_area_acres,
                pl.price_paise,
                pl.listing_purpose,
                pl.water_source,
                pl.land_category,
                pl.farmhouse_available,
                pl.fencing_done,
                pl.road_access,
                pl.soil_type,
                pl.cultivation_status,
                pl.ownership_type,
                pl.updated_at
            FROM property_listings pl
            JOIN areas a ON a.area_key = pl.area_key
            JOIN cities c ON c.id = a.city_id
            WHERE c.slug = ?
              AND c.is_active = true
              AND LOWER(pl.property_type) = 'agricultural_land'
              AND pl.status = 'LIVE'
              AND pl.archived_at IS NULL
              AND pl.is_duplicate = false
            """;

    private static final String BBOX_CLAUSE = """
              AND pl.latitude  BETWEEN ? AND ?
              AND pl.longitude BETWEEN ? AND ?
            """;

    private final JdbcOperations jdbc;

    public DiscoverAgriMapListingsService(JdbcOperations jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Number of decimal places to which anonymous lat/lng is truncated (#1454).
     * 2 dp ≈ 1.1 km granularity — markers still render approximately but the exact
     * parcel coordinates never leave the server for anonymous callers.
     */
    static final int ANON_COORD_DECIMALS = 2;

    /**
     * Finds LIVE agricultural_land listings for the given city and area keys.
     *
     * <p>#1454 auth-aware gating: anonymous callers ({@code isAuthenticated == false})
     * receive NO {@code pricePaise} and COARSENED lat/lng (truncated to
     * {@value #ANON_COORD_DECIMALS} dp). Authenticated callers receive exact lat/lng and
     * pricePaise. The coarsening is a post-read projection — the SQL SELECT, WHERE clause,
     * and the {@code price_paise}/{@code latitude}/{@code longitude} columns are unchanged
     * (preserves #1452 + AC7).
     *
     * @param citySlug        city slug (e.g. "udupi") — must be non-blank
     * @param areaKeys        list of area keys to filter by — must be non-empty, max {@value #MAX_AREA_KEYS}
     * @param bbox            optional bounding box in format "minLat,minLon,maxLat,maxLon"
     * @param isAuthenticated true when the caller presented a valid (non-anonymous) JWT
     * @return response containing the city slug and matching listings
     * @throws ResponseStatusException HTTP 400 on validation failure
     */
    @Transactional(readOnly = true)
    public AgriMapListingsResponse findAgriMapListings(String citySlug,
                                                       List<String> areaKeys,
                                                       Optional<String> bbox,
                                                       boolean isAuthenticated,
                                                       String listingPurpose) {
        // Validate city
        if (citySlug == null || citySlug.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "city_must_not_be_blank");
        }

        // Validate areaKeys: non-empty and within size limit
        if (areaKeys == null || areaKeys.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "area_keys_must_not_be_empty");
        }
        if (areaKeys.size() > MAX_AREA_KEYS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "area_keys_exceeds_maximum_of_" + MAX_AREA_KEYS);
        }

        // Parse bbox if present — reuse BboxParser for consistent validation contract
        DiscoverListingPredicateBuilder.Bbox parsedBbox = bbox.isPresent()
                ? BboxParser.parse(bbox.get())
                : null;

        // Normalise listingPurpose: blank → absent (no filter)
        String normPurpose = (listingPurpose != null && !listingPurpose.isBlank())
                ? listingPurpose.trim() : null;

        // Build the IN clause placeholders — e.g. "(?,?,?)"
        String inClause = "(" + "?,".repeat(areaKeys.size() - 1) + "?" + ")";
        String sql = BASE_SQL
                + " AND pl.area_key IN " + inClause + "\n"
                + (normPurpose != null ? " AND pl.listing_purpose = ?\n" : "")
                + (parsedBbox != null ? BBOX_CLAUSE : "")
                + " ORDER BY pl.id\n"
                + " LIMIT " + (MAX_LISTINGS_PER_REQUEST + 1);

        // Build positional params
        // order: [citySlug, areaKeys..., (listingPurpose)?, (bbox: minLat, maxLat, minLon, maxLon)?]
        // BboxParser returns (south=minLat, west=minLon, north=maxLat, east=maxLon)
        int purposeCount = normPurpose != null ? 1 : 0;
        Object[] params;
        if (parsedBbox != null) {
            Object[] baseParams = new Object[1 + areaKeys.size() + purposeCount + 4];
            baseParams[0] = citySlug.toLowerCase();
            for (int i = 0; i < areaKeys.size(); i++) {
                baseParams[1 + i] = areaKeys.get(i);
            }
            int purposeOffset = 1 + areaKeys.size();
            if (normPurpose != null) {
                baseParams[purposeOffset] = normPurpose;
            }
            int bboxOffset = purposeOffset + purposeCount;
            baseParams[bboxOffset]     = parsedBbox.south(); // minLat
            baseParams[bboxOffset + 1] = parsedBbox.north(); // maxLat
            baseParams[bboxOffset + 2] = parsedBbox.west();  // minLon
            baseParams[bboxOffset + 3] = parsedBbox.east();  // maxLon
            params = baseParams;
        } else {
            Object[] baseParams = new Object[1 + areaKeys.size() + purposeCount];
            baseParams[0] = citySlug.toLowerCase();
            for (int i = 0; i < areaKeys.size(); i++) {
                baseParams[1 + i] = areaKeys.get(i);
            }
            if (normPurpose != null) {
                baseParams[1 + areaKeys.size()] = normPurpose;
            }
            params = baseParams;
        }

        log.debug("findAgriMapListings city={} areaKeys={} bboxPresent={}",
                citySlug, areaKeys.size(), parsedBbox != null);

        List<AgriMapListingItem> listings = jdbc.query(
                sql,
                (rs, rowNum) -> new AgriMapListingItem(
                        rs.getString("id"),
                        rs.getString("title"),
                        rs.getString("area_key"),
                        rs.getObject("latitude") != null ? rs.getDouble("latitude") : null,
                        rs.getObject("longitude") != null ? rs.getDouble("longitude") : null,
                        rs.getString("property_type"),
                        rs.getString("locality"),
                        rs.getString("boundary_geo_json"),
                        rs.getBigDecimal("land_area"),
                        rs.getString("land_area_unit"),
                        rs.getBigDecimal("computed_area_acres"),
                        rs.getObject("price_paise") != null ? rs.getLong("price_paise") : null,
                        rs.getString("listing_purpose"),
                        rs.getString("water_source"),
                        rs.getString("land_category"),
                        rs.getObject("farmhouse_available") != null ? rs.getBoolean("farmhouse_available") : null,
                        rs.getObject("fencing_done") != null ? rs.getBoolean("fencing_done") : null,
                        // #1551: canonical agri fields (non-PII; pass through for anon)
                        rs.getString("road_access"),
                        rs.getString("soil_type"),
                        rs.getString("cultivation_status"),
                        rs.getString("ownership_type"),
                        // updated_at — timestamp with time zone; null-safe via getObject
                        rs.getObject("updated_at", OffsetDateTime.class)
                ),
                params
        );

        // #1460: LIMIT N+1 truncation detection. If we got more than cap,
        // the result set exceeds the max — strip the overflow row and flag truncated.
        boolean truncated = listings.size() > MAX_LISTINGS_PER_REQUEST;
        if (truncated) {
            listings = new java.util.ArrayList<>(listings.subList(0, MAX_LISTINGS_PER_REQUEST));
        }

        // #1454: anonymous gating — withhold pricePaise and coarsen exact coordinates.
        // Post-read projection only; the SQL (SELECT/WHERE/columns) is untouched.
        // Applied AFTER truncation so we coarsen exactly MAX_LISTINGS_PER_REQUEST items,
        // not the overflow row.
        if (!isAuthenticated) {
            listings = listings.stream()
                    .map(DiscoverAgriMapListingsService::toAnonItem)
                    .toList();
        }

        log.debug("findAgriMapListings city={} returned={} authenticated={} truncated={}",
                citySlug, listings.size(), isAuthenticated, truncated);
        return new AgriMapListingsResponse(citySlug.toLowerCase(), listings, truncated, MAX_LISTINGS_PER_REQUEST);
    }

    /**
     * Anonymous projection (#1454 / #1551): null pricePaise + coarsened lat/lng.
     *
     * <p>Security classification for each field:
     * <ul>
     *   <li>pricePaise → null (price is auth-gated)</li>
     *   <li>latitude / longitude → coarsened to {@value #ANON_COORD_DECIMALS} dp (exact location is auth-gated)</li>
     *   <li>roadAccess / soilType / cultivationStatus / ownershipType / updatedAt → PASS THROUGH
     *       (non-PII, non-price, non-coordinate; safe for anonymous callers per Gate F review)</li>
     *   <li>All other fields → PASS THROUGH (zero-PII: areaKey, title, boundaryGeoJson, landArea, etc.)</li>
     *   <li>surveyNumber → NOT present in this DTO (detail-only security boundary; excluded from record)</li>
     * </ul>
     */
    private static AgriMapListingItem toAnonItem(AgriMapListingItem item) {
        return new AgriMapListingItem(
                item.id(),
                item.title(),
                item.areaKey(),
                GeoCoarsener.coarsen(item.latitude()),
                GeoCoarsener.coarsen(item.longitude()),
                item.propertyType(),
                item.locality(),
                item.boundaryGeoJson(),
                item.landArea(),
                item.landAreaUnit(),
                item.computedAreaAcres(),
                null, // pricePaise withheld from anonymous callers (#1454)
                item.listingPurpose(),
                item.waterSource(),
                item.landCategory(),
                item.farmhouseAvailable(),
                item.fencingDone(),
                // #1551 new fields: non-PII, pass through unchanged for anon
                item.roadAccess(),
                item.soilType(),
                item.cultivationStatus(),
                item.ownershipType(),
                item.updatedAt());
    }

}
