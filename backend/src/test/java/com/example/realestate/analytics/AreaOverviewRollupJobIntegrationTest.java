package com.example.realestate.analytics;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for {@link AreaOverviewRollupJob}.
 *
 * <p>Seeds 3 listings for {@code IN|KA|Udupi|Manipal}, runs the rollup job,
 * and asserts that both the locality row and its rolled-up district row are
 * correct.
 *
 * <p>Requires Docker. Skipped automatically when Docker is unavailable
 * ({@code disabledWithoutDocker = true}).
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration"
})
@Import(AreaOverviewRollupJob.class)
class AreaOverviewRollupJobIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private AreaOverviewRollupJob job;

    @Test
    @DisplayName("locality row has correct stats for 3 seeded listings")
    void localityRow_hasCorrectStats() {
        seedListings();

        job.run();

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT listing_count_90d, median_price_paise, price_p10_paise, "
                        + "price_p90_paise, confidence_tier, area_level, district_area_key "
                        + "FROM area_overview_stats WHERE area_key = ?",
                "IN|KA|Udupi|Manipal");

        assertThat(row.get("area_level")).isEqualTo("locality");
        assertThat(row.get("listing_count_90d")).isEqualTo(3);
        assertThat(row.get("confidence_tier")).isEqualTo("fallback"); // 3 < 5

        // Median of [300000, 400000, 500000] = 400000
        long median = ((Number) row.get("median_price_paise")).longValue();
        assertThat(median).isEqualTo(400_000L);

        // P10 must be <= median, P90 must be >= median
        long p10 = ((Number) row.get("price_p10_paise")).longValue();
        long p90 = ((Number) row.get("price_p90_paise")).longValue();
        assertThat(p10).isLessThanOrEqualTo(400_000L);
        assertThat(p90).isGreaterThanOrEqualTo(400_000L);

        // district_area_key must be the 3-segment district key
        assertThat(row.get("district_area_key")).isEqualTo("IN|KA|Udupi");
    }

    @Test
    @DisplayName("district row exists and rolls up the same 3 listings")
    void districtRow_existsWithCorrectCount() {
        seedListings();

        job.run();

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT listing_count_90d, area_level "
                        + "FROM area_overview_stats WHERE area_key = ?",
                "IN|KA|Udupi");

        assertThat(row.get("area_level")).isEqualTo("district");
        assertThat(row.get("listing_count_90d")).isEqualTo(3);
    }

    @Test
    @DisplayName("nearby_area_keys is null or empty when only one locality exists")
    void nearbyAreaKeys_nullOrEmptyWithSingleLocality() {
        seedListings();

        job.run();

        // With only one locality in the table there are no neighbours to aggregate,
        // so nearby_area_keys must be NULL (the ARRAY_AGG over an empty set returns NULL).
        Integer nearbyCount = jdbcTemplate.queryForObject(
                "SELECT array_length(nearby_area_keys, 1) "
                        + "FROM area_overview_stats WHERE area_key = ?",
                Integer.class,
                "IN|KA|Udupi|Manipal");

        assertThat(nearbyCount).isNull();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Inserts 3 LIVE listings in {@code IN|KA|Udupi|Manipal} within the last 90 days.
     * Prices are 300 000, 400 000, and 500 000 paise.
     */
    private void seedListings() {
        OffsetDateTime now = OffsetDateTime.now();
        long[] prices = {300_000L, 400_000L, 500_000L};
        for (long price : prices) {
            jdbcTemplate.update(
                    "INSERT INTO public.property_listings "
                            + "(id, area_key, price_per_cent_paise, status, "
                            + " is_duplicate, is_valid, property_type, "
                            + " latitude, longitude, created_at, updated_at) "
                            + "VALUES (?, ?, ?, 'LIVE', false, true, 'house', "
                            + "        13.35, 74.79, ?, ?)",
                    UUID.randomUUID(),
                    "IN|KA|Udupi|Manipal",
                    price,
                    now,
                    now);
        }
    }
}
