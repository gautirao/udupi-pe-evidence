package com.example.realestate.discover.shadow;

import com.example.realestate.discover.DiscoverListingsQuery;

/**
 * Classifies the structural shape of a shadow-read query for metrics tagging.
 *
 * <p>Values are enum-only and never derived from user-supplied text — this keeps Micrometer
 * tag cardinality bounded regardless of user input.
 */
public enum ShadowQueryType {
    KEYWORD, BBOX, SCHOOL_RADIUS, POLYGON, CITY_BROWSE, MARKERS;

    /**
     * Returns true when Postgres and OpenSearch use the same sort order for this query type.
     *
     * <p>Listings paths (KEYWORD/BBOX/SCHOOL_RADIUS/POLYGON/CITY_BROWSE):
     * <ul>
     *   <li>Postgres:    {@code ORDER BY pl.created_at DESC} (DiscoverListingsService:136)
     *   <li>OpenSearch:  {@code created_at desc}             (DiscoverQueryDsl:87)
     * </ul>
     * These match → {@code ordered=true} → top-N overlap is comparable.
     *
     * <p>Markers path (MARKERS):
     * <ul>
     *   <li>Postgres:    {@code ORDER BY pl.id} ASC implicit  (DiscoverMarkersService:68)
     *   <li>OpenSearch:  {@code created_at desc}              (DiscoverQueryDsl:68)
     * </ul>
     * These differ → {@code ordered=false} → top-N overlap is NOT_COMPARABLE; metric not emitted.
     */
    public boolean isOrdered() {
        return this != MARKERS;
    }

    /**
     * Derives the query type from a {@link DiscoverListingsQuery} by examining field PRESENCE
     * only — never the actual values (to keep cardinality bounded).
     *
     * <p>Precedence (highest to lowest):
     * <ol>
     *   <li>KEYWORD — when {@code q} is non-null and non-blank
     *   <li>SCHOOL_RADIUS — when school lat/lon/radiusKm are all present
     *   <li>POLYGON — when polygon list is present and non-empty
     *   <li>BBOX — when bbox is present
     *   <li>CITY_BROWSE — fallback (city-scoped browse with no spatial constraint)
     * </ol>
     */
    public static ShadowQueryType fromListingsQuery(DiscoverListingsQuery query) {
        if (query.q() != null && !query.q().isBlank()) {
            return KEYWORD;
        }
        if (query.schoolLat() != null && query.schoolLon() != null && query.schoolRadiusKm() != null) {
            return SCHOOL_RADIUS;
        }
        if (query.polygon() != null && !query.polygon().isEmpty()) {
            return POLYGON;
        }
        if (query.bbox() != null) {
            return BBOX;
        }
        return CITY_BROWSE;
    }
}
