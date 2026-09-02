package com.example.realestate.discover.citylaunch;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.realestate.discover.citylaunch.CanonicalBoundaryGeometryRepository.BoundaryCoverageReport;
import com.example.realestate.discover.citylaunch.CanonicalBoundaryGeometryRepository.BoundaryImportRow;

/**
 * IT for {@link CanonicalBoundaryGeometryRepository} (#2422) — the sole writer of
 * {@code canonical_boundary_geometry}. Runs against a real PostGIS Testcontainer (V131 migration
 * applied via the normal {@code classpath:db/migration} Flyway path) so the reimport-idempotency
 * guard, the CITY/AREA conflict targets, and {@link
 * CanonicalBoundaryGeometryRepository#coverageReport} are exercised against real SQL, not a mock.
 *
 * <p>Follows the lightweight {@code @DataJpaTest + @Testcontainers} pattern used by {@code
 * AgriDestinationsServiceIT} — {@link CanonicalBoundaryGeometryRepository} takes only a {@link
 * org.springframework.jdbc.core.JdbcOperations}, so it is instantiated directly in {@link
 * #setUp()} rather than via an inner {@code @Bean} config class.
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
class CanonicalBoundaryGeometryRepositoryIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY = "cbgrepotest";
    private static final String AREA_A = "IN|KA|CbgRepoTest|AreaA";
    private static final String AREA_B = "IN|KA|CbgRepoTest|AreaB";
    private static final String AREA_C_NO_IMPORT = "IN|KA|CbgRepoTest|AreaCNoImport";

    // A valid simple square in SRID 4326, well-formed and non-self-intersecting.
    private static final String SQUARE_WKT =
            "POLYGON((74.0 13.0, 74.1 13.0, 74.1 13.1, 74.0 13.1, 74.0 13.0))";
    // A different, non-equal valid square (shifted), used to prove a real geometry change is
    // NOT swallowed by the unchanged-guard.
    private static final String SQUARE_WKT_MOVED =
            "POLYGON((74.2 13.2, 74.3 13.2, 74.3 13.3, 74.2 13.3, 74.2 13.2))";
    // Overlaps SQUARE_WKT (shares the [74.05,74.1] x [13.05,13.1] region), used for real
    // ST_Intersects/ST_Intersection semantic-proof assertions (Blocker 3).
    private static final String OVERLAP_SQUARE_WKT =
            "POLYGON((74.05 13.05, 74.15 13.05, 74.15 13.15, 74.05 13.15, 74.05 13.05))";
    // Fully contains SQUARE_WKT, used to prove real ST_Covers boundary-containment semantics
    // (a CITY boundary covering an AREA boundary) against persisted geometry (Blocker 3).
    private static final String CONTAINING_SQUARE_WKT =
            "POLYGON((73.9 12.9, 74.6 12.9, 74.6 13.6, 73.9 13.6, 73.9 12.9))";
    // Entirely outside CONTAINING_SQUARE_WKT, used as the negative case for ST_Covers.
    private static final String OUTSIDE_SQUARE_WKT =
            "POLYGON((75.0 14.0, 75.1 14.0, 75.1 14.1, 75.0 14.1, 75.0 14.0))";
    // Left edge (x=73.9, y in [13.0,13.1]) is an exact coincident subsegment of
    // CONTAINING_SQUARE_WKT's own left edge (x=73.9, y in [12.9,13.6]) -- otherwise entirely
    // inside CONTAINING_SQUARE_WKT. Used to prove ST_Covers' boundary-touching semantics against
    // a real persisted shared-edge case, not just simple interior containment.
    private static final String EDGE_TOUCHING_SQUARE_WKT =
            "POLYGON((73.9 13.0, 74.0 13.0, 74.0 13.1, 73.9 13.1, 73.9 13.0))";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private CanonicalBoundaryGeometryRepository repository;
    private int cityId;

    @BeforeEach
    void setUp() {
        repository = new CanonicalBoundaryGeometryRepository(jdbcTemplate, transactionManager);

        jdbcTemplate.update("DELETE FROM canonical_boundary_geometry WHERE city_id IN "
                + "(SELECT id FROM cities WHERE slug = ?)", CITY);
        jdbcTemplate.update("DELETE FROM areas WHERE city_id IN (SELECT id FROM cities WHERE slug = ?)", CITY);
        jdbcTemplate.update("DELETE FROM cities WHERE slug = ?", CITY);

        cityId = insertCity(CITY, 13.05, 74.05);
        insertArea(AREA_A, cityId, 13.02, 74.02);
        insertArea(AREA_B, cityId, 13.03, 74.03);
        insertArea(AREA_C_NO_IMPORT, cityId, 13.04, 74.04);
    }

    // ── upsert: CITY vs AREA conflict targets ─────────────────────────────────────────────────

    @Test
    @DisplayName("upsert VALID CITY row is persisted with geometry, status, and provenance")
    void upsert_validCityRow_isPersisted() {
        repository.upsert(validCityRow(SQUARE_WKT));

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT status, unavailable_reason, geometry_source, osm_element_type, osm_element_id, "
                        + "osm_version, osm_source_name, osm_source_checksum_sha256, "
                        + "ST_AsText(geom) AS geom_text "
                        + "FROM canonical_boundary_geometry WHERE city_id = ? AND entity_type = 'CITY'",
                cityId);

        assertThat(row.get("status")).isEqualTo("VALID");
        assertThat(row.get("unavailable_reason")).isNull();
        assertThat(row.get("geometry_source")).isEqualTo("OSM");
        assertThat((String) row.get("geom_text")).startsWith("MULTIPOLYGON");
    }

    @Test
    @DisplayName("upsert VALID AREA row is persisted independently of the CITY row (distinct conflict target)")
    void upsert_validAreaRow_isPersisted_independentOfCityRow() {
        repository.upsert(validCityRow(SQUARE_WKT));
        repository.upsert(validAreaRow(AREA_A, SQUARE_WKT_MOVED));

        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM canonical_boundary_geometry WHERE city_id = ?", Integer.class, cityId);
        assertThat(count).isEqualTo(2);

        String areaStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM canonical_boundary_geometry "
                        + "WHERE city_id = ? AND entity_type = 'AREA' AND area_key = ?",
                String.class, cityId, AREA_A);
        assertThat(areaStatus).isEqualTo("VALID");
    }

    @Test
    @DisplayName("upsert rejects an unknown entity_type")
    void upsert_unknownEntityType_throws() {
        BoundaryImportRow bad = new BoundaryImportRow(
                cityId, "REGION", null, "VALID", null, SQUARE_WKT, "OSM",
                "way", 1L, 1L, LocalDate.of(2026, 8, 1), "test.osm", "checksum");

        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> repository.upsert(bad));
    }

    // ── QUARANTINED / ABSENT_IN_SOURCE — fail-closed, never approximated ─────────────────────

    @Test
    @DisplayName("upsert QUARANTINED AREA row is persisted with no geometry and a reason, never approximated")
    void upsert_quarantinedAreaRow_hasNoGeometry() {
        BoundaryImportRow quarantined = new BoundaryImportRow(
                cityId, "AREA", AREA_B, "QUARANTINED", "invalid_or_degenerate_geometry", null, "OSM",
                "relation", 9003L, 1L, LocalDate.of(2026, 8, 1), "test.osm", "checksum");
        repository.upsert(quarantined);

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT status, unavailable_reason, geom FROM canonical_boundary_geometry "
                        + "WHERE city_id = ? AND entity_type = 'AREA' AND area_key = ?",
                cityId, AREA_B);
        assertThat(row.get("status")).isEqualTo("QUARANTINED");
        assertThat(row.get("unavailable_reason")).isEqualTo("invalid_or_degenerate_geometry");
        assertThat(row.get("geom")).isNull();
    }

    @Test
    @DisplayName("upsert ABSENT_IN_SOURCE AREA row is persisted explicitly, never silently dropped")
    void upsert_absentInSourceAreaRow_isPersistedExplicitly() {
        BoundaryImportRow absent = new BoundaryImportRow(
                cityId, "AREA", AREA_C_NO_IMPORT, "ABSENT_IN_SOURCE",
                "relation 9999 not found in the supplied source extract", null, "OSM",
                "relation", 9999L, null, LocalDate.of(2026, 8, 1), "test.osm", "checksum");
        repository.upsert(absent);

        String status = jdbcTemplate.queryForObject(
                "SELECT status FROM canonical_boundary_geometry "
                        + "WHERE city_id = ? AND entity_type = 'AREA' AND area_key = ?",
                String.class, cityId, AREA_C_NO_IMPORT);
        assertThat(status).isEqualTo("ABSENT_IN_SOURCE");
    }

    // ── Reimport idempotency (UNCHANGED_GUARD) ────────────────────────────────────────────────

    @Test
    @DisplayName("reimporting an identical row (same checksum/version/status/geometry) is a true no-op")
    void upsert_identicalReimport_doesNotBumpUpdatedAt() {
        repository.upsert(validAreaRow(AREA_A, SQUARE_WKT));
        java.sql.Timestamp firstUpdatedAt = jdbcTemplate.queryForObject(
                "SELECT updated_at FROM canonical_boundary_geometry "
                        + "WHERE city_id = ? AND entity_type = 'AREA' AND area_key = ?",
                java.sql.Timestamp.class, cityId, AREA_A);

        // Reimport the byte-identical row.
        repository.upsert(validAreaRow(AREA_A, SQUARE_WKT));

        java.sql.Timestamp secondUpdatedAt = jdbcTemplate.queryForObject(
                "SELECT updated_at FROM canonical_boundary_geometry "
                        + "WHERE city_id = ? AND entity_type = 'AREA' AND area_key = ?",
                java.sql.Timestamp.class, cityId, AREA_A);

        assertThat(secondUpdatedAt).isEqualTo(firstUpdatedAt);
    }

    @Test
    @DisplayName("reimporting with a geometrically different shape DOES update the row")
    void upsert_changedGeometry_updatesRow() {
        repository.upsert(validAreaRow(AREA_A, SQUARE_WKT));
        repository.upsert(validAreaRow(AREA_A, SQUARE_WKT_MOVED));

        String geomText = jdbcTemplate.queryForObject(
                "SELECT ST_AsText(geom) FROM canonical_boundary_geometry "
                        + "WHERE city_id = ? AND entity_type = 'AREA' AND area_key = ?",
                String.class, cityId, AREA_A);
        // Confirms the moved square's coordinate, not the original.
        assertThat(geomText).contains("74.2");
    }

    // ── coverageReport ────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("coverageReport tallies VALID/QUARANTINED/ABSENT_IN_SOURCE/NOT_IMPORTED, never "
            + "drops quarantined/absent/not-imported area_keys, and carries OSM provenance for "
            + "both the CITY row and every imported AREA row")
    void coverageReport_talliesAllStatusesAndListsAreaKeys() {
        // A 4th area purely for the ABSENT_IN_SOURCE case, kept separate from AREA_C_NO_IMPORT
        // (which stays a genuine "no row at all" NOT_IMPORTED case).
        String areaDAbsent = "IN|KA|CbgRepoTest|AreaDAbsent";
        insertArea(areaDAbsent, cityId, 13.06, 74.06);

        repository.upsert(validCityRow(SQUARE_WKT));
        repository.upsert(validAreaRow(AREA_A, SQUARE_WKT));
        repository.upsert(new BoundaryImportRow(
                cityId, "AREA", AREA_B, "QUARANTINED", "invalid_or_degenerate_geometry", null, "OSM",
                "relation", 9003L, 1L, LocalDate.of(2026, 8, 1), "test.osm", "checksum"));
        repository.upsert(new BoundaryImportRow(
                cityId, "AREA", areaDAbsent, "ABSENT_IN_SOURCE",
                "relation 9999 not found in the supplied source extract", null, "OSM",
                "relation", 9999L, null, LocalDate.of(2026, 8, 1), "test.osm", "checksum"));
        // AREA_C_NO_IMPORT: deliberately left with no canonical_boundary_geometry row at all.

        BoundaryCoverageReport report = repository.coverageReport(cityId);

        assertThat(report.cityId()).isEqualTo(cityId);
        assertThat(report.totalAreas()).isEqualTo(4);
        assertThat(report.areasValid()).isEqualTo(1);
        assertThat(report.areasQuarantined()).isEqualTo(1);
        assertThat(report.areasAbsentInSource()).isEqualTo(1);
        assertThat(report.areasNotImported()).isEqualTo(1);
        assertThat(report.cityBoundaryValid()).isTrue();
        assertThat(report.quarantinedAreaKeys()).containsExactly(AREA_B);
        assertThat(report.notImportedAreaKeys()).containsExactly(AREA_C_NO_IMPORT);
        assertThat(report.absentInSourceAreaKeys()).containsExactly(areaDAbsent);

        // CITY provenance: reuses this table's own osm_*/geometry_source columns.
        assertThat(report.cityProvenance()).isNotNull();
        assertThat(report.cityProvenance().areaKey()).isNull();
        assertThat(report.cityProvenance().status()).isEqualTo("VALID");
        assertThat(report.cityProvenance().geometrySource()).isEqualTo("OSM");
        assertThat(report.cityProvenance().osmElementType()).isEqualTo("way");
        assertThat(report.cityProvenance().osmElementId()).isEqualTo(4005L);
        assertThat(report.cityProvenance().osmVersion()).isEqualTo(1L);
        assertThat(report.cityProvenance().osmExtractDate()).isEqualTo(LocalDate.of(2026, 8, 1));
        assertThat(report.cityProvenance().osmSourceName()).isEqualTo("test.osm");
        assertThat(report.cityProvenance().osmSourceChecksumSha256()).isEqualTo("deadbeefdeadbeef");

        // AREA provenance: one entry per imported (non-NOT_IMPORTED) area — VALID, QUARANTINED,
        // and ABSENT_IN_SOURCE are all included; the never-imported AREA_C_NO_IMPORT is not.
        assertThat(report.areaProvenance())
                .extracting("areaKey", "status")
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple(AREA_A, "VALID"),
                        org.assertj.core.groups.Tuple.tuple(AREA_B, "QUARANTINED"),
                        org.assertj.core.groups.Tuple.tuple(areaDAbsent, "ABSENT_IN_SOURCE"));

        var areaBProvenance = report.areaProvenance().stream()
                .filter(p -> AREA_B.equals(p.areaKey()))
                .findFirst()
                .orElseThrow();
        assertThat(areaBProvenance.osmElementType()).isEqualTo("relation");
        assertThat(areaBProvenance.osmElementId()).isEqualTo(9003L);
        assertThat(areaBProvenance.osmVersion()).isEqualTo(1L);
    }

    @Test
    @DisplayName("coverageReport reports cityBoundaryValid=false when no CITY row has been imported")
    void coverageReport_cityBoundaryValidFalse_whenCityRowMissing() {
        BoundaryCoverageReport report = repository.coverageReport(cityId);
        assertThat(report.cityBoundaryValid()).isFalse();
    }

    // ── PostGIS semantic proof (Blocker 3) — real ST_* assertions on real persisted geometry,
    // never mocked geometry logic. ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("persisted VALID geometry has non-zero ST_Area")
    void persistedGeometry_hasNonZeroArea() {
        repository.upsert(validAreaRow(AREA_A, SQUARE_WKT));

        Double area = jdbcTemplate.queryForObject(
                "SELECT ST_Area(geom) FROM canonical_boundary_geometry "
                        + "WHERE city_id = ? AND entity_type = 'AREA' AND area_key = ?",
                Double.class, cityId, AREA_A);
        assertThat(area).isGreaterThan(0.0);
    }

    @Test
    @DisplayName("ST_Intersects is true for two persisted overlapping boundaries, false for disjoint ones")
    void stIntersects_trueForOverlapping_falseForDisjoint() {
        repository.upsert(validAreaRow(AREA_A, SQUARE_WKT));
        repository.upsert(validAreaRow(AREA_B, OVERLAP_SQUARE_WKT));

        assertThat(intersects(AREA_A, AREA_B)).isTrue();

        // SQUARE_WKT_MOVED is disjoint from SQUARE_WKT — proves the assertion above is not
        // vacuously true (i.e. this repository/test isn't accidentally always returning true).
        repository.upsert(validAreaRow(AREA_B, SQUARE_WKT_MOVED));
        assertThat(intersects(AREA_A, AREA_B)).isFalse();
    }

    private Boolean intersects(String areaKeyA, String areaKeyB) {
        return jdbcTemplate.queryForObject(
                "SELECT ST_Intersects(a.geom, b.geom) "
                        + "FROM canonical_boundary_geometry a, canonical_boundary_geometry b "
                        + "WHERE a.city_id = ? AND a.entity_type = 'AREA' AND a.area_key = ? "
                        + "AND b.city_id = ? AND b.entity_type = 'AREA' AND b.area_key = ?",
                Boolean.class, cityId, areaKeyA, cityId, areaKeyB);
    }

    @Test
    @DisplayName("ST_Intersection of two overlapping persisted boundaries has non-trivial area")
    void stIntersection_ofOverlappingBoundaries_hasNonTrivialArea() {
        repository.upsert(validAreaRow(AREA_A, SQUARE_WKT));
        repository.upsert(validAreaRow(AREA_B, OVERLAP_SQUARE_WKT));

        Double intersectionArea = jdbcTemplate.queryForObject(
                "SELECT ST_Area(ST_Intersection(a.geom, b.geom)) "
                        + "FROM canonical_boundary_geometry a, canonical_boundary_geometry b "
                        + "WHERE a.city_id = ? AND a.entity_type = 'AREA' AND a.area_key = ? "
                        + "AND b.city_id = ? AND b.entity_type = 'AREA' AND b.area_key = ?",
                Double.class, cityId, AREA_A, cityId, AREA_B);
        // SQUARE_WKT spans [74.0,74.1]x[13.0,13.1]; OVERLAP_SQUARE_WKT spans
        // [74.05,74.15]x[13.05,13.15] -> overlap region is [74.05,74.1]x[13.05,13.1] = 0.05x0.05.
        assertThat(intersectionArea).isCloseTo(0.0025, org.assertj.core.data.Offset.offset(0.0001));
    }

    @Test
    @DisplayName("ST_Covers is true when a persisted CITY boundary fully contains a persisted AREA "
            + "boundary, false when it does not")
    void stCovers_trueWhenCityBoundaryContainsAreaBoundary() {
        // ST_Covers (rather than ST_Contains) is used deliberately: ST_Covers also returns true
        // when the AREA boundary's edge coincides with the CITY boundary's edge, which is the
        // correct real-world semantics here — an area whose edge lies exactly on the city edge
        // is still "within" the city, not excluded on an edge-touching technicality the way
        // ST_Contains would exclude it.
        repository.upsert(validCityRow(CONTAINING_SQUARE_WKT));
        repository.upsert(validAreaRow(AREA_A, SQUARE_WKT));

        assertThat(cityCovers(AREA_A)).isTrue();

        // Negative check: the CITY boundary does NOT cover a boundary entirely outside it.
        repository.upsert(validAreaRow(AREA_A, OUTSIDE_SQUARE_WKT));
        assertThat(cityCovers(AREA_A)).isFalse();
    }

    private Boolean cityCovers(String areaKey) {
        return jdbcTemplate.queryForObject(
                "SELECT ST_Covers(c.geom, a.geom) "
                        + "FROM canonical_boundary_geometry c, canonical_boundary_geometry a "
                        + "WHERE c.city_id = ? AND c.entity_type = 'CITY' "
                        + "AND a.city_id = ? AND a.entity_type = 'AREA' AND a.area_key = ?",
                Boolean.class, cityId, cityId, areaKey);
    }

    @Test
    @DisplayName("ST_Covers is true for a persisted AREA boundary whose edge exactly coincides "
            + "with the persisted CITY boundary's edge (a real shared-edge case, not just simple "
            + "interior containment)")
    void stCovers_trueWhenAreaBoundaryEdgeCoincidesWithCityBoundaryEdge() {
        // EDGE_TOUCHING_SQUARE_WKT's left edge (x=73.9, y in [13.0,13.1]) is an exact
        // coincident subsegment of CONTAINING_SQUARE_WKT's own left edge (x=73.9, y in
        // [12.9,13.6]) — this exercises the boundary-touching branch of ST_Covers against real
        // persisted PostGIS geometry, which the existing strictly-interior SQUARE_WKT case above
        // never reaches.
        repository.upsert(validCityRow(CONTAINING_SQUARE_WKT));
        repository.upsert(validAreaRow(AREA_A, EDGE_TOUCHING_SQUARE_WKT));

        assertThat(cityCovers(AREA_A))
                .as("ST_Covers must be true when the AREA boundary's edge lies exactly on the "
                        + "CITY boundary's edge — a shared edge does not put the AREA \"outside\" "
                        + "the CITY")
                .isTrue();

        // Contrast with ST_Contains on the SAME coincident-edge geometry, verified empirically
        // against a real PostGIS 15/3.4 instance (not assumed from DE-9IM theory in the abstract).
        // The naive textbook claim — "ST_Contains excludes any boundary-touching case" — does NOT
        // hold here: ST_Contains(A, B) requires interior(A) ∩ interior(B) ≠ ∅ AND B ⊆ closure(A).
        // EDGE_TOUCHING_SQUARE_WKT shares only its left edge with CONTAINING_SQUARE_WKT's left
        // edge; every other point of its interior (x > 73.9) still lies strictly inside the CITY's
        // interior, so interior(A) ∩ interior(B) is non-empty and ST_Contains is ALSO true. The
        // real ST_Covers-vs-ST_Contains divergence only appears for a lower-dimensional geometry
        // (e.g. a LineString running exactly along a polygon's edge, whose interior can never
        // intersect the polygon's interior) — a shape this schema's Polygon/MultiPolygon
        // canonical_boundary_geometry.geom column cannot represent for a real AREA/CITY boundary.
        // We assert the observed real-PostGIS result rather than the unverified theoretical one:
        // for this repository's actual geometry model, ST_Covers and ST_Contains agree whenever an
        // AREA shares an edge with its CITY but otherwise still has interior overlap with it.
        assertThat(cityContains(AREA_A))
                .as("Empirically verified against real PostGIS: ST_Contains is ALSO true here "
                        + "because EDGE_TOUCHING_SQUARE_WKT's interior still overlaps the CITY's "
                        + "interior away from the shared edge — a single coincident edge alone "
                        + "does not make ST_Contains false for a positive-area AREA polygon. The "
                        + "repository still uses ST_Covers (not ST_Contains) for its coverage "
                        + "semantics because ST_Covers is the semantically correct predicate "
                        + "regardless of interior overlap, not because ST_Contains diverges in "
                        + "this observed case")
                .isTrue();
    }

    private Boolean cityContains(String areaKey) {
        return jdbcTemplate.queryForObject(
                "SELECT ST_Contains(c.geom, a.geom) "
                        + "FROM canonical_boundary_geometry c, canonical_boundary_geometry a "
                        + "WHERE c.city_id = ? AND c.entity_type = 'CITY' "
                        + "AND a.city_id = ? AND a.entity_type = 'AREA' AND a.area_key = ?",
                Boolean.class, cityId, cityId, areaKey);
    }

    // ── fixtures ──────────────────────────────────────────────────────────────────────────────

    private BoundaryImportRow validCityRow(String wkt) {
        return new BoundaryImportRow(
                cityId, "CITY", null, "VALID", null, wkt, "OSM",
                "way", 4005L, 1L, LocalDate.of(2026, 8, 1), "test.osm", "deadbeefdeadbeef");
    }

    private BoundaryImportRow validAreaRow(String areaKey, String wkt) {
        return new BoundaryImportRow(
                cityId, "AREA", areaKey, "VALID", null, wkt, "OSM",
                "relation", 9001L, 1L, LocalDate.of(2026, 8, 1), "test.osm", "deadbeefdeadbeef");
    }

    private int insertCity(String slug, double lat, double lon) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, true) RETURNING id",
                Integer.class, slug, slug, lat, lon);
    }

    private void insertArea(String areaKey, int cityId, double lat, double lon) {
        jdbcTemplate.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon, lifecycle_status) "
                        + "VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
                areaKey, cityId, areaKey, lat, lon);
    }
}
