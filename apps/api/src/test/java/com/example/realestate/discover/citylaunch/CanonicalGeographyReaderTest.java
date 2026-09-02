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

import static org.assertj.core.api.Assertions.assertThat;

import com.example.realestate.discover.citylaunch.BoundaryGeometryResult.Found;
import com.example.realestate.discover.citylaunch.BoundaryGeometryResult.Reason;
import com.example.realestate.discover.citylaunch.BoundaryGeometryResult.Unavailable;
import com.example.realestate.discover.citylaunch.CanonicalBoundaryGeometryRepository.BoundaryImportRow;

import java.time.LocalDate;

/**
 * Read-path test for {@link CanonicalGeographyReader#findCityBoundary} and
 * {@link CanonicalGeographyReader#findAreaBoundary} (#2422) — proves the fail-closed
 * {@link Reason} contract (UNKNOWN_ENTITY vs NOT_IMPORTED vs QUARANTINED vs ABSENT_IN_SOURCE) and
 * the {@link Found} happy path against real {@code canonical_boundary_geometry} rows written via
 * {@link CanonicalBoundaryGeometryRepository}.
 *
 * <p>Named {@code CanonicalGeographyReaderTest} (not {@code *IT}) per the approved plan's literal
 * {@code allowed_file_globs} entry ({@code CanonicalGeographyReader*Test.java}), despite using the
 * same Testcontainers/{@code @DataJpaTest} machinery as the repository's {@code *IT} sibling — both
 * exercise real PostGIS via Docker, so the {@code Test} suffix here does not imply a mocked/unit
 * test.
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
class CanonicalGeographyReaderTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY = "cgreadertest";
    private static final String AREA_VALID = "IN|KA|CgReaderTest|AreaValid";
    private static final String AREA_QUARANTINED = "IN|KA|CgReaderTest|AreaQuarantined";
    private static final String AREA_ABSENT = "IN|KA|CgReaderTest|AreaAbsent";
    private static final String AREA_NOT_IMPORTED = "IN|KA|CgReaderTest|AreaNotImported";
    private static final String AREA_UNKNOWN = "IN|KA|CgReaderTest|AreaDoesNotExist";

    private static final String SQUARE_WKT =
            "POLYGON((74.0 13.0, 74.1 13.0, 74.1 13.1, 74.0 13.1, 74.0 13.0))";

    private static final int UNKNOWN_CITY_ID = -999;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private CanonicalGeographyReader reader;
    private CanonicalBoundaryGeometryRepository repository;
    private int cityId;

    @BeforeEach
    void setUp() {
        reader = new CanonicalGeographyReader(jdbcTemplate);
        repository = new CanonicalBoundaryGeometryRepository(jdbcTemplate, transactionManager);

        jdbcTemplate.update("DELETE FROM canonical_boundary_geometry WHERE city_id IN "
                + "(SELECT id FROM cities WHERE slug = ?)", CITY);
        jdbcTemplate.update("DELETE FROM areas WHERE city_id IN (SELECT id FROM cities WHERE slug = ?)", CITY);
        jdbcTemplate.update("DELETE FROM cities WHERE slug = ?", CITY);

        cityId = insertCity(CITY, 13.05, 74.05);
        insertArea(AREA_VALID, cityId, 13.02, 74.02);
        insertArea(AREA_QUARANTINED, cityId, 13.03, 74.03);
        insertArea(AREA_ABSENT, cityId, 13.04, 74.04);
        insertArea(AREA_NOT_IMPORTED, cityId, 13.06, 74.06);
        // AREA_UNKNOWN deliberately not inserted into `areas` at all.

        repository.upsert(new BoundaryImportRow(
                cityId, "AREA", AREA_VALID, "VALID", null, SQUARE_WKT, "OSM",
                "relation", 9001L, 1L, LocalDate.of(2026, 8, 1), "test.osm", "checksum"));
        repository.upsert(new BoundaryImportRow(
                cityId, "AREA", AREA_QUARANTINED, "QUARANTINED", "invalid_or_degenerate_geometry", null, "OSM",
                "relation", 9003L, 1L, LocalDate.of(2026, 8, 1), "test.osm", "checksum"));
        repository.upsert(new BoundaryImportRow(
                cityId, "AREA", AREA_ABSENT, "ABSENT_IN_SOURCE",
                "relation 9999 not found in the supplied source extract", null, "OSM",
                "relation", 9999L, null, LocalDate.of(2026, 8, 1), "test.osm", "checksum"));
        // AREA_NOT_IMPORTED: exists in `areas` but deliberately has no canonical_boundary_geometry row.
    }

    // ── findAreaBoundary ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("findAreaBoundary returns Found with GeoJSON and provenance for a VALID row")
    void findAreaBoundary_valid_returnsFoundWithGeoJsonAndProvenance() {
        BoundaryGeometryResult result = reader.findAreaBoundary(cityId, AREA_VALID);

        assertThat(result).isInstanceOf(Found.class);
        Found found = (Found) result;
        assertThat(found.geoJson()).contains("MultiPolygon");
        assertThat(found.provenance().geometrySource()).isEqualTo("OSM");
        assertThat(found.provenance().osmElementType()).isEqualTo("relation");
        assertThat(found.provenance().osmElementId()).isEqualTo(9001L);
        assertThat(found.provenance().osmVersion()).isEqualTo(1L);
        assertThat(found.provenance().osmExtractDate()).isEqualTo(LocalDate.of(2026, 8, 1));
        assertThat(found.provenance().osmSourceName()).isEqualTo("test.osm");
        assertThat(found.provenance().osmSourceChecksumSha256()).isEqualTo("checksum");
        assertThat(found.provenance().importedAt()).isNotNull();
    }

    @Test
    @DisplayName("findAreaBoundary returns Unavailable(QUARANTINED) for a quarantined row, never approximated")
    void findAreaBoundary_quarantined_returnsUnavailableQuarantined() {
        BoundaryGeometryResult result = reader.findAreaBoundary(cityId, AREA_QUARANTINED);

        assertThat(result).isInstanceOf(Unavailable.class);
        assertThat(((Unavailable) result).reason()).isEqualTo(Reason.QUARANTINED);
    }

    @Test
    @DisplayName("findAreaBoundary returns Unavailable(ABSENT_IN_SOURCE) for a confirmed-but-absent row")
    void findAreaBoundary_absentInSource_returnsUnavailableAbsentInSource() {
        BoundaryGeometryResult result = reader.findAreaBoundary(cityId, AREA_ABSENT);

        assertThat(result).isInstanceOf(Unavailable.class);
        assertThat(((Unavailable) result).reason()).isEqualTo(Reason.ABSENT_IN_SOURCE);
    }

    @Test
    @DisplayName("findAreaBoundary returns Unavailable(NOT_IMPORTED) when the area exists but no import has run")
    void findAreaBoundary_areaExistsNoImport_returnsUnavailableNotImported() {
        BoundaryGeometryResult result = reader.findAreaBoundary(cityId, AREA_NOT_IMPORTED);

        assertThat(result).isInstanceOf(Unavailable.class);
        assertThat(((Unavailable) result).reason()).isEqualTo(Reason.NOT_IMPORTED);
    }

    @Test
    @DisplayName("findAreaBoundary returns Unavailable(UNKNOWN_ENTITY) when the area_key does not exist at all")
    void findAreaBoundary_areaDoesNotExist_returnsUnavailableUnknownEntity() {
        BoundaryGeometryResult result = reader.findAreaBoundary(cityId, AREA_UNKNOWN);

        assertThat(result).isInstanceOf(Unavailable.class);
        assertThat(((Unavailable) result).reason()).isEqualTo(Reason.UNKNOWN_ENTITY);
    }

    // ── findCityBoundary ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("findCityBoundary returns Found with GeoJSON for a VALID city row")
    void findCityBoundary_valid_returnsFound() {
        repository.upsert(new BoundaryImportRow(
                cityId, "CITY", null, "VALID", null, SQUARE_WKT, "OSM",
                "way", 4005L, 1L, LocalDate.of(2026, 8, 1), "test.osm", "checksum"));

        BoundaryGeometryResult result = reader.findCityBoundary(cityId);

        assertThat(result).isInstanceOf(Found.class);
        assertThat(((Found) result).geoJson()).contains("MultiPolygon");
    }

    @Test
    @DisplayName("findCityBoundary returns Unavailable(NOT_IMPORTED) when the city exists but no import has run")
    void findCityBoundary_cityExistsNoImport_returnsUnavailableNotImported() {
        BoundaryGeometryResult result = reader.findCityBoundary(cityId);

        assertThat(result).isInstanceOf(Unavailable.class);
        assertThat(((Unavailable) result).reason()).isEqualTo(Reason.NOT_IMPORTED);
    }

    @Test
    @DisplayName("findCityBoundary returns Unavailable(UNKNOWN_ENTITY) when the city_id does not exist at all")
    void findCityBoundary_cityDoesNotExist_returnsUnavailableUnknownEntity() {
        BoundaryGeometryResult result = reader.findCityBoundary(UNKNOWN_CITY_ID);

        assertThat(result).isInstanceOf(Unavailable.class);
        assertThat(((Unavailable) result).reason()).isEqualTo(Reason.UNKNOWN_ENTITY);
    }

    // ── fixtures ──────────────────────────────────────────────────────────────────────────────

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
