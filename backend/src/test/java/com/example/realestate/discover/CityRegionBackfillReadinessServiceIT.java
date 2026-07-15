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

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration test for {@link CityRegionBackfillReadinessService} (#1907).
 *
 * <p>Mirrors {@code V113CityRegionGeometryMigrationIT} / {@code CityRegionOnboardingSafetyIT}'s
 * Postgres-container setup. V113 seeds a {@code city_region_policy} row for both
 * {@code bangalore} and {@code udupi} but leaves {@code city_regions} empty for both — this
 * test seeds a {@code city_regions} row for one city to simulate an onboarded ("healthy") city
 * and leaves the other stale, then asserts the service reports only the stale one.
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
class CityRegionBackfillReadinessServiceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private CityRegionBackfillReadinessService service;

    @BeforeEach
    void setUp() {
        service = new CityRegionBackfillReadinessService(jdbcTemplate);
        // Start from the post-V113 baseline: no city_regions rows for any city.
        jdbcTemplate.update("DELETE FROM city_regions");
    }

    private void markCityOnboarded(String citySlug) {
        Integer cityId = jdbcTemplate.queryForObject(
                "SELECT id FROM cities WHERE slug = ?", Integer.class, citySlug);
        jdbcTemplate.update(
                "INSERT INTO city_regions (city_id, region_key, display_label, display_order) "
                        + "VALUES (?, 'N', 'North', 1)",
                cityId);
    }

    @Test
    @DisplayName("returns only the policy-seeded city that has zero city_regions rows")
    void findCitiesPendingBackfill_returnsOnlyStaleCity() {
        markCityOnboarded("udupi");
        // bangalore intentionally left with zero city_regions rows (stale).

        List<String> staleCities = service.findCitiesPendingBackfill();

        assertThat(staleCities).containsExactly("bangalore");
    }

    @Test
    @DisplayName("returns empty list once every policy-seeded city has at least one city_regions row")
    void findCitiesPendingBackfill_emptyWhenAllOnboarded() {
        markCityOnboarded("bangalore");
        markCityOnboarded("udupi");

        assertThat(service.findCitiesPendingBackfill()).isEmpty();
    }

    @Test
    @DisplayName("returns both policy-seeded cities when neither has been onboarded")
    void findCitiesPendingBackfill_returnsBothWhenNeitherOnboarded() {
        // No markCityOnboarded calls — both bangalore and udupi remain stale, matching the
        // real pre-#1907-fix production/dev state described in the issue.
        assertThat(service.findCitiesPendingBackfill()).containsExactlyInAnyOrder("bangalore", "udupi");
    }
}
