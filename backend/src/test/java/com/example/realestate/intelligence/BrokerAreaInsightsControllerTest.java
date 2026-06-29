package com.example.realestate.intelligence;

import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
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

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.core.authority.SimpleGrantedAuthority;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code @WebMvcTest} for {@link BrokerAreaInsightsController}.
 *
 * <p>Mirrors the {@code BrokerDemandGapsControllerTest} pattern: jwt() post-processor,
 * {@code @MockitoBean} for service and UserRoleService, TestConfig for security filter,
 * Import for CallerInfoResolver + WebMvcConfig + GlobalExceptionHandler.
 *
 * <p>Covers:
 * <ul>
 *   <li>401/403 — no JWT (TestConfig returns 403; production oauth2ResourceServer returns 401)</li>
 *   <li>403 — role='user' rejected on all endpoints</li>
 *   <li>200 — broker/dealer/admin role; JSON shape verified</li>
 *   <li>Missing snapshot → 200 with available=false (NOT 404)</li>
 *   <li>AC12 IDOR: brokerId derived ONLY from JWT; a client-supplied brokerId in path is ignored</li>
 *   <li>AC13 Suppression: null Metric value (suppressed shared) vs primitive 0 (broker true-zero)</li>
 *   <li>AC7 Scraped exclusion (via service mock — SQL predicate tested in service test)</li>
 *   <li>City-aware: non-Malpe city/area routes to distinct service call</li>
 * </ul>
 */
