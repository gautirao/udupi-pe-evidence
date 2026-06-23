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
 * Integration test for group-scoped areaKeys filtering across both the
 * listings and markers service paths.
 *
 * <p>Seeds three listings across three distinct area_keys within the same city
 * (all resolvable via the Udupi seed in V71). Queries with a two-area group's
 * areaKeys and asserts:
 * <ol>
 *   <li>Only the two member-area listings come back — the third (non-member) is excluded.</li>
 *   <li>The markers endpoint honours the same filter.</li>
 *   <li>areaKeys=null returns all three (backward-compat).</li>
 * </ol>
 *
 * <p>Value-distinct assertion: the three listings have distinguishable area_keys
 * (Manipal, Katapadi, Udupi) so an accidental full-city result would return
 * all three — a count-match alone is insufficient.
 *
 * <p>Mirrors {@code DiscoverMarkersIT} harness: {@code @DataJpaTest} +
 * {@code postgis/postgis:15-3.4}, no DB replacement, empty
 * {@code concurrently_keyword} placeholder so V73's CONCURRENTLY index runs
 * inside Flyway's transaction.
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
class GroupAreaKeyFilterIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    // Three distinct area_keys seeded by V71 (all belong to city slug = 'udupi').
    private static final String AREA_MANIPAL   = "IN|KA|Udupi|Manipal";
    private static final String AREA_KATAPADI  = "IN|KA|Udupi|Katapadi";
    private static final String AREA_UDUPI     = "IN|KA|Udupi|Udupi";
    private static final String CITY           = "udupi";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private DiscoverListingsService listingsService;
    private DiscoverMarkersService markersService;

    @BeforeEach
    void setUp() {
        listingsService = new DiscoverListingsService(jdbcTemplate, new SimpleMeterRegistry());
        markersService  = new DiscoverMarkersService(jdbcTemplate, new SimpleMeterRegistry());
        jdbcTemplate.update("DELETE FROM property_listings");

        // Seed three LIVE house listings, one per area_key.
        // Value-distinct: each has a different area_key so we can assert membership precisely.
        insertListing(AREA_MANIPAL);
        insertListing(AREA_KATAPADI);
        insertListing(AREA_UDUPI);  // not in the group being queried
    }

    // ── Listings path ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("listings: areaKeys=[Manipal,Katapadi] returns only those two listings")
    void listings_withGroupAreaKeys_returnsOnlyMemberAreaListings() {
        DiscoverListingsQuery query = listingsQuery(List.of(AREA_MANIPAL, AREA_KATAPADI));

        DiscoverListingsPage page = listingsService.getListings(query);

        assertThat(page.content()).hasSize(2);
        List<String> returnedAreaKeys = page.content().stream()
                .map(DiscoverListingResponse::areaKey)
                .toList();
        assertThat(returnedAreaKeys)
                .as("Only Manipal and Katapadi listings must be returned")
                .containsExactlyInAnyOrder(AREA_MANIPAL, AREA_KATAPADI);
        // Explicit non-member exclusion — not just a count test
        assertThat(returnedAreaKeys)
                .as("Udupi (non-member area) must NOT appear in results")
                .doesNotContain(AREA_UDUPI);
    }

    @Test
    @DisplayName("listings: areaKeys=null returns all three (backward-compat)")
    void listings_withNullAreaKeys_returnsAllListings() {
        DiscoverListingsQuery query = listingsQuery(null);

        DiscoverListingsPage page = listingsService.getListings(query);

        assertThat(page.content()).hasSize(3);
    }

    // ── Markers path ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("markers: areaKeys=[Manipal,Katapadi] returns only those two markers")
    void markers_withGroupAreaKeys_returnsOnlyMemberAreaMarkers() {
        DiscoverListingPredicateBuilder.Filters filters = markersFilters(
                List.of(AREA_MANIPAL, AREA_KATAPADI));

        DiscoverMarkersResponse response = markersService.getMarkers(filters);

        assertThat(response.markers()).hasSize(2);
        List<String> returnedPropertyTypes = response.markers().stream()
                .map(DiscoverMarker::propertyType)
                .toList();
        // All returned markers are house (the seeded property type)
        assertThat(returnedPropertyTypes).allMatch("house"::equals);

        // Verify by total: all three exist in city; only two returned
        assertThat(response.totalFilteredElements())
                .as("Only 2 of the 3 seeded listings should match")
                .isEqualTo(2L);
    }

    @Test
    @DisplayName("markers: areaKeys=null returns all three (backward-compat)")
    void markers_withNullAreaKeys_returnsAllMarkers() {
        DiscoverListingPredicateBuilder.Filters filters = markersFilters(null);

        DiscoverMarkersResponse response = markersService.getMarkers(filters);

        assertThat(response.markers()).hasSize(3);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private DiscoverListingsQuery listingsQuery(List<String> areaKeys) {
        return new DiscoverListingsQuery(
                CITY,
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null,
                0, 20, false, null,
                areaKeys
        );
    }

    private DiscoverListingPredicateBuilder.Filters markersFilters(List<String> areaKeys) {
        return new DiscoverListingPredicateBuilder.Filters(
                CITY,
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null, null, null,
                areaKeys
        );
    }

    private void insertListing(String areaKey) {
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
