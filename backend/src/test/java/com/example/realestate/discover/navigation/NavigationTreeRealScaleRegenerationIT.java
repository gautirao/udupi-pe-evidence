package com.example.realestate.discover.navigation;

import com.example.realestate.discover.citylaunch.CityLaunchRevision;
import com.example.realestate.discover.citylaunch.CityLaunchRevisionRepository;
import org.junit.jupiter.api.AfterEach;
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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * P4 (#2033) — ISOLATED-DB REGENERATION PROOF. Testcontainers integration test (real PostGIS)
 * driving {@link NavigationTreeGenerationService#generateAndStoreForRevision} directly — the exact
 * service the admin "prepare" endpoint calls and the exact throw site of the reported
 * {@link NavigationTreeValidationException} failure — over a realistic new-city-launch geography:
 * ONE city, &gt;= 300 canonical areas spread across 9 unevenly-sized regions (including a
 * single-area region), a real {@code city_region_policy} row with the real seeded defaults
 * (max_direct_children=8, min_areas_per_cluster=3, max_safety_depth=6, one_child_prevention=true —
 * see V121's seed UPDATE), and real per-area centroid+bounds geometry.
 *
 * <p>Deliberately placed in the {@code navigation} package (not {@code citylaunch}, where the
 * "new-city launch" language would naturally suggest) — see the #2033 P4 handoff: driving {@link
 * NavigationTreeGenerationService} directly proves the identical persisted-path property (the
 * service the admin prepare flow calls; the throw site of the original defect) without touching
 * {@code NavigationTreeValidationService} (zero-line-diff acceptance criterion AC8) or any file
 * outside the approved {@code discover/navigation} test-package glob.
 *
 * <p>Not {@code @DataJpaTest}: {@link NavigationTreeGenerationService#generateAndStoreForRevision}
 * is itself {@code @Transactional}, and this test additionally needs to run it TWICE against the
 * same already-committed fixture rows (P4.5's determinism re-run) — a full {@code @SpringBootTest}
 * with real commits (mirroring {@code CityLaunchPreparationServiceIT} / {@code
 * EndToEndNavigationPipelineIT}) is the natural fit; each test method cleans up its own fixtures in
 * {@link #cleanup()}.
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
        "AI_API_KEY=test-dummy-not-used-in-nav-real-scale-it",
        "spring.task.scheduling.enabled=false"
})
class NavigationTreeRealScaleRegenerationIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine").asCompatibleSubstituteFor("postgres"));

    // JwtConfig's securityFilterChain bean requires a JwtDecoder even under webEnvironment=NONE —
    // mirrors CityLaunchPreparationServiceIT's no-op decoder (no test here issues HTTP).
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

    @Autowired private NavigationTreeGenerationService generationService;
    @Autowired private SandboxNavigationNodeRepository sandboxNavigationNodeRepository;
    @Autowired private CityLaunchRevisionRepository revisionRepository;
    @Autowired private JdbcTemplate jdbc;

    private static final UUID ADMIN_ID = UUID.randomUUID();
    private final List<String> testCitySlugs = new ArrayList<>();

    @AfterEach
    void cleanup() {
        for (String slug : testCitySlugs) {
            Integer cityId = jdbc.queryForObject("SELECT id FROM public.cities WHERE slug = ?", Integer.class, slug);
            if (cityId == null) {
                continue;
            }
            // city_launch_revision -> sandbox_navigation_nodes cascades ON DELETE CASCADE (V121).
            jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_policy WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_regions WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.cities WHERE id = ?", cityId);
        }
        testCitySlugs.clear();
    }

    // ── Fixture: 9 unevenly-sized regions, >= 300 areas, one single-area region ─────────────────

    private record RegionSpec(String key, int count, double baseLatOffset, double baseLonOffset) {}

    private static final List<RegionSpec> REGION_SPECS = List.of(
            new RegionSpec("central", 1, 0.000, 0.000),
            new RegionSpec("north", 15, 0.10, 0.00),
            new RegionSpec("south", 20, -0.10, 0.00),
            new RegionSpec("east", 25, 0.00, 0.10),
            new RegionSpec("west", 30, 0.00, -0.10),
            new RegionSpec("northeast", 40, 0.08, 0.08),
            new RegionSpec("northwest", 50, 0.08, -0.08),
            new RegionSpec("southeast", 60, -0.08, 0.08),
            new RegionSpec("southwest", 65, -0.08, -0.08));

    private record CityFixture(int cityId, String slug, List<String> areaKeys, int totalAreas) {}

    /** Seeds ONE city with realistic canonical geography: {@link #REGION_SPECS}' 9 unevenly-sized
     *  regions (306 areas total, one region with exactly 1 area), each area with a real, distinct
     *  synthetic centroid + bounds, plus the real seeded-default {@code city_region_policy} row
     *  (V121: max_direct_children=8, min_areas_per_cluster=3, max_safety_depth=6,
     *  one_child_prevention=true). Deterministic synthetic keys/coordinates only — no real-city
     *  data. */
    private CityFixture seedRealScaleCity(String slug) {
        testCitySlugs.add(slug);
        int cityId = jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, false) RETURNING id",
                Integer.class, slug, slug + "-synthetic-test-city");

        jdbc.update("INSERT INTO public.city_region_policy "
                        + "(city_id, region_model, central_radius_km, max_direct_children, min_areas_per_cluster, "
                        + " max_safety_depth, one_child_prevention, compactness_threshold, separation_threshold, "
                        + " partition_method, representative_selection, outlier_rule, centre_treatment) "
                        + "VALUES (?, 'CENTRAL_CARDINAL_8', 3.0, 8, 3, 6, true, 0.35, 0.5, "
                        + " 'GEOMETRIC_BISECTION', 'CENTROID_NEAREST', 'ATTACH_NEAREST_CLUSTER', 'AREA_CENTROID_MEAN')",
                cityId);

        List<String> allAreaKeys = new ArrayList<>();
        int regionDisplayOrder = 1;
        for (RegionSpec region : REGION_SPECS) {
            String regionKey = slug + "-" + region.key();
            jdbc.update("INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                            + "VALUES (?, ?, ?, ?)",
                    cityId, regionKey, region.key(), regionDisplayOrder++);

            int cols = (int) Math.ceil(Math.sqrt(region.count()));
            double spacing = 0.002;
            for (int i = 0; i < region.count(); i++) {
                int row = i / cols;
                int col = i % cols;
                // 4-pipe-segment area_key convention (country|state|city|area) — matches
                // PostgresAreaCountProvider's FOUR_SEGMENT_GUARD and EndToEndNavigationPipelineIT.
                String areaKey = "IN|KA|" + slug + "|" + region.key() + "-" + String.format("%03d", i);
                double lat = 13.0 + region.baseLatOffset() + row * spacing;
                double lon = 74.7 + region.baseLonOffset() + col * spacing;
                jdbc.update(
                        "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                                + " min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        areaKey, cityId, "Area " + region.key() + " " + i, slug + "-" + region.key(), lat, lon,
                        lat - 0.0005, lon - 0.0005, lat + 0.0005, lon + 0.0005);
                jdbc.update("INSERT INTO public.city_region_memberships "
                                + "(city_id, area_key, region_key, assignment_source) VALUES (?, ?, ?, 'AUTO')",
                        cityId, areaKey, regionKey);
                allAreaKeys.add(areaKey);
            }
        }

        return new CityFixture(cityId, slug, allAreaKeys, allAreaKeys.size());
    }

    // ── The proof ────────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("P4: real-scale (>=300 areas / 9 uneven regions incl. one 1-area region) generation "
            + "through the real persisted path completes without INVALID_HIERARCHY_SHAPE, persists "
            + "every seeded area exactly once as an AREA leaf with max depth 2 (CLUSTER only at depth "
            + "1), and reproduces an IDENTICAL persisted tree on regeneration")
    void realScale_generateAndStoreForRevision_completesAndPersistsSoundTree_andIsDeterministic() {
        CityFixture fixture = seedRealScaleCity("p4-scale");
        assertThat(fixture.totalAreas()).isGreaterThanOrEqualTo(300);
        assertThat(REGION_SPECS).hasSize(9);
        assertThat(REGION_SPECS.stream().anyMatch(r -> r.count() == 1)).isTrue();

        CityLaunchRevision revision = revisionRepository.saveAndFlush(
                new CityLaunchRevision(fixture.cityId(), 1, ADMIN_ID));
        Long revisionId = revision.getId();

        // ── P4.2: the original failing scenario, re-driven — must NOT throw ─────────────────────
        assertThatCode(() ->
                generationService.generateAndStoreForRevision(revisionId, fixture.cityId(), Instant.now()))
                .as("real-scale regeneration must complete without NavigationTreeValidationException "
                        + "(pre-fix: hundreds of INVALID_HIERARCHY_SHAPE errors)")
                .doesNotThrowAnyException();

        // ── P4.3 + P4.4: assert against the PERSISTED rows, not the in-memory list ──────────────
        List<SandboxNavigationNode> firstRun = sandboxNavigationNodeRepository.findByRevisionId(revisionId);
        assertThat(firstRun).isNotEmpty();

        assertAreaLeavesExactlyOncePerSeededArea(firstRun, fixture.areaKeys());
        assertMaxDepth2AndClustersAtDepth1(firstRun);

        int directionCount = countByType(firstRun, "DIRECTION");
        int clusterCount = countByType(firstRun, "CLUSTER");
        int areaCount = countByType(firstRun, "AREA");
        assertThat(directionCount).isEqualTo(REGION_SPECS.size());
        assertThat(areaCount).isEqualTo(fixture.totalAreas());
        // Every region beyond the 1-area "central" region has > max_direct_children(8) members, so
        // every one of the other 8 regions must have split into at least one CLUSTER; the 1-area
        // region must NOT (single AREA leaf directly beneath its DIRECTION, no CLUSTER).
        assertThat(clusterCount).isGreaterThanOrEqualTo(8);

        // ── P4.5: re-run the SAME revision — persisted result must be IDENTICAL ─────────────────
        assertThatCode(() ->
                generationService.generateAndStoreForRevision(revisionId, fixture.cityId(), Instant.now()))
                .as("re-regeneration of the same revision must also complete without throwing")
                .doesNotThrowAnyException();

        List<SandboxNavigationNode> secondRun = sandboxNavigationNodeRepository.findByRevisionId(revisionId);
        assertThat(secondRun).hasSameSizeAs(firstRun);

        Map<String, NodeShape> firstShapes = toShapeByNodeKey(firstRun);
        Map<String, NodeShape> secondShapes = toShapeByNodeKey(secondRun);
        assertThat(secondShapes.keySet()).containsExactlyInAnyOrderElementsOf(firstShapes.keySet());
        for (String nodeKey : firstShapes.keySet()) {
            assertThat(secondShapes.get(nodeKey))
                    .as("node_key %s must have an identical shape (depth/parent/display_order/type/area) "
                            + "after regeneration", nodeKey)
                    .isEqualTo(firstShapes.get(nodeKey));
        }
    }

    // ── Assertion helpers ────────────────────────────────────────────────────────────────────

    private static void assertAreaLeavesExactlyOncePerSeededArea(
            List<SandboxNavigationNode> nodes, List<String> seededAreaKeys) {
        List<SandboxNavigationNode> areaLeaves = nodes.stream()
                .filter(n -> "AREA".equals(n.getNodeType()))
                .toList();

        Set<String> seenAreaKeys = new HashSet<>();
        for (SandboxNavigationNode leaf : areaLeaves) {
            assertThat(leaf.getAreaKey()).isNotNull();
            assertThat(seenAreaKeys.add(leaf.getAreaKey()))
                    .as("area_key %s must appear as no more than one AREA leaf", leaf.getAreaKey())
                    .isTrue();
        }
        assertThat(seenAreaKeys).containsExactlyInAnyOrderElementsOf(seededAreaKeys);

        // No contradictory ancestry: every AREA leaf's parent_node_id must resolve to a node within
        // this same persisted set (no dangling/foreign parent).
        Set<Long> allIds = nodes.stream().map(SandboxNavigationNode::getId).collect(java.util.stream.Collectors.toSet());
        for (SandboxNavigationNode leaf : areaLeaves) {
            assertThat(leaf.getParentNodeId()).isNotNull();
            assertThat(allIds).contains(leaf.getParentNodeId());
        }
    }

    private static void assertMaxDepth2AndClustersAtDepth1(List<SandboxNavigationNode> nodes) {
        int maxDepth = nodes.stream().mapToInt(SandboxNavigationNode::getDepth).max().orElseThrow();
        assertThat(maxDepth).isEqualTo(2);

        for (SandboxNavigationNode n : nodes) {
            assertThat(n.getDepth()).isBetween(0, 2);
            if ("CLUSTER".equals(n.getNodeType())) {
                assertThat(n.getDepth()).as("CLUSTER node %s must be at depth exactly 1", n.getNodeKey())
                        .isEqualTo(1);
            }
            if ("DIRECTION".equals(n.getNodeType())) {
                assertThat(n.getDepth()).isEqualTo(0);
            }
        }
        int maxClusterDepth = nodes.stream()
                .filter(n -> "CLUSTER".equals(n.getNodeType()))
                .mapToInt(SandboxNavigationNode::getDepth)
                .max().orElse(1);
        assertThat(maxClusterDepth).isEqualTo(1);
    }

    private static int countByType(List<SandboxNavigationNode> nodes, String type) {
        return (int) nodes.stream().filter(n -> type.equals(n.getNodeType())).count();
    }

    /** Structural shape of one node, resolved against its OWN run's id->nodeKey map so two
     *  independently-generated runs (whose surrogate ids necessarily differ) can be compared by
     *  node_key/depth/parent-node_key/display_order/type/area_key alone. */
    private record NodeShape(String nodeType, String areaKey, Integer depth, Integer displayOrder, String parentNodeKey) {}

    private static Map<String, NodeShape> toShapeByNodeKey(List<SandboxNavigationNode> nodes) {
        Map<Long, String> idToKey = new HashMap<>();
        for (SandboxNavigationNode n : nodes) {
            idToKey.put(n.getId(), n.getNodeKey());
        }
        Map<String, NodeShape> out = new HashMap<>();
        for (SandboxNavigationNode n : nodes) {
            String parentKey = n.getParentNodeId() == null ? null : idToKey.get(n.getParentNodeId());
            out.put(n.getNodeKey(), new NodeShape(
                    n.getNodeType(), n.getAreaKey(), n.getDepth(), n.getDisplayOrder(), parentKey));
        }
        return out;
    }
}
