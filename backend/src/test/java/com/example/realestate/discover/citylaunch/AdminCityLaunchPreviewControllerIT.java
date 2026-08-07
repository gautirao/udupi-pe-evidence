package com.example.realestate.discover.citylaunch;

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

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Testcontainers integration test (real Postgres + the REAL Spring Security filter chain) proving
 * the acceptance criteria for {@link AdminCityLaunchPreviewController} (#1911 PR3).
 *
 * <p>Mirrors {@code AdminCityLaunchControllerIT}'s pattern: a no-op {@link JwtDecoder} whose token
 * value IS the JWT subject, so {@code DbRoleJwtAuthenticationConverter} performs a REAL
 * {@code user_roles} DB lookup — exercising the actual {@code @IsAdmin} gate end-to-end.
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
        "AI_API_KEY=test-dummy-not-used-in-city-launch-preview-it",
        "spring.task.scheduling.enabled=false"
})
class AdminCityLaunchPreviewControllerIT {

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
    @Autowired private ObjectMapper objectMapper;
    @Autowired private CityLaunchRevisionRepository revisionRepository;
    @Autowired private SandboxAreaRepository sandboxAreaRepository;
    @Autowired private SandboxCityRegionRepository sandboxCityRegionRepository;
    @Autowired private SandboxCityRegionMembershipRepository sandboxMembershipRepository;
    @Autowired private SandboxAreaGroupRepository sandboxAreaGroupRepository;
    @Autowired private SandboxAreaGroupMemberRepository sandboxAreaGroupMemberRepository;
    @Autowired private com.example.realestate.discover.navigation.SandboxNavigationNodeRepository sandboxNavigationNodeRepository;

    private static final UUID ADMIN_ID = UUID.fromString("19110101-0000-0000-0000-000000000001");
    private static final UUID BUYER_ID = UUID.fromString("19110102-0000-0000-0000-000000000002");

    private Integer testCityId;
    private Integer otherCityId;

