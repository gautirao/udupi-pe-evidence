package com.example.realestate.discover.navigation;

import com.example.realestate.discover.citylaunch.CityLaunchPreparationService;
import com.example.realestate.discover.citylaunch.CityLaunchPromotionService;
import com.example.realestate.discover.citylaunch.CityLaunchRevision;
import com.example.realestate.discover.citylaunch.CityLaunchRevisionRepository;
import com.example.realestate.discover.citylaunch.CityLaunchValidationService;
import com.example.realestate.discover.citylaunch.LifecycleStatus;
import com.example.realestate.discover.citylaunch.PrepareResponse;
import com.example.realestate.discover.citylaunch.PromotionReport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Testcontainers integration test (real Postgres) — #1955 Areas PR A gap-filling QA suite. Drives
 * the REAL prepare -&gt; generate -&gt; validate -&gt; approve/promote pipeline (via {@link
 * CityLaunchPreparationService}, {@link CityLaunchValidationService}, {@link
 * CityLaunchPromotionService}), waits for the async {@link NavigationGraphRefreshListener} to swap
 * {@link NavigationGraphCache}'s active pointer, and exercises the PUBLIC {@link
 * NavigationController} endpoints over the same cached graph a real client would hit.
 *
 * <p>Not a re-authoring of the per-slice tests already shipped (2a schema, 2b generator/validation
 * units, 2c promotion six-table, 2d cache lifecycle, 2e counts/endpoints/prepare-wiring) — this
 * class proves the SEAM those slices individually characterized: does the whole thing actually work
 * end to end, and are the cross-cutting invariants (listing independence, ancestry equivalence, no
 * surrogate-id leakage) true when driven through the real stack rather than a single unit's mocks.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword=",
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://test.example.com/auth/v1",
        "AI_API_KEY=test-dummy-not-used-in-e2e-navigation-it",
        "spring.task.scheduling.enabled=false",
        "discover.navigation.counts.cache.ttl-seconds=0"
})
class EndToEndNavigationPipelineIT {

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

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private CityLaunchPreparationService preparationService;
    @Autowired private CityLaunchValidationService validationService;
    @Autowired private CityLaunchPromotionService promotionService;
    @Autowired private CityLaunchRevisionRepository revisionRepository;
    @Autowired private NavigationGraphCache graphCache;
    @Autowired private SandboxNavigationNodeRepository sandboxNavigationNodeRepository;
    @Autowired private NavigationNodeRepository navigationNodeRepository;

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
            jdbc.update("DELETE FROM public.property_listings WHERE area_key LIKE ?", "IN|KA|" + slug + "|%");
            jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.navigation_nodes WHERE city_id = ?", cityId);
            // #2151 PR A: agri_destination_classification.area_key FKs public.areas -- this
            // fixture's real prepare->promote pipeline now also generates/promotes Agri rows
            // unconditionally, so they must be cleared before the areas DELETE below (mirrors
            // CityLaunchPromotionServiceIT's cleanup precedent).
            jdbc.update("DELETE FROM public.agri_destination_classification WHERE city_id = ?", cityId);
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

    // ── Fixtures ─────────────────────────────────────────────────────────────────────────────

