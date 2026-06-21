package com.example.realestate.listing.api;

import com.example.realestate.listing.crud.BrokerDashboardService;
import com.example.realestate.listing.crud.ListingCrudService;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.listing.workflow.ListingWorkflowService;
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

import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for GET /api/listings/mine/quality-summary on ListingController.
 *
 * <p>Mirrors the patterns in {@link ListingControllerTest}: jwt() post-processor,
 * {@code UserRoleService} mock for role-based CallerInfo resolution, and
 * {@code @MockitoBean BrokerDashboardService} for the service call.
 *
 * <p>Coverage:
 * <ul>
 *   <li>AC8 / Gate F: role matrix — dealer/broker/admin → 200; viewer → 403; no-JWT → 401/403
 *   <li>JSON shape: all five top-level blocks present with correct field names
 *   <li>Null-honest: averageQualityScore null propagates through controller unchanged
 *   <li>Ownership: endpoint invokes service with caller.userId() derived from JWT; no brokerId param
 *   <li>No brokerId param: endpoint accepts no brokerId query param (service scopes by userId internally)
 * </ul>
 */
@WebMvcTest(
        controllers = ListingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({BrokerQualitySummaryControllerTest.TestConfig.class, WebMvcConfig.class,
        CallerInfoResolver.class, com.example.realestate.exception.GlobalExceptionHandler.class})
class BrokerQualitySummaryControllerTest {

    private static final UUID BROKER_ID = UUID.fromString("00000000-0000-0000-0000-000000000011");
    private static final UUID ADMIN_ID  = UUID.fromString("00000000-0000-0000-0000-000000000012");

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

    // Required mocks for ListingController's other injected dependencies
    @MockitoBean private ListingCrudService listingCrudService;
    @MockitoBean private ListingWorkflowService listingWorkflowService;
    @MockitoBean private ListingImageRepository listingImageRepository;
    @MockitoBean private ListingResponseMapper listingResponseMapper;
    @MockitoBean private UserRoleService userRoleService;
    @MockitoBean private BrokerDashboardService brokerDashboardService;

    /** A fully-populated response representing a COMPLETE portfolio with all fields non-null. */
    private BrokerQualitySummaryResponse fullResponse;

    @BeforeEach
    void setUp() {
        reset(userRoleService, brokerDashboardService);

        fullResponse = new BrokerQualitySummaryResponse(
                new BrokerQualitySummaryResponse.Portfolio(3, 5),
                new BrokerQualitySummaryResponse.Quality("COMPLETE", 82, 5, 5, 100),
                new BrokerQualitySummaryResponse.ActionSignals(
                        new BrokerQualitySummaryResponse.ActionSignalBucket(1, "COMPLETE"),
                        new BrokerQualitySummaryResponse.ActionSignalBucket(0, "COMPLETE"),
                        new BrokerQualitySummaryResponse.ActionSignalBucket(2, "COMPLETE"),
                        new BrokerQualitySummaryResponse.ActionSignalBucket(3, "COMPLETE")
                ),
                new BrokerQualitySummaryResponse.Engagement(
                        "UNAVAILABLE", null, null,
                        "Engagement tracking is not yet available (#1531)"),
                new BrokerQualitySummaryResponse.DemandGap(
                        "LIMITED_DATA", null,
                        "Demand gap analysis requires area-level demand signals (M30)")
        );
    }

    // ==================== Role matrix: 200 paths ====================

    @Test
    @DisplayName("qualitySummary: dealer role → 200 with all five response blocks")
    void qualitySummary_withDealerRole_returns200WithAllBlocks() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("dealer"));
        when(brokerDashboardService.getQualitySummary(BROKER_ID)).thenReturn(fullResponse);

        mockMvc.perform(get("/api/listings/mine/quality-summary")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk())
                // portfolio block
                .andExpect(jsonPath("$.portfolio.activeListings").value(3))
                .andExpect(jsonPath("$.portfolio.totalListings").value(5))
                // quality block
                .andExpect(jsonPath("$.quality.state").value("COMPLETE"))
                .andExpect(jsonPath("$.quality.averageQualityScore").value(82))
                .andExpect(jsonPath("$.quality.countComputed").value(5))
                .andExpect(jsonPath("$.quality.countTotal").value(5))
                .andExpect(jsonPath("$.quality.percentageComputed").value(100))
                // actionSignals block
                .andExpect(jsonPath("$.actionSignals.needsFixes.count").value(1))
                .andExpect(jsonPath("$.actionSignals.needsFixes.state").value("COMPLETE"))
                .andExpect(jsonPath("$.actionSignals.missingLocation.count").value(0))
                .andExpect(jsonPath("$.actionSignals.incomplete.count").value(2))
                .andExpect(jsonPath("$.actionSignals.buyerReady.count").value(3))
                // engagement stub
                .andExpect(jsonPath("$.engagement.state").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.engagement.views").doesNotExist())
                // demandGap stub
                .andExpect(jsonPath("$.demandGap.state").value("LIMITED_DATA"))
                .andExpect(jsonPath("$.demandGap.signal").doesNotExist());

        verify(brokerDashboardService).getQualitySummary(BROKER_ID);
    }

    @Test
    @DisplayName("qualitySummary: broker role → 200")
    void qualitySummary_withBrokerRole_returns200() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));
        when(brokerDashboardService.getQualitySummary(BROKER_ID)).thenReturn(fullResponse);

        mockMvc.perform(get("/api/listings/mine/quality-summary")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quality.state").value("COMPLETE"));

        verify(brokerDashboardService).getQualitySummary(BROKER_ID);
    }

    @Test
    @DisplayName("qualitySummary: admin role → 200")
    void qualitySummary_withAdminRole_returns200() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        when(brokerDashboardService.getQualitySummary(ADMIN_ID)).thenReturn(fullResponse);

        mockMvc.perform(get("/api/listings/mine/quality-summary")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isOk());

        verify(brokerDashboardService).getQualitySummary(ADMIN_ID);
    }

    @Test
    @DisplayName("qualitySummary: user role → 200 (user is an allowed role)")
    void qualitySummary_withUserRole_returns200() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("user"));
        when(brokerDashboardService.getQualitySummary(BROKER_ID)).thenReturn(fullResponse);

        mockMvc.perform(get("/api/listings/mine/quality-summary")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk());

        verify(brokerDashboardService).getQualitySummary(BROKER_ID);
    }

    // ==================== Role matrix: 403 paths ====================

    @Test
    @DisplayName("qualitySummary: viewer role → 403 with role-error message")
    void qualitySummary_withViewerRole_returnsForbidden() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("viewer"));

        mockMvc.perform(get("/api/listings/mine/quality-summary")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires broker, dealer, user, or admin role"));

        verify(brokerDashboardService, never()).getQualitySummary(any());
    }

    @Test
    @DisplayName("qualitySummary: no JWT → 403 (Spring Security blocks unauthenticated)")
    void qualitySummary_withoutJwt_returnsForbidden() throws Exception {
        mockMvc.perform(get("/api/listings/mine/quality-summary"))
                .andExpect(status().isForbidden());

        verify(brokerDashboardService, never()).getQualitySummary(any());
    }

    // ==================== Null-honest: PENDING state ====================

    @Test
    @DisplayName("qualitySummary: PENDING state — averageQualityScore null, percentageComputed null when zero listings")
    void qualitySummary_pendingState_nullScoreAndNullPercentage() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        BrokerQualitySummaryResponse pendingResponse = new BrokerQualitySummaryResponse(
                new BrokerQualitySummaryResponse.Portfolio(0, 0),
                new BrokerQualitySummaryResponse.Quality("PENDING", null, 0, 0, null),
                new BrokerQualitySummaryResponse.ActionSignals(
                        new BrokerQualitySummaryResponse.ActionSignalBucket(0, "PENDING"),
                        new BrokerQualitySummaryResponse.ActionSignalBucket(0, "PENDING"),
                        new BrokerQualitySummaryResponse.ActionSignalBucket(0, "PENDING"),
                        new BrokerQualitySummaryResponse.ActionSignalBucket(0, "PENDING")
                ),
                new BrokerQualitySummaryResponse.Engagement("UNAVAILABLE", null, null, "stub"),
                new BrokerQualitySummaryResponse.DemandGap("LIMITED_DATA", null, "stub")
        );
        when(brokerDashboardService.getQualitySummary(BROKER_ID)).thenReturn(pendingResponse);

        mockMvc.perform(get("/api/listings/mine/quality-summary")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quality.state").value("PENDING"))
                // null values must serialise as JSON null, not 0
                .andExpect(jsonPath("$.quality.averageQualityScore").isEmpty())
                .andExpect(jsonPath("$.quality.percentageComputed").isEmpty())
                .andExpect(jsonPath("$.quality.countComputed").value(0))
                .andExpect(jsonPath("$.quality.countTotal").value(0))
                .andExpect(jsonPath("$.portfolio.activeListings").value(0))
                .andExpect(jsonPath("$.portfolio.totalListings").value(0));
    }

    // ==================== Ownership: userId derived from JWT, not from param ====================

    @Test
    @DisplayName("qualitySummary: service called with JWT-derived userId, not a request param")
    void qualitySummary_serviceCalledWithJwtUserId_notRequestParam() throws Exception {
        UUID jwtUserId = UUID.fromString("00000000-0000-0000-0000-000000000099");
        when(userRoleService.getUserRole(jwtUserId)).thenReturn(Optional.of("broker"));
        when(brokerDashboardService.getQualitySummary(jwtUserId)).thenReturn(fullResponse);

        // No brokerId param in the request — the endpoint must still pass jwtUserId to service
        mockMvc.perform(get("/api/listings/mine/quality-summary")
                        .with(jwt().jwt(j -> j.subject(jwtUserId.toString()))))
                .andExpect(status().isOk());

        // Verify exactly jwtUserId was passed — not any other UUID
        verify(brokerDashboardService).getQualitySummary(jwtUserId);
        verify(brokerDashboardService, never()).getQualitySummary(BROKER_ID);
    }

    @Test
    @DisplayName("qualitySummary: brokerId query param is ignored — endpoint scopes by JWT userId only")
    void qualitySummary_withBrokerIdParam_paramIsIgnored() throws Exception {
        UUID callerUserId = UUID.fromString("00000000-0000-0000-0000-000000000022");
        UUID anotherBrokerId = UUID.fromString("00000000-0000-0000-0000-000000000033");
        when(userRoleService.getUserRole(callerUserId)).thenReturn(Optional.of("broker"));
        when(brokerDashboardService.getQualitySummary(callerUserId)).thenReturn(fullResponse);

        // Supply a brokerId param that differs from the JWT subject
        mockMvc.perform(get("/api/listings/mine/quality-summary")
                        .param("brokerId", anotherBrokerId.toString())
                        .with(jwt().jwt(j -> j.subject(callerUserId.toString()))))
                .andExpect(status().isOk());

        // Must be called with the JWT-derived userId, not the param
        verify(brokerDashboardService).getQualitySummary(callerUserId);
        verify(brokerDashboardService, never()).getQualitySummary(anotherBrokerId);
    }

    // ==================== PARTIAL state JSON shape ====================

    @Test
    @DisplayName("qualitySummary: PARTIAL state — countComputed < countTotal, averageQualityScore non-null")
    void qualitySummary_partialState_correctCountsAndAverage() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        BrokerQualitySummaryResponse partialResponse = new BrokerQualitySummaryResponse(
                new BrokerQualitySummaryResponse.Portfolio(2, 4),
                new BrokerQualitySummaryResponse.Quality("PARTIAL", 71, 2, 4, 50),
                new BrokerQualitySummaryResponse.ActionSignals(
                        new BrokerQualitySummaryResponse.ActionSignalBucket(1, "PARTIAL"),
                        new BrokerQualitySummaryResponse.ActionSignalBucket(1, "PARTIAL"),
                        new BrokerQualitySummaryResponse.ActionSignalBucket(2, "PARTIAL"),
                        new BrokerQualitySummaryResponse.ActionSignalBucket(0, "PARTIAL")
                ),
                new BrokerQualitySummaryResponse.Engagement("UNAVAILABLE", null, null, "stub"),
                new BrokerQualitySummaryResponse.DemandGap("LIMITED_DATA", null, "stub")
        );
        when(brokerDashboardService.getQualitySummary(BROKER_ID)).thenReturn(partialResponse);

        mockMvc.perform(get("/api/listings/mine/quality-summary")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quality.state").value("PARTIAL"))
                .andExpect(jsonPath("$.quality.averageQualityScore").value(71))
                .andExpect(jsonPath("$.quality.countComputed").value(2))
                .andExpect(jsonPath("$.quality.countTotal").value(4))
                .andExpect(jsonPath("$.quality.percentageComputed").value(50))
                .andExpect(jsonPath("$.actionSignals.needsFixes.state").value("PARTIAL"))
                .andExpect(jsonPath("$.actionSignals.missingLocation.count").value(1));
    }
}
