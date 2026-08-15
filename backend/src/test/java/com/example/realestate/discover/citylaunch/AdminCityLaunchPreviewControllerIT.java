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
    @Autowired private SandboxAgriDestinationClassificationRepository sandboxAgriDestinationClassificationRepository;

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
        // #2151 PR B Track 2: E11 tests insert directly into production property_listings / areas /
        // agri_destination_classification — clean those up too (harmless no-op for every other test
        // in this class, which never touches them).
        jdbc.update("DELETE FROM public.property_listings WHERE area_key IN "
                + "(SELECT area_key FROM public.areas WHERE city_id IN (?, ?))", testCityId, otherCityId);
        jdbc.update("DELETE FROM public.agri_destination_classification WHERE city_id IN (?, ?)",
                testCityId, otherCityId);
        jdbc.update("DELETE FROM public.areas WHERE city_id IN (?, ?)", testCityId, otherCityId);
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

    private SandboxAgriDestinationClassification seedAgriRow(
            long revisionId, String areaKey, double originLat, double originLon,
            double distanceKm, double bearingDeg, String directionKey, String distanceBandKey) {
        return sandboxAgriDestinationClassificationRepository.save(new SandboxAgriDestinationClassification(
                revisionId, areaKey, originLat, originLon, distanceKm, bearingDeg,
                directionKey, distanceBandKey, "agri-destination-classification-v1", Instant.now()));
    }

    // ── E11 seeding helpers: production tables (#2151 PR B Track 2) ─────────────────────────────

    /** Inserts a PRODUCTION {@code public.areas} row — needed for the LIVE listings city-subselect
     *  join (DiscoverListingPredicateBuilder) and, for the LEFT JOIN display-name case, for the
     *  sandbox geometry query to resolve a display name at all. */
    private void insertProductionArea(String areaKey, int cityId, double lat, double lon) {
        jdbc.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon, lifecycle_status) "
                        + "VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
                areaKey, cityId, areaKey, lat, lon);
    }

    /** Inserts a PRODUCTION {@code agri_destination_classification} row — used to prove the preview
     *  endpoints never fall back to (or leak) production classification data. */
    private void insertProductionAgriRow(int cityId, String areaKey, double distanceKm, double bearingDeg,
                                          String directionKey, String distanceBandKey) {
        jdbc.update(
                "INSERT INTO public.agri_destination_classification "
                        + "(city_id, area_key, origin_lat, origin_lon, distance_km, bearing_deg, "
                        + " direction_key, distance_band_key, generator_version, generated_at) "
                        + "VALUES (?, ?, 13.0, 74.7, ?, ?, ?, ?, 'test-generator-v1', now())",
                cityId, areaKey, distanceKm, bearingDeg, directionKey, distanceBandKey);
    }

    /** Inserts a LIVE {@code property_listings} row — the join every preview parcel-count/
     *  map-listings read still goes through (revision preview scopes GEOGRAPHY, not inventory). */
    private String insertLiveAgriListing(String areaKey, String listingPurpose, long pricePaise) {
        UUID id = UUID.randomUUID();
        java.time.OffsetDateTime now = java.time.OffsetDateTime.now();
        jdbc.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, land_area, land_area_unit, listing_purpose, price_paise, "
                        + " latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'agricultural_land', 3, 'acre', "
                        + " ?, ?, ?, ?, ?, ?)",
                id, areaKey, listingPurpose, pricePaise, 13.01, 74.71, now, now);
        return id.toString();
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
                .andExpect(jsonPath("$.areaSchoolCounts").isEmpty())
                .andExpect(jsonPath("$.areaCounts.['IN|KA|ACP|Nav1']").value(1));
    }

    @Test
    @DisplayName("E8 ordering: preview graph builder correctly handles depth-ascending sort even when DB natural order is shuffled")
    void e8_ordering_previewGraphBuilderHandlesDepthSort() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        SandboxArea area = seedArea(revisionId, "IN|KA|ACP|NavOrd", "NavOrd", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        seedRegion(revisionId, "north", "North", 1);
        seedMembership(revisionId, area.getId(), "north");

        var dir = seedNavigationNode(revisionId, "d:north", "DIRECTION", null, "north", null, 1, 1, java.util.List.of(), java.util.List.of("IN|KA|ACP|NavOrd"));
        var local = seedNavigationNode(revisionId, "l:north", "CLUSTER", dir.getId(), "north", null, 1, 2, java.util.List.of("d:north"), java.util.List.of("IN|KA|ACP|NavOrd"));
        var leaf = seedNavigationNode(revisionId, "a:IN|KA|ACP|NavOrd", "AREA", local.getId(), "north", "IN|KA|ACP|NavOrd", 1, 3, java.util.List.of("d:north", "l:north"), java.util.List.of("IN|KA|ACP|NavOrd"));

        // By updating the parent node, Postgres moves it to the end of the heap page.
        // A query without ORDER BY will now return local -> leaf -> dir (child before parent),
        // which would cause NavigationGraph.build to throw an exception if not properly ordered.
        jdbc.update("UPDATE public.sandbox_navigation_nodes SET generated_at = NOW() WHERE id = ?", dir.getId());

        String base = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview";

        mockMvc.perform(get(base + "/navigation/resolve?node=a:IN|KA|ACP|NavOrd").header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resolution").value("EXACT"));
    }

    // =========================================================================================
    // E9 — GET .../preview/agri (#2151 PR A correction pass finding #4: previously ZERO coverage)
    // =========================================================================================

    @Test
    @DisplayName("E9 happy path: admin token -> 200; rowCount/directionDistribution/"
            + "distanceBandDistribution/origin all match the seeded sandbox rows; no-store")
    void e9_happyPath_matchesSeededRows() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        seedAgriRow(revisionId, "IN|KA|ACP|Agri-N", 13.0, 74.7, 5.6, 0.0, "N", "0_10");
        seedAgriRow(revisionId, "IN|KA|ACP|Agri-E", 13.0, 74.7, 14.6, 90.0, "E", "10_25");
        seedAgriRow(revisionId, "IN|KA|ACP|Agri-E2", 13.0, 74.7, 16.0, 91.0, "E", "10_25");

        String url = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview/agri";

        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.rowCount").value(3))
                .andExpect(jsonPath("$.directionDistribution.N").value(1))
                .andExpect(jsonPath("$.directionDistribution.E").value(2))
                .andExpect(jsonPath("$.distanceBandDistribution.['0_10']").value(1))
                .andExpect(jsonPath("$.distanceBandDistribution.['10_25']").value(2))
                .andExpect(jsonPath("$.areasWithMissingCoordinates").value(0))
                .andExpect(jsonPath("$.originLat").value(13.0))
                .andExpect(jsonPath("$.originLon").value(74.7));
    }

    @Test
    @DisplayName("E9: areasWithMissingCoordinates counts this revision's ACTIVE sandbox_areas rows "
            + "with a NULL geo_center_lat/lon, independent of the Agri row set")
    void e9_areasWithMissingCoordinates_countsSandboxAreasWithNullCoordinates() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        seedArea(revisionId, "IN|KA|ACP|Agri-HasCoords", "HasCoords", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        seedArea(revisionId, "IN|KA|ACP|Agri-NoCoords", "NoCoords", "ACTIVE",
                null, null, null, null, null, null);
        seedAgriRow(revisionId, "IN|KA|ACP|Agri-HasCoords", 13.0, 74.7, 1.1, 0.0, "N", "0_10");

        String url = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview/agri";

        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rowCount").value(1))
                .andExpect(jsonPath("$.areasWithMissingCoordinates").value(1));
    }

    @Test
    @DisplayName("E9 auth: non-admin -> 403, no token -> 401")
    void e9_auth_nonAdminForbidden_noTokenUnauthorized() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        String url = "/api/admin/city-launch/cities/" + testCityId
                + "/revisions/" + revision.getId() + "/preview/agri";

        mockMvc.perform(get(url).header("Authorization", "Bearer " + BUYER_ID))
                .andExpect(status().isForbidden());
        mockMvc.perform(get(url)).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("E9 IDOR guard: a revision belonging to a DIFFERENT city -> 404")
    void e9_wrongCity_404() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        String url = "/api/admin/city-launch/cities/" + otherCityId
                + "/revisions/" + revision.getId() + "/preview/agri";
        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("E9: prep_state != DONE -> 409")
    void e9_prepStateNotDone_409() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.RUNNING, LifecycleStatus.PREPARING);
        String url = "/api/admin/city-launch/cities/" + testCityId
                + "/revisions/" + revision.getId() + "/preview/agri";
        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("E9: lifecycle PREPARING/SUPERSEDED/FAILED -> 409")
    void e9_nonPreviewableLifecycle_409() throws Exception {
        for (LifecycleStatus status : new LifecycleStatus[] {
                LifecycleStatus.PREPARING, LifecycleStatus.SUPERSEDED, LifecycleStatus.FAILED}) {
            CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, status);
            String url = "/api/admin/city-launch/cities/" + testCityId
                    + "/revisions/" + revision.getId() + "/preview/agri";
            mockMvc.perform(get(url).header("Authorization", adminAuth()))
                    .andExpect(status().isConflict());
        }
    }

    @Test
    @DisplayName("E10: preview/identity returns the revision's real owning-city slug/name (#2151 Track 1)")
    void e10_identity_returnsCitySlugAndName() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        String url = "/api/admin/city-launch/cities/" + testCityId
                + "/revisions/" + revision.getId() + "/preview/identity";

        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.cityId").value(testCityId))
                .andExpect(jsonPath("$.citySlug").value("acp-it"))
                .andExpect(jsonPath("$.cityName").value("ACP IT Test City"));
    }

    @Test
    @DisplayName("E10 IDOR guard: a revision belonging to a DIFFERENT city -> 404")
    void e10_wrongCity_404() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        String url = "/api/admin/city-launch/cities/" + otherCityId
                + "/revisions/" + revision.getId() + "/preview/identity";
        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("E10: lifecycle PREPARING/SUPERSEDED/FAILED -> 409, no identity leaked for a "
            + "non-previewable revision")
    void e10_nonPreviewableLifecycle_409() throws Exception {
        for (LifecycleStatus status : new LifecycleStatus[] {
                LifecycleStatus.PREPARING, LifecycleStatus.SUPERSEDED, LifecycleStatus.FAILED}) {
            CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, status);
            String url = "/api/admin/city-launch/cities/" + testCityId
                    + "/revisions/" + revision.getId() + "/preview/identity";
            mockMvc.perform(get(url).header("Authorization", adminAuth()))
                    .andExpect(status().isConflict());
        }
    }

    @Test
    @DisplayName("E10 auth: non-admin -> 403, no token -> 401")
    void e10_auth_nonAdminForbidden_noTokenUnauthorized() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        String url = "/api/admin/city-launch/cities/" + testCityId
                + "/revisions/" + revision.getId() + "/preview/identity";

        mockMvc.perform(get(url).header("Authorization", "Bearer " + BUYER_ID))
                .andExpect(status().isForbidden());
        mockMvc.perform(get(url)).andExpect(status().isUnauthorized());
    }

    // =========================================================================================
    // E11 — GET .../preview/regional-area-groups, .../preview/agri-destinations,
    //       .../preview/agri-map-listings (#2151 PR B Track 2)
    // =========================================================================================

    @Test
    @DisplayName("E11 regional-area-groups: reflects SANDBOX classification, never production "
            + "(core no-fallback proof)")
    void e11_regionalAreaGroups_reflectsSandboxNotProduction() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        String sandboxAreaKey = "IN|KA|ACP|Agri-Sandbox";
        String productionOnlyAreaKey = "IN|KA|ACP|Agri-ProdOnly";
        insertProductionArea(sandboxAreaKey, testCityId, 13.01, 74.71);
        insertProductionArea(productionOnlyAreaKey, testCityId, 13.5, 75.2);
        insertLiveAgriListing(sandboxAreaKey, "sale", 5_000_000L);
        insertLiveAgriListing(productionOnlyAreaKey, "sale", 6_000_000L);

        // Sandbox: N corridor, 5km. Production (DIFFERENT area/direction/distance): S corridor, 50km.
        seedAgriRow(revisionId, sandboxAreaKey, 13.0, 74.7, 5.0, 0.0, "N", "0_10");
        insertProductionAgriRow(testCityId, productionOnlyAreaKey, 50.0, 180.0, "S", "25_50");

        String url = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId
                + "/preview/regional-area-groups";

        MvcResult result = mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.city").value("acp-it"))
                .andExpect(jsonPath("$.groups.length()").value(1))
                .andExpect(jsonPath("$.groups[0].directionCode").value("N"))
                .andReturn();
        String body = result.getResponse().getContentAsString();
        assertThat(body).doesNotContain("Agri-ProdOnly");
    }

    @Test
    @DisplayName("E11 agri-destinations: reflects SANDBOX classification, never production")
    void e11_agriDestinations_reflectsSandboxNotProduction() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        String sandboxAreaKey = "IN|KA|ACP|Agri-Dest-Sandbox";
        String productionOnlyAreaKey = "IN|KA|ACP|Agri-Dest-ProdOnly";
        insertProductionArea(sandboxAreaKey, testCityId, 13.02, 74.72);
        insertProductionArea(productionOnlyAreaKey, testCityId, 13.6, 75.3);

        seedAgriRow(revisionId, sandboxAreaKey, 13.0, 74.7, 6.5, 45.0, "NE", "0_10");
        insertProductionAgriRow(testCityId, productionOnlyAreaKey, 60.0, 200.0, "SW", "50_up");

        String url = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId
                + "/preview/agri-destinations";

        MvcResult result = mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.city").value("acp-it"))
                .andExpect(jsonPath("$.destinations.length()").value(1))
                .andExpect(jsonPath("$.destinations[0].areaKey").value(sandboxAreaKey))
                .andExpect(jsonPath("$.destinations[0].direction").value("NE"))
                .andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("Agri-Dest-ProdOnly");
    }

    /** Finds the {@code $.areas[]} entry with the given {@code areaKey} (order is not asserted). */
    private static com.fasterxml.jackson.databind.JsonNode findAreaByKey(
            com.fasterxml.jackson.databind.JsonNode areasJson, String areaKey) {
        for (com.fasterxml.jackson.databind.JsonNode node : areasJson) {
            if (areaKey.equals(node.get("areaKey").asText())) {
                return node;
            }
        }
        throw new AssertionError("No area with areaKey=" + areaKey + " in response: " + areasJson);
    }

    // =========================================================================================
    // #2171 — /preview/areas?propertyType=agricultural_land honors propertyType, reusing the
    // SAME AgriDestinationPort-backed count/acreage source as /preview/regional-area-groups.
    // =========================================================================================

    @Test
    @DisplayName("#2171: /preview/areas?propertyType=agricultural_land returns the REAL per-area "
            + "agri parcel count (not the generic unfiltered listingCount=1), matching what "
            + "/preview/regional-area-groups reports for the same area/revision")
    void e12_areas_agriPropertyType_realParcelCountMatchesRegionalAreaGroups() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        String agriAreaKey = "IN|KA|ACP|Agri-Areas-Two-Parcels";
        String nonAgriAreaKey = "IN|KA|ACP|Agri-Areas-Zero-Parcels";

        // Both areas are in-scope sandbox areas (needed for /preview/areas' graph).
        seedArea(revisionId, agriAreaKey, "Agri Two Parcels", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        seedArea(revisionId, nonAgriAreaKey, "Agri Zero Parcels", "ACTIVE",
                13.05, 74.75, 13.04, 74.74, 13.06, 74.76);

        // Only agriAreaKey has a sandbox Agri destination row + LIVE agri parcels; nonAgriAreaKey
        // has neither, so its real parcel count is 0 — never the fabricated 1 the pre-#2171 code
        // returned for every area regardless of type.
        insertProductionArea(agriAreaKey, testCityId, 13.01, 74.71);
        insertLiveAgriListing(agriAreaKey, "sale", 5_000_000L);
        insertLiveAgriListing(agriAreaKey, "sale", 6_000_000L);
        seedAgriRow(revisionId, agriAreaKey, 13.0, 74.7, 5.0, 0.0, "N", "0_10");

        String base = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview";

        MvcResult areasResult = mockMvc.perform(get(base + "/areas")
                        .param("propertyType", "agricultural_land")
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andReturn();
        com.fasterxml.jackson.databind.JsonNode areasJson =
                objectMapper.readTree(areasResult.getResponse().getContentAsString()).get("areas");
        com.fasterxml.jackson.databind.JsonNode agriAreaNode = findAreaByKey(areasJson, agriAreaKey);
        com.fasterxml.jackson.databind.JsonNode nonAgriAreaNode = findAreaByKey(areasJson, nonAgriAreaKey);
        assertThat(agriAreaNode.get("listingCount").asLong()).isEqualTo(2L);
        assertThat(agriAreaNode.get("agriAcreage").asDouble()).isGreaterThan(0.0);
        assertThat(nonAgriAreaNode.get("listingCount").asLong())
                .as("real (zero) agri parcel count, never the fabricated generic 1")
                .isEqualTo(0L);
        assertThat(nonAgriAreaNode.has("agriAcreage"))
                .as("no parseable acreage for an area with zero matching parcels — omitted (NON_NULL), never fabricated")
                .isFalse();

        // Cross-check: the SAME revision's /preview/regional-area-groups (the panel already proven
        // correct in #2151/#2167) reports the identical parcel count for the identical area — the
        // map bubble and the right panel can never diverge because both now read the same source.
        mockMvc.perform(get(base + "/regional-area-groups").header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].directionCode").value("N"))
                .andExpect(jsonPath("$.groups[0].availableMaxDistances[0].listingCount").value(2))
                .andExpect(jsonPath("$.groups[0].availableMaxDistances[0].areaKeys[0]").value(agriAreaKey));
    }

    @Test
    @DisplayName("#2174: /preview/areas?propertyType=agricultural_land&purpose=rent|sale returns "
            + "PURPOSE-SCOPED per-area parcel counts that EXACTLY match what "
            + "/preview/regional-area-groups?listingPurpose=rent|sale reports for the same area — "
            + "the actual bubble<->panel parity the Buy/Rent toggle must preserve")
    void e12_areas_purposeScoped_matchesRegionalAreaGroupsForSamePurpose() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        String agriAreaKey = "IN|KA|ACP|Agri-Areas-MixedPurpose";
        seedArea(revisionId, agriAreaKey, "Agri Mixed Purpose", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        insertProductionArea(agriAreaKey, testCityId, 13.01, 74.71);

        // Mixed sale/rent parcels in the SAME area — this is the exact fixture shape the reviewer
        // named: without purpose scoping, the bubble (sums ALL 3) and a purpose-scoped panel (sums
        // only the matching purpose) disagree.
        insertLiveAgriListing(agriAreaKey, "sale", 5_000_000L);
        insertLiveAgriListing(agriAreaKey, "sale", 6_000_000L);
        insertLiveAgriListing(agriAreaKey, "rent", 20_000L);
        seedAgriRow(revisionId, agriAreaKey, 13.0, 74.7, 5.0, 0.0, "N", "0_10");

        String base = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview";

        // purpose=rent -> bubble must show exactly 1 (the single rent parcel), matching the panel.
        MvcResult rentAreasResult = mockMvc.perform(get(base + "/areas")
                        .param("propertyType", "agricultural_land")
                        .param("purpose", "rent")
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andReturn();
        com.fasterxml.jackson.databind.JsonNode rentAreasJson =
                objectMapper.readTree(rentAreasResult.getResponse().getContentAsString()).get("areas");
        assertThat(findAreaByKey(rentAreasJson, agriAreaKey).get("listingCount").asLong()).isEqualTo(1L);

        mockMvc.perform(get(base + "/regional-area-groups")
                        .param("listingPurpose", "rent")
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].availableMaxDistances[0].listingCount").value(1))
                .andExpect(jsonPath("$.groups[0].availableMaxDistances[0].areaKeys[0]").value(agriAreaKey));

        // purpose=sale -> bubble must show exactly 2 (the two sale parcels), matching the panel —
        // and it must DIFFER from the rent-scoped result above, proving the filter is real, not a
        // no-op that happens to return the same number both times.
        MvcResult saleAreasResult = mockMvc.perform(get(base + "/areas")
                        .param("propertyType", "agricultural_land")
                        .param("purpose", "sale")
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andReturn();
        com.fasterxml.jackson.databind.JsonNode saleAreasJson =
                objectMapper.readTree(saleAreasResult.getResponse().getContentAsString()).get("areas");
        long saleCount = findAreaByKey(saleAreasJson, agriAreaKey).get("listingCount").asLong();
        assertThat(saleCount).isEqualTo(2L);
        assertThat(saleCount).as("sale-scoped count must differ from rent-scoped count").isNotEqualTo(1L);

        mockMvc.perform(get(base + "/regional-area-groups")
                        .param("listingPurpose", "sale")
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].availableMaxDistances[0].listingCount").value(2))
                .andExpect(jsonPath("$.groups[0].availableMaxDistances[0].areaKeys[0]").value(agriAreaKey));

        // No purpose (default/blended) -> bubble must show all 3, matching the unscoped panel.
        MvcResult blendedAreasResult = mockMvc.perform(get(base + "/areas")
                        .param("propertyType", "agricultural_land")
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andReturn();
        com.fasterxml.jackson.databind.JsonNode blendedAreasJson =
                objectMapper.readTree(blendedAreasResult.getResponse().getContentAsString()).get("areas");
        assertThat(findAreaByKey(blendedAreasJson, agriAreaKey).get("listingCount").asLong()).isEqualTo(3L);

        mockMvc.perform(get(base + "/regional-area-groups")
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].availableMaxDistances[0].listingCount").value(3));
    }

    @Test
    @DisplayName("#2171: /preview/areas with NO propertyType is completely unchanged — generic "
            + "unfiltered listingCount=1 per in-scope area, exactly as before")
    void e12_areas_noPropertyType_unchangedGenericListingCount() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        String areaKey = "IN|KA|ACP|Agri-Areas-Blended";
        seedArea(revisionId, areaKey, "Blended Area", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        // Even with real Agri parcels present, the blended (no propertyType) path must stay
        // byte-identical to pre-#2171 behaviour: generic listingCount=1, no agriAcreage.
        insertProductionArea(areaKey, testCityId, 13.01, 74.71);
        insertLiveAgriListing(areaKey, "sale", 5_000_000L);
        insertLiveAgriListing(areaKey, "sale", 6_000_000L);
        seedAgriRow(revisionId, areaKey, 13.0, 74.7, 5.0, 0.0, "N", "0_10");

        String base = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview";

        mockMvc.perform(get(base + "/areas").header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].listingCount").value(1))
                .andExpect(jsonPath("$.areas[0].agriAcreage").doesNotExist());
    }

    @Test
    @DisplayName("#2171: propertyType=agricultural_land on a revision with ZERO sandbox agri rows "
            + "fails closed with 503 AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION — composes onto "
            + "the SAME fail-closed contract as /preview/regional-area-groups, never silent zeros")
    void e12_areas_agriPropertyType_zeroSandboxRows_503() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();
        seedArea(revisionId, "IN|KA|ACP|Agri-Areas-NoAgriRows", "No Agri Rows", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        String base = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview";

        mockMvc.perform(get(base + "/areas").param("propertyType", "agricultural_land")
                        .header("Authorization", adminAuth()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION"));
    }

    @Test
    @DisplayName("#2171: propertyType is threaded independently per request — a residential "
            + "(non-agri) propertyType value behaves like absent, generic listingCount=1")
    void e12_areas_nonAgriPropertyType_behavesLikeAbsent() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();
        seedArea(revisionId, "IN|KA|ACP|Agri-Areas-Residential", "Residential Area", "ACTIVE",
                13.01, 74.71, 13.00, 74.70, 13.02, 74.72);
        String base = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview";

        mockMvc.perform(get(base + "/areas").param("propertyType", "residential")
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].listingCount").value(1))
                .andExpect(jsonPath("$.areas[0].agriAcreage").doesNotExist());
    }

    @Test
    @DisplayName("E11 agri-map-listings: exact coords/price (admin, never anonymised); "
            + "parcels are read from LIVE property_listings scoped by the requested areaKey")
    void e11_agriMapListings_exactCoordsAndPrice() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        String areaKey = "IN|KA|ACP|Agri-Map-Sandbox";
        insertProductionArea(areaKey, testCityId, 13.01, 74.71);
        seedAgriRow(revisionId, areaKey, 13.0, 74.7, 4.0, 10.0, "N", "0_10");
        insertLiveAgriListing(areaKey, "sale", 7_500_000L);

        String url = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId
                + "/preview/agri-map-listings";

        mockMvc.perform(get(url).param("areaKey", areaKey).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.city").value("acp-it"))
                .andExpect(jsonPath("$.listings.length()").value(1))
                .andExpect(jsonPath("$.listings[0].areaKey").value(areaKey))
                .andExpect(jsonPath("$.listings[0].pricePaise").value(7_500_000))
                .andExpect(jsonPath("$.listings[0].latitude").value(13.01))
                .andExpect(jsonPath("$.listings[0].longitude").value(74.71));
    }

    @Test
    @DisplayName("E11 IDOR-scope guard (#2167 review finding): a live area with NO sandbox row for "
            + "THIS revision is rejected, not silently served, even though the revision has an "
            + "UNRELATED sandbox row for a different area (proves the fix validates areaKey<->"
            + "revisionId membership, not merely 'revision has >=1 sandbox row')")
    void e11_agriMapListings_areaKeyNotInThisRevisionSandbox_isRejectedNotServed() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        // In-scope area: sandbox row for THIS revision + a live listing.
        String inScopeAreaKey = "IN|KA|ACP|Agri-Scope-InScope";
        insertProductionArea(inScopeAreaKey, testCityId, 13.01, 74.71);
        seedAgriRow(revisionId, inScopeAreaKey, 13.0, 74.7, 4.0, 10.0, "N", "0_10");
        insertLiveAgriListing(inScopeAreaKey, "sale", 7_500_000L);

        // Out-of-scope area: a live listing exists, but NO sandbox_agri_destination_classification
        // row for THIS revision — e.g. it belongs to an unrelated corridor. The revision above is
        // NOT zero-row (it has inScopeAreaKey's row), so failClosedIfNoSandboxAgriRows alone would
        // let this through pre-fix.
        String outOfScopeAreaKey = "IN|KA|ACP|Agri-Scope-OutOfScope";
        insertProductionArea(outOfScopeAreaKey, testCityId, 13.5, 75.2);
        insertLiveAgriListing(outOfScopeAreaKey, "sale", 9_000_000L);

        String url = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId
                + "/preview/agri-map-listings";

        // In-scope areaKey: served normally.
        mockMvc.perform(get(url).param("areaKey", inScopeAreaKey).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.listings.length()").value(1))
                .andExpect(jsonPath("$.listings[0].areaKey").value(inScopeAreaKey));

        // Out-of-scope areaKey: fails closed — NOT a 200 with the live listing, NOT a silent empty 200.
        mockMvc.perform(get(url).param("areaKey", outOfScopeAreaKey).header("Authorization", adminAuth()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION"));
    }

    @Test
    @DisplayName("E11: revision with ZERO sandbox agri rows -> 503 "
            + "AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION on all three endpoints")
    void e11_zeroSandboxRows_allThreeReturn503() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();
        String base = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId + "/preview";

        mockMvc.perform(get(base + "/regional-area-groups").header("Authorization", adminAuth()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION"));

        mockMvc.perform(get(base + "/agri-destinations").header("Authorization", adminAuth()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION"));

        mockMvc.perform(get(base + "/agri-map-listings")
                        .param("areaKey", "IN|KA|ACP|WhateverArea")
                        .header("Authorization", adminAuth()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION"));
    }

    @Test
    @DisplayName("E11: non-previewable lifecycle -> 409 BEFORE any agri-specific logic runs, "
            + "same viewability guard as every other preview endpoint")
    void e11_nonPreviewableLifecycle_409BeforeAgriLogic() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.RUNNING, LifecycleStatus.PREPARING);
        String base = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revision.getId() + "/preview";

        mockMvc.perform(get(base + "/regional-area-groups").header("Authorization", adminAuth()))
                .andExpect(status().isConflict());
        mockMvc.perform(get(base + "/agri-destinations").header("Authorization", adminAuth()))
                .andExpect(status().isConflict());
        mockMvc.perform(get(base + "/agri-map-listings").param("areaKey", "IN|KA|ACP|X")
                        .header("Authorization", adminAuth()))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("E11: wrong-city -> 404 (IDOR guard), same as every other preview endpoint")
    void e11_wrongCity_404() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        String url = "/api/admin/city-launch/cities/" + otherCityId
                + "/revisions/" + revision.getId() + "/preview/regional-area-groups";
        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("E11 auth: non-admin -> 403, no token -> 401")
    void e11_auth_nonAdminForbidden_noTokenUnauthorized() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        String url = "/api/admin/city-launch/cities/" + testCityId
                + "/revisions/" + revision.getId() + "/preview/regional-area-groups";

        mockMvc.perform(get(url).header("Authorization", "Bearer " + BUYER_ID))
                .andExpect(status().isForbidden());
        mockMvc.perform(get(url)).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("E11 direction-label degradation: no city_regional_direction_labels row -> corridors "
            + "still succeed with the raw direction code, not a 500")
    void e11_directionLabelDegradation_rawCodeNotCrash() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        // "acp-it" has no city_regional_direction_labels row seeded anywhere in this test class —
        // exercising exactly the never-launched-city case.
        String areaKey = "IN|KA|ACP|Agri-NoLabel";
        insertProductionArea(areaKey, testCityId, 13.01, 74.71);
        insertLiveAgriListing(areaKey, "sale", 4_000_000L);
        seedAgriRow(revisionId, areaKey, 13.0, 74.7, 3.0, 270.0, "W", "0_10");

        String url = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId
                + "/preview/regional-area-groups";

        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].directionCode").value("W"))
                .andExpect(jsonPath("$.groups[0].groupName").value("W corridor"));
    }

    @Test
    @DisplayName("E11 LEFT JOIN graceful handling: sandbox area with no matching public.areas row "
            + "still appears (display name falls back to the area key), not a crash/500")
    void e11_sandboxAreaWithNoMatchingPublicArea_gracefulNotCrash() throws Exception {
        CityLaunchRevision revision = seedRevision(testCityId, PrepState.DONE, LifecycleStatus.PREPARED);
        long revisionId = revision.getId();

        // Deliberately NO insertProductionArea call — this area_key has never been promoted into
        // public.areas (the normal state for a never-launched city, per V125's own table comment).
        String unpromotedAreaKey = "IN|KA|ACP|Agri-NotPromoted";
        seedAgriRow(revisionId, unpromotedAreaKey, 13.0, 74.7, 7.0, 135.0, "SE", "0_10");

        String url = "/api/admin/city-launch/cities/" + testCityId + "/revisions/" + revisionId
                + "/preview/agri-destinations";

        mockMvc.perform(get(url).header("Authorization", adminAuth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.destinations.length()").value(1))
                .andExpect(jsonPath("$.destinations[0].areaKey").value(unpromotedAreaKey))
                // display name gracefully falls back to the area key itself (LEFT JOIN, no crash)
                .andExpect(jsonPath("$.destinations[0].displayName").value(unpromotedAreaKey))
                // parcel count is 0 (no property_listings row for this unpromoted area) — not null,
                // not an error
                .andExpect(jsonPath("$.destinations[0].parcelCount").value(0));
    }
}