    @BeforeEach
    void setUp() {
        testCityId = jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES ('acp-it', 'ACP IT Test City', 13.0, 74.7, true) RETURNING id",
                Integer.class);
        otherCityId = jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES ('acp-it-other', 'ACP IT Other City', 12.9, 77.6, true) RETURNING id",
                Integer.class);
        seedRole(ADMIN_ID, "admin");
        seedRole(BUYER_ID, "user");
    }

    @AfterEach
    void cleanup() {
        jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id IN (?, ?)", testCityId, otherCityId);
        jdbc.update("DELETE FROM public.cities WHERE id IN (?, ?)", testCityId, otherCityId);
        jdbc.update("DELETE FROM auth.users WHERE id IN (?, ?)", ADMIN_ID, BUYER_ID);
    }

    private void seedRole(UUID userId, String role) {
        jdbc.update(
                "INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                userId, "acp-it-" + userId + "@test.local");
        jdbc.update(
                "INSERT INTO public.user_roles (user_id, role) VALUES (?, CAST(? AS public.app_role)) "
                        + "ON CONFLICT (user_id, role) DO NOTHING",
                userId, role);
    }

    private String adminAuth() {
        return "Bearer " + ADMIN_ID;
    }

    // ── Seeding helpers ──────────────────────────────────────────────────────────────────────

    private int nextRevisionNumber = 1;

    private CityLaunchRevision seedRevision(int cityId, PrepState prepState, LifecycleStatus lifecycleStatus) {
        CityLaunchRevision revision = new CityLaunchRevision(cityId, nextRevisionNumber++, ADMIN_ID);
        revision.setPrepState(prepState);
        revision.setLifecycleStatus(lifecycleStatus);
        return revisionRepository.save(revision);
    }

    private SandboxArea seedArea(
            long revisionId, String areaKey, String name, String lifecycleStatus,
            Double geoCenterLat, Double geoCenterLon,
            Double minLat, Double minLon, Double maxLat, Double maxLon) {
        SandboxArea area = new SandboxArea(
                revisionId, areaKey, name, "Test District",
                geoCenterLat, geoCenterLon, minLat, minLon, maxLat, maxLon,
                "osm", "way", 1L, lifecycleStatus);
        return sandboxAreaRepository.save(area);
    }

    private SandboxCityRegion seedRegion(long revisionId, String regionKey, String label, int displayOrder) {
        SandboxCityRegion region = new SandboxCityRegion(
                revisionId, regionKey, label, displayOrder,
                BigDecimal.valueOf(13.0), BigDecimal.valueOf(74.7), null, null, null, null, "fp-1");
        return sandboxCityRegionRepository.save(region);
    }

    private void seedMembership(long revisionId, long sandboxAreaId, String regionKey) {
        sandboxMembershipRepository.save(
                new SandboxCityRegionMembership(revisionId, sandboxAreaId, regionKey, AssignmentSource.AUTO));
    }

    private SandboxAreaGroup seedGroup(long revisionId, String slug, String name, int displayOrder) {
        SandboxAreaGroup group = new SandboxAreaGroup(
                revisionId, slug, name, null, null, displayOrder, true,
                null, null, null, null, null, null);
        return sandboxAreaGroupRepository.save(group);
    }

    private void seedGroupMember(long revisionId, long groupId, long areaId, int displayOrder) {
        sandboxAreaGroupMemberRepository.save(
                new SandboxAreaGroupMember(revisionId, groupId, areaId, displayOrder));
    }

    private com.example.realestate.discover.navigation.SandboxNavigationNode seedNavigationNode(
            long revisionId, String nodeKey, String nodeType, Long parentNodeId, String regionKey, String areaKey,
            int displayOrder, int depth, java.util.List<String> ancestorKeys, java.util.List<String> representativeAreaKeys) {
        com.example.realestate.discover.navigation.SandboxNavigationNode n = new com.example.realestate.discover.navigation.SandboxNavigationNode(
                revisionId, regionKey, nodeType, parentNodeId, nodeKey, areaKey, representativeAreaKeys,
                nodeKey + " Label", displayOrder, depth, ancestorKeys, 1,
                BigDecimal.valueOf(13.0), BigDecimal.valueOf(74.7), BigDecimal.valueOf(13.0), BigDecimal.valueOf(74.7),
                BigDecimal.valueOf(13.0), BigDecimal.valueOf(74.7), BigDecimal.ZERO, "preview-policy", Instant.now());
        return sandboxNavigationNodeRepository.save(n);
    }

    // =========================================================================================
    // AC1 + AC10 — each of E1-E6 returns the production DTO shape, all with Cache-Control: no-store
    // =========================================================================================

    @Test
    @DisplayName("AC1/AC10: E1-E6 return production DTO shapes populated from the sandbox graph, all no-store")
    void ac1_ac10_allEndpoints_populatedAndNoStore() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();
        SandboxArea area = seedArea(revisionId, "IN|KA|ACP|Alpha", "Alpha", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        seedRegion(revisionId, "north", "North", 1);
        seedMembership(revisionId, area.getId(), "north");
        SandboxAreaGroup group = seedGroup(revisionId, "alpha-group", "Alpha Group", 1);
        seedGroupMember(revisionId, group.getId(), area.getId(), 1);

        String base = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview";

        mockMvc.perform(get(base + "/regions").header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.citySlug").value("acp-it"))
                .andExpect(jsonPath("$.regions[0].key").value("north"))
                .andExpect(jsonPath("$.regions[0].areaCount").value(1))
                .andExpect(jsonPath("$.regions[0].listingCount").value(1));

        mockMvc.perform(get(base + "/regions/north/groups").header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.regionKey").value("north"))
                .andExpect(jsonPath("$.groups[0].groupSlug").value("alpha-group"))
                .andExpect(jsonPath("$.groups[0].areaKeys[0]").value("IN|KA|ACP|Alpha"));

        mockMvc.perform(get(base + "/areas").header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.areas[0].areaKey").value("IN|KA|ACP|Alpha"))
                .andExpect(jsonPath("$.areas[0].listingCount").value(1))
                .andExpect(jsonPath("$.areas[0].schoolCount").value(0));

        mockMvc.perform(get(base + "/markers").param("areaKeys", "IN|KA|ACP|Alpha")
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.markers[0].id").value("preview:" + revisionId + ":IN|KA|ACP|Alpha"));

        mockMvc.perform(get(base + "/listings").param("areaKeys", "IN|KA|ACP|Alpha")
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.areas[0].areaName").value("Alpha"))
                .andExpect(jsonPath("$.areas[0].listings[0].propertyType").exists());

        mockMvc.perform(get(base + "/listings/" + area.getAreaKey()).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.areaKey").value("IN|KA|ACP|Alpha"))
                .andExpect(jsonPath("$.status").value("LIVE"))
                .andExpect(jsonPath("$.heroImageUrl").doesNotExist());
    }

    // =========================================================================================
    // AC2 — viewability guard
    // =========================================================================================

    @Test
    @DisplayName("AC2: wrong-city -> 404")
    void ac2_wrongCity_404() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        String url = "/api/admin/city-launch/cities/" + otherCityId
                + "/revisions/" + revision.getId() + "/preview/regions";
        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("AC2: unknown revision -> 404")
    void ac2_unknownRevision_404() throws Exception {
        String url = "/api/admin/city-launch/cities/" + testCityId + "/revisions/999999999/preview/regions";
        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("AC2: prep_state != DONE -> 409")
    void ac2_prepStateNotDone_409() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.RUNNING, LifecycleStatus.PREPARING);
        String url = "/api/admin/city-launch/cities/" + testCityId
                + "/revisions/" + revision.getId() + "/preview/regions";
        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("AC2: lifecycle PREPARING/SUPERSEDED/FAILED -> 409")
    void ac2_nonPreviewableLifecycle_409() throws Exception {
        for (LifecycleStatus status : new LifecycleStatus[] {
                LifecycleStatus.PREPARING, LifecycleStatus.SUPERSEDED, LifecycleStatus.FAILED}) {
            CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, status);
            String url = "/api/admin/city-launch/cities/" + testCityId
                    + "/revisions/" + revision.getId() + "/preview/regions";
            mockMvc.perform(get(url).header("Authorization", adminAuth()))
                    .andExpect(status().isConflict());
        }
    }

    @Test
    @DisplayName("AC2: non-admin -> 403")
    void ac2_nonAdmin_403() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        String url = "/api/admin/city-launch/cities/" + testCityId
                + "/revisions/" + revision.getId() + "/preview/regions";
        mockMvc.perform(get(url).header("Authorization", "Bearer " + BUYER_ID))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("AC2: no-token -> 401")
    void ac2_noToken_401() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        String url = "/api/admin/city-launch/cities/" + testCityId
                + "/revisions/" + revision.getId() + "/preview/regions";
        mockMvc.perform(get(url)).andExpect(status().isUnauthorized());
    }

    // =========================================================================================
    // AC3 — field mapping (HIGHEST): membership resolution, ACTIVE-only, member-bbox-union bounds
    // =========================================================================================

    @Test
    @DisplayName("AC3: membership resolves via sandboxAreaId->SandboxArea->areaKey; MERGED area excluded; "
            + "bounds = union of ACTIVE member bboxes; counts are ACTIVE-only")
    void ac3_fieldMapping_membershipResolutionAndBoundsUnion() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        SandboxArea normalArea = seedArea(revisionId, "IN|KA|ACP|Normal", "Normal", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        SandboxArea outlierArea = seedArea(revisionId, "IN|KA|ACP|Outlier", "Outlier", "ACTIVE",
                20.0, 80.0, 19.5, 79.5, 20.5, 80.5);
        SandboxArea mergedArea = seedArea(revisionId, "IN|KA|ACP|Merged", "Merged", "MERGED",
                13.05, 74.75, 13.04, 74.74, 13.06, 74.76);

        seedRegion(revisionId, "north", "North", 1);
        seedMembership(revisionId, normalArea.getId(), "north");
        seedMembership(revisionId, outlierArea.getId(), "north");
        seedMembership(revisionId, mergedArea.getId(), "north");

        String base = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview";

        MvcResult result = mockMvc.perform(get(base + "/regions").header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                // (c) ACTIVE-only counts: 2 in-scope (normal + outlier), MERGED excluded
                .andExpect(jsonPath("$.regions[0].areaCount").value(2))
                .andExpect(jsonPath("$.regions[0].listingCount").value(2))
                .andExpect(jsonPath("$.regions[0].boundsStatus").value("COMPLETE"))
                // (b) bounds union encompasses the outlier's bbox — not a hardcoded/subset bbox
                .andExpect(jsonPath("$.regions[0].bounds.maxLat").value(20.5))
                .andExpect(jsonPath("$.regions[0].bounds.maxLon").value(80.5))
                .andExpect(jsonPath("$.regions[0].bounds.minLat").value(13.00))
                .andExpect(jsonPath("$.regions[0].bounds.minLon").value(74.70))
                .andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("IN|KA|ACP|Merged");

        // (a) the MERGED area never surfaces in /areas or /markers either
        mockMvc.perform(get(base + "/areas").header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas.length()").value(2));

        mockMvc.perform(get(base + "/markers")
                        .param("areaKeys", "IN|KA|ACP|Normal", "IN|KA|ACP|Outlier", "IN|KA|ACP|Merged")
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.markers.length()").value(2))
                .andExpect(jsonPath("$.returnedElements").value(2));
    }

    @Test
    @DisplayName("AC3: E2 regionDisplayOrder is the REGION's city_regions.display_order, shared by every "
            + "group in the region — never each group's own area_groups.display_order")
    void ac3_fieldMapping_regionScopedGroups_regionDisplayOrderIsRegionsOwnOrder() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        SandboxArea areaA = seedArea(revisionId, "IN|KA|ACP|GroupA-Area", "GroupA Area", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        SandboxArea areaB = seedArea(revisionId, "IN|KA|ACP|GroupB-Area", "GroupB Area", "ACTIVE",
                13.03, 74.73, 13.02, 74.72, 13.04, 74.74);

        // Region's own display_order (3) differs from BOTH groups' own display_order (10, 20) —
        // proves the response field is sourced from the region, not the group.
        seedRegion(revisionId, "south", "South", 3);
        seedMembership(revisionId, areaA.getId(), "south");
        seedMembership(revisionId, areaB.getId(), "south");

        SandboxAreaGroup groupA = seedGroup(revisionId, "group-a", "Group A", 10);
        seedGroupMember(revisionId, groupA.getId(), areaA.getId(), 1);
        SandboxAreaGroup groupB = seedGroup(revisionId, "group-b", "Group B", 20);
        seedGroupMember(revisionId, groupB.getId(), areaB.getId(), 1);

        String base = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview";

        mockMvc.perform(get(base + "/regions/south/groups").header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups.length()").value(2))
                // Every group carries the REGION's display_order (3), not its own (10 / 20).
                .andExpect(jsonPath("$.groups[0].regionDisplayOrder").value(3))
                .andExpect(jsonPath("$.groups[1].regionDisplayOrder").value(3));
    }

    // =========================================================================================
    // AC7 — determinism + never-persisted
    // =========================================================================================

    @Test
    @DisplayName("AC7: E6 is byte-identical across calls; no preview row ever lands in property_listings")
    void ac7_deterministicAndNeverPersisted() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();
        SandboxArea area = seedArea(revisionId, "IN|KA|ACP|Det", "Det", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);

        String url = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId
                + "/preview/listings/" + area.getAreaKey();

        String first = mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String second = mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(first).isEqualTo(second);

        String base = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview";
        mockMvc.perform(get(base + "/listings").param("areaKeys", area.getAreaKey())
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk());

        Integer previewRowCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM public.property_listings WHERE id::text LIKE 'preview:%'", Integer.class);
        assertThat(previewRowCount).isZero();
    }

    // =========================================================================================
    // AC8 — interior-point exclusion / 422
    // =========================================================================================

    @Test
    @DisplayName("AC8: area with no safe interior point is excluded from E3/E4/E5 and E6 returns 422")
    void ac8_noInteriorPoint_excludedAnd422() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();
        SandboxArea noGeomArea = seedArea(revisionId, "IN|KA|ACP|NoGeom", "NoGeom", "ACTIVE",
                null, null, null, null, null, null);

        String base = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview";

        mockMvc.perform(get(base + "/areas").header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas.length()").value(0));

        mockMvc.perform(get(base + "/markers").param("areaKeys", noGeomArea.getAreaKey())
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.markers.length()").value(0));

        mockMvc.perform(get(base + "/listings").param("areaKeys", noGeomArea.getAreaKey())
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].listings.length()").value(0));

        mockMvc.perform(get(base + "/listings/" + noGeomArea.getAreaKey()).header("Authorization", adminAuth()))
                .andExpect(status().isUnprocessableEntity());
    }

    // =========================================================================================
    // AC11 — public Discover API untouched
    // =========================================================================================
    //
    // Proven by re-running the existing public-Discover Testcontainers suite unchanged; see
    // RegionSummaryPurposeIT / RegionScopedAreaGroupsControllerIT executed alongside this class
    // in the validation run (both green — public response shapes are byte-identical). Not
    // duplicated here to avoid two IT classes asserting the same public contract.

    // =========================================================================================
    // E7 — unscoped area-groups (#1911 PR3 rework): the FE's unscoped useAreaGroups hook now has
    // a preview endpoint to point at, instead of falling through to the LIVE /api/discover/area-groups.
    // =========================================================================================

    @Test
    @DisplayName("E7 happy path: production area-groups shape populated from sandbox, "
            + "areaKeys via sandboxAreaId->areaKey resolution, bounds = member bbox union")
    void e7_happyPath_populatedFromSandbox() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        SandboxArea areaA = seedArea(revisionId, "IN|KA|ACP|E7-Alpha", "E7 Alpha", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        SandboxArea areaB = seedArea(revisionId, "IN|KA|ACP|E7-Beta", "E7 Beta", "ACTIVE",
                13.05, 74.75, 13.04, 74.74, 13.06, 74.76);

        SandboxAreaGroup groupOne = seedGroup(revisionId, "e7-group-one", "E7 Group One", 1);
        seedGroupMember(revisionId, groupOne.getId(), areaA.getId(), 1);
        seedGroupMember(revisionId, groupOne.getId(), areaB.getId(), 2);

        SandboxAreaGroup groupTwo = seedGroup(revisionId, "e7-group-two", "E7 Group Two", 2);
        seedGroupMember(revisionId, groupTwo.getId(), areaA.getId(), 1);

        String url = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId
                + "/preview/area-groups";

        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.city").value("acp-it"))
                .andExpect(jsonPath("$.groups.length()").value(2))
                .andExpect(jsonPath("$.groups[0].slug").value("e7-group-one"))
                .andExpect(jsonPath("$.groups[0].areaKeys.length()").value(2))
                .andExpect(jsonPath("$.groups[0].areaKeys[0]").value("IN|KA|ACP|E7-Alpha"))
                .andExpect(jsonPath("$.groups[0].areaKeys[1]").value("IN|KA|ACP|E7-Beta"))
                // bounds union across both members' bboxes
                .andExpect(jsonPath("$.groups[0].minLat").value(13.00))
                .andExpect(jsonPath("$.groups[0].minLon").value(74.70))
                .andExpect(jsonPath("$.groups[0].maxLat").value(13.06))
                .andExpect(jsonPath("$.groups[0].maxLon").value(74.76))
                .andExpect(jsonPath("$.groups[1].slug").value("e7-group-two"))
                .andExpect(jsonPath("$.groups[1].areaKeys.length()").value(1))
                .andExpect(jsonPath("$.groups[1].areaKeys[0]").value("IN|KA|ACP|E7-Alpha"));
    }

    @Test
    @DisplayName("E7 field mapping: MERGED member excluded from areaKeys/bounds; "
            + "regionKey matches UNIFIED derivation from sandbox_city_region_memberships")
    void e7_fieldMapping_mergedExcludedAndRegionKeyDerived() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        SandboxArea activeArea = seedArea(revisionId, "IN|KA|ACP|E7-Active", "E7 Active", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        SandboxArea mergedArea = seedArea(revisionId, "IN|KA|ACP|E7-Merged", "E7 Merged", "MERGED",
                13.05, 74.75, 13.04, 74.74, 13.06, 74.76);

        seedRegion(revisionId, "north", "North", 1);
        seedMembership(revisionId, activeArea.getId(), "north");
        seedMembership(revisionId, mergedArea.getId(), "north");

        SandboxAreaGroup group = seedGroup(revisionId, "e7-mixed-group", "E7 Mixed Group", 1);
        seedGroupMember(revisionId, group.getId(), activeArea.getId(), 1);
        seedGroupMember(revisionId, group.getId(), mergedArea.getId(), 2);

        String url = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId
                + "/preview/area-groups";

        MvcResult result = mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].slug").value("e7-mixed-group"))
                .andExpect(jsonPath("$.groups[0].areaKeys.length()").value(1))
                .andExpect(jsonPath("$.groups[0].areaKeys[0]").value("IN|KA|ACP|E7-Active"))
                // UNIFIED: the only in-scope member (activeArea) is classified into "north"
                .andExpect(jsonPath("$.groups[0].regionKey").value("north"))
                .andExpect(jsonPath("$.groups[0].minLat").value(13.00))
                .andExpect(jsonPath("$.groups[0].maxLat").value(13.02))
                .andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("IN|KA|ACP|E7-Merged");
    }

    @Test
    @DisplayName("E7 viewability: wrong-city -> 404, exactly like the other endpoints")
    void e7_viewability_wrongCity_404() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        String url = "/api/admin/city-launch/cities/" + otherCityId
                + "/revisions/" + revision.getId() + "/preview/area-groups";
        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("E7 no-store: Cache-Control: no-store on the unscoped area-groups response")
    void e7_noStore() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        String url = "/api/admin/city-launch/cities/" + testCityId
                + "/revisions/" + revision.getId() + "/preview/area-groups";
        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    @DisplayName("E7 isolation: revision A's area-groups never include revision B's groups "
            + "(second revision seeded on a second city — uq_clr_inflight allows only one "
            + "in-flight/previewable revision per city at a time)")
    void e7_isolation_revisionScoped() throws Exception {
        CityLaunchRevision revisionA = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        CityLaunchRevision revisionB = seedRevision(otherCityId, PrepState.DONE, LifecycleStatus.PREPARED);

        SandboxArea areaA = seedArea(revisionA.getId(), "IN|KA|ACP|E7-RevA", "E7 RevA", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        SandboxAreaGroup groupA = seedGroup(revisionA.getId(), "e7-rev-a-group", "E7 RevA Group", 1);
        seedGroupMember(revisionA.getId(), groupA.getId(), areaA.getId(), 1);

        SandboxArea areaB = seedArea(revisionB.getId(), "IN|KA|ACP|E7-RevB", "E7 RevB", "ACTIVE",
                13.05, 74.75, 13.04, 74.74, 13.06, 74.76);
        SandboxAreaGroup groupB = seedGroup(revisionB.getId(), "e7-rev-b-group", "E7 RevB Group", 1);
        seedGroupMember(revisionB.getId(), groupB.getId(), areaB.getId(), 1);

        String urlA = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionA.getId()
                + "/preview/area-groups";

        MvcResult result = mockMvc.perform(get(urlA).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups.length()").value(1))
                .andExpect(jsonPath("$.groups[0].slug").value("e7-rev-a-group"))
                .andReturn();
        String body = result.getResponse().getContentAsString();
        assertThat(body).doesNotContain("e7-rev-b-group");
        assertThat(body).doesNotContain("IN|KA|ACP|E7-RevB");
    }

    @Test
    @DisplayName("E7 SPLIT regionKey: plurality winner (2 north vs 1 south) is returned; a MERGED "
            + "member in a third region is excluded from the group and never affects the count")
    void e7_regionKey_splitPluralityWinner() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        SandboxArea northOne = seedArea(revisionId, "IN|KA|ACP|E7-Split-N1", "E7 Split N1", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        SandboxArea northTwo = seedArea(revisionId, "IN|KA|ACP|E7-Split-N2", "E7 Split N2", "ACTIVE",
                13.03, 74.73, 13.02, 74.72, 13.04, 74.74);
        SandboxArea southOne = seedArea(revisionId, "IN|KA|ACP|E7-Split-S1", "E7 Split S1", "ACTIVE",
                13.05, 74.75, 13.04, 74.74, 13.06, 74.76);
        SandboxArea mergedEast = seedArea(revisionId, "IN|KA|ACP|E7-Split-Merged", "E7 Split Merged", "MERGED",
                13.07, 74.77, 13.06, 74.76, 13.08, 74.78);

        seedRegion(revisionId, "north", "North", 1);
        seedRegion(revisionId, "south", "South", 2);
        seedRegion(revisionId, "east", "East", 3);
        seedMembership(revisionId, northOne.getId(), "north");
        seedMembership(revisionId, northTwo.getId(), "north");
        seedMembership(revisionId, southOne.getId(), "south");
        // MERGED area is out-of-scope; even though it carries a membership row, it must never
        // reach deriveRegionKey's memberRegions (which only sees in-scope ACTIVE members).
        seedMembership(revisionId, mergedEast.getId(), "east");

        SandboxAreaGroup group = seedGroup(revisionId, "e7-split-group", "E7 Split Group", 1);
        seedGroupMember(revisionId, group.getId(), northOne.getId(), 1);
        seedGroupMember(revisionId, group.getId(), northTwo.getId(), 2);
        seedGroupMember(revisionId, group.getId(), southOne.getId(), 3);
        seedGroupMember(revisionId, group.getId(), mergedEast.getId(), 4);

        String url = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId
                + "/preview/area-groups";

        // SPLIT: north has 2 in-scope members vs south's 1 -> plurality winner "north" (count
        // wins outright; the tie-break comparator is never consulted). "east" (the MERGED area's
        // region) contributes zero in-scope members and cannot win or influence the outcome.
        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].slug").value("e7-split-group"))
                .andExpect(jsonPath("$.groups[0].areaKeys.length()").value(3))
                .andExpect(jsonPath("$.groups[0].regionKey").value("north"));
    }

    @Test
    @DisplayName("E7 SPLIT regionKey tie-break: equal member counts (2 north / 2 south) resolve to "
            + "the region with the LOWER sandbox_city_regions.display_order, not natural key order")
    void e7_regionKey_splitTieBreakByRegionDisplayOrder() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        SandboxArea northOne = seedArea(revisionId, "IN|KA|ACP|E7-Tie-N1", "E7 Tie N1", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        SandboxArea northTwo = seedArea(revisionId, "IN|KA|ACP|E7-Tie-N2", "E7 Tie N2", "ACTIVE",
                13.03, 74.73, 13.02, 74.72, 13.04, 74.74);
        SandboxArea southOne = seedArea(revisionId, "IN|KA|ACP|E7-Tie-S1", "E7 Tie S1", "ACTIVE",
                13.05, 74.75, 13.04, 74.74, 13.06, 74.76);
        SandboxArea southTwo = seedArea(revisionId, "IN|KA|ACP|E7-Tie-S2", "E7 Tie S2", "ACTIVE",
                13.07, 74.77, 13.06, 74.76, 13.08, 74.78);

        // "south" is given the LOWER display_order (1) even though "north" < "south" naturally --
        // proves the winner is chosen by display_order ASC before falling back to region-key
        // natural order, exactly matching AreaGroupsService.deriveRegionKey's comparator.
        seedRegion(revisionId, "south", "South", 1);
        seedRegion(revisionId, "north", "North", 2);
        seedMembership(revisionId, northOne.getId(), "north");
        seedMembership(revisionId, northTwo.getId(), "north");
        seedMembership(revisionId, southOne.getId(), "south");
        seedMembership(revisionId, southTwo.getId(), "south");

        SandboxAreaGroup group = seedGroup(revisionId, "e7-tie-group", "E7 Tie Group", 1);
        seedGroupMember(revisionId, group.getId(), northOne.getId(), 1);
        seedGroupMember(revisionId, group.getId(), northTwo.getId(), 2);
        seedGroupMember(revisionId, group.getId(), southOne.getId(), 3);
        seedGroupMember(revisionId, group.getId(), southTwo.getId(), 4);

        String url = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId
                + "/preview/area-groups";

        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].slug").value("e7-tie-group"))
                .andExpect(jsonPath("$.groups[0].areaKeys.length()").value(4))
                .andExpect(jsonPath("$.groups[0].regionKey").value("south"));
    }

    // =========================================================================================
    // E8 — navigation resolve/counts
    // =========================================================================================

    @Test
    @DisplayName("E8: resolve fallback to CITY_ROOT instead of stale ladder; counts returns schoolTotal=0")
    void e8_resolveAndCounts() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        SandboxArea area = seedArea(revisionId, "IN|KA|ACP|Nav1", "Nav1", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        seedRegion(revisionId, "north", "North", 1);
        seedMembership(revisionId, area.getId(), "north");

        // Seed direction -> area (direction has no parent)
        var dir = seedNavigationNode(revisionId, "d:north", "DIRECTION", null, "north", null, 1, 1, java.util.List.of(), java.util.List.of("IN|KA|ACP|Nav1"));
        var leaf = seedNavigationNode(revisionId, "a:IN|KA|ACP|Nav1", "AREA", dir.getId(), "north", "IN|KA|ACP|Nav1", 1, 2, java.util.List.of("d:north"), java.util.List.of("IN|KA|ACP|Nav1"));

        String base = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview";

        // 1. Resolve exact
        mockMvc.perform(get(base + "/navigation/resolve?node=d:north").header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resolution").value("EXACT"))
                .andExpect(jsonPath("$.node.nodeKey").value("d:north"));

        // 2. Resolve missing (stale) falls back to root
        mockMvc.perform(get(base + "/navigation/resolve?node=a:missing").header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resolution").value("CITY_ROOT"))
                .andExpect(jsonPath("$.node.nodeType").value("ROOT"));

        // 3. Counts returns 0 for schools, correct count for listings
        mockMvc.perform(get(base + "/navigation/d:north/counts").header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(1))
                .andExpect(jsonPath("$.schoolCount").value(0)) // Rule 1: No simulated schools in preview
                .andExpect(jsonPath("$.areaSchoolCounts").isEmpty())
                .andExpect(jsonPath("$.areaCounts.['IN|KA|ACP|Nav1']").value(1));
    }
}
