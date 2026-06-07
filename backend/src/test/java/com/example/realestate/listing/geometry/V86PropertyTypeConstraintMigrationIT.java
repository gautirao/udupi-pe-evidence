package com.example.realestate.listing.geometry;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Live migration proof for V86: chk_listing_property_type expanded to include 'agricultural_land'.
 *
 * <p>Verifies against a real PostgreSQL + PostGIS container:
 * <ol>
 *   <li>Flyway applies all migrations through V86 cleanly.</li>
 *   <li>An INSERT with property_type='agricultural_land' succeeds (was HTTP 500 before V86).</li>
 *   <li>An INSERT with a bogus property_type (e.g. 'not_a_type') still violates the constraint.</li>
 *   <li>A preserved existing value ('commercial_building') still passes the constraint.</li>
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
class V86PropertyTypeConstraintMigrationIT {

    // postgis/postgis:15-3.4 includes PostGIS — required for geography type (V73+, V85).
    // asCompatibleSubstituteFor("postgres") is required by Testcontainers for non-official images.
    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V86: INSERT with property_type='agricultural_land' succeeds")
    void v86_agriculturalLand_insertSucceeds() {
        UUID id = UUID.randomUUID();
        // Should not throw — this was the P0 bug: DataIntegrityViolationException before V86.
        jdbcTemplate.update(
                "INSERT INTO public.property_listings (id, created_at, updated_at, property_type) "
                        + "VALUES (?, now(), now(), 'agricultural_land')",
                id);

        String saved = jdbcTemplate.queryForObject(
                "SELECT property_type FROM public.property_listings WHERE id = ?",
                String.class, id);
        assertThat(saved).isEqualTo("agricultural_land");
    }

    @Test
    @DisplayName("V86: INSERT with bogus property_type still violates the constraint")
    void v86_bogusPropertyType_violatesConstraint() {
        UUID id = UUID.randomUUID();
        assertThatThrownBy(() ->
                jdbcTemplate.update(
                        "INSERT INTO public.property_listings (id, created_at, updated_at, property_type) "
                                + "VALUES (?, now(), now(), 'not_a_type')",
                        id))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("V86: preserved value 'commercial_building' still passes the constraint")
    void v86_existingValue_commercialBuilding_stillPasses() {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings (id, created_at, updated_at, property_type) "
                        + "VALUES (?, now(), now(), 'commercial_building')",
                id);

        String saved = jdbcTemplate.queryForObject(
                "SELECT property_type FROM public.property_listings WHERE id = ?",
                String.class, id);
        assertThat(saved).isEqualTo("commercial_building");
    }
}
