package com.example.realestate.discover.citylaunch;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.realestate.discover.citylaunch.CanonicalBoundaryGeometryRepository.BoundaryCoverageReport;

/**
 * Integration proof for Blocker 2 (#2422 review round): {@link CanonicalBoundaryGeometryImportRunner}
 * reads a reviewed JSONL boundary artifact (the {@code extract_osm_boundaries.py} output shape) and
 * upserts every line via the real {@link CanonicalBoundaryGeometryRepository} against a real
 * Testcontainers PostGIS database — no mocked repository, no hand-inserted rows.
 *
 * <p>Reuses the exact lightweight {@code @DataJpaTest} + Testcontainers scaffolding established by
 * {@link CanonicalBoundaryGeometryRepositoryIT}: the repository is JDBC-only, and the runner's public
 * contract is a plain constructor plus {@code run(ApplicationArguments)}, so both are instantiated
 * directly as plain Java objects rather than requiring a full Spring application context or exercising
 * the {@code @ConditionalOnProperty} bean-creation gate.
 *
 * <p>Proves four things required by the review: (1) importing a fixture batch lands rows via the real
 * repository, (2) reimporting the identical batch is a true no-op (the repository's own
 * {@code UNCHANGED_GUARD}), (3) a malformed JSONL line aborts the whole import before any row is
 * written — proven by parsing the artifact fully before {@code upsertAll} is ever called — and
 * (4) a failure that only surfaces once every line has parsed successfully (e.g. an unknown
 * {@code entity_type} rejected by the repository mid-batch) still leaves the pre-import canonical
 * state completely unchanged, because the whole parsed batch is applied inside one transaction via
 * {@link CanonicalBoundaryGeometryRepository#upsertAll}. There is no partial-write outcome from
 * either failure mode.
 *
 * <p>{@code @Transactional(propagation = NOT_SUPPORTED)} at the class level turns off
 * {@code @DataJpaTest}'s default per-test-method transaction (which would otherwise wrap {@code
 * setUp()} and each test body in one not-yet-committed transaction). That default is
 * incompatible with proving atomicity here: {@link CanonicalBoundaryGeometryRepository#upsertAll}
 * runs its own real transaction via an explicit {@code TransactionTemplate}, and a rollback test
 * needs its post-failure assertions to see the database's real, immediately-committed-or-rolled-
 * back state rather than a still-open, not-yet-rolled-back outer test transaction.
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
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class CanonicalBoundaryGeometryImportRunnerIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY = "cbgimportruntest";
    private static final String AREA_VALID = "IN|KA|CbgImportRunTest|AreaValid";
    private static final String AREA_QUARANTINED = "IN|KA|CbgImportRunTest|AreaQuarantined";
    private static final String AREA_ABSENT = "IN|KA|CbgImportRunTest|AreaAbsent";

    private static final String CITY_WKT =
            "POLYGON((74.0 13.0, 74.6 13.0, 74.6 13.6, 74.0 13.6, 74.0 13.0))";
    private static final String AREA_WKT =
            "POLYGON((74.1 13.1, 74.2 13.1, 74.2 13.2, 74.1 13.2, 74.1 13.1))";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @TempDir
    Path tempDir;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private CanonicalBoundaryGeometryRepository repository;
    private int cityId;

    @BeforeEach
    void setUp() {
        repository = new CanonicalBoundaryGeometryRepository(jdbcTemplate, transactionManager);

        jdbcTemplate.update("DELETE FROM canonical_boundary_geometry WHERE city_id IN "
                + "(SELECT id FROM cities WHERE slug = ?)", CITY);
        jdbcTemplate.update("DELETE FROM areas WHERE city_id IN (SELECT id FROM cities WHERE slug = ?)", CITY);
        jdbcTemplate.update("DELETE FROM cities WHERE slug = ?", CITY);

        cityId = jdbcTemplate.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, true) RETURNING id",
                Integer.class, CITY, CITY, 13.3, 74.3);
        insertArea(AREA_VALID, 13.15, 74.15);
        insertArea(AREA_QUARANTINED, 13.16, 74.16);
        insertArea(AREA_ABSENT, 13.17, 74.17);
    }

    private void insertArea(String areaKey, double lat, double lon) {
        jdbcTemplate.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon, lifecycle_status) "
                        + "VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
                areaKey, cityId, areaKey, lat, lon);
    }

    // ── row-landing + reimport no-op (Blocker 2 core requirement) ─────────────────────────────

    @Test
    @DisplayName("importing a fixture batch upserts CITY/VALID/QUARANTINED/ABSENT_IN_SOURCE rows via the real repository")
    void run_importsFixtureBatch_rowsLandViaRealRepository() throws Exception {
        Path batch = writeBatch(validBatchLines());

        runImport(batch);

        BoundaryCoverageReport report = repository.coverageReport(cityId);
        assertThat(report.cityBoundaryValid()).isTrue();
        assertThat(report.areasValid()).isEqualTo(1);
        assertThat(report.areasQuarantined()).isEqualTo(1);
        assertThat(report.areasAbsentInSource()).isEqualTo(1);
        assertThat(report.quarantinedAreaKeys()).containsExactly(AREA_QUARANTINED);
        assertThat(report.absentInSourceAreaKeys()).containsExactly(AREA_ABSENT);
    }

    @Test
    @DisplayName("reimporting the identical batch is a true no-op (UNCHANGED_GUARD leaves updated_at untouched)")
    void run_reimportIdenticalBatch_isNoOp() throws Exception {
        Path batch = writeBatch(validBatchLines());

        runImport(batch);
        Timestamp firstUpdatedAt = jdbcTemplate.queryForObject(
                "SELECT updated_at FROM canonical_boundary_geometry "
                        + "WHERE city_id = ? AND entity_type = 'AREA' AND area_key = ?",
                Timestamp.class, cityId, AREA_VALID);

        // Reimport the byte-identical fixture.
        runImport(batch);
        Timestamp secondUpdatedAt = jdbcTemplate.queryForObject(
                "SELECT updated_at FROM canonical_boundary_geometry "
                        + "WHERE city_id = ? AND entity_type = 'AREA' AND area_key = ?",
                Timestamp.class, cityId, AREA_VALID);

        assertThat(secondUpdatedAt).isEqualTo(firstUpdatedAt);

        // No duplicate rows were created either (1 CITY + 3 AREA, not 2x/8).
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM canonical_boundary_geometry WHERE city_id = ?", Integer.class, cityId);
        assertThat(count).isEqualTo(4);
    }

    // ── atomicity: a malformed/invalid line leaves prior state completely unchanged ───────────

    @Test
    @DisplayName("a malformed JSONL line aborts the whole import before any row is written (parse-phase failure)")
    void run_malformedLine_abortsImport_noRowsApplied() throws Exception {
        String lines = cityLine("VALID", CITY_WKT, null) + "\n"
                + "{ this is not valid json" + "\n";
        Path batch = writeBatch(lines);

        assertThatThrownBy(() -> runImport(batch))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Malformed JSONL")
                .hasMessageContaining("no rows applied");

        // Nothing was written: the whole artifact is parsed before the first write is attempted,
        // so the CITY row on line 1 — despite parsing fine on its own — was never applied.
        BoundaryCoverageReport report = repository.coverageReport(cityId);
        assertThat(report.cityBoundaryValid()).isFalse();
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM canonical_boundary_geometry WHERE city_id = ?", Integer.class, cityId);
        assertThat(count).isEqualTo(0);
    }

    @Test
    @DisplayName("a row rejected by the repository mid-batch rolls back the whole transaction (write-phase failure)")
    void run_repositoryRejectsRowMidBatch_rollsBackWholeImport() throws Exception {
        // Every line here parses successfully — the failure only happens once upsertAll dispatches
        // the third (structurally invalid) row, proving the atomicity comes from the single
        // transaction in upsertAll, not merely from the parse-first ordering.
        String lines = cityLine("VALID", CITY_WKT, null) + "\n"
                + areaLine(AREA_VALID, "VALID", AREA_WKT, null) + "\n"
                + jsonLine(AREA_QUARANTINED, "BOGUS_ENTITY_TYPE", "VALID", AREA_WKT, null, "relation", 9002L, 1L)
                + "\n";
        Path batch = writeBatch(lines);

        assertThatThrownBy(() -> runImport(batch)).isInstanceOf(IllegalArgumentException.class);

        // Neither the CITY row nor the first AREA row (both valid, both ordered before the
        // rejected row) were left committed — the single-transaction batch rolled back entirely.
        BoundaryCoverageReport report = repository.coverageReport(cityId);
        assertThat(report.cityBoundaryValid()).isFalse();
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM canonical_boundary_geometry WHERE city_id = ?", Integer.class, cityId);
        assertThat(count).isEqualTo(0);
    }

    // ── helpers ────────────────────────────────────────────────────────────────────────────────

    private void runImport(Path batch) throws Exception {
        CanonicalBoundaryGeometryImportRunner runner = new CanonicalBoundaryGeometryImportRunner(
                repository, objectMapper, "file:" + batch.toAbsolutePath());
        runner.run(new DefaultApplicationArguments());
    }

    private Path writeBatch(String content) throws IOException {
        Path file = tempDir.resolve("batch-" + System.nanoTime() + ".jsonl");
        Files.writeString(file, content, StandardCharsets.UTF_8);
        return file;
    }

    private String validBatchLines() {
        return cityLine("VALID", CITY_WKT, null) + "\n"
                + areaLine(AREA_VALID, "VALID", AREA_WKT, null) + "\n"
                + areaLine(AREA_QUARANTINED, "QUARANTINED", null, "invalid_or_degenerate_geometry") + "\n"
                + areaLine(AREA_ABSENT, "ABSENT_IN_SOURCE", null,
                        "relation 9999 not found in the supplied source extract") + "\n";
    }

    private String cityLine(String status, String wkt, String unavailableReason) {
        return jsonLine(null, "CITY", status, wkt, unavailableReason, "way", 4005L, 1L);
    }

    private String areaLine(String areaKey, String status, String wkt, String unavailableReason) {
        return jsonLine(areaKey, "AREA", status, wkt, unavailableReason, "relation", 9001L, 1L);
    }

    /** Serializes one JSONL line matching {@code extract_osm_boundaries.py}'s exact output shape. */
    private String jsonLine(
            String areaKey, String entityType, String status, String wkt, String unavailableReason,
            String osmElementType, long osmElementId, long osmVersion) {
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("city_id", cityId);
        record.put("entity_type", entityType);
        record.put("area_key", areaKey);
        record.put("status", status);
        record.put("unavailable_reason", unavailableReason);
        record.put("geometry_wkt", wkt);
        record.put("geometry_source", "OSM");
        record.put("osm_element_type", osmElementType);
        record.put("osm_element_id", osmElementId);
        record.put("osm_version", osmVersion);
        record.put("osm_extract_date", "2026-08-01");
        record.put("osm_source_name", "test.osm");
        record.put("osm_source_checksum_sha256", "deadbeefdeadbeef");
        try {
            return objectMapper.writeValueAsString(record);
        } catch (IOException e) {
            throw new UncheckedIoTestFixtureException(e);
        }
    }

    /** Wraps a fixture-serialization failure — should never actually happen for these fixed records. */
    private static final class UncheckedIoTestFixtureException extends RuntimeException {
        UncheckedIoTestFixtureException(IOException cause) {
            super(cause);
        }
    }
}
