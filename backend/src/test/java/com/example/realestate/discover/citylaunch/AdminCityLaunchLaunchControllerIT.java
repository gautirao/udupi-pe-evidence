package com.example.realestate.discover.citylaunch;

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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Testcontainers integration test (real Postgres, full Flyway history, real Spring Security filter
 * chain) proving the #1911 PR5 guarded Launch endpoint over HTTP. Mirrors {@link
 * AdminCityLaunchValidationControllerIT}'s JWT/role-seeding MockMvc harness. Drives the REAL
 * validation-checklist toggle/mark-validated endpoints (via {@code mockMvc}) so a genuinely
 * VALIDATED revision exists before exercising launch — the checksum-mismatch test then tampers a
 * sandbox row directly to force AC5's reject path.
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
        "AI_API_KEY=test-dummy-not-used-in-city-launch-it",
        "spring.task.scheduling.enabled=false"
})
class AdminCityLaunchLaunchControllerIT {

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
    @Autowired private SandboxAreaRepository sandboxAreaRepository;
    @Autowired private SandboxCityRegionRepository sandboxCityRegionRepository;
    @Autowired private SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository;
    @Autowired private CityLaunchRevisionRepository revisionRepository;

    private static final UUID ADMIN_ID = UUID.fromString("19115001-0000-0000-0000-000000000001");
    private static final UUID BUYER_ID = UUID.fromString("19115002-0000-0000-0000-000000000002");

    private Integer cityAId;
    private Integer cityBId;

    @BeforeEach
    void setUp() {
        cityAId = seedCity("aclc-a");
        cityBId = seedCity("aclc-b");
        jdbc.update(
                "INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                ADMIN_ID, "aclc-admin@test.local");
        jdbc.update(
                "INSERT INTO public.user_roles (user_id, role) VALUES (?, CAST('admin' AS public.app_role)) "
                        + "ON CONFLICT (user_id, role) DO NOTHING",
                ADMIN_ID);
        jdbc.update(
                "INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                BUYER_ID, "aclc-buyer@test.local");
    }

    @AfterEach
    void cleanup() {
        jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id IN (?, ?)", cityAId, cityBId);
        jdbc.update("DELETE FROM public.area_group_members WHERE area_group_id IN "
                + "(SELECT id FROM public.area_groups WHERE city_id IN (?, ?))", cityAId, cityBId);
        jdbc.update("DELETE FROM public.area_groups WHERE city_id IN (?, ?)", cityAId, cityBId);
        jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id IN (?, ?)", cityAId, cityBId);
        jdbc.update("DELETE FROM public.city_regions WHERE city_id IN (?, ?)", cityAId, cityBId);
        jdbc.update("DELETE FROM public.areas WHERE city_id IN (?, ?)", cityAId, cityBId);
        jdbc.update("DELETE FROM public.cities WHERE id IN (?, ?)", cityAId, cityBId);
        jdbc.update("DELETE FROM auth.users WHERE id IN (?, ?)", ADMIN_ID, BUYER_ID);
    }

    private int seedCity(String slug) {
        return jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, false) RETURNING id",
                Integer.class, slug, slug + "-test-city");
    }

