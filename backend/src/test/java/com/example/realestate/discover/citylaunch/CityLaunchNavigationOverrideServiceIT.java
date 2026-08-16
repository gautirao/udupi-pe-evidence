package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.navigation.NavigationTreeValidationException;
import com.example.realestate.discover.navigation.SandboxNavigationNode;
import com.example.realestate.discover.navigation.SandboxNavigationNodeRepository;
import com.example.realestate.discover.navigation.SandboxNavigationOverrideRepository;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Testcontainers integration test (real Postgres) for #1955 Areas PR A, SLICE 2f+2g: the V122
 * {@code sandbox_navigation_override} table, its DB constraints, and {@link
 * CityLaunchNavigationOverrideService}'s endpoint-backing methods (regenerate + re-stamp in one
 * transaction, lifecycle guard, duplicate detection, blocking-validation rollback, MOVE_AREA
 * invariant interactions, determinism).
 *
 * <p>Mirrors {@link CityLaunchPrepareNavigationWiringIT}'s harness.
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
        "AI_API_KEY=test-dummy-not-used-in-city-launch-it",
        "spring.task.scheduling.enabled=false"
})
class CityLaunchNavigationOverrideServiceIT {

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

    @Autowired private CityLaunchPreparationService preparationService;
    @Autowired private CityLaunchRevisionRepository revisionRepository;
    @Autowired private CityLaunchNavigationOverrideService overrideService;
    @Autowired private SandboxNavigationNodeRepository sandboxNavigationNodeRepository;
    @Autowired private SandboxNavigationOverrideRepository sandboxNavigationOverrideRepository;
    @Autowired private JdbcTemplate jdbc;

    /**
     * #2157 AC4: spy on the REAL {@link CanonicalGeographyReader} bean — every call still delegates
     * to the real DB, but interactions are recorded for verification. Used to prove override
     * regeneration ({@link CityLaunchNavigationOverrideService#regenerateAndRestamp}) never calls
     * {@link CanonicalGeographyReader#loadGeography(int)} (a re-read of LIVE production geography);
     * {@link CanonicalGeographyReader#findCity(int)} (slug-only lookup) IS expected and allowed.
     */
    @MockitoSpyBean
    private CanonicalGeographyReader geographyReader;

    private static final UUID ADMIN_ID = UUID.randomUUID();
    private final List<String> testCitySlugs = new ArrayList<>();

