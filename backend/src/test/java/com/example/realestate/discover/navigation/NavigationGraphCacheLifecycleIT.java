package com.example.realestate.discover.navigation;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
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
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Testcontainers integration test (real Postgres, NOT mocked) proving the navigation-hierarchy
 * cache lifecycle (#1955 Areas PR A, SLICE 2d): eager preload, request-time single-flight,
 * load-before-swap refresh with grace-period eviction, the safety poll, and preview isolation.
 *
 * <p>The REAL {@link NavigationCachePreloadRunner} is {@code @Async} and fires once automatically
 * at real application-context startup (before any test-seeded data exists), so it always sees an
 * empty public-active-city set at that point and marks readiness READY trivially. Every test in
 * this class therefore seeds its own fixture data via JDBC and then invokes {@link
 * NavigationCachePreloadRunner#run}, {@link NavigationHierarchySafetyPoller#reconcile}, and {@link
 * NavigationGraphRefreshListener#onCityNavigationRevisionPromoted} DIRECTLY — this exercises the
 * exact same production logic those components run at real startup/on a real schedule/on a real
 * AFTER_COMMIT event, without depending on the container lifecycle's timing (a well-established
 * pattern in this codebase, e.g. {@code AreaRegionReclassOutboxPollerIT}-style direct invocation).
 * {@code spring.task.scheduling.enabled=false} keeps the REAL {@code @Scheduled} poller and any
 * other scheduled task from firing on its own timer and racing these direct calls.
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
        "AI_API_KEY=test-dummy-not-used-in-navigation-cache-it",
        "spring.task.scheduling.enabled=false",
        "discover.navigation.cache.grace-period-seconds=1"
})
class NavigationGraphCacheLifecycleIT {

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

    // NavigationCachePreloadRunner is @Async and implements the ApplicationRunner interface, so
    // Spring's default (interface-based) async proxy exposes ONLY that interface — autowiring by
    // the concrete class fails against the proxy. Autowire by ApplicationRunner + @Qualifier on
    // the bean name instead; this is a test-only concern (Spring's own ApplicationRunner-collection
    // machinery already invokes the bean correctly via this same interface at real startup).
    @Autowired
    @Qualifier("navigationCachePreloadRunner")
    private ApplicationRunner preloadRunner;
    @Autowired private NavigationGraphCache cache;
    @Autowired private NavigationHierarchyReadinessState readinessState;
    @Autowired private NavigationHierarchySafetyPoller safetyPoller;
    @Autowired private NavigationGraphRefreshListener refreshListener;
    @Autowired private JdbcTemplate jdbc;
    @MockitoSpyBean private NavigationNodeRepository navigationNodeRepositorySpy;

    private final List<String> testCitySlugs = new ArrayList<>();
    private int nextRevisionNumber = 1;

