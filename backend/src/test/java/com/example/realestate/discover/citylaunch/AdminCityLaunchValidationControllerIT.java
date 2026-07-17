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
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Testcontainers integration test (real Postgres, full Flyway history V0-&gt;V120, real Spring
 * Security filter chain) proving the #1911 PR4 validation-checklist / not-ready workflow —
 * AC1, AC2, AC3, AC6, AC9. Mirrors {@link AdminCityLaunchControllerIT}'s JWT/role-seeding pattern.
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
class AdminCityLaunchValidationControllerIT {

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

    private static final UUID ADMIN_ID = UUID.fromString("19114001-0000-0000-0000-000000000001");
    private static final UUID BUYER_ID = UUID.fromString("19114002-0000-0000-0000-000000000002");

    private Integer cityAId;
    private Integer cityBId;

    @BeforeEach
    void setUp() {
        cityAId = seedCity("aclv-a");
        cityBId = seedCity("aclv-b");
        jdbc.update(
                "INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                ADMIN_ID, "aclv-admin@test.local");
        jdbc.update(
                "INSERT INTO public.user_roles (user_id, role) VALUES (?, CAST('admin' AS public.app_role)) "
                        + "ON CONFLICT (user_id, role) DO NOTHING",
                ADMIN_ID);
    }

    @AfterEach
    void cleanup() {
        jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id IN (?, ?)", cityAId, cityBId);
        jdbc.update("DELETE FROM public.cities WHERE id IN (?, ?)", cityAId, cityBId);
        jdbc.update("DELETE FROM auth.users WHERE id IN (?, ?)", ADMIN_ID, BUYER_ID);
    }

    private int seedCity(String slug) {
        return jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, true) RETURNING id",
                Integer.class, slug, slug + "-test-city");
    }

    private long seedRevision(int cityId, int revisionNumber, String lifecycleStatus) {
        return jdbc.queryForObject(
                "INSERT INTO public.city_launch_revision (city_id, revision_number, lifecycle_status, "
                        + "prep_state, prep_stage, created_by) VALUES (?, ?, ?, 'DONE', 6, ?) RETURNING id",
                Long.class, cityId, revisionNumber, lifecycleStatus, ADMIN_ID);
    }

    private String validationUrl(int cityId, long revisionId) {
        return "/api/admin/city-launch/cities/" + cityId + "/revisions/" + revisionId + "/validation";
    }

    private String putBody(boolean value) {
        return "{\"value\":" + value + "}";
    }

    // =========================================================================================
    // AC9 — V0->V120 Flyway applies; a freshly-seeded revision defaults every column false/null.
    // =========================================================================================

    @Test
    @DisplayName("AC9: V120 applies cleanly and a pre-existing revision defaults all five checklist "
            + "columns to false with validated_at null")
    void ac9_migrationApplies_defaultsAllFalse() throws Exception {
        long revisionId = seedRevision(cityAId, 1, "PREPARED");

        mockMvc.perform(get(validationUrl(cityAId, revisionId)).header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cityId").value(cityAId))
                .andExpect(jsonPath("$.revisionNumber").value(1))
                .andExpect(jsonPath("$.checks.landing").value(false))
                .andExpect(jsonPath("$.checks.regions").value(false))
                .andExpect(jsonPath("$.checks.areaGroups").value(false))
                .andExpect(jsonPath("$.checks.areas").value(false))
                .andExpect(jsonPath("$.checks.listing").value(false))
                .andExpect(jsonPath("$.allValidated").value(false))
                .andExpect(jsonPath("$.lifecycleStatus").value("PREPARED"))
                .andExpect(jsonPath("$.preparedAt").doesNotExist())
                .andExpect(jsonPath("$.validatedAt").doesNotExist())
                .andExpect(jsonPath("$.supersededBy").doesNotExist())
                .andExpect(jsonPath("$.editable").value(true));

        Boolean landingValidated = jdbc.queryForObject(
                "SELECT landing_validated FROM public.city_launch_revision WHERE id = ?", Boolean.class, revisionId);
        Instant validatedAt = jdbc.queryForObject(
                "SELECT validated_at FROM public.city_launch_revision WHERE id = ?", Instant.class, revisionId);
        assertThat(landingValidated).isFalse();
        assertThat(validatedAt).isNull();
    }

    // =========================================================================================
    // AC1 — toggle scoping, persistence, idempotency, unknown checkKey
    // =========================================================================================

    @Test
    @DisplayName("AC1: toggle scoped to city+revision; wrong cityId -> 404; persists across GET reload; "
            + "set-true idempotent; unknown checkKey -> 400")
    void ac1_toggleScopingPersistenceIdempotencyAndUnknownKey() throws Exception {
        long revisionA = seedRevision(cityAId, 1, "PREPARED");
        long revisionB = seedRevision(cityBId, 1, "PREPARED");

        mockMvc.perform(put(validationUrl(cityAId, revisionA) + "/checks/landing")
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content(putBody(true)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.checks.landing").value(true))
                .andExpect(jsonPath("$.lifecycleStatus").value("PREPARED"));

        // City B's revision is untouched.
        Boolean cityBLanding = jdbc.queryForObject(
                "SELECT landing_validated FROM public.city_launch_revision WHERE id = ?", Boolean.class, revisionB);
        assertThat(cityBLanding).isFalse();

        // Wrong cityId for revisionA -> 404.
        mockMvc.perform(put(validationUrl(cityBId, revisionA) + "/checks/landing")
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content(putBody(true)))
                .andExpect(status().isNotFound());

        // Persists across a GET reload.
        mockMvc.perform(get(validationUrl(cityAId, revisionA)).header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.checks.landing").value(true));

        // Set-true idempotent: already true -> 200, lifecycle unchanged.
        mockMvc.perform(put(validationUrl(cityAId, revisionA) + "/checks/landing")
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content(putBody(true)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.checks.landing").value(true))
                .andExpect(jsonPath("$.lifecycleStatus").value("PREPARED"));

        // Unknown checkKey -> 400.
        mockMvc.perform(put(validationUrl(cityAId, revisionA) + "/checks/bogus")
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content(putBody(true)))
                .andExpect(status().isBadRequest());
    }

    // =========================================================================================
    // AC2 — mark-validated: 4/5 -> 422 stays PREPARED; all 5 -> 200 VALIDATED; idempotent no-op
    // =========================================================================================

    @Test
    @DisplayName("AC2: mark-validated with 4/5 checked -> 422, stays PREPARED; all 5 -> 200 VALIDATED "
            + "with validated_at set; already-VALIDATED+all5 -> 200 no-op")
    void ac2_markValidated_fourOfFive422_allFive200_alreadyValidatedNoOp() throws Exception {
        long revisionId = seedRevision(cityAId, 1, "PREPARED");
        toggle(revisionId, "landing", true);
        toggle(revisionId, "regions", true);
        toggle(revisionId, "areaGroups", true);
        toggle(revisionId, "areas", true);
        // listing left false -> 4/5.

        mockMvc.perform(post(validationUrl(cityAId, revisionId) + "/mark-validated")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isUnprocessableEntity());

        String lifecycleAfterFour = jdbc.queryForObject(
                "SELECT lifecycle_status FROM public.city_launch_revision WHERE id = ?", String.class, revisionId);
        assertThat(lifecycleAfterFour).isEqualTo("PREPARED");

        toggle(revisionId, "listing", true);

        mockMvc.perform(post(validationUrl(cityAId, revisionId) + "/mark-validated")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleStatus").value("VALIDATED"))
                .andExpect(jsonPath("$.validatedAt").exists());

        // Already VALIDATED + all 5 -> 200 no-op (still VALIDATED, still all5).
        mockMvc.perform(post(validationUrl(cityAId, revisionId) + "/mark-validated")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleStatus").value("VALIDATED"))
                .andExpect(jsonPath("$.allValidated").value(true));
    }

    // =========================================================================================
    // AC3 (KEY) — untick/reset atomically demote VALIDATED -> PREPARED in ONE update
    // =========================================================================================

    @Test
    @DisplayName("AC3: unticking one check on a VALIDATED revision atomically demotes lifecycle to "
            + "PREPARED and clears validated_at in a single read-back; reset on VALIDATED does the same "
            + "for all five columns")
    void ac3_untickAndReset_atomicDemoteFromValidated() throws Exception {
        long revisionId = seedRevision(cityAId, 1, "PREPARED");
        for (String key : new String[] {"landing", "regions", "areaGroups", "areas", "listing"}) {
            toggle(revisionId, key, true);
        }
        mockMvc.perform(post(validationUrl(cityAId, revisionId) + "/mark-validated")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleStatus").value("VALIDATED"));

        // Untick one check -> single read-back proves atomic demote.
        mockMvc.perform(put(validationUrl(cityAId, revisionId) + "/checks/landing")
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content(putBody(false)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.checks.landing").value(false))
                .andExpect(jsonPath("$.lifecycleStatus").value("PREPARED"))
                .andExpect(jsonPath("$.validatedAt").doesNotExist());

        // Re-validate, then reset -> all five false + PREPARED + validatedAt null, in one read-back.
        toggle(revisionId, "landing", true);
        mockMvc.perform(post(validationUrl(cityAId, revisionId) + "/mark-validated")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleStatus").value("VALIDATED"));

        mockMvc.perform(post(validationUrl(cityAId, revisionId) + "/reset")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.checks.landing").value(false))
                .andExpect(jsonPath("$.checks.regions").value(false))
                .andExpect(jsonPath("$.checks.areaGroups").value(false))
                .andExpect(jsonPath("$.checks.areas").value(false))
                .andExpect(jsonPath("$.checks.listing").value(false))
                .andExpect(jsonPath("$.lifecycleStatus").value("PREPARED"))
                .andExpect(jsonPath("$.validatedAt").doesNotExist());
    }

    // =========================================================================================
    // AC6 — a superseded revision rejects every write with 409 and no state change
    // =========================================================================================

    @Test
    @DisplayName("AC6: toggle/reset/mark-validated on a superseded revision all 409, with no state change")
    void ac6_supersededRevision_allWrites409_noStateChange() throws Exception {
        long revisionId = seedRevision(cityAId, 1, "SUPERSEDED");

        mockMvc.perform(put(validationUrl(cityAId, revisionId) + "/checks/landing")
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content(putBody(true)))
                .andExpect(status().isConflict());

        mockMvc.perform(post(validationUrl(cityAId, revisionId) + "/reset")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isConflict());

        mockMvc.perform(post(validationUrl(cityAId, revisionId) + "/mark-validated")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isConflict());

        Boolean landingValidated = jdbc.queryForObject(
                "SELECT landing_validated FROM public.city_launch_revision WHERE id = ?", Boolean.class, revisionId);
        String lifecycleStatus = jdbc.queryForObject(
                "SELECT lifecycle_status FROM public.city_launch_revision WHERE id = ?", String.class, revisionId);
        assertThat(landingValidated).isFalse();
        assertThat(lifecycleStatus).isEqualTo("SUPERSEDED");
    }

    private void toggle(long revisionId, String checkKey, boolean value) throws Exception {
        mockMvc.perform(put(validationUrl(cityAId, revisionId) + "/checks/" + checkKey)
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content(putBody(value)))
                .andExpect(status().isOk());
    }
}
