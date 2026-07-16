package com.example.realestate.discover;

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

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Repository-level integration test for {@link RegionalClassificationBackfillService} and
 * {@link RegionalAreaGroupsService} (#1642).
 *
 * <p>Proves that after the regional classification backfill runner/service executes against a real
 * PostGIS database containing LIVE agricultural land listings, non-empty regional corridor groups
 * are returned for discovery queries.
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
class RegionalClassificationBackfillIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String BRAHMAVAR = "IN|KA|Udupi|Brahmavar";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private RegionalClassificationBackfillService backfillService;
    private RegionalAreaGroupsService regionalAreaGroupsService;

    @BeforeEach
    void setUp() {
        backfillService = new RegionalClassificationBackfillService(jdbcTemplate);
        regionalAreaGroupsService = new RegionalAreaGroupsService(jdbcTemplate);
        jdbcTemplate.update("DELETE FROM property_listings");
    }

    @Test
    @DisplayName("backfill computes classifications and enables non-empty regional agri groups")
    void backfillAndQuery_returnsNonEmptyRegionalGroups() {
        // Insert a LIVE agricultural listing in Brahmavar (North of Udupi city)
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, land_area, land_area_unit, "
                        + " latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'agricultural_land', 5, 'acre', 13.43, 74.75, ?, ?)",
                UUID.randomUUID(), BRAHMAVAR, now, now);

        // Run the regional classification backfill
        int upserted = backfillService.runBackfill();
        assertThat(upserted).as("classifications computed for seeded Udupi areas").isGreaterThanOrEqualTo(12);

        // Query regional area groups for Udupi agricultural listings
        RegionalAreaGroupsResponse response = regionalAreaGroupsService.getRegionalGroups("udupi", "agricultural_land");

        assertThat(response).isNotNull();
        assertThat(response.city()).isEqualTo("udupi");
        assertThat(response.groups()).isNotEmpty();

        // Verify that North direction group exists and has our listing
        boolean foundNorthGroup = response.groups().stream()
                .anyMatch(g -> "N".equals(g.directionCode()) && !g.availableMaxDistances().isEmpty());
        assertThat(foundNorthGroup).as("North corridor group contains live agri listing").isTrue();
    }

    // ── #1899: AREAS_FOR_CITY_SQL excludes non-active / missing-geometry areas ────

    @Test
    @DisplayName("backfill excludes MERGED and NULL-geo areas from regional_area_classifications")
    void runBackfill_excludesNonActiveAndMissingGeoAreas() {
        int cityId = insertCity("testcity-exclusion", 13.0, 74.0);

        insertArea("IN|KA|TestCity|Active", cityId, "ACTIVE", 13.10, 74.10);
        insertArea("IN|KA|TestCity|Merged", cityId, "MERGED", 13.20, 74.20);
        insertArea("IN|KA|TestCity|NullGeo", cityId, "ACTIVE", null, null);

        int upserted = backfillService.runBackfill("testcity-exclusion");

        assertThat(upserted).as("only the ACTIVE + full-geo area is classified").isEqualTo(1);

        List<String> classifiedAreaKeys = jdbcTemplate.queryForList(
                "SELECT area_key FROM regional_area_classifications WHERE city_key = ?",
                String.class, "testcity-exclusion");

        assertThat(classifiedAreaKeys)
                .as("MERGED and NULL-geo areas never reach the upsert — excluded from the query itself")
                .containsExactly("IN|KA|TestCity|Active");
    }

    // ── #1899: city-slug scoping isolation on real Postgres ───────────────────────

    @Test
    @DisplayName("city-scoped backfill is idempotent and never touches another city's classifications")
    void runBackfill_cityScoping_idempotentAndIsolatedAcrossCities() {
        int cityAId = insertCity("testcity-a", 13.0, 74.0);
        int cityBId = insertCity("testcity-b", 14.0, 75.0);

        insertArea("IN|KA|TestA|Zone1", cityAId, "ACTIVE", 13.10, 74.10);
        insertArea("IN|KA|TestB|Zone1", cityBId, "ACTIVE", 14.10, 75.10);

        // First run scoped to city A: only A gets classified.
        int upsertedA1 = backfillService.runBackfill("testcity-a");
        assertThat(upsertedA1).isEqualTo(1);
        assertThat(countClassifications("testcity-a")).isEqualTo(1);
        assertThat(countClassifications("testcity-b"))
                .as("city-A-scoped run must never touch city B").isZero();

        // Then run scoped to city B: only B gets classified; A is untouched.
        int upsertedB1 = backfillService.runBackfill("testcity-b");
        assertThat(upsertedB1).isEqualTo(1);
        assertThat(countClassifications("testcity-a"))
                .as("city-B-scoped run must never touch city A").isEqualTo(1);
        assertThat(countClassifications("testcity-b")).isEqualTo(1);

        // Re-run scoped to city A: idempotent upsert — row count unchanged, still isolated from B.
        int upsertedA2 = backfillService.runBackfill("testcity-a");
        assertThat(upsertedA2).isEqualTo(1);
        assertThat(countClassifications("testcity-a"))
                .as("ON CONFLICT upsert keeps exactly one row per (city_key, area_key)").isEqualTo(1);
        assertThat(countClassifications("testcity-b"))
                .as("re-running city A must never touch city B").isEqualTo(1);
    }

    // ── seeding helpers ─────────────────────────────────────────────────────────

    private int insertCity(String slug, double lat, double lon) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, true) RETURNING id",
                Integer.class, slug, slug, lat, lon);
    }

    private void insertArea(String areaKey, int cityId, String lifecycleStatus, Double lat, Double lon) {
        jdbcTemplate.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon, lifecycle_status) "
                        + "VALUES (?, ?, ?, ?, ?, ?)",
                areaKey, cityId, areaKey, lat, lon, lifecycleStatus);
    }

    private int countClassifications(String citySlug) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM regional_area_classifications WHERE city_key = ?",
                Integer.class, citySlug);
        return count == null ? 0 : count;
    }
}