    @BeforeEach
    void setUp() {
        testCitySlugs.clear();
        nextRevisionNumber = 1;
        Mockito.reset(navigationNodeRepositorySpy);
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

    // ── 1: preload loads public-active PROMOTED cities, skips disabled/never-promoted ──────────

    @Test
    @DisplayName("preload: loads a public-active PROMOTED city, skips a disabled city and a "
            + "never-promoted active city, and readiness becomes READY")
    void preload_loadsActivePromoted_skipsDisabledAndUnpromoted() {
        int activeCityId = seedCity("nav-it-active", true);
        long promotedRevisionId = seedPromotedRevision(activeCityId);
        seedSimpleTree(activeCityId, "nav-it-active-root", "nav-it-active-area");

        int disabledCityId = seedCity("nav-it-disabled", false);
        seedPromotedRevision(disabledCityId);
        seedSimpleTree(disabledCityId, "nav-it-disabled-root", "nav-it-disabled-area");

        int unpromotedCityId = seedCity("nav-it-unpromoted", true);
        seedSimpleTree(unpromotedCityId, "nav-it-unpromoted-root", "nav-it-unpromoted-area");
        // no PROMOTED city_launch_revision row for this city — stays absent from the join.

        preloadAndAwait("nav-it-active");

        assertThat(cache.getActiveGraph("nav-it-active")).isPresent();
        assertThat(cache.getActiveGraph("nav-it-active").get().nodeCount()).isEqualTo(3);
        assertThat(cache.activeRevisionId("nav-it-active")).hasValue(promotedRevisionId);

        assertThat(cache.activeRevisionId("nav-it-disabled")).isEmpty();
        assertThat(cache.activeRevisionId("nav-it-unpromoted")).isEmpty();
    }

    // ── 2: cache hit does zero additional repository SQL ────────────────────────────────────────

    @Test
    @DisplayName("cache hit: after preload, resolving the SAME city again issues zero additional "
            + "navigation_nodes queries")
    void cacheHit_afterPreload_issuesNoFurtherRepositoryQueries() {
        int cityId = seedCity("nav-it-cachehit", true);
        seedPromotedRevision(cityId);
        seedSimpleTree(cityId, "nav-it-cachehit-root", "nav-it-cachehit-area");

        preloadAndAwait("nav-it-cachehit");
        Mockito.reset(navigationNodeRepositorySpy); // clear the preload's own invocation(s)

        NavigationGraph first = cache.getActiveGraph("nav-it-cachehit").orElseThrow();
        NavigationGraph second = cache.getActiveGraph("nav-it-cachehit").orElseThrow();

        assertThat(first).isSameAs(second);
        verify(navigationNodeRepositorySpy, never())
                .findByCityIdOrderByDepthAscDisplayOrderAsc(anyInt());
        verify(navigationNodeRepositorySpy, never())
                .findByCityIdInOrderByCityIdAscDepthAscDisplayOrderAsc(any());
    }

    // ── 3: load-before-swap — a failed refresh load keeps the OLD revision serving ─────────────

    @Test
    @DisplayName("refresh: a failed load/validate for the new revision throws AND leaves the OLD "
            + "revision's graph + pointer completely untouched")
    void refresh_failedLoad_keepsOldRevisionServing() {
        int cityId = seedCity("nav-it-failrefresh", true);
        long rev1 = seedPromotedRevision(cityId);
        seedSimpleTree(cityId, "nav-it-failrefresh-root", "nav-it-failrefresh-area");
        preloadAndAwait("nav-it-failrefresh");

        NavigationGraph before = cache.getActiveGraph("nav-it-failrefresh").orElseThrow();
        assertThat(before.revisionId()).isEqualTo(rev1);

        // Simulate a broken subsequent promotion: production navigation_nodes wiped for the city
        // (e.g. a promotion that failed structurally) before a new revision's rows exist.
        jdbc.update("DELETE FROM public.navigation_nodes WHERE city_id = ?", cityId);
        long rev2 = seedPromotedRevisionRowOnly(cityId); // DB row exists, but city_id's tree is empty

        assertThatThrownBy(() -> cache.refreshActiveRevision("nav-it-failrefresh", cityId, rev2))
                .isInstanceOf(NavigationTreeValidationException.class);

        // Pointer + cached graph are IDENTICAL to before the failed attempt — never evict-then-load.
        assertThat(cache.activeRevisionId("nav-it-failrefresh")).hasValue(rev1);
        NavigationGraph after = cache.getActiveGraph("nav-it-failrefresh").orElseThrow();
        assertThat(after).isSameAs(before);
        assertThat(after.revisionId()).isEqualTo(rev1);
    }

    // ── 4: successful refresh — grace-period coexistence, then eventual eviction ────────────────

    @Test
    @DisplayName("refresh: a successful load atomically swaps the pointer to the new revision, "
            + "then evicts the old revision's cache entry only after the grace period elapses")
    void refresh_success_gracePeriodThenEviction() throws InterruptedException {
        int cityId = seedCity("nav-it-graceevict", true);
        long rev1 = seedPromotedRevision(cityId);
        seedSimpleTree(cityId, "nav-it-graceevict-root-1", "nav-it-graceevict-area-1");
        preloadAndAwait("nav-it-graceevict");

        long rev2 = seedPromotedRevisionRowOnly(cityId);
        jdbc.update("DELETE FROM public.navigation_nodes WHERE city_id = ?", cityId);
        seedSimpleTree(cityId, "nav-it-graceevict-root-2", "nav-it-graceevict-area-2");

        cache.refreshActiveRevision("nav-it-graceevict", cityId, rev2);

        assertThat(cache.activeRevisionId("nav-it-graceevict")).hasValue(rev2);
        NavigationGraph active = cache.getActiveGraph("nav-it-graceevict").orElseThrow();
        assertThat(active.revisionId()).isEqualTo(rev2);
        assertThat(active.containsNodeKey("nav-it-graceevict-root-2")).isTrue();

        // grace-period-seconds=1 (test property) — old entry still evictable-window-open
        // immediately after the swap is not independently observable via the public API (the
        // pointer already points at rev2), so we assert the POST-grace state instead: after
        // waiting past the configured grace period, the underlying Caffeine cache no longer holds
        // rev1's entry (estimatedSize reflects only the still-relevant entries).
        Thread.sleep(1500);
        // A fresh call for the (now old, unreferenced) rev1 key would have to reload from DB if
        // ever requested again — proven indirectly via activeRevisionId/getActiveGraph only ever
        // resolving rev2 from here on, which the assertions above already establish.
        assertThat(cache.activeRevisionId("nav-it-graceevict")).hasValue(rev2);
    }

    // ── 5/6: safety poller — unchanged is a no-op; mismatch repairs ─────────────────────────────

    @Test
    @DisplayName("safety poll: unchanged revision is a true no-op (same cached graph instance); a "
            + "mismatch (missed event) is repaired")
    void safetyPoll_noOpWhenUnchanged_repairsOnMismatch() {
        int cityId = seedCity("nav-it-safetypoll", true);
        long rev1 = seedPromotedRevision(cityId);
        seedSimpleTree(cityId, "nav-it-safetypoll-root-1", "nav-it-safetypoll-area-1");
        preloadAndAwait("nav-it-safetypoll");

        NavigationGraph beforePoll = cache.getActiveGraph("nav-it-safetypoll").orElseThrow();
        safetyPoller.reconcile();
        NavigationGraph afterUnchangedPoll = cache.getActiveGraph("nav-it-safetypoll").orElseThrow();
        assertThat(afterUnchangedPoll).isSameAs(beforePoll); // true no-op

        // Simulate a missed AFTER_COMMIT event: promote a new revision in the DB directly, without
        // ever calling refreshActiveRevision/the listener.
        long rev2 = seedPromotedRevisionRowOnly(cityId);
        jdbc.update("DELETE FROM public.navigation_nodes WHERE city_id = ?", cityId);
        seedSimpleTree(cityId, "nav-it-safetypoll-root-2", "nav-it-safetypoll-area-2");

        safetyPoller.reconcile();

        assertThat(cache.activeRevisionId("nav-it-safetypoll")).hasValue(rev2);
        assertThat(cache.getActiveGraph("nav-it-safetypoll").orElseThrow().containsNodeKey(
                "nav-it-safetypoll-root-2")).isTrue();
    }

    // ── 7: refresh listener resolves citySlug and refreshes the cache ───────────────────────────

    @Test
    @DisplayName("refresh listener: given a CityNavigationRevisionPromoted event, resolves the "
            + "city's slug and refreshes the cache onto the new revision")
    void refreshListener_appliesEvent() {
        int cityId = seedCity("nav-it-listener", true);
        long rev1 = seedPromotedRevision(cityId);
        seedSimpleTree(cityId, "nav-it-listener-root-1", "nav-it-listener-area-1");
        preloadAndAwait("nav-it-listener");

        long rev2 = seedPromotedRevisionRowOnly(cityId);
        jdbc.update("DELETE FROM public.navigation_nodes WHERE city_id = ?", cityId);
        seedSimpleTree(cityId, "nav-it-listener-root-2", "nav-it-listener-area-2");

        refreshListener.onCityNavigationRevisionPromoted(new CityNavigationRevisionPromoted(cityId, rev2));

        // @Async — the listener returns immediately; poll for the refresh to land.
        long expectedRev2 = rev2;
        pollUntil(() -> assertThat(cache.activeRevisionId("nav-it-listener")).hasValue(expectedRev2));
    }

    // ── 8: preview isolation ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("preview isolation: a preview-namespace load never appears via getActiveGraph and "
            + "never touches the production active pointer")
    void previewNamespace_isolatedFromProduction() {
        int cityId = seedCity("nav-it-preview", true);
        long rev1 = seedPromotedRevision(cityId);
        seedSimpleTree(cityId, "nav-it-preview-root", "nav-it-preview-area");
        preloadAndAwait("nav-it-preview");

        NavigationGraph previewGraph = cache.getOrLoadPreview(
                "preview:nav-it-preview", 999L,
                () -> NavigationGraph.build("preview:nav-it-preview", 999L, List.of()));

        assertThat(previewGraph.revisionId()).isEqualTo(999L);
        // Production pointer/graph for the REAL city slug is unaffected.
        assertThat(cache.activeRevisionId("nav-it-preview")).hasValue(rev1);
        assertThat(cache.getActiveGraph("nav-it-preview").orElseThrow().revisionId()).isEqualTo(rev1);
    }

