package com.example.realestate.discover.citylaunch;

/**
 * Result of looking up a canonical (city or area) boundary polygon.
 *
 * <p>Fail-closed by construction: there is no "best effort" bbox/centroid/convex-hull fallback
 * variant. A caller either gets a {@link Found} boundary with its geoJSON and provenance, or an
 * {@link Unavailable} with an explicit {@link Reason} — never a silently-approximated substitute.
 */
public sealed interface BoundaryGeometryResult {

    /** A verified, importable boundary polygon exists and is returned as GeoJSON (SRID 4326). */
    record Found(BoundaryProvenance provenance, String geoJson) implements BoundaryGeometryResult {}

    /** No usable boundary polygon is available; {@link #reason()} explains why. */
    record Unavailable(Reason reason) implements BoundaryGeometryResult {}

    enum Reason {
        /** The city/area exists but no boundary import has been run for it yet. */
        NOT_IMPORTED,
        /** A boundary was imported but failed geometry validation and was quarantined (never repaired). */
        QUARANTINED,
        /** The OSM source extract does not contain this entity's boundary. */
        ABSENT_IN_SOURCE,
        /** The requested city_id / area_key does not exist in the canonical geography at all. */
        UNKNOWN_ENTITY
    }
}
