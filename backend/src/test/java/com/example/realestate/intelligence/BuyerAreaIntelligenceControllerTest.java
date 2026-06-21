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
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code @WebMvcTest} slice for {@link BuyerAreaIntelligenceController}.
 *
 * <p>All tests exercise the public endpoint {@code GET /api/trends/area-intelligence}
 * WITHOUT an auth header — the endpoint is declared {@code permitAll()} for
 * {@code /api/trends/**} in {@link com.example.realestate.security.JwtConfig}.
 * The inner {@link TestConfig} sets up a minimal {@link SecurityFilterChain} that permits
 * all requests, mirroring the production permission on this path.
 *
 * <p>Test cases:
 * <ul>
 *   <li>T11  – Public access: no auth header → 200 with populated body.</li>
 *   <li>T4-c – No-row: unavailable response → 200, available=false (NOT 404).</li>
 *   <li>T12  – Blank param: city blank → 400; areaKey blank → 400.</li>
 *   <li>T7-c – Forbidden language at HTTP layer: response body checked on the wire.</li>
 * </ul>
 */
@WebMvcTest(
        controllers = BuyerAreaIntelligenceController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({BuyerAreaIntelligenceControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class BuyerAreaIntelligenceControllerTest {

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

    // UserRoleService is required by CallerInfoResolver which may be picked up by security context
    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(buyerAreaIntelligenceService, userRoleService);
    }

    // ── T11: Public access → 200 with populated body ──────────────────────────

    @Test
    @DisplayName("T11: no auth header, valid params → 200 with confidenceLabel and null mostSearchedBudget value")
    void getAreaIntelligence_noAuth_returns200WithPopulatedBody() throws Exception {
        BuyerAreaIntelligenceResponse response = populatedResponse();
        when(buyerAreaIntelligenceService.getAreaIntelligence("udupi", "IN|KA|Udupi|Malpe"))
                .thenReturn(response);

        mockMvc.perform(get("/api/trends/area-intelligence")
                        .param("city", "udupi")
                        .param("areaKey", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.confidenceLabel").value("Enough data"))
                .andExpect(jsonPath("$.citySlug").value("udupi"))
                .andExpect(jsonPath("$.areaKey").value("IN|KA|Udupi|Malpe"))
                .andExpect(jsonPath("$.metrics.mostSearchedBudget.value").doesNotExist())
                .andExpect(jsonPath("$.metrics.mostSearchedBudget.confidenceLabel").value("Not enough data yet"))
                .andExpect(jsonPath("$.priceComparison.supported").value(true));
    }

    // ── T4-controller: No-row → 200 (not 404), available=false ───────────────

    @Test
    @DisplayName("T4-c: service returns unavailable response → HTTP 200, available=false in body")
    void getAreaIntelligence_noRow_returns200AvailableFalse() throws Exception {
        BuyerAreaIntelligenceResponse unavailable = unavailableResponse("udupi", "IN|KA|Udupi|NoWhere");
        when(buyerAreaIntelligenceService.getAreaIntelligence("udupi", "IN|KA|Udupi|NoWhere"))
                .thenReturn(unavailable);

        mockMvc.perform(get("/api/trends/area-intelligence")
                        .param("city", "udupi")
                        .param("areaKey", "IN|KA|Udupi|NoWhere"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(false))
                .andExpect(jsonPath("$.confidenceLabel").value("Not enough data yet"));
    }

    // ── T12: Blank params → 400 ───────────────────────────────────────────────

    @Test
    @DisplayName("T12a: city param is empty string → 400")
    void getAreaIntelligence_blankCity_returns400() throws Exception {
        mockMvc.perform(get("/api/trends/area-intelligence")
                        .param("city", "")
                        .param("areaKey", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("T12b: areaKey param is empty string → 400")
    void getAreaIntelligence_blankAreaKey_returns400() throws Exception {
        mockMvc.perform(get("/api/trends/area-intelligence")
                        .param("city", "udupi")
                        .param("areaKey", ""))
                .andExpect(status().isBadRequest());
    }

    // ── T7-controller: Forbidden language at HTTP layer ───────────────────────

    @Test
    @DisplayName("T7-c: HTTP response body contains no forbidden language (demand, broker, guaranteed, etc.)")
    void getAreaIntelligence_responseBody_containsNoForbiddenLanguage() throws Exception {
        BuyerAreaIntelligenceResponse response = populatedResponse();
        when(buyerAreaIntelligenceService.getAreaIntelligence("udupi", "IN|KA|Udupi|Malpe"))
                .thenReturn(response);

        MvcResult result = mockMvc.perform(get("/api/trends/area-intelligence")
                        .param("city", "udupi")
                        .param("areaKey", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString().toLowerCase();

        assertThat(body).doesNotContain("demand");
        assertThat(body).doesNotContain("demandscore");
        assertThat(body).doesNotContain("missed lead");
        assertThat(body).doesNotContain("broker");
        assertThat(body).doesNotContain("agent action");
        assertThat(body).doesNotContain("opportunity");
        assertThat(body).doesNotContain("outperform");
        assertThat(body).doesNotContain("is above");
        assertThat(body).doesNotContain("below average");
        assertThat(body).doesNotContain("guaranteed");
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /** Builds a representative populated (available=true, full confidence) response. */
    private static BuyerAreaIntelligenceResponse populatedResponse() {
        BuyerAreaIntelligenceResponse.Metrics metrics = new BuyerAreaIntelligenceResponse.Metrics(
                new BuyerAreaIntelligenceResponse.Metric<>(10_000_000L, "Enough data"),
                new BuyerAreaIntelligenceResponse.Metric<>("apartment", "Enough data"),
                new BuyerAreaIntelligenceResponse.Metric<>(30, "Enough data"),
                new BuyerAreaIntelligenceResponse.Metric<>(8, "Enough data"),
                new BuyerAreaIntelligenceResponse.Metric<>(new BigDecimal("82.50"), "Enough data"),
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet")
        );
        BuyerAreaIntelligenceResponse.PriceComparison priceComparison =
                new BuyerAreaIntelligenceResponse.PriceComparison(
                        true,
                        "This area may be above similar visible listings"
                );
        BuyerAreaIntelligenceResponse.ListingsCta cta =
                new BuyerAreaIntelligenceResponse.ListingsCta(
                        "IN|KA|Udupi|Malpe", "View listings in Malpe"
                );
        return new BuyerAreaIntelligenceResponse(
                "udupi",
                "IN|KA|Udupi|Malpe",
                "Malpe",
                true,
                "Enough data",
                metrics,
                priceComparison,
                cta
        );
    }

    /** Builds an UNAVAILABLE response (available=false, all metrics null). */
    private static BuyerAreaIntelligenceResponse unavailableResponse(String citySlug, String areaKey) {
        BuyerAreaIntelligenceResponse.Metrics metrics = new BuyerAreaIntelligenceResponse.Metrics(
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet"),
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet"),
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet"),
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet"),
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet"),
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet")
        );
        BuyerAreaIntelligenceResponse.PriceComparison priceComparison =
                new BuyerAreaIntelligenceResponse.PriceComparison(false, null);
        BuyerAreaIntelligenceResponse.ListingsCta cta =
                new BuyerAreaIntelligenceResponse.ListingsCta(areaKey, "View listings in this area");
        return new BuyerAreaIntelligenceResponse(
                citySlug,
                areaKey,
                null,
                false,
                "Not enough data yet",
                metrics,
                priceComparison,
                cta
        );
    }
}
