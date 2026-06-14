package com.example.realestate.discover;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for {@link DiscoverMarkersService} verifying that the
 * {@code boundary_geojson} column is correctly projected for agricultural land
 * listings with a saved boundary polygon, and absent for listings without one (#1373).
 *
 * <p>Drives the service directly against a REAL PostGIS database (Flyway through V86).
 * Harness mirrors {@code AreaSummaryServiceAgriIT}: {@code @DataJpaTest} +
 * {@code postgis/postgis:15-3.4}, no DB replacement, {@code concurrently_keyword} emptied
 * so V73's CONCURRENTLY index runs inside Flyway's transaction.
 *
 * <h2>Cases</h2>
 * <ol>
 *   <li>agri listing WITH a saved boundary → {@code boundary} field present, valid GeoJSON Polygon</li>
 *   <li>agri listing WITH null boundary → {@code boundary} field absent (null component, omitted by NON_NULL)</li>
 *   <li>non-agri (house) listing → {@code boundary} field absent</li>
 * </ol>
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
class DiscoverMarkersIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    // A four-segment Udupi area key seeded by V71.
    private static final String AREA_KEY = "IN|KA|Udupi|Manipal";
    private static final String CITY = "udupi";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private DiscoverMarkersService service;

    @BeforeEach
    void setUp() {
        service = new DiscoverMarkersService(jdbcTemplate, new SimpleMeterRegistry());
        jdbcTemplate.update("DELETE FROM property_listings");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Case 1: agri listing WITH a saved boundary polygon
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("agri listing with boundary polygon → boundary field present and valid GeoJSON")
    void agriWithBoundary_boundaryPresentAndValidGeoJson() {
        insertAgriWithBoundary(AREA_KEY,
                "POLYGON((74.74 13.34, 74.75 13.34, 74.75 13.35, 74.74 13.35, 74.74 13.34))");

        DiscoverMarkersResponse response = service.getMarkers(minimalFilters());

        assertThat(response.markers()).hasSize(1);
        DiscoverMarker marker = response.markers().get(0);

        // boundaryGeoJson must be present (non-null)
        assertThat(marker.boundaryGeoJson())
                .as("boundary must be non-null for agri listing with saved polygon")
                .isNotNull();

        // Must be a valid GeoJSON Polygon object
        assertThat(marker.boundaryGeoJson())
                .as("boundary must start with GeoJSON object")
                .startsWith("{");
        assertThat(marker.boundaryGeoJson())
                .contains("\"type\"")
                .contains("Polygon")
                .contains("\"coordinates\"");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Case 2: agri listing WITH null boundary
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("agri listing with null boundary → boundary component is null (omitted by NON_NULL)")
    void agriWithNullBoundary_boundaryComponentIsNull() {
        insertAgriNullBoundary(AREA_KEY);

        DiscoverMarkersResponse response = service.getMarkers(minimalFilters());

        assertThat(response.markers()).hasSize(1);
        DiscoverMarker marker = response.markers().get(0);

        // boundaryGeoJson must be null — CASE WHEN returns null when boundary IS NULL
        assertThat(marker.boundaryGeoJson())
                .as("boundary must be null for agri listing with no saved polygon")
                .isNull();

        // Confirm this is an agri marker (sanity)
        assertThat(marker.propertyType()).isEqualTo("agricultural_land");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Case 3: non-agri (house) listing → boundary absent
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("non-agri listing → boundary component is null (CASE WHEN skips non-agri types)")
    void nonAgriListing_boundaryComponentIsNull() {
        insertHouseListing(AREA_KEY);

        DiscoverMarkersResponse response = service.getMarkers(minimalFilters());

        assertThat(response.markers()).hasSize(1);
        DiscoverMarker marker = response.markers().get(0);

        // CASE WHEN pl.property_type = 'agricultural_land' → returns null for house
        assertThat(marker.boundaryGeoJson())
                .as("boundary must be null for non-agri listing")
                .isNull();

        assertThat(marker.propertyType()).isEqualTo("house");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private static DiscoverListingPredicateBuilder.Filters minimalFilters() {
        return new DiscoverListingPredicateBuilder.Filters(
                CITY,
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null, null
        );
    }

    /** Inserts a LIVE agricultural_land listing with the given WKT boundary polygon. */
    private void insertAgriWithBoundary(String areaKey, String wkt) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, latitude, longitude, boundary, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, "
                        + " 'agricultural_land', 13.35, 74.79, "
                        + " ST_GeomFromText(?, 4326)::geography, ?, ?)",
                UUID.randomUUID(), areaKey, wkt, now, now);
    }

    /** Inserts a LIVE agricultural_land listing with NULL boundary. */
    private void insertAgriNullBoundary(String areaKey) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, latitude, longitude, boundary, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, "
                        + " 'agricultural_land', 13.35, 74.79, NULL, ?, ?)",
                UUID.randomUUID(), areaKey, now, now);
    }

    /** Inserts a LIVE house listing (no boundary column — always null for non-agri). */
    private void insertHouseListing(String areaKey) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, "
                        + " 'house', 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, now, now);
    }
}
