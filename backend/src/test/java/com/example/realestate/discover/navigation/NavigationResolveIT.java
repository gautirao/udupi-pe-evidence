package com.example.realestate.discover.navigation;

import com.example.realestate.discover.citylaunch.CityLaunchPreparationService;
import com.example.realestate.discover.citylaunch.CityLaunchPromotionService;
import com.example.realestate.discover.citylaunch.CityLaunchRevisionRepository;
import com.example.realestate.discover.citylaunch.CityLaunchValidationService;
import com.example.realestate.discover.citylaunch.LifecycleStatus;
import com.example.realestate.discover.citylaunch.PrepareResponse;
import com.example.realestate.discover.citylaunch.PromotionReport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Testcontainers integration test (real Postgres) for {@code GET
 * /api/discover/cities/{city}/navigation/resolve} (#1956 Areas PR-A, AC17/AC18) — drives the REAL
 * prepare-&gt;generate-&gt;validate-&gt;promote pipeline (mirrors {@code
 * EndToEndNavigationPipelineIT}'s fixture recipe) so {@code /resolve} is exercised over a genuine
 * cached {@link NavigationGraph}, not a hand-built mock.
 *
 * <p>Covers the qa-fast Gate F security asks that are specific to this build/real-request level:
 * V5 (permitAll matcher coverage, proven by a no-Authorization-header 200), R1 (ETag differs for
 * two different resolutions at the same revision), R10 (oversized {@code ?node=} rejected). Rung
 * mechanics (EXACT / ANCESTOR via stale "a:"/"c:" keys / CITY_ROOT / ALIAS-unreachable) that need a
 * hand-built graph to construct a genuinely stale-but-resolvable input are unit-tested in {@code
 * NavigationControllerTest} instead — see that class's {@code resolve_*} tests and their
 * DisplayNames for why a stale "a:" area key's ANCESTOR precondition cannot be reproduced through
 * today's real generator output (its own node_key is deterministically tied to its area_key).
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
        "AI_API_KEY=test-dummy-not-used-in-navigation-resolve-it",
        "spring.task.scheduling.enabled=false",
        "discover.navigation.counts.cache.ttl-seconds=0"
})
class NavigationResolveIT {

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

    private static final UUID ADMIN_ID = UUID.randomUUID();
    private final List<String> testCitySlugs = new ArrayList<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

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

    private record CityFixture(int cityId, String slug, List<String> areaKeys) {}

    /** Same fixture recipe as {@code EndToEndNavigationPipelineIT#seedMultiLevelCity}. */
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

