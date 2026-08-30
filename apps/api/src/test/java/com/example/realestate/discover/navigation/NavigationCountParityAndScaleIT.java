package com.example.realestate.discover.navigation;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverListingsQuery;
import com.example.realestate.discover.DiscoverListingsService;
import com.example.realestate.discover.DiscoverMarkersService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration test (real Postgres) — #1955 Areas PR A gap-filling QA suite, items 5
 * (count-provider parity + EXPLAIN ANALYZE plan) and 6 (representative scale assessment).
 *
 * <p>Navigation trees are seeded DIRECTLY into {@code navigation_nodes} via JDBC (the same
 * established pattern {@code NavigationGraphCacheLifecycleIT#seedSimpleTree} uses) rather than
 * driven through the full prepare/generate/promote pipeline — this class is testing the COUNTS
 * layer ({@link PostgresAreaCountProvider}, {@link AreaCountRollupService}) against a real
 * Postgres-backed {@code property_listings} table, not the generation pipeline (already covered by
 * {@code EndToEndNavigationPipelineIT}), so a hand-built, validation-satisfying tree is sufficient
 * and much faster/deterministic than waiting on the async promotion+cache-refresh path.
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
        "AI_API_KEY=test-dummy-not-used-in-count-parity-it",
        "spring.task.scheduling.enabled=false"
})
class NavigationCountParityAndScaleIT {

    private static final Logger log = LoggerFactory.getLogger(NavigationCountParityAndScaleIT.class);

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
    @Autowired private AreaCountRollupService rollupService;
    @Autowired private DiscoverListingsService discoverListingsService;
    @Autowired private DiscoverMarkersService discoverMarkersService;

    private final List<String> testCitySlugs = new ArrayList<>();

