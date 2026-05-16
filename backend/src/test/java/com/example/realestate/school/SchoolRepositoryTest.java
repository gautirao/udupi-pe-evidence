package com.example.realestate.school;

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

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for {@link SchoolRepository#findNearbySchools} — verifies that the
 * stored {@code s.geog} geography column is used (issue #1063 fix) rather than a
 * recomputed {@code ST_Point(lon, lat)::geography} expression that defeated
 * {@code idx_schools_geog}.
 *
 * <p>Container image: {@code postgis/postgis:15-3.4-alpine} — required because V73 runs
 * {@code CREATE EXTENSION postgis} which is unavailable on plain {@code postgres:15-alpine}.
 *
 * <p>Runs under default {@code mvn test} (surefire) via {@code @DataJpaTest} +
 * {@code @Testcontainers}. Not tagged {@code integration} — surefire's
 * {@code excludedGroups=integration} does not apply. Requires Docker for the PostGIS container.
 *
 * <p>Coordinate reference (Udupi / Manipal area, Karnataka, India):
 * <ul>
 *   <li>Manipal centre:     lat=13.3511, lon=74.7871
 *   <li>Udupi town centre:  lat=13.3409, lon=74.7421  (~5.4 km from Manipal)
 *   <li>Brahmavar:          lat=13.4287, lon=74.7614  (~9.3 km from Manipal)
 *   <li>Kundapura:          lat=13.6237, lon=74.6901  (~31 km from Manipal — out of 10 km)
 * </ul>
 *
 * <p>Haversine reference distances from Manipal centre (13.3511, 74.7871):
 * <ul>
 *   <li>Manipal school (same point): ~0 km
 *   <li>Udupi school:                ~5.4 km
 *   <li>Brahmavar school:            ~9.3 km
 *   <li>Kundapura school:            ~31.0 km  (outside any 10 km radius test)
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
        // V73 contains `-- flyway:no-transaction` + a transactional CREATE EXTENSION + a
        // non-transactional CREATE INDEX CONCURRENTLY. Spring Boot Flyway requires
        // `mixed=true` to honour this. Production sets it via sidecar conf; tests opt in here.
        "spring.flyway.mixed=true"
})
class SchoolRepositoryTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    private SchoolRepository schoolRepository;

    @Autowired
    private JdbcTemplate jdbc;

    // Fixed UUIDs so ON CONFLICT checks are deterministic across BeforeEach re-runs.
    private static final String ID_MANIPAL   = "10000000-0000-0000-0000-000000000001";
    private static final String ID_UDUPI     = "10000000-0000-0000-0000-000000000002";
    private static final String ID_BRAHMAVAR = "10000000-0000-0000-0000-000000000003";
    private static final String ID_KUNDAPURA = "10000000-0000-0000-0000-000000000004";

    @BeforeEach
    void seedFixtureSchools() {
        // Insert test schools at known Udupi-area coordinates.
        // Use INSERT ... ON CONFLICT DO NOTHING to keep BeforeEach idempotent.
        insertSchool(ID_MANIPAL,   "Test School Manipal",   "CBSE",  13.3511, 74.7871);
        insertSchool(ID_UDUPI,     "Test School Udupi",     "STATE", 13.3409, 74.7421);
        insertSchool(ID_BRAHMAVAR, "Test School Brahmavar", "ICSE",  13.4287, 74.7614);
        insertSchool(ID_KUNDAPURA, "Test School Kundapura", "STATE", 13.6237, 74.6901);
    }

    private void insertSchool(String id, String name, String board, double lat, double lon) {
        jdbc.update("""
                INSERT INTO schools (id, name, board_type, latitude, longitude, address)
                VALUES (?::uuid, ?, ?, ?, ?, 'Test fixture')
                ON CONFLICT (id) DO NOTHING
                """, id, name, board, lat, lon);
    }

    // ── Test #1: ordered by ascending distance ────────────────────────────────────────────────

    @Test
    @DisplayName("Test #1: findNearbySchools returns schools ordered by ascending distanceKm")
    void findNearbySchools_returnsResultsOrderedByAscendingDistance() {
        // Query from Manipal centre (13.3511, 74.7871), radius 20 km — should include
        // Manipal (~0 km), Udupi (~5.4 km), Brahmavar (~9.3 km); Kundapura (~31 km) excluded.
        List<SchoolRepository.NearbySchoolProjection> results =
                schoolRepository.findNearbySchools(13.3511, 74.7871, 20_000);

        // Filter to our fixture schools only (the V58 seed may contribute additional rows).
        List<SchoolRepository.NearbySchoolProjection> fixture = results.stream()
                .filter(s -> s.getName() != null && s.getName().startsWith("Test School "))
                .toList();

        assertThat(fixture)
                .as("should return exactly Manipal, Udupi, and Brahmavar within 20 km")
                .hasSizeGreaterThanOrEqualTo(3);

        // Verify ascending distance ordering across the fixture rows.
        List<Double> distances = fixture.stream()
                .map(SchoolRepository.NearbySchoolProjection::getDistanceKm)
                .toList();
        for (int i = 1; i < distances.size(); i++) {
            assertThat(distances.get(i))
                    .as("distanceKm at index %d (%.3f) must be >= index %d (%.3f)", i, distances.get(i), i - 1, distances.get(i - 1))
                    .isGreaterThanOrEqualTo(distances.get(i - 1));
        }

        // Sanity-check distance magnitudes against Haversine reference values (±0.3 km tolerance).
        SchoolRepository.NearbySchoolProjection manipal = fixture.stream()
                .filter(s -> "Test School Manipal".equals(s.getName())).findFirst().orElseThrow();
        SchoolRepository.NearbySchoolProjection udupi = fixture.stream()
                .filter(s -> "Test School Udupi".equals(s.getName())).findFirst().orElseThrow();
        SchoolRepository.NearbySchoolProjection brahmavar = fixture.stream()
                .filter(s -> "Test School Brahmavar".equals(s.getName())).findFirst().orElseThrow();

        assertThat(manipal.getDistanceKm())
                .as("Manipal school is at the query point — distanceKm must be < 0.01 km")
                .isLessThan(0.01);
        assertThat(udupi.getDistanceKm())
                .as("Udupi school Haversine reference ~5.4 km, tolerance ±0.3 km")
                .isBetween(5.1, 5.7);
        assertThat(brahmavar.getDistanceKm())
                .as("Brahmavar school Haversine reference ~9.3 km, tolerance ±0.3 km")
                .isBetween(9.0, 9.6);
    }

    // ── Test #2: tiny radius returns only the nearest school ─────────────────────────────────

    @Test
    @DisplayName("Test #2: 100 m radius around Manipal returns only the Manipal school")
    void findNearbySchools_tinyRadius_returnsOnlyNearestSchool() {
        // 100 m radius around Manipal centre. Only "Test School Manipal" is within 100 m;
        // Udupi school is ~5.4 km away.
        List<SchoolRepository.NearbySchoolProjection> results =
                schoolRepository.findNearbySchools(13.3511, 74.7871, 100);

        List<String> fixtureNames = results.stream()
                .map(SchoolRepository.NearbySchoolProjection::getName)
                .filter(n -> n != null && n.startsWith("Test School "))
                .toList();

        assertThat(fixtureNames)
                .as("Only Manipal school sits within 100 m of the Manipal query point")
                .containsExactly("Test School Manipal");
    }

    // ── Test #3: Kundapura (31 km away) excluded from 10 km radius ───────────────────────────

    @Test
    @DisplayName("Test #3: Kundapura school (~31 km) is excluded from a 10 km radius query")
    void findNearbySchools_kundapuraExcludedOutsideRadius() {
        List<SchoolRepository.NearbySchoolProjection> results =
                schoolRepository.findNearbySchools(13.3511, 74.7871, 10_000);

        List<String> fixtureNames = results.stream()
                .map(SchoolRepository.NearbySchoolProjection::getName)
                .filter(n -> n != null && n.startsWith("Test School "))
                .toList();

        assertThat(fixtureNames)
                .as("Kundapura (~31 km) must be excluded from 10 km radius")
                .doesNotContain("Test School Kundapura");
        assertThat(fixtureNames)
                .as("Manipal, Udupi, Brahmavar must all be within 10 km")
                .contains("Test School Manipal", "Test School Udupi", "Test School Brahmavar");
    }

    // ── Test #4: geog NOT NULL invariant ─────────────────────────────────────────────────────

    @Test
    @DisplayName("Test #4: schools.geog IS NOT NULL for all rows (V75 GENERATED ALWAYS assumption)")
    void schools_geogIsNeverNull() {
        // This locks in the assumption the fix depends on:
        // V75 declares geog GENERATED ALWAYS AS (ST_MakePoint(longitude, latitude)::geography) STORED
        // from NOT NULL lat/lon columns (V58), so the count of NULL geog rows must be zero.
        Integer nullGeogCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM schools WHERE geog IS NULL", Integer.class);

        assertThat(nullGeogCount)
                .as("schools.geog must never be NULL — V75 GENERATED ALWAYS STORED from NOT NULL lat/lon (V58)")
                .isEqualTo(0);
    }
}