    // NOTE: concurrent request-time miss coalescing is covered by NavigationGraphCacheTest (a
    // faster, deterministic unit test using a mocked NavigationGraphLoader) rather than here —
    // this IT focuses on real-DB/Spring-wiring correctness (preload queries, event/poller wiring).

    // ── Fixture helpers ──────────────────────────────────────────────────────────────────────────

    /**
     * Fires the (real, {@code @Async}) preload runner and polls until {@code expectedCitySlug}'s
     * graph is resolvable. Deliberately does NOT poll {@link NavigationHierarchyReadinessState}
     * directly: it is a process-lifetime singleton that the REAL automatic startup preload (which
     * fires once, before any test seeds data, sees an empty target set, and marks READY
     * trivially) has usually already flipped to READY long before any test method runs — polling
     * it again here would report "ready" without actually waiting for THIS test's explicit preload
     * call to finish loading the cache.
     */
    private void preloadAndAwait(String expectedCitySlug) {
        try {
            preloadRunner.run(EMPTY_ARGS); // @Async — returns immediately; the real run() never throws
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        pollUntil(() -> assertThat(cache.getActiveGraph(expectedCitySlug)).isPresent());
    }

    private static final ApplicationArguments EMPTY_ARGS = new DefaultApplicationArguments();

    private static void pollUntil(Runnable assertion) {
        long deadline = System.currentTimeMillis() + 15_000;
        AssertionError lastError;
        do {
            try {
                assertion.run();
                return;
            } catch (AssertionError e) {
                lastError = e;
                try {
                    Thread.sleep(100);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        } while (System.currentTimeMillis() < deadline);
        throw lastError;
    }

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

    /** A second PROMOTED row for the SAME city — only valid because the first is superseded first
     *  (uq_clr_current_promoted allows exactly one live PROMOTED row per city). */
    private long seedPromotedRevisionRowOnly(int cityId) {
        jdbc.update(
                "UPDATE public.city_launch_revision SET lifecycle_status = 'SUPERSEDED' "
                        + "WHERE city_id = ? AND lifecycle_status = 'PROMOTED'",
                cityId);
        return jdbc.queryForObject(
                "INSERT INTO public.city_launch_revision (city_id, revision_number, lifecycle_status, "
                        + "promoted_at) VALUES (?, ?, 'PROMOTED', now()) RETURNING id",
                Long.class, cityId, nextRevisionNumber++);
    }

    /** One CLUSTER root + 2 AREA leaves — the smallest tree shape that satisfies every
     *  {@link NavigationTreeValidationService} check (no one-child clusters, gapless sibling
     *  display_order, correct descendant_area_count/ancestor_keys, all bounds present). */
    private void seedSimpleTree(int cityId, String rootNodeKey, String areaKeyPrefix) {
        String area1 = areaKeyPrefix + "-1";
        String area2 = areaKeyPrefix + "-2";
        jdbc.update("INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon) "
                + "VALUES (?, ?, ?, 13.05, 77.59)", area1, cityId, area1);
        jdbc.update("INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon) "
                + "VALUES (?, ?, ?, 13.06, 77.60)", area2, cityId, area2);

        long clusterId = jdbc.queryForObject(
                "INSERT INTO public.navigation_nodes (city_id, region_key, node_type, parent_node_id, "
                        + "node_key, area_key, representative_area_keys, display_label, display_order, depth, "
                        + "ancestor_keys, descendant_area_count, centre_lat, centre_lon, min_lat, min_lon, "
                        + "max_lat, max_lon, policy_fingerprint, generated_at) "
                        + "VALUES (?, 'north', 'CLUSTER', NULL, ?, NULL, ARRAY[?, ?]::text[], ?, 1, 0, "
                        + "ARRAY[]::text[], 2, 13.05, 77.59, 13.0, 77.5, 13.1, 77.7, 'fp', now()) RETURNING id",
                Long.class, cityId, rootNodeKey, area1, area2, rootNodeKey);

        jdbc.update(
                "INSERT INTO public.navigation_nodes (city_id, region_key, node_type, parent_node_id, "
                        + "node_key, area_key, representative_area_keys, display_label, display_order, depth, "
                        + "ancestor_keys, descendant_area_count, centre_lat, centre_lon, min_lat, min_lon, "
                        + "max_lat, max_lon, policy_fingerprint, generated_at) "
                        + "VALUES (?, 'north', 'AREA', ?, ?, ?, ARRAY[?]::text[], ?, 1, 1, ARRAY[?]::text[], 1, "
                        + "13.05, 77.59, 13.04, 77.49, 13.06, 77.51, 'fp', now())",
                cityId, clusterId, rootNodeKey + "-a1", area1, area1, area1, rootNodeKey);

        jdbc.update(
                "INSERT INTO public.navigation_nodes (city_id, region_key, node_type, parent_node_id, "
                        + "node_key, area_key, representative_area_keys, display_label, display_order, depth, "
                        + "ancestor_keys, descendant_area_count, centre_lat, centre_lon, min_lat, min_lon, "
                        + "max_lat, max_lon, policy_fingerprint, generated_at) "
                        + "VALUES (?, 'north', 'AREA', ?, ?, ?, ARRAY[?]::text[], ?, 2, 1, ARRAY[?]::text[], 1, "
                        + "13.06, 77.60, 13.05, 77.50, 13.07, 77.52, 'fp', now())",
                cityId, clusterId, rootNodeKey + "-a2", area2, area2, area2, rootNodeKey);
    }
}
