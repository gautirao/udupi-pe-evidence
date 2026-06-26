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
}