        pollUntil(() -> assertThat(graphCache.activeRevisionId(fixture.slug())).hasValue(revisionId));
        return revisionId;
    }

    // =========================================================================================
    // V5 — no-auth 200 (permitAll matcher coverage), proven by a real MockMvc request with no
    // Authorization header at all.
    // =========================================================================================

    @Test
    @DisplayName("V5: GET .../navigation/resolve with NO Authorization header returns 200, not 401 — "
            + "proves the existing permitAll matcher /api/discover/cities/*/navigation/* covers "
            + "the resolve route (single '*' matches the literal 'resolve' path segment)")
    void resolve_noAuthHeader_returns200NotUnauthorized() throws Exception {
        CityFixture fixture = seedMultiLevelCity("resolve-v5", 3, 4, 1, 8);
        prepareValidateAndPromote(fixture);

        mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                        .param("node", "root"))
                // No .header("Authorization", ...) anywhere in this request — if the permitAll
                // matcher did NOT cover this route, BearerTokenAuthenticationFilter would 401.
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resolution").value("EXACT"));
    }

    // =========================================================================================
    // Ladder rungs reachable through the real pipeline: EXACT, ANCESTOR (stale "c:" cluster key),
    // CITY_ROOT.
    // =========================================================================================

    @Test
    @DisplayName("resolve: node=root -> EXACT, full inlined root body in one round trip")
    void resolve_exactRoot() throws Exception {
        CityFixture fixture = seedMultiLevelCity("resolve-exact-root", 3, 4, 1, 8);
        prepareValidateAndPromote(fixture);

        mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                        .param("node", "root"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resolution").value("EXACT"))
                .andExpect(jsonPath("$.node.nodeKey").value("root"))
                .andExpect(jsonPath("$.node.nodeType").value("ROOT"))
                .andExpect(jsonPath("$.node.children").isNotEmpty())
                // Fix-cycle-1 S7: descendantAreaKeys must be OMITTED (not present, not null-valued)
                // at the JSON wire level for the root — a wire-format property @JsonInclude(NON_NULL)
                // proves today, but only a JSON-level assertion actually locks it in against e.g. a
                // future spring.jackson.default-property-inclusion change or an Include.ALWAYS
                // mapper (that pattern already exists elsewhere in this codebase).
                .andExpect(jsonPath("$.node.descendantAreaKeys").doesNotExist());
    }

    @Test
    @DisplayName("resolve: additive areaKey field (#1956 fix-cycle-1 S6) is present for an AREA leaf "
            + "and omitted (JSON-level) for the ROOT")
    void resolve_areaKeyField_presentOnArea_omittedOnRoot() throws Exception {
        CityFixture fixture = seedMultiLevelCity("resolve-areakey-root", 3, 4, 1, 8);
        prepareValidateAndPromote(fixture);
        String areaKey = fixture.areaKeys().get(0);
        String areaNodeKey = "a:" + areaKey;

        mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                        .param("node", "root"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.node.areaKey").doesNotExist());

        mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                        .param("node", areaNodeKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.node.nodeType").value("AREA"))
                .andExpect(jsonPath("$.node.areaKey").value(areaKey));
    }

    @Test
    @DisplayName("resolve: additive areaKey field (#1956 fix-cycle-1 S6) is omitted (JSON-level) for "
            + "a CLUSTER node")
    void resolve_areaKeyField_omittedOnCluster() throws Exception {
        // #1956/#2014 D6(d): max_safety_depth=1 (not 10) so the generated tree stays within the
        // locked two-shape contract's max public depth of 2 (DIRECTION 0, CLUSTER 1, AREA 2) --
        // 16 areas still genuinely split into two CLUSTER siblings, just not recursively beneath
        // each other anymore. See NavigationTreeValidationServiceTest for the invariant itself.
        CityFixture fixture = seedMultiLevelCity("resolve-areakey-cluster", 16, 2, 1, 1);
        prepareValidateAndPromote(fixture);

        String rootBody = mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/root"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        // #1956 D3: root's own child is now the region's DIRECTION node, not a CLUSTER directly --
        // descend one more level to reach a genuine CLUSTER (the DIRECTION's own child).
        String directionNodeKey = objectMapper.readTree(rootBody).get("children").get(0).get("nodeKey").asText();
        String directionBody = mockMvc.perform(get("/api/discover/cities/" + fixture.slug()
                        + "/navigation/" + directionNodeKey))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String clusterNodeKey = objectMapper.readTree(directionBody).get("children").get(0).get("nodeKey").asText();

        mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                        .param("node", clusterNodeKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.node.nodeType").value("CLUSTER"))
                .andExpect(jsonPath("$.node.areaKey").doesNotExist());
    }

    @Test
    @DisplayName("resolve: node=a real, still-current AREA key -> EXACT, descendantAreaKeys empty")
    void resolve_exactAreaKey() throws Exception {
        CityFixture fixture = seedMultiLevelCity("resolve-exact-area", 3, 4, 1, 8);
        prepareValidateAndPromote(fixture);
        String areaKey = fixture.areaKeys().get(0);
        String areaNodeKey = "a:" + areaKey;

        mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                        .param("node", areaNodeKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resolution").value("EXACT"))
                .andExpect(jsonPath("$.node.nodeKey").value(areaNodeKey))
                .andExpect(jsonPath("$.node.nodeType").value("AREA"))
                .andExpect(jsonPath("$.node.descendantAreaKeys").isEmpty());
    }

    @Test
    @DisplayName("resolve: a stale 'c:' cluster key whose representative-area segment still contains "
            + "a real, current area -> ANCESTOR, a node genuinely containing that area "
            + "— NEVER the unrelated depth-0 SIBLING half (#1956 fix-cycle-1 B1/S5, fix-cycle-3 S-2)")
    void resolve_staleClusterKey_representativeAreaStillPresent_resolvesToGenuineContainingAncestor_notSibling()
            throws Exception {
        // #1956/#2014 D6(d): max_safety_depth=1 (not 10) so the generated tree stays within the
        // locked two-shape contract's max public depth of 2 (DIRECTION 0, CLUSTER 1, AREA 2). 16
        // areas, max_direct_children=2 -> the DIRECTION's single split still produces TWO CLUSTER
        // siblings at depth 1 (same disjoint-content relationship B1 fixes: NavigationTreeGenerator
        // #expand emits both partition halves as CLUSTERs sharing one parent — the DIRECTION here,
        // not null — so neither sibling is an ancestor of the other). The PRIOR region-only
        // heuristic tie-broke by nodeKey.compareTo — an ARBITRARY pick between the two — so a stale
        // key genuinely derived from siblingB's geography could resolve to siblingA instead and be
        // mislabelled ANCESTOR despite disjoint descendantAreaKeys. This is why the assertion below
        // checks the RELATIONSHIP (genuine containment of a real area), not a positional index.
        //
        // NOTE (#1956/#2014 D6(d) capability trade-off, called out explicitly per instruction): with
        // only ONE CLUSTER level permitted, "the deepest cluster containing the surviving
        // representative" and "the only cluster containing it" now coincide — this IT no longer
        // separately exercises fix-cycle-3 S-2's "prefer deepest over shallow ancestor" nuance
        // across MULTIPLE nested cluster levels. That nuance remains covered by {@code
        // NavigationControllerTest#resolve_staleClusterKey_representativeAreaStillPresent_resolvesToDeepestContainingAncestor}
        // (a hand-built multi-level graph, per this class's own header javadoc on why such rungs are
        // unit-tested there). What THIS test still genuinely proves, unweakened, is the actual B1
        // incident: a stale key must resolve to the cluster that genuinely CONTAINS the surviving
        // area, never an unrelated disjoint-content sibling — that relationship does not depend on
        // tree depth, and the assertions below still require true containment + non-identity with
        // siblingA, not a vacuous pass.
        CityFixture fixture = seedMultiLevelCity("resolve-stale-c", 16, 2, 1, 1);
        prepareValidateAndPromote(fixture);

        String rootBody = mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/root"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        // #1956 D3: root's own child is the region's DIRECTION node, not a CLUSTER directly --
        // descend one more level to reach the two genuine CLUSTER siblings (the DIRECTION's own
        // children).
        String directionNodeKey = objectMapper.readTree(rootBody).get("children").get(0).get("nodeKey").asText();
        String directionBody = mockMvc.perform(get("/api/discover/cities/" + fixture.slug()
                        + "/navigation/" + directionNodeKey))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode directionJson = objectMapper.readTree(directionBody);
        String siblingAKey = directionJson.get("children").get(0).get("nodeKey").asText();
        String siblingBKey = directionJson.get("children").get(1).get("nodeKey").asText();
        String regionSlug = siblingBKey.split(":", -1)[1];

        // Pull siblingB's OWN descendantAreaKeys so the stale key genuinely derives from ITS
        // geography, not siblingA's.
        String siblingBBody = mockMvc.perform(get("/api/discover/cities/" + fixture.slug()
                        + "/navigation/" + siblingBKey))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode siblingBJson = objectMapper.readTree(siblingBBody);
        String survivingAreaKey = siblingBJson.get("descendantAreaKeys").get(0).asText();

        // Stale key: same region, but a suffix built from a real area still under siblingB — the
        // extra literal text guarantees this is never a real generator output, while remaining
        // genuinely containment-linked to siblingB (never siblingA).
        String staleKey = "c:" + regionSlug + ":" + NavigationKeys.slug(survivingAreaKey)
                + "-definitely-not-a-real-cluster-suffix-anymore";

        MvcResult result = mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                        .param("node", staleKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resolution").value("ANCESTOR"))
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("node").get("nodeKey").asText()).isNotEqualTo(siblingAKey);
        // deepestContainingAll is restricted to CLUSTER-typed nodes (#1956 fix-cycle-3 S-2 /
        // fix-cycle-4) — this guards that restriction still holds at the HTTP layer, not just the
        // containment assertion below (which an AREA node would also satisfy).
        assertThat(body.get("node").get("nodeType").asText()).isEqualTo("CLUSTER");
        List<String> resolvedDescendantAreaKeys = new ArrayList<>();
        body.get("node").get("descendantAreaKeys").forEach(n -> resolvedDescendantAreaKeys.add(n.asText()));
        assertThat(resolvedDescendantAreaKeys).contains(survivingAreaKey);
    }

    @Test
    @DisplayName("resolve: a stale 'c:' cluster key with NO surviving representative area -> "
            + "CITY_ROOT, not a region-only-coincidence ANCESTOR (#1956 fix-cycle-1 B1)")
    void resolve_staleClusterKey_noSurvivingRepresentativeArea_fallsBackToCityRoot() throws Exception {
        // #1956/#2014 D6(d): max_safety_depth=1 (not 10) — see the sibling-disambiguation test
        // above for why this keeps the tree contract-shaped without changing this test's meaning
        // (it never depends on cluster nesting depth, only on the stale key matching nothing).
        CityFixture fixture = seedMultiLevelCity("resolve-stale-c-miss", 16, 2, 1, 1);
        prepareValidateAndPromote(fixture);

        String rootBody = mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/root"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode rootJson = objectMapper.readTree(rootBody);
        // #1956 D3: root's child is now the region's DIRECTION node ("d:" + regionSlug) rather than
        // a CLUSTER ("c:" + regionSlug + ":..."), but the region slug still sits at split-index 1
        // either way, so this extraction is unchanged.
        String regionSlug = rootJson.get("children").get(0).get("nodeKey").asText().split(":", -1)[1];
        // No real area_key's slug appears anywhere in this suffix -> containment finds nothing.
        String staleKey = "c:" + regionSlug + ":definitely-not-a-real-cluster-suffix-anymore";

        mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                        .param("node", staleKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resolution").value("CITY_ROOT"))
                .andExpect(jsonPath("$.node.nodeKey").value("root"));
    }

    @Test
    @DisplayName("resolve: a completely unrecognized key -> CITY_ROOT fallback")
    void resolve_unknownKey_fallsBackToCityRoot() throws Exception {
        CityFixture fixture = seedMultiLevelCity("resolve-unknown", 3, 4, 1, 8);
        prepareValidateAndPromote(fixture);

        mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                        .param("node", "totally-unrecognized-key-xyz"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resolution").value("CITY_ROOT"))
                .andExpect(jsonPath("$.node.nodeKey").value("root"));
    }

    @Test
    @DisplayName("resolve: ALIAS is never returned across EXACT/ANCESTOR/CITY_ROOT-triggering inputs")
    void resolve_neverReturnsAlias() throws Exception {
        // #1956/#2014 D6(d): max_safety_depth=1 (not 10) so the tree stays contract-shaped; this
        // test only feeds fixed literal node= strings, never inspects tree shape, so is otherwise
        // unaffected.
        CityFixture fixture = seedMultiLevelCity("resolve-no-alias", 16, 2, 1, 1);
        prepareValidateAndPromote(fixture);

        List<String> inputs = List.of(
                "root",
                "a:" + fixture.areaKeys().get(0),
                "c:some-region:definitely-not-a-real-cluster-suffix-anymore",
                "totally-unrecognized-key-xyz");
        for (String input : inputs) {
            MvcResult result = mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                            .param("node", input))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode json = objectMapper.readTree(result.getResponse().getContentAsString());
            assertThat(json.get("resolution").asText()).as("input=%s", input).isNotEqualTo("ALIAS");
        }
    }

    // =========================================================================================
    // R1 — ETag differentiates two different resolutions at the same revision.
    // =========================================================================================

    @Test
    @DisplayName("R1: two different node= values that resolve to two different nodes at the SAME "
            + "revision get two different ETags, and a stale If-None-Match from one never "
            + "short-circuits (304) the other")
    void resolve_etagDiffersForDifferentResolvedNodes_atSameRevision() throws Exception {
        CityFixture fixture = seedMultiLevelCity("resolve-r1-etag", 3, 4, 1, 8);
        prepareValidateAndPromote(fixture);
        String area0NodeKey = "a:" + fixture.areaKeys().get(0);
        String area1NodeKey = "a:" + fixture.areaKeys().get(1);

        MvcResult first = mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                        .param("node", area0NodeKey))
                .andExpect(status().isOk())
                .andReturn();
        MvcResult second = mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                        .param("node", area1NodeKey))
                .andExpect(status().isOk())
                .andReturn();

        String etag1 = first.getResponse().getHeader("ETag");
        String etag2 = second.getResponse().getHeader("ETag");
        assertThat(etag1).isNotNull();
        assertThat(etag2).isNotNull().isNotEqualTo(etag1);

        // A stale If-None-Match carrying node0's ETag must NOT produce a 304 for node1's request —
        // it must still return node1's full body with status 200.
        mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                        .param("node", area1NodeKey)
                        .header("If-None-Match", etag1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.node.nodeKey").value(area1NodeKey));

        // The MATCHING ETag, however, does short-circuit to 304.
        mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                        .param("node", area1NodeKey)
                        .header("If-None-Match", etag2))
                .andExpect(status().isNotModified());
    }

    // =========================================================================================
    // R10 — oversized ?node= input bound.
    // =========================================================================================

    @Test
    @DisplayName("R10: a >256-byte node= value is rejected with 400, not processed")
    void resolve_oversizedNodeParam_rejected() throws Exception {
        CityFixture fixture = seedMultiLevelCity("resolve-r10", 3, 4, 1, 8);
        prepareValidateAndPromote(fixture);
        String oversized = "a".repeat(300);

        mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/resolve")
                        .param("node", oversized))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("resolve: unknown city with no active hierarchy -> 404")
    void resolve_unknownCity_404() throws Exception {
        mockMvc.perform(get("/api/discover/cities/no-such-city-xyz/navigation/resolve")
                        .param("node", "root")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound());
    }

    // =========================================================================================
    // #2086 R5 — NavigationChildSummary widened with descendantAreaCount/representativeAreaKeys/
    // bounds/bearingDegrees, over a REAL generator-produced tree, with NO Authorization header
    // (V5 precedent) — the whole point being these are anon-reachable, real-pipeline-sourced values,
    // not just unit-test-fixture wiring.
    // =========================================================================================

    @Test
    @DisplayName("#2086 R5: GET .../navigation/root with NO Authorization header returns 200 with the "
            + "four widened child fields present, and bearingDegrees null for the depth-0 DIRECTION "
            + "child (no parent node to bear from)")
    void navigationRoot_noAuthHeader_widenedChildFields_bearingNullAtDepthZero() throws Exception {
        // #1956/#2014 D6(d): max_safety_depth=1 so the tree stays within the DIRECTION(0)/CLUSTER(1)/
        // AREA(2) contract shape — same recipe as resolve_areaKeyField_omittedOnCluster above.
        CityFixture fixture = seedMultiLevelCity("r5-root-bearing", 16, 2, 1, 1);
        prepareValidateAndPromote(fixture);

        MvcResult result = mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/root"))
                // No .header("Authorization", ...) — proves the widened response still serves anon.
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        JsonNode directionChild = body.get("children").get(0);

        assertThat(directionChild.get("nodeType").asText()).isEqualTo("DIRECTION");
        assertThat(directionChild.has("descendantAreaCount")).isTrue();
        assertThat(directionChild.get("descendantAreaCount").asInt()).isEqualTo(16);
        assertThat(directionChild.has("representativeAreaKeys")).isTrue();
        assertThat(directionChild.get("representativeAreaKeys").isArray()).isTrue();
        assertThat(directionChild.get("representativeAreaKeys").size()).isGreaterThan(0);
        assertThat(directionChild.has("bounds")).isTrue();
        assertThat(directionChild.get("bounds").isNull()).isFalse();
        assertThat(directionChild.has("bearingDegrees"))
                .as("present-and-null, never omitted — the agreed nested-record wire contract")
                .isTrue();
        assertThat(directionChild.get("bearingDegrees").isNull())
                .as("depth-0 DIRECTION child under the synthetic root has no parent node to bear from")
                .isTrue();
    }

    @Test
    @DisplayName("#2086 R5: a CLUSTER child below depth 0 gets a NON-NULL bearingDegrees within "
            + "[0, 360) from a real generator-produced tree, reachable with no Authorization header")
    void navigationDirection_noAuthHeader_clusterChild_bearingNonNullWithinRange() throws Exception {
        CityFixture fixture = seedMultiLevelCity("r5-cluster-bearing", 16, 2, 1, 1);
        prepareValidateAndPromote(fixture);

        String rootBody = mockMvc.perform(get("/api/discover/cities/" + fixture.slug() + "/navigation/root"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String directionNodeKey = objectMapper.readTree(rootBody).get("children").get(0).get("nodeKey").asText();

        MvcResult result = mockMvc.perform(get("/api/discover/cities/" + fixture.slug()
                        + "/navigation/" + directionNodeKey))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode directionBody = objectMapper.readTree(result.getResponse().getContentAsString());
        JsonNode clusterChild = directionBody.get("children").get(0);

        assertThat(clusterChild.get("nodeType").asText()).isEqualTo("CLUSTER");
        assertThat(clusterChild.get("bearingDegrees").isNull())
                .as("below depth 0, bearingDegrees is the great-circle bearing from the DIRECTION "
                        + "parent's centre — never null")
                .isFalse();
        double bearing = clusterChild.get("bearingDegrees").asDouble();
        assertThat(bearing).isGreaterThanOrEqualTo(0.0).isLessThan(360.0);
        assertThat(clusterChild.get("descendantAreaCount").asInt()).isGreaterThan(0);
        assertThat(clusterChild.get("representativeAreaKeys").isArray()).isTrue();
        assertThat(clusterChild.get("bounds").isNull()).isFalse();
    }
}
