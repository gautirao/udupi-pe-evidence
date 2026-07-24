package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.navigation.NavigationTreeValidationException;
import com.example.realestate.discover.navigation.SandboxNavigationNode;
import com.example.realestate.discover.navigation.SandboxNavigationNodeRepository;
import com.example.realestate.discover.navigation.SandboxNavigationOverrideRepository;

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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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

        for (int i = 1; i <= 4; i++) {
            double lat = 13.0 + i * 0.1;
            double lon = 74.7;
            jdbc.update(
                    "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                            + " min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    slug + "|area-" + i, cityId, "Area " + i, slug + "-district", lat, lon,
                    lat - 0.001, lon - 0.001, lat + 0.001, lon + 0.001);
        }

        jdbc.update("INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                + "VALUES (?, ?, ?, 1)", cityId, slug + "-north", slug + "-north");
        for (int i = 1; i <= 4; i++) {
            jdbc.update("INSERT INTO public.city_region_memberships "
                            + "(city_id, area_key, region_key, assignment_source) VALUES (?, ?, ?, 'AUTO')",
                    cityId, slug + "|area-" + i, slug + "-north");
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

        for (int i = 1; i <= 6; i++) {
            double lat = 13.0 + i * 0.1;
            double lon = 74.7;
            jdbc.update(
                    "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                            + " min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    slug + "|area-" + i, cityId, "Area " + i, slug + "-district", lat, lon,
                    lat - 0.001, lon - 0.001, lat + 0.001, lon + 0.001);
        }

        jdbc.update("INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                + "VALUES (?, ?, ?, 1)", cityId, slug + "-north", slug + "-north");
        for (int i = 1; i <= 6; i++) {
            jdbc.update("INSERT INTO public.city_region_memberships "
                            + "(city_id, area_key, region_key, assignment_source) VALUES (?, ?, ?, 'AUTO')",
                    cityId, slug + "|area-" + i, slug + "-north");
        }

        return cityId;
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
                + "VALUES (?, 'EXCLUDE_AREA', 'ovdup1|area-1', 1, ?)", revisionId, ADMIN_ID);

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO public.sandbox_navigation_override "
                        + "(revision_id, override_kind, subject_area_key, apply_order, created_by) "
                        + "VALUES (?, 'EXCLUDE_AREA', 'ovdup1|area-1', 2, ?)", revisionId, ADMIN_ID))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("entity round-trip: repository save/find via SandboxNavigationOverrideRepository")
    void entityRoundTrip() {
        int cityId = seedCityWithThreeAreaClusters("ovrt1");
        long revisionId = prepareAndAwaitPrepared(cityId);

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "EXCLUDE_AREA", "ovrt1|area-1", null, null, null, null, null, "test reason");
        overrideService.createOverride(cityId, revisionId, req, ADMIN_ID);

        List<AdminNavigationOverrideResponse> overrides = overrideService.listOverrides(cityId, revisionId);
        assertThat(overrides).hasSize(1);
        assertThat(overrides.get(0).kind()).isEqualTo("EXCLUDE_AREA");
        assertThat(overrides.get(0).subjectAreaKey()).isEqualTo("ovrt1|area-1");
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
                "EXCLUDE_AREA", "ovregen1|area-1", null, null, null, null, null, null);
        NavigationTreeDiffResponse diff = overrideService.createOverride(cityId, revisionId, req, ADMIN_ID);

        String checksumAfter = revisionRepository.findById(revisionId).orElseThrow().getPersistedRevisionChecksum();
        assertThat(checksumAfter).isNotEqualTo(checksumBefore);
        assertThat(diff.overridesFingerprint()).isNotNull();

        // The excluded area no longer has an AREA leaf in the regenerated tree.
        boolean stillPresent = sandboxNavigationNodeRepository.findByRevisionId(revisionId).stream()
                .anyMatch(n -> "ovregen1|area-1".equals(n.getAreaKey()));
        assertThat(stillPresent).isFalse();
    }

    @Test
    @DisplayName("override mutation on a non-PREPARED revision is 409 (ResponseStatusException CONFLICT)")
    void mutationOnNonPreparedRevisionIsConflict() {
        int cityId = seedCityWithTwoClusters("ovlifecycle1");
        long revisionId = prepareAndAwaitPrepared(cityId);
        jdbc.update("UPDATE public.city_launch_revision SET lifecycle_status = 'VALIDATED' WHERE id = ?", revisionId);

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "EXCLUDE_AREA", "ovlifecycle1|area-1", null, null, null, null, null, null);

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
                "EXCLUDE_AREA", "ovdupsvc1|area-1", null, null, null, null, null, null);
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
                "EXCLUDE_AREA", "ovdel1|area-1", null, null, null, null, null, null);
        overrideService.createOverride(cityId, revisionId, req, ADMIN_ID);
        long overrideId = overrideService.listOverrides(cityId, revisionId).get(0).id();

        overrideService.deleteOverride(cityId, revisionId, overrideId);

        assertThat(overrideService.listOverrides(cityId, revisionId)).isEmpty();
        boolean present = sandboxNavigationNodeRepository.findByRevisionId(revisionId).stream()
                .anyMatch(n -> "ovdel1|area-1".equals(n.getAreaKey()));
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
}
