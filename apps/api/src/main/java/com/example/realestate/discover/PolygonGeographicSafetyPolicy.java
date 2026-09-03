package com.example.realestate.discover;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Server-side geographic-safety/eligibility policy for a committed POLYGON result scope (#2420).
 *
 * <p>#2016 established POLYGON as one of three mutually exclusive residential result scopes
 * (see {@link ResultScopeExclusivity}). A user-drawn polygon must remain a *local* residential
 * search tool: this policy rejects a polygon that is materially outside the selected city's
 * searchable geography, or too broad to be a meaningful neighbourhood-level search — independent
 * of map zoom, which is UI state and can be bypassed by a direct API call.
 *
 * <p>Three complementary, evidence-driven safeguards, centralised in this one class rather than
 * scattered magic numbers:
 *
 * <ul>
 *   <li><b>Absolute physical-size backstop</b> ({@link #ABSOLUTE_SIZE_CEILING_M2}) — computed
 *       purely from the drawn polygon's own geodesic surface area. Applies even when the
 *       selected city's canonical boundary/Area geometry (#2422) is incomplete or absent,
 *       because it depends on nothing but the polygon itself.</li>
 *   <li><b>City containment</b> ({@link #CITY_CONTAINMENT_MIN_FRACTION}) — fails closed: if the
 *       selected city cannot be resolved, or has no {@code VALID} canonical CITY boundary,
 *       containment cannot be proven and the polygon is rejected. This is a server-side eligibility
 *       boundary, not an optional enhancement — it must not be bypassable by an unresolvable city
 *       slug or a city whose boundary import hasn't landed yet.</li>
 *   <li><b>Canonical-Area breadth</b> (at most {@link #MAX_MEANINGFUL_AREAS} *meaningfully*
 *       overlapped canonical Areas — {@link #MEANINGFUL_OVERLAP_FRACTION_OF_POLYGON} or {@link
 *       #MEANINGFUL_OVERLAP_ABSOLUTE_M2}) — using only Areas with {@code VALID} canonical
 *       geometry for that city, so a tiny incidental boundary clip into an adjacent Area never
 *       counts.</li>
 * </ul>
 *
 * <p><b>Threshold evidence — real measured Bangalore geometry (#2422 real-OSM import via
 * {@code CanonicalBoundaryGeometryBangaloreEvidenceIT}), captured by running {@code ST_Area(geom
 * ::geography)} against the seven persisted real admin_level=10 ward polygons:</b>
 * Marathahalli 0.998 km², Hebbal 1.094 km², Jayamahal 1.421 km², Vasanth Nagar 1.944 km², HSR
 * Layout 2.664 km², Indiranagar 3.103 km², Whitefield 4.551 km² — consistent with BBMP's
 * published ~709 km² spread over 198 wards (~3.6 km²/ward average; this Bengaluru CITY boundary
 * itself measured 716.4 km², the same order of magnitude). The largest real 3-ward span (the
 * three largest of these summed/unioned — Whitefield + Indiranagar + HSR Layout, which do not
 * overlap) measures ~10.32 km²; {@link #ABSOLUTE_SIZE_CEILING_M2} (12 km²) sits just above that
 * real measured 3-ward extent — a genuine backstop for cities/areas without complete canonical
 * geometry, not the primary gate for an ordinary 1-3-area local search (that is {@link
 * #MAX_MEANINGFUL_AREAS}'s job when geometry is available; the size backstop does not by itself
 * reliably distinguish 3 real wards from 4 smaller ones — e.g. the four smallest measured wards
 * here sum to ~5.46 km², under the ceiling — which is why area breadth, not size alone, is the
 * primary gate whenever geometry is available). {@link #CITY_CONTAINMENT_MIN_FRACTION} (90%)
 * tolerates imperfect OSM boundary alignment or a shopper's polygon clipping a few metres past an
 * imprecise city edge, while still rejecting a polygon materially drawn outside the city. The
 * "meaningful overlap" thresholds (5% of the drawn polygon's own area, or 50,000 m² / 5 ha
 * absolute — whichever is met first) are calibrated against three real measurements, not just the
 * zero-overlap case: (1) Jayamahal and Vasanth Nagar genuinely touch ({@code ST_Touches}/{@code
 * ST_Intersects} both true against their persisted geometry — see {@code
 * CanonicalBoundaryGeometryBangaloreEvidenceIT}) but their real {@code ST_Intersection} area is
 * exactly 0 m² — a real incidental boundary touch produces zero overlap, comfortably under both
 * thresholds; (2) a real, non-zero shopper-shaped clip penetrating ~2% of real Marathahalli's own
 * bounding-box width measures ~900 m² / ~0.08% of the drawn polygon's own area — still clearly
 * incidental, roughly 50-60x below both thresholds (see {@code
 * PolygonGeographicSafetyPolicyRealGeometryCalibrationIT#smallRealClipIntoWard_...}); (3) the same
 * shape penetrating ~20% of that real bbox width measures ~133,500 m² / ~9% — clearly a material
 * entry, 1.8-2.5x above both thresholds (see {@code
 * PolygonGeographicSafetyPolicyRealGeometryCalibrationIT#materialRealClipIntoWard_...}). Both real
 * clip measurements land with comfortable margin on their respective side of 5%/50,000 m²,
 * rather than merely grazing the cut point, so the thresholds are not calibrated to a single
 * ambiguous boundary case.
 *
 * <p>Never silently clips, reduces to selected Areas, or otherwise mutates the polygon the
 * shopper drew — a violation fails the whole request with a machine-distinguishable 4xx reason
 * ({@code polygon_outside_searchable_city} / {@code polygon_scope_too_broad}); the caller is
 * responsible for preserving the prior ResultScope on rejection.
 *
 * <p>Scope: residential POLYGON result scope only (#2420). The Agricultural query contract does
 * not support POLYGON and is untouched by this class.
 */
@Component
public class PolygonGeographicSafetyPolicy {

    /**
     * Neighbourhood-level local-search ceiling in m² (12 km²). See class Javadoc
     * "Threshold evidence" for the real-Bangalore basis.
     */
    static final double ABSOLUTE_SIZE_CEILING_M2 = 12_000_000.0;

    /**
     * Minimum fraction of the drawn polygon's own area that must lie within the selected city's
     * canonical boundary for the polygon to be considered "in" the city.
     */
    static final double CITY_CONTAINMENT_MIN_FRACTION = 0.90;

    /** An intersected Area counts as "meaningful" once it covers at least this fraction of the drawn polygon. */
    static final double MEANINGFUL_OVERLAP_FRACTION_OF_POLYGON = 0.05;

    /** ...or, independent of the polygon's own size, at least this many m² (5 ha) of absolute overlap. */
    static final double MEANINGFUL_OVERLAP_ABSOLUTE_M2 = 50_000.0;

    /** At most this many canonical Areas may be meaningfully overlapped by one committed polygon. */
    static final int MAX_MEANINGFUL_AREAS = 3;

    private final JdbcOperations jdbcOperations;

    public PolygonGeographicSafetyPolicy(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Validates a committed POLYGON result scope for {@code citySlug}. No-op when {@code
     * polygon} is {@code null} or has fewer than 3 vertices (not a committable POLYGON scope —
     * callers already reject that earlier in vertex-count parsing). Throws {@link
     * ResponseStatusException} 400 with a machine-distinguishable reason on violation; never
     * mutates {@code polygon}.
     */
    public void validate(String citySlug, List<List<Double>> polygon) {
        if (polygon == null || polygon.size() < 3) {
            return;
        }
        String wkt = PolygonWkt.toWkt(polygon);

        double polygonAreaM2 = jdbcOperations.queryForObject(
                "SELECT ST_Area(ST_GeomFromText(?, 4326)::geography)", Double.class, wkt);
        if (polygonAreaM2 > ABSOLUTE_SIZE_CEILING_M2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_scope_too_broad");
        }

        Integer cityId = resolveCityId(citySlug);
        if (cityId == null) {
            // Fail closed: containment cannot be proven for a city that doesn't resolve, so the
            // polygon cannot be accepted as "in" a searchable city. This runs before any
            // downstream city-not-found handling, and is not bypassable by an unresolvable slug.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_outside_searchable_city");
        }

        checkCityContainment(cityId, wkt, polygonAreaM2);
        checkAreaBreadth(cityId, wkt, polygonAreaM2);
    }

    private Integer resolveCityId(String citySlug) {
        if (citySlug == null || citySlug.isBlank()) {
            return null;
        }
        List<Integer> ids = jdbcOperations.queryForList(
                "SELECT id FROM public.cities WHERE lower(slug) = lower(?)", Integer.class, citySlug);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private void checkCityContainment(int cityId, String wkt, double polygonAreaM2) {
        List<Double> insideAreaRows = jdbcOperations.queryForList(
                "SELECT ST_Area(ST_Intersection(cbg.geom, ST_GeomFromText(?, 4326))::geography) "
                        + "FROM public.canonical_boundary_geometry cbg "
                        + "WHERE cbg.city_id = ? AND cbg.entity_type = 'CITY' AND cbg.status = 'VALID'",
                Double.class, wkt, cityId);
        if (insideAreaRows.isEmpty()) {
            // Fail closed: no authoritative VALID city boundary imported for this city yet, so
            // containment cannot be proven. Do not fake containment from a bbox/centroid
            // substitute, and do not silently accept — reject with the same reason as a polygon
            // proven to be materially outside the city.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_outside_searchable_city");
        }
        double insideAreaM2 = insideAreaRows.get(0);
        if (polygonAreaM2 <= 0 || insideAreaM2 / polygonAreaM2 < CITY_CONTAINMENT_MIN_FRACTION) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_outside_searchable_city");
        }
    }

    private void checkAreaBreadth(int cityId, String wkt, double polygonAreaM2) {
        List<Double> overlaps = jdbcOperations.queryForList(
                "SELECT ST_Area(ST_Intersection(cbg.geom, ST_GeomFromText(?, 4326))::geography) "
                        + "FROM public.canonical_boundary_geometry cbg "
                        + "WHERE cbg.city_id = ? AND cbg.entity_type = 'AREA' AND cbg.status = 'VALID' "
                        + "  AND ST_Intersects(cbg.geom, ST_GeomFromText(?, 4326))",
                Double.class, wkt, cityId, wkt);
        long meaningfulCount = overlaps.stream()
                .filter(overlapM2 -> overlapM2 >= MEANINGFUL_OVERLAP_ABSOLUTE_M2
                        || (polygonAreaM2 > 0 && overlapM2 / polygonAreaM2 >= MEANINGFUL_OVERLAP_FRACTION_OF_POLYGON))
                .count();
        if (meaningfulCount > MAX_MEANINGFUL_AREAS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_scope_too_broad");
        }
    }
}
