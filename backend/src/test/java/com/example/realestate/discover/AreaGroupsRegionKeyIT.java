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

/**
 * Testcontainers integration test proving {@link AreaGroupsService#getGroupsByCity}'s derived-at-
 * read {@code regionKey} (#1882 Track A PR2, AC15/AC17) against REAL onboarded Bangalore data.
 *
 * <p>{@code city_region_memberships} is populated exclusively via the real onboarding path
 * ({@link RegionalClassificationBackfillService#runBackfill()} then
 * {@link CityRegionOnboardingService#apply(int)}) — never fabricated directly. Bangalore's real
 * curated {@code area_groups} are, by {@code apply()}'s own design, always resolved to a single
 * effective region per group before a run can succeed (see {@code
 * CityRegionOnboardingService#isResolvedByOverrides}) — so a genuinely SPLIT-at-read group can
 * only arise from an area_group DEFINITION that post-dates onboarding (exactly the real-world
 * scenario {@code regionKey} exists to handle: area_group membership can drift out of sync with
 * the last onboarding run). This test therefore builds its UNIFIED/SPLIT/DEGENERATE fixture
 * groups from real, already-materialized {@code city_region_memberships} rows (or, for
 * DEGENERATE, a real area that {@code apply(bangaloreCityId)} never classifies) — only the
 * {@code area_groups}/{@code area_group_members} *definitions* are test-authored, matching how
 * every other {@code AreaGroupsService} test in this codebase seeds its fixtures.
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
class AreaGroupsRegionKeyIT {

    private static final String TEST_GROUP_SLUG_PREFIX = "regionkey-it-";

    // Real, already-seeded Udupi area — never classified under city_key='bangalore' (the
    // backfill only classifies areas belonging to the target city), so it can never acquire a
    // bangalore-scoped city_region_memberships row. Used as the DEGENERATE fixture's sole member.
    private static final String UDUPI_MANIPAL = "IN|KA|Udupi|Manipal";

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private CityRegionOnboardingService onboardingService;
    private RegionalClassificationBackfillService backfillService;
    private AreaGroupsService areaGroupsService;

    private Integer bangaloreCityId;

    @BeforeEach
    void setUp() {
        onboardingService = new CityRegionOnboardingService(jdbcTemplate);
        backfillService = new RegionalClassificationBackfillService(jdbcTemplate);
        areaGroupsService = new AreaGroupsService(jdbcTemplate);

        bangaloreCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'bangalore'", Integer.class);

        // Defensive reset — apply()/runBackfill() write via JdbcTemplate, which @DataJpaTest's
        // per-test transactional rollback does not necessarily cover; also clear any test
        // fixture area_groups left by a previous run.
        deleteTestFixtureGroups();
        jdbcTemplate.update("DELETE FROM city_region_memberships WHERE city_id = ?", bangaloreCityId);
        jdbcTemplate.update("DELETE FROM city_regions WHERE city_id = ?", bangaloreCityId);
        jdbcTemplate.update("DELETE FROM regional_area_overrides WHERE city_id = ?", bangaloreCityId);
        jdbcTemplate.update("DELETE FROM regional_area_classifications WHERE city_key = 'bangalore'");
        jdbcTemplate.update(
                "UPDATE city_region_policy SET central_radius_km = 8, policy_fingerprint = NULL WHERE city_id = ?",
                bangaloreCityId);

        int upserted = backfillService.runBackfill();
        assertThat(upserted).as("backfill must populate classifications before onboarding").isGreaterThan(0);

        // Resolve every non-UNIFIED real area_group generically (city-agnostic; mirrors
        // CityRegionOnboardingProjectionIT/CityRegionOnboardingRegenerationIT) so apply() can
        // succeed regardless of the real seed geometry's actual SPLIT/DEGENERATE shape.
        resolveNonUnifiedGroups(bangaloreCityId);
        onboardingService.apply(bangaloreCityId);
    }

    private void deleteTestFixtureGroups() {
        jdbcTemplate.update(
                "DELETE FROM area_groups WHERE city_id = ? AND slug LIKE ?",
                bangaloreCityId, TEST_GROUP_SLUG_PREFIX + "%");
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

    // ── real materialized region samples (never fabricated) ──────────────────

    private record RegionSample(String regionKey, int displayOrder) {}

    /** Every region_key materialized for Bangalore, ordered by its canonical display_order. */
    private List<RegionSample> realMaterializedRegionsByDisplayOrder() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT crm.region_key AS region_key, cr.display_order AS display_order "
                        + "FROM city_region_memberships crm "
                        + "JOIN city_regions cr ON cr.city_id = crm.city_id AND cr.region_key = crm.region_key "
                        + "WHERE crm.city_id = ? "
                        + "GROUP BY crm.region_key, cr.display_order "
                        + "ORDER BY cr.display_order",
                bangaloreCityId);
        return rows.stream()
                .map(r -> new RegionSample((String) r.get("region_key"), ((Number) r.get("display_order")).intValue()))
                .toList();
    }

    /** Real, already-materialized member area_keys for a region, deterministically ordered. */
    private List<String> sampleAreaKeysForRegion(String regionKey, int limit) {
        return jdbcTemplate.queryForList(
                "SELECT area_key FROM city_region_memberships WHERE city_id = ? AND region_key = ? "
                        + "ORDER BY area_key LIMIT ?",
                String.class, bangaloreCityId, regionKey, limit);
    }

    private void insertTestAreaGroup(String slugSuffix, List<String> memberAreaKeys) {
        String slug = TEST_GROUP_SLUG_PREFIX + slugSuffix;
        Integer groupId = jdbcTemplate.queryForObject(
                "INSERT INTO area_groups (city_id, slug, name, display_order, is_active) "
                        + "VALUES (?, ?, ?, 999, true) RETURNING id",
                Integer.class, bangaloreCityId, slug, "RegionKey IT — " + slugSuffix);
        int order = 0;
        for (String areaKey : memberAreaKeys) {
            jdbcTemplate.update(
                    "INSERT INTO area_group_members (area_group_id, area_key, display_order) VALUES (?, ?, ?)",
                    groupId, areaKey, order++);
        }
    }

    private AreaGroupResponse fetchTestGroup(String slugSuffix) {
        AreaGroupsResponse response = areaGroupsService.getGroupsByCity("bangalore");
        return response.groups().stream()
                .filter(g -> g.slug().equals(TEST_GROUP_SLUG_PREFIX + slugSuffix))
                .findFirst()
                .orElseThrow(() -> new AssertionError("test group not found: " + slugSuffix));
    }

    // ── UNIFIED ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("UNIFIED: a single-region group's regionKey is its sole materialized region_key (AC15)")
    void unifiedGroup_regionKeyIsSoleRegion() {
        List<RegionSample> regions = realMaterializedRegionsByDisplayOrder();
        assertThat(regions).as("bangalore must materialize at least one region").isNotEmpty();
        RegionSample region = regions.get(0);
        List<String> members = sampleAreaKeysForRegion(region.regionKey(), 1);
        assertThat(members).isNotEmpty();

        insertTestAreaGroup("unified", members);

        AreaGroupResponse group = fetchTestGroup("unified");
        assertThat(group.regionKey()).isEqualTo(region.regionKey());
    }

    // ── SPLIT: plurality wins over display_order ──────────────────────────────

    @Test
    @DisplayName("SPLIT: plurality (highest member count) wins even when its region_key has a "
            + "HIGHER display_order than the minority region — proves count beats order (AC15)")
    void splitGroup_pluralityWinsOverDisplayOrder() {
        List<RegionSample> regions = realMaterializedRegionsByDisplayOrder();
        assertThat(regions.size()).as("need >=2 distinct materialized regions for a real SPLIT test")
                .isGreaterThanOrEqualTo(2);

        RegionSample minorityRegion = regions.get(0); // lowest display_order
        RegionSample majorityRegion = regions.stream()
                .skip(1)
                .filter(r -> sampleAreaKeysForRegion(r.regionKey(), 2).size() == 2)
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "no other real materialized region has >=2 member areas to build a plurality fixture"));

        List<String> minorityMembers = sampleAreaKeysForRegion(minorityRegion.regionKey(), 1);
        List<String> majorityMembers = sampleAreaKeysForRegion(majorityRegion.regionKey(), 2);
        assertThat(minorityMembers).hasSize(1);
        assertThat(majorityMembers).hasSize(2);

        List<String> allMembers = new java.util.ArrayList<>(minorityMembers);
        allMembers.addAll(majorityMembers);
        insertTestAreaGroup("split-plurality", allMembers);

        AreaGroupResponse group = fetchTestGroup("split-plurality");
        assertThat(group.regionKey())
                .as("majority region (%d members) must win over minority region (%d members) "
                                + "despite majority's display_order (%d) being higher than minority's (%d)",
                        majorityMembers.size(), minorityMembers.size(),
                        majorityRegion.displayOrder(), minorityRegion.displayOrder())
                .isEqualTo(majorityRegion.regionKey());
    }

    // ── SPLIT: equal-count tie broken by display_order then region_key ────────

    @Test
    @DisplayName("SPLIT: equal member counts across two regions — deterministic tie-break picks "
            + "the region with the LOWER city_regions.display_order (AC15)")
    void splitGroup_equalCountTieBrokenByDisplayOrder() {
        List<RegionSample> regions = realMaterializedRegionsByDisplayOrder();
        assertThat(regions.size()).as("need >=2 distinct materialized regions for a real tie-break test")
                .isGreaterThanOrEqualTo(2);

        RegionSample lowerOrderRegion = regions.get(0);
        RegionSample higherOrderRegion = regions.get(1);
        assertThat(lowerOrderRegion.displayOrder()).isLessThan(higherOrderRegion.displayOrder());

        List<String> a = sampleAreaKeysForRegion(lowerOrderRegion.regionKey(), 1);
        List<String> b = sampleAreaKeysForRegion(higherOrderRegion.regionKey(), 1);
        assertThat(a).hasSize(1);
        assertThat(b).hasSize(1);

        List<String> members = new java.util.ArrayList<>(a);
        members.addAll(b);
        insertTestAreaGroup("split-tiebreak", members);

        AreaGroupResponse group = fetchTestGroup("split-tiebreak");
        assertThat(group.regionKey())
                .as("equal counts (1 each) must be broken by the LOWER display_order region")
                .isEqualTo(lowerOrderRegion.regionKey());
    }

    // ── DEGENERATE ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("DEGENERATE: a group whose sole member has no bangalore-scoped city_region_"
            + "memberships row (a real, never-classified-for-bangalore area) gets regionKey=null (AC15)")
    void degenerateGroup_regionKeyIsNull() {
        Integer existingMembership = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                Integer.class, bangaloreCityId, UDUPI_MANIPAL);
        assertThat(existingMembership).as("fixture precondition: this area must have no bangalore membership")
                .isZero();

        insertTestAreaGroup("degenerate", List.of(UDUPI_MANIPAL));

        AreaGroupResponse group = fetchTestGroup("degenerate");
        assertThat(group.regionKey()).isNull();
    }

    // ── idempotency ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("idempotency: two consecutive calls return byte-identical regionKey per group (AC15/AC17)")
    void regionKeyDerivation_isIdempotentAcrossRepeatedCalls() {
        List<RegionSample> regions = realMaterializedRegionsByDisplayOrder();
        assertThat(regions.size()).isGreaterThanOrEqualTo(2);
        RegionSample r0 = regions.get(0);
        RegionSample r1 = regions.get(1);

        insertTestAreaGroup("idempotent-unified", sampleAreaKeysForRegion(r0.regionKey(), 1));
        List<String> mixed = new java.util.ArrayList<>(sampleAreaKeysForRegion(r0.regionKey(), 1));
        mixed.addAll(sampleAreaKeysForRegion(r1.regionKey(), 1));
        insertTestAreaGroup("idempotent-split", mixed);

        AreaGroupsResponse first = areaGroupsService.getGroupsByCity("bangalore");
        AreaGroupsResponse second = areaGroupsService.getGroupsByCity("bangalore");

        Map<String, String> firstBySlug = first.groups().stream()
                .collect(java.util.stream.Collectors.toMap(AreaGroupResponse::slug, AreaGroupResponse::regionKey));
        Map<String, String> secondBySlug = second.groups().stream()
                .collect(java.util.stream.Collectors.toMap(AreaGroupResponse::slug, AreaGroupResponse::regionKey));

        assertThat(secondBySlug).as("regionKey per group must be byte-identical across repeated calls")
                .isEqualTo(firstBySlug);
    }

    // ── unknown/unonboarded city ───────────────────────────────────────────────

    @Test
    @DisplayName("unknown city slug returns empty groups, no error (AC17)")
    void unknownCity_returnsEmptyGroupsNoError() {
        AreaGroupsResponse response = areaGroupsService.getGroupsByCity("nonexistent-city-xyz");

        assertThat(response.city()).isEqualTo("nonexistent-city-xyz");
        assertThat(response.groups()).isEmpty();
    }

    // ── the confirmed 5/9-empty-regions label-join failure does not recur ─────

    @Test
    @DisplayName("every REAL (non-fixture) active bangalore area_group resolves to a non-null "
            + "regionKey via the membership key-join — the prior curated region_label string-join "
            + "silently left several backend regions with zero group representation; the "
            + "derived-at-read key-join does not repeat that failure (AC17)")
    void realActiveGroups_allResolveNonNullRegionKey_viaKeyJoinNotLabelMatch() {
        AreaGroupsResponse response = areaGroupsService.getGroupsByCity("bangalore");

        List<AreaGroupResponse> realGroups = response.groups().stream()
                .filter(g -> !g.slug().startsWith(TEST_GROUP_SLUG_PREFIX))
                .toList();
        assertThat(realGroups).as("bangalore must have real curated area_groups seeded").isNotEmpty();

        List<String> groupsWithNullRegionKey = realGroups.stream()
                .filter(g -> g.regionKey() == null)
                .map(AreaGroupResponse::slug)
                .toList();
        assertThat(groupsWithNullRegionKey)
                .as("every real active group was resolved to a single region by apply() (via "
                        + "resolveNonUnifiedGroups) — none should be left with a null regionKey")
                .isEmpty();

        long distinctRegionsRepresented = realGroups.stream()
                .map(AreaGroupResponse::regionKey)
                .distinct()
                .count();
        assertThat(distinctRegionsRepresented)
                .as("real groups must genuinely span multiple backend regions via key-equality "
                        + "join — not silently collapse onto a handful via string-label matching")
                .isGreaterThanOrEqualTo(3);
    }
}
