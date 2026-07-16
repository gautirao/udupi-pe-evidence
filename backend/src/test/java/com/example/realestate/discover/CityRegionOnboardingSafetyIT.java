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
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Testcontainers integration test proving {@link CityRegionOnboardingService}'s safety
 * invariants (#1882 Track A PR1, corrected by #1899 for #1910 compatibility): {@code dryRun}
 * never writes; a genuine SPLIT {@code area_group} (members spanning 2+ regions) proceeds through
 * {@code apply} with each member keeping its own independently-resolved region_key, never
 * collapsed via first-member/majority/focus-point fallback; only a DEGENERATE {@code area_group}
 * (no eligible or overridden member) blocks {@code apply} and rolls back with zero partial
 * writes.
 *
 * <h2>Deterministic SPLIT/DEGENERATE construction</h2>
 * Rather than relying on Udupi's real seed geometry happening to produce a SPLIT or DEGENERATE
 * group (it may not, under {@code CENTRAL_CARDINAL_4}/4km), this test runs the real backfill
 * first (so classifications are genuine), then deliberately overwrites specific areas'
 * classification rows to force known outcomes:
 * <ul>
 *   <li><b>university-belt</b> (Manipal, Katapadi) → forced to N@20km / S@20km → SPLIT</li>
 *   <li><b>coastal-strip</b> (Malpe, Kaup) → classification rows deleted entirely → DEGENERATE</li>
 *   <li><b>city-centre</b> (Udupi, Kunjibettu, Amoghapura) → forced to 1km (inside the 4km
 *       radius) for all three → CENTRAL for all → UNIFIED</li>
 *   <li><b>south-udupi</b> (Shirva, Padubidri) → forced to S@20km for both → UNIFIED</li>
 *   <li><b>north-udupi</b> (Brahmavar, single member) → left as backfill computed it →
 *       trivially UNIFIED (one member, one region)</li>
 * </ul>
 * See V101 for the udupi area_groups seed this test relies on.
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
class CityRegionOnboardingSafetyIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String MANIPAL = "IN|KA|Udupi|Manipal";
    private static final String KATAPADI = "IN|KA|Udupi|Katapadi";
    private static final String MALPE = "IN|KA|Udupi|Malpe";
    private static final String KAUP = "IN|KA|Udupi|Kaup";
    private static final String UDUPI_TOWN = "IN|KA|Udupi|Udupi";
    private static final String KUNJIBETTU = "IN|KA|Udupi|Kunjibettu";
    private static final String AMOGHAPURA = "IN|KA|Udupi|Amoghapura";
    private static final String SHIRVA = "IN|KA|Udupi|Shirva";
    private static final String PADUBIDRI = "IN|KA|Udupi|Padubidri";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private CityRegionOnboardingService onboardingService;
    private RegionalClassificationBackfillService backfillService;
    private Integer udupiCityId;

    @BeforeEach
    void setUp() {
        onboardingService = new CityRegionOnboardingService(jdbcTemplate);
        backfillService = new RegionalClassificationBackfillService(jdbcTemplate);
        udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);

        jdbcTemplate.update("DELETE FROM city_region_memberships WHERE city_id = ?", udupiCityId);
        jdbcTemplate.update("DELETE FROM city_regions WHERE city_id = ?", udupiCityId);
        jdbcTemplate.update("DELETE FROM regional_area_overrides WHERE city_id = ?", udupiCityId);
        jdbcTemplate.update("DELETE FROM regional_area_classifications WHERE city_key = 'udupi'");
        jdbcTemplate.update("UPDATE city_region_policy SET central_radius_km = 4, policy_fingerprint = NULL WHERE city_id = ?", udupiCityId);

        int upserted = backfillService.runBackfill();
        assertThat(upserted).isGreaterThan(0);

        forceSplitAndDegenerateScenario();
    }

    /** See class-level Javadoc for the exact per-area_group outcome this forces. */
    private void forceSplitAndDegenerateScenario() {
        forceClassification(MANIPAL, "N", 20.0);
        forceClassification(KATAPADI, "S", 20.0);

        deleteClassification(MALPE);
        deleteClassification(KAUP);

        forceClassification(UDUPI_TOWN, "N", 1.0);
        forceClassification(KUNJIBETTU, "N", 1.0);
        forceClassification(AMOGHAPURA, "N", 1.0);

        forceClassification(SHIRVA, "S", 20.0);
        forceClassification(PADUBIDRI, "S", 20.0);
    }

    private void forceClassification(String areaKey, String directionKey, double distanceKm) {
        String band = distanceKm < 10 ? "0_10" : distanceKm < 25 ? "10_25" : distanceKm < 50 ? "25_50" : "50_up";
        jdbcTemplate.update(
                "UPDATE regional_area_classifications SET direction_key = ?, distance_band_key = ?, "
                        + "distance_km = ?, bearing_deg = 0 WHERE city_key = 'udupi' AND area_key = ?",
                directionKey, band, distanceKm, areaKey);
    }

    private void deleteClassification(String areaKey) {
        jdbcTemplate.update("DELETE FROM regional_area_classifications WHERE city_key = 'udupi' AND area_key = ?", areaKey);
    }

    private CityRegionOnboardingReport.GroupCategorization categorization(
            CityRegionOnboardingReport report, String groupSlug) {
        return report.groupCategorizations().stream()
                .filter(g -> groupSlug.equals(g.groupSlug()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("group " + groupSlug + " not found in report"));
    }

    @Test
    @DisplayName("dryRun categorises university-belt=SPLIT, coastal-strip=DEGENERATE, "
            + "city-centre/south-udupi/north-udupi=UNIFIED — and performs zero writes")
    void dryRunCategorisesGroupsUnifiedSplitDegenerate_noWrites() {
        CityRegionOnboardingReport report = onboardingService.dryRun(udupiCityId);

        assertThat(categorization(report, "university-belt").category())
                .isEqualTo(CityRegionOnboardingReport.GroupCategory.SPLIT);
        assertThat(categorization(report, "coastal-strip").category())
                .isEqualTo(CityRegionOnboardingReport.GroupCategory.DEGENERATE);
        assertThat(categorization(report, "city-centre").category())
                .isEqualTo(CityRegionOnboardingReport.GroupCategory.UNIFIED);
        assertThat(categorization(report, "south-udupi").category())
                .isEqualTo(CityRegionOnboardingReport.GroupCategory.UNIFIED);
        assertThat(categorization(report, "north-udupi").category())
                .isEqualTo(CityRegionOnboardingReport.GroupCategory.UNIFIED);

        Integer regionRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_regions WHERE city_id = ?", Integer.class, udupiCityId);
        Integer membershipRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_region_memberships WHERE city_id = ?", Integer.class, udupiCityId);
        assertThat(regionRows).isEqualTo(0);
        assertThat(membershipRows).isEqualTo(0);
    }

    @Test
    @DisplayName("apply() succeeds for a genuine SPLIT group (university-belt) left unresolved, "
            + "once the unrelated DEGENERATE group (coastal-strip) is resolved — each member "
            + "keeps its own distinct region_key, never collapsed to one region")
    void applySucceedsForSplitGroup_membersRetainDistinctRegions() {
        // Resolve only the DEGENERATE group (coastal-strip). university-belt (SPLIT) is
        // deliberately left unresolved — post-#1899, a genuine SPLIT group needs no override to
        // proceed; #1910's region-scoped projection renders it under each of its regions.
        jdbcTemplate.update(
                "INSERT INTO regional_area_overrides (city_id, area_key, forced_region_key, reason, author) "
                        + "VALUES (?, ?, 'N', 'resolve-degenerate', 'qa')", udupiCityId, MALPE);
        jdbcTemplate.update(
                "INSERT INTO regional_area_overrides (city_id, area_key, forced_region_key, reason, author) "
                        + "VALUES (?, ?, 'N', 'resolve-degenerate', 'qa')", udupiCityId, KAUP);

        onboardingService.apply(udupiCityId);

        Map<String, Object> manipalRow = jdbcTemplate.queryForMap(
                "SELECT region_key, assignment_source FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                udupiCityId, MANIPAL);
        Map<String, Object> katapadiRow = jdbcTemplate.queryForMap(
                "SELECT region_key, assignment_source FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                udupiCityId, KATAPADI);

        assertThat(manipalRow.get("region_key")).as("Manipal keeps its own raw-projected region").isEqualTo("N");
        assertThat(manipalRow.get("assignment_source")).isEqualTo("AUTO");
        assertThat(katapadiRow.get("region_key")).as("Katapadi keeps its own raw-projected region, "
                + "not collapsed onto Manipal's").isEqualTo("S");
        assertThat(katapadiRow.get("assignment_source")).isEqualTo("AUTO");
    }

    @Test
    @DisplayName("apply() is blocked with DEGENERATE_GROUP when coastal-strip has no eligible or "
            + "overridden member — even though university-belt's SPLIT is left unresolved (SPLIT "
            + "no longer requires resolution post-#1899)")
    void applyBlockedForDegenerateGroup() {
        assertThatThrownBy(() -> onboardingService.apply(udupiCityId))
                .isInstanceOf(RegionOnboardingBlockedException.class)
                .satisfies(ex -> {
                    assertThat(((RegionOnboardingBlockedException) ex).reason())
                            .isEqualTo(RegionOnboardingBlockedException.Reason.DEGENERATE_GROUP);
                    assertThat(ex.getMessage()).contains("coastal-strip");
                    assertThat(ex.getMessage()).as("university-belt is SPLIT, not DEGENERATE — must not be "
                            + "listed as a blocking group").doesNotContain("university-belt");
                });

        Integer regionRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_regions WHERE city_id = ?", Integer.class, udupiCityId);
        assertThat(regionRows).isEqualTo(0);
    }

    @Test
    @DisplayName("apply() blocked by the unrelated DEGENERATE group (coastal-strip) never "
            + "silently assigns the SPLIT group's areas via first-member/majority fallback — no "
            + "membership row is written for them either, since the whole apply() rolls back")
    void noSilentFirstMemberOrMajorityAssignment() {
        assertThatThrownBy(() -> onboardingService.apply(udupiCityId))
                .isInstanceOf(RegionOnboardingBlockedException.class)
                .satisfies(ex -> assertThat(((RegionOnboardingBlockedException) ex).reason())
                        .isEqualTo(RegionOnboardingBlockedException.Reason.DEGENERATE_GROUP));

        List<Map<String, Object>> manipalRows = jdbcTemplate.queryForList(
                "SELECT * FROM city_region_memberships WHERE city_id = ? AND area_key = ?", udupiCityId, MANIPAL);
        List<Map<String, Object>> katapadiRows = jdbcTemplate.queryForList(
                "SELECT * FROM city_region_memberships WHERE city_id = ? AND area_key = ?", udupiCityId, KATAPADI);

        assertThat(manipalRows).as("no first-member/majority row written for Manipal").isEmpty();
        assertThat(katapadiRows).as("no first-member/majority row written for Katapadi").isEmpty();
    }

    @Test
    @DisplayName("a blocked apply() (due to the DEGENERATE coastal-strip group) rolls back "
            + "entirely — even area_groups that would have applied cleanly (city-centre, "
            + "south-udupi, north-udupi, and the otherwise-fine SPLIT university-belt) get zero rows")
    void validationFailureRollsBackEntireApply_noPartialRows() {
        assertThatThrownBy(() -> onboardingService.apply(udupiCityId))
                .isInstanceOf(RegionOnboardingBlockedException.class)
                .satisfies(ex -> assertThat(((RegionOnboardingBlockedException) ex).reason())
                        .isEqualTo(RegionOnboardingBlockedException.Reason.DEGENERATE_GROUP));

        Integer regionRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_regions WHERE city_id = ?", Integer.class, udupiCityId);
        Integer membershipRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_region_memberships WHERE city_id = ?", Integer.class, udupiCityId);
        assertThat(regionRows).as("no city_regions rows, not even for clean groups").isEqualTo(0);
        assertThat(membershipRows).as("no city_region_memberships rows, not even for clean groups").isEqualTo(0);

        for (String cleanAreaKey : List.of(UDUPI_TOWN, KUNJIBETTU, AMOGHAPURA, SHIRVA, PADUBIDRI, MANIPAL, KATAPADI)) {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT * FROM city_region_memberships WHERE city_id = ? AND area_key = ?", udupiCityId, cleanAreaKey);
            assertThat(rows).as("no partial row for otherwise-clean area %s", cleanAreaKey).isEmpty();
        }
    }
}
