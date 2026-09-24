package com.example.realestate.discover;

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
import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Testcontainers integration test (real Postgres, full Flyway history, real Spring Security filter
 * chain) proving {@link AdminAreaOnboardingController}'s three #2676 Slice B1b endpoints over HTTP —
 * {@code @IsAdmin}, {@link com.example.realestate.security.CallerInfo} binding, and the 404/409
 * exception mappings — none of which {@link AreaOnboardingBatchQueryIT} (which drives {@link
 * AreaOnboardingBatchQuery} directly, bypassing the controller/security layer entirely) exercises.
 * JWT/role-seeding MockMvc harness mirrors {@link
 * com.example.realestate.discover.citylaunch.AdminCityLaunchLaunchControllerIT}.
 *
 * <p>Also doubles as the HTTP-level regression test for the {@code blocking_reasons} GET fix
 * (#2676 B1b review finding 3): {@link #admin_get_blockedBatch_200_returnsBlockingReasons} proves
 * the CITY_BOUNDS_MISSING/REGION_POLICY_MISSING reasons B1a persists actually reach the JSON body,
 * not just {@code applyAllowed=false} with no explanation.
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
        "AI_API_KEY=test-dummy-not-used-in-area-onboarding-it",
        "spring.task.scheduling.enabled=false"
})
class AdminAreaOnboardingControllerIT {

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
    @Autowired private AreaOnboardingService onboardingService;

    private static final UUID ADMIN_ID = UUID.fromString("26760001-0000-0000-0000-000000000001");
    private static final UUID NON_ADMIN_ID = UUID.fromString("26760002-0000-0000-0000-000000000002");

    private static final AreaOnboardingService.BatchIdentity TEST_IDENTITY = new AreaOnboardingService.BatchIdentity(
            "dataset-admin-controller-it", "v1", "checksum-placeholder", "test-provider", "1",
            OffsetDateTime.parse("2026-01-01T00:00:00Z"));

    private Integer udupiCityId;
    private Integer blockedCityId;

