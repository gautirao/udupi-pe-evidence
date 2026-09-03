package com.example.realestate.discover;

import java.util.List;

/**
 * Builds a PostGIS WKT {@code POLYGON(...)} literal from a drawn {@code [[lat,lon], ...]} vertex
 * list — the single canonical WKT encoding shared by every polygon-consuming SQL predicate
 * ({@link DiscoverListingPredicateBuilder}'s query filter, {@link
 * PolygonGeographicSafetyPolicy}'s geographic-safety checks) so all of them agree on ring-closing
 * and lon/lat ordering rather than each re-deriving it.
 */
final class PolygonWkt {

    private PolygonWkt() {}

    /**
     * @param polygon at least 3 {@code [lat, lon]} vertices; not validated here — callers are
     *     responsible for the vertex-count check.
     */
    static String toWkt(List<List<Double>> polygon) {
        StringBuilder wkt = new StringBuilder("POLYGON((");
        for (int i = 0; i < polygon.size(); i++) {
            List<Double> pt = polygon.get(i);
            if (i > 0) wkt.append(",");
            wkt.append(pt.get(1)).append(" ").append(pt.get(0)); // lon lat
        }
        // Close the ring
        List<Double> first = polygon.get(0);
        wkt.append(",").append(first.get(1)).append(" ").append(first.get(0));
        wkt.append("))");
        return wkt.toString();
    }
}
