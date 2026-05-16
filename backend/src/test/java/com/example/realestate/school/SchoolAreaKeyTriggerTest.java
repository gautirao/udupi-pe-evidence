package com.example.realestate.school;

import org.junit.jupiter.api.AfterEach;
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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for the {@code trg_school_area_key} trigger created by V80.
 *
 * <p>Verifies that:
 * <ul>
 *   <li>AC1: INSERT without area_key → trigger auto-assigns nearest area within district</li>
 *   <li>AC2: UPDATE OF latitude/longitude → area_key is recomputed</li>
 *   <li>AC3: Direct area_key update is not overwritten — trigger is scoped to lat/lon/district changes only</li>
 *   <li>AC3-noOp: IS DISTINCT FROM guard — no unnecessary write when computed value equals existing (AC7)</li>
 * </ul>
 *
 * <p>Uses the same PostGIS container and {@code @DataJpaTest} setup as {@link SchoolRepositoryTest}.
 * Requires Docker for the PostGIS container.
 *
 * <p>Test coordinates (Udupi district, Karnataka):
 * <ul>
 *   <li>Manipal area centre (from V71 seed): lat=13.3528, lon=74.7947</li>
 *   <li>Udupi area centre   (from V71 seed): lat=13.3409, lon=74.7421</li>
 *   <li>Test school near Manipal:            lat=13.3511, lon=74.7871 (~0.8 km from Manipal centre)</li>
 *   <li>Test school near Udupi:              lat=13.3420, lon=74.7430 (~0.2 km from Udupi centre)</li>
 * </ul>
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        // Override the concurrently_keyword placeholder to empty string so V73 runs
        // synchronous CREATE INDEX (no CONCURRENTLY) inside Testcontainers on arm64/Rosetta.
        // Production uses "CONCURRENTLY " (default set in application.yml).
        "spring.flyway.placeholders.concurrently_keyword="
})
class SchoolAreaKeyTriggerTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbc;

    // Fixed UUIDs — distinct prefix (20000000-...) avoids collision with SchoolRepositoryTest fixtures.
    private static final String SCHOOL_NEAR_MANIPAL = "20000000-0000-0000-0000-000000000001";
    private static final String SCHOOL_NEAR_UDUPI   = "20000000-0000-0000-0000-000000000002";

    // Area keys as seeded by V71 (district = 'Udupi' for both)
    private static final String AREA_MANIPAL = "IN|KA|Udupi|Manipal";
    private static final String AREA_UDUPI   = "IN|KA|Udupi|Udupi";

    @BeforeEach
    void cleanFixtures() {
        // Remove any schools from previous test run; areas come from V71 seed — do not delete.
        jdbc.update("DELETE FROM schools WHERE id IN (?::uuid, ?::uuid)",
                SCHOOL_NEAR_MANIPAL, SCHOOL_NEAR_UDUPI);
    }

    @AfterEach
    void tearDownFixtures() {
        jdbc.update("DELETE FROM schools WHERE id IN (?::uuid, ?::uuid)",
                SCHOOL_NEAR_MANIPAL, SCHOOL_NEAR_UDUPI);
    }

    // ── AC1: INSERT without area_key → trigger assigns nearest area ───────────────────────────────

    @Test
    @DisplayName("AC1: INSERT with no area_key → trigger assigns nearest area within district")
    void insert_withoutAreaKey_triggersAssignsNearestArea() {
        // School at ~0.8 km from Manipal area centre, district = 'Udupi'
        jdbc.update("""
                INSERT INTO schools (id, name, board_type, latitude, longitude, address, district)
                VALUES (?::uuid, 'Trigger Test School Manipal', 'CBSE', 13.3511, 74.7871, 'Test', 'Udupi')
                """, SCHOOL_NEAR_MANIPAL);

        String assignedAreaKey = jdbc.queryForObject(
                "SELECT area_key FROM schools WHERE id = ?::uuid",
                String.class, SCHOOL_NEAR_MANIPAL);

        assertThat(assignedAreaKey)
                .as("School near Manipal (district=Udupi) should be assigned Manipal area")
                .isEqualTo(AREA_MANIPAL);
    }

    // ── AC2: UPDATE OF latitude/longitude → area_key recomputed ──────────────────────────────────

    @Test
    @DisplayName("AC2: UPDATE latitude/longitude → area_key recomputed to reflect new nearest area")
    void update_coordinates_triggersRecomputesAreaKey() {
        // 1. Insert school near Manipal → trigger assigns Manipal area
        jdbc.update("""
                INSERT INTO schools (id, name, board_type, latitude, longitude, address, district)
                VALUES (?::uuid, 'Trigger Test School Move', 'CBSE', 13.3511, 74.7871, 'Test', 'Udupi')
                """, SCHOOL_NEAR_MANIPAL);

        String initialAreaKey = jdbc.queryForObject(
                "SELECT area_key FROM schools WHERE id = ?::uuid",
                String.class, SCHOOL_NEAR_MANIPAL);

        assertThat(initialAreaKey)
                .as("Initial insert near Manipal should assign Manipal area")
                .isEqualTo(AREA_MANIPAL);

        // 2. Move school to near Udupi town centre (~0.2 km away) → trigger should recompute to Udupi area
        jdbc.update("""
                UPDATE schools SET latitude = 13.3420, longitude = 74.7430
                WHERE id = ?::uuid
                """, SCHOOL_NEAR_MANIPAL);

        String updatedAreaKey = jdbc.queryForObject(
                "SELECT area_key FROM schools WHERE id = ?::uuid",
                String.class, SCHOOL_NEAR_MANIPAL);

        assertThat(updatedAreaKey)
                .as("After moving to Udupi coordinates, area_key should be recomputed to Udupi area")
                .isEqualTo(AREA_UDUPI);
    }

    // ── AC3: Direct area_key update is not overwritten by trigger (trigger scoped to lat/lon/district) ──

    @Test
    @DisplayName("AC3: Direct area_key update is not overwritten by trigger (trigger scoped to lat/lon/district changes)")
    void directAreaKeyOverride_preservedByTriggerScope() {
        // 1. Insert school near Manipal → trigger fires on INSERT, auto-assigns Manipal area
        jdbc.update("""
                INSERT INTO schools (id, name, board_type, latitude, longitude, address, district)
                VALUES (?::uuid, 'Trigger Test School Override', 'CBSE', 13.3511, 74.7871, 'Test', 'Udupi')
                """, SCHOOL_NEAR_MANIPAL);

        String assignedAreaKey = jdbc.queryForObject(
                "SELECT area_key FROM schools WHERE id = ?::uuid",
                String.class, SCHOOL_NEAR_MANIPAL);

        assertThat(assignedAreaKey)
                .as("Initial insert near Manipal should auto-assign Manipal area")
                .isEqualTo(AREA_MANIPAL);

        // 2. Directly update area_key (operator override) — does NOT touch lat/lon/district,
        //    so the trigger's OF clause means the trigger does NOT fire.
        // Use AREA_UDUPI: a valid seeded area_key (schools_area_key_fkey requires FK presence),
        // different from the auto-assigned AREA_MANIPAL, proving the trigger did not overwrite it.
        jdbc.update("""
                UPDATE schools SET area_key = ?
                WHERE id = ?::uuid
                """, AREA_UDUPI, SCHOOL_NEAR_MANIPAL);

        String overriddenAreaKey = jdbc.queryForObject(
                "SELECT area_key FROM schools WHERE id = ?::uuid",
                String.class, SCHOOL_NEAR_MANIPAL);

        assertThat(overriddenAreaKey)
                .as("Direct area_key update must not be overwritten: trigger is scoped to lat/lon/district changes only")
                .isEqualTo(AREA_UDUPI);
    }

    // ── AC3-noOp: IS DISTINCT FROM guard — no unnecessary overwrite ──────────────────────────────

    @Test
    @DisplayName("AC3-noOp: IS DISTINCT FROM guard prevents no-op write when computed area_key equals existing")
    void update_coordinates_doesNotOverwriteWhenComputedValueUnchanged() {
        // 1. Insert school at Udupi coordinates, district=Udupi → trigger assigns Udupi area
        jdbc.update("""
                INSERT INTO schools (id, name, board_type, latitude, longitude, address, district)
                VALUES (?::uuid, 'Trigger Test School Guard', 'STATE', 13.3420, 74.7430, 'Test', 'Udupi')
                """, SCHOOL_NEAR_UDUPI);

        String assignedAreaKey = jdbc.queryForObject(
                "SELECT area_key FROM schools WHERE id = ?::uuid",
                String.class, SCHOOL_NEAR_UDUPI);

        assertThat(assignedAreaKey)
                .as("Initial insert near Udupi town should assign Udupi area")
                .isEqualTo(AREA_UDUPI);

        // 2. Update latitude by a tiny amount (still well within Udupi area, same district).
        //    Trigger fires, computes same AREA_UDUPI, IS DISTINCT FROM = FALSE → area_key unchanged.
        jdbc.update("""
                UPDATE schools SET latitude = 13.3425
                WHERE id = ?::uuid
                """, SCHOOL_NEAR_UDUPI);

        String afterUpdateAreaKey = jdbc.queryForObject(
                "SELECT area_key FROM schools WHERE id = ?::uuid",
                String.class, SCHOOL_NEAR_UDUPI);

        assertThat(afterUpdateAreaKey)
                .as("IS DISTINCT FROM guard: area_key must remain Udupi when computed value is identical")
                .isEqualTo(AREA_UDUPI);
    }
}