    @AfterEach
    void cleanup() {
        for (String slug : testCitySlugs) {
            Integer cityId = jdbc.queryForObject("SELECT id FROM public.cities WHERE slug = ?", Integer.class, slug);
            if (cityId == null) {
                continue;
            }
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

    /** [#1956 D3/D6, fixed] DIRECTION root (was ROOT CLUSTER pre-#1956 — flagged in PR1's report,
     *  fixed here per the D6(d) ruling) -&gt; 2 CLUSTERs (the single "Local Destination" level,
     *  depth 1) -&gt; 2 AREA leaves each (4 areas total, depth 2) — the smallest shape that lets the
     *  no-double-count roll-up assertion span two branch levels while staying within the max
     *  public depth of 2 (invariant #14). */
    private NavigationGraph seedTwoLevelTreeWithFourAreas(String slug) {
        int cityId = seedCity(slug);
        // area_key MUST be the real 4-pipe-segment convention (country|state|city|area) --
        // PostgresAreaCountProvider's FOUR_SEGMENT_GUARD silently excludes anything shorter.
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

    /** Same as {@link #insertListing} but also sets {@code seller_type} and {@code bedrooms}, which
     *  the cross-endpoint parity test filters on. */
    private void insertListing(String areaKey, String propertyType, String purpose,
                                String sellerType, Integer bedrooms) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, listing_purpose, seller_type, bedrooms, latitude, longitude, "
                        + " created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, ?, ?, ?, ?, 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, propertyType, purpose, sellerType, bedrooms, now, now);
    }

    // =========================================================================================
    // 1 — count-provider parity: rollup totals == independent raw-SQL totals; no double counting
    // =========================================================================================

    @Test
    @DisplayName("count-provider parity: AreaCountRollupService's node roll-up == an INDEPENDENT raw "
            + "SQL COUNT over the same node's descendant areas, at every level of a 2-level tree; "
            + "the root's total is not inflated by any area being counted twice")
    void rollupTotals_matchIndependentRawSql_noDoubleCounting() {
        String slug = "cpq1";
        NavigationGraph graph = seedTwoLevelTreeWithFourAreas(slug);

        String a1 = "IN|KA|" + slug + "|area-1";
        String a2 = "IN|KA|" + slug + "|area-2";
        String a3 = "IN|KA|" + slug + "|area-3";
        String a4 = "IN|KA|" + slug + "|area-4";

        // Distinct, non-uniform listing counts per area so an inflation bug (double-counting one
        // area) would change the aggregate totals, not just accidentally cancel out.
        insertListing(a1, "house", "sale");
        insertListing(a1, "house", "sale");
        insertListing(a1, "house", "sale");
        insertListing(a2, "house", "sale");
        insertListing(a3, "house", "sale");
        insertListing(a3, "house", "sale");
        insertListing(a3, "house", "sale");
        insertListing(a3, "house", "sale");
        insertListing(a4, "house", "sale");
        insertListing(a4, "house", "sale");
        // 3,1,4,2 -> total 10

        AreaCountQuery query = AreaCountQuery.blended(slug);
        Map<String, Long> areaCounts = postgresProvider.countsByAreaKey(query);

        long independentRawTotal = jdbc.queryForObject(
                "SELECT COUNT(*) FROM public.property_listings WHERE area_key LIKE ? "
                        + "AND status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false",
                Long.class, "IN|KA|" + slug + "|%");
        assertThat(independentRawTotal).isEqualTo(10L);

        NavigationNode root = graph.nodeByKey("d:" + slug + ":root");
        NavigationNode left = graph.nodeByKey("c:" + slug + ":left");
        NavigationNode right = graph.nodeByKey("c:" + slug + ":right");

        long rootTotal = rollupService.countForNode(graph, root, areaCounts);
        long leftTotal = rollupService.countForNode(graph, left, areaCounts);
        long rightTotal = rollupService.countForNode(graph, right, areaCounts);

        assertThat(rootTotal).as("root roll-up must equal the independent raw-SQL total").isEqualTo(independentRawTotal);
        assertThat(leftTotal).isEqualTo(3L + 1L);
        assertThat(rightTotal).isEqualTo(4L + 2L);
        assertThat(leftTotal + rightTotal)
                .as("sibling branch totals must sum to the root total exactly once each -- no double count")
                .isEqualTo(rootTotal);

        // childCounts(root's children) sums to the same total via the public roll-up API.
        long childCountsSum = rollupService
                .childCounts(graph, null, areaCounts, AreaSchoolCoverage.empty()).stream()
                .mapToLong(AreaCountRollupService.NodeCount::count).sum();
        assertThat(childCountsSum).isEqualTo(rootTotal);
    }

    // =========================================================================================
    // 1b — CROSS-ENDPOINT parity: navigation count == discover-listings total, for the exact
    //      mis-cased/out-of-range input shapes that used to diverge (#1956 PR1 review fix, AC1.16)
    // =========================================================================================

    /**
     * The regression this class did not previously have. Every assertion below FAILED before the
     * shared {@code DiscoverFilterNormalizer} was introduced, because the counts path normalised its
     * inputs while {@code DiscoverListingsService} forwarded the raw controller values into the
     * case-SENSITIVE {@code DiscoverListingPredicateBuilder} predicate:
     *
     * <ul>
     *   <li>{@code propertyTypes=[APARTMENT]} — count 1, listings 0.</li>
     *   <li>{@code listingPurpose=SALE} — count BLENDED (the exact-match allowlist dropped the
     *       value entirely, so the whole city was counted), listings 0. The worst shape: a
     *       whole-city number beside an empty result list.</li>
     *   <li>{@code sellerTypes=[OWNER]} — count 1, listings 0.</li>
     *   <li>{@code bedrooms=[9]} — count clamped to {@code >= 4}, listings ran {@code IN (9)} → 0.</li>
     * </ul>
     *
     * <p>Three further shapes are pinned here at the reviewer's request, covering rules introduced
     * or changed by the review cycle rather than the original defect:
     *
     * <ul>
     *   <li>{@code bedrooms=[0]} — the studio value the "upper-clamp only" ruling preserves. It was
     *       untested when that ruling landed, which is precisely how a wrong lower clamp survived a
     *       first pass.</li>
     *   <li>an UNKNOWN {@code propertyTypes} and an UNKNOWN {@code sellerTypes} — a NARROWING filter
     *       nothing satisfies must be zero on BOTH sides, never widened to the whole city. This is
     *       the gap that let the summary-endpoint regression through.</li>
     * </ul>
     *
     * <p>All THREE read surfaces are compared — navigation count, discover-listings total, and the
     * MARKERS total. Markers share {@code build()} so parity is safe by construction, but this PR is
     * about numbers that must agree, and "safe by construction" is not a pinned assertion.
     *
     * <p>Non-vacuity: the blended baseline is asserted non-zero up front, so the two deliberately
     * zero-valued cases are distinguishable from an all-zero fixture that would make every equality
     * pass trivially.
     */
    @Test
    @DisplayName("cross-endpoint parity (counts vs listings vs markers): mis-cased "
            + "propertyTypes/purpose/sellerTypes, out-of-range and studio bedrooms, and UNSATISFIABLE "
            + "unknown narrowing filters all agree across the three surfaces")
    void crossEndpointParity_misCasedOutOfRangeAndUnsatisfiableFilters_allSurfacesAgree() {
        String slug = "cpq5";
        int cityId = seedCity(slug);
        String a1 = "IN|KA|" + slug + "|area-1";
        String a2 = "IN|KA|" + slug + "|area-2";
        seedArea(cityId, a1);
        seedArea(cityId, a2);

        // 5 listings, each distinguishable on exactly one filter dimension so a divergence on one
        // dimension cannot be masked by another.
        insertListing(a1, "apartment", "sale", "owner", 2);
        insertListing(a1, "house", "rent", "broker", 5);
        insertListing(a2, "villa", "rent", "builder", 3);
        insertListing(a2, "house", "rent", "dealer", 1);
        insertListing(a2, "house", "rent", "broker", 0); // studio — the bedrooms=0 case

        // Non-vacuity baseline: an all-zero fixture would make every equality below pass trivially.
        assertParity(slug, "blended (no filters)",
                AreaCountQuery.blended(slug), listingsQuery(slug, null, null, null, null), 5L);

        assertParity(slug, "propertyTypes=APARTMENT",
                AreaCountQuery.blended(slug).withPropertyTypes(List.of("APARTMENT")),
                listingsQuery(slug, List.of("APARTMENT"), null, null, null),
                1L);

        assertParity(slug, "listingPurpose=SALE",
                AreaCountQuery.blended(slug).withListingPurpose("SALE"),
                listingsQuery(slug, null, null, null, "SALE"),
                1L);

        assertParity(slug, "sellerTypes=OWNER",
                AreaCountQuery.blended(slug).withSellerTypes(List.of("OWNER")),
                listingsQuery(slug, null, null, List.of("OWNER"), null),
                1L);

        // bedrooms=9 → upper-clamped to 4, i.e. "4 or more" → only the 5-bedroom listing.
        assertParity(slug, "bedrooms=9",
                AreaCountQuery.blended(slug).withBedrooms(List.of(9)),
                listingsQuery(slug, null, List.of(9), null, null),
                1L);

        // bedrooms=0 → preserved (NOT clamped up to 1) → only the studio.
        assertParity(slug, "bedrooms=0 (studio)",
                AreaCountQuery.blended(slug).withBedrooms(List.of(0)),
                listingsQuery(slug, null, List.of(0), null, null),
                1L);

        // UNSATISFIABLE narrowing filters: zero on every surface, never the whole city.
        assertParity(slug, "propertyTypes=penthouse (unknown)",
                AreaCountQuery.blended(slug).withPropertyTypes(List.of("penthouse")),
                listingsQuery(slug, List.of("penthouse"), null, null, null),
                0L);

        assertParity(slug, "sellerTypes=landlord (unknown)",
                AreaCountQuery.blended(slug).withSellerTypes(List.of("LANDLORD")),
                listingsQuery(slug, null, null, List.of("LANDLORD"), null),
                0L);
    }

    /**
     * Asserts navigation count == discover-listings total == markers total == {@code expected} for
     * one input shape. All three derive from the same seeded city and the same shared predicate.
     */
    private void assertParity(String slug, String label, AreaCountQuery countQuery,
                               DiscoverListingsQuery listingsQuery, long expected) {
        long navigationCount = postgresProvider.countsByAreaKey(countQuery).values().stream()
                .mapToLong(Long::longValue).sum();
        long listingsTotal = discoverListingsService.getListings(listingsQuery).totalElements();
        long markersTotal = discoverMarkersService
                .getMarkers(markersFilters(listingsQuery))
                .totalFilteredElements();

        assertThat(navigationCount)
                .as("%s: navigation count must equal the discover-listings total (%s)", label, slug)
                .isEqualTo(listingsTotal);
        assertThat(markersTotal)
                .as("%s: markers total must equal the discover-listings total (%s)", label, slug)
                .isEqualTo(listingsTotal);
        assertThat(listingsTotal)
                .as("%s: all three surfaces must equal the expected figure", label)
                .isEqualTo(expected);
    }

    private static DiscoverListingsQuery listingsQuery(String city, List<String> propertyTypes,
                                                        List<Integer> bedrooms, List<String> sellerTypes,
                                                        String listingPurpose) {
        return new DiscoverListingsQuery(
                city, propertyTypes, null, null, null, null, bedrooms, sellerTypes,
                null, null, null, null, null, null, null, null, null, null,
                0, 50, false, listingPurpose, null);
    }

    /**
     * The markers-path {@code Filters} for the same query. Mirrors {@code
     * DiscoverListingsService#toFilters} field-for-field — reconstructed here rather than reused
     * because that method is package-private to {@code com.example.realestate.discover} and this
     * test lives in {@code ...discover.navigation}. The RAW (un-normalised) values are passed
     * deliberately: normalisation happening inside {@code build()} is exactly what is under test.
     */
    private static DiscoverListingPredicateBuilder.Filters markersFilters(DiscoverListingsQuery q) {
        return new DiscoverListingPredicateBuilder.Filters(
                q.city(), q.propertyTypes(), q.priceMinPaise(), q.priceMaxPaise(),
                q.dateFrom(), q.dateTo(), q.bedrooms(), q.sellerTypes(),
                q.backOnMarket(), q.newToMarket(), q.reraRegistered(), q.readyToMove(),
                q.polygon(), q.schoolLat(), q.schoolLon(), q.schoolRadiusKm(),
                q.bbox(), q.q(), q.listingPurpose(), null, q.areaKeys());
    }

    // =========================================================================================
    // 2 — Buy/Rent/filter cache-key isolation
    // =========================================================================================

    @Test
    @DisplayName("cache-key isolation: sale/rent and house/apartment queries never contaminate each "
            + "other's cached rolled-up totals for the same city+revision")
    void cacheKeyIsolation_purposeAndPropertyTypeNeverCrossContaminate() {
        String slug = "cpq2";
        NavigationGraph graph = seedTwoLevelTreeWithFourAreas(slug);
        String a1 = "IN|KA|" + slug + "|area-1";
        String a2 = "IN|KA|" + slug + "|area-2";
        insertListing(a1, "house", "sale");
        insertListing(a1, "house", "sale");
        insertListing(a2, "apartment", "rent");
        insertListing(a2, "apartment", "rent");
        insertListing(a2, "apartment", "rent");

        AreaCountQuery saleHouse = AreaCountQuery.blended(slug)
                .withListingPurpose("sale").withPropertyTypes(List.of("house"));
        AreaCountQuery rentApartment = AreaCountQuery.blended(slug)
                .withListingPurpose("rent").withPropertyTypes(List.of("apartment"));
        AreaCountQuery blended = AreaCountQuery.blended(slug);

        Map<String, Long> saleCounts = rollupService.areaCountsForCity(slug, 1L, saleHouse);
        Map<String, Long> rentCounts = rollupService.areaCountsForCity(slug, 1L, rentApartment);
        Map<String, Long> blendedCounts = rollupService.areaCountsForCity(slug, 1L, blended);

        assertThat(saleCounts).containsExactlyEntriesOf(Map.of(a1, 2L));
        assertThat(rentCounts).containsExactlyEntriesOf(Map.of(a2, 3L));
        assertThat(blendedCounts.values().stream().mapToLong(Long::longValue).sum()).isEqualTo(5L);

        // Re-fetching sale AFTER rent/blended were cached must return the SAME sale-only result --
        // proves the cache key genuinely separates filter contexts, not just a coincidence of
        // insertion order.
        Map<String, Long> saleCountsAgain = rollupService.areaCountsForCity(slug, 1L, saleHouse);
        assertThat(saleCountsAgain).isEqualTo(saleCounts);
    }

    // =========================================================================================
    // 3 — EXPLAIN ANALYZE of the ONE area-level COUNT-by-area query
    // =========================================================================================

    @Test
    @DisplayName("EXPLAIN ANALYZE: the area-level GROUP BY count query produces a real aggregation "
            + "plan (GroupAggregate/HashAggregate) over property_listings, captured as evidence")
    void explainAnalyze_countByAreaQuery_capturesRealAggregationPlan() {
        String slug = "cpq3";
        int cityId = seedCity(slug);
        for (int i = 1; i <= 3; i++) {
            String areaKey = "IN|KA|" + slug + "|area-" + i;
            seedArea(cityId, areaKey);
            for (int j = 0; j < 50; j++) {
                insertListing(areaKey, "house", "sale");
            }
        }

        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                slug, null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null, null, null, null);
        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(filters);

        String sqlText = PostgresAreaCountProvider.COUNT_BY_AREA_SQL_TEMPLATE.formatted(
                sql.whereFragment(), "array_length(string_to_array(pl.area_key, '|'), 1) = 4");

        List<String> planLines = jdbc.queryForList("EXPLAIN ANALYZE " + sqlText, String.class, sql.params().toArray());
        assertThat(planLines).isNotEmpty();
        String plan = String.join("\n", planLines);
        log.info("NavigationCountParityAndScaleIT EXPLAIN ANALYZE plan for COUNT_BY_AREA_SQL_TEMPLATE:\n{}", plan);

        assertThat(plan)
                .as("the query must actually execute a GROUP BY aggregation, not a per-row scan with "
                        + "app-side grouping")
                .containsAnyOf("GroupAggregate", "HashAggregate", "Aggregate");
        assertThat(plan).contains("property_listings");
    }

    // =========================================================================================
    // 4 — Representative scale assessment (honest extrapolation, not exhaustive 500k)
    // =========================================================================================

    @Test
    @DisplayName("scale (representative volume): area-level count query cost scales with rows "
            + "actually scanned/areas, not per-listing app-side work; wall-clock + heap recorded and "
            + "documented as an honest extrapolation basis, not a substitute for a real 500k load test")
    void scaleAssessment_representativeVolume_costTrackedForExtrapolation() {
        String slug = "cpq4";
        int cityId = seedCity(slug);
        int areaCount = 25;
        int listingsPerArea = 800; // 25 * 800 = 20,000 listings -- representative, not 500k.
        List<String> areaKeys = new ArrayList<>();
        for (int i = 0; i < areaCount; i++) {
            String areaKey = "IN|KA|" + slug + "|area-" + i;
            seedArea(cityId, areaKey);
            areaKeys.add(areaKey);
        }

        long insertStart = System.currentTimeMillis();
        for (String areaKey : areaKeys) {
            for (int j = 0; j < listingsPerArea; j++) {
                insertListing(areaKey, j % 2 == 0 ? "house" : "apartment", j % 3 == 0 ? "rent" : "sale");
            }
        }
        long insertMs = System.currentTimeMillis() - insertStart;

        Long totalListings = jdbc.queryForObject(
                "SELECT COUNT(*) FROM public.property_listings WHERE area_key LIKE ?",
                Long.class, "IN|KA|" + slug + "|%");
        assertThat(totalListings).isEqualTo((long) areaCount * listingsPerArea);

        Runtime rt = Runtime.getRuntime();
        System.gc();
        long heapBeforeBytes = rt.totalMemory() - rt.freeMemory();

        long queryStart = System.currentTimeMillis();
        Map<String, Long> counts = postgresProvider.countsByAreaKey(AreaCountQuery.blended(slug));
        long queryMs = System.currentTimeMillis() - queryStart;

        long heapAfterBytes = rt.totalMemory() - rt.freeMemory();

        assertThat(counts).hasSize(areaCount);
        assertThat(counts.values().stream().mapToLong(Long::longValue).sum()).isEqualTo(totalListings);

        log.info("NavigationCountParityAndScaleIT scale assessment: {} areas x {} listings = {} rows. "
                        + "Insert took {}ms; the ONE area-level GROUP BY count query took {}ms "
                        + "(returns {} rows -- one per area, NOT one per listing). Heap before={}KB "
                        + "after={}KB (delta={}KB). This is a REPRESENTATIVE 20k-row volume, not the "
                        + "full 500k budget from the launch plan -- full 500k seeding was judged "
                        + "infeasible to run reliably inside this Testcontainers session's time/heap "
                        + "budget. Honest extrapolation: the query is a single indexed/sequential GROUP "
                        + "BY pass over property_listings filtered by the shared predicate (see the "
                        + "EXPLAIN ANALYZE evidence in explainAnalyze_countByAreaQuery_capturesRealAggregationPlan) "
                        + "whose output cardinality is bounded by AREA COUNT, not listing count -- so "
                        + "response SIZE stays flat as listing volume grows, and query TIME should grow "
                        + "roughly linearly with rows scanned (not super-linearly), assuming no missing "
                        + "index regresses the plan to a slower scan at higher volume -- that assumption "
                        + "is NOT verified at 500k here and should be spot-checked before launch with a "
                        + "real production-scale load test, not assumed from this extrapolation alone.",
                areaCount, listingsPerArea, totalListings, insertMs, queryMs, counts.size(),
                heapBeforeBytes / 1024, heapAfterBytes / 1024, (heapAfterBytes - heapBeforeBytes) / 1024);

        // Loose sanity bound only -- this is a representative-volume smoke, not a perf gate: the
        // ONE aggregation query over 20k rows must complete well within a request timeout budget.
        assertThat(queryMs).isLessThan(5_000);
    }
}
