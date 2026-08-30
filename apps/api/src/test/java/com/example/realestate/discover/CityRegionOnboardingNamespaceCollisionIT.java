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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Testcontainers integration test proving {@link CityRegionOnboardingService#apply(int)}
 * enforces the region_key / area_group.slug namespace-collision invariant (#1910): the set of
 * region keys about to be materialized into {@code city_regions} and the set of a city's active
 * {@code area_groups.slug} must be structurally DISJOINT. A collision must block {@code apply()}
 * loudly (never a silent "region wins" tie-break) and roll back with zero partial writes.
 *
 * <p>Udupi's real {@code city_region_policy} uses {@code CENTRAL_CARDINAL_4}, whose canonical
 * region keys are the short uppercase tokens {@code CENTRAL}/{@code N}/{@code E}/{@code S}/
 * {@code W} (see {@link CityRegionProjection#canonicalRegionOrder(String)}) — not full lowercase
 * words. A real collision therefore requires a slug that exactly matches one of these tokens; the
 * negative case below constructs that deliberately by renaming an existing (already-UNIFIED)
 * area_group's slug to {@code "N"}.
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
class CityRegionOnboardingNamespaceCollisionIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

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
        assertThat(upserted).as("backfill must populate classifications before onboarding").isGreaterThan(0);
    }

    /**
     * Resolves every non-UNIFIED area_group generically via {@code regional_area_overrides}, so
     * these tests isolate the namespace-collision guard from the (already-covered, see
     * {@link CityRegionOnboardingSafetyIT}) SPLIT/DEGENERATE guard.
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
    @DisplayName("apply() is blocked with NAMESPACE_COLLISION when an active area_group.slug "
            + "exactly matches a region_key the policy would materialize — zero city_regions "
            + "rows are left behind")
    void applyBlockedWhenAreaGroupSlugCollidesWithRegionKey() {
        resolveNonUnifiedGroups(udupiCityId);

        // Force a real collision: rename an existing, already-UNIFIED group's slug onto the
        // literal region_key "N" that CENTRAL_CARDINAL_4 will materialize for Udupi.
        int renamed = jdbcTemplate.update(
                "UPDATE area_groups SET slug = 'N' WHERE city_id = ? AND slug = 'north-udupi' AND is_active = true",
                udupiCityId);
        assertThat(renamed).as("precondition: north-udupi must exist and be active").isEqualTo(1);

        assertThatThrownBy(() -> onboardingService.apply(udupiCityId))
                .isInstanceOf(RegionOnboardingBlockedException.class)
                .satisfies(ex -> assertThat(((RegionOnboardingBlockedException) ex).reason())
                        .isEqualTo(RegionOnboardingBlockedException.Reason.NAMESPACE_COLLISION))
                .hasMessageContaining("N")
                .hasMessageContaining("udupi");

        Integer regionRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_regions WHERE city_id = ?", Integer.class, udupiCityId);
        Integer membershipRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_region_memberships WHERE city_id = ?", Integer.class, udupiCityId);
        assertThat(regionRows).as("blocked apply() must roll back — zero city_regions rows").isEqualTo(0);
        assertThat(membershipRows).as("blocked apply() must roll back — zero membership rows").isEqualTo(0);
    }

    @Test
    @DisplayName("positive control: real Udupi area_group slugs (north-udupi, south-udupi, "
            + "city-centre, ...) are merely similar-looking to region keys (N, S, CENTRAL, ...) "
            + "but never equal — apply() succeeds normally, no false positive")
    void applySucceedsWhenGroupSlugsAndRegionKeysAreMerelySimilarButDisjoint() {
        resolveNonUnifiedGroups(udupiCityId);

        onboardingService.apply(udupiCityId);

        Integer regionRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_regions WHERE city_id = ?", Integer.class, udupiCityId);
        Integer membershipRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_region_memberships WHERE city_id = ?", Integer.class, udupiCityId);
        assertThat(regionRows).as("clean apply() materializes city_regions rows").isGreaterThan(0);
        assertThat(membershipRows).as("clean apply() materializes membership rows").isGreaterThan(0);
    }

    // ── V119 database-trigger enforcement (#1910 PR2 review follow-up) ──────────
    // The three tests above only prove CityRegionOnboardingService.apply() itself
    // checks for a collision — that check runs at ONE code path, at ONE point in
    // time. It does not stop a later Flyway migration from adding a NEW
    // area_group whose slug collides with a region_key already materialized for
    // a city, since apply() is not re-run automatically on every deploy. These
    // tests bypass the Java service entirely and write directly via JdbcTemplate
    // (mirroring what a raw migration INSERT/UPDATE would do), proving the V119
    // triggers reject the collision structurally — for ANY writer, not just
    // apply().

    @Test
    @DisplayName("V119 db trigger: inserting an area_groups row whose slug matches an existing "
            + "city_regions.region_key for the same city is rejected, bypassing apply() entirely")
    void dbTriggerRejectsAreaGroupSlugCollidingWithExistingCityRegion() {
        String testRegionKey = "ZZ_DBTEST_REGION";
        jdbcTemplate.update(
                "INSERT INTO city_regions (city_id, region_key, display_label, display_order) "
                        + "VALUES (?, ?, 'DB Trigger Test Region', 999)",
                udupiCityId, testRegionKey);

        // No manual cleanup here: once the trigger raises, Postgres aborts the
        // whole transaction (further statements on this connection fail with
        // "current transaction is aborted" until rollback) — @DataJpaTest's
        // per-test transactional rollback handles teardown for us.
        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO area_groups (city_id, slug, name, display_order, is_active) "
                        + "VALUES (?, ?, 'DB Trigger Test Group', 0, true)",
                udupiCityId, testRegionKey))
                .hasMessageContaining("collides")
                .hasMessageContaining(testRegionKey);
    }

    @Test
    @DisplayName("V119 db trigger: inserting a city_regions row whose region_key matches an "
            + "existing ACTIVE area_groups.slug for the same city is rejected")
    void dbTriggerRejectsCityRegionWriteCollidingWithExistingActiveAreaGroupSlug() {
        String testSlug = "zz-dbtest-group";
        jdbcTemplate.update(
                "INSERT INTO area_groups (city_id, slug, name, display_order, is_active) "
                        + "VALUES (?, ?, 'DB Trigger Test Group', 0, true)",
                udupiCityId, testSlug);

        // No manual cleanup here — see the comment in the sibling test above;
        // the aborted transaction after the trigger fires rolls back
        // automatically via @DataJpaTest.
        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO city_regions (city_id, region_key, display_label, display_order) "
                        + "VALUES (?, ?, 'DB Trigger Test Region', 999)",
                udupiCityId, testSlug))
                .hasMessageContaining("collides")
                .hasMessageContaining(testSlug);
    }

    @Test
    @DisplayName("V119 db trigger: an INACTIVE area_groups row never blocks a colliding "
            + "city_regions write — only active groups count as a namespace collision")
    void dbTriggerAllowsCityRegionWriteWhenCollidingAreaGroupIsInactive() {
        String testSlug = "zz-dbtest-inactive-group";
        jdbcTemplate.update(
                "INSERT INTO area_groups (city_id, slug, name, display_order, is_active) "
                        + "VALUES (?, ?, 'DB Trigger Test Inactive Group', 0, false)",
                udupiCityId, testSlug);

        try {
            int inserted = jdbcTemplate.update(
                    "INSERT INTO city_regions (city_id, region_key, display_label, display_order) "
                            + "VALUES (?, ?, 'DB Trigger Test Region', 999)",
                    udupiCityId, testSlug);
            assertThat(inserted).as("an inactive area_group must never block a colliding region write").isEqualTo(1);
        } finally {
            jdbcTemplate.update("DELETE FROM city_regions WHERE city_id = ? AND region_key = ?", udupiCityId, testSlug);
            jdbcTemplate.update("DELETE FROM area_groups WHERE city_id = ? AND slug = ?", udupiCityId, testSlug);
        }
    }

    // ── V119 preflight guard (PR2 review round 2 follow-up) ──────────────────────
    // V119's triggers only guard FUTURE writes; a collision already present in the
    // data at the moment V119 runs (e.g. from rows inserted before V119 existed)
    // must make the migration itself fail loudly rather than install the triggers
    // silently over corrupt state. The migration enforces this via a `DO $$` block
    // that runs the query below and RAISEs if it finds any row. Flyway has already
    // migrated this test schema past V119 by the time any test runs, so re-running
    // the migration mid-test isn't possible; instead this test disables the
    // (already-installed) triggers for the duration of one transaction, writes a
    // deliberate collision directly via JdbcTemplate (bypassing the triggers, the
    // same way a pre-V119 seed migration would have), then executes the migration's
    // own preflight detection query verbatim and asserts it finds the collision.

    /**
     * Verbatim copy of the detection query inside V119's preflight {@code DO $$} block
     * (see {@code V119__enforce_area_group_region_key_disjointness.sql}). Kept in sync
     * manually — if the migration's query changes, update this constant too.
     */
    private static final String V119_PREFLIGHT_DETECTION_SQL =
            "SELECT string_agg(format('city_id=%s slug/region_key=%s', ag.city_id, ag.slug), '; ') "
                    + "FROM public.area_groups ag "
                    + "JOIN public.city_regions cr ON cr.city_id = ag.city_id AND cr.region_key = ag.slug "
                    + "WHERE ag.is_active";

    @Test
    @DisplayName("V119 preflight: the migration's own collision-detection query finds a "
            + "pre-existing area_groups.slug / city_regions.region_key collision when the "
            + "triggers that would otherwise prevent it are bypassed")
    void preflightDetectionQueryFindsPreexistingCollision() {
        String testSlug = "zz-dbtest-preflight-collision";
        jdbcTemplate.execute("ALTER TABLE area_groups DISABLE TRIGGER trg_area_groups_region_key_disjoint");
        jdbcTemplate.execute("ALTER TABLE city_regions DISABLE TRIGGER trg_city_regions_area_group_disjoint");
        try {
            jdbcTemplate.update(
                    "INSERT INTO area_groups (city_id, slug, name, display_order, is_active) "
                            + "VALUES (?, ?, 'Preflight Test Group', 0, true)",
                    udupiCityId, testSlug);
            jdbcTemplate.update(
                    "INSERT INTO city_regions (city_id, region_key, display_label, display_order) "
                            + "VALUES (?, ?, 'Preflight Test Region', 999)",
                    udupiCityId, testSlug);

            String collisions = jdbcTemplate.queryForObject(V119_PREFLIGHT_DETECTION_SQL, String.class);

            assertThat(collisions)
                    .as("preflight query must detect the pre-existing collision")
                    .isNotNull()
                    .contains(String.valueOf(udupiCityId))
                    .contains(testSlug);
        } finally {
            jdbcTemplate.update("DELETE FROM city_regions WHERE city_id = ? AND region_key = ?", udupiCityId, testSlug);
            jdbcTemplate.update("DELETE FROM area_groups WHERE city_id = ? AND slug = ?", udupiCityId, testSlug);
            jdbcTemplate.execute("ALTER TABLE area_groups ENABLE TRIGGER trg_area_groups_region_key_disjoint");
            jdbcTemplate.execute("ALTER TABLE city_regions ENABLE TRIGGER trg_city_regions_area_group_disjoint");
        }
    }

    @Test
    @DisplayName("V119 preflight: the detection query is a true no-op on a clean, "
            + "non-colliding schema — confirms the normal (non-colliding) Flyway path is "
            + "unaffected; this is implicitly re-proven by every @BeforeEach in this class "
            + "succeeding, since Flyway already ran V119's preflight against this schema "
            + "with zero pre-existing collisions before any test executed")
    void preflightDetectionQueryIsNoOpOnCleanSchema() {
        String collisions = jdbcTemplate.queryForObject(V119_PREFLIGHT_DETECTION_SQL, String.class);

        assertThat(collisions)
                .as("a clean schema must have zero area_groups/city_regions collisions")
                .isNull();

        Integer v119Success = jdbcTemplate.queryForObject(
                "SELECT CASE WHEN success THEN 1 ELSE 0 END FROM flyway_schema_history WHERE version = '119'",
                Integer.class);
        assertThat(v119Success).as("V119 must have applied successfully against this schema").isEqualTo(1);
    }
}
