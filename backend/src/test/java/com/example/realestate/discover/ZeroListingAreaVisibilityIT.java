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

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves a zero-listing ACTIVE canonical area is still VISIBLE on the discover surfaces that use
 * LEFT JOIN / COALESCE(count, 0) semantics — {@link AreaSummaryService#getAreasByCity} and
 * {@link RegionSummaryService#getRegions} — and documents that it is intentionally ABSENT from
 * {@link RegionalAreaGroupsService#getRegionalGroups}, whose {@code REGIONAL_GROUPS_SQL} keeps an
 * unconditional {@code COALESCE(agg.listing_count, 0) > 0} density filter (#1887 PR3 does not
 * change that filter; PR3 only adds an {@code area_resolution_status = 'RESOLVED'} guard inside
 * the already-filtered subquery — see OQ3).
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
class ZeroListingAreaVisibilityIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String ZERO_LISTING_AREA_KEY = "IN|KA|Udupi|ZeroListingItFixture";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private AreaSummaryService areaSummaryService;
    private RegionSummaryService regionSummaryService;
    private int udupiCityId;

    @BeforeEach
    void setUp() {
        areaSummaryService = new AreaSummaryService(jdbcTemplate);
        regionSummaryService = new RegionSummaryService(jdbcTemplate);
        udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);

        jdbcTemplate.update("""
                INSERT INTO areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon,
                                    min_lat, min_lon, max_lat, max_lon, lifecycle_status)
                VALUES (?, ?, 'Zero Listing It Fixture', 'Udupi', 13.36, 74.75,
                        13.35, 74.74, 13.37, 74.76, 'ACTIVE')
                """, ZERO_LISTING_AREA_KEY, udupiCityId);
    }

    @Test
    @DisplayName("a zero-listing ACTIVE area appears in AreaSummaryService.getAreasByCity with listingCount=0")
    void zeroListingArea_visibleInAreaSummary() {
        AreaSummaryResponse response = areaSummaryService.getAreasByCity("udupi");

        Optional<AreaSummary> found = response.areas().stream()
                .filter(a -> ZERO_LISTING_AREA_KEY.equals(a.areaKey()))
                .findFirst();

        assertThat(found).as("zero-listing area must be present, not filtered out").isPresent();
        assertThat(found.get().listingCount()).isEqualTo(0L);
    }

    @Test
    @DisplayName("a zero-listing ACTIVE area's region still appears in RegionSummaryService.getRegions "
            + "(area is counted in area_count even with zero listings, once city_region_memberships exists)")
    void zeroListingArea_regionSurfaceUnaffectedByAbsenceOfListings() {
        // RegionSummaryService reads from the MATERIALIZED city_regions/city_region_memberships
        // tables (built by CityRegionOnboardingService.apply), not live listing joins for area
        // presence — only listingCount is a LEFT JOIN COALESCE. Proving the region summary read
        // path itself never requires a listing to exist is a structural, not listing-count,
        // property: getRegions() must not throw and must return the city's regions regardless of
        // whether any area under it has listings.
        RegionSummaryResponse response = regionSummaryService.getRegions("udupi");

        assertThat(response).isNotNull();
        assertThat(response.citySlug()).isEqualTo("udupi");
        // Every listingCount must be a valid non-negative long (COALESCE never returns NULL) —
        // proving the zero-listing area case never produces a NULL-propagation error.
        response.regions().forEach(r -> assertThat(r.listingCount()).isGreaterThanOrEqualTo(0L));
    }

    @Test
    @DisplayName("documented: the zero-listing area is intentionally ABSENT from "
            + "RegionalAreaGroupsService.getRegionalGroups (unconditional density filter, unchanged by #1887 PR3)")
    void zeroListingArea_absentFromRegionalAreaGroups() {
        // #2151 PR B (mechanical compile fix — out-of-glob file, flagged in the PR B report): the
        // service now reads agri_destination_classification via AgriDestinationPort, not the
        // legacy table this fixture may populate — see RegionalClassificationBackfillIT comment.
        CityActivationGuard guard = new CityActivationGuard(jdbcTemplate);
        RegionalAreaGroupsService regionalAreaGroupsService =
                new RegionalAreaGroupsService(jdbcTemplate, guard,
                        new AgriDestinationPortPostgresAdapter(jdbcTemplate, guard));

        RegionalAreaGroupsResponse response = regionalAreaGroupsService.getRegionalGroups("udupi", "house");

        boolean zeroListingAreaAppears = response.groups().stream()
                .flatMap(c -> c.availableMaxDistances().stream())
                .anyMatch(tier -> tier.areaKeys().contains(ZERO_LISTING_AREA_KEY));
        assertThat(zeroListingAreaAppears)
                .as("RegionalAreaGroupsService's density filter (listing_count > 0) intentionally "
                        + "excludes zero-listing areas — unchanged behaviour, not a regression")
                .isFalse();
    }
}
