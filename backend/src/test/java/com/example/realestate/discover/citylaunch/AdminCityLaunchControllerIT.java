package com.example.realestate.discover.citylaunch;

import com.fasterxml.jackson.core.type.TypeReference;
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
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Testcontainers integration test (real Postgres + the REAL Spring Security filter chain) proving
 * the [security_test_matrix] for {@link AdminCityLaunchController} (#1911 PR2).
 *
 * <p>Mirrors {@code RbacSmokeIT}'s pattern exactly: a no-op {@link JwtDecoder} whose token value
 * IS the JWT subject, so {@code DbRoleJwtAuthenticationConverter} performs a REAL
 * {@code user_roles} DB lookup — this exercises the actual {@code @IsAdmin} /
 * {@code CallerInfoResolver} gate end-to-end, not a hand-fed {@code jwt().authorities(...)} mock.
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
class AdminCityLaunchControllerIT {

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

    private static final UUID ADMIN_ID = UUID.fromString("19110001-0000-0000-0000-000000000001");
    private static final UUID BUYER_ID = UUID.fromString("19110002-0000-0000-0000-000000000002");
    private static final UUID SELLER_ID = UUID.fromString("19110003-0000-0000-0000-000000000003");
    private static final UUID ADMIN_2_ID = UUID.fromString("19110004-0000-0000-0000-000000000004");

    private Integer testCityId;

    @BeforeEach
    void setUp() {
        testCityId = jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES ('acl-it', 'ACL IT Test City', 13.0, 74.7, true) RETURNING id",
                Integer.class);
    }

    @AfterEach
    void cleanup() {
        jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", testCityId);
        jdbc.update("DELETE FROM public.cities WHERE id = ?", testCityId);
        jdbc.update("DELETE FROM auth.users WHERE id IN (?,?,?,?)", ADMIN_ID, BUYER_ID, SELLER_ID, ADMIN_2_ID);
    }

    private void seedRole(UUID userId, String role) {
        jdbc.update(
                "INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                userId, "acl-it-" + userId + "@test.local");
        jdbc.update(
                "INSERT INTO public.user_roles (user_id, role) VALUES (?, CAST(? AS public.app_role)) "
                        + "ON CONFLICT (user_id, role) DO NOTHING",
                userId, role);
    }

    // =========================================================================================
    // Case 1 — GET /cities no token -> 401
    // =========================================================================================

    @Test
    @DisplayName("Case 1: GET /cities with no token -> 401")
    void case1_getCities_noToken_401() throws Exception {
        mockMvc.perform(get("/api/admin/city-launch/cities"))
                .andExpect(status().isUnauthorized());
    }

    // =========================================================================================
    // Case 2 — GET /cities non-admin -> 403
    // =========================================================================================

    @Test
    @DisplayName("Case 2: GET /cities as ROLE_BUYER/SELLER -> 403")
    void case2_getCities_nonAdmin_403() throws Exception {
        seedRole(BUYER_ID, "user");
        mockMvc.perform(get("/api/admin/city-launch/cities").header("Authorization", "Bearer " + BUYER_ID))
                .andExpect(status().isForbidden());

        seedRole(SELLER_ID, "broker");
        mockMvc.perform(get("/api/admin/city-launch/cities").header("Authorization", "Bearer " + SELLER_ID))
                .andExpect(status().isForbidden());
    }

    // =========================================================================================
    // Case 3 — GET /cities ROLE_ADMIN -> 200 correct payload
    // =========================================================================================

    @Test
    @DisplayName("Case 3: GET /cities as ROLE_ADMIN -> 200 with the seeded test city present")
    void case3_getCities_admin_200_correctPayload() throws Exception {
        seedRole(ADMIN_ID, "admin");

        String body = mockMvc.perform(get("/api/admin/city-launch/cities").header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        List<Map<String, Object>> cities = objectMapper.readValue(body, new TypeReference<>() {});
        Map<String, Object> testCity = cities.stream()
                .filter(c -> "acl-it".equals(c.get("citySlug")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("acl-it city not found in response: " + body));
        assertThat(testCity.get("status")).isEqualTo("not-started");
        assertThat(testCity.get("revisionId")).isNull();
    }

    // =========================================================================================
    // Case 4 — POST /prepare no token -> 401
    // =========================================================================================

    @Test
    @DisplayName("Case 4: POST /prepare with no token -> 401")
    void case4_postPrepare_noToken_401() throws Exception {
        mockMvc.perform(post("/api/admin/city-launch/cities/" + testCityId + "/prepare"))
                .andExpect(status().isUnauthorized());
    }

    // =========================================================================================
    // Case 5 — POST /prepare non-admin -> 403 AND zero new revision rows
    // =========================================================================================

    @Test
    @DisplayName("Case 5: POST /prepare as non-admin -> 403 AND zero new city_launch_revision rows")
    void case5_postPrepare_nonAdmin_403_zeroRevisionRows() throws Exception {
        seedRole(BUYER_ID, "user");

        mockMvc.perform(post("/api/admin/city-launch/cities/" + testCityId + "/prepare")
                        .header("Authorization", "Bearer " + BUYER_ID))
                .andExpect(status().isForbidden());

        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM public.city_launch_revision WHERE city_id = ?", Integer.class, testCityId);
        assertThat(count).isZero();
    }

    // =========================================================================================
    // Case 6 — POST /prepare as admin for an arbitrary city -> 202 (documented-PASS, no scoping)
    // =========================================================================================

    @Test
    @DisplayName("Case 6: POST /prepare as ANY ROLE_ADMIN for an arbitrary city -> 202 "
            + "(documented-PASS: single-operator MVP, no per-city admin scoping)")
    void case6_postPrepare_anyAdmin_arbitraryCity_202() throws Exception {
        seedRole(ADMIN_2_ID, "admin");

        mockMvc.perform(post("/api/admin/city-launch/cities/" + testCityId + "/prepare")
                        .header("Authorization", "Bearer " + ADMIN_2_ID))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("preparing"))
                .andExpect(jsonPath("$.revisionId").exists());
    }

    // =========================================================================================
    // Case 7 — GET /prepare no token -> 401; non-admin -> 403
    // =========================================================================================

    @Test
    @DisplayName("Case 7: GET /prepare (progress) with no token -> 401; non-admin -> 403")
    void case7_getPrepare_noToken401_nonAdmin403() throws Exception {
        mockMvc.perform(get("/api/admin/city-launch/cities/" + testCityId + "/prepare"))
                .andExpect(status().isUnauthorized());

        seedRole(SELLER_ID, "broker");
        mockMvc.perform(get("/api/admin/city-launch/cities/" + testCityId + "/prepare")
                        .header("Authorization", "Bearer " + SELLER_ID))
                .andExpect(status().isForbidden());
    }

    // =========================================================================================
    // Case 8 — created_by equals the authenticated caller's id even if the body attempts another
    // =========================================================================================

    @Test
    @DisplayName("Case 8: created_by is ALWAYS the authenticated caller's id, even when the request "
            + "body attempts to set a different value — the endpoint never binds/reads a body")
    void case8_createdBy_alwaysAuthenticatedCaller_bodyIgnored() throws Exception {
        seedRole(ADMIN_ID, "admin");
        UUID spoofedCallerId = UUID.randomUUID();

        mockMvc.perform(post("/api/admin/city-launch/cities/" + testCityId + "/prepare")
                        .header("Authorization", "Bearer " + ADMIN_ID)
                        .contentType("application/json")
                        .content("{\"createdBy\":\"" + spoofedCallerId + "\",\"callerId\":\"" + spoofedCallerId + "\"}"))
                .andExpect(status().isAccepted());

        UUID actualCreatedBy = jdbc.queryForObject(
                "SELECT created_by FROM public.city_launch_revision WHERE city_id = ? ORDER BY revision_number DESC LIMIT 1",
                UUID.class, testCityId);
        assertThat(actualCreatedBy).isEqualTo(ADMIN_ID);
        assertThat(actualCreatedBy).isNotEqualTo(spoofedCallerId);
    }

    // =========================================================================================
    // Case 9 — 409/404/403 bodies contain no stack trace / exception class / SQL — generic only
    // =========================================================================================

    @Test
    @DisplayName("Case 9: 403/404/409 error bodies contain no stack trace, exception class name, or SQL detail")
    void case9_errorBodies_sanitized_noInternalDetail() throws Exception {
        // 403 body.
        seedRole(BUYER_ID, "user");
        mockMvc.perform(get("/api/admin/city-launch/cities/" + testCityId + "/prepare")
                        .header("Authorization", "Bearer " + BUYER_ID))
                .andExpect(status().isForbidden())
                .andExpect(content().string(not(containsString("Exception"))))
                .andExpect(content().string(not(containsString("com.example.realestate"))))
                .andExpect(content().string(not(containsString("SELECT"))));

        // 404 body: unknown city id.
        seedRole(ADMIN_ID, "admin");
        mockMvc.perform(get("/api/admin/city-launch/cities/999999/prepare")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isNotFound())
                .andExpect(content().string(not(containsString("Exception"))))
                .andExpect(content().string(not(containsString("com.example.realestate"))))
                .andExpect(content().string(not(containsString("SELECT"))));

        // 409 body: a second concurrent-in-flight prepare for the same city.
        mockMvc.perform(post("/api/admin/city-launch/cities/" + testCityId + "/prepare")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isAccepted());
        mockMvc.perform(post("/api/admin/city-launch/cities/" + testCityId + "/prepare")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isConflict())
                .andExpect(content().string(not(containsString("Exception"))))
                .andExpect(content().string(not(containsString("com.example.realestate"))))
                .andExpect(content().string(not(containsString("uq_clr_inflight"))))
                .andExpect(content().string(not(containsString("SELECT"))));
    }
}
