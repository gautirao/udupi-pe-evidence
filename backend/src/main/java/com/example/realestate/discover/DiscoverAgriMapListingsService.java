package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
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
                pl.listing_purpose
            FROM property_listings pl
            JOIN areas a ON a.area_key = pl.area_key
            JOIN cities c ON c.id = a.city_id
            WHERE c.slug = ?
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
                + " ORDER BY pl.id";

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
                        rs.getString("listing_purpose")
                ),
                params
        );

        // #1454: anonymous gating — withhold pricePaise and coarsen exact coordinates.
        // Post-read projection only; the SQL (SELECT/WHERE/columns) is untouched.
        if (!isAuthenticated) {
            listings = listings.stream()
                    .map(DiscoverAgriMapListingsService::toAnonItem)
                    .toList();
        }

        log.debug("findAgriMapListings city={} returned={} authenticated={}",
                citySlug, listings.size(), isAuthenticated);
        return new AgriMapListingsResponse(citySlug.toLowerCase(), listings);
    }

    /**
     * Anonymous projection (#1454): null pricePaise + coarsened lat/lng.
     * Zero-PII fields (areaKey, title, boundaryGeoJson, landArea, etc.) are preserved.
     */
    private static AgriMapListingItem toAnonItem(AgriMapListingItem item) {
        return new AgriMapListingItem(
                item.id(),
                item.title(),
                item.areaKey(),
                coarsen(item.latitude()),
                coarsen(item.longitude()),
                item.propertyType(),
                item.locality(),
                item.boundaryGeoJson(),
                item.landArea(),
                item.landAreaUnit(),
                item.computedAreaAcres(),
                null, // pricePaise withheld from anonymous callers
                item.listingPurpose());
    }

    /**
     * Coarsens a coordinate to {@value #ANON_COORD_DECIMALS} decimal places by truncating
     * toward zero (sign-correct: magnitude is truncated, sign preserved). Null-guarded so a
     * SQL NULL coordinate stays null — never coerced to 0.0 (would place a marker at (0,0)).
     */
    private static Double coarsen(Double coord) {
        if (coord == null) {
            return null;
        }
        double factor = Math.pow(10, ANON_COORD_DECIMALS);
        // Truncate toward zero so the sign is preserved symmetrically for +/- values.
        double truncated = (coord < 0 ? Math.ceil(coord * factor) : Math.floor(coord * factor)) / factor;
        return truncated;
    }
}