    @BeforeEach
    void setUp() {
        testCitySlugs.clear();
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
            jdbc.update("DELETE FROM public.city_region_policy WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_regions WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.regional_area_classifications WHERE city_key = ?", slug);
            jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.cities WHERE id = ?", cityId);
        }
    }

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

    /** 4 areas at increasing latitude, 1 region, max_direct_children=2 -> bisects into TWO
     *  2-area CLUSTER siblings — the shape MOVE_AREA / one-child / representative-membership
     *  scenarios need. min_areas_per_cluster=1 so a post-move 1-area cluster is legal at the DB/
     *  generator layer and only NavigationTreeValidationService's ONE_CHILD_CLUSTER check (#4)
     *  blocks it. */
    private int seedCityWithTwoClusters(String slug) {
        testCitySlugs.add(slug);
        int cityId = jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, false) RETURNING id",
                Integer.class, slug, slug + "-test-city");

        jdbc.update("INSERT INTO public.city_region_policy "
                        + "(city_id, region_model, central_radius_km, max_direct_children, min_areas_per_cluster, "
                        + " max_safety_depth, one_child_prevention, compactness_threshold, separation_threshold, "
                        + " partition_method, representative_selection, outlier_rule, centre_treatment) "
                        + "VALUES (?, 'CENTRAL_CARDINAL_8', 3.0, 2, 1, 6, false, 0.35, 0.5, "
                        + " 'GEOMETRIC_BISECTION', 'CENTROID_NEAREST', 'ATTACH_NEAREST_CLUSTER', 'AREA_CENTROID_MEAN')",
                cityId);
        seedDecoyClassifiedArea(cityId, slug);

        for (int i = 1; i <= 4; i++) {
            double lat = 13.0 + i * 0.1;
            double lon = 74.7;
            jdbc.update(
                    "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                            + " min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    slug + "|d|g|area-" + i, cityId, "Area " + i, slug + "-district", lat, lon,
                    lat - 0.001, lon - 0.001, lat + 0.001, lon + 0.001);
        }

        jdbc.update("INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                + "VALUES (?, ?, ?, 1)", cityId, slug + "-north", slug + "-north");
        for (int i = 1; i <= 4; i++) {
            // #2163: 'OVERRIDE' (not 'AUTO') is load-bearing — CityRegionOnboardingService.apply(),
            // now invoked by every prepare() call, deletes stale 'AUTO' memberships for any
            // area_key outside its own computed effective set; these fixture areas are deliberately
            // NOT real-classified (see seedDecoyClassifiedArea), so an 'AUTO' row here would be
            // wiped out by that exact cleanup on the very same prepare() call that seeded it.
            jdbc.update("INSERT INTO public.city_region_memberships "
                            + "(city_id, area_key, region_key, assignment_source) VALUES (?, ?, ?, 'OVERRIDE')",
                    cityId, slug + "|d|g|area-" + i, slug + "-north");
        }

        return cityId;
    }

    /** 6 areas, 1 region, max_direct_children=3 -> bisects into TWO 3-area CLUSTER siblings — used
     *  by tests that EXCLUDE_AREA a single member and must NOT trip ONE_CHILD_CLUSTER (#4) as an
     *  unrelated side effect (3 areas minus 1 excluded = 2 remaining, still a valid cluster). */
    private int seedCityWithThreeAreaClusters(String slug) {
        testCitySlugs.add(slug);
        int cityId = jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, false) RETURNING id",
                Integer.class, slug, slug + "-test-city");

        jdbc.update("INSERT INTO public.city_region_policy "
                        + "(city_id, region_model, central_radius_km, max_direct_children, min_areas_per_cluster, "
                        + " max_safety_depth, one_child_prevention, compactness_threshold, separation_threshold, "
                        + " partition_method, representative_selection, outlier_rule, centre_treatment) "
                        + "VALUES (?, 'CENTRAL_CARDINAL_8', 3.0, 3, 1, 6, false, 0.35, 0.5, "
                        + " 'GEOMETRIC_BISECTION', 'CENTROID_NEAREST', 'ATTACH_NEAREST_CLUSTER', 'AREA_CENTROID_MEAN')",
                cityId);
        seedDecoyClassifiedArea(cityId, slug);

        for (int i = 1; i <= 6; i++) {
            double lat = 13.0 + i * 0.1;
            double lon = 74.7;
            jdbc.update(
                    "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                            + " min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    slug + "|d|g|area-" + i, cityId, "Area " + i, slug + "-district", lat, lon,
                    lat - 0.001, lon - 0.001, lat + 0.001, lon + 0.001);
        }

        jdbc.update("INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                + "VALUES (?, ?, ?, 1)", cityId, slug + "-north", slug + "-north");
        for (int i = 1; i <= 6; i++) {
            // #2163: 'OVERRIDE' (not 'AUTO') is load-bearing — CityRegionOnboardingService.apply(),
            // now invoked by every prepare() call, deletes stale 'AUTO' memberships for any
            // area_key outside its own computed effective set; these fixture areas are deliberately
            // NOT real-classified (see seedDecoyClassifiedArea), so an 'AUTO' row here would be
            // wiped out by that exact cleanup on the very same prepare() call that seeded it.
            jdbc.update("INSERT INTO public.city_region_memberships "
                            + "(city_id, area_key, region_key, assignment_source) VALUES (?, ?, ?, 'OVERRIDE')",
                    cityId, slug + "|d|g|area-" + i, slug + "-north");
        }

        return cityId;
    }

    /**
     * #2163: {@code prepare()} now self-materializes canonical geography prerequisites via {@code
     * CityRegionOnboardingService.apply()}, which requires >=1 real {@code
     * regional_area_classifications} row (else {@code MISSING_CLASSIFICATIONS}) — this file's
     * fixtures hand-seed {@code city_regions}/{@code city_region_memberships} directly with a
     * SPECIFIC region_key covering ALL of a fixture's areas (required for the clustering tests
     * below to bisect a single region's member set), so rather than reclassify the real fixture
     * areas (which would scatter them across apply()'s own canonical CENTRAL_CARDINAL_8 regions
     * instead), seed one separate INACTIVE "decoy" area purely to satisfy {@code
     * classificationsPresent()}. Being INACTIVE, it is excluded from navigation-tree generation's
     * area capture, so it never appears in any cluster/tree assertion in this file.
     */
    private void seedDecoyClassifiedArea(int cityId, String citySlug) {
        String decoyAreaKey = citySlug + "|d|g|decoy-2163";
        jdbc.update(
                "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                        + "lifecycle_status) VALUES (?, ?, ?, ?, ?, ?, 'INACTIVE')",
                decoyAreaKey, cityId, decoyAreaKey, citySlug + "-district", 13.0, 74.7);
        jdbc.update(
                "INSERT INTO public.regional_area_classifications "
                        + "(city_key, area_key, direction_key, distance_band_key, bearing_deg, distance_km, computed_at) "
                        + "VALUES (?, ?, 'N', '0_10', 0.0, 5.0, now())",
                citySlug, decoyAreaKey);
    }

    private long prepareAndAwaitPrepared(int cityId) {
        PrepareResponse prep = preparationService.prepare(cityId, ADMIN_ID);
        pollUntil(() -> assertThat(revisionRepository.findById(prep.revisionId()).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.PREPARED));
        return prep.revisionId();
    }

    private List<SandboxNavigationNode> clusters(long revisionId) {
        return sandboxNavigationNodeRepository.findByRevisionId(revisionId).stream()
                .filter(n -> "CLUSTER".equals(n.getNodeType()))
                .toList();
    }

    // ── V122 migration + entity round-trip + DB constraints ───────────────────────────────────

    @Test
    @DisplayName("V122: subject-XOR CHECK rejects a row with both subject_area_key and subject_node_key set")
    void subjectXorCheckFires() {
        int cityId = seedCityWithTwoClusters("ovxor1");
        long revisionId = prepareAndAwaitPrepared(cityId);

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO public.sandbox_navigation_override "
                        + "(revision_id, override_kind, subject_area_key, subject_node_key, apply_order, created_by) "
                        + "VALUES (?, 'EXCLUDE_AREA', 'a', 'b', 1, ?)",
                revisionId, ADMIN_ID))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("V122: kind-shape CHECK rejects EXCLUDE_AREA with a target_region_key set")
    void kindShapeCheckFires() {
        int cityId = seedCityWithTwoClusters("ovshape1");
        long revisionId = prepareAndAwaitPrepared(cityId);

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO public.sandbox_navigation_override "
                        + "(revision_id, override_kind, subject_area_key, target_region_key, apply_order, created_by) "
                        + "VALUES (?, 'EXCLUDE_AREA', 'a', 'south', 1, ?)",
                revisionId, ADMIN_ID))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("V122: UNIQUE(revision_id, subject_area_key, override_kind) rejects a duplicate")
    void areaKindUniqueFires() {
        int cityId = seedCityWithTwoClusters("ovdup1");
        long revisionId = prepareAndAwaitPrepared(cityId);

        jdbc.update("INSERT INTO public.sandbox_navigation_override "
                + "(revision_id, override_kind, subject_area_key, apply_order, created_by) "
                + "VALUES (?, 'EXCLUDE_AREA', 'ovdup1|d|g|area-1', 1, ?)", revisionId, ADMIN_ID);

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO public.sandbox_navigation_override "
                        + "(revision_id, override_kind, subject_area_key, apply_order, created_by) "
                        + "VALUES (?, 'EXCLUDE_AREA', 'ovdup1|d|g|area-1', 2, ?)", revisionId, ADMIN_ID))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("entity round-trip: repository save/find via SandboxNavigationOverrideRepository")
    void entityRoundTrip() {
        int cityId = seedCityWithThreeAreaClusters("ovrt1");
        long revisionId = prepareAndAwaitPrepared(cityId);

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "EXCLUDE_AREA", "ovrt1|d|g|area-1", null, null, null, null, null, "test reason");
        overrideService.createOverride(cityId, revisionId, req, ADMIN_ID);

        List<AdminNavigationOverrideResponse> overrides = overrideService.listOverrides(cityId, revisionId);
        assertThat(overrides).hasSize(1);
        assertThat(overrides.get(0).kind()).isEqualTo("EXCLUDE_AREA");
        assertThat(overrides.get(0).subjectAreaKey()).isEqualTo("ovrt1|d|g|area-1");
        assertThat(overrides.get(0).reason()).isEqualTo("test reason");
    }

    // ── Endpoint-level: create/delete, regenerate+re-stamp, lifecycle guard, duplicate ─────────

    @Test
    @DisplayName("POST override regenerates the tree and re-stamps persisted_revision_checksum, one transaction")
    void createOverrideRegeneratesAndRestamps() {
        int cityId = seedCityWithThreeAreaClusters("ovregen1");
        long revisionId = prepareAndAwaitPrepared(cityId);
        String checksumBefore = revisionRepository.findById(revisionId).orElseThrow().getPersistedRevisionChecksum();

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "EXCLUDE_AREA", "ovregen1|d|g|area-1", null, null, null, null, null, null);
        NavigationTreeDiffResponse diff = overrideService.createOverride(cityId, revisionId, req, ADMIN_ID);

        String checksumAfter = revisionRepository.findById(revisionId).orElseThrow().getPersistedRevisionChecksum();
        assertThat(checksumAfter).isNotEqualTo(checksumBefore);
        assertThat(diff.overridesFingerprint()).isNotNull();

        // The excluded area no longer has an AREA leaf in the regenerated tree.
        boolean stillPresent = sandboxNavigationNodeRepository.findByRevisionId(revisionId).stream()
                .anyMatch(n -> "ovregen1|d|g|area-1".equals(n.getAreaKey()));
        assertThat(stillPresent).isFalse();
    }

    @Test
    @DisplayName("override mutation on a non-PREPARED revision is 409 (ResponseStatusException CONFLICT)")
    void mutationOnNonPreparedRevisionIsConflict() {
        int cityId = seedCityWithTwoClusters("ovlifecycle1");
        long revisionId = prepareAndAwaitPrepared(cityId);
        jdbc.update("UPDATE public.city_launch_revision SET lifecycle_status = 'VALIDATED' WHERE id = ?", revisionId);

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "EXCLUDE_AREA", "ovlifecycle1|d|g|area-1", null, null, null, null, null, null);

        assertThatThrownBy(() -> overrideService.createOverride(cityId, revisionId, req, ADMIN_ID))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    @DisplayName("a duplicate (area, kind) override POST is 409 CONFLICT")
    void duplicateOverrideIsConflict() {
        int cityId = seedCityWithThreeAreaClusters("ovdupsvc1");
        long revisionId = prepareAndAwaitPrepared(cityId);

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "EXCLUDE_AREA", "ovdupsvc1|d|g|area-1", null, null, null, null, null, null);
        overrideService.createOverride(cityId, revisionId, req, ADMIN_ID);

        assertThatThrownBy(() -> overrideService.createOverride(cityId, revisionId, req, ADMIN_ID))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    @DisplayName("DELETE override regenerates back toward the un-overridden tree")
    void deleteOverrideRegenerates() {
        int cityId = seedCityWithThreeAreaClusters("ovdel1");
        long revisionId = prepareAndAwaitPrepared(cityId);

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "EXCLUDE_AREA", "ovdel1|d|g|area-1", null, null, null, null, null, null);
        overrideService.createOverride(cityId, revisionId, req, ADMIN_ID);
        long overrideId = overrideService.listOverrides(cityId, revisionId).get(0).id();

        overrideService.deleteOverride(cityId, revisionId, overrideId);

        assertThat(overrideService.listOverrides(cityId, revisionId)).isEmpty();
        boolean present = sandboxNavigationNodeRepository.findByRevisionId(revisionId).stream()
                .anyMatch(n -> "ovdel1|d|g|area-1".equals(n.getAreaKey()));
        assertThat(present).isTrue();
    }

    // ── MOVE_AREA invariant interactions ────────────────────────────────────────────────────────

    @Test
    @DisplayName("MOVE_AREA that leaves the source cluster with exactly one child is BLOCKING (invariant #4)")
    void moveAreaCausingOneChildClusterIsBlocked() {
        int cityId = seedCityWithTwoClusters("ovmove1");
        long revisionId = prepareAndAwaitPrepared(cityId);

        List<SandboxNavigationNode> clusterNodes = clusters(revisionId);
        assertThat(clusterNodes).hasSize(2);
        String sourceCluster = clusterNodes.get(0).getNodeKey();
        String targetCluster = clusterNodes.get(1).getNodeKey();
        String areaInSource = sandboxNavigationNodeRepository.findByRevisionId(revisionId).stream()
                .filter(n -> "AREA".equals(n.getNodeType()) && sourceCluster.equals(nodeKeyOfParent(revisionId, n)))
                .findFirst().orElseThrow().getAreaKey();

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "MOVE_AREA", areaInSource, null, null, targetCluster, null, null, null);

        assertThatThrownBy(() -> overrideService.createOverride(cityId, revisionId, req, ADMIN_ID))
                .isInstanceOf(NavigationTreeValidationException.class)
                .satisfies(ex -> assertThat(((NavigationTreeValidationException) ex).report().errors())
                        .extracting(e -> e.code())
                        .contains("ONE_CHILD_CLUSTER"));

        // Zero writes: the override row itself must not have been persisted (whole-transaction rollback).
        assertThat(sandboxNavigationOverrideRepository.findByRevisionIdOrderByApplyOrderAsc(revisionId)).isEmpty();
    }

    @Test
    @DisplayName("MOVE_AREA of a cluster's own representative area breaks membership -> BLOCKING (invariant #7)")
    void moveAreaOfRepresentativeIsBlocked() {
        int cityId = seedCityWithTwoClusters("ovmoverep1");
        long revisionId = prepareAndAwaitPrepared(cityId);

        List<SandboxNavigationNode> clusterNodes = clusters(revisionId);
        SandboxNavigationNode sourceCluster = clusterNodes.get(0);
        String targetCluster = clusterNodes.get(1).getNodeKey();
        String repAreaKey = sourceCluster.getRepresentativeAreaKeys().get(0);

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "MOVE_AREA", repAreaKey, null, null, targetCluster, null, null, null);

        assertThatThrownBy(() -> overrideService.createOverride(cityId, revisionId, req, ADMIN_ID))
                .isInstanceOf(NavigationTreeValidationException.class)
                .satisfies(ex -> assertThat(((NavigationTreeValidationException) ex).report().errors())
                        .extracting(e -> e.code())
                        .contains("REPRESENTATIVE_NOT_MEMBER"));
    }

    @Test
    @DisplayName("two MOVE_AREA overrides draining a 2-leaf CLUSTER to zero leaves is BLOCKING (422), not a 500 (B1)")
    void moveAreaDrainingClusterToZeroLeavesIsBlockingNotServerError() {
        int cityId = seedCityWithTwoClusters("ovdrain1");
        long revisionId = prepareAndAwaitPrepared(cityId);

        List<SandboxNavigationNode> clusterNodes = clusters(revisionId);
        assertThat(clusterNodes).hasSize(2);
        String sourceCluster = clusterNodes.get(0).getNodeKey();
        String targetCluster = clusterNodes.get(1).getNodeKey();
        List<String> areasInSource = sandboxNavigationNodeRepository.findByRevisionId(revisionId).stream()
                .filter(n -> "AREA".equals(n.getNodeType()) && sourceCluster.equals(nodeKeyOfParent(revisionId, n)))
                .map(SandboxNavigationNode::getAreaKey)
                .toList();
        assertThat(areasInSource).hasSize(2);

        // A single override POST that would leave sourceCluster with exactly ONE remaining child is
        // itself rejected by ONE_CHILD_CLUSTER (see moveAreaCausingOneChildClusterIsBlocked above),
        // so the only way to reach a fully-DRAINED (zero-child) cluster is for the SECOND MOVE_AREA
        // to be applied together with an already-persisted first one in the same regeneration pass.
        // Insert the first MOVE_AREA directly (bypassing the service's own single-override
        // transaction/validation, mirroring this file's other raw sandbox_navigation_override
        // INSERTs) so the second override's POST is the one that actually drains the cluster to zero.
        jdbc.update("INSERT INTO public.sandbox_navigation_override "
                        + "(revision_id, override_kind, subject_area_key, target_node_key, apply_order, created_by) "
                        + "VALUES (?, 'MOVE_AREA', ?, ?, 1, ?)",
                revisionId, areasInSource.get(0), targetCluster, ADMIN_ID);

        AdminNavigationOverrideRequest secondMove = new AdminNavigationOverrideRequest(
                "MOVE_AREA", areasInSource.get(1), null, null, targetCluster, null, null, null);

        // Must fail with the DESIGNED 422 validation path (a BLOCKING ValidationReport), never an
        // unguarded ArithmeticException (division by zero on the emptied cluster's centroid).
        assertThatThrownBy(() -> overrideService.createOverride(cityId, revisionId, secondMove, ADMIN_ID))
                .isInstanceOf(NavigationTreeValidationException.class)
                .isNotInstanceOf(ArithmeticException.class)
                .satisfies(ex -> assertThat(((NavigationTreeValidationException) ex).report().errors())
                        .as("an emptied cluster must produce at least one BLOCKING finding")
                        .isNotEmpty());

        // Whole-transaction rollback: the second override row must not have been persisted.
        assertThat(sandboxNavigationOverrideRepository.findByRevisionIdOrderByApplyOrderAsc(revisionId))
                .hasSize(1);
    }

    private String nodeKeyOfParent(long revisionId, SandboxNavigationNode node) {
        if (node.getParentNodeId() == null) {
            return null;
        }
        return sandboxNavigationNodeRepository.findByRevisionId(revisionId).stream()
                .filter(n -> n.getId().equals(node.getParentNodeId()))
                .findFirst().map(SandboxNavigationNode::getNodeKey).orElse(null);
    }

    // ── Determinism ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("determinism: identical geography + policy + overrides -> identical tree/checksum across two regenerations")
    void regenerationIsDeterministic() {
        int cityId = seedCityWithTwoClusters("ovdet1");
        long revisionId = prepareAndAwaitPrepared(cityId);

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "RELABEL", null, clusters(revisionId).get(0).getNodeKey(), null, null, "Custom Label", null, null);
        overrideService.createOverride(cityId, revisionId, req, ADMIN_ID);

        String checksumFirst = revisionRepository.findById(revisionId).orElseThrow().getPersistedRevisionChecksum();
        Map<String, String> labelsFirst = sandboxNavigationNodeRepository.findByRevisionId(revisionId).stream()
                .collect(java.util.stream.Collectors.toMap(SandboxNavigationNode::getNodeKey, SandboxNavigationNode::getDisplayLabel));

        // Regenerate a SECOND time with the SAME (already-persisted) override set — e.g. by deleting
        // and re-creating an unrelated no-op-equivalent override is not needed; re-invoking
        // generateAndStoreForRevision directly (via a second no-op override cycle) proves determinism.
        overrideService.deleteOverride(cityId, revisionId,
                overrideService.listOverrides(cityId, revisionId).get(0).id());
        overrideService.createOverride(cityId, revisionId, req, ADMIN_ID);

        String checksumSecond = revisionRepository.findById(revisionId).orElseThrow().getPersistedRevisionChecksum();
        Map<String, String> labelsSecond = sandboxNavigationNodeRepository.findByRevisionId(revisionId).stream()
                .collect(java.util.stream.Collectors.toMap(SandboxNavigationNode::getNodeKey, SandboxNavigationNode::getDisplayLabel));

        assertThat(checksumSecond).isEqualTo(checksumFirst);
        assertThat(labelsSecond).isEqualTo(labelsFirst);
    }

    // ── #2157 AC4: override regeneration never re-reads canonical (production) geography ───────

    @Test
    @DisplayName("[#2157 AC4] createOverride's regenerate+re-stamp never calls "
            + "CanonicalGeographyReader.loadGeography — it reads this revision's OWN sandbox_areas/"
            + "sandbox_city_regions/sandbox_city_region_memberships instead. findCity (slug-only) IS "
            + "still called and is NOT the risk this AC guards against.")
    void createOverride_neverReadsCanonicalGeography() {
        int cityId = seedCityWithThreeAreaClusters("ovac4a");
        long revisionId = prepareAndAwaitPrepared(cityId);

        // prepare() itself legitimately reads canonical geography (#2163's ensureCanonicalGeography +
        // validateCanonicalGeographyReady, both pre-existing and out of #2157's scope) — clear that
        // history so the verification below is scoped exactly to createOverride's own regeneration.
        Mockito.clearInvocations(geographyReader);

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "EXCLUDE_AREA", "ovac4a|d|g|area-1", null, null, null, null, null, null);
        overrideService.createOverride(cityId, revisionId, req, ADMIN_ID);

        Mockito.verify(geographyReader, Mockito.never()).loadGeography(Mockito.anyInt());
        Mockito.verify(geographyReader, Mockito.atLeastOnce()).findCity(cityId);
    }

    @Test
    @DisplayName("[#2157 AC4] deleteOverride's regenerate+re-stamp ALSO never calls "
            + "CanonicalGeographyReader.loadGeography")
    void deleteOverride_neverReadsCanonicalGeography() {
        int cityId = seedCityWithThreeAreaClusters("ovac4b");
        long revisionId = prepareAndAwaitPrepared(cityId);

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "EXCLUDE_AREA", "ovac4b|d|g|area-1", null, null, null, null, null, null);
        overrideService.createOverride(cityId, revisionId, req, ADMIN_ID);
        long overrideId = overrideService.listOverrides(cityId, revisionId).get(0).id();

        Mockito.clearInvocations(geographyReader);

        overrideService.deleteOverride(cityId, revisionId, overrideId);

        Mockito.verify(geographyReader, Mockito.never()).loadGeography(Mockito.anyInt());
        Mockito.verify(geographyReader, Mockito.atLeastOnce()).findCity(cityId);
    }

    // ── #2157 AC5 (centrepiece): concurrent production geography mutation cannot contaminate an
    //    already-captured revision ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("[#2157 AC5, CENTREPIECE] a concurrent production geography mutation (a new area + "
            + "region membership inserted directly into public.areas/city_region_memberships AFTER "
            + "this revision's sandbox geography was captured) does NOT contaminate override "
            + "regeneration: the regenerated tree still corresponds EXACTLY to this revision's OWN "
            + "captured sandbox_areas — the injected production area never appears, and no originally-"
            + "captured area vanishes. Additionally, regenerating with the SAME override state as "
            + "before the mutation reproduces the IDENTICAL pre-mutation checksum, proving the "
            + "mutation left zero trace in this revision's own persisted state.")
    void overrideRegeneration_isImmuneToConcurrentProductionGeographyMutation() {
        int cityId = seedCityWithThreeAreaClusters("ovac5");
        long revisionId = prepareAndAwaitPrepared(cityId);

        // ── Establish an apples-to-apples BASELINE checksum via the SAME code path (regenerateAndRestamp,
        //    RevisionChecksum's 8-arg overload) the post-mutation checksum below will also go through —
        //    NOT the freshly-prepared persisted_revision_checksum (that one is stamped by
        //    CityLaunchGraphWriter via a DIFFERENT 9-arg overload that also folds in agri-destination
        //    rows, so it is never checksum-comparable to a regenerateAndRestamp output even with zero
        //    contamination). A harmless RELABEL-then-delete round trip returns the tree to its
        //    un-overridden shape while forcing exactly one 8-arg checksum stamp to compare against.
        String clusterNodeKeyForBaseline = clusters(revisionId).get(0).getNodeKey();
        AdminNavigationOverrideRequest primingRelabel = new AdminNavigationOverrideRequest(
                "RELABEL", null, clusterNodeKeyForBaseline, null, null, "Baseline-Priming Label", null, null);
        overrideService.createOverride(cityId, revisionId, primingRelabel, ADMIN_ID);
        overrideService.deleteOverride(cityId, revisionId,
                overrideService.listOverrides(cityId, revisionId).get(0).id());

        String checksumBeforeAnyOverride =
                revisionRepository.findById(revisionId).orElseThrow().getPersistedRevisionChecksum();
        Set<String> areaKeysBeforeMutation = sandboxNavigationNodeRepository.findByRevisionId(revisionId).stream()
                .filter(n -> "AREA".equals(n.getNodeType()))
                .map(SandboxNavigationNode::getAreaKey)
                .collect(java.util.stream.Collectors.toSet());
        assertThat(areaKeysBeforeMutation).hasSize(6); // seedCityWithThreeAreaClusters seeds 6 areas

        // ── Simulate a CONCURRENT writer: insert a brand-new ACTIVE area into PRODUCTION public.areas
        //    plus a city_region_memberships row assigning it to the SAME region this revision already
        //    captured — mirroring a second admin onboarding a new area for this city while THIS
        //    revision is being reviewed/overridden. This happens entirely OUTSIDE this revision's own
        //    sandbox_* tables.
        String injectedAreaKey = "ovac5|d|g|injected-concurrent";
        jdbc.update(
                "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                        + " min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                injectedAreaKey, cityId, "Injected Concurrent Area", "ovac5-district", 13.35, 74.7,
                13.349, 74.699, 13.351, 74.701);
        jdbc.update("INSERT INTO public.city_region_memberships "
                        + "(city_id, area_key, region_key, assignment_source) VALUES (?, ?, ?, 'OVERRIDE')",
                cityId, injectedAreaKey, "ovac5-north");

        // ── Trigger regeneration via a RELABEL override (harmless — changes only a display_label,
        //    never area membership), then IMMEDIATELY delete it — round-tripping the tree back to its
        //    original (pre-override) shape. If regeneration read LIVE production geography (the
        //    pre-#2157 defect), the injected area would enter this revision's sandbox_navigation_nodes
        //    on the FIRST regeneration below and never leave.
        String clusterNodeKey = clusters(revisionId).get(0).getNodeKey();
        AdminNavigationOverrideRequest relabel = new AdminNavigationOverrideRequest(
                "RELABEL", null, clusterNodeKey, null, null, "Concurrent-Mutation-Probe Label", null, null);
        overrideService.createOverride(cityId, revisionId, relabel, ADMIN_ID);

        Set<String> areaKeysAfterRelabel = sandboxNavigationNodeRepository.findByRevisionId(revisionId).stream()
                .filter(n -> "AREA".equals(n.getNodeType()))
                .map(SandboxNavigationNode::getAreaKey)
                .collect(java.util.stream.Collectors.toSet());
        assertThat(areaKeysAfterRelabel)
                .as("the injected production area must NOT appear in the regenerated tree, and every "
                        + "originally-captured area must still be present — RELABEL touches only a "
                        + "display_label, so membership must be byte-identical to before the mutation")
                .isEqualTo(areaKeysBeforeMutation)
                .doesNotContain(injectedAreaKey);

        // ── Delete the RELABEL override -> regenerates AGAIN, back toward the un-overridden tree.
        long overrideId = overrideService.listOverrides(cityId, revisionId).get(0).id();
        overrideService.deleteOverride(cityId, revisionId, overrideId);

        Set<String> areaKeysAfterDelete = sandboxNavigationNodeRepository.findByRevisionId(revisionId).stream()
                .filter(n -> "AREA".equals(n.getNodeType()))
                .map(SandboxNavigationNode::getAreaKey)
                .collect(java.util.stream.Collectors.toSet());
        assertThat(areaKeysAfterDelete)
                .as("still no contamination after a SECOND regeneration")
                .isEqualTo(areaKeysBeforeMutation)
                .doesNotContain(injectedAreaKey);

        String checksumAfterDelete =
                revisionRepository.findById(revisionId).orElseThrow().getPersistedRevisionChecksum();
        assertThat(checksumAfterDelete)
                .as("recomputed checksum after the RELABEL-then-delete round trip must EXACTLY match the "
                        + "pre-mutation checksum — despite the production geography mutation happening in "
                        + "between, this revision's own persisted state (and thus its checksum) reflects "
                        + "ONLY its own captured sandbox geography, never the concurrent production write")
                .isEqualTo(checksumBeforeAnyOverride);
    }
}