    private void seedGeography(int cityId, String prefix) {
        jdbc.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon) "
                        + "VALUES (?, ?, ?, ?, ?)",
                prefix + "|area-1", cityId, prefix + "-area-1", 13.01, 74.71);
        jdbc.update(
                "INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                        + "VALUES (?, ?, ?, 1)",
                cityId, prefix + "-north", prefix + "-north");
        jdbc.update(
                "INSERT INTO public.city_region_memberships (city_id, area_key, region_key, assignment_source) "
                        + "VALUES (?, ?, ?, 'AUTO')",
                cityId, prefix + "|area-1", prefix + "-north");
    }

    private String launchUrl(int cityId, long revisionId) {
        return "/api/admin/city-launch/cities/" + cityId + "/revisions/" + revisionId + "/launch";
    }

    private String validationUrl(int cityId, long revisionId) {
        return "/api/admin/city-launch/cities/" + cityId + "/revisions/" + revisionId + "/validation";
    }

    /** Seeds geography, prepares, waits for PREPARED (async), and marks the revision VALIDATED via HTTP. */
    private long prepareAndValidateViaHttp(int cityId, String prefix) throws Exception {
        seedGeography(cityId, prefix);

        long revisionId = jdbc.queryForObject(
                "INSERT INTO public.city_launch_revision (city_id, revision_number, lifecycle_status, "
                        + "prep_state, prep_stage, landing_validated, regions_validated, area_groups_validated, "
                        + "areas_validated, listing_validated, agri_validated, persisted_revision_checksum, "
                        + "created_by) "
                        + "VALUES (?, 1, 'PREPARED', 'DONE', 6, true, true, true, true, true, true, "
                        + "'seeded-checksum-placeholder', ?) RETURNING id",
                Long.class, cityId, ADMIN_ID);

        // Seed a matching sandbox_areas row so RevisionChecksum.compute() over the real sandbox
        // rows equals the persisted_revision_checksum stamped above — this class exercises the HTTP
        // layer (auth/scoping/response-shape), not the checksum-computation path itself, which
        // CityLaunchPromotionServiceIT already proves end-to-end via the real prepare pipeline.
        long sandboxAreaId = jdbc.queryForObject(
                "INSERT INTO public.sandbox_areas (revision_id, area_key, name, district, geo_center_lat, "
                        + "geo_center_lon, lifecycle_status) VALUES (?, ?, ?, NULL, ?, ?, 'ACTIVE') RETURNING id",
                Long.class, revisionId, prefix + "|area-1", prefix + "-area-1", 13.01, 74.71);
        jdbc.update(
                "INSERT INTO public.sandbox_city_regions (revision_id, region_key, display_label, "
                        + "display_order) VALUES (?, ?, ?, 1)",
                revisionId, prefix + "-north", prefix + "-north");
        jdbc.update(
                "INSERT INTO public.sandbox_city_region_memberships (revision_id, sandbox_area_id, region_key, "
                        + "assignment_source) VALUES (?, ?, ?, 'AUTO')",
                revisionId, sandboxAreaId, prefix + "-north");

        String checksum = RevisionChecksum.compute(
                sandboxAreaRepository.findByRevisionId(revisionId),
                java.util.List.of(),
                sandboxCityRegionRepository.findByRevisionId(revisionId),
                sandboxCityRegionMembershipRepository.findByRevisionId(revisionId),
                java.util.List.of(),
                java.util.List.of());
        jdbc.update("UPDATE public.city_launch_revision SET persisted_revision_checksum = ? WHERE id = ?",
                checksum, revisionId);

        mockMvc.perform(post(validationUrl(cityId, revisionId) + "/mark-validated")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleStatus").value("VALIDATED"));

        return revisionId;
    }

    // =========================================================================================
    // @IsAdmin authz
    // =========================================================================================

    @Test
    @DisplayName("non-admin caller -> 403")
    void nonAdmin_forbidden() throws Exception {
        long revisionId = prepareAndValidateViaHttp(cityAId, "auth5");

        mockMvc.perform(post(launchUrl(cityAId, revisionId))
                        .header("Authorization", "Bearer " + BUYER_ID)
                        .contentType("application/json")
                        .content("{\"confirmCityName\":\"anything\"}"))
                .andExpect(status().isForbidden());
    }

    // =========================================================================================
    // 200 happy path
    // =========================================================================================

    @Test
    @DisplayName("200: VALIDATED revision launches successfully, response carries PromotionReport shape")
    void launch_happyPath_200() throws Exception {
        long revisionId = prepareAndValidateViaHttp(cityAId, "hp6");

        mockMvc.perform(post(launchUrl(cityAId, revisionId))
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content("{\"confirmCityName\":\"hp6-test-city\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revisionId").value(revisionId))
                .andExpect(jsonPath("$.lifecycleStatus").value("PROMOTED"))
                .andExpect(jsonPath("$.promotedAt").exists())
                .andExpect(jsonPath("$.areasPromoted").value(1))
                .andExpect(jsonPath("$.cityActivated").value(true))
                .andExpect(jsonPath("$.idempotentNoop").value(false));

        Boolean isActive = jdbc.queryForObject(
                "SELECT is_active FROM public.cities WHERE id = ?", Boolean.class, cityAId);
        assertThat(isActive).isTrue();
    }

    // =========================================================================================
    // Wrong confirmCityName still proceeds (server-guard independence, qa-fast warning 1)
    // =========================================================================================

    @Test
    @DisplayName("a WRONG confirmCityName still proceeds through CAS/checksum -- the server never reads it")
    void launch_wrongConfirmCityName_stillProceeds() throws Exception {
        long revisionId = prepareAndValidateViaHttp(cityAId, "wc6");

        mockMvc.perform(post(launchUrl(cityAId, revisionId))
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content("{\"confirmCityName\":\"totally wrong name\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleStatus").value("PROMOTED"));
    }

    // =========================================================================================
    // Scoping mismatch -> 404
    // =========================================================================================

    @Test
    @DisplayName("cityId/revisionId scoping mismatch -> 404")
    void launch_scopingMismatch_404() throws Exception {
        long revisionOfCityB = prepareAndValidateViaHttp(cityBId, "sm6");

        mockMvc.perform(post(launchUrl(cityAId, revisionOfCityB))
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isNotFound());
    }

    // =========================================================================================
    // 409 not-promotable
    // =========================================================================================

    @Test
    @DisplayName("409: a PREPARED (not yet VALIDATED) revision cannot be launched")
    void launch_notPromotable_409() throws Exception {
        seedGeography(cityAId, "np6");
        long revisionId = jdbc.queryForObject(
                "INSERT INTO public.city_launch_revision (city_id, revision_number, lifecycle_status, "
                        + "prep_state, prep_stage) VALUES (?, 1, 'PREPARED', 'DONE', 6) RETURNING id",
                Long.class, cityAId);

        mockMvc.perform(post(launchUrl(cityAId, revisionId))
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isConflict());
    }

    // =========================================================================================
    // 422 checksum mismatch
    // =========================================================================================

    @Test
    @DisplayName("422: a tampered sandbox row after prep is rejected at launch time")
    void launch_checksumMismatch_422() throws Exception {
        long revisionId = prepareAndValidateViaHttp(cityAId, "xm6");

        SandboxArea sandboxArea = sandboxAreaRepository.findByRevisionId(revisionId).get(0);
        jdbc.update("UPDATE public.sandbox_areas SET name = ? WHERE id = ?", "TAMPERED", sandboxArea.getId());

        mockMvc.perform(post(launchUrl(cityAId, revisionId))
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isUnprocessableEntity());

        String lifecycleAfter = jdbc.queryForObject(
                "SELECT lifecycle_status FROM public.city_launch_revision WHERE id = ?", String.class, revisionId);
        assertThat(lifecycleAfter).isEqualTo("VALIDATED");
    }

    // =========================================================================================
    // Idempotent no-op shape
    // =========================================================================================

    @Test
    @DisplayName("idempotent no-op: a second launch after PROMOTED returns 200 with idempotentNoop=true and "
            + "zero counts")
    void launch_secondCallAfterPromoted_idempotentNoop() throws Exception {
        long revisionId = prepareAndValidateViaHttp(cityAId, "in6");

        mockMvc.perform(post(launchUrl(cityAId, revisionId))
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.idempotentNoop").value(false));

        mockMvc.perform(post(launchUrl(cityAId, revisionId))
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleStatus").value("PROMOTED"))
                .andExpect(jsonPath("$.idempotentNoop").value(true))
                .andExpect(jsonPath("$.areasPromoted").value(0))
                .andExpect(jsonPath("$.cityActivated").value(false));
    }
}
