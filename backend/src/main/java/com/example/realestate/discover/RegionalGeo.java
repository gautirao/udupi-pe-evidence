package com.example.realestate.discover;

/**
 * Pure stateless geographic helpers for regional classification.
 *
 * <p>All methods are package-private and static — no Spring bean, no I/O.
 *
 * <p>Earth radius: mean spherical radius 6371.0 km (WGS-84 approximation).
 * Haversine formula gives great-circle distance; error < 0.5% for the
 * short inter-area distances encountered in this application.
 *
 * <p>Bearing: initial bearing from point A to point B, clockwise from north,
 * normalised to [0, 360).
 *
 * <p>N-sector wrap: bearing in [337.5, 360) ∪ [0, 22.5) → direction_key "N".
 * All other 7 sectors are contiguous 45° slices.
 *
 * <p>Band ranges are [min, max) — lower-inclusive, upper-exclusive.
 * The outermost band has no upper bound (distance ≥ 50 km → "50_up").
 */
final class RegionalGeo {

    /** Mean spherical Earth radius used for haversine, in km. */
    static final double EARTH_RADIUS_KM = 6371.0;

    private RegionalGeo() { /* utility class */ }

    // ── Distance ──────────────────────────────────────────────────────────────

    /**
     * Haversine great-circle distance between two points (km).
     *
     * @param lat1 latitude of origin (degrees)
     * @param lon1 longitude of origin (degrees)
     * @param lat2 latitude of destination (degrees)
     * @param lon2 longitude of destination (degrees)
     * @return distance in km (always ≥ 0)
     */
    static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double rLat1 = Math.toRadians(lat1);
        double rLat2 = Math.toRadians(lat2);

        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(rLat1) * Math.cos(rLat2)
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);

        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS_KM * c;
    }

    // ── Bearing ───────────────────────────────────────────────────────────────

    /**
     * Initial bearing from (lat1, lon1) to (lat2, lon2), clockwise from north,
     * normalised to [0, 360).
     *
     * @param lat1 latitude of origin (degrees)
     * @param lon1 longitude of origin (degrees)
     * @param lat2 latitude of destination (degrees)
     * @param lon2 longitude of destination (degrees)
     * @return bearing in degrees [0, 360)
     */
    static double bearingDeg(double lat1, double lon1, double lat2, double lon2) {
        double rLat1 = Math.toRadians(lat1);
        double rLat2 = Math.toRadians(lat2);
        double dLon  = Math.toRadians(lon2 - lon1);

        double y = Math.sin(dLon) * Math.cos(rLat2);
        double x = Math.cos(rLat1) * Math.sin(rLat2)
                 - Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);

        double bearing = Math.toDegrees(Math.atan2(y, x));
        // Normalise to [0, 360)
        return (bearing % 360 + 360) % 360;
    }

    // ── Direction key ─────────────────────────────────────────────────────────

    /**
     * Maps a bearing in [0, 360) to one of the 8 compass direction keys
     * (N / NE / E / SE / S / SW / W / NW).
     *
     * <p>N sector wraps: [337.5, 360) and [0, 22.5) both map to "N".
     * All other sectors are contiguous 45° slices starting at 22.5°.
     *
     * @param bearingDeg bearing in degrees, normalised to [0, 360)
     * @return direction_key string
     * @throws IllegalArgumentException if bearing is outside [0, 360)
     */
    static String directionKey(double bearingDeg) {
        if (bearingDeg < 0 || bearingDeg >= 360) {
            throw new IllegalArgumentException(
                    "bearingDeg must be in [0, 360), got: " + bearingDeg);
        }
        // N sector wraps: [337.5, 360) ∪ [0, 22.5)
        if (bearingDeg >= 337.5 || bearingDeg < 22.5) return "N";
        if (bearingDeg < 67.5)  return "NE";
        if (bearingDeg < 112.5) return "E";
        if (bearingDeg < 157.5) return "SE";
        if (bearingDeg < 202.5) return "S";
        if (bearingDeg < 247.5) return "SW";
        if (bearingDeg < 292.5) return "W";
        return "NW"; // [292.5, 337.5)
    }

    // ── Distance band key ─────────────────────────────────────────────────────

    /**
     * Maps a distance in km to a distance band key.
     *
     * <p>Bands (all [min, max) — lower-inclusive, upper-exclusive):
     * <ul>
     *   <li>[0, 10)   → "0_10"</li>
     *   <li>[10, 25)  → "10_25"</li>
     *   <li>[25, 50)  → "25_50"</li>
     *   <li>[50, ∞)   → "50_up"</li>
     * </ul>
     *
     * <p>Boundary examples: 10.0 → "10_25", 25.0 → "25_50", 50.0 → "50_up".
     *
     * @param distanceKm distance in km (must be ≥ 0)
     * @return band_key string
     * @throws IllegalArgumentException if distance is negative
     */
    static String distanceBandKey(double distanceKm) {
        if (distanceKm < 0) {
            throw new IllegalArgumentException(
                    "distanceKm must be >= 0, got: " + distanceKm);
        }
        if (distanceKm < 10.0)  return "0_10";
        if (distanceKm < 25.0)  return "10_25";
        if (distanceKm < 50.0)  return "25_50";
        return "50_up";
    }
}
