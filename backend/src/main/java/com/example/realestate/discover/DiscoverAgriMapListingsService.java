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
                pl.price_paise
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
     * Finds LIVE agricultural_land listings for the given city and area keys.
     *
     * @param citySlug  city slug (e.g. "udupi") — must be non-blank
     * @param areaKeys  list of area keys to filter by — must be non-empty, max {@value #MAX_AREA_KEYS}
     * @param bbox      optional bounding box in format "minLat,minLon,maxLat,maxLon"
     * @return response containing the city slug and matching listings
     * @throws ResponseStatusException HTTP 400 on validation failure
     */
    @Transactional(readOnly = true)
    public AgriMapListingsResponse findAgriMapListings(String citySlug,
                                                       List<String> areaKeys,
                                                       Optional<String> bbox) {
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

        // Build the IN clause placeholders — e.g. "(?,?,?)"
        String inClause = "(" + "?,".repeat(areaKeys.size() - 1) + "?" + ")";
        String sql = BASE_SQL
                + " AND pl.area_key IN " + inClause + "\n"
                + (parsedBbox != null ? BBOX_CLAUSE : "")
                + " ORDER BY pl.id";

        // Build positional params
        // order: [citySlug, areaKeys..., (bbox: minLat, maxLat, minLon, maxLon)?]
        // BboxParser returns (south=minLat, west=minLon, north=maxLat, east=maxLon)
        Object[] params;
        if (parsedBbox != null) {
            Object[] baseParams = new Object[1 + areaKeys.size() + 4];
            baseParams[0] = citySlug.toLowerCase();
            for (int i = 0; i < areaKeys.size(); i++) {
                baseParams[1 + i] = areaKeys.get(i);
            }
            int bboxOffset = 1 + areaKeys.size();
            baseParams[bboxOffset]     = parsedBbox.south(); // minLat
            baseParams[bboxOffset + 1] = parsedBbox.north(); // maxLat
            baseParams[bboxOffset + 2] = parsedBbox.west();  // minLon
            baseParams[bboxOffset + 3] = parsedBbox.east();  // maxLon
            params = baseParams;
        } else {
            Object[] baseParams = new Object[1 + areaKeys.size()];
            baseParams[0] = citySlug.toLowerCase();
            for (int i = 0; i < areaKeys.size(); i++) {
                baseParams[1 + i] = areaKeys.get(i);
            }
            params = baseParams;
        }

        log.debug("findAgriMapListings city={} areaKeys={} bboxPresent={}",
                citySlug, areaKeys.size(), parsedBbox != null);

        List<AgriMapListingItem> listings = jdbc.query(
                sql,
                (rs, rowNum) -> new AgriMapListingItem(
                        rs.getString("id"),
                        rs.getString("area_key"),
                        rs.getObject("latitude") != null ? rs.getDouble("latitude") : null,
                        rs.getObject("longitude") != null ? rs.getDouble("longitude") : null,
                        rs.getString("property_type"),
                        rs.getString("locality"),
                        rs.getString("boundary_geo_json"),
                        rs.getBigDecimal("land_area"),
                        rs.getString("land_area_unit"),
                        rs.getBigDecimal("computed_area_acres"),
                        rs.getObject("price_paise") != null ? rs.getLong("price_paise") : null
                ),
                params
        );

        log.debug("findAgriMapListings city={} returned={}", citySlug, listings.size());
        return new AgriMapListingsResponse(citySlug.toLowerCase(), listings);
    }
}
