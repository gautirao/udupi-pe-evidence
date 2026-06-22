package com.example.realestate.broker.demand;

import com.example.realestate.intelligence.BuyerAreaIntelligenceResponse.Metric;
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
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code @WebMvcTest} for {@link BrokerDemandGapsController}.
 *
 * <p>Mirrors the {@code BrokerMarketFocusControllerTest} pattern: jwt() post-processor,
 * {@code @MockitoBean} for service and UserRoleService, TestConfig for security filter,
 * Import for CallerInfoResolver + WebMvcConfig + GlobalExceptionHandler.
 *
 * <p>Covers:
 * <ul>
 *   <li>401 (unauthenticated) — no JWT supplied</li>
 *   <li>403 (role gate) — "user" role rejected on all endpoints</li>
 *   <li>200 happy path — broker/dealer/admin role</li>
 *   <li>GET /api/broker/demand-gaps page payload shape</li>
 *   <li>GET /api/broker/alerts?status=open|all contract</li>
 *   <li>POST /api/broker/alerts/{id}/read and /dismiss 204 + 404 paths</li>
 *   <li>broker_id is derived from JWT (never from request)</li>
 * </ul>
 */
@WebMvcTest(
        controllers = BrokerDemandGapsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({BrokerDemandGapsControllerTest.TestConfig.class,
         WebMvcConfig.class,
         CallerInfoResolver.class,
         com.example.realestate.exception.GlobalExceptionHandler.class})
class BrokerDemandGapsControllerTest {

    private static final UUID BROKER_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID STATE_ID  = UUID.fromString("11111111-1111-1111-1111-111111111111");

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
    private BrokerDemandGapsService service;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(service, userRoleService);
    }

    // -----------------------------------------------------------------------
    // Auth / role gate tests (shared across all endpoints)
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("GET /demand-gaps returns 403 when no JWT supplied (@WebMvcTest TestConfig behaviour; production oauth2ResourceServer returns 401)")
    void demandGaps_noJwt_returns403() throws Exception {
        // In production (JwtConfig with oauth2ResourceServer), a missing JWT yields 401.
        // In @WebMvcTest with the simplified TestConfig (no oauth2ResourceServer configured),
        // Spring Security's default access-denied handler fires with 403.
        // This assertion matches the actual @WebMvcTest behaviour — consistent with
        // BrokerMarketFocusControllerTest.get_noJwt_returnsForbidden() precedent.
        mockMvc.perform(get("/api/broker/demand-gaps"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("GET /demand-gaps returns 403 when caller has 'user' role")
    void demandGaps_userRole_returns403() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("user"));

        mockMvc.perform(get("/api/broker/demand-gaps")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires broker, dealer, or admin role"));
    }

    @Test
    @DisplayName("GET /alerts returns 403 when caller has 'user' role")
    void alerts_userRole_returns403() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("user"));

        mockMvc.perform(get("/api/broker/alerts")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("POST /alerts/{id}/read returns 403 for 'user' role")
    void markRead_userRole_returns403() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("user"));

        mockMvc.perform(post("/api/broker/alerts/{id}/read", STATE_ID)
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("POST /alerts/{id}/dismiss returns 403 for 'user' role")
    void dismiss_userRole_returns403() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("user"));

        mockMvc.perform(post("/api/broker/alerts/{id}/dismiss", STATE_ID)
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isForbidden());
    }

    // -----------------------------------------------------------------------
    // GET /api/broker/demand-gaps — happy paths
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("GET /demand-gaps returns 200 with page payload for broker role")
    void demandGaps_brokerRole_returns200() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        BrokerDemandGapsResponse.Summary summary = new BrokerDemandGapsResponse.Summary(
                new Metric<>(42L, "Enough data"),
                new Metric<>(7L, "Enough data"),
                3, 1, 2
        );
        BrokerDemandGapsResponse response = new BrokerDemandGapsResponse(
                summary, List.of(), List.of(), List.of());
        when(service.getDemandGaps(BROKER_ID)).thenReturn(response);

        mockMvc.perform(get("/api/broker/demand-gaps")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.demandGapsFound").value(3))
                .andExpect(jsonPath("$.summary.brokerMatchingListings").value(1))
                .andExpect(jsonPath("$.summary.opportunitiesToAct").value(2))
                .andExpect(jsonPath("$.summary.buyerSearches.value").value(42))
                .andExpect(jsonPath("$.summary.buyerEnquiries.value").value(7))
                .andExpect(jsonPath("$.topGaps").isArray())
                .andExpect(jsonPath("$.allGaps").isArray())
                .andExpect(jsonPath("$.captureDemandListings").isArray());

        verify(service).getDemandGaps(BROKER_ID);
    }

    @Test
    @DisplayName("GET /demand-gaps: null metric values serialise as JSON null (k-anon null-honesty)")
    void demandGaps_suppressedMetrics_serializeAsNull() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        // Summary with null buyerSearches/buyerEnquiries (all suppressed)
        BrokerDemandGapsResponse.Summary summary = new BrokerDemandGapsResponse.Summary(
                new Metric<>(null, "Not enough data yet"),
                new Metric<>(null, "Not enough data yet"),
                0, 0, 0
        );
        BrokerDemandGapsResponse response = new BrokerDemandGapsResponse(
                summary, List.of(), List.of(), List.of());
        when(service.getDemandGaps(BROKER_ID)).thenReturn(response);

        mockMvc.perform(get("/api/broker/demand-gaps")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk())
                // null values must serialise as JSON null, never as 0
                .andExpect(jsonPath("$.summary.buyerSearches.value").doesNotExist())
                .andExpect(jsonPath("$.summary.buyerEnquiries.value").doesNotExist());
    }

    @Test
    @DisplayName("GET /demand-gaps is allowed for dealer role")
    void demandGaps_dealerRole_returns200() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("dealer"));
        when(service.getDemandGaps(BROKER_ID)).thenReturn(emptyResponse());

        mockMvc.perform(get("/api/broker/demand-gaps")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET /demand-gaps is allowed for admin role")
    void demandGaps_adminRole_returns200() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("admin"));
        when(service.getDemandGaps(BROKER_ID)).thenReturn(emptyResponse());

        mockMvc.perform(get("/api/broker/demand-gaps")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk());
    }

    // -----------------------------------------------------------------------
    // GET /api/broker/alerts
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("GET /alerts returns 200 with open gaps by default")
    void alerts_defaultStatus_returns200() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        BrokerDemandGapsResponse.GapItem gap = buildGapItem();
        when(service.getAlerts(BROKER_ID, "open")).thenReturn(List.of(gap));

        mockMvc.perform(get("/api/broker/alerts")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].areaKey").value("IN|KA|Udupi|Manipal"))
                .andExpect(jsonPath("$[0].signalType").value("supply_gap"))
                .andExpect(jsonPath("$[0].actionType").value("add_listing"));

        verify(service).getAlerts(BROKER_ID, "open");
    }

    @Test
    @DisplayName("GET /alerts?status=all includes dismissed gaps")
    void alerts_allStatus_returns200() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));
        when(service.getAlerts(BROKER_ID, "all")).thenReturn(List.of());

        mockMvc.perform(get("/api/broker/alerts")
                        .param("status", "all")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk());

        verify(service).getAlerts(BROKER_ID, "all");
    }

    @Test
    @DisplayName("GET /alerts?status=invalid returns 400")
    void alerts_invalidStatus_returns400() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        mockMvc.perform(get("/api/broker/alerts")
                        .param("status", "pending")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("status must be 'open' or 'all'"));
    }

    // -----------------------------------------------------------------------
    // POST /api/broker/alerts/{id}/read
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("POST /alerts/{id}/read returns 204 on success")
    void markRead_success_returns204() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        mockMvc.perform(post("/api/broker/alerts/{id}/read", STATE_ID)
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isNoContent());

        verify(service).markRead(STATE_ID, BROKER_ID);
    }

    @Test
    @DisplayName("POST /alerts/{id}/read returns 404 when state row not found for caller")
    void markRead_notFound_returns404() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));
        doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Demand gap not found"))
                .when(service).markRead(STATE_ID, BROKER_ID);

        mockMvc.perform(post("/api/broker/alerts/{id}/read", STATE_ID)
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Demand gap not found"));
    }

    // -----------------------------------------------------------------------
    // POST /api/broker/alerts/{id}/dismiss
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("POST /alerts/{id}/dismiss returns 204 on success")
    void dismiss_success_returns204() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        mockMvc.perform(post("/api/broker/alerts/{id}/dismiss", STATE_ID)
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isNoContent());

        verify(service).dismiss(STATE_ID, BROKER_ID);
    }

    @Test
    @DisplayName("POST /alerts/{id}/dismiss returns 404 when state row not found (IDOR guard)")
    void dismiss_notFound_returns404() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));
        doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Demand gap not found"))
                .when(service).dismiss(STATE_ID, BROKER_ID);

        mockMvc.perform(post("/api/broker/alerts/{id}/dismiss", STATE_ID)
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Demand gap not found"));
    }

    // -----------------------------------------------------------------------
    // broker_id derived from JWT (not request)
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("GET /demand-gaps uses broker_id from JWT, not from request; service called with JWT subject")
    void demandGaps_brokerIdFromJwt() throws Exception {
        UUID jwtBrokerId = UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc");
        when(userRoleService.getUserRole(jwtBrokerId)).thenReturn(Optional.of("broker"));
        when(service.getDemandGaps(jwtBrokerId)).thenReturn(emptyResponse());

        // No broker_id param in request — it comes from JWT subject only
        mockMvc.perform(get("/api/broker/demand-gaps")
                        .with(jwt().jwt(j -> j.subject(jwtBrokerId.toString()))))
                .andExpect(status().isOk());

        // Service MUST be called with the JWT-resolved UUID, not any request param
        verify(service).getDemandGaps(jwtBrokerId);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static BrokerDemandGapsResponse emptyResponse() {
        BrokerDemandGapsResponse.Summary summary = new BrokerDemandGapsResponse.Summary(
                new Metric<>(null, "Not enough data yet"),
                new Metric<>(null, "Not enough data yet"),
                0, 0, 0
        );
        return new BrokerDemandGapsResponse(summary, List.of(), List.of(), List.of());
    }

    private static BrokerDemandGapsResponse.GapItem buildGapItem() {
        return new BrokerDemandGapsResponse.GapItem(
                STATE_ID,
                "IN|KA|Udupi|Manipal",
                "land",
                "sale",
                "5L_20L",
                LocalDate.of(2026, 6, 16),  // a Monday
                new Metric<>(1.5f, "Enough data"),
                "supply_gap",
                "add_listing",
                new Metric<>("enough_data", "Enough data"),
                new Metric<>(3L, "Enough data"),
                0,
                null,
                null
        );
    }
}
