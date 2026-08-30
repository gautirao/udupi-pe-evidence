package com.example.realestate.discover.navigation;

import com.example.realestate.discover.AreaSummary;
import com.example.realestate.discover.AreaSummaryService;
import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.github.benmanes.caffeine.cache.Ticker;
import org.springframework.dao.DataIntegrityViolationException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Testcontainers integration test (real Postgres) — #1956 PR1 gap-filling QA suite covering the
 * work {@link NavigationCountParityAndScaleIT} (pre-#1956) does not: per-area map correctness for
 * BOTH dimensions, school-count {@code DISTINCT ON} aggregation across a cluster's member areas,
 * filter parity between the counts path and the cards/markers predicate (the casing-bug fix), one
 * query per provider call (no N+1), and cache-key normalisation collapsing equivalent filter forms
 * onto ONE cache entry.
 *
 * <p>Same seeding harness as {@code NavigationCountParityAndScaleIT} (navigation trees seeded
 * directly into {@code navigation_nodes} via JDBC), extended with {@code schools}/{@code
 * school_discover_area_coverage} seeding for the school-count tests.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword=",
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://test.example.com/auth/v1",
        "AI_API_KEY=test-dummy-not-used-in-navigation-counts-filter-school-it",
        "spring.task.scheduling.enabled=false"
})
class NavigationCountsFilterAndSchoolCountIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine").asCompatibleSubstituteFor("postgres"));

    @TestConfiguration
    static class TestJwtDecoderConfig {
        @Bean
        @Primary
        public JwtDecoder testJwtDecoder() {
            return token -> Jwt.withTokenValue(token)
                    .header("alg", "none")
                    .subject(token)
                    .issuedAt(Instant.now())
                    .expiresAt(Instant.now().plusSeconds(3600))
                    .build();
        }
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private NavigationNodeRepository navigationNodeRepository;
    @Autowired private PostgresAreaCountProvider postgresProvider;
    @Autowired private PostgresAreaSchoolCountProvider schoolCountProvider;
    @Autowired private AreaSummaryService areaSummaryService;

    private static final String COVERAGE_TRIGGER_INSERT = "trg_sync_school_discover_area_coverage_insert";
    private static final String COVERAGE_TRIGGER_UPDATE = "trg_sync_school_discover_area_coverage_update";
    private static final String AREA_KEY_TRIGGER = "trg_school_area_key";

    private final List<String> testCitySlugs = new ArrayList<>();

    /** Disables V80's lat/lon-&gt;area_key trigger and V110's coverage-sync triggers (same pattern
     *  as {@code SchoolCoverageBackfillIT}) so schools inserted by {@link #insertSchoolNoAreaKey}
     *  never get an auto-assigned {@code area_key} or an auto-synced coverage row — every {@code
     *  school_discover_area_coverage} row in this class is the one this test explicitly inserts via
     *  {@link #insertCoverage}. */
    @BeforeEach
    void disableSchoolTriggersForIsolatedCoverageControl() {
        jdbc.execute("ALTER TABLE public.schools DISABLE TRIGGER " + COVERAGE_TRIGGER_INSERT);
        jdbc.execute("ALTER TABLE public.schools DISABLE TRIGGER " + COVERAGE_TRIGGER_UPDATE);
        jdbc.execute("ALTER TABLE public.schools DISABLE TRIGGER " + AREA_KEY_TRIGGER);
    }

    @AfterEach
    void reenableSchoolTriggers() {
        jdbc.execute("ALTER TABLE public.schools ENABLE TRIGGER " + COVERAGE_TRIGGER_INSERT);
        jdbc.execute("ALTER TABLE public.schools ENABLE TRIGGER " + COVERAGE_TRIGGER_UPDATE);
        jdbc.execute("ALTER TABLE public.schools ENABLE TRIGGER " + AREA_KEY_TRIGGER);
    }

    @AfterEach
    void cleanup() {
        for (String slug : testCitySlugs) {
            Integer cityId = jdbc.queryForObject("SELECT id FROM public.cities WHERE slug = ?", Integer.class, slug);
            if (cityId == null) {
                continue;
            }
            jdbc.update("DELETE FROM public.school_discover_area_coverage WHERE curated_area_key LIKE ?",
                    "IN|KA|" + slug + "|%");
            jdbc.update("DELETE FROM public.schools WHERE area_key LIKE ?", "IN|KA|" + slug + "|%");
            jdbc.update("DELETE FROM public.property_listings WHERE area_key LIKE ?", "IN|KA|" + slug + "|%");
            jdbc.update("DELETE FROM public.navigation_nodes WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.cities WHERE id = ?", cityId);
        }
        testCitySlugs.clear();
    }

    // ── Fixtures ─────────────────────────────────────────────────────────────────────────────

    private int seedCity(String slug) {
        testCitySlugs.add(slug);
        return jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, true) RETURNING id",
                Integer.class, slug, slug + "-test-city");
    }

    private void seedArea(int cityId, String areaKey) {
        jdbc.update("INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon) "
                + "VALUES (?, ?, ?, 13.05, 74.70)", areaKey, cityId, areaKey);
    }

    private long insertNode(int cityId, String nodeType, Long parentId, String nodeKey, String areaKey,
                             List<String> representativeAreaKeys, int displayOrder, int depth,
                             List<String> ancestorKeys, int descendantAreaCount) {
        return jdbc.queryForObject(
                "INSERT INTO public.navigation_nodes (city_id, region_key, node_type, parent_node_id, "
                        + "node_key, area_key, representative_area_keys, display_label, display_order, depth, "
                        + "ancestor_keys, descendant_area_count, centre_lat, centre_lon, min_lat, min_lon, "
                        + "max_lat, max_lon, policy_fingerprint, generated_at) "
                        + "VALUES (?, 'north', ?, ?, ?, ?, ?::text[], ?, ?, ?, ?::text[], ?, "
                        + "13.05, 74.70, 13.0, 74.6, 13.1, 74.8, 'fp-count-it', now()) RETURNING id",
                Long.class, cityId, nodeType, parentId, nodeKey, areaKey,
                pgTextArray(representativeAreaKeys), nodeKey, displayOrder, depth,
                pgTextArray(ancestorKeys), descendantAreaCount);
    }

    private static String pgTextArray(List<String> values) {
        if (values == null || values.isEmpty()) {
            return "{}";
        }
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('"').append(values.get(i).replace("\"", "\\\"")).append('"');
        }
        return sb.append('}').toString();
    }

    /** Same shape as {@code NavigationCountParityAndScaleIT#seedTwoLevelTreeWithFourAreas}: DIRECTION
     *  root -&gt; 2 CLUSTERs -&gt; 2 AREA leaves each. */
    private NavigationGraph seedTwoLevelTreeWithFourAreas(String slug) {
        int cityId = seedCity(slug);
        String a1 = "IN|KA|" + slug + "|area-1";
        String a2 = "IN|KA|" + slug + "|area-2";
        String a3 = "IN|KA|" + slug + "|area-3";
        String a4 = "IN|KA|" + slug + "|area-4";
        for (String a : List.of(a1, a2, a3, a4)) {
            seedArea(cityId, a);
        }

        String rootKey = "d:" + slug + ":root";
        String leftKey = "c:" + slug + ":left";
        String rightKey = "c:" + slug + ":right";

        long rootId = insertNode(cityId, "DIRECTION", null, rootKey, null, List.of(a1, a3), 1, 0, List.of(), 4);
        long leftId = insertNode(cityId, "CLUSTER", rootId, leftKey, null, List.of(a1, a2), 1, 1, List.of(rootKey), 2);
        long rightId = insertNode(cityId, "CLUSTER", rootId, rightKey, null, List.of(a3, a4), 2, 1, List.of(rootKey), 2);
        insertNode(cityId, "AREA", leftId, "a:" + a1, a1, List.of(a1), 1, 2, List.of(rootKey, leftKey), 1);
        insertNode(cityId, "AREA", leftId, "a:" + a2, a2, List.of(a2), 2, 2, List.of(rootKey, leftKey), 1);
        insertNode(cityId, "AREA", rightId, "a:" + a3, a3, List.of(a3), 1, 2, List.of(rootKey, rightKey), 1);
        insertNode(cityId, "AREA", rightId, "a:" + a4, a4, List.of(a4), 2, 2, List.of(rootKey, rightKey), 1);

        List<NavigationNode> flat = navigationNodeRepository.findByCityIdOrderByDepthAscDisplayOrderAsc(cityId);
        return NavigationGraph.build(slug, 1L, flat);
    }

    private void insertListing(String areaKey, String propertyType, String purpose) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, listing_purpose, latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, ?, ?, 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, propertyType, purpose, now, now);
    }

    /** Inserts a school with NO area_key (no automatic trigger-created coverage row), so the test
     *  can insert exactly the {@code school_discover_area_coverage} rows it wants. */
    private UUID insertSchoolNoAreaKey(String name) {
        jdbc.update(
                "INSERT INTO public.schools (name, board_type, latitude, longitude, district, source) "
                        + "VALUES (?, 'CBSE', 13.35, 74.79, 'Test fixture district', 'TEST_FIXTURE')",
                name);
        return jdbc.queryForObject("SELECT id FROM public.schools WHERE name = ?", UUID.class, name);
    }

    private void insertCoverage(UUID schoolId, String areaKey, String relationshipType) {
        jdbc.update(
                "INSERT INTO public.school_discover_area_coverage "
                        + "(school_id, curated_area_key, relationship_type, source) "
                        + "VALUES (?, ?, ?, 'manual_review')",
                schoolId, areaKey, relationshipType);
    }

    /** {@code nearby} rows REQUIRE a distance — V110's
     *  {@code CHECK (relationship_type <> 'nearby' OR distance_meters IS NOT NULL)} (V110:44) — so
     *  they cannot go through {@link #insertCoverage}, which leaves the column null. */
    private void insertNearbyCoverage(UUID schoolId, String areaKey, double distanceMeters) {
        jdbc.update(
                "INSERT INTO public.school_discover_area_coverage "
                        + "(school_id, curated_area_key, relationship_type, distance_meters, source) "
                        + "VALUES (?, ?, 'nearby', ?, 'manual_review')",
                schoolId, areaKey, distanceMeters);
    }

    // =========================================================================================
    // 1 — per-area school counts describe THEIR OWN area; roll-ups union on school identity
    // =========================================================================================

    /**
     * THE WORKED EXAMPLE for the school-count contract fix (#1956 PR1). One school with qualifying
     * coverage in BOTH Area A and Area B must give A=1, B=1, and an A+B parent roll-up of 1.
     *
     * <p><b>DELIBERATE RULE CHANGE — this test REPLACES {@code
     * schoolCount_distinctOnCollapsesEachSchoolToOneCanonicalArea_noDoubleCountAcrossCluster}</b>,
     * which asserted the opposite for the same fixture: that a school covering two areas counted
     * toward exactly ONE of them, so the other reported 0. That was not a considered trade-off with
     * an unfortunate side effect — it was a defect, and the old test encoded it as intended
     * behaviour. The implementation bought "sum of children == parent" by globally partitioning each
     * school to one "canonical" area via {@code DISTINCT ON (school_id)}, which made an individual
     * area's own count factually wrong. An area's school count must describe THAT AREA.
     *
     * <p>The roll-up is still correct — a parent counts the school once — but that now comes from
     * UNIONing school identity across descendants rather than from suppressing an area's membership.
     * {@code sum(children) == parent} is consequently NO LONGER an invariant for school counts, and
     * this test asserts the union result (2), NOT a sum (which would be 3).
     */
    @Test
    @DisplayName("WORKED EXAMPLE: a school covering Area A and Area B counts 1 for A AND 1 for B, "
            + "and their shared parent rolls up to 1 — per-area truth without double-counting")
    void schoolCount_schoolInTwoAreas_countsForBothAreas_andParentUnionsToOne() {
        String slug = "scq1";
        NavigationGraph graph = seedTwoLevelTreeWithFourAreas(slug);
        String a1 = "IN|KA|" + slug + "|area-1";
        String a2 = "IN|KA|" + slug + "|area-2"; // same "left" cluster as a1

        // ONE school genuinely covering BOTH areas. Mixed relationship types on purpose: both are in
        // the counted set, and neither "wins" any more — there is no precedence ladder.
        UUID shared = insertSchoolNoAreaKey("Two-Area School");
        insertCoverage(shared, a2, "contained");
        insertCoverage(shared, a1, "primary");

        // A second, independent school only ever covers a2.
        UUID area2Only = insertSchoolNoAreaKey("Area2-Only School");
        insertCoverage(area2Only, a2, "contained");

        AreaSchoolCoverage coverage = schoolCountProvider.schoolCoverageForCity(slug);
        Map<String, Long> perArea = coverage.countsByAreaKey();

        assertThat(perArea.getOrDefault(a1, 0L))
                .as("area-1 genuinely contains the shared school, so it must count 1 -- NOT 0")
                .isEqualTo(1L);
        assertThat(perArea.getOrDefault(a2, 0L))
                .as("area-2 contains the shared school AND its own -- 2, and the shared one is not "
                        + "suppressed just because area-1 also counts it")
                .isEqualTo(2L);

        NavigationNode leftCluster = graph.nodeByKey("c:" + slug + ":left");
        AreaCountRollupService rollup = new AreaCountRollupService(
                postgresProvider, null, false, schoolCountProvider, 30, 500, Ticker.systemTicker());
        long clusterSchoolTotal = rollup.schoolCountForNode(graph, leftCluster, coverage);

        assertThat(clusterSchoolTotal)
                .as("left cluster (area-1 + area-2) holds 2 DISTINCT schools -- the union, not the "
                        + "sum of the per-area counts (which would be 3 and would double-count the "
                        + "shared school)")
                .isEqualTo(2L);
        assertThat(perArea.get(a1) + perArea.get(a2))
                .as("explicitly documenting that sum(children) != parent for school counts -- this "
                        + "is why areaSchoolCounts must never be summed by a client")
                .isNotEqualTo(clusterSchoolTotal);
    }

    /**
     * DELIBERATE RULE CHANGE — replaces {@code schoolCount_reviewedOverrideBeatsPrimaryBeatsContained},
     * which asserted that a school holding all three counted relationship types was attributed to
     * the {@code reviewed_override} area ALONE, with the other two areas explicitly absent from the
     * map. There is no precedence ladder any more, and there does not need to be one: every area
     * with a qualifying relationship counts the school. The counted-relationship SET is unchanged.
     */
    @Test
    @DisplayName("all three counted relationship types are equal citizens: a school holding one of "
            + "each counts for ALL THREE areas — no precedence ladder picks a winner")
    void schoolCount_allCountedRelationshipTypesCount_noPrecedenceLadder() {
        String slug = "scq2";
        int cityId = seedCity(slug);
        String a1 = "IN|KA|" + slug + "|area-1";
        String a2 = "IN|KA|" + slug + "|area-2";
        String a3 = "IN|KA|" + slug + "|area-3";
        seedArea(cityId, a1);
        seedArea(cityId, a2);
        seedArea(cityId, a3);

        UUID school = insertSchoolNoAreaKey("Triple Coverage School");
        insertCoverage(school, a1, "contained");
        insertCoverage(school, a2, "primary");
        insertCoverage(school, a3, "reviewed_override");

        Map<String, Long> perArea = schoolCountProvider.schoolCountsByAreaKey(slug);

        assertThat(perArea.getOrDefault(a1, 0L)).as("'contained' still counts").isEqualTo(1L);
        assertThat(perArea.getOrDefault(a2, 0L)).as("'primary' still counts").isEqualTo(1L);
        assertThat(perArea.getOrDefault(a3, 0L)).as("'reviewed_override' still counts").isEqualTo(1L);

        // 'nearby' remains OUTSIDE the counted set — the ruling this fix did not touch.
        String a4 = "IN|KA|" + slug + "|area-4";
        seedArea(cityId, a4);
        insertNearbyCoverage(school, a4, 750.0);
        assertThat(schoolCountProvider.schoolCountsByAreaKey(slug))
                .as("'nearby' is recorded but deliberately never counted")
                .doesNotContainKey(a4);
    }

    /**
     * DELIBERATE RULE CHANGE — replaces {@code
     * schoolCount_multiAreaCoverage_navigationCountIsAtMostAreaSummaryBadge}, which asserted
     * {@code navigationCount <= badge} and, for the doubled area, {@code isNotEqualTo}. That test
     * documented the {@code DISTINCT ON} defect as if it were the contract. With per-area counting
     * restored, the two surfaces are EQUAL per area, and this asserts equality directly.
     *
     * <p><b>Why equality is provable, not merely observed.</b> The badge is a correlated
     * {@code COUNT(*)} with no {@code DISTINCT}, so it could only exceed a distinct-school count if
     * one school held TWO counted rows for the SAME area. V110 declares
     * {@code PRIMARY KEY (school_id, curated_area_key)} (V110:49), so that is impossible regardless
     * of {@code relationship_type} — at most one row exists per (school, area) pair. The fixture
     * below therefore also asserts the PK actually rejects a duplicate, so the equality claim rests
     * on an enforced constraint rather than on the seed data happening to be well-behaved.
     */
    @Test
    @DisplayName("school count vs AreaSummary badge: EQUAL per area, including for a school covering "
            + "two areas — and the (school, area) primary key is what makes that provable")
    void schoolCount_perArea_equalsAreaSummaryBadge_evenForMultiAreaSchools() {
        String slug = "scq6";
        int cityId = seedCity(slug);
        String a1 = "IN|KA|" + slug + "|area-1";
        String a2 = "IN|KA|" + slug + "|area-2";
        seedArea(cityId, a1);
        seedArea(cityId, a2);

        UUID school = insertSchoolNoAreaKey("Two-Area Contained School");
        insertCoverage(school, a1, "contained");
        insertCoverage(school, a2, "contained");

        Map<String, Long> navigationCounts = schoolCountProvider.schoolCountsByAreaKey(slug);
        Map<String, Long> badges = areaSummaryService.getAreasByCity(slug).areas().stream()
                .collect(Collectors.toMap(AreaSummary::areaKey, AreaSummary::schoolCount));

        assertThat(navigationCounts.getOrDefault(a1, 0L))
                .as("area-1 counts the school, and equals its badge")
                .isEqualTo(1L)
                .isEqualTo(badges.get(a1));
        assertThat(navigationCounts.getOrDefault(a2, 0L))
                .as("area-2 ALSO counts the school -- the old implementation reported 0 here")
                .isEqualTo(1L)
                .isEqualTo(badges.get(a2));

        // The constraint the equality argument rests on: a second counted row for the SAME
        // (school, area) pair is rejected, so COUNT(*) can never exceed COUNT(DISTINCT school_id).
        assertThatThrownBy(() -> insertCoverage(school, a1, "reviewed_override"))
                .as("V110's PRIMARY KEY (school_id, curated_area_key) must reject a duplicate pair")
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // =========================================================================================
    // 2 — filter parity: the counts path and the cards/markers predicate never disagree on casing
    // =========================================================================================

    @Test
    @DisplayName("filter parity + casing-bug fix: a differently-cased propertyTypes value produces "
            + "the SAME non-zero result on the counts path and the cards/markers predicate")
    void filterParity_differentlyCasePropertyType_agreesWithCardsMarkersPredicate() {
        String slug = "scq3";
        int cityId = seedCity(slug);
        String a1 = "IN|KA|" + slug + "|area-1";
        seedArea(cityId, a1);
        insertListing(a1, "apartment", "sale");
        insertListing(a1, "house", "sale");

        // The live bug (#1956 PR1): before this fix, ?propertyType=APARTMENT matched case-
        // insensitively on the counts path but case-sensitively (i.e. NOT AT ALL, since stored
        // values are lower-case) on the cards/markers path.
        AreaCountQuery query = AreaCountQuery.blended(slug).withPropertyTypes(List.of("APARTMENT"));
        Map<String, Long> counts = postgresProvider.countsByAreaKey(query);
        assertThat(counts).as("counts path must canonicalise APARTMENT -> apartment").containsEntry(a1, 1L);

        // Independently exercise the SAME shared predicate the cards/markers path uses, with the
        // query's own canonicalised propertyTypes -- this is the actual parity proof: both paths
        // route through DiscoverListingPredicateBuilder#build with the SAME Filters shape.
        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(query.toPredicateFilters());
        Long cardsMarkersCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM property_listings pl WHERE " + sql.whereFragment(),
                Long.class, sql.params().toArray());
        assertThat(cardsMarkersCount).isEqualTo(1L);

        // DELIBERATE RULE CHANGE (#1956 PR1 review fix B), not a weakened assertion: this block
        // previously asserted an unrecognised propertyTypes value dropped to BLENDED (both listings
        // counted). That was overturned -- a narrowing multi-select nothing satisfies must return
        // ZERO, not the whole city dressed up as a match. Still no 400.
        AreaCountQuery unknownType = AreaCountQuery.blended(slug).withPropertyTypes(List.of("not-a-real-type"));
        assertThat(unknownType.propertyTypes())
                .as("preserved so the predicate matches nothing")
                .containsExactly("not-a-real-type");
        Map<String, Long> unsatisfiableCounts = postgresProvider.countsByAreaKey(unknownType);
        assertThat(unsatisfiableCounts.getOrDefault(a1, 0L))
                .as("an impossible property type must count ZERO listings, never all 2")
                .isZero();
    }

    // =========================================================================================
    // 3 — cache-key normalisation: equivalent filter forms collapse onto ONE cache entry
    // =========================================================================================

    @Test
    @DisplayName("cache-key normalisation: differently-ordered/cased propertyTypes and an explicit "
            + "FALSE boolean all normalise to the SAME cache key as the canonical blended form")
    void cacheKeyNormalisation_equivalentFilterForms_collapseToOneCacheEntry() {
        String slug = "scq4";
        seedTwoLevelTreeWithFourAreas(slug);

        AtomicInteger providerCalls = new AtomicInteger();
        AreaCountProvider countingProvider = q -> {
            providerCalls.incrementAndGet();
            return postgresProvider.countsByAreaKey(q);
        };
        AreaCountRollupService rollup = new AreaCountRollupService(
                postgresProvider, countingProvider, true, schoolCountProvider, 30, 500, Ticker.systemTicker());

        AreaCountQuery reordered = AreaCountQuery.blended(slug)
                .withPropertyTypes(List.of("house", "apartment", "villa"))
                .withReadyToMove(false); // FALSE must collapse to null, same as omitted
        AreaCountQuery reorderedDifferently = AreaCountQuery.blended(slug)
                .withPropertyTypes(List.of("VILLA", "Apartment", "HOUSE"))
                .withReadyToMove(null);

        assertThat(reordered.normalizedFilterHash()).isEqualTo(reorderedDifferently.normalizedFilterHash());

        rollup.areaCountsForCity(slug, 1L, reordered);
        rollup.areaCountsForCity(slug, 1L, reorderedDifferently);
        rollup.areaCountsForCity(slug, 1L, reordered);

        assertThat(providerCalls.get())
                .as("three logically-equivalent queries must hit the provider exactly once")
                .isEqualTo(1);
    }

    // =========================================================================================
    // 4 — one query per provider call (no N+1 against the roll-up's node/child fan-out)
    // =========================================================================================

    @Test
    @DisplayName("one-query/no-N+1: fetching counts for a node with several children issues exactly "
            + "ONE area-level query per dimension, never one per child/area")
    void oneQueryPerProviderCall_noNPlusOneAcrossChildren() {
        String slug = "scq5";
        NavigationGraph graph = seedTwoLevelTreeWithFourAreas(slug);
        for (int i = 1; i <= 4; i++) {
            insertListing("IN|KA|" + slug + "|area-" + i, "house", "sale");
        }
        UUID school = insertSchoolNoAreaKey("N+1 Guard School");
        insertCoverage(school, "IN|KA|" + slug + "|area-1", "primary");

        AtomicInteger listingQueryCalls = new AtomicInteger();
        AreaCountProvider countingListingProvider = q -> {
            listingQueryCalls.incrementAndGet();
            return postgresProvider.countsByAreaKey(q);
        };
        AreaCountRollupService rollup = new AreaCountRollupService(
                postgresProvider, countingListingProvider, true, schoolCountProvider, 30, 500, Ticker.systemTicker());

        NavigationNode root = graph.nodeByKey("d:" + slug + ":root");
        Map<String, Long> areaCounts = rollup.areaCountsForCity(slug, 1L, AreaCountQuery.blended(slug));
        AreaSchoolCoverage coverage = rollup.schoolCoverageForCity(slug, 1L);

        // childCounts fans out over every child of root (2 CLUSTERs), each of which fans out
        // internally over its own descendant areas -- all of this is in-memory work over the
        // ALREADY-FETCHED snapshots above, never a fresh DB round trip. That holds for the SCHOOL
        // dimension too: the union roll-up reads the one cached (area, school) pair set rather than
        // issuing a query per node, which is what keeps AC1.11 true for a 65-child Direction.
        var children = rollup.childCounts(graph, "d:" + slug + ":root", areaCounts, coverage);
        assertThat(children).hasSize(2);
        long total = rollup.countForNode(graph, root, areaCounts);
        assertThat(total).isEqualTo(4L);

        assertThat(listingQueryCalls.get())
                .as("ONE area-level listing query for the whole city, regardless of child/area fan-out")
                .isEqualTo(1);
    }
}
