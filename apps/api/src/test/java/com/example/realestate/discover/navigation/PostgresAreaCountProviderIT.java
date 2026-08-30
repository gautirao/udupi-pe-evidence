package com.example.realestate.discover.navigation;

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
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration test (real Postgres) for {@link PostgresAreaCountProvider} (#1955
 * Areas PR A, SLICE 2e, AC12) — the ONE area-level {@code GROUP BY} aggregation query underlying
 * both {@link com.example.realestate.discover.DiscoverSummaryService} and {@link
 * AreaCountRollupService}. Mirrors {@code DiscoverSummaryServiceIT}'s harness (V71-seeded Udupi
 * fixtures, Flyway to latest).
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
class PostgresAreaCountProviderIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY = "udupi";
    private static final String MANIPAL = "IN|KA|Udupi|Manipal";
    private static final String KATAPADI = "IN|KA|Udupi|Katapadi";
    private static final String MALFORMED = "IN|KA|Udupi";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private PostgresAreaCountProvider provider;

    @BeforeEach
    void setUp() {
        provider = new PostgresAreaCountProvider(jdbcTemplate);
        jdbcTemplate.update("DELETE FROM property_listings");
    }

    private void insertListing(String areaKey, String propertyType, String status, boolean duplicate, String purpose) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, listing_purpose, latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, ?, NULL, ?, true, ?, ?, 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, status, duplicate, propertyType, purpose, now, now);
    }

    @Test
    @DisplayName("countsByAreaKey: one row per area with >=1 matching listing; zero-match areas absent")
    void countsByAreaKey_perAreaGrouping_excludesNoiseAndMalformedKey() {
        insertListing(MANIPAL, "house", "LIVE", false, "sale");
        insertListing(MANIPAL, "house", "LIVE", false, "sale");
        insertListing(KATAPADI, "apartment", "LIVE", false, "rent");
        insertListing(MANIPAL, "house", "DRAFT", false, "sale");          // excluded: status
        insertListing(MANIPAL, "house", "LIVE", true, "sale");            // excluded: duplicate
        insertListing(MALFORMED, "house", "LIVE", false, "sale");         // excluded: 4-part guard

        Map<String, Long> counts = provider.countsByAreaKey(AreaCountQuery.blended(CITY));

        assertThat(counts).containsEntry(MANIPAL, 2L);
        assertThat(counts).containsEntry(KATAPADI, 1L);
        assertThat(counts).doesNotContainKey(MALFORMED);
        assertThat(counts.values().stream().mapToLong(Long::longValue).sum()).isEqualTo(3L);
    }

    @Test
    @DisplayName("countsByAreaKey: propertyType and listingPurpose filters apply independently")
    void countsByAreaKey_propertyTypeAndPurposeFiltersApplyIndependently() {
        insertListing(MANIPAL, "house", "LIVE", false, "sale");
        insertListing(MANIPAL, "apartment", "LIVE", false, "rent");
        insertListing(KATAPADI, "house", "LIVE", false, "rent");

        Map<String, Long> houseOnly = provider.countsByAreaKey(
                AreaCountQuery.blended(CITY).withPropertyTypes(List.of("house")));
        Map<String, Long> saleOnly = provider.countsByAreaKey(
                AreaCountQuery.blended(CITY).withListingPurpose("sale"));

        assertThat(houseOnly).containsEntry(MANIPAL, 1L).containsEntry(KATAPADI, 1L);
        assertThat(saleOnly).containsExactlyEntriesOf(Map.of(MANIPAL, 1L));
    }

    @Test
    @DisplayName("countsByAreaKey: unknown/inactive city yields an empty map, not an error")
    void countsByAreaKey_unknownCity_returnsEmptyMap() {
        insertListing(MANIPAL, "house", "LIVE", false, "sale");

        Map<String, Long> counts = provider.countsByAreaKey(AreaCountQuery.blended("nowhere-city"));

        assertThat(counts).isEmpty();
    }
}