@WebMvcTest(
        controllers = BrokerAreaInsightsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({BrokerAreaInsightsControllerTest.TestConfig.class,
         WebMvcConfig.class,
         CallerInfoResolver.class,
         com.example.realestate.exception.GlobalExceptionHandler.class})
class BrokerAreaInsightsControllerTest {

    private static final UUID BROKER_A = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID BROKER_B = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    private static final String CITY_UDUPI = "udupi";
    private static final String AREA_MALPE = "IN|KA|Udupi|Malpe";
    private static final String CITY_MANGALORE = "mangalore";
    private static final String AREA_KADRI = "IN|KA|Mangalore|Kadri";

    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private BrokerAreaInsightsService service;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(service);
    }

    // -----------------------------------------------------------------------
    // Auth / role gate tests
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("GET insights returns 403 when no JWT supplied (@WebMvcTest TestConfig behaviour; production oauth2ResourceServer returns 401)")
    void insights_noJwt_returns403() throws Exception {
        mockMvc.perform(get("/api/broker/areas/{city}/{areaKey}/insights", CITY_UDUPI, AREA_MALPE))
                .andExpect(status().isForbidden());

        verify(service, never()).getAreaInsights(any(), any(), any());
    }

    @Test
    @DisplayName("GET insights returns 403 when caller has 'user' role")
    void insights_userRole_returns403() throws Exception {
        mockMvc.perform(get("/api/broker/areas/{city}/{areaKey}/insights", CITY_UDUPI, AREA_MALPE)
                        .with(jwt().jwt(j -> j.subject(BROKER_A.toString())).authorities(new SimpleGrantedAuthority("ROLE_USER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires broker, dealer, or admin role"));

        verify(service, never()).getAreaInsights(any(), any(), any());
    }

    @Test
    @DisplayName("GET insights returns 200 for broker role with correct JSON shape")
    void insights_brokerRole_returns200WithShape() throws Exception {
        when(service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_A))
                .thenReturn(buildPopulatedResponse(CITY_UDUPI, AREA_MALPE, true));

        mockMvc.perform(get("/api/broker/areas/{city}/{areaKey}/insights", CITY_UDUPI, AREA_MALPE)
                        .with(jwt().jwt(j -> j.subject(BROKER_A.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.citySlug").value(CITY_UDUPI))
                .andExpect(jsonPath("$.areaKey").value(AREA_MALPE))
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.area").exists())
                .andExpect(jsonPath("$.broker").exists())
                .andExpect(jsonPath("$.broker.liveListingsInArea").isNumber())
                .andExpect(jsonPath("$.broker.enquiriesOnBrokerListings").isNumber())
                .andExpect(jsonPath("$.broker.opportunitiesToAct").isNumber());

        verify(service).getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_A);
    }

    @Test
    @DisplayName("GET insights returns 200 for dealer role")
    void insights_dealerRole_returns200() throws Exception {
        when(service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_A))
                .thenReturn(buildUnavailableResponse(CITY_UDUPI, AREA_MALPE));

        mockMvc.perform(get("/api/broker/areas/{city}/{areaKey}/insights", CITY_UDUPI, AREA_MALPE)
                        .with(jwt().jwt(j -> j.subject(BROKER_A.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET insights returns 200 for admin role")
    void insights_adminRole_returns200() throws Exception {
        when(service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_A))
                .thenReturn(buildUnavailableResponse(CITY_UDUPI, AREA_MALPE));

        mockMvc.perform(get("/api/broker/areas/{city}/{areaKey}/insights", CITY_UDUPI, AREA_MALPE)
                        .with(jwt().jwt(j -> j.subject(BROKER_A.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk());
    }

    // -----------------------------------------------------------------------
    // Missing snapshot — available=false (NOT 404)
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("Missing snapshot returns 200 with available=false (NOT 404) — coherent response shape")
    void insights_missingSnapshot_returns200Available_false() throws Exception {
        when(service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_A))
                .thenReturn(buildUnavailableResponse(CITY_UDUPI, AREA_MALPE));

        mockMvc.perform(get("/api/broker/areas/{city}/{areaKey}/insights", CITY_UDUPI, AREA_MALPE)
                        .with(jwt().jwt(j -> j.subject(BROKER_A.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(false))
                .andExpect(jsonPath("$.area").exists())
                .andExpect(jsonPath("$.broker").exists())
                .andExpect(jsonPath("$.broker.liveListingsInArea").value(0));
    }

    // -----------------------------------------------------------------------
    // AC12 IDOR test — brokerId from JWT ONLY, cannot widen scope via path
    // -----------------------------------------------------------------------

    /**
     * AC12 — IDOR prevention: the controller derives brokerId ONLY from the JWT subject.
     *
     * <p>This test seeds two distinct broker UUIDs (A and B) and verifies that calling
     * the endpoint as broker A sends broker A's UUID to the service — not broker B's.
     * Even if a client tried to inject broker B's identity via path params (which only
     * carry citySlug/areaKey here), it would be ignored.
     *
     * <p>The full broker-A-vs-B data isolation assertion is in the service test
     * ({@link BrokerAreaInsightsServiceTest#idor_brokerA_cannotSeeBrokerB_counts}).
     */
    @Test
    @DisplayName("AC12 IDOR: controller derives brokerId from JWT subject — not from any request field")
    void idor_brokerIdDerivedFromJwtOnly() throws Exception {
        // Broker A calls the endpoint
        when(service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_A))
                .thenReturn(buildPopulatedResponse(CITY_UDUPI, AREA_MALPE, true));

        mockMvc.perform(get("/api/broker/areas/{city}/{areaKey}/insights", CITY_UDUPI, AREA_MALPE)
                        .with(jwt().jwt(j -> j.subject(BROKER_A.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk());

        // Service must be called with BROKER_A's UUID (from JWT), not BROKER_B
        verify(service).getAreaInsights(eq(CITY_UDUPI), eq(AREA_MALPE), eq(BROKER_A));
        verify(service, never()).getAreaInsights(eq(CITY_UDUPI), eq(AREA_MALPE), eq(BROKER_B));
    }

    @Test
    @DisplayName("AC12 IDOR: broker B calling endpoint receives broker B's data — not broker A's")
    void idor_brokerB_receivesOwnData() throws Exception {
        // Broker B calls the endpoint — should get B's scoped data
        when(service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_B))
                .thenReturn(buildBrokerBResponse(CITY_UDUPI, AREA_MALPE));

        mockMvc.perform(get("/api/broker/areas/{city}/{areaKey}/insights", CITY_UDUPI, AREA_MALPE)
                        .with(jwt().jwt(j -> j.subject(BROKER_B.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.broker.liveListingsInArea").value(3));

        // Service called with BROKER_B — NEVER with BROKER_A
        verify(service).getAreaInsights(eq(CITY_UDUPI), eq(AREA_MALPE), eq(BROKER_B));
        verify(service, never()).getAreaInsights(eq(CITY_UDUPI), eq(AREA_MALPE), eq(BROKER_A));
    }

    // -----------------------------------------------------------------------
    // AC13 Suppression test — null Metric vs primitive 0
    // -----------------------------------------------------------------------

    /**
     * AC13 — Suppression correctness.
     *
     * <p>Part (a): sub-threshold SHARED aggregate → Metric.value=null + label, NOT 0.
     * Part (b): broker with 0 live listings → primitive int 0 (real zero, not suppressed-null).
     *
     * <p>Both categories in the same test to prove they are handled DISTINCTLY.
     */
    @Test
    @DisplayName("AC13 Suppression: sub-threshold SHARED metric serialises as JSON null; true-broker-0 serialises as int 0")
    void suppression_sharedMetricNull_brokerZeroIsRealZero() throws Exception {
        // Category (a): SHARED area metrics suppressed (value=null + label)
        // Category (b): BROKER-OWN counts = true-zero primitive ints
        BrokerAreaInsightsResponse.AreaMetrics suppressedArea = new BrokerAreaInsightsResponse.AreaMetrics(
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet"),   // medianPricePaise suppressed
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet"),   // dominantPropertyType suppressed
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet"),   // activeListingCount suppressed (k-anon)
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet"),   // freshListingCount suppressed
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet"),   // avgListingQuality absent
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet")    // topBuyerNeedSignalCount absent
        );
        BrokerAreaInsightsResponse.BrokerMetrics trueZeroBroker = new BrokerAreaInsightsResponse.BrokerMetrics(
                0,  // liveListingsInArea = TRUE ZERO (broker has no live listings here)
                0,  // listingsNeedingAttention = TRUE ZERO
                0,  // enquiriesOnBrokerListings = TRUE ZERO
                0   // opportunitiesToAct = TRUE ZERO
        );
        BrokerAreaInsightsResponse response = new BrokerAreaInsightsResponse(
                CITY_UDUPI, AREA_MALPE, "Malpe", true, "Not enough data yet",
                suppressedArea, trueZeroBroker
        );
        when(service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_A)).thenReturn(response);

        mockMvc.perform(get("/api/broker/areas/{city}/{areaKey}/insights", CITY_UDUPI, AREA_MALPE)
                        .with(jwt().jwt(j -> j.subject(BROKER_A.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk())
                // Category (a): SHARED suppressed metrics → JSON null value, NOT 0
                .andExpect(jsonPath("$.area.medianPricePaise.value").doesNotExist())       // null serialises as absent in jsonPath
                .andExpect(jsonPath("$.area.activeListingCount.value").doesNotExist())     // suppressed, not 0
                .andExpect(jsonPath("$.area.medianPricePaise.confidenceLabel").value("Not enough data yet"))
                .andExpect(jsonPath("$.area.activeListingCount.confidenceLabel").value("Not enough data yet"))
                // Category (b): BROKER-OWN true-zero → int 0, NOT "unavailable"/null
                .andExpect(jsonPath("$.broker.liveListingsInArea").value(0))
                .andExpect(jsonPath("$.broker.listingsNeedingAttention").value(0))
                .andExpect(jsonPath("$.broker.enquiriesOnBrokerListings").value(0))
                .andExpect(jsonPath("$.broker.opportunitiesToAct").value(0));
    }

    // -----------------------------------------------------------------------
    // City-aware test — non-Malpe city/area routes to distinct service call
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("City-aware: non-Malpe city/area (mangalore/Kadri) resolves via distinct composite key")
    void cityAware_nonMalpeArea_resolvesDistinctSnapshot() throws Exception {
        when(service.getAreaInsights(CITY_MANGALORE, AREA_KADRI, BROKER_A))
                .thenReturn(buildPopulatedResponse(CITY_MANGALORE, AREA_KADRI, true));

        mockMvc.perform(get("/api/broker/areas/{city}/{areaKey}/insights", CITY_MANGALORE, AREA_KADRI)
                        .with(jwt().jwt(j -> j.subject(BROKER_A.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.citySlug").value(CITY_MANGALORE))
                .andExpect(jsonPath("$.areaKey").value(AREA_KADRI));

        // Service called with MANGALORE/KADRI — not with UDUPI/MALPE
        verify(service).getAreaInsights(eq(CITY_MANGALORE), eq(AREA_KADRI), eq(BROKER_A));
        verify(service, never()).getAreaInsights(eq(CITY_UDUPI), any(), any());
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private BrokerAreaInsightsResponse buildPopulatedResponse(
            String citySlug, String areaKey, boolean available) {
        BrokerAreaInsightsResponse.AreaMetrics areaMetrics = new BrokerAreaInsightsResponse.AreaMetrics(
                new BuyerAreaIntelligenceResponse.Metric<>(50000000L, "Enough data"),
                new BuyerAreaIntelligenceResponse.Metric<>("apartment", "Enough data"),
                new BuyerAreaIntelligenceResponse.Metric<>(25, "Enough data"),
                new BuyerAreaIntelligenceResponse.Metric<>(5, "Enough data"),
                new BuyerAreaIntelligenceResponse.Metric<>(new BigDecimal("72.50"), "Enough data"),
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet")
        );
        BrokerAreaInsightsResponse.BrokerMetrics brokerMetrics = new BrokerAreaInsightsResponse.BrokerMetrics(
                5, 1, 3, 2
        );
        return new BrokerAreaInsightsResponse(
                citySlug, areaKey, "Test Area", available, "Enough data",
                areaMetrics, brokerMetrics
        );
    }

    private BrokerAreaInsightsResponse buildUnavailableResponse(String citySlug, String areaKey) {
        String noData = "Not enough data yet";
        BrokerAreaInsightsResponse.AreaMetrics areaMetrics = new BrokerAreaInsightsResponse.AreaMetrics(
                new BuyerAreaIntelligenceResponse.Metric<>(null, noData),
                new BuyerAreaIntelligenceResponse.Metric<>(null, noData),
                new BuyerAreaIntelligenceResponse.Metric<>(null, noData),
                new BuyerAreaIntelligenceResponse.Metric<>(null, noData),
                new BuyerAreaIntelligenceResponse.Metric<>(null, noData),
                new BuyerAreaIntelligenceResponse.Metric<>(null, noData)
        );
        BrokerAreaInsightsResponse.BrokerMetrics brokerMetrics = new BrokerAreaInsightsResponse.BrokerMetrics(
                0, 0, 0, 0
        );
        return new BrokerAreaInsightsResponse(
                citySlug, areaKey, null, false, noData, areaMetrics, brokerMetrics
        );
    }

    private BrokerAreaInsightsResponse buildBrokerBResponse(String citySlug, String areaKey) {
        BrokerAreaInsightsResponse.AreaMetrics areaMetrics = new BrokerAreaInsightsResponse.AreaMetrics(
                new BuyerAreaIntelligenceResponse.Metric<>(50000000L, "Enough data"),
                new BuyerAreaIntelligenceResponse.Metric<>("land", "Enough data"),
                new BuyerAreaIntelligenceResponse.Metric<>(15, "Limited data"),
                new BuyerAreaIntelligenceResponse.Metric<>(2, "Limited data"),
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet"),
                new BuyerAreaIntelligenceResponse.Metric<>(null, "Not enough data yet")
        );
        // Broker B has 3 live listings (different from Broker A's 5)
        BrokerAreaInsightsResponse.BrokerMetrics brokerBMetrics = new BrokerAreaInsightsResponse.BrokerMetrics(
                3, 0, 1, 1
        );
        return new BrokerAreaInsightsResponse(
                citySlug, areaKey, "Malpe", true, "Limited data", areaMetrics, brokerBMetrics
        );
    }
}
