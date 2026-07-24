package com.example.realestate.discover.navigation;

/**
 * Wire shape for {@link NavigationGraph.Bounds} (#1955 Areas PR A, SLICE 2e, AC8).
 */
public record NavigationBoundsResponse(
        Double centreLat, Double centreLon, Double minLat, Double minLon, Double maxLat, Double maxLon) {

    static NavigationBoundsResponse from(NavigationGraph.Bounds bounds) {
        if (bounds == null) {
            return null;
        }
        return new NavigationBoundsResponse(
                d(bounds.centreLat()), d(bounds.centreLon()),
                d(bounds.minLat()), d(bounds.minLon()),
                d(bounds.maxLat()), d(bounds.maxLon()));
    }

    private static Double d(java.math.BigDecimal v) {
        return v == null ? null : v.doubleValue();
    }
}
