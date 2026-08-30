package com.example.realestate.discover.navigation;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.DefaultApplicationArguments;
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
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * #2086 PR #2111 rework-cycle-1 regression coverage (PR_REVIEW BLOCKING finding): proves the fix
 * for the availability regression the strict runtime-load validation introduced — the currently
 * PROMOTED Bangalore revision (a DIRECTION with 36-86 direct AREA children, valid under the
 * PRE-#2086 contract but not the new #15/#16 checks) could not be loaded/served on a fresh backend
 * instance, because {@link NavigationGraphLoader} ran the SAME strict validation the generation/
 * promotion path uses on every runtime load, not just on new candidates.
 *
 * <p>Real Postgres (Testcontainers, NOT mocked) with a hand-seeded LEGACY tree shape — a DIRECTION
 * with 30+ direct AREA children and NO CLUSTER level, inserted directly via JDBC rather than
 * produced by {@link NavigationTreeGenerator} (which cannot emit that shape post-#2086) — so this
 * fixture is a faithful stand-in for a row that was promoted BEFORE #2086 and has not yet been
 * regenerated/re-promoted. Every test here drives the REAL production entry point ({@link
 * NavigationCachePreloadRunner#run}, {@link NavigationHierarchySafetyPoller#reconcile}, or {@link
 * NavigationGraphCache#refreshActiveRevision}) rather than calling {@link
 * NavigationTreeValidationService#validate} directly — the original defect lived in a CALL SITE
 * (the loader was invoking the wrong validation mode), so a test bypassing that call site would
 * have missed the regression and would miss a re-regression of it just as easily.
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
        "AI_API_KEY=test-dummy-not-used-in-navigation-runtime-load-it",
        "spring.task.scheduling.enabled=false"
})
class NavigationRuntimeLoadLenientRegressionIT {

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

    // See NavigationGraphCacheLifecycleIT's identical field for why ApplicationRunner + @Qualifier
    // is required (an @Async ApplicationRunner is proxied against its interface only).
    @Autowired
    @Qualifier("navigationCachePreloadRunner")
    private ApplicationRunner preloadRunner;
    @Autowired private NavigationGraphCache cache;
    @Autowired private NavigationHierarchyReadinessState readinessState;
    @Autowired private NavigationHierarchySafetyPoller safetyPoller;
    @Autowired private JdbcTemplate jdbc;

    private final List<String> testCitySlugs = new ArrayList<>();
    private int nextRevisionNumber = 1;

    @BeforeEach
    void setUp() {
        testCitySlugs.clear();
        nextRevisionNumber = 1;
    }

    @AfterEach
    void cleanup() {
        for (String slug : testCitySlugs) {
            Integer cityId = jdbc.queryForObject("SELECT id FROM public.cities WHERE slug = ?", Integer.class, slug);
            if (cityId == null) {
                continue;
            }
            jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.navigation_nodes WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.cities WHERE id = ?", cityId);
        }
    }

    // ── Regression proof 1 + 4: a legacy 36-child promoted tree preloads on a FRESH instance,
    // with no unapproved promotion required (the PROMOTED row already exists — as it does for the
    // real Bangalore revision today — and nothing here calls any promotion/regeneration flow). ──

    @Test
    @DisplayName("#2086 regression: a legacy PROMOTED revision with 36 direct AREA children under "
            + "one DIRECTION (no CLUSTER level — the real Bangalore shape) preloads and serves on a "
            + "FRESH backend instance via the REAL NavigationCachePreloadRunner startup path, with "
            + "readiness becoming READY and no promotion/regeneration performed")
    void preload_freshInstance_loadsLegacyPromotedTree_36DirectAreaChildren() {
        int cityId = seedCity("nav-legacy-preload", true);
        long revisionId = seedPromotedRevision(cityId);
        seedLegacyBreadthTree(cityId, "nav-legacy-preload-d", 36);

        runPreloadAndAwaitReady("nav-legacy-preload");

        // Preload success is already proven non-lazily by runPreloadAndAwaitReady() above (via the
        // active-revision pointer) — this getActiveGraph() call now only READS the already-preloaded
        // graph, it cannot be the thing that proves preload worked.
        assertThat(cache.activeRevisionId("nav-legacy-preload")).hasValue(revisionId);
        assertThat(cache.getActiveGraph("nav-legacy-preload")).isPresent();
        // 1 DIRECTION + 36 AREA leaves.
        assertThat(cache.getActiveGraph("nav-legacy-preload").get().nodeCount()).isEqualTo(37);
    }

    @Test
    @DisplayName("#2086 regression: a legacy PROMOTED revision with 86 direct AREA children (the "
            + "largest of the reported real Bangalore Direction sizes) also preloads and serves on a "
            + "fresh instance — proves the fix is not merely tuned to one specific child count")
    void preload_freshInstance_loadsLegacyPromotedTree_86DirectAreaChildren() {
        int cityId = seedCity("nav-legacy-preload-86", true);
        long revisionId = seedPromotedRevision(cityId);
        seedLegacyBreadthTree(cityId, "nav-legacy-preload-86-d", 86);

        runPreloadAndAwaitReady("nav-legacy-preload-86");

        // Preload success is already proven non-lazily above — this read cannot be what proves it worked.
        assertThat(cache.activeRevisionId("nav-legacy-preload-86")).hasValue(revisionId);
        assertThat(cache.getActiveGraph("nav-legacy-preload-86")).isPresent();
        assertThat(cache.getActiveGraph("nav-legacy-preload-86").get().nodeCount()).isEqualTo(87);
    }

    // ── Regression proof 1 (second call site): the SAME legacy shape also loads via the safety
    // poller's repair path — NavigationHierarchySafetyPoller -> NavigationGraphCache
    // .refreshActiveRevision -> NavigationGraphLoader.loadValidated — with NO prior cache entry
    // (a fresh process where the poller runs, e.g., before/independently of the preload runner). ──

    @Test
    @DisplayName("#2086 regression: NavigationHierarchySafetyPoller — the exact component whose live "
            + "failure against Bangalore's real revisionId=8 was the original evidence for this "
            + "finding — successfully repairs onto a legacy 58-child promoted tree with no prior "
            + "cache entry (simulating a fresh instance where the poller is the first thing to load "
            + "this city)")
    void safetyPoller_freshInstance_repairsOntoLegacyPromotedTree_58DirectAreaChildren() {
        int cityId = seedCity("nav-legacy-poller", true);
        seedPromotedRevision(cityId);
        seedLegacyBreadthTree(cityId, "nav-legacy-poller-d", 58);

        // No preload/seed call at all — activePointers has NO entry for this slug, exactly the
        // "fresh instance, no warm in-memory graph" scenario the finding describes.
        assertThat(cache.activeRevisionId("nav-legacy-poller")).isEmpty();

        safetyPoller.reconcile();

        assertThat(cache.activeRevisionId("nav-legacy-poller")).isPresent();
        assertThat(cache.getActiveGraph("nav-legacy-poller")).isPresent();
        assertThat(cache.getActiveGraph("nav-legacy-poller").get().nodeCount()).isEqualTo(59);
    }

    // ── Regression proof 3: a compliant #2086 candidate — Direction -> Cluster(<=15) -> Area —
    // still loads successfully through the SAME (now-lenient) runtime loader; leniency changes
    // nothing observable for a tree that already satisfies #15/#16. ──

    @Test
    @DisplayName("#2086 regression: a #2086-COMPLIANT tree (Direction -> two 8-area Local "
            + "Destinations) still preloads and serves correctly through the runtime loader — "
            + "leniency changes nothing for a tree that already satisfies #15/#16")
    void preload_compliantTree_stillLoadsSuccessfully() {
        int cityId = seedCity("nav-compliant-preload", true);
        long revisionId = seedPromotedRevision(cityId);
        seedCompliantTree(cityId, "nav-compliant-preload-d");

        runPreloadAndAwaitReady("nav-compliant-preload");

        assertThat(cache.getActiveGraph("nav-compliant-preload")).isPresent();
        // 1 DIRECTION + 2 CLUSTERs + 16 AREA leaves.
        assertThat(cache.getActiveGraph("nav-compliant-preload").get().nodeCount()).isEqualTo(19);
        assertThat(cache.activeRevisionId("nav-compliant-preload")).hasValue(revisionId);
    }

    // ── Fixture helpers ──────────────────────────────────────────────────────────────────────────

    /**
     * Runs the REAL startup preload for {@code expectedCitySlug} and waits for it to prove itself
     * via a signal that is structurally incapable of being satisfied by request-time lazy loading.
     *
     * <p><b>#2086 PR_REVIEW rework-cycle-2 fix:</b> the prior version of this helper polled {@code
     * cache.getActiveGraph(citySlug)} to detect preload completion. That is unsound as a
     * preload-proving signal because {@link NavigationGraphCache#getActiveGraph} IS the
     * request-time lazy-load entry point (a cache miss for an already-set pointer triggers {@link
     * NavigationGraphLoader#loadValidated} inline via Caffeine's {@code get(key, mappingFn)}) — so a
     * test that waits on it cannot distinguish "startup preload populated the cache" from "some
     * later lazy load populated it instead."
     *
     * <p>This helper instead polls {@link NavigationGraphCache#activeRevisionId(String)} — the
     * active-revision pointer. Reading it is a plain {@code ConcurrentHashMap.get(citySlug)}; unlike
     * {@code getActiveGraph}, it NEVER calls {@link NavigationGraphLoader}, so observing it can never
     * itself trigger a load. It is populated in exactly two places in the whole codebase: {@link
     * NavigationGraphCache#seed}, called ONLY by {@code NavigationCachePreloadRunner}'s startup
     * preload on a successful load, and {@link NavigationGraphCache#refreshActiveRevision}, called
     * ONLY by the promotion AFTER_COMMIT listener or {@code NavigationHierarchySafetyPoller}'s
     * explicit {@code reconcile()} — never by {@code getActiveGraph}'s lazy path. Each test in this
     * class seeds a brand-new, never-before-used {@code citySlug}, no promotion event is ever fired
     * (the PROMOTED row is inserted directly via JDBC), and the safety poller is never invoked for
     * these preload-specific slugs — so a present pointer for {@code expectedCitySlug} here can only
     * have come from THIS call's own startup preload.
     *
     * <p>(A global one-shot signal such as {@code NavigationHierarchyReadinessState} was tried
     * first but rejected: it is a single sticky flag shared across every {@code @Test} method in
     * this class's one Spring context, latched to {@code READY} forever once any ONE test's preload
     * completes — so a later test polling it would observe a stale {@code READY} left over from an
     * earlier test and return before ITS OWN async preload had actually finished, racing the
     * assertions that follow. The per-{@code citySlug} active-revision pointer has no such
     * cross-test staleness because every test uses a unique slug.)
     *
     * <p>Only AFTER the pointer is observed present does a caller read the graph via {@code
     * getActiveGraph(...)} — at that point it is guaranteed to be reading a graph the startup
     * preload itself populated, never one a lazy load produced. {@code DEGRADED_LAZY}/lazy-loading
     * is never consulted or accepted as a pass condition by this helper.
     */
    private void runPreloadAndAwaitReady(String expectedCitySlug) {
        try {
            preloadRunner.run(EMPTY_ARGS);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        long deadline = System.currentTimeMillis() + 15_000;
        do {
            if (cache.activeRevisionId(expectedCitySlug).isPresent()) {
                return;
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                throw new RuntimeException(ie);
            }
        } while (System.currentTimeMillis() < deadline);
        fail("timed out after 15s waiting for citySlug=" + expectedCitySlug + "'s active-revision "
                + "pointer to be set by startup preload (NavigationGraphCache#activeRevisionId stayed "
                + "empty) — startup preload did not prove itself in time");
    }

    private static final ApplicationArguments EMPTY_ARGS = new DefaultApplicationArguments();

    private int seedCity(String slug, boolean active) {
        testCitySlugs.add(slug);
        return jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, ?) RETURNING id",
                Integer.class, slug, slug + "-test-city", active);
    }

    private long seedPromotedRevision(int cityId) {
        return jdbc.queryForObject(
                "INSERT INTO public.city_launch_revision (city_id, revision_number, lifecycle_status, "
                        + "promoted_at) VALUES (?, ?, 'PROMOTED', now()) RETURNING id",
                Long.class, cityId, nextRevisionNumber++);
    }

    /**
     * The LEGACY (pre-#2086) shape the finding is about: ONE DIRECTION node with {@code
     * childCount} direct AREA children and NO CLUSTER level in between — structurally valid under
     * checks #1-#14 (and under the pre-#2086 contract as a whole) but violates #15's 15-child
     * ceiling and #15's "expose a Local Destination level above this size" mandate once {@code
     * childCount > 15}. Inserted directly via JDBC — {@link NavigationTreeGenerator} cannot emit
     * this shape post-#2086, which is exactly why a hand-seeded fixture is required to reproduce an
     * already-promoted legacy row.
     */
    private void seedLegacyBreadthTree(int cityId, String rootNodeKey, int childCount) {
        List<String> areaKeys = new ArrayList<>(childCount);
        for (int i = 0; i < childCount; i++) {
            String areaKey = rootNodeKey + "-a" + i;
            areaKeys.add(areaKey);
            jdbc.update("INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon) "
                    + "VALUES (?, ?, ?, 13.05, 77.59)", areaKey, cityId, areaKey);
        }

        long directionId = jdbc.queryForObject(
                "INSERT INTO public.navigation_nodes (city_id, region_key, node_type, parent_node_id, "
                        + "node_key, area_key, representative_area_keys, display_label, display_order, depth, "
                        + "ancestor_keys, descendant_area_count, centre_lat, centre_lon, min_lat, min_lon, "
                        + "max_lat, max_lon, policy_fingerprint, generated_at) "
                        + "VALUES (?, 'north', 'DIRECTION', NULL, ?, NULL, ?::text[], ?, 1, 0, "
                        + "ARRAY[]::text[], ?, 13.05, 77.59, 13.0, 77.5, 13.1, 77.7, 'fp', now()) RETURNING id",
                Long.class, cityId, rootNodeKey, toPgArrayLiteral(areaKeys.subList(0, Math.min(2, areaKeys.size()))),
                rootNodeKey, childCount);

        for (int i = 0; i < childCount; i++) {
            String areaKey = areaKeys.get(i);
            jdbc.update(
                    "INSERT INTO public.navigation_nodes (city_id, region_key, node_type, parent_node_id, "
                            + "node_key, area_key, representative_area_keys, display_label, display_order, depth, "
                            + "ancestor_keys, descendant_area_count, centre_lat, centre_lon, min_lat, min_lon, "
                            + "max_lat, max_lon, policy_fingerprint, generated_at) "
                            + "VALUES (?, 'north', 'AREA', ?, ?, ?, ARRAY[?]::text[], ?, ?, 1, ARRAY[?]::text[], 1, "
                            + "13.05, 77.59, 13.04, 77.49, 13.06, 77.51, 'fp', now())",
                    cityId, directionId, rootNodeKey + "-leaf" + i, areaKey, areaKey, areaKey, i + 1, rootNodeKey);
        }
    }

    /**
     * A #2086-COMPLIANT tree: one DIRECTION with two CLUSTER (Local Destination) children, each
     * holding 8 AREA leaves — well within the 15-child/15-area ceilings, so checks #15/#16 never
     * fire regardless of {@link ValidationMode}.
     */
    private void seedCompliantTree(int cityId, String rootNodeKey) {
        List<String> allAreas = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            allAreas.add(rootNodeKey + "-g0-area" + i);
        }
        for (int i = 0; i < 8; i++) {
            allAreas.add(rootNodeKey + "-g1-area" + i);
        }
        // Representative areas must themselves be real member areas of the cluster (check #7) — use
        // the first two of each cluster's own 8 leaves rather than a disjoint made-up key.
        List<String> cluster1Areas = List.of(allAreas.get(0), allAreas.get(1));
        List<String> cluster2Areas = List.of(allAreas.get(8), allAreas.get(9));
        for (String areaKey : allAreas) {
            jdbc.update("INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon) "
                    + "VALUES (?, ?, ?, 13.05, 77.59)", areaKey, cityId, areaKey);
        }

        long directionId = jdbc.queryForObject(
                "INSERT INTO public.navigation_nodes (city_id, region_key, node_type, parent_node_id, "
                        + "node_key, area_key, representative_area_keys, display_label, display_order, depth, "
                        + "ancestor_keys, descendant_area_count, centre_lat, centre_lon, min_lat, min_lon, "
                        + "max_lat, max_lon, policy_fingerprint, generated_at) "
                        + "VALUES (?, 'north', 'DIRECTION', NULL, ?, NULL, ?::text[], ?, 1, 0, "
                        + "ARRAY[]::text[], 16, 13.05, 77.59, 13.0, 77.5, 13.1, 77.7, 'fp', now()) RETURNING id",
                Long.class, cityId, rootNodeKey, toPgArrayLiteral(cluster1Areas), rootNodeKey);

        long cluster1Id = seedClusterAndLeaves(cityId, directionId, rootNodeKey, rootNodeKey + "-c0", 1,
                allAreas.subList(0, 8), cluster1Areas);
        seedClusterAndLeaves(cityId, directionId, rootNodeKey, rootNodeKey + "-c1", 2,
                allAreas.subList(8, 16), cluster2Areas);
    }

    private long seedClusterAndLeaves(
            int cityId, long directionId, String rootNodeKey, String clusterNodeKey, int displayOrder,
            List<String> areaKeys, List<String> representativeAreaKeys) {
        long clusterId = jdbc.queryForObject(
                "INSERT INTO public.navigation_nodes (city_id, region_key, node_type, parent_node_id, "
                        + "node_key, area_key, representative_area_keys, display_label, display_order, depth, "
                        + "ancestor_keys, descendant_area_count, centre_lat, centre_lon, min_lat, min_lon, "
                        + "max_lat, max_lon, policy_fingerprint, generated_at) "
                        + "VALUES (?, 'north', 'CLUSTER', ?, ?, NULL, ?::text[], ?, ?, 1, ARRAY[?]::text[], 8, "
                        + "13.05, 77.59, 13.0, 77.5, 13.1, 77.7, 'fp', now()) RETURNING id",
                Long.class, cityId, directionId, clusterNodeKey, toPgArrayLiteral(representativeAreaKeys),
                clusterNodeKey, displayOrder, rootNodeKey);

        for (int i = 0; i < areaKeys.size(); i++) {
            String areaKey = areaKeys.get(i);
            jdbc.update(
                    "INSERT INTO public.navigation_nodes (city_id, region_key, node_type, parent_node_id, "
                            + "node_key, area_key, representative_area_keys, display_label, display_order, depth, "
                            + "ancestor_keys, descendant_area_count, centre_lat, centre_lon, min_lat, min_lon, "
                            + "max_lat, max_lon, policy_fingerprint, generated_at) "
                            + "VALUES (?, 'north', 'AREA', ?, ?, ?, ARRAY[?]::text[], ?, ?, 2, ?::text[], 1, "
                            + "13.05, 77.59, 13.04, 77.49, 13.06, 77.51, 'fp', now())",
                    cityId, clusterId, clusterNodeKey + "-leaf" + i, areaKey, areaKey, areaKey, i + 1,
                    toPgArrayLiteral(List.of(rootNodeKey, clusterNodeKey)));
        }
        return clusterId;
    }

    private static String toPgArrayLiteral(List<String> values) {
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('"').append(values.get(i).replace("\"", "\\\"")).append('"');
        }
        return sb.append('}').toString();
    }
}
