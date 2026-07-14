package com.example.realestate.discover;

import org.assertj.core.data.Offset;
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
 * Testcontainers integration test for {@link RegionSummaryController} / {@link RegionSummaryService}
 * (#1882 Track A PR1) — GET /api/discover/cities/{citySlug}/regions.
 *
 * <p>Exercises the controller method directly against a real Postgres/PostGIS database (rather
 * than through MockMvc/HTTP) — the same "least context that proves the contract" approach as
 * {@code DiscoverSummaryServiceIT}. {@link RegionSummaryControllerSecurityIT} separately proves
 * the HTTP-layer permitAll wiring with a {@code @WebMvcTest} slice.
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
class RegionSummaryControllerIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String MANIPAL = "IN|KA|Udupi|Manipal";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private RegionSummaryController controller;
    private CityRegionOnboardingService onboardingService;
    private RegionalClassificationBackfillService backfillService;
    private Integer udupiCityId;
    private Integer bangaloreCityId;

    @BeforeEach
    void setUp() {
        RegionSummaryService regionSummaryService = new RegionSummaryService(jdbcTemplate);
        controller = new RegionSummaryController(regionSummaryService);
        onboardingService = new CityRegionOnboardingService(jdbcTemplate);
        backfillService = new RegionalClassificationBackfillService(jdbcTemplate);

        udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);
        bangaloreCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'bangalore'", Integer.class);

        jdbcTemplate.update("DELETE FROM property_listings");
        jdbcTemplate.update("DELETE FROM city_region_memberships WHERE city_id IN (?, ?)", udupiCityId, bangaloreCityId);
        jdbcTemplate.update("DELETE FROM city_regions WHERE city_id IN (?, ?)", udupiCityId, bangaloreCityId);
        jdbcTemplate.update("DELETE FROM regional_area_overrides WHERE city_id IN (?, ?)", udupiCityId, bangaloreCityId);
        jdbcTemplate.update("DELETE FROM regional_area_classifications WHERE city_key IN ('udupi', 'bangalore')");
        jdbcTemplate.update("UPDATE city_region_policy SET central_radius_km = 4, policy_fingerprint = NULL WHERE city_id = ?", udupiCityId);
        jdbcTemplate.update("UPDATE city_region_policy SET central_radius_km = 8, policy_fingerprint = NULL WHERE city_id = ?", bangaloreCityId);

        int upserted = backfillService.runBackfill();
        assertThat(upserted).isGreaterThan(0);
    }

    private void resolveNonUnifiedGroups(int cityId) {
        CityRegionOnboardingReport report = onboardingService.dryRun(cityId);
        for (CityRegionOnboardingReport.GroupCategorization g : report.groupCategorizations()) {
            if (g.category() == CityRegionOnboardingReport.GroupCategory.UNIFIED) {
                continue;
            }
            String targetRegion = !g.distinctRegionKeys().isEmpty()
                    ? g.distinctRegionKeys().get(0)
                    : CityRegionProjection.canonicalRegionOrder(report.regionModel()).get(0);
            for (String areaKey : g.memberAreaKeys()) {
                jdbcTemplate.update(
                        "INSERT INTO regional_area_overrides (city_id, area_key, forced_region_key, reason, author) "
                                + "VALUES (?, ?, ?, 'qa-it-resolve', 'qa') "
                                + "ON CONFLICT (city_id, area_key) DO UPDATE SET forced_region_key = EXCLUDED.forced_region_key",
                        cityId, areaKey, targetRegion);
            }
        }
    }

    private void insertLiveListing(String areaKey) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'house', 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, now, now);
    }

    @Test
    @DisplayName("returns the full canonical region set for bangalore in stable displayOrder")
    void returnsCanonicalRegionsInStableOrder_bangalore() {
        resolveNonUnifiedGroups(bangaloreCityId);
        onboardingService.apply(bangaloreCityId);

        RegionSummaryResponse response = controller.getRegions("bangalore");

        assertThat(response.citySlug()).isEqualTo("bangalore");
        assertThat(response.cityId()).isEqualTo(bangaloreCityId);
        assertThat(response.regions()).isNotEmpty();

        List<Integer> displayOrders = response.regions().stream()
                .map(RegionSummaryResponse.Region::displayOrder)
                .toList();
        List<Integer> sortedOrders = displayOrders.stream().sorted().toList();
        assertThat(displayOrders).as("regions arrive pre-sorted by displayOrder").isEqualTo(sortedOrders);

        List<String> expectedKeys = CityRegionProjection.canonicalRegionOrder("CENTRAL_CARDINAL_8");
        List<String> actualKeys = response.regions().stream().map(RegionSummaryResponse.Region::key).toList();
        assertThat(actualKeys).isEqualTo(expectedKeys);
    }

    @Test
    @DisplayName("listingCount is served from the Postgres materialization path; countStatus is OK")
    void listingCountServedFromPostgresPath_countStatusOk() {
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        insertLiveListing(MANIPAL);

        String manipalRegion = jdbcTemplate.queryForObject(
                "SELECT region_key FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                String.class, udupiCityId, MANIPAL);

        RegionSummaryResponse response = controller.getRegions("udupi");
        RegionSummaryResponse.Region region = response.regions().stream()
                .filter(r -> manipalRegion.equals(r.key()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("region " + manipalRegion + " not found"));

        assertThat(region.listingCount()).isEqualTo(1L);
        assertThat(region.countStatus()).isEqualTo("OK");
    }

    @Test
    @DisplayName("unknown citySlug returns 200-shaped empty response, not a 404/exception")
    void unknownCitySlugReturns200EmptyNot404() {
        RegionSummaryResponse response = controller.getRegions("nowhere-city");

        assertThat(response.cityId()).isNull();
        assertThat(response.citySlug()).isEqualTo("nowhere-city");
        assertThat(response.regions()).isEmpty();
    }

    @Test
    @DisplayName("a canonical region with zero listings is still returned, with listingCount=0")
    void zeroCountRegionStillReturned() {
        resolveNonUnifiedGroups(bangaloreCityId);
        onboardingService.apply(bangaloreCityId);
        // No property_listings inserted at all — every region must still be present.

        RegionSummaryResponse response = controller.getRegions("bangalore");

        assertThat(response.regions()).isNotEmpty();
        assertThat(response.regions()).allSatisfy(r -> assertThat(r.listingCount()).isEqualTo(0L));
        assertThat(response.regions().stream().map(RegionSummaryResponse.Region::key).toList())
                .isEqualTo(CityRegionProjection.canonicalRegionOrder("CENTRAL_CARDINAL_8"));
    }

    @Test
    @DisplayName("read is served from the materialized city_region_memberships, not recomputed "
            + "per-request from regional_area_classifications")
    void membershipsAreMaterialized_noProjectionOnRead() {
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);
        insertLiveListing(MANIPAL);

        RegionSummaryResponse before = controller.getRegions("udupi");
        long totalAreasBefore = before.regions().stream().mapToLong(RegionSummaryResponse.Region::areaCount).sum();
        long totalListingsBefore = before.regions().stream().mapToLong(RegionSummaryResponse.Region::listingCount).sum();

        // Remove the projection input entirely — if the read recomputed live, this would change
        // the result. It must not, because the read serves from city_region_memberships.
        jdbcTemplate.update("DELETE FROM regional_area_classifications WHERE city_key = 'udupi'");

        RegionSummaryResponse after = controller.getRegions("udupi");
        long totalAreasAfter = after.regions().stream().mapToLong(RegionSummaryResponse.Region::areaCount).sum();
        long totalListingsAfter = after.regions().stream().mapToLong(RegionSummaryResponse.Region::listingCount).sum();

        assertThat(totalAreasAfter).as("area_count unchanged after classifications are wiped").isEqualTo(totalAreasBefore);
        assertThat(totalListingsAfter).as("listingCount unchanged after classifications are wiped").isEqualTo(totalListingsBefore);
        assertThat(totalAreasBefore).isGreaterThan(0);
    }

    // ── #1882 Track A PR1 amendment: boundsStatus / missingBoundsAreaCount (AC-A2/A3/A4) ────

    @Test
    @DisplayName("boundsStatus is COMPLETE and missingBoundsAreaCount is 0 when every member area "
            + "has a complete bbox, and the region's aggregate bounds equal the union of member bboxes")
    void boundsStatusCompleteWhenAllMembersHaveCompleteBbox() {
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        RegionSummaryResponse response = controller.getRegions("udupi");
        assertThat(response.regions()).isNotEmpty();
        assertThat(response.regions()).allSatisfy(r -> {
            assertThat(r.boundsStatus()).as("region %s", r.key()).isEqualTo("COMPLETE");
            assertThat(r.missingBoundsAreaCount()).as("region %s", r.key()).isEqualTo(0L);
        });

        String populousRegionKey = jdbcTemplate.queryForObject(
                "SELECT region_key FROM city_region_memberships WHERE city_id = ? "
                        + "GROUP BY region_key ORDER BY COUNT(*) DESC LIMIT 1",
                String.class, udupiCityId);
        List<String> memberAreaKeys = jdbcTemplate.queryForList(
                "SELECT area_key FROM city_region_memberships WHERE city_id = ? AND region_key = ?",
                String.class, udupiCityId, populousRegionKey);
        assertThat(memberAreaKeys).isNotEmpty();

        String placeholders = String.join(",", memberAreaKeys.stream().map(k -> "?").toList());
        Object[] params = memberAreaKeys.toArray();
        Map<String, Object> expected = jdbcTemplate.queryForMap(
                "SELECT MIN(min_lat) AS min_lat, MAX(max_lat) AS max_lat, "
                        + "MIN(min_lon) AS min_lon, MAX(max_lon) AS max_lon "
                        + "FROM areas WHERE area_key IN (" + placeholders + ")",
                params);

        RegionSummaryResponse.Region region = response.regions().stream()
                .filter(r -> populousRegionKey.equals(r.key()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("region " + populousRegionKey + " not found"));

        assertThat(region.bounds().minLat()).isCloseTo(((Number) expected.get("min_lat")).doubleValue(), Offset.offset(1e-9));
        assertThat(region.bounds().maxLat()).isCloseTo(((Number) expected.get("max_lat")).doubleValue(), Offset.offset(1e-9));
        assertThat(region.bounds().minLon()).isCloseTo(((Number) expected.get("min_lon")).doubleValue(), Offset.offset(1e-9));
        assertThat(region.bounds().maxLon()).isCloseTo(((Number) expected.get("max_lon")).doubleValue(), Offset.offset(1e-9));
    }

    @Test
    @DisplayName("boundsStatus is APPROXIMATE and missingBoundsAreaCount is 1 when exactly one member "
            + "area is missing a bbox corner, and its centroid still contributes to the region bounds union")
    void boundsStatusApproximateAndCountOneWhenOneMemberMissingBbox() {
        resolveNonUnifiedGroups(udupiCityId);
        // Null one bbox corner BEFORE apply(), so upsertCityRegions' per-member centroid fallback
        // is what actually gets baked into this region's aggregate min_lat/max_lat/min_lon/max_lon.
        jdbcTemplate.update("UPDATE areas SET min_lat = NULL WHERE area_key = ?", MANIPAL);
        onboardingService.apply(udupiCityId);

        String manipalRegion = jdbcTemplate.queryForObject(
                "SELECT region_key FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                String.class, udupiCityId, MANIPAL);

        RegionSummaryResponse response = controller.getRegions("udupi");
        RegionSummaryResponse.Region region = response.regions().stream()
                .filter(r -> manipalRegion.equals(r.key()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("region " + manipalRegion + " not found"));

        assertThat(region.boundsStatus()).isEqualTo("APPROXIMATE");
        assertThat(region.missingBoundsAreaCount()).isEqualTo(1L);

        List<String> memberAreaKeys = jdbcTemplate.queryForList(
                "SELECT area_key FROM city_region_memberships WHERE city_id = ? AND region_key = ?",
                String.class, udupiCityId, manipalRegion);
        String placeholders = String.join(",", memberAreaKeys.stream().map(k -> "?").toList());
        Object[] params = memberAreaKeys.toArray();
        Map<String, Object> expected = jdbcTemplate.queryForMap(
                "SELECT MIN(COALESCE(min_lat, geo_center_lat)) AS min_lat, MAX(COALESCE(max_lat, geo_center_lat)) AS max_lat, "
                        + "MIN(COALESCE(min_lon, geo_center_lon)) AS min_lon, MAX(COALESCE(max_lon, geo_center_lon)) AS max_lon "
                        + "FROM areas WHERE area_key IN (" + placeholders + ")",
                params);

        assertThat(region.bounds().minLat()).as("MANIPAL's centroid still contributed to the union")
                .isCloseTo(((Number) expected.get("min_lat")).doubleValue(), Offset.offset(1e-9));
        assertThat(region.bounds().maxLat()).isCloseTo(((Number) expected.get("max_lat")).doubleValue(), Offset.offset(1e-9));
        assertThat(region.bounds().minLon()).isCloseTo(((Number) expected.get("min_lon")).doubleValue(), Offset.offset(1e-9));
        assertThat(region.bounds().maxLon()).isCloseTo(((Number) expected.get("max_lon")).doubleValue(), Offset.offset(1e-9));
    }

    @Test
    @DisplayName("missingBoundsAreaCount matches the count and aggregate bounds stay deterministic "
            + "when two or more member areas are missing a bbox corner")
    void missingBoundsAreaCountAndDeterministicBoundsWhenMultipleMissing() {
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        // Pigeonhole: 12 classified areas across at most 9 canonical regions guarantees at least
        // one region has >= 2 members.
        String populousRegionKey = jdbcTemplate.queryForObject(
                "SELECT region_key FROM city_region_memberships WHERE city_id = ? "
                        + "GROUP BY region_key HAVING COUNT(*) >= 2 ORDER BY COUNT(*) DESC LIMIT 1",
                String.class, udupiCityId);

        List<String> memberAreaKeys = jdbcTemplate.queryForList(
                "SELECT area_key FROM city_region_memberships WHERE city_id = ? AND region_key = ? ORDER BY area_key",
                String.class, udupiCityId, populousRegionKey);
        assertThat(memberAreaKeys.size()).isGreaterThanOrEqualTo(2);

        String areaOne = memberAreaKeys.get(0);
        String areaTwo = memberAreaKeys.get(1);
        jdbcTemplate.update("UPDATE areas SET min_lat = NULL WHERE area_key = ?", areaOne);
        jdbcTemplate.update("UPDATE areas SET max_lon = NULL WHERE area_key = ?", areaTwo);

        // apply() is a no-op when the fingerprint + effective membership set are unchanged, and
        // nulling bbox alone changes neither — wipe the materialization to force a fresh
        // recompute of city_regions' min_lat/max_lon from the now-missing bbox corners.
        jdbcTemplate.update("DELETE FROM city_region_memberships WHERE city_id = ?", udupiCityId);
        jdbcTemplate.update("DELETE FROM city_regions WHERE city_id = ?", udupiCityId);
        onboardingService.apply(udupiCityId);

        RegionSummaryResponse response = controller.getRegions("udupi");
        RegionSummaryResponse.Region region = response.regions().stream()
                .filter(r -> populousRegionKey.equals(r.key()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("region " + populousRegionKey + " not found"));

        assertThat(region.boundsStatus()).isEqualTo("APPROXIMATE");
        assertThat(region.missingBoundsAreaCount()).isEqualTo(2L);

        String placeholders = String.join(",", memberAreaKeys.stream().map(k -> "?").toList());
        Object[] params = memberAreaKeys.toArray();
        Map<String, Object> expected = jdbcTemplate.queryForMap(
                "SELECT MIN(COALESCE(min_lat, geo_center_lat)) AS min_lat, MAX(COALESCE(max_lat, geo_center_lat)) AS max_lat, "
                        + "MIN(COALESCE(min_lon, geo_center_lon)) AS min_lon, MAX(COALESCE(max_lon, geo_center_lon)) AS max_lon "
                        + "FROM areas WHERE area_key IN (" + placeholders + ")",
                params);

        assertThat(region.bounds().minLat()).isCloseTo(((Number) expected.get("min_lat")).doubleValue(), Offset.offset(1e-9));
        assertThat(region.bounds().maxLat()).isCloseTo(((Number) expected.get("max_lat")).doubleValue(), Offset.offset(1e-9));
        assertThat(region.bounds().minLon()).isCloseTo(((Number) expected.get("min_lon")).doubleValue(), Offset.offset(1e-9));
        assertThat(region.bounds().maxLon()).isCloseTo(((Number) expected.get("max_lon")).doubleValue(), Offset.offset(1e-9));
    }

    @Test
    @DisplayName("a canonical region with zero member areas is COMPLETE with missingBoundsAreaCount 0")
    void zeroMemberRegionIsCompleteWithZeroMissing() {
        // Exercises the read-time derivation directly for the zero-membership case, rather than
        // depending on udupi's real 12-area seed happening to leave some canonical region
        // unpopulated (it may not — CityRegionOnboardingService legitimately materializes the
        // FULL canonical set regardless of member count, so a hand-inserted city_regions row
        // with no city_region_memberships is a faithful, deterministic stand-in).
        jdbcTemplate.update(
                "INSERT INTO city_regions "
                        + "(city_id, region_key, display_label, display_order, "
                        + " centre_lat, centre_lon, min_lat, max_lat, min_lon, max_lon, policy_fingerprint, generated_at) "
                        + "VALUES (?, 'CENTRAL', 'Central Udupi', 0, NULL, NULL, NULL, NULL, NULL, NULL, 'qa-fingerprint', now())",
                udupiCityId);

        RegionSummaryResponse response = controller.getRegions("udupi");
        RegionSummaryResponse.Region centralRegion = response.regions().stream()
                .filter(r -> "CENTRAL".equals(r.key()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("region CENTRAL not found"));

        assertThat(centralRegion.areaCount()).isEqualTo(0L);
        assertThat(centralRegion.boundsStatus()).isEqualTo("COMPLETE");
        assertThat(centralRegion.missingBoundsAreaCount()).isEqualTo(0L);
    }
}
