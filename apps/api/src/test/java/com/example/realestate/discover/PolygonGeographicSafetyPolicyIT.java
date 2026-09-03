package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Real-PostGIS (Testcontainers) coverage for {@link PolygonGeographicSafetyPolicy} (#2420): the
 * intersection / overlap-percentage / area-ceiling arithmetic that decides whether a committed
 * POLYGON result scope is geographically safe.
 *
 * <p>Uses a self-contained synthetic {@code cities} row (the same {@code insertCity} pattern as
 * {@code CanonicalBoundaryGeometryRepositoryIT}) rather than the real seeded {@code bangalore}
 * city, and synthetic, axis-aligned {@code canonical_boundary_geometry} CITY/AREA rows rather
 * than the real OSM ward polygons imported by #2422's evidence fixture. This is deliberate: this
 * suite calibrates the policy's
 * *counting/percentage arithmetic* (does N materially-overlapped areas exceed {@link
 * PolygonGeographicSafetyPolicy#MAX_MEANINGFUL_AREAS}? does the polygon exceed the area
 * ceiling?), which is identical whether the underlying boundary shape is a real OSM ward or a
 * simple rectangle — #2422's own tests ({@code CanonicalBoundaryGeometryBangaloreEvidenceIT})
 * already prove the real-OSM import path this policy reads from. Axis-aligned rectangles make
 * the expected overlap fractions exactly computable by hand, which is what makes the threshold
 * edge cases below deterministic.
 *
 * <p>{@code canonical_boundary_geometry} starts empty in a fresh Flyway-migrated schema (V131 is
 * additive only — no seed data). {@code @DataJpaTest}'s per-test transactional rollback means
 * the rows {@link #seedSyntheticGeography()} inserts never leak between test methods.
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword="
})
class PolygonGeographicSafetyPolicyIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private PolygonGeographicSafetyPolicy policy;
    private int cityId;
    private String citySlug;

    // Synthetic city boundary. Deliberately much larger than real Bangalore — only its shape (a
    // simple rectangle) and the containment arithmetic matter for this suite.
    private static final String CITY_WKT =
            "POLYGON((79.50 19.50,80.50 19.50,80.50 20.50,79.50 20.50,79.50 19.50))";

    // Four contiguous, non-overlapping synthetic wards laid out west-to-east, each ~0.02deg x
    // 0.02deg (~2.2km x ~2.1km, ~4.6 km^2 at this latitude) — comparable in scale to the real
    // Bangalore admin_level=10 wards this policy reads from in production (see
    // PolygonGeographicSafetyPolicy's class Javadoc "Threshold evidence").
    private static final String AREA_1_WKT =
            "POLYGON((80.00 20.00,80.02 20.00,80.02 20.02,80.00 20.02,80.00 20.00))";
    private static final String AREA_2_WKT =
            "POLYGON((80.02 20.00,80.04 20.00,80.04 20.02,80.02 20.02,80.02 20.00))";
    private static final String AREA_3_WKT =
            "POLYGON((80.04 20.00,80.06 20.00,80.06 20.02,80.04 20.02,80.04 20.00))";
    private static final String AREA_4_WKT =
            "POLYGON((80.06 20.00,80.08 20.00,80.08 20.02,80.06 20.02,80.06 20.00))";

    @BeforeEach
    void seedSyntheticGeography() {
        citySlug = "polygonsafetytest";
        cityId = insertCity(citySlug, 20.01, 80.04);
        policy = new PolygonGeographicSafetyPolicy(jdbcTemplate);

        insertBoundary("CITY", null, CITY_WKT);
        insertBoundary("AREA", "TEST|AREA|1", AREA_1_WKT);
        insertBoundary("AREA", "TEST|AREA|2", AREA_2_WKT);
        insertBoundary("AREA", "TEST|AREA|3", AREA_3_WKT);
        insertBoundary("AREA", "TEST|AREA|4", AREA_4_WKT);
    }

    private int insertCity(String slug, double lat, double lon) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, true) RETURNING id",
                Integer.class, slug, slug, lat, lon);
    }

    private void insertBoundary(String entityType, String areaKey, String wkt) {
        jdbcTemplate.update(
                "INSERT INTO public.canonical_boundary_geometry "
                        + "(city_id, entity_type, area_key, status, geom, geometry_source) "
                        + "VALUES (?, ?, ?, 'VALID', ST_Multi(ST_GeomFromText(?, 4326)), 'SYNTHETIC_TEST')",
                cityId, entityType, areaKey, wkt);
    }

    /** [lat, lon] corners for an axis-aligned rectangle, the wire format {@code validate} expects. */
    private static List<List<Double>> rect(double latMin, double lonMin, double latMax, double lonMax) {
        return List.of(
                List.of(latMin, lonMin),
                List.of(latMin, lonMax),
                List.of(latMax, lonMax),
                List.of(latMax, lonMin));
    }

    // ── vertex-count no-op (defensive; controller already rejects <3 vertices earlier) ──────

    @Test
    void nullPolygon_isNoOp() {
        assertThatCode(() -> policy.validate(citySlug, null)).doesNotThrowAnyException();
    }

    @Test
    void tooFewVertices_isNoOp() {
        List<List<Double>> twoVertices = List.of(List.of(20.0, 80.0), List.of(20.01, 80.01));
        assertThatCode(() -> policy.validate(citySlug, twoVertices)).doesNotThrowAnyException();
    }

    // ── canonical-Area breadth ────────────────────────────────────────────────────────────

    @Test
    void containedWithinOneArea_accepted() {
        List<List<Double>> polygon = rect(20.005, 80.005, 20.015, 80.015); // inside AREA 1 only
        assertThatCode(() -> policy.validate(citySlug, polygon)).doesNotThrowAnyException();
    }

    // All breadth-test polygons below share this shrunk lat height (nested inside the areas'
    // own [20.00,20.02] lat band) so their own physical area stays well under
    // ABSOLUTE_SIZE_CEILING_M2 — otherwise a wide-but-short rejection could be masked by the
    // size backstop instead of proving the area-breadth logic itself fires. Shrinking only the
    // (shared) height leaves every lon-based overlap FRACTION identical to a full-height polygon
    // — intersection width is unaffected by height, and "fraction of polygon" cancels the common
    // height factor from both numerator and denominator.
    private static final double BREADTH_TEST_LAT_MAX = 20.005;

    @Test
    void materiallySpansTwoAreas_accepted() {
        List<List<Double>> polygon = rect(20.00, 80.01, BREADTH_TEST_LAT_MAX, 80.03); // half AREA1, half AREA2
        assertThatCode(() -> policy.validate(citySlug, polygon)).doesNotThrowAnyException();
    }

    @Test
    void materiallySpansThreeAreas_accepted() {
        // Overlap fractions: AREA1 30%, AREA2 40%, AREA3 30% of the polygon's own width — all
        // comfortably above the 5%-of-polygon meaningful-overlap threshold.
        List<List<Double>> polygon = rect(20.00, 80.005, BREADTH_TEST_LAT_MAX, 80.055);
        assertThatCode(() -> policy.validate(citySlug, polygon)).doesNotThrowAnyException();
    }

    @Test
    void tinyIncidentalTouchIntoFourthArea_doesNotCount_accepted() {
        // Same as the 3-area case, but with a 0.0001deg (~10m) nub past the AREA3/AREA4
        // boundary — ~0.18% of the polygon's own area and a few thousand m^2 absolute, both
        // below the meaningful-overlap thresholds (5% / 50,000 m^2). Must NOT count as a 4th area.
        List<List<Double>> polygon = rect(20.00, 80.005, BREADTH_TEST_LAT_MAX, 80.0601);
        assertThatCode(() -> policy.validate(citySlug, polygon)).doesNotThrowAnyException();
    }

    @Test
    void materiallySpansFourAreas_rejected() {
        // Overlap fractions: ~21.4%, 28.6%, 28.6%, 21.4% of the polygon's own width — all well
        // above the meaningful-overlap thresholds, so all 4 areas count. Total polygon area here
        // is ~4.1 km^2, comfortably under the 12 km^2 size ceiling, so this rejection is
        // unambiguously the area-breadth check firing, not the separately-tested size backstop.
        List<List<Double>> polygon = rect(20.00, 80.005, BREADTH_TEST_LAT_MAX, 80.075);
        assertThatThrownBy(() -> policy.validate(citySlug, polygon))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST))
                .hasMessageContaining("polygon_scope_too_broad");
    }

    // ── absolute physical-size backstop ──────────────────────────────────────────────────

    @Test
    void exceedsAbsoluteSizeCeiling_rejected_evenWithZeroMeaningfulAreaOverlap() {
        // ~18.7 km^2 (> the 12 km^2 ceiling), positioned away from all 4 synthetic areas — area
        // overlap alone would pass (0 <= 3), proving the size backstop is independently enforced.
        List<List<Double>> polygon = rect(19.60, 79.60, 19.64, 79.64);
        assertThatThrownBy(() -> policy.validate(citySlug, polygon))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("polygon_scope_too_broad");
    }

    // ── city containment ──────────────────────────────────────────────────────────────────

    @Test
    void materiallyOutsideCity_rejected() {
        List<List<Double>> polygon = rect(25.000, 85.000, 25.005, 85.005); // nowhere near the city
        assertThatThrownBy(() -> policy.validate(citySlug, polygon))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("polygon_outside_searchable_city");
    }

    @Test
    void ninetyFivePercentInsideCity_toleranceAllows_accepted() {
        // 5% of the polygon's width sits west of the city's 79.50 edge, 95% inside — at/above
        // the 90% containment-tolerance threshold.
        List<List<Double>> polygon = rect(19.90, 79.4995, 19.91, 79.5095);
        assertThatCode(() -> policy.validate(citySlug, polygon)).doesNotThrowAnyException();
    }

    @Test
    void eightyPercentInsideCity_belowTolerance_rejected() {
        // 20% of the polygon's width sits west of the city's 79.50 edge, only 80% inside — below
        // the 90% containment-tolerance threshold.
        List<List<Double>> polygon = rect(19.90, 79.498, 19.91, 79.508);
        assertThatThrownBy(() -> policy.validate(citySlug, polygon))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("polygon_outside_searchable_city");
    }

    // ── city/geometry unresolvable/unavailable → fail CLOSED, never accepted ────────────────
    // Containment is a server-side eligibility boundary: if it cannot be proven (unknown city
    // slug, or a resolved city with no VALID canonical CITY boundary yet), the polygon must be
    // rejected, not silently allowed through on the theory that "the checks just don't apply".

    @Test
    void unresolvableCitySlug_rejected() {
        List<List<Double>> polygon = rect(20.005, 80.005, 20.015, 80.015); // small, well under ceiling
        assertThatThrownBy(() -> policy.validate("no-such-city-2420", polygon))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("polygon_outside_searchable_city");
    }

    @Test
    void unresolvableCitySlug_absoluteSizeCeilingCheckedFirst_rejectedAsTooBroad() {
        // Oversized polygon + unresolvable city: the absolute-size check runs before city
        // resolution, so this rejects as too-broad rather than outside-city — proving the size
        // backstop is independent of (and does not depend on) city resolution succeeding.
        List<List<Double>> polygon = rect(19.60, 79.60, 19.64, 79.64);
        assertThatThrownBy(() -> policy.validate("no-such-city-2420", polygon))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("polygon_scope_too_broad");
    }

    @Test
    void resolvedCityWithNoValidCityBoundary_rejected() {
        // A real city row exists, but no CITY-entity_type canonical_boundary_geometry row was
        // ever inserted for it (e.g. boundary import hasn't run yet) — containment cannot be
        // proven, so this must reject exactly like a polygon proven to be materially outside.
        String slugWithoutBoundary = "polygonsafetytest-no-boundary";
        insertCity(slugWithoutBoundary, 20.01, 80.04);
        List<List<Double>> polygon = rect(20.005, 80.005, 20.015, 80.015); // small, well under ceiling
        assertThatThrownBy(() -> policy.validate(slugWithoutBoundary, polygon))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("polygon_outside_searchable_city");
    }
}
