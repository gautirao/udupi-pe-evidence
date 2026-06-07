package com.example.realestate.listing.geometry;

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

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Live PostGIS migration proof for V85: boundary geography(Polygon,4326).
 *
 * <p>Verifies against a real PostgreSQL + PostGIS container:
 * <ol>
 *   <li>Flyway applies all migrations through V85 cleanly.</li>
 *   <li>{@code property_listings.boundary} column exists.</li>
 *   <li>Column type is {@code geography}.</li>
 *   <li>A GeoJSON polygon can be written via {@code ST_GeomFromGeoJSON(...)::geography}.</li>
 *   <li>The same boundary reads back via {@code ST_AsGeoJSON(boundary)::text}.</li>
 *   <li>V84 agricultural land fields (water_source, soil_type, road_access,
 *       cultivation_status, ownership_type, survey_number) remain intact.</li>
 * </ol>
 *
 * <p>Uses {@code postgis/postgis:15-3.4} — PostGIS is required for the {@code geography} type
 * added in V73 and extended in V85. Plain {@code postgres:15-alpine} does not have PostGIS.
 * Requires Docker to be running.
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        // Override to empty so V73's CREATE INDEX runs without CONCURRENTLY.
        // CONCURRENTLY requires no-transaction mode; Flyway community does not support that pragma.
        // A fresh test container has no concurrent readers, so non-concurrent index creation is safe.
        "spring.flyway.placeholders.concurrently_keyword="
})
class V85BoundaryMigrationIT {

    // postgis/postgis:15-3.4 includes PostGIS — required for geography type (V73+, V85).
    // asCompatibleSubstituteFor("postgres") is required by Testcontainers for non-official images.
    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String VALID_POLYGON =
            "{\"type\":\"Polygon\",\"coordinates\":[[[74.0,13.0],[74.1,13.0],[74.1,13.1],[74.0,13.1],[74.0,13.0]]]}";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V85: boundary column exists on property_listings")
    void v85_boundaryColumnExists() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM information_schema.columns "
                        + "WHERE table_schema = 'public' "
                        + "AND table_name = 'property_listings' "
                        + "AND column_name = 'boundary'",
                Integer.class);
        assertThat(count).isEqualTo(1);
    }

    @Test
    @DisplayName("V85: boundary column has type geography")
    void v85_boundaryColumnType_isGeography() {
        String udtName = jdbcTemplate.queryForObject(
                "SELECT udt_name FROM information_schema.columns "
                        + "WHERE table_schema = 'public' "
                        + "AND table_name = 'property_listings' "
                        + "AND column_name = 'boundary'",
                String.class);
        assertThat(udtName).isEqualTo("geography");
    }

    @Test
    @DisplayName("V85: ST_GeomFromGeoJSON write + ST_AsGeoJSON read round-trip")
    void v85_boundaryGeoJson_writeReadRoundTrip() {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings (id, created_at, updated_at) "
                        + "VALUES (?, now(), now())",
                id);

        jdbcTemplate.update(
                "UPDATE public.property_listings "
                        + "SET boundary = ST_GeomFromGeoJSON(?)::geography "
                        + "WHERE id = ?",
                VALID_POLYGON, id);

        String readBack = jdbcTemplate.queryForObject(
                "SELECT ST_AsGeoJSON(boundary)::text FROM public.property_listings WHERE id = ?",
                String.class, id);

        assertThat(readBack).isNotNull();
        assertThat(readBack).contains("\"type\":\"Polygon\"");
        // PostGIS ST_AsGeoJSON strips trailing zeros: 74.0 → 74, 13.0 → 13.
        // Assert on non-integer coordinates (74.1, 13.1) which are preserved as-is.
        assertThat(readBack).contains("74.1");
        assertThat(readBack).contains("13.1");
    }

    @Test
    @DisplayName("V85: boundary column is nullable — omitting it leaves NULL")
    void v85_boundaryColumn_isNullable() {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings (id, created_at, updated_at) "
                        + "VALUES (?, now(), now())",
                id);

        String boundary = jdbcTemplate.queryForObject(
                "SELECT ST_AsGeoJSON(boundary)::text FROM public.property_listings WHERE id = ?",
                String.class, id);

        assertThat(boundary).isNull();
    }

    @Test
    @DisplayName("V84: agricultural land fields remain intact after V85")
    void v84_agriFields_remainIntact() {
        // Verify V84 columns still exist — V85 must not have dropped or renamed them
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM information_schema.columns "
                        + "WHERE table_schema = 'public' "
                        + "AND table_name = 'property_listings' "
                        + "AND column_name IN ('water_source','soil_type','road_access',"
                        + "'cultivation_status','ownership_type','survey_number')",
                Integer.class);
        assertThat(count)
                .as("All 6 V84 agricultural land fields must still exist after V85")
                .isEqualTo(6);
    }
}
