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

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * #2086 S4 — Bangalore-shaped CANDIDATE-QUALITY proof, over a data cohort whose provenance is
 * documented HONESTLY below. This is NOT a production Bangalore export.
 *
 * <h2>Data provenance (read before trusting any assertion here)</h2>
 * This test does NOT have access to hosted/production Supabase and does not attempt to fabricate
 * one. It seeds a structural, mock-derived cohort of its own, per issue #2086's own sanctioned
 * fallback: "Include a mock-derived structural cohort containing recognisable north-Bangalore
 * Areas such as Hebbal, Nagawara, Jakkur and Yelahanka. Validate the hierarchy and membership, not
 * one blindly pinned display name."
 *
 * <p>Two first-level groups are seeded, both under a synthetic test city (never touching
 * production {@code cities}/{@code areas}/{@code navigation_nodes}):
 * <ul>
 *   <li>{@link #NORTH_REAL_AREAS} — 24 real, recognisable north-Bangalore locality names
 *       (Hebbal, Nagawara, Jakkur, Yelahanka, ...), each with a plausible real-world
 *       latitude/longitude pulled from public general knowledge of the area — NOT sourced from
 *       any {@code city_region_memberships}/{@code areas} export, hosted or otherwise.</li>
 *   <li>{@link #buildNorthPadAreas()} — 16 CLEARLY SYNTHETIC "North Growth Corridor Extension NN"
 *       padding areas, honestly labelled as invented, added only to push the north group's total
 *       past the 15-canonical-area Local Destination threshold with a clean, arithmetically exact
 *       proportional split (40 areas / bucket size 8 = 5 clusters of exactly 8).</li>
 *   <li>{@link #SOUTH_REAL_AREAS} — 7 real, recognisable south-Bangalore locality names
 *       (Jayanagar, Basavanagudi, JP Nagar, ...), kept at or under the seeded
 *       {@code max_direct_children} (8) so this group exercises the direct-to-AREA path (no
 *       Local Destination / CLUSTER level).</li>
 * </ul>
 *
 * <p>The {@code city_region_policy} row mirrors the REAL hosted seeded defaults used elsewhere in
 * this test suite (see {@code NavigationTreeRealScaleRegenerationIT}): {@code max_direct_children
 * = 8}, {@code min_areas_per_cluster = 3}, {@code max_safety_depth = 6},
 * {@code one_child_prevention = true} (V121's seed UPDATE) — the POLICY is real, the GEOGRAPHY is
 * a structural cohort.
 *
 * <p><b>What this proves:</b> the #2086 generator/validator pipeline produces a correct,
 * deterministic, breadth-capped, label-provenance-clean hierarchy over data SHAPED like
 * Bangalore's real defect (a region well past the 15-area Local-Destination threshold, seeded
 * under a policy whose {@code max_safety_depth} would previously have suppressed clustering
 * entirely), including the specific incident detail that a raw {@code city_regions.display_label}
 * of {@code "north"} must never leak through as a customer-facing DIRECTION label.
 *
 * <p><b>What this does NOT prove</b> — restated from the #2086 approved plan's honest limits:
 * that promotion into live {@code navigation_nodes} succeeds; that the city-wide
 * delete-and-reinsert is safe under concurrent reads; that the frontend renders end-to-end
 * against hosted; or that hosted {@code city_region_memberships} still match this fixture (or any
 * fixture) at promotion time. See {@code docs/audit/evidence/issue-2086/candidate-quality-report.md}
 * for the full report and the design.R9 branch determination (Q1).
 *
 * <p>Pattern deliberately mirrors {@link NavigationTreeRealScaleRegenerationIT} (READ-ONLY
 * reference — not modified by this file): Testcontainers real PostGIS, real Flyway (so V124's
 * {@code bearing_degrees} column is present), {@code @SpringBootTest(webEnvironment = NONE)},
 * driving {@link NavigationTreeGenerationService#generateAndStoreForRevision} directly, asserting
 * against persisted {@code sandbox_navigation_nodes} rows, and cleaning up its own fixtures. Never
 * touches production {@code navigation_nodes} and never calls any promotion path.
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
        "AI_API_KEY=test-dummy-not-used-in-nav-bangalore-candidate-it",
        "spring.task.scheduling.enabled=false"
})
class NavigationTreeBangaloreCandidateIT {

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
            jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_policy WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_regions WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.cities WHERE id = ?", cityId);
        }
        testCitySlugs.clear();
    }

    // ── Fixture geography — see class javadoc for full provenance statement ────────────────────

    private record AreaSpec(String name, double lat, double lon) {}

    /** 24 real, recognisable north-Bangalore locality names with plausible real-world
     *  coordinates (public general-knowledge approximations — NOT a production DB export). */
    private static final List<AreaSpec> NORTH_REAL_AREAS = List.of(
            new AreaSpec("Hebbal", 13.0358, 77.5970),
            new AreaSpec("Nagawara", 13.0356, 77.6206),
            new AreaSpec("Jakkur", 13.0730, 77.6110),
            new AreaSpec("Yelahanka", 13.1007, 77.5963),
            new AreaSpec("Yelahanka New Town", 13.1015, 77.5773),
            new AreaSpec("Thanisandra", 13.0491, 77.6304),
            new AreaSpec("Hennur", 13.0450, 77.6350),
            new AreaSpec("Kothanur", 13.0680, 77.6470),
            new AreaSpec("Vidyaranyapura", 13.0680, 77.5580),
            new AreaSpec("Sahakara Nagar", 13.0630, 77.5810),
            new AreaSpec("RT Nagar", 13.0230, 77.5940),
            new AreaSpec("Kalyan Nagar", 13.0180, 77.6390),
            new AreaSpec("HBR Layout", 13.0250, 77.6280),
            new AreaSpec("Banaswadi", 13.0140, 77.6510),
            new AreaSpec("Kammanahalli", 13.0180, 77.6360),
            new AreaSpec("Horamavu", 13.0270, 77.6580),
            new AreaSpec("Kodigehalli", 13.0620, 77.5860),
            new AreaSpec("Jalahalli", 13.0460, 77.5510),
            new AreaSpec("Jalahalli East", 13.0480, 77.5560),
            new AreaSpec("Peenya", 13.0290, 77.5200),
            new AreaSpec("Yeshwanthpur", 13.0280, 77.5540),
            new AreaSpec("Mathikere", 13.0330, 77.5680),
            new AreaSpec("Byatarayanapura", 13.0640, 77.5960),
            new AreaSpec("Amruthahalli", 13.0570, 77.5970));

    /** 7 real, recognisable south-Bangalore locality names — kept <= the seeded
     *  max_direct_children (8) so this group exercises the direct-to-AREA path (no CLUSTER). */
    private static final List<AreaSpec> SOUTH_REAL_AREAS = List.of(
            new AreaSpec("Jayanagar", 12.9250, 77.5938),
            new AreaSpec("Basavanagudi", 12.9422, 77.5760),
            new AreaSpec("JP Nagar", 12.9077, 77.5851),
            new AreaSpec("Banashankari", 12.9250, 77.5450),
            new AreaSpec("BTM Layout", 12.9166, 77.6101),
            new AreaSpec("Koramangala", 12.9352, 77.6146),
            new AreaSpec("HSR Layout", 12.9121, 77.6446));

    private static final int NORTH_PAD_COUNT = 16;

    /** CLEARLY SYNTHETIC padding — honestly named "North Growth Corridor Extension NN", never
     *  pretending to be a real locality — added only so the north group's total (40) comfortably
     *  exceeds the 15-canonical-area Local Destination threshold with an arithmetically exact
     *  40 / bucketSize(8) = 5-cluster-of-8 split. */
    private static List<AreaSpec> buildNorthPadAreas() {
        List<AreaSpec> pad = new ArrayList<>();
        for (int i = 1; i <= NORTH_PAD_COUNT; i++) {
            double lat = 13.11 + (i * 0.006);
            double lon = 77.60 + ((i % 2 == 0) ? (i * 0.002) : -(i * 0.0015));
            pad.add(new AreaSpec("North Growth Corridor Extension " + String.format("%02d", i), lat, lon));
        }
        return pad;
    }

    private record CityFixture(int cityId, String slug, String northRegionKey, String southRegionKey,
                                List<String> northAreaKeys, List<String> southAreaKeys,
                                Map<String, String> areaNameByKey) {}

    /**
     * Seeds ONE synthetic city with the north/south cohort above plus the real hosted-default
     * {@code city_region_policy} row (max_direct_children=8, min_areas_per_cluster=3,
     * max_safety_depth=6, one_child_prevention=true — matches V121's seed UPDATE, same values
     * {@link NavigationTreeRealScaleRegenerationIT} uses).
     *
     * @param shuffleSeed if non-null, areas within each region are inserted in a
     *     {@link Collections#shuffle(List, Random)}-permuted order using this fixed seed (AC9) —
     *     the generator's own {@code Comparator.comparing(GeneratorArea::areaKey)} sort must still
     *     produce an identical tree regardless of physical insertion order.
     */
    private CityFixture seedBangaloreCandidateCity(String slug, Long shuffleSeed) {
        testCitySlugs.add(slug);
        int cityId = jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 77.6, false) RETURNING id",
                Integer.class, slug, slug + "-synthetic-test-city");

        jdbc.update("INSERT INTO public.city_region_policy "
                        + "(city_id, region_model, central_radius_km, max_direct_children, min_areas_per_cluster, "
                        + " max_safety_depth, one_child_prevention, compactness_threshold, separation_threshold, "
                        + " partition_method, representative_selection, outlier_rule, centre_treatment) "
                        + "VALUES (?, 'CENTRAL_CARDINAL_8', 3.0, 8, 3, 6, true, 0.35, 0.5, "
                        + " 'GEOMETRIC_BISECTION', 'CENTROID_NEAREST', 'ATTACH_NEAREST_CLUSTER', 'AREA_CENTROID_MEAN')",
                cityId);

        String northRegionKey = slug + "-north";
        String southRegionKey = slug + "-south";

        // #2086 AC6/AC7 Bangalore-relevant case: the region's RAW display_label is the direction
        // word "north" — the persisted DIRECTION label must NOT surface it (deriveLabel ignores
        // city_regions.display_label entirely as of #2086 design.R1).
        jdbc.update("INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                        + "VALUES (?, ?, 'north', 1)", cityId, northRegionKey);
        jdbc.update("INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                        + "VALUES (?, ?, 'south-bangalore-cohort', 2)", cityId, southRegionKey);

        // #2086 AC9: area_key suffix is assigned from a CANONICAL (always-unshuffled) name->index
        // map, never from physical list position — otherwise "shuffled insertion order" would also
        // silently shuffle each area's IDENTITY (area_key), confounding the very thing AC9 tests.
        // Only the row-by-row INSERT statement order below varies with shuffleSeed.
        List<AreaSpec> canonicalNorth = new ArrayList<>(NORTH_REAL_AREAS);
        canonicalNorth.addAll(buildNorthPadAreas());
        Map<String, Integer> northIndexByName = canonicalIndexByName(canonicalNorth);
        Map<String, Integer> southIndexByName = canonicalIndexByName(SOUTH_REAL_AREAS);

        List<AreaSpec> northInsertOrder = new ArrayList<>(canonicalNorth);
        List<AreaSpec> southInsertOrder = new ArrayList<>(SOUTH_REAL_AREAS);
        if (shuffleSeed != null) {
            Collections.shuffle(northInsertOrder, new Random(shuffleSeed));
            Collections.shuffle(southInsertOrder, new Random(shuffleSeed + 1));
        }

        Map<String, String> areaNameByKey = new HashMap<>();
        List<String> northAreaKeys = insertAreas(
                cityId, slug, northRegionKey, "north", northInsertOrder, northIndexByName, areaNameByKey);
        List<String> southAreaKeys = insertAreas(
                cityId, slug, southRegionKey, "south", southInsertOrder, southIndexByName, areaNameByKey);

        return new CityFixture(cityId, slug, northRegionKey, southRegionKey, northAreaKeys, southAreaKeys,
                areaNameByKey);
    }

    /** Stable name -> 1-based index map built from the CANONICAL (documented, unshuffled) area
     *  list — an area's identity (area_key suffix) never depends on physical insertion order. */
    private static Map<String, Integer> canonicalIndexByName(List<AreaSpec> canonicalOrder) {
        Map<String, Integer> out = new HashMap<>();
        int i = 0;
        for (AreaSpec area : canonicalOrder) {
            i++;
            out.put(area.name(), i);
        }
        return out;
    }

    private List<String> insertAreas(int cityId, String slug, String regionKey, String regionTag,
                                      List<AreaSpec> insertOrder, Map<String, Integer> canonicalIndexByName,
                                      Map<String, String> areaNameByKey) {
        List<String> keys = new ArrayList<>();
        for (AreaSpec area : insertOrder) {
            int canonicalIndex = canonicalIndexByName.get(area.name());
            // 4-pipe-segment area_key convention (country|state|city|area), matching
            // PostgresAreaCountProvider's FOUR_SEGMENT_GUARD and EndToEndNavigationPipelineIT.
            String areaKey = "IN|KA|" + slug + "|" + regionTag + "-" + String.format("%03d", canonicalIndex);
            jdbc.update(
                    "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                            + " min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    areaKey, cityId, area.name(), "Bengaluru", area.lat(), area.lon(),
                    area.lat() - 0.003, area.lon() - 0.003, area.lat() + 0.003, area.lon() + 0.003);
            jdbc.update("INSERT INTO public.city_region_memberships "
                            + "(city_id, area_key, region_key, assignment_source) VALUES (?, ?, ?, 'AUTO')",
                    cityId, areaKey, regionKey);
            keys.add(areaKey);
            areaNameByKey.put(areaKey, area.name());
        }
        return keys;
    }

    // ── The main candidate-quality proof (AC1-AC7, AC11) ────────────────────────────────────────

    @Test
    @DisplayName("#2086 S4: Bangalore-shaped structural cohort (24 real + 16 clearly-synthetic "
            + "north-Bangalore areas exceeding the 15-area Local Destination threshold, 7 real "
            + "south-Bangalore areas staying under it) generates a correct, breadth-capped, "
            + "label-provenance-clean hierarchy through the real persisted path")
    void bangaloreCohort_generatesCorrectCandidateQualityHierarchy() {
        CityFixture fixture = seedBangaloreCandidateCity("bangalore-cohort", null);
        assertThat(fixture.northAreaKeys()).hasSize(24 + NORTH_PAD_COUNT); // 40, Q1 answer
        assertThat(fixture.southAreaKeys()).hasSize(7);

        CityLaunchRevision revision = revisionRepository.saveAndFlush(
                new CityLaunchRevision(fixture.cityId(), 1, ADMIN_ID));
        Long revisionId = revision.getId();

        assertThatCode(() ->
                generationService.generateAndStoreForRevision(revisionId, fixture.cityId(), Instant.now()))
                .as("Bangalore-shaped cohort generation must complete without "
                        + "NavigationTreeValidationException")
                .doesNotThrowAnyException();

        List<SandboxNavigationNode> nodes = sandboxNavigationNodeRepository.findByRevisionId(revisionId);
        assertThat(nodes).isNotEmpty();

        List<String> allSeededAreaKeys = new ArrayList<>(fixture.northAreaKeys());
        allSeededAreaKeys.addAll(fixture.southAreaKeys());

        // ── AC4: every canonical Area appears EXACTLY ONCE ──────────────────────────────────────
        assertAreaLeavesExactlyOncePerSeededArea(nodes, allSeededAreaKeys);

        // ── AC3: no node has more than 15 children ──────────────────────────────────────────────
        Map<Long, List<SandboxNavigationNode>> byParentId = groupByParentId(nodes);
        for (List<SandboxNavigationNode> children : byParentId.values()) {
            assertThat(children.size()).as("no node may have more than 15 children").isLessThanOrEqualTo(15);
        }

        SandboxNavigationNode northDirection = findDirection(nodes, fixture.northRegionKey());
        SandboxNavigationNode southDirection = findDirection(nodes, fixture.southRegionKey());

        // ── AC1/AC2: north (40 > 15) has an LD level; south (7 <= 15) goes direct ───────────────
        List<SandboxNavigationNode> northChildren = byParentId.getOrDefault(northDirection.getId(), List.of());
        List<SandboxNavigationNode> southChildren = byParentId.getOrDefault(southDirection.getId(), List.of());
        assertThat(northDirection.getDescendantAreaCount()).isEqualTo(40);
        assertThat(southDirection.getDescendantAreaCount()).isEqualTo(7);
        assertThat(northChildren).as("north group (40 areas) must expose a Local Destination level")
                .allMatch(n -> "CLUSTER".equals(n.getNodeType()));
        assertThat(southChildren).as("south group (7 areas) must go direct-to-AREA (no LD level)")
                .allMatch(n -> "AREA".equals(n.getNodeType()));

        // Exact, arithmetically-guaranteed shape for this fixture: 40 areas / bucketSize(8) =
        // k=5 buckets, 40 divisible evenly by 5 => exactly 5 clusters of exactly 8.
        assertThat(northChildren).hasSize(5);
        for (SandboxNavigationNode cluster : northChildren) {
            assertThat(cluster.getDescendantAreaCount()).as("cluster %s size", cluster.getNodeKey()).isEqualTo(8);
            List<SandboxNavigationNode> clusterAreas = byParentId.getOrDefault(cluster.getId(), List.of());
            assertThat(clusterAreas).hasSize(8);
            // ── AC5: no one-child LD ─────────────────────────────────────────────────────────────
            assertThat(clusterAreas.size()).isGreaterThan(1);
        }
        assertThat(southChildren).hasSize(7);

        // ── Candidate-quality report data: min/median/max group size across north's 5 clusters ──
        List<Integer> clusterSizes = northChildren.stream()
                .map(SandboxNavigationNode::getDescendantAreaCount).sorted().toList();
        assertThat(clusterSizes).containsExactly(8, 8, 8, 8, 8); // min=median=max=8 for this fixture

        // ── AC5 (max public depth 2) ─────────────────────────────────────────────────────────────
        int maxDepth = nodes.stream().mapToInt(SandboxNavigationNode::getDepth).max().orElseThrow();
        assertThat(maxDepth).isEqualTo(2);
        for (SandboxNavigationNode n : nodes) {
            if ("CLUSTER".equals(n.getNodeType())) {
                assertThat(n.getDepth()).isEqualTo(1);
            }
            if ("AREA".equals(n.getNodeType())) {
                assertThat(n.getDepth()).isIn(1, 2);
            }
        }

        // ── AC6/AC7: label provenance — every DIRECTION/CLUSTER label is derivable from its own
        // representative area names, never a direction word / region_key / node_key. The Bangalore-
        // relevant case: north's raw seeded display_label is "north" — must NOT surface. ─────────
        assertLabelDerivableAndNotLeakingInternalKeys(nodes, fixture.areaNameByKey());
        assertThat(northDirection.getDisplayLabel())
                .as("DIRECTION label must never pass through the raw city_regions.display_label "
                        + "direction word \"north\"")
                .isNotEqualTo("north");
        assertThat(northDirection.getDisplayLabel()).isNotEqualTo(fixture.northRegionKey());
        assertThat(southDirection.getDisplayLabel()).isNotEqualTo("south-bangalore-cohort");
        assertThat(southDirection.getDisplayLabel()).isNotEqualTo(fixture.southRegionKey());

        // ── AC11: bearing NULL at depth 0, non-null and in [0,360) below ────────────────────────
        for (SandboxNavigationNode n : nodes) {
            if (n.getDepth() == 0) {
                assertThat(n.getBearingDegrees()).as("DIRECTION node %s must have a NULL bearing",
                        n.getNodeKey()).isNull();
            } else {
                assertThat(n.getBearingDegrees()).as("node %s below depth 0 must have a non-null bearing",
                        n.getNodeKey()).isNotNull();
                assertThat(n.getBearingDegrees().compareTo(BigDecimal.ZERO))
                        .as("bearing for %s must be >= 0", n.getNodeKey()).isGreaterThanOrEqualTo(0);
                assertThat(n.getBearingDegrees().compareTo(BigDecimal.valueOf(360)))
                        .as("bearing for %s must be < 360", n.getNodeKey()).isLessThan(0);
            }
        }

        // ── No orphans / disconnected membership: every non-root node's parent resolves within
        // this same persisted set. ───────────────────────────────────────────────────────────────
        Set<Long> allIds = nodes.stream().map(SandboxNavigationNode::getId).collect(java.util.stream.Collectors.toSet());
        for (SandboxNavigationNode n : nodes) {
            if (n.getParentNodeId() != null) {
                assertThat(allIds).contains(n.getParentNodeId());
            }
        }
    }

    // ── AC8: two consecutive generations byte-identical, INCLUDING labels, membership,
    // display_order, centres, bounds AND bearings ────────────────────────────────────────────────

    @Test
    @DisplayName("#2086 S4 AC8: regenerating the same revision produces a byte-identical tree, "
            + "including node keys, labels, membership, display_order, centres, bounds and bearings")
    void regeneration_isByteIdenticalIncludingLabelsCentresBoundsAndBearings() {
        CityFixture fixture = seedBangaloreCandidateCity("bangalore-cohort-det", null);
        CityLaunchRevision revision = revisionRepository.saveAndFlush(
                new CityLaunchRevision(fixture.cityId(), 1, ADMIN_ID));
        Long revisionId = revision.getId();

        generationService.generateAndStoreForRevision(revisionId, fixture.cityId(), Instant.now());
        List<SandboxNavigationNode> firstRun = sandboxNavigationNodeRepository.findByRevisionId(revisionId);
        assertThat(firstRun).isNotEmpty();

        assertThatCode(() ->
                generationService.generateAndStoreForRevision(revisionId, fixture.cityId(), Instant.now()))
                .doesNotThrowAnyException();
        List<SandboxNavigationNode> secondRun = sandboxNavigationNodeRepository.findByRevisionId(revisionId);
        assertThat(secondRun).hasSameSizeAs(firstRun);

        Map<String, FullNodeShape> firstShapes = toFullShapeByNodeKey(firstRun);
        Map<String, FullNodeShape> secondShapes = toFullShapeByNodeKey(secondRun);
        assertThat(secondShapes.keySet()).containsExactlyInAnyOrderElementsOf(firstShapes.keySet());
        for (String nodeKey : firstShapes.keySet()) {
            assertThat(secondShapes.get(nodeKey))
                    .as("node_key %s must be byte-identical across regeneration (type/parent/area/"
                            + "reps/label/order/depth/centre/bounds/bearing)", nodeKey)
                    .isEqualTo(firstShapes.get(nodeKey));
        }
    }

    // ── AC9: shuffled input ordering (FIXED SEED) produces an identical tree ───────────────────

    @Test
    @DisplayName("#2086 S4 AC9: shuffling the fixture's physical insertion order (fixed seed) "
            + "produces a structurally identical tree to the unshuffled baseline")
    void shuffledInputOrder_producesIdenticalTree_toUnshuffledBaseline() {
        CityFixture baselineFixture = seedBangaloreCandidateCity("bangalore-cohort-base", null);
        CityLaunchRevision baselineRevision = revisionRepository.saveAndFlush(
                new CityLaunchRevision(baselineFixture.cityId(), 1, ADMIN_ID));
        generationService.generateAndStoreForRevision(baselineRevision.getId(), baselineFixture.cityId(), Instant.now());
        List<SandboxNavigationNode> baselineNodes =
                sandboxNavigationNodeRepository.findByRevisionId(baselineRevision.getId());

        // Prove the shuffle actually changed insertion order before trusting the "identical tree"
        // assertion below — qa-fast flagged this as a false-pass risk if the fixture is already sorted.
        List<AreaSpec> unshuffledNorth = new ArrayList<>(NORTH_REAL_AREAS);
        unshuffledNorth.addAll(buildNorthPadAreas());
        List<AreaSpec> shuffledNorth = new ArrayList<>(unshuffledNorth);
        Collections.shuffle(shuffledNorth, new Random(42L));
        assertThat(shuffledNorth.stream().map(AreaSpec::name).toList())
                .as("fixed-seed shuffle must actually reorder the input — otherwise AC9 false-passes")
                .isNotEqualTo(unshuffledNorth.stream().map(AreaSpec::name).toList());

        CityFixture shuffledFixture = seedBangaloreCandidateCity("bangalore-cohort-shuf", 42L);
        CityLaunchRevision shuffledRevision = revisionRepository.saveAndFlush(
                new CityLaunchRevision(shuffledFixture.cityId(), 1, ADMIN_ID));
        generationService.generateAndStoreForRevision(shuffledRevision.getId(), shuffledFixture.cityId(), Instant.now());
        List<SandboxNavigationNode> shuffledNodes =
                sandboxNavigationNodeRepository.findByRevisionId(shuffledRevision.getId());

        assertThat(shuffledNodes).hasSameSizeAs(baselineNodes);

        // Compare by REGION-RELATIVE structural shape (node_key embeds the synthetic city slug,
        // which differs between the two fixtures) — depth/parent-chain-of-node_types/display_label/
        // display_order/representative NAMES (not area_keys, which also embed the slug)/area name/
        // centre/bounds/bearing must match exactly, area-key-order-independent within each level.
        assertThat(regionRelativeShapes(baselineNodes, baselineFixture.areaNameByKey()))
                .as("shuffled-input-order tree must be structurally identical to the unshuffled baseline")
                .isEqualTo(regionRelativeShapes(shuffledNodes, shuffledFixture.areaNameByKey()));
    }

    // ── Assertion / shape helpers ────────────────────────────────────────────────────────────────

    private static void assertAreaLeavesExactlyOncePerSeededArea(
            List<SandboxNavigationNode> nodes, List<String> seededAreaKeys) {
        List<SandboxNavigationNode> areaLeaves = nodes.stream()
                .filter(n -> "AREA".equals(n.getNodeType())).toList();
        Set<String> seenAreaKeys = new HashSet<>();
        for (SandboxNavigationNode leaf : areaLeaves) {
            assertThat(leaf.getAreaKey()).isNotNull();
            assertThat(seenAreaKeys.add(leaf.getAreaKey()))
                    .as("area_key %s must appear as no more than one AREA leaf", leaf.getAreaKey()).isTrue();
        }
        assertThat(seenAreaKeys).containsExactlyInAnyOrderElementsOf(seededAreaKeys);
    }

    private static Map<Long, List<SandboxNavigationNode>> groupByParentId(List<SandboxNavigationNode> nodes) {
        Map<Long, List<SandboxNavigationNode>> byParentId = new HashMap<>();
        for (SandboxNavigationNode n : nodes) {
            if (n.getParentNodeId() != null) {
                byParentId.computeIfAbsent(n.getParentNodeId(), k -> new ArrayList<>()).add(n);
            }
        }
        return byParentId;
    }

    private static SandboxNavigationNode findDirection(List<SandboxNavigationNode> nodes, String regionKey) {
        return nodes.stream()
                .filter(n -> "DIRECTION".equals(n.getNodeType()) && regionKey.equals(n.getRegionKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no DIRECTION node found for region_key=" + regionKey));
    }

    private static void assertLabelDerivableAndNotLeakingInternalKeys(
            List<SandboxNavigationNode> nodes, Map<String, String> areaNameByKey) {
        for (SandboxNavigationNode n : nodes) {
            if (!"DIRECTION".equals(n.getNodeType()) && !"CLUSTER".equals(n.getNodeType())) {
                continue;
            }
            String label = n.getDisplayLabel();
            assertThat(label).as("node %s label must not equal its own node_key", n.getNodeKey())
                    .isNotEqualTo(n.getNodeKey());
            assertThat(label).as("node %s label must not equal its own region_key", n.getNodeKey())
                    .isNotEqualTo(n.getRegionKey());

            List<String> reps = n.getRepresentativeAreaKeys();
            assertThat(reps).as("node %s must carry representative area keys", n.getNodeKey()).isNotEmpty();

            Set<String> candidates = new LinkedHashSet<>();
            String rep0Name = areaNameByKey.get(reps.get(0));
            if (rep0Name != null) {
                candidates.add(rep0Name);
            }
            if (reps.size() >= 2) {
                String rep1Name = areaNameByKey.get(reps.get(1));
                if (rep0Name != null && rep1Name != null) {
                    candidates.add(rep0Name + " & " + rep1Name);
                }
            }
            assertThat(candidates).as("must be able to resolve representative names for %s", n.getNodeKey())
                    .isNotEmpty();
            assertThat(candidates).as("node %s label \"%s\" must be derivable from its own "
                            + "representative_area_keys names %s", n.getNodeKey(), label, candidates)
                    .contains(label);
        }
    }

    /** Full-fidelity shape for AC8's byte-identical regeneration proof — same-fixture (same
     *  node_key namespace) comparison only. */
    private record FullNodeShape(
            String nodeType, String areaKey, Integer depth, Integer displayOrder, String parentNodeKey,
            String displayLabel, List<String> representativeAreaKeys,
            BigDecimal centreLat, BigDecimal centreLon,
            BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon,
            BigDecimal bearingDegrees) {}

    private static Map<String, FullNodeShape> toFullShapeByNodeKey(List<SandboxNavigationNode> nodes) {
        Map<Long, String> idToKey = new HashMap<>();
        for (SandboxNavigationNode n : nodes) {
            idToKey.put(n.getId(), n.getNodeKey());
        }
        Map<String, FullNodeShape> out = new HashMap<>();
        for (SandboxNavigationNode n : nodes) {
            String parentKey = n.getParentNodeId() == null ? null : idToKey.get(n.getParentNodeId());
            out.put(n.getNodeKey(), new FullNodeShape(
                    n.getNodeType(), n.getAreaKey(), n.getDepth(), n.getDisplayOrder(), parentKey,
                    n.getDisplayLabel(), n.getRepresentativeAreaKeys(),
                    n.getCentreLat(), n.getCentreLon(), n.getMinLat(), n.getMinLon(), n.getMaxLat(), n.getMaxLon(),
                    n.getBearingDegrees()));
        }
        return out;
    }

    /** Cross-fixture (different city slug, hence different node_key/area_key namespaces)
     *  structural shape for AC9 — keyed by a namespace-independent path built from node TYPE +
     *  depth + display_order at each level, comparing display_label, representative NAMES
     *  (resolved via the fixture's own areaNameByKey — never raw area_key, which embeds the
     *  slug), area NAME (for AREA leaves), centre/bounds/bearing. */
    private record RelativeNodeShape(
            String path, String nodeType, String displayLabel, List<String> representativeNames,
            String areaName, Integer depth, Integer displayOrder,
            BigDecimal centreLat, BigDecimal centreLon,
            BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon,
            BigDecimal bearingDegrees) {}

    private static Set<RelativeNodeShape> regionRelativeShapes(
            List<SandboxNavigationNode> nodes, Map<String, String> areaNameByKey) {
        Map<Long, SandboxNavigationNode> byId = new HashMap<>();
        for (SandboxNavigationNode n : nodes) {
            byId.put(n.getId(), n);
        }
        Set<RelativeNodeShape> out = new LinkedHashSet<>();
        for (SandboxNavigationNode n : nodes) {
            StringBuilder path = new StringBuilder();
            SandboxNavigationNode cur = n;
            List<String> segments = new ArrayList<>();
            while (cur != null) {
                segments.add(0, cur.getNodeType() + ":" + cur.getDisplayOrder());
                cur = cur.getParentNodeId() == null ? null : byId.get(cur.getParentNodeId());
            }
            path.append(String.join("/", segments));

            List<String> repNames = n.getRepresentativeAreaKeys() == null ? List.of()
                    : n.getRepresentativeAreaKeys().stream().map(areaNameByKey::get).toList();
            String areaName = n.getAreaKey() == null ? null : areaNameByKey.get(n.getAreaKey());

            out.add(new RelativeNodeShape(
                    path.toString(), n.getNodeType(), n.getDisplayLabel(), repNames, areaName,
                    n.getDepth(), n.getDisplayOrder(),
                    n.getCentreLat(), n.getCentreLon(), n.getMinLat(), n.getMinLon(), n.getMaxLat(), n.getMaxLon(),
                    n.getBearingDegrees()));
        }
        return out;
    }
}