    /** Seeds a city with ONE region of {@code areaCount} areas spread across latitude, plus a
     *  permissive {@code city_region_policy} row — mirrors {@code NavigationTreeGeneratorTest}'s
     *  in-memory fixture recipe so the SAME area count produces the same generator shape end to
     *  end through the real DB-backed pipeline. Returns (cityId, sorted areaKeys). */
    private CityFixture seedMultiLevelCity(
            String slug, int areaCount, int maxDirectChildren, int minAreasPerCluster, int maxSafetyDepth) {
        testCitySlugs.add(slug);
        int cityId = jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, false) RETURNING id",
                Integer.class, slug, slug + "-test-city");

        jdbc.update("INSERT INTO public.city_region_policy "
                        + "(city_id, region_model, central_radius_km, max_direct_children, min_areas_per_cluster, "
                        + " max_safety_depth, one_child_prevention, compactness_threshold, separation_threshold, "
                        + " partition_method, representative_selection, outlier_rule, centre_treatment) "
                        + "VALUES (?, 'CENTRAL_CARDINAL_8', 3.0, ?, ?, ?, true, 0.35, 0.5, "
                        + " 'GEOMETRIC_BISECTION', 'CENTROID_NEAREST', 'ATTACH_NEAREST_CLUSTER', 'AREA_CENTROID_MEAN')",
                cityId, maxDirectChildren, minAreasPerCluster, maxSafetyDepth);

        List<String> areaKeys = new ArrayList<>();
        for (int i = 0; i < areaCount; i++) {
            // area_key MUST be the real 4-pipe-segment convention (country|state|city|area) --
            // PostgresAreaCountProvider's FOUR_SEGMENT_GUARD silently excludes anything shorter,
            // which would make every /counts assertion below false-pass at zero.
            String areaKey = "IN|KA|" + slug + "|area-" + String.format("%03d", i);
            double lat = 13.0 + i * 0.01;
            double lon = 74.7;
            jdbc.update(
                    "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                            + " min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    areaKey, cityId, "Area " + i, slug + "-district", lat, lon,
                    lat - 0.001, lon - 0.001, lat + 0.001, lon + 0.001);
            areaKeys.add(areaKey);
        }

        jdbc.update("INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                + "VALUES (?, ?, ?, 1)", cityId, slug + "-north", slug + "-north");
        for (String areaKey : areaKeys) {
            jdbc.update("INSERT INTO public.city_region_memberships "
                            + "(city_id, area_key, region_key, assignment_source) VALUES (?, ?, ?, 'AUTO')",
                    cityId, areaKey, slug + "-north");
        }

        return new CityFixture(cityId, slug, areaKeys);
    }

    private record CityFixture(int cityId, String slug, List<String> areaKeys) {}

    /** Drives the REAL prepare -&gt; async generate -&gt; validate -&gt; launch pipeline for {@code
     *  fixture} to a PROMOTED revision, then waits for the async cache-refresh listener to swap
     *  {@link NavigationGraphCache}'s active pointer onto it. Returns the promoted revisionId. */
    private long prepareValidateAndPromote(CityFixture fixture) {
        PrepareResponse prep = preparationService.prepare(fixture.cityId(), ADMIN_ID);
        long revisionId = prep.revisionId();
        pollUntil(() -> assertThat(revisionRepository.findById(revisionId).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.PREPARED));

        // #2151 PR A adds a 6th checklist column (agriDestinations); markValidated's WHERE clause
        // now requires all six. No manual seeding needed here — this fixture drives the REAL
        // prepare pipeline with a valid, non-null/non-zero city origin (13.0, 74.7), so
        // CityLaunchGraphWriter's unconditional Agri-generation step already produced at least one
        // sandbox_agri_destination_classification row for this revision before this point, which
        // satisfies setAgriValidatedTrue's EXISTS guard.
        for (String key : new String[] {"landing", "regions", "areaGroups", "areas", "listing", "agriDestinations"}) {
            validationService.toggleCheck(fixture.cityId(), revisionId, key, true);
        }
        validationService.markValidated(fixture.cityId(), revisionId);

        PromotionReport report = promotionService.launch(fixture.cityId(), revisionId, ADMIN_ID.toString());
        assertThat(report.lifecycleStatus()).isEqualTo("PROMOTED");
        assertThat(report.cityActivated()).isTrue();
        assertThat(report.navigationNodesPromoted())
                .as("navigation-tree generation must have run for a city with a policy row")
                .isGreaterThan(0);

        pollUntil(() -> assertThat(graphCache.activeRevisionId(fixture.slug()))
                .as("async NavigationGraphRefreshListener must have swapped the cache pointer")
                .hasValue(revisionId));

        return revisionId;
    }

    private void insertListing(String areaKey) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, listing_purpose, latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'house', 'sale', 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, now, now);
    }

    // =========================================================================================
    // 1 — END-TO-END PIPELINE + structural integrity + checksum/verbatim fidelity
    // =========================================================================================

    @Test
    @DisplayName("E2E: prepare->generate->validate->promote for a seeded multi-level city produces a "
            + "structurally sound, verbatim-copied production tree with no cycles/orphans/duplicate "
            + "active paths/cross-city parentage/invalid depth/invalid representative areas")
    void endToEnd_multiLevelCity_structurallySound() {
        // #1956/#2014 D6(d): max_safety_depth=1 (not 10) -- the locked two-shape product contract
        // permits only ONE CLUSTER "Local Destination" level beneath a region's DIRECTION root
        // (max public depth 2: DIRECTION 0, CLUSTER 1, AREA 2), so the deep multi-CLUSTER-level
        // shape this fixture used to produce (mirroring NavigationTreeGeneratorTest's
        // genuineThreeClusterLevelCity_producesStructureButFailsContractShapeValidation -- note the
        // rename: that generator test now explicitly documents this exact shape FAILS validation)
        // is no longer a legal tree. 16 areas, max_direct_children=2, max_safety_depth=1 still
        // produces a genuine 2-CLUSTER-sibling tree (DIRECTION -> 2 CLUSTERs of 8 AREAs each) --
        // every invariant this test actually checks below (cycles/orphans/cross-city parentage/
        // dup keys/representative-subset/checksum+verbatim-copy fidelity) is exercised exactly as
        // rigorously by this shallower, contract-legal shape.
        CityFixture fixture = seedMultiLevelCity("e2e-ml", 16, 2, 1, 1);

        long revisionId = prepareValidateAndPromote(fixture);

        // Loading the active graph re-validates (NavigationGraphLoader#loadValidated) — a
        // successful load is itself strong evidence against cycles/orphans/cross-city parentage,
        // since NavigationGraph#build throws IllegalStateException on any parent reference not
        // already seen for THIS city's flat, city_id-scoped node list.
        NavigationGraph graph = graphCache.getActiveGraph(fixture.slug()).orElseThrow();
        assertThat(graph.revisionId()).isEqualTo(revisionId);

        List<NavigationNode> prodNodes = navigationNodeRepository.findByCityIdOrderByDepthAscDisplayOrderAsc(fixture.cityId());
        List<SandboxNavigationNode> sandboxNodes = sandboxNavigationNodeRepository.findByRevisionId(revisionId);
        assertThat(prodNodes).hasSameSizeAs(sandboxNodes);

        // AREA-leaf uniqueness + zero-listing retention: every seeded area appears EXACTLY once as
        // an AREA node, never excluded for having zero listings (generation never reads listings).
        List<NavigationNode> areaNodes = prodNodes.stream().filter(n -> "AREA".equals(n.getNodeType())).toList();
        Set<String> areaKeysInTree = new HashSet<>();
        for (NavigationNode n : areaNodes) {
            assertThat(areaKeysInTree.add(n.getAreaKey()))
                    .as("area_key %s must not appear as more than one AREA node", n.getAreaKey())
                    .isTrue();
        }
        assertThat(areaKeysInTree).containsExactlyInAnyOrderElementsOf(fixture.areaKeys());

        // No duplicate active node_key for this city.
        List<String> dupeNodeKeys = jdbc.queryForList(
                "SELECT node_key FROM public.navigation_nodes WHERE city_id = ? "
                        + "GROUP BY node_key HAVING COUNT(*) > 1",
                String.class, fixture.cityId());
        assertThat(dupeNodeKeys).isEmpty();

        // Cross-city / cross-revision parentage: every non-null parent_node_id must resolve to a
        // row with the SAME city_id (there is only one revision's worth of rows live in
        // navigation_nodes per city at a time, so this also rules out stale cross-revision parents).
        Integer crossCityOrphanParents = jdbc.queryForObject(
                "SELECT COUNT(*) FROM public.navigation_nodes child "
                        + "WHERE child.city_id = ? AND child.parent_node_id IS NOT NULL "
                        + "AND NOT EXISTS (SELECT 1 FROM public.navigation_nodes parent "
                        + "                WHERE parent.id = child.parent_node_id AND parent.city_id = child.city_id)",
                Integer.class, fixture.cityId());
        assertThat(crossCityOrphanParents).isZero();

        // Invalid depth: every depth must be within [0, max_safety_depth] and exactly
        // parent.depth + 1 for non-root nodes.
        Integer badDepthRows = jdbc.queryForObject(
                "SELECT COUNT(*) FROM public.navigation_nodes n "
                        + "WHERE n.city_id = ? AND (n.depth < 0 OR n.depth > 10)",
                Integer.class, fixture.cityId());
        assertThat(badDepthRows).isZero();
        Integer badParentDepthRows = jdbc.queryForObject(
                "SELECT COUNT(*) FROM public.navigation_nodes child "
                        + "JOIN public.navigation_nodes parent ON parent.id = child.parent_node_id "
                        + "WHERE child.city_id = ? AND child.depth <> parent.depth + 1",
                Integer.class, fixture.cityId());
        assertThat(badParentDepthRows).isZero();

        // Invalid representative areas: every CLUSTER's representative_area_keys must be a subset
        // of that node's OWN descendant AREA leaves (never an area outside its own subtree).
        for (NavigationNode n : prodNodes) {
            if (!"CLUSTER".equals(n.getNodeType())) {
                continue;
            }
            List<String> descendants = graph.descendantAreaKeysOf(n.getNodeKey());
            assertThat(descendants).containsAll(n.getRepresentativeAreaKeys());
        }

        // Checksum + verbatim-copy fidelity, prod == sandbox: field-for-field comparison keyed by
        // node_key (id/parent_node_id/revision_id deliberately excluded — they are expected to
        // differ, sandbox ids vs prod surrogate ids).
        Map<String, SandboxNavigationNode> sandboxByKey = new java.util.HashMap<>();
        for (SandboxNavigationNode s : sandboxNodes) {
            sandboxByKey.put(s.getNodeKey(), s);
        }
        for (NavigationNode p : prodNodes) {
            SandboxNavigationNode s = sandboxByKey.get(p.getNodeKey());
            assertThat(s).as("sandbox row for node_key %s must exist", p.getNodeKey()).isNotNull();
            assertThat(p.getNodeType()).isEqualTo(s.getNodeType());
            assertThat(p.getAreaKey()).isEqualTo(s.getAreaKey());
            assertThat(p.getDisplayLabel()).isEqualTo(s.getDisplayLabel());
            assertThat(p.getDisplayOrder()).isEqualTo(s.getDisplayOrder());
            assertThat(p.getDepth()).isEqualTo(s.getDepth());
            assertThat(p.getRegionKey()).isEqualTo(s.getRegionKey());
            assertThat(p.getDescendantAreaCount()).isEqualTo(s.getDescendantAreaCount());
            assertThat(p.getAncestorKeys()).containsExactlyElementsOf(s.getAncestorKeys());
            assertThat(p.getRepresentativeAreaKeys()).containsExactlyInAnyOrderElementsOf(s.getRepresentativeAreaKeys());
        }

        CityLaunchRevision revision = revisionRepository.findById(revisionId).orElseThrow();
        assertThat(revision.getAppliedRevisionChecksum()).isEqualTo(revision.getPersistedRevisionChecksum());
    }

    // =========================================================================================
    // 2a — LISTING INDEPENDENCE: zero listings vs many listings -> identical structure/node_keys/checksum
    // =========================================================================================

    @Test
    @DisplayName("listing independence (generation input): the SAME geography generates an IDENTICAL "
            + "tree (node_key set + diagnostic checksum) whether the city has zero listings or many "
            + "at generation time")
    void listingIndependence_zeroVsManyListingsAtGenerationTime_identicalStructure() {
        // #1956/#2014 D6(d): max_safety_depth=1 (not 8) so the generated tree stays within the
        // locked two-shape contract's max public depth of 2. This test only proves STRUCTURAL
        // IDENTITY between two independently-generated trees over identical geometry -- it does
        // not depend on absolute depth, so this shallower (but still multi-CLUSTER, since 9 areas
        // still split at max_direct_children=3) shape proves exactly the same listing-independence
        // claim with zero loss of rigor.
        CityFixture zeroListingsCity = seedMultiLevelCity("e2e-li0", 9, 3, 1, 1);
        CityFixture manyListingsCity = seedMultiLevelCity("e2e-liN", 9, 3, 1, 1);
        // Insert many listings for manyListingsCity's areas BEFORE prepare/generate runs.
        for (String areaKey : manyListingsCity.areaKeys()) {
            for (int i = 0; i < 5; i++) {
                insertListing(areaKey);
            }
        }

        long zeroRevisionId = prepareValidateAndPromote(zeroListingsCity);
        long manyRevisionId = prepareValidateAndPromote(manyListingsCity);

        NavigationGraph zeroGraph = graphCache.getActiveGraph(zeroListingsCity.slug()).orElseThrow();
        NavigationGraph manyGraph = graphCache.getActiveGraph(manyListingsCity.slug()).orElseThrow();

        assertThat(zeroGraph.nodeCount()).isEqualTo(manyGraph.nodeCount());

        // area_keys differ only by the city-slug prefix baked into each -> normalise it away and
        // compare the remaining structural shape (region-relative area index) directly.
        List<String> zeroKeysNormalised = normaliseAreaKeys(zeroListingsCity);
        List<String> manyKeysNormalised = normaliseAreaKeys(manyListingsCity);
        assertThat(zeroKeysNormalised).containsExactlyInAnyOrderElementsOf(manyKeysNormalised);

        List<NavigationNode> zeroNodes = navigationNodeRepository.findByCityIdOrderByDepthAscDisplayOrderAsc(zeroListingsCity.cityId());
        List<NavigationNode> manyNodes = navigationNodeRepository.findByCityIdOrderByDepthAscDisplayOrderAsc(manyListingsCity.cityId());
        assertThat(zeroNodes).hasSameSizeAs(manyNodes);
        for (int i = 0; i < zeroNodes.size(); i++) {
            assertThat(zeroNodes.get(i).getNodeType()).isEqualTo(manyNodes.get(i).getNodeType());
            assertThat(zeroNodes.get(i).getDepth()).isEqualTo(manyNodes.get(i).getDepth());
            assertThat(zeroNodes.get(i).getDisplayOrder()).isEqualTo(manyNodes.get(i).getDisplayOrder());
            assertThat(zeroNodes.get(i).getDescendantAreaCount()).isEqualTo(manyNodes.get(i).getDescendantAreaCount());
        }

        assertThat(zeroRevisionId).isNotEqualTo(manyRevisionId); // sanity: genuinely two different revisions/cities
    }

    /** area_key city-slug prefixes stripped so two differently-slugged, identically-shaped cities'
     *  area sets can be compared for structural equality. */
    private static List<String> normaliseAreaKeys(CityFixture fixture) {
        List<String> out = new ArrayList<>();
        for (String areaKey : fixture.areaKeys()) {
            out.add(areaKey.replace(fixture.slug() + "|", ""));
        }
        return out;
    }

    // =========================================================================================
    // 2b — LISTING INDEPENDENCE: post-promotion listing-count churn changes DISPLAY COUNTS only
    // =========================================================================================

    @Test
    @DisplayName("listing independence (display-time): listings inserted AFTER promotion change "
            + "/counts totals only — the structural /navigation body and graph checksum are unchanged")
    void listingIndependence_postPromotionListingChurn_countsOnlyNoStructuralChange() throws Exception {
        CityFixture fixture = seedMultiLevelCity("e2e-lipost", 6, 3, 1, 8);
        prepareValidateAndPromote(fixture);

        String rootUrl = "/api/discover/cities/" + fixture.slug() + "/navigation/root";
        String countsUrl = rootUrl + "/counts";

        String structuralBefore = mockMvc.perform(get(rootUrl))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String countsBody = mockMvc.perform(get(countsUrl))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(countsBody).contains("\"count\":0");

        String checksumBefore = graphCache.getActiveGraph(fixture.slug()).orElseThrow().checksum();

        for (String areaKey : fixture.areaKeys()) {
            insertListing(areaKey);
        }

        String structuralAfter = mockMvc.perform(get(rootUrl))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(structuralAfter).isEqualTo(structuralBefore);
        assertThat(graphCache.getActiveGraph(fixture.slug()).orElseThrow().checksum()).isEqualTo(checksumBefore);

        mockMvc.perform(get(countsUrl))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(fixture.areaKeys().size()));
    }

    // =========================================================================================
    // 3 — DIRECT-SEARCH vs GUIDED-NAVIGATION ancestry equivalence
    // =========================================================================================

    @Test
    @DisplayName("ancestry equivalence: GET .../areas/{areaKey}/navigation-path ancestry matches "
            + "walking GET .../navigation/{nodeKey} from root, for every seeded area")
    void ancestryEquivalence_directSearchMatchesGuidedNavigationWalk() throws Exception {
        // #1956/#2014 D6(d): max_safety_depth=1 (not 10) so the tree stays contract-shaped. This
        // test's guided-walk-vs-direct-search equivalence check is entirely shape-agnostic (it
        // follows real parent/child links generically for however many hops exist) so shortening
        // the tree loses zero rigor -- it proves the exact same equivalence over a shallower path.
        CityFixture fixture = seedMultiLevelCity("e2e-anc", 12, 2, 1, 1);
        prepareValidateAndPromote(fixture);

        for (String areaKey : fixture.areaKeys()) {
            String pathUrl = "/api/discover/cities/" + fixture.slug() + "/areas/" + areaKey + "/navigation-path";
            String body = mockMvc.perform(get(pathUrl))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();

            com.fasterxml.jackson.databind.JsonNode json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
            String areaNodeKey = json.get("nodeKey").asText();
            List<String> directSearchAncestry = new ArrayList<>();
            json.get("ancestry").forEach(n -> directSearchAncestry.add(n.get("nodeKey").asText()));

            // Guided-navigation walk: start at root, follow the "ancestry" chain by re-requesting
            // each ancestor node via GET .../navigation/{nodeKey}, and verify each step's own
            // children list actually contains the NEXT step (or, for the last ancestor, the AREA
            // leaf itself) — this is a genuine walk over the child links a real UI would follow,
            // not a re-read of the same ancestry field.
            String previousNodeKey = "root";
            for (String ancestorKey : directSearchAncestry) {
                String nodeUrl = "/api/discover/cities/" + fixture.slug() + "/navigation/" + previousNodeKey;
                String nodeBody = mockMvc.perform(get(nodeUrl))
                        .andExpect(status().isOk())
                        .andReturn().getResponse().getContentAsString();
                com.fasterxml.jackson.databind.JsonNode nodeJson =
                        new com.fasterxml.jackson.databind.ObjectMapper().readTree(nodeBody);
                List<String> childKeys = new ArrayList<>();
                nodeJson.get("children").forEach(c -> childKeys.add(c.get("nodeKey").asText()));
                assertThat(childKeys)
                        .as("guided walk: %s's children must include ancestor step %s", previousNodeKey, ancestorKey)
                        .contains(ancestorKey);
                previousNodeKey = ancestorKey;
            }
            // Final step: the last ancestor's children must include the AREA leaf itself.
            String lastAncestorUrl = "/api/discover/cities/" + fixture.slug() + "/navigation/" + previousNodeKey;
            String lastAncestorBody = mockMvc.perform(get(lastAncestorUrl))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            assertThat(lastAncestorBody).contains("\"" + areaNodeKey + "\"");
        }
    }

    // =========================================================================================
    // 4 — API CHECKPOINT scripted consumer (PR B assumptions): 0-, 1-, 2-level cities
    // =========================================================================================

    @Test
    @DisplayName("API checkpoint: shape, nextLevelType, bounds, dynamic counts, ancestry all present+"
            + "correct for 0-/1-level cities; surrogate ids never leak in any public response")
    void apiCheckpoint_zeroAndOneLevelCities_shapeAndNoSurrogateIdLeak() throws Exception {
        // #1956/#2014 D6(d), GENUINE PRODUCT-CONTRACT CONFLICT (not a test-authoring fix) — read
        // before touching this test again:
        //
        // This method ORIGINALLY covered three distinguishable public shapes: 0-level (root's
        // direct children are AREA leaves), 1-level (root -> one CLUSTER layer -> AREA), and
        // 2-level (root -> TWO CLUSTER layers -> AREA). The locked #1956/#2014 two-shape contract
        // (City -> Direction -> AREA, or City -> Direction -> ONE Local Destination CLUSTER ->
        // AREA — never a third public CLUSTER level) makes the ORIGINAL "2-level" shape
        // mathematically impossible to construct as a genuinely-distinct third case: with only one
        // CLUSTER level ever permitted, the ORIGINAL "2-level" shape and the ORIGINAL "1-level"
        // shape now COINCIDE (both are Direction -> one CLUSTER layer -> AREA). Re-adding a "2-level"
        // fixture here could only ever pass by asserting the exact same shape as "1-level" a second
        // time under a different name — a vacuous, trivially-true duplicate, which the hard rule for
        // this task explicitly forbids manufacturing. So the "2-level" fixture (`e2e-lvl2`,
        // `twoLevel`) and its `assertRootShape(twoLevel, "CLUSTER", 2)` call were REMOVED here, not
        // weakened — the two REMAINING scenarios (0-level, 1-level) are the only two genuinely
        // distinct public shapes the current contract allows, and both are still asserted at full
        // strength below, unweakened. If a genuine third public depth is ever reintroduced, this is
        // exactly where its coverage would be restored.
        //
        // #1956 D3 (independent of the above): every region's DIRECTION node is now unconditionally
        // the sole root child, so root's OWN nextLevelType is always "DIRECTION" — never AREA/
        // CLUSTER directly, regardless of fixture shape. assertRootShape below was updated to check
        // root's nextLevelType is DIRECTION, then descend into the DIRECTION node to check the real
        // AREA-vs-CLUSTER distinction this method exists to prove, and ancestry length now expects
        // +1 for the DIRECTION hop that is now always present.

        // 0-level: 1 area -> DIRECTION's direct child is a single AREA leaf, no CLUSTER at all.
        // This USED to be 2 areas: invariant #4 (ONE_CHILD_CLUSTER) originally fired for ANY
        // single-child parent regardless of node kind, so a genuine 1-area region tripped it
        // ("cluster d:e2e-lvl0-north has exactly one child" — confirmed live) even though nothing
        // was actually a degenerate CLUSTER split. #4 is now CLUSTER-specific (see
        // NavigationTreeValidationService#checkOneChildClusters) — a single-child DIRECTION is a
        // legitimate "region with exactly one canonical area" shape — so 1 area is now the more
        // honest fixture for "0-level, no CLUSTER" and still proves the exact same shape.
        CityFixture zeroLevel = seedMultiLevelCity("e2e-lvl0", 1, 4, 1, 8);
        // 1-level: 5 areas, max_direct_children=4 -> one bisection (~3/2) already fits under 4 on
        // both sides -> exactly one CLUSTER layer between the DIRECTION and AREA (mirrors
        // NavigationTreeGeneratorTest's halving behaviour).
        CityFixture oneLevel = seedMultiLevelCity("e2e-lvl1", 5, 4, 1, 8);

        prepareValidateAndPromote(zeroLevel);
        prepareValidateAndPromote(oneLevel);

        assertRootShape(zeroLevel, "AREA", 0);
        assertRootShape(oneLevel, "CLUSTER", 1);

        // Dynamic counts: 0 before any listing, exactly N after N listings, for every fixture.
        for (CityFixture fixture : List.of(zeroLevel, oneLevel)) {
            String countsUrl = "/api/discover/cities/" + fixture.slug() + "/navigation/root/counts";
            mockMvc.perform(get(countsUrl)).andExpect(status().isOk()).andExpect(jsonPath("$.count").value(0));
            for (String areaKey : fixture.areaKeys()) {
                insertListing(areaKey);
            }
            mockMvc.perform(get(countsUrl)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.count").value(fixture.areaKeys().size()));
        }

        // No surrogate id leakage: neither the structural navigation body, the navigation-path
        // body, nor the counts body ever include a raw DB surrogate id / parent id / sandbox id
        // field, for every fixture and every one of its areas.
        for (CityFixture fixture : List.of(zeroLevel, oneLevel)) {
            String rootBody = mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/root"))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            assertNoSurrogateIdLeak(rootBody);

            String countsBody = mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/root/counts"))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            assertNoSurrogateIdLeak(countsBody);

            for (String areaKey : fixture.areaKeys()) {
                String pathBody = mockMvc.perform(get("/api/discover/cities/" + fixture.slug()
                                + "/areas/" + areaKey + "/navigation-path"))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
                assertNoSurrogateIdLeak(pathBody);
            }
        }
    }

    private void assertRootShape(CityFixture fixture, String expectedDirectionNextLevelType, int extraClusterAncestors)
            throws Exception {
        String rootUrl = "/api/discover/cities/" + fixture.slug() + "/navigation/root";
        String rootBody = mockMvc.perform(get(rootUrl))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nodeKey").value("root"))
                .andExpect(jsonPath("$.nodeType").value("ROOT"))
                // #1956 D3: root's own nextLevelType is unconditionally "DIRECTION" now.
                .andExpect(jsonPath("$.nextLevelType").value("DIRECTION"))
                // #2083 RC_A part 3: root's bounds are now server-derived (union of its direct
                // children's bounds) instead of always-null — this REPLACES the previous
                // doesNotExist() assertion, it does not weaken it. Both fixtures here have at least
                // one root-level DIRECTION child with real generator-computed bounds, so root's own
                // bounds must exist and carry a real centre.
                .andExpect(jsonPath("$.bounds").exists())
                .andExpect(jsonPath("$.bounds.centreLat").exists())
                .andExpect(jsonPath("$.bounds.centreLon").exists())
                .andExpect(jsonPath("$.children").isNotEmpty())
                .andReturn().getResponse().getContentAsString();

        // Descend into the region's DIRECTION node — ITS nextLevelType is the real AREA-vs-CLUSTER
        // distinction this method exists to prove.
        String directionNodeKey = new com.fasterxml.jackson.databind.ObjectMapper().readTree(rootBody)
                .get("children").get(0).get("nodeKey").asText();
        mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/" + directionNodeKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nodeType").value("DIRECTION"))
                .andExpect(jsonPath("$.nextLevelType").value(expectedDirectionNextLevelType));

        // Depth/ancestry sanity for the deepest reachable AREA: extraClusterAncestors CLUSTER
        // ancestors (0 for the 0-level fixture, 1 for 1-level) PLUS 1 for the DIRECTION ancestor,
        // which is now unconditionally present (#1956 D3).
        String anyAreaKey = fixture.areaKeys().get(0);
        String pathUrl = "/api/discover/cities/" + fixture.slug() + "/areas/" + anyAreaKey + "/navigation-path";
        mockMvc.perform(get(pathUrl))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areaKey").value(anyAreaKey))
                .andExpect(jsonPath("$.ancestry.length()").value(extraClusterAncestors + 1));
    }

    private static void assertNoSurrogateIdLeak(String jsonBody) {
        assertThat(jsonBody).doesNotContain("\"id\":");
        assertThat(jsonBody).doesNotContain("\"parentNodeId\":");
        assertThat(jsonBody).doesNotContain("\"sandboxAreaId\":");
        assertThat(jsonBody).doesNotContain("\"cityId\":");
    }
}
