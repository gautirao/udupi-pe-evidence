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

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration test proving {@link CityRegionOnboardingService#apply(int)}
 * materializes exactly one region per classified area, with bounds/centre/displayOrder derived
 * from the raw geometry — never from listing volume (#1882 Track A PR1).
 *
 * <p>Bangalore's real curated {@code area_groups} may legitimately project to SPLIT/DEGENERATE
 * groups under {@code CENTRAL_CARDINAL_8}/8km (per #1882 plan review) — this test resolves any
 * non-UNIFIED group via {@code regional_area_overrides} generically (city-agnostic), rather than
 * assuming the raw seed geometry is already unified, before calling {@code apply()}.
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
class CityRegionOnboardingProjectionIT {

    private static final String MANIPAL = "IN|KA|Udupi|Manipal";

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private CityRegionOnboardingService onboardingService;
    private RegionalClassificationBackfillService backfillService;

    private Integer bangaloreCityId;
    private Integer udupiCityId;

    @BeforeEach
    void setUp() {
        onboardingService = new CityRegionOnboardingService(jdbcTemplate);
        backfillService = new RegionalClassificationBackfillService(jdbcTemplate);

        bangaloreCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'bangalore'", Integer.class);
        udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);

        // Defensive reset — these ITs run apply() which writes; ensure a clean slate regardless
        // of whether @DataJpaTest's per-test transaction rollback covers jdbcTemplate writes.
        jdbcTemplate.update("DELETE FROM city_region_memberships WHERE city_id IN (?, ?)", bangaloreCityId, udupiCityId);
        jdbcTemplate.update("DELETE FROM city_regions WHERE city_id IN (?, ?)", bangaloreCityId, udupiCityId);
        jdbcTemplate.update("DELETE FROM regional_area_overrides WHERE city_id IN (?, ?)", bangaloreCityId, udupiCityId);
        jdbcTemplate.update("DELETE FROM regional_area_classifications WHERE city_key IN ('bangalore', 'udupi')");
        jdbcTemplate.update("UPDATE city_region_policy SET central_radius_km = 8, policy_fingerprint = NULL WHERE city_id = ?", bangaloreCityId);
        jdbcTemplate.update("UPDATE city_region_policy SET central_radius_km = 4, policy_fingerprint = NULL WHERE city_id = ?", udupiCityId);

        int upserted = backfillService.runBackfill();
        assertThat(upserted).as("backfill must populate classifications before onboarding").isGreaterThan(0);
    }

    /**
     * Resolves every non-UNIFIED area_group for a city via {@code regional_area_overrides},
     * generically (no assumption about which groups are actually SPLIT/DEGENERATE for the real
     * seed geometry) — forces every member of a non-UNIFIED group onto one of its eligible
     * regions (or the model's first canonical region, for DEGENERATE groups with none).
     */
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

    @Test
    @DisplayName("bangalore: every eligible (classified) area gets exactly one region membership")
    void oneRegionPerEligibleArea_bangalore() {
        resolveNonUnifiedGroups(bangaloreCityId);
        onboardingService.apply(bangaloreCityId);

        assertNoDuplicateAreaMemberships(bangaloreCityId);

        Integer eligibleCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM regional_area_classifications WHERE city_key = 'bangalore'", Integer.class);
        Integer membershipCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_region_memberships WHERE city_id = ?", Integer.class, bangaloreCityId);

        assertThat(eligibleCount).isGreaterThan(0);
        assertThat(membershipCount).isGreaterThanOrEqualTo(eligibleCount);
    }

    @Test
    @DisplayName("udupi: every eligible (classified) area gets exactly one region membership")
    void oneRegionPerEligibleArea_udupi() {
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        assertNoDuplicateAreaMemberships(udupiCityId);

        Integer eligibleCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM regional_area_classifications WHERE city_key = 'udupi'", Integer.class);
        Integer membershipCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_region_memberships WHERE city_id = ?", Integer.class, udupiCityId);

        assertThat(eligibleCount).isEqualTo(12); // V71 seeds 12 four-segment Udupi areas
        assertThat(membershipCount).isGreaterThanOrEqualTo(eligibleCount);
    }

    @Test
    @DisplayName("bangalore: no eligible (classified) area is left unassigned after apply")
    void noUnassignedEligibleArea_bangalore() {
        resolveNonUnifiedGroups(bangaloreCityId);
        onboardingService.apply(bangaloreCityId);
        assertNoUnassignedEligibleArea(bangaloreCityId, "bangalore");
    }

    @Test
    @DisplayName("udupi: no eligible (classified) area is left unassigned after apply")
    void noUnassignedEligibleArea_udupi() {
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);
        assertNoUnassignedEligibleArea(udupiCityId, "udupi");
    }

    @Test
    @DisplayName("no area_key is ever assigned to more than one region for the same city")
    void noAreaAssignedTwice() {
        resolveNonUnifiedGroups(bangaloreCityId);
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(bangaloreCityId);
        onboardingService.apply(udupiCityId);

        assertNoDuplicateAreaMemberships(bangaloreCityId);
        assertNoDuplicateAreaMemberships(udupiCityId);
    }

    @Test
    @DisplayName("region bounds are the union (MIN/MAX) of its member areas' bounding boxes")
    void regionBoundsAreUnionOfMemberBboxes() {
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        String populatedRegionKey = jdbcTemplate.queryForObject(
                "SELECT region_key FROM city_region_memberships WHERE city_id = ? "
                        + "GROUP BY region_key ORDER BY COUNT(*) DESC LIMIT 1",
                String.class, udupiCityId);

        List<String> memberAreaKeys = jdbcTemplate.queryForList(
                "SELECT area_key FROM city_region_memberships WHERE city_id = ? AND region_key = ?",
                String.class, udupiCityId, populatedRegionKey);
        assertThat(memberAreaKeys).isNotEmpty();

        String placeholders = String.join(",", memberAreaKeys.stream().map(k -> "?").toList());
        Object[] params = memberAreaKeys.toArray();
        Map<String, Object> expected = jdbcTemplate.queryForMap(
                "SELECT MIN(min_lat) AS min_lat, MAX(max_lat) AS max_lat, "
                        + "MIN(min_lon) AS min_lon, MAX(max_lon) AS max_lon "
                        + "FROM areas WHERE area_key IN (" + placeholders + ")",
                params);

        Map<String, Object> actual = jdbcTemplate.queryForMap(
                "SELECT min_lat, max_lat, min_lon, max_lon FROM city_regions WHERE city_id = ? AND region_key = ?",
                udupiCityId, populatedRegionKey);

        assertThat(((Number) actual.get("min_lat")).doubleValue())
                .isCloseTo(((Number) expected.get("min_lat")).doubleValue(), Offset.offset(1e-9));
        assertThat(((Number) actual.get("max_lat")).doubleValue())
                .isCloseTo(((Number) expected.get("max_lat")).doubleValue(), Offset.offset(1e-9));
        assertThat(((Number) actual.get("min_lon")).doubleValue())
                .isCloseTo(((Number) expected.get("min_lon")).doubleValue(), Offset.offset(1e-9));
        assertThat(((Number) actual.get("max_lon")).doubleValue())
                .isCloseTo(((Number) expected.get("max_lon")).doubleValue(), Offset.offset(1e-9));
    }

    @Test
    @DisplayName("region centre is the centroid (AVG) of its member areas' geo centres")
    void regionCentreIsCentroidOfMemberCentroids() {
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        String populatedRegionKey = jdbcTemplate.queryForObject(
                "SELECT region_key FROM city_region_memberships WHERE city_id = ? "
                        + "GROUP BY region_key ORDER BY COUNT(*) DESC LIMIT 1",
                String.class, udupiCityId);

        List<String> memberAreaKeys = jdbcTemplate.queryForList(
                "SELECT area_key FROM city_region_memberships WHERE city_id = ? AND region_key = ?",
                String.class, udupiCityId, populatedRegionKey);
        assertThat(memberAreaKeys).isNotEmpty();

        String placeholders = String.join(",", memberAreaKeys.stream().map(k -> "?").toList());
        Object[] params = memberAreaKeys.toArray();
        Map<String, Object> expected = jdbcTemplate.queryForMap(
                "SELECT AVG(geo_center_lat) AS centre_lat, AVG(geo_center_lon) AS centre_lon "
                        + "FROM areas WHERE area_key IN (" + placeholders + ")",
                params);

        Map<String, Object> actual = jdbcTemplate.queryForMap(
                "SELECT centre_lat, centre_lon FROM city_regions WHERE city_id = ? AND region_key = ?",
                udupiCityId, populatedRegionKey);

        assertThat(((Number) actual.get("centre_lat")).doubleValue())
                .isCloseTo(((Number) expected.get("centre_lat")).doubleValue(), Offset.offset(1e-9));
        assertThat(((Number) actual.get("centre_lon")).doubleValue())
                .isCloseTo(((Number) expected.get("centre_lon")).doubleValue(), Offset.offset(1e-9));
    }

    @Test
    @DisplayName("display_order comes from CityRegionProjection's canonical policy order, "
            + "never from listing/member count — the FULL canonical region set is materialized")
    void displayOrderIsCanonicalPolicyOrderNotListingCount() {
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        String regionModel = jdbcTemplate.queryForObject(
                "SELECT region_model FROM city_region_policy WHERE city_id = ?", String.class, udupiCityId);
        List<String> expectedOrder = CityRegionProjection.canonicalRegionOrder(regionModel);

        List<String> actualOrderedKeys = jdbcTemplate.queryForList(
                "SELECT region_key FROM city_regions WHERE city_id = ? ORDER BY display_order",
                String.class, udupiCityId);
        assertThat(actualOrderedKeys).as("full canonical region set is materialized in canonical order")
                .isEqualTo(expectedOrder);

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT region_key, display_order FROM city_regions WHERE city_id = ?", udupiCityId);
        for (Map<String, Object> row : rows) {
            int expected = CityRegionProjection.displayOrder((String) row.get("region_key"));
            assertThat(((Number) row.get("display_order")).intValue())
                    .as("display_order for %s", row.get("region_key"))
                    .isEqualTo(expected);
        }
    }

    private void assertNoDuplicateAreaMemberships(int cityId) {
        List<String> duplicates = jdbcTemplate.queryForList(
                "SELECT area_key FROM city_region_memberships WHERE city_id = ? GROUP BY area_key HAVING COUNT(*) > 1",
                String.class, cityId);
        assertThat(duplicates).as("area_keys assigned to more than one region").isEmpty();
    }

    @Test
    @DisplayName("an eligible area with a missing bbox corner is still classified and persisted "
            + "as a region membership — classification never depends on bbox (AC-A3)")
    void membershipPersistedForAreaWithMissingBbox_classificationUnaffected() {
        resolveNonUnifiedGroups(udupiCityId);

        // backfillService.runBackfill() already ran in setUp() and classified MANIPAL from its
        // geo_center — nulling a bbox corner now must not retroactively un-classify it.
        jdbcTemplate.update("UPDATE areas SET min_lat = NULL WHERE area_key = ?", MANIPAL);

        Map<String, Object> classification = jdbcTemplate.queryForMap(
                "SELECT distance_km, direction_key FROM regional_area_classifications "
                        + "WHERE city_key = 'udupi' AND area_key = ?",
                MANIPAL);
        assertThat(classification.get("distance_km")).as("distance_km present despite missing bbox").isNotNull();
        assertThat(classification.get("direction_key")).as("direction_key present despite missing bbox").isNotNull();

        onboardingService.apply(udupiCityId);

        Integer membershipCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                Integer.class, udupiCityId, MANIPAL);
        assertThat(membershipCount).as("area with a missing bbox corner still gets a membership row")
                .isEqualTo(1);
    }

    private void assertNoUnassignedEligibleArea(int cityId, String citySlug) {
        List<String> unassigned = jdbcTemplate.queryForList(
                "SELECT rac.area_key FROM regional_area_classifications rac "
                        + "LEFT JOIN city_region_memberships crm ON crm.city_id = ? AND crm.area_key = rac.area_key "
                        + "WHERE rac.city_key = ? AND crm.area_key IS NULL",
                String.class, cityId, citySlug);
        assertThat(unassigned).as("classified areas with no city_region_memberships row").isEmpty();
    }
}
