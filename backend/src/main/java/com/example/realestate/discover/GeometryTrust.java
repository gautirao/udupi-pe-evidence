package com.example.realestate.discover;

/**
 * How trustworthy an area's geometry is, computed ONLY from its own geometry columns
 * ({@code geometry_source} + centre/bbox presence) — never from listing coordinates or listing
 * density (#1887 PR1, mirrors the #1882 {@code geometry_source} provenance convention from
 * V113).
 */
public enum GeometryTrust {
    /** geometry_source IN ('OSM', 'MANUAL') AND all four bbox bounds are present. */
    VERIFIED,
    /** centre present but bbox absent, OR geometry_source IS NULL (legacy bbox seed). */
    PROVISIONAL,
    /** no geo_center at all. */
    MISSING;

    /**
     * Classifies geometry trust from raw column values. {@code geometrySource == null} is the
     * legacy-seed case (V113: "NULL = legacy bounding-box seed data") and MUST classify as
     * {@link #PROVISIONAL}, never {@link #MISSING} — {@link #MISSING} is reserved strictly for
     * an absent geo_center (see #1887 plan risk R4).
     */
    static GeometryTrust classify(
            String geometrySource,
            Double geoCenterLat, Double geoCenterLon,
            Double minLat, Double minLon, Double maxLat, Double maxLon) {

        if (geoCenterLat == null || geoCenterLon == null) {
            return MISSING;
        }

        boolean bboxComplete = minLat != null && minLon != null && maxLat != null && maxLon != null;
        boolean trustedSource = "OSM".equals(geometrySource) || "MANUAL".equals(geometrySource);

        if (trustedSource && bboxComplete) {
            return VERIFIED;
        }
        return PROVISIONAL;
    }
}