    @BeforeEach
    void setUp() {
        udupiCityId = jdbc.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);
        // Deliberately no min/max lat/lon bounds and no city_region_policy row — the exact
        // combination that AreaOnboardingService#dryRun turns into CITY_BOUNDS_MISSING +
        // REGION_POLICY_MISSING blocking reasons (see AreaOnboardingDryRunSafetyIT).
        blockedCityId = jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES ('aacit-blocked', 'AACIT Blocked City', 13.0, 74.7, false) RETURNING id",
                Integer.class);

        jdbc.update(
                "INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                ADMIN_ID, "aacit-admin@test.local");
        jdbc.update(
                "INSERT INTO public.user_roles (user_id, role) VALUES (?, CAST('admin' AS public.app_role)) "
                        + "ON CONFLICT (user_id, role) DO NOTHING",
                ADMIN_ID);
        jdbc.update(
                "INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                NON_ADMIN_ID, "aacit-nonadmin@test.local");
    }

    @AfterEach
    void cleanup() {
        // A happy-path apply() writes area_onboarding_apply_audit (candidate_id FK) and
        // area_region_reclass_outbox (batch_id FK) rows — both must go before the
        // candidate/batch rows they reference, or the deletes below violate those FKs.
        jdbc.update("DELETE FROM area_onboarding_apply_audit WHERE batch_id IN "
                + "(SELECT id FROM area_onboarding_batch WHERE city_id IN (?, ?))", udupiCityId, blockedCityId);
        jdbc.update("DELETE FROM area_region_reclass_outbox WHERE batch_id IN "
                + "(SELECT id FROM area_onboarding_batch WHERE city_id IN (?, ?))", udupiCityId, blockedCityId);
        jdbc.update("DELETE FROM area_onboarding_candidate WHERE batch_id IN "
                + "(SELECT id FROM area_onboarding_batch WHERE city_id IN (?, ?))", udupiCityId, blockedCityId);
        jdbc.update("DELETE FROM area_onboarding_batch WHERE city_id IN (?, ?)", udupiCityId, blockedCityId);
        jdbc.update("DELETE FROM areas WHERE area_key LIKE 'IN|KA|Udupi|AACIT%'");
        jdbc.update("DELETE FROM public.cities WHERE id = ?", blockedCityId);
        jdbc.update("DELETE FROM auth.users WHERE id IN (?, ?)", ADMIN_ID, NON_ADMIN_ID);
    }

    private AreaOnboardingService.CandidateInput cleanCandidate(String suffix) {
        return new AreaOnboardingService.CandidateInput(
                "IN|KA|Udupi|AACIT" + suffix, "AACIT " + suffix, 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "aacit-ext-" + suffix);
    }

    private long dryRunUdupi(String suffix) {
        return onboardingService.dryRun(
                udupiCityId, "admin-controller-it", TEST_IDENTITY, List.of(cleanCandidate(suffix))).batchId();
    }

    private String batchUrl(long batchId) {
        return "/api/admin/area-onboarding/batches/" + batchId;
    }

    // =========================================================================================
    // GET .../batches/{id}
    // =========================================================================================

    @Test
    @DisplayName("GET: unauthenticated caller -> 401")
    void unauthenticated_get_401() throws Exception {
        long batchId = dryRunUdupi("Get401");

        mockMvc.perform(get(batchUrl(batchId)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET: non-admin caller -> 403")
    void nonAdmin_get_403() throws Exception {
        long batchId = dryRunUdupi("Get403");

        mockMvc.perform(get(batchUrl(batchId))
                        .header("Authorization", "Bearer " + NON_ADMIN_ID))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("GET: unknown batchId -> 404")
    void admin_get_unknownBatch_404() throws Exception {
        mockMvc.perform(get(batchUrl(-999L))
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET: 200 for a blocked (apply_allowed=false) batch surfaces CITY_BOUNDS_MISSING and "
            + "REGION_POLICY_MISSING in blockingReasons (#2676 B1b review finding 3)")
    void admin_get_blockedBatch_200_returnsBlockingReasons() throws Exception {
        long batchId = onboardingService.dryRun(
                blockedCityId, "admin-controller-it-blocked", TEST_IDENTITY,
                List.of(new AreaOnboardingService.CandidateInput(
                        "IN|XX|AacitBlocked|Area1", "Blocked Area 1", 13.30, 74.75,
                        13.29, 74.74, 13.31, 74.76, "OSM", "aacit-blocked-ext-1"))).batchId();

        mockMvc.perform(get(batchUrl(batchId))
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.batchId").value(batchId))
                .andExpect(jsonPath("$.applyAllowed").value(false))
                .andExpect(jsonPath("$.blockingReasons", org.hamcrest.Matchers.hasSize(2)))
                .andExpect(jsonPath("$.blockingReasons[0]",
                        org.hamcrest.Matchers.startsWith("CITY_BOUNDS_MISSING")))
                .andExpect(jsonPath("$.blockingReasons[1]",
                        org.hamcrest.Matchers.startsWith("REGION_POLICY_MISSING")));
        // area_onboarding_batch/candidate rows for blockedCityId are swept up by @AfterEach#cleanup;
        // dryRun() never writes to `areas` for a blocked (apply_allowed=false) batch (AC1), so there
        // is nothing there to clean up either.
    }

    // =========================================================================================
    // POST .../approve
    // =========================================================================================

    @Test
    @DisplayName("approve: unauthenticated caller -> 401")
    void unauthenticated_approve_401() throws Exception {
        long batchId = dryRunUdupi("Appr401");

        mockMvc.perform(post(batchUrl(batchId) + "/approve"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("approve: non-admin caller -> 403")
    void nonAdmin_approve_403() throws Exception {
        long batchId = dryRunUdupi("Appr403");

        mockMvc.perform(post(batchUrl(batchId) + "/approve")
                        .header("Authorization", "Bearer " + NON_ADMIN_ID))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("approve: unknown batchId -> 404")
    void admin_approve_unknownBatch_404() throws Exception {
        mockMvc.perform(post(batchUrl(-999L) + "/approve")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("approve: 200 happy path for a clean, apply-allowed batch")
    void admin_approve_happyPath_200() throws Exception {
        long batchId = dryRunUdupi("ApprOk");

        mockMvc.perform(post(batchUrl(batchId) + "/approve")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.batchId").value(batchId))
                .andExpect(jsonPath("$.approvedCount").value(1));
    }

    @Test
    @DisplayName("approve: 409 when the batch's review is already FINALIZED (a repeat approve call)")
    void admin_approve_alreadyFinalized_409() throws Exception {
        long batchId = dryRunUdupi("Appr409");

        mockMvc.perform(post(batchUrl(batchId) + "/approve")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk());

        // The single candidate above was approved and drove review_status to FINALIZED; a second
        // approve() call on the same batch must now refuse (AreaOnboardingReviewService#approve).
        mockMvc.perform(post(batchUrl(batchId) + "/approve")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isConflict());
    }

    // =========================================================================================
    // POST .../apply
    // =========================================================================================

    @Test
    @DisplayName("apply: unauthenticated caller -> 401")
    void unauthenticated_apply_401() throws Exception {
        long batchId = dryRunUdupi("Apply401");

        mockMvc.perform(post(batchUrl(batchId) + "/apply"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("apply: non-admin caller -> 403")
    void nonAdmin_apply_403() throws Exception {
        long batchId = dryRunUdupi("Apply403");

        mockMvc.perform(post(batchUrl(batchId) + "/apply")
                        .header("Authorization", "Bearer " + NON_ADMIN_ID))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("apply: unknown batchId -> 404")
    void admin_apply_unknownBatch_404() throws Exception {
        mockMvc.perform(post(batchUrl(-999L) + "/apply")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("apply: 409 when review has not been FINALIZED yet (apply called before approve)")
    void admin_apply_notFinalized_409() throws Exception {
        long batchId = dryRunUdupi("ApplyNotFin");

        mockMvc.perform(post(batchUrl(batchId) + "/apply")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("apply: 200 happy path (dryRun -> approve -> apply) — response carries ApplyReport "
            + "shape, and a follow-up GET now shows applyAllowed=true with empty blockingReasons")
    void admin_apply_happyPath_200() throws Exception {
        long batchId = dryRunUdupi("ApplyOk");

        mockMvc.perform(post(batchUrl(batchId) + "/approve")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk());

        mockMvc.perform(post(batchUrl(batchId) + "/apply")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.batchId").value(batchId))
                .andExpect(jsonPath("$.created").value(1))
                .andExpect(jsonPath("$.skippedNotApproved").value(0));

        mockMvc.perform(get(batchUrl(batchId))
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applyAllowed").value(true))
                .andExpect(jsonPath("$.blockingReasons", org.hamcrest.Matchers.empty()))
                .andExpect(jsonPath("$.applyStatus").value("APPLIED"));
    }
}
