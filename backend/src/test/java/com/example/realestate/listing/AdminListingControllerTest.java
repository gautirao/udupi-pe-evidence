package com.example.realestate.listing;

import com.example.realestate.listing.api.ListingResponse;
import com.example.realestate.listing.exception.ListingNotArchivedException;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for AdminListingController (admin approve/reject endpoints).
 * Uses jwt() post-processor to inject JwtAuthenticationToken; mocks ListingWorkflowService.
 */
@WebMvcTest(
        controllers = AdminListingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({AdminListingControllerTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class})
class AdminListingControllerTest {

    private static final UUID ADMIN_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final UUID DEALER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");

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
    private ListingWorkflowService listingWorkflowService;

    @MockitoBean
    private ListingResponseMapper listingResponseMapper;

    @MockitoBean
    private AdminAuditService adminAuditService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(listingWorkflowService, listingResponseMapper, adminAuditService, userRoleService);
        // Delegate mapper to a minimal implementation so existing response-field assertions keep working.
        when(listingResponseMapper.toResponse(any(Listing.class))).thenAnswer(inv -> {
            Listing l = inv.getArgument(0);
            java.time.OffsetDateTime lastUpdatedAt = l.getLastUpdatedAt() != null
                    ? l.getLastUpdatedAt() : l.getUpdatedAt();
            boolean reraValid = l.getReraNumber() != null
                    && ListingController.RERA_PATTERN.matcher(l.getReraNumber()).matches();
            return new ListingResponse(
                    l.getId(), l.getListingNumber(), l.getDisplayId(),
                    l.getStatus(), l.getPropertyType(), l.getTitle(),
                    l.getLocality(), l.getPrice(), l.getDescription(),
                    l.getLandArea(), l.getBedrooms(), l.getBuiltArea(),
                    l.getLandAreaUnit(), l.getBuiltAreaUnit(),
                    l.getLatitude(), l.getLongitude(),
                    l.isAddressConfirmed(), l.getRejectionReason(),
                    l.getCreatedAt(), l.getUpdatedAt(),
                    0, null, l.getVideoUrl(),
                    l.getReraNumber(), l.getListingPurpose(),
                    l.getCarpetArea(), l.getCarpetAreaUnit(),
                    l.getFloorNumber(), l.getTotalFloors(),
                    l.getFurnishingStatus(), l.getWashrooms(), l.getParkingCount(),
                    l.getRoadFrontageFt(), l.getCommercialUsage(), l.getNumberOfUnits(),
                    l.getMonthlyRent(), l.getSecurityDepositMonths(), l.getLockInMonths(),
                    l.getSellerType(), 0, false, lastUpdatedAt,
                    l.getFirstPublishedAt(), l.getPossessionStatus(),
                    l.getExpectedPossessionDate(), l.getApprovalsDeclared(), reraValid);
        });
    }

    // ==================== Test 1: Approve -> 200, LIVE ====================

    @Test
    void approve_withAdminRole_returns200WithLiveStatus() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));

        Listing approved = buildListing(LISTING_ID, "LIVE", "land", "Plot in Manipal",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        approved.setReviewedAt(OffsetDateTime.now());
        approved.setReviewedBy(ADMIN_ID);
        when(listingWorkflowService.approveListing(LISTING_ID, ADMIN_ID)).thenReturn(approved);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("LIVE"));

        verify(listingWorkflowService).approveListing(LISTING_ID, ADMIN_ID);
    }

    // ==================== Test 2: Reject with reason -> 200, REJECTED ====================

    @Test
    void reject_withReasonAndAdminRole_returns200WithRejectedStatus() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));

        Listing rejected = buildListing(LISTING_ID, "REJECTED", "house", "House",
                "Udupi", new BigDecimal("8000000"), "A house");
        rejected.setRejectionReason("Blurry images");
        rejected.setReviewedAt(OffsetDateTime.now());
        rejected.setReviewedBy(ADMIN_ID);
        when(listingWorkflowService.rejectListing(LISTING_ID, ADMIN_ID, "Blurry images"))
                .thenReturn(rejected);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"rejectionReason":"Blurry images"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.rejectionReason").value("Blurry images"));

        verify(listingWorkflowService).rejectListing(LISTING_ID, ADMIN_ID, "Blurry images");
    }

    // ==================== Test 3: Reject without reason -> 400 ====================

    @Test
    void reject_withoutReason_returns400() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"rejectionReason":""}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Rejection reason is required"));

        verify(listingWorkflowService, never()).rejectListing(any(), any(), any());
    }

    // ==================== Test 4: Reject with null reason -> 400 ====================

    @Test
    void reject_withNullReason_returns400() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Rejection reason is required"));

        verify(listingWorkflowService, never()).rejectListing(any(), any(), any());
    }

    // ==================== Test 5: Non-admin (broker) -> 403 ====================

    @Test
    void approve_withDealerRole_returns403() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires admin role"));

        verify(listingWorkflowService, never()).approveListing(any(), any());
    }

    // ==================== Test 6: No JWT -> 403 ====================

    @Test
    void approve_withoutJwt_returns403() throws Exception {
        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve"))
                .andExpect(status().isForbidden());
    }

    // ==================== Test 7: Approve wrong status -> 400 ====================

    @Test
    void approve_wrongStatus_returns400() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        when(listingWorkflowService.approveListing(LISTING_ID, ADMIN_ID))
                .thenThrow(new ListingStatusException(
                        "Cannot approve listing with status DRAFT"));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Cannot approve listing with status DRAFT"));
    }

    // ==================== Test 8: Approve not found -> 404 ====================

    @Test
    void approve_listingNotFound_returns404() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        when(listingWorkflowService.approveListing(LISTING_ID, ADMIN_ID))
                .thenThrow(new ListingNotFoundException(LISTING_ID));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== Test 9: Reject not found -> 404 ====================

    @Test
    void reject_listingNotFound_returns404() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        when(listingWorkflowService.rejectListing(LISTING_ID, ADMIN_ID, "Bad listing"))
                .thenThrow(new ListingNotFoundException(LISTING_ID));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"rejectionReason":"Bad listing"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== Test 10: Reject wrong status -> 400 ====================

    @Test
    void reject_wrongStatus_returns400() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        when(listingWorkflowService.rejectListing(LISTING_ID, ADMIN_ID, "Reason"))
                .thenThrow(new ListingStatusException(
                        "Cannot reject listing with status DRAFT"));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"rejectionReason":"Reason"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Cannot reject listing with status DRAFT"));
    }

    // ==================== RE-89: Restore endpoint ====================

    @Test
    void restore_withAdminRole_archivedListing_returns200WithDraftStatus() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));

        Listing restored = buildListing(LISTING_ID, "DRAFT", "land", "Plot in Manipal",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        when(listingWorkflowService.restoreListing(eq(LISTING_ID), any())).thenReturn(restored);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/restore")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("DRAFT"));

        verify(listingWorkflowService).restoreListing(eq(LISTING_ID), eq(ADMIN_ID));
        verify(adminAuditService).record(eq(ADMIN_ID), eq("listing_restored"), eq("listing"),
                eq(LISTING_ID), isNull(), anyString());
    }

    @Test
    void restore_listingNotArchived_returns409() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        when(listingWorkflowService.restoreListing(eq(LISTING_ID), any()))
                .thenThrow(new ListingNotArchivedException(LISTING_ID));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/restore")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Listing is not archived: " + LISTING_ID));

        verify(adminAuditService, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    void restore_listingNotFound_returns404() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        when(listingWorkflowService.restoreListing(eq(LISTING_ID), any()))
                .thenThrow(new ListingNotFoundException(LISTING_ID));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/restore")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    @Test
    void restore_withDealerRole_returns403() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/restore")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires admin role"));

        verify(listingWorkflowService, never()).restoreListing(any(), any());
    }

    // ==================== RE-93: Force-delete endpoint ====================

    @Test
    void adminForceDelete_asAdmin_returns204() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        when(listingWorkflowService.adminForceDelete(LISTING_ID, ADMIN_ID)).thenReturn(true);

        mockMvc.perform(delete("/api/admin/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isNoContent());

        verify(listingWorkflowService).adminForceDelete(LISTING_ID, ADMIN_ID);
        verify(adminAuditService).record(eq(ADMIN_ID), eq("listing_force_deleted"),
                eq("listing"), eq(LISTING_ID), isNull(), anyString());
    }

    @Test
    void adminForceDelete_alreadyArchived_returns204WithoutAudit() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        when(listingWorkflowService.adminForceDelete(LISTING_ID, ADMIN_ID)).thenReturn(false);

        mockMvc.perform(delete("/api/admin/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isNoContent());

        verify(listingWorkflowService).adminForceDelete(LISTING_ID, ADMIN_ID);
        verify(adminAuditService, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    void adminForceDelete_notFound_returns404() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        doThrow(new ListingNotFoundException(LISTING_ID))
                .when(listingWorkflowService).adminForceDelete(LISTING_ID, ADMIN_ID);

        mockMvc.perform(delete("/api/admin/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isNotFound());

        verify(adminAuditService, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    void adminForceDelete_asDealer_returns403() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        mockMvc.perform(delete("/api/admin/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isForbidden());

        verify(listingWorkflowService, never()).adminForceDelete(any(), any());
        verify(adminAuditService, never()).record(any(), any(), any(), any(), any(), any());
    }

    // ==================== Helper ====================

    private Listing buildListing(UUID id, String status, String propertyType, String title,
                                  String locality, BigDecimal price, String description) {
        Listing l = new Listing();
        l.setId(id);
        l.setListingNumber(42);
        l.setStatus(status);
        l.setPropertyType(propertyType);
        l.setTitle(title);
        l.setLocality(locality);
        l.setPrice(price);
        l.setDescription(description);
        l.setCreatedAt(OffsetDateTime.now());
        l.setUpdatedAt(OffsetDateTime.now());
        return l;
    }
}
