package com.example.realestate.intelligence;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code @WebMvcTest} slice for {@link BuyerAreaIntelligenceController#resolveArea}.
 *
 * <p>Tests cover:
 * <ul>
 *   <li>RA-T01 – Public access, valid params, known slug → 200 matched=true with areaKey.</li>
 *   <li>RA-T02 – Valid params, unknown slug → 200 matched=false.</li>
 *   <li>RA-T03 – Blank city param → 400.</li>
 *   <li>RA-T04 – Whitespace-only slug → 400.</li>
 *   <li>RA-T05 – Invalid charset slug (uppercase) → 400.</li>
 *   <li>RA-T06 – Invalid charset slug (pipe char) → 400.</li>
 *   <li>RA-T07 – Leading hyphen slug → 400.</li>
 *   <li>RA-T08 – Consecutive hyphens in slug → 400.</li>
 *   <li>RA-T09 – Slug at max allowed length (128) → 200.</li>
 *   <li>RA-T10 – Slug exceeding max length (129 chars) → 400.</li>
 *   <li>RA-T11 – Invalid charset city (uppercase) → 400.</li>
 *   <li>RA-T12 – Response body contains no broker/metric/price fields.</li>
 * </ul>
 */
@WebMvcTest(
        controllers = BuyerAreaIntelligenceController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({ResolveAreaControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class ResolveAreaControllerTest {

    /** Minimal security config: permit all — mirrors production permitAll for /api/trends/**. */
    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private BuyerAreaIntelligenceService buyerAreaIntelligenceService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(buyerAreaIntelligenceService, userRoleService);
    }

    // ── RA-T01: known slug → 200 matched=true ────────────────────────────────

    @Test
    @DisplayName("RA-T01: no auth header, valid city+slug, known slug → 200, matched=true, areaKey present")
    void resolveArea_knownSlug_returns200MatchedTrue() throws Exception {
        ResolveAreaResponse response = new ResolveAreaResponse(
                "udupi", "malpe", "IN|KA|Udupi|Malpe", "Malpe", true);
        when(buyerAreaIntelligenceService.resolveArea("udupi", "malpe")).thenReturn(response);

        mockMvc.perform(get("/api/trends/resolve-area")
                        .param("city", "udupi")
                        .param("slug", "malpe"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.matched").value(true))
                .andExpect(jsonPath("$.citySlug").value("udupi"))
                .andExpect(jsonPath("$.areaSlug").value("malpe"))
                .andExpect(jsonPath("$.areaKey").value("IN|KA|Udupi|Malpe"))
                .andExpect(jsonPath("$.areaLabel").value("Malpe"));
    }

    // ── RA-T02: unknown slug → 200 matched=false ──────────────────────────────

    @Test
    @DisplayName("RA-T02: valid params, unknown slug → 200, matched=false, areaKey null")
    void resolveArea_unknownSlug_returns200MatchedFalse() throws Exception {
        ResolveAreaResponse response = new ResolveAreaResponse(
                "udupi", "no-such-place", null, null, false);
        when(buyerAreaIntelligenceService.resolveArea("udupi", "no-such-place"))
                .thenReturn(response);

        mockMvc.perform(get("/api/trends/resolve-area")
                        .param("city", "udupi")
                        .param("slug", "no-such-place"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.matched").value(false))
                .andExpect(jsonPath("$.areaKey").doesNotExist());
    }

    // ── RA-T03: blank city → 400 ──────────────────────────────────────────────

    @Test
    @DisplayName("RA-T03: blank city param → 400")
    void resolveArea_blankCity_returns400() throws Exception {
        mockMvc.perform(get("/api/trends/resolve-area")
                        .param("city", "")
                        .param("slug", "malpe"))
                .andExpect(status().isBadRequest());
    }

    // ── RA-T04: whitespace-only slug → 400 ───────────────────────────────────

    @Test
    @DisplayName("RA-T04: whitespace-only slug param → 400")
    void resolveArea_whitespaceSlug_returns400() throws Exception {
        mockMvc.perform(get("/api/trends/resolve-area")
                        .param("city", "udupi")
                        .param("slug", "   "))
                .andExpect(status().isBadRequest());
    }

    // ── RA-T05: invalid charset slug (uppercase) → 400 ───────────────────────

    @Test
    @DisplayName("RA-T05: uppercase letters in slug → 400")
    void resolveArea_uppercaseSlug_returns400() throws Exception {
        mockMvc.perform(get("/api/trends/resolve-area")
                        .param("city", "udupi")
                        .param("slug", "Malpe"))
                .andExpect(status().isBadRequest());
    }

    // ── RA-T06: invalid charset slug (pipe char) → 400 ───────────────────────

    @Test
    @DisplayName("RA-T06: pipe character in slug (raw area key) → 400")
    void resolveArea_pipeInSlug_returns400() throws Exception {
        mockMvc.perform(get("/api/trends/resolve-area")
                        .param("city", "udupi")
                        .param("slug", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isBadRequest());
    }

    // ── RA-T07: leading hyphen in slug → 400 ─────────────────────────────────

    @Test
    @DisplayName("RA-T07: slug with leading hyphen → 400")
    void resolveArea_leadingHyphenSlug_returns400() throws Exception {
        mockMvc.perform(get("/api/trends/resolve-area")
                        .param("city", "udupi")
                        .param("slug", "-malpe"))
                .andExpect(status().isBadRequest());
    }

    // ── RA-T08: consecutive hyphens in slug → 400 ────────────────────────────

    @Test
    @DisplayName("RA-T08: slug with consecutive hyphens → 400")
    void resolveArea_consecutiveHyphensSlug_returns400() throws Exception {
        mockMvc.perform(get("/api/trends/resolve-area")
                        .param("city", "udupi")
                        .param("slug", "malpe--beach"))
                .andExpect(status().isBadRequest());
    }

    // ── RA-T09: slug at max length (128 chars) → 200 ─────────────────────────

    @Test
    @DisplayName("RA-T09: slug at exactly 128 chars → 200 (service not called, valid format)")
    void resolveArea_slugAtMaxLength_returns200() throws Exception {
        // 128 lowercase letters: valid slug at limit
        String maxSlug = "a".repeat(128);
        ResolveAreaResponse response = new ResolveAreaResponse("udupi", maxSlug, null, null, false);
        when(buyerAreaIntelligenceService.resolveArea("udupi", maxSlug)).thenReturn(response);

        mockMvc.perform(get("/api/trends/resolve-area")
                        .param("city", "udupi")
                        .param("slug", maxSlug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.matched").value(false));
    }

    // ── RA-T10: slug exceeds max length (129 chars) → 400 ────────────────────

    @Test
    @DisplayName("RA-T10: slug exceeding 128 chars → 400")
    void resolveArea_slugExceedsMaxLength_returns400() throws Exception {
        String tooLongSlug = "a".repeat(129);

        mockMvc.perform(get("/api/trends/resolve-area")
                        .param("city", "udupi")
                        .param("slug", tooLongSlug))
                .andExpect(status().isBadRequest());
    }

    // ── RA-T11: invalid charset city (uppercase) → 400 ───────────────────────

    @Test
    @DisplayName("RA-T11: uppercase city param → 400")
    void resolveArea_uppercaseCity_returns400() throws Exception {
        mockMvc.perform(get("/api/trends/resolve-area")
                        .param("city", "Udupi")
                        .param("slug", "malpe"))
                .andExpect(status().isBadRequest());
    }

    // ── RA-T12: response body contains no broker/metric/price fields ──────────

    @Test
    @DisplayName("RA-T12: response body must not contain metric/price/broker fields")
    void resolveArea_responseBody_containsNoMetricOrBrokerFields() throws Exception {
        ResolveAreaResponse response = new ResolveAreaResponse(
                "udupi", "malpe", "IN|KA|Udupi|Malpe", "Malpe", true);
        when(buyerAreaIntelligenceService.resolveArea("udupi", "malpe")).thenReturn(response);

        var result = mockMvc.perform(get("/api/trends/resolve-area")
                        .param("city", "udupi")
                        .param("slug", "malpe"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString().toLowerCase();
        // Must not expose metric values or broker-facing data
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("price");
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("count");
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("median");
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("demand");
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("broker");
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("confidence");
    }
}
