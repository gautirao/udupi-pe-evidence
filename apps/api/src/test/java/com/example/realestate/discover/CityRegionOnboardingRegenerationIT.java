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
import static org.assertj.core.api.Assertions.within;

/**
 * Testcontainers integration test proving {@link CityRegionOnboardingService#apply(int)}'s
 * regeneration semantics (#1882 Track A PR1): an unchanged re-run is a zero-write no-op, a
 * policy change re-derives memberships and prunes stale AUTO rows, and an explicit
 * {@code regional_area_overrides} row wins over the raw projection and survives regeneration.
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
class CityRegionOnboardingRegenerationIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String BRAHMAVAR = "IN|KA|Udupi|Brahmavar"; // north-udupi's only member
    private static final String MANIPAL = "IN|KA|Udupi|Manipal";     // university-belt member
    private static final String KUNJIBETTU = "IN|KA|Udupi|Kunjibettu";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private CityRegionOnboardingService onboardingService;
    private RegionalClassificationBackfillService backfillService;
    private RegionSummaryService regionSummaryService;
    private Integer udupiCityId;

    @BeforeEach
    void setUp() {
        onboardingService = new CityRegionOnboardingService(jdbcTemplate);
        backfillService = new RegionalClassificationBackfillService(jdbcTemplate);
        regionSummaryService = new RegionSummaryService(jdbcTemplate);
        udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);

        jdbcTemplate.update("DELETE FROM city_region_memberships WHERE city_id = ?", udupiCityId);
        jdbcTemplate.update("DELETE FROM city_regions WHERE city_id = ?", udupiCityId);
        jdbcTemplate.update("DELETE FROM regional_area_overrides WHERE city_id = ?", udupiCityId);
        jdbcTemplate.update("DELETE FROM regional_area_classifications WHERE city_key = 'udupi'");
        jdbcTemplate.update("UPDATE city_region_policy SET central_radius_km = 4, policy_fingerprint = NULL WHERE city_id = ?", udupiCityId);

        int upserted = backfillService.runBackfill();
        assertThat(upserted).isGreaterThan(0);
    }

    /**
     * Resolves every non-UNIFIED area_group generically via {@code regional_area_overrides} so
     * apply() can succeed regardless of the real seed geometry's actual SPLIT/DEGENERATE shape.
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
    @DisplayName("rerunning apply() with unchanged policy/classifications/overrides is a "
            + "zero-write no-op — generated_at timestamps are untouched")
    void rerunUnchangedPolicyAndInputsIsZeroWriteNoOp() {
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        List<Map<String, Object>> regionsBefore = jdbcTemplate.queryForList(
                "SELECT region_key, generated_at FROM city_regions WHERE city_id = ? ORDER BY region_key", udupiCityId);
        List<Map<String, Object>> membershipsBefore = jdbcTemplate.queryForList(
                "SELECT area_key, generated_at FROM city_region_memberships WHERE city_id = ? ORDER BY area_key", udupiCityId);
        assertThat(regionsBefore).isNotEmpty();
        assertThat(membershipsBefore).isNotEmpty();

        // No changes to policy, classifications, or overrides between the two apply() calls.
        onboardingService.apply(udupiCityId);

        List<Map<String, Object>> regionsAfter = jdbcTemplate.queryForList(
                "SELECT region_key, generated_at FROM city_regions WHERE city_id = ? ORDER BY region_key", udupiCityId);
        List<Map<String, Object>> membershipsAfter = jdbcTemplate.queryForList(
                "SELECT area_key, generated_at FROM city_region_memberships WHERE city_id = ? ORDER BY area_key", udupiCityId);

        assertThat(regionsAfter).as("city_regions generated_at unchanged — no-op wrote nothing").isEqualTo(regionsBefore);
        assertThat(membershipsAfter).as("city_region_memberships generated_at unchanged — no-op wrote nothing")
                .isEqualTo(membershipsBefore);
    }

    @Test
    @DisplayName("a policy change re-derives memberships (region reassignment) and deletes "
            + "stale AUTO rows for areas that drop out of the classified set")
    void policyChangeUpdatesMembershipsAndDeletesStaleAutoRows() {
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        // north-udupi (Brahmavar, single member) is trivially UNIFIED and never overridden by
        // resolveNonUnifiedGroups — its membership is genuinely AUTO-sourced.
        Map<String, Object> brahmavarBefore = jdbcTemplate.queryForMap(
                "SELECT region_key, assignment_source FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                udupiCityId, BRAHMAVAR);
        assertThat(brahmavarBefore.get("assignment_source")).isEqualTo("AUTO");
        String regionBefore = (String) brahmavarBefore.get("region_key");

        // Pick a genuinely AUTO-sourced membership (not touched by any override) to prove stale
        // deletion when its classification disappears between generations.
        String staleCandidate = jdbcTemplate.queryForObject(
                "SELECT area_key FROM city_region_memberships WHERE city_id = ? AND assignment_source = 'AUTO' "
                        + "AND area_key != ? ORDER BY area_key LIMIT 1",
                String.class, udupiCityId, BRAHMAVAR);
        assertThat(staleCandidate).isNotNull();

        // Between generations: the area's classification input disappears entirely (e.g. area
        // reclassified out of scope) and no override exists for it — it must drop out on re-apply.
        jdbcTemplate.update("DELETE FROM regional_area_classifications WHERE city_key = 'udupi' AND area_key = ?", staleCandidate);
        jdbcTemplate.update("DELETE FROM regional_area_overrides WHERE city_id = ? AND area_key = ?", udupiCityId, staleCandidate);

        // Policy change: widen the CENTRAL radius so far that every remaining classified area
        // (Brahmavar included, ~9.7km from the Udupi centre) falls inside it.
        jdbcTemplate.update("UPDATE city_region_policy SET central_radius_km = 50 WHERE city_id = ?", udupiCityId);

        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        Map<String, Object> brahmavarAfter = jdbcTemplate.queryForMap(
                "SELECT region_key, assignment_source FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                udupiCityId, BRAHMAVAR);
        assertThat(brahmavarAfter.get("region_key")).as("Brahmavar re-derived to CENTRAL under the widened radius")
                .isEqualTo("CENTRAL");
        assertThat(regionBefore).as("region actually changed, proving re-derivation (not accidental no-op)")
                .isNotEqualTo("CENTRAL");

        List<Map<String, Object>> staleRows = jdbcTemplate.queryForList(
                "SELECT * FROM city_region_memberships WHERE city_id = ? AND area_key = ?", udupiCityId, staleCandidate);
        assertThat(staleRows).as("stale AUTO row for the now-unclassified area was deleted").isEmpty();
    }

    @Test
    @DisplayName("an override row forces its region and survives both a no-op re-apply and a "
            + "fresh backfill + regeneration")
    void overrideRowForcesRegionAndSurvivesRegeneration() {
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        // Force Manipal onto "W" — overwrites any prior AUTO or resolveNonUnifiedGroups override.
        jdbcTemplate.update(
                "INSERT INTO regional_area_overrides (city_id, area_key, forced_region_key, reason, author) "
                        + "VALUES (?, ?, 'W', 'explicit-force', 'qa') "
                        + "ON CONFLICT (city_id, area_key) DO UPDATE SET forced_region_key = EXCLUDED.forced_region_key",
                udupiCityId, MANIPAL);

        onboardingService.apply(udupiCityId);

        Map<String, Object> afterForce = jdbcTemplate.queryForMap(
                "SELECT region_key, assignment_source FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                udupiCityId, MANIPAL);
        assertThat(afterForce.get("region_key")).isEqualTo("W");
        assertThat(afterForce.get("assignment_source")).isEqualTo("OVERRIDE");

        // Regeneration: re-run the real backfill (recomputes Manipal's raw classification from
        // geometry) and re-apply. The override must still win.
        int reBackfilled = backfillService.runBackfill();
        assertThat(reBackfilled).isGreaterThan(0);
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        Map<String, Object> afterRegeneration = jdbcTemplate.queryForMap(
                "SELECT region_key, assignment_source FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                udupiCityId, MANIPAL);
        assertThat(afterRegeneration.get("region_key")).as("override still wins after regeneration").isEqualTo("W");
        assertThat(afterRegeneration.get("assignment_source")).isEqualTo("OVERRIDE");
    }

    /**
     * Regression guard for the {@code isNoOp} geometry-sensitivity bugfix (#1882 Track A PR1
     * rework): before the fix, {@code isNoOp} compared only the policy fingerprint and the
     * per-area region-assignment map, so a member area's bbox/centre changing with NO policy or
     * assignment change was misclassified as a no-op and {@code city_regions} kept stale
     * centre/bounds forever. This test drives exactly that scenario end-to-end and would FAIL on
     * the pre-fix code (stale bounds after a real geometry change; a completed bbox never
     * flipping {@code boundsStatus} to COMPLETE).
     */
    @Test
    @DisplayName("a geometry-only change (member bbox, no policy/assignment change) is NOT "
            + "misclassified as a no-op — regenerates materialised bounds; a missing-bbox "
            + "completion flips boundsStatus APPROXIMATE→COMPLETE; the final unchanged re-run is "
            + "a true zero-write no-op")
    void geometryChangeRegeneratesMaterializedBoundsAndFinalUnchangedRerunIsNoOp() {
        // Step 1: seed + backfill (done in setUp) + resolve any SPLIT/DEGENERATE + apply.
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        String manipalRegion = jdbcTemplate.queryForObject(
                "SELECT region_key FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                String.class, udupiCityId, MANIPAL);
        String manipalSourceBefore = jdbcTemplate.queryForObject(
                "SELECT assignment_source FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                String.class, udupiCityId, MANIPAL);

        // Step 2: record the affected region's stored row. xmin (Postgres's system row-version
        // column) is used — rather than generated_at alone — to prove a real row REWRITE
        // happened: two apply() calls in a fast test run can land in the same wall-clock
        // millisecond (now() granularity), making a raw generated_at inequality flaky, whereas
        // xmin always changes on an actual UPDATE regardless of clock resolution.
        Map<String, Object> regionBeforeGeomChange = jdbcTemplate.queryForMap(
                "SELECT centre_lat, centre_lon, min_lat, max_lat, min_lon, max_lon, generated_at, "
                        + "ctid::text AS ctid_val "
                        + "FROM city_regions WHERE city_id = ? AND region_key = ?",
                udupiCityId, manipalRegion);
        double manipalMaxLatBefore = jdbcTemplate.queryForObject(
                "SELECT max_lat FROM areas WHERE area_key = ?", Double.class, MANIPAL);

        // Step 3: widen Manipal's bbox far enough that it unambiguously dominates its region's
        // max_lat. Policy + region assignment are untouched — classification (distance_km /
        // direction_key) is frozen in regional_area_classifications and does not depend on the
        // areas bbox, so this is a pure geometry-only change.
        double widenedMaxLat = manipalMaxLatBefore + 1.0;
        jdbcTemplate.update("UPDATE areas SET max_lat = ? WHERE area_key = ?", widenedMaxLat, MANIPAL);

        // Step 4: re-apply.
        onboardingService.apply(udupiCityId);

        // Step 5: NOT a no-op — the region's materialised max_lat now reflects the widened bbox,
        // and the row was genuinely rewritten (xmin advanced). This assertion is the core
        // regression check: it would FAIL pre-fix, where isNoOp ignored geometry and left the
        // stale bound (and never rewrote the row at all).
        Map<String, Object> regionAfterGeomChange = jdbcTemplate.queryForMap(
                "SELECT max_lat, generated_at, ctid::text AS ctid_val FROM city_regions "
                        + "WHERE city_id = ? AND region_key = ?",
                udupiCityId, manipalRegion);
        assertThat(((Number) regionAfterGeomChange.get("max_lat")).doubleValue())
                .as("region max_lat regenerated to reflect Manipal's widened bbox")
                .isCloseTo(widenedMaxLat, within(1e-6));
        assertThat(regionAfterGeomChange.get("ctid_val"))
                .as("row was genuinely rewritten (xmin advanced) on real geometry regeneration — "
                        + "would be unchanged pre-fix, where this was wrongly treated as a no-op")
                .isNotEqualTo(regionBeforeGeomChange.get("ctid_val"));

        // Region assignment itself is untouched — proves this was a pure geometry regeneration,
        // not a reassignment/no-op-detection side effect.
        Map<String, Object> manipalMembershipAfter = jdbcTemplate.queryForMap(
                "SELECT region_key, assignment_source FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                udupiCityId, MANIPAL);
        assertThat(manipalMembershipAfter.get("region_key")).isEqualTo(manipalRegion);
        assertThat(manipalMembershipAfter.get("assignment_source")).isEqualTo(manipalSourceBefore);

        // Step 6: MISSING → COMPLETE, on a second member area (Kunjibettu) so it doesn't
        // interfere with the Manipal assertions above.
        String kunjibettuRegion = jdbcTemplate.queryForObject(
                "SELECT region_key FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                String.class, udupiCityId, KUNJIBETTU);
        double kunjibettuMinLatOriginal = jdbcTemplate.queryForObject(
                "SELECT min_lat FROM areas WHERE area_key = ?", Double.class, KUNJIBETTU);

        jdbcTemplate.update("UPDATE areas SET min_lat = NULL WHERE area_key = ?", KUNJIBETTU);
        onboardingService.apply(udupiCityId);

        RegionSummaryResponse.Region kunjibettuSummaryMissing =
                findRegion(regionSummaryService.getRegions("udupi"), kunjibettuRegion);
        assertThat(kunjibettuSummaryMissing.boundsStatus())
                .as("Kunjibettu's now-incomplete bbox flips its region to APPROXIMATE")
                .isEqualTo("APPROXIMATE");
        assertThat(kunjibettuSummaryMissing.missingBoundsAreaCount())
                .isGreaterThanOrEqualTo(1);

        // Complete the bbox again.
        jdbcTemplate.update("UPDATE areas SET min_lat = ? WHERE area_key = ?", kunjibettuMinLatOriginal, KUNJIBETTU);
        onboardingService.apply(udupiCityId);

        RegionSummaryResponse.Region kunjibettuSummaryComplete =
                findRegion(regionSummaryService.getRegions("udupi"), kunjibettuRegion);
        assertThat(kunjibettuSummaryComplete.boundsStatus())
                .as("completing Kunjibettu's bbox flips its region back to COMPLETE (#1887-style)")
                .isEqualTo("COMPLETE");
        assertThat(kunjibettuSummaryComplete.missingBoundsAreaCount()).isEqualTo(0);

        // The region's materialised bounds now match the corrected bbox union, computed
        // independently in this test via the same fallback-to-centroid aggregate rule apply()
        // uses (proving the geometry-completion actually regenerated the stored bounds, not just
        // the read-time boundsStatus flag).
        Map<String, Object> expectedAggregate = computeExpectedAggregate(udupiCityId, kunjibettuRegion);
        Map<String, Object> storedAfterComplete = jdbcTemplate.queryForMap(
                "SELECT min_lat, max_lat, min_lon, max_lon, centre_lat, centre_lon FROM city_regions "
                        + "WHERE city_id = ? AND region_key = ?", udupiCityId, kunjibettuRegion);
        assertThat(((Number) storedAfterComplete.get("min_lat")).doubleValue())
                .isCloseTo(((Number) expectedAggregate.get("min_lat")).doubleValue(), within(1e-6));
        assertThat(((Number) storedAfterComplete.get("max_lat")).doubleValue())
                .isCloseTo(((Number) expectedAggregate.get("max_lat")).doubleValue(), within(1e-6));

        // Step 7 + 8: capture a full snapshot, re-apply with NOTHING further changed, and assert
        // the third run is a true zero-write no-op — generated_at is unchanged for every region
        // and every membership row from what it was right after the geometry-completion apply.
        //
        // generated_at alone is NOT sufficient proof here: @DataJpaTest wraps the whole test in a
        // single transaction, so Postgres now() (and therefore any generated_at the production
        // code writes) is FROZEN at the transaction's start for every statement in this test —
        // generated_at would read identical whether or not this final apply() rewrote the rows.
        // ctid (physical tuple location) is captured too and asserted unchanged: unlike
        // generated_at, ctid always advances on a real UPDATE regardless of transaction-local
        // clock freezing, so an unchanged ctid is genuine proof of zero writes.
        List<Map<String, Object>> regionsBeforeFinal = jdbcTemplate.queryForList(
                "SELECT region_key, generated_at, ctid::text AS ctid_val FROM city_regions "
                        + "WHERE city_id = ? ORDER BY region_key", udupiCityId);
        List<Map<String, Object>> membershipsBeforeFinal = jdbcTemplate.queryForList(
                "SELECT area_key, generated_at, ctid::text AS ctid_val FROM city_region_memberships "
                        + "WHERE city_id = ? ORDER BY area_key", udupiCityId);

        onboardingService.apply(udupiCityId);

        List<Map<String, Object>> regionsAfterFinal = jdbcTemplate.queryForList(
                "SELECT region_key, generated_at, ctid::text AS ctid_val FROM city_regions "
                        + "WHERE city_id = ? ORDER BY region_key", udupiCityId);
        List<Map<String, Object>> membershipsAfterFinal = jdbcTemplate.queryForList(
                "SELECT area_key, generated_at, ctid::text AS ctid_val FROM city_region_memberships "
                        + "WHERE city_id = ? ORDER BY area_key", udupiCityId);

        assertThat(regionsAfterFinal)
                .as("third re-apply with nothing further changed is a true zero-write no-op — "
                        + "generated_at AND ctid (physical tuple location) both unchanged for every "
                        + "region row, proving no UPDATE touched them (generated_at alone would "
                        + "pass spuriously under this test's frozen-now() single transaction)")
                .isEqualTo(regionsBeforeFinal);
        assertThat(membershipsAfterFinal)
                .as("membership rows likewise genuinely untouched — ctid unchanged, not just "
                        + "generated_at")
                .isEqualTo(membershipsBeforeFinal);
    }

    /**
     * Sibling to the geometry/bbox regression above: a CENTRE-only change (bbox present and
     * unchanged, only {@code geo_center_lat/lon} moves) must also regenerate the region's
     * materialised centre on the next apply(). Pre-fix, {@code isNoOp} ignored this too.
     */
    @Test
    @DisplayName("a centre-only change (member geo_center, bbox unchanged) regenerates the "
            + "region's materialised centre on re-apply, leaving bounds untouched")
    void geometryCentreOnlyChangeRegeneratesCentreOnRerun() {
        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        String manipalRegion = jdbcTemplate.queryForObject(
                "SELECT region_key FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                String.class, udupiCityId, MANIPAL);

        Map<String, Object> regionBefore = jdbcTemplate.queryForMap(
                "SELECT centre_lat, centre_lon, min_lat, max_lat, generated_at, "
                        + "ctid::text AS ctid_val "
                        + "FROM city_regions WHERE city_id = ? AND region_key = ?", udupiCityId, manipalRegion);

        // Move Manipal's centre only — its bbox (min/max lat/lon) is left untouched.
        jdbcTemplate.update(
                "UPDATE areas SET geo_center_lat = geo_center_lat + 1.0, geo_center_lon = geo_center_lon + 1.0 "
                        + "WHERE area_key = ?",
                MANIPAL);

        onboardingService.apply(udupiCityId);

        Map<String, Object> regionAfter = jdbcTemplate.queryForMap(
                "SELECT centre_lat, centre_lon, min_lat, max_lat, generated_at, "
                        + "ctid::text AS ctid_val "
                        + "FROM city_regions WHERE city_id = ? AND region_key = ?", udupiCityId, manipalRegion);

        Map<String, Object> expectedAggregate = computeExpectedAggregate(udupiCityId, manipalRegion);
        assertThat(((Number) regionAfter.get("centre_lat")).doubleValue())
                .as("centre_lat regenerated from the moved geo_center — would FAIL pre-fix "
                        + "(centre left stale since neither fingerprint nor assignments changed)")
                .isCloseTo(((Number) expectedAggregate.get("centre_lat")).doubleValue(), within(1e-6));
        assertThat(regionAfter.get("centre_lat")).isNotEqualTo(regionBefore.get("centre_lat"));
        assertThat(regionAfter.get("ctid_val"))
                .as("row was genuinely rewritten (xmin advanced) on centre-only regeneration — "
                        + "would be unchanged pre-fix")
                .isNotEqualTo(regionBefore.get("ctid_val"));

        // bbox untouched → materialised min/max bounds unchanged.
        assertThat(((Number) regionAfter.get("min_lat")).doubleValue())
                .isCloseTo(((Number) regionBefore.get("min_lat")).doubleValue(), within(1e-9));
        assertThat(((Number) regionAfter.get("max_lat")).doubleValue())
                .isCloseTo(((Number) regionBefore.get("max_lat")).doubleValue(), within(1e-9));
    }

    /**
     * Independently recomputes the expected aggregate (centre = average geo_center; bounds =
     * union of bbox, falling back to geo_center per member when a corner is missing) for a
     * region's CURRENT members, using the same 4-segment classified-area set {@link
     * CityRegionOnboardingService#buildReport} feeds into {@code computeExpectedRegionRows}. Used
     * to verify the persisted {@code city_regions} row without re-deriving it via production
     * code.
     */
    private Map<String, Object> computeExpectedAggregate(int cityId, String regionKey) {
        return jdbcTemplate.queryForMap("""
                SELECT
                    MIN(CASE WHEN a.min_lat IS NOT NULL THEN a.min_lat ELSE a.geo_center_lat END) AS min_lat,
                    MAX(CASE WHEN a.max_lat IS NOT NULL THEN a.max_lat ELSE a.geo_center_lat END) AS max_lat,
                    MIN(CASE WHEN a.min_lon IS NOT NULL THEN a.min_lon ELSE a.geo_center_lon END) AS min_lon,
                    MAX(CASE WHEN a.max_lon IS NOT NULL THEN a.max_lon ELSE a.geo_center_lon END) AS max_lon,
                    AVG(a.geo_center_lat) AS centre_lat,
                    AVG(a.geo_center_lon) AS centre_lon
                FROM city_region_memberships crm
                JOIN areas a ON a.area_key = crm.area_key
                JOIN regional_area_classifications rac
                     ON rac.area_key = crm.area_key AND rac.city_key = 'udupi'
                    AND array_length(string_to_array(rac.area_key, '|'), 1) = 4
                WHERE crm.city_id = ? AND crm.region_key = ?
                """, cityId, regionKey);
    }

    private static RegionSummaryResponse.Region findRegion(RegionSummaryResponse response, String regionKey) {
        return response.regions().stream()
                .filter(r -> regionKey.equals(r.key()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("region " + regionKey + " not found in summary response"));
    }
}
