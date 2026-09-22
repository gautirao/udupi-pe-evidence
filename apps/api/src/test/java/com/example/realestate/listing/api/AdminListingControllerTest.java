package com.example.realestate.listing.api;

import com.example.realestate.listing.audit.AdminAuditService;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.exception.ListingErrorCode;
import com.example.realestate.listing.exception.ListingLifecycleException;
import com.example.realestate.listing.exception.ListingNotArchivedException;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.WebMvcConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
@Import({AdminListingControllerTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class, GlobalExceptionHandler.class})
class AdminListingControllerTest {

    private static final UUID ADMIN_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final UUID DEALER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");

    @EnableMethodSecurity
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

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private ListingWorkflowService listingWorkflowService;

    @MockitoBean
    private ListingResponseMapper listingResponseMapper;

    @MockitoBean
    private AdminAuditService adminAuditService;

    @MockitoBean
    private com.example.realestate.listing.core.ListingRepository listingRepository;

    /**
     * Satisfies DbRoleJwtAuthenticationConverter's constructor dependency in the @WebMvcTest
     * security slice. No stubs needed — jwt().authorities(...) bypasses the converter entirely.
     */
    @MockitoBean
    private com.example.realestate.security.UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(listingWorkflowService, listingResponseMapper, adminAuditService, listingRepository);
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
                    l.getLocality(), l.getPrice(), l.getPricePaise(), l.getDescription(),
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
                    l.getFirstPublishedAt(), l.getLastConfirmedAt(), l.getPossessionStatus(),
                    l.getExpectedPossessionDate(), l.getApprovalsDeclared(), reraValid, 0,
                    l.getTrustTier(), null, l.getAreaKey(), java.util.List.of(),
                    null, null, null, null, null, null,
                    l.getLandCategory(), l.getAgriConversionStatus(), l.getFarmhouseAvailable(), l.getFencingDone(),
                    l.getBoundaryGeoJson(), null,
                    l.getBathrooms(), l.getBalconies(), l.getFacing(), l.getAvailabilityTimeline(),
                    l.getSuperBuiltArea(), l.getSuperBuiltAreaUnit(), l.getPropertyAge(), l.getResidentialWaterSource(),
                    l.getParking2wCount(), l.getParking4wCount(), l.getRoadWidthFt(), l.getPlotDimensions(),
                    l.getConversionStatus(), l.getKhataNumber(), l.getPropertyTaxPid(), l.getApprovingAuthority(),
                    l.getProjectName(), l.getBuilderName(), l.getMaintenancePaise(),
                    l.getHasLift(), l.getHasPowerBackup(), l.getIsGated(), l.getHasGarden(), l.getHasTerrace(),
                    l.getHasCompound(), l.getHasServantRoom(), l.getIsCornerPlot(), l.getHasBoundaryWall(),
                    l.getIsGatedLayout(), l.getHasWaterConnection(), l.getHasElectricityConnection(), l.getHasDrainage(),
                    l.getPriceNegotiable(), l.getRentNegotiable(), l.getPetsAllowed(), l.getMaintenanceIncluded(),
                    java.util.List.of(), java.util.List.of(), java.util.List.of(),
                    l.getCommercialSubtype(), l.getFloorChoice(), l.getFloorMode(), l.getHubType(),
                    l.getWashroomsPublic(), l.getWashroomsPrivate(),
                    l.getParkingPublicCount(), l.getParkingPrivateCount(),
                    l.getOfficeSeats(), l.getOfficeCabins(), l.getOfficeMeetingRooms(),
                    l.getOccupancyStatus(), l.getPowerLoadKva(),
                    l.getWarehouseClearHeightFt(), l.getWarehouseLoadingBays(),
                    l.getWarehouseTruckAccess(), l.getWarehouseFlooring(),
                    l.getCommercialZoning(), l.getCommercialOwnership(), l.getCommercialApprovals(),
                    l.getExpectedRentalYieldPct(), l.getCurrentMonthlyIncomePaise(),
                    l.getLeaseTermMonths(), l.getLeaseEscalationPct(),
                    l.getCommercialFurnishingStatus(), l.getCommercialAvailability(), l.getCommercialAreaUnit(),
                    java.util.List.of(), java.util.List.of(), java.util.List.of(),
                    l.getPriceStatus());
        });
        // #1794 Phase 1: GET /stale maps a batch via toResponseList — delegate to the
        // already-stubbed single-item toResponse so list-endpoint assertions keep working.
        when(listingResponseMapper.toResponseList(anyList())).thenAnswer(inv -> {
            java.util.List<Listing> listings = inv.getArgument(0);
            return listings.stream().map(listingResponseMapper::toResponse).toList();
        });
    }

    // ==================== Test 1: Approve -> 200, LIVE ====================

    @Test
    void approve_withAdminRole_returns200WithLiveStatus() throws Exception {
Listing approved = buildListing(LISTING_ID, "LIVE", "land", "Plot in Manipal",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        approved.setReviewedAt(OffsetDateTime.now());
        approved.setReviewedBy(ADMIN_ID);
        when(listingWorkflowService.approveListing(LISTING_ID, ADMIN_ID)).thenReturn(approved);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("LIVE"));

        verify(listingWorkflowService).approveListing(LISTING_ID, ADMIN_ID);
    }

    // ==================== #1794 Phase 2: Admin reconfirms via re-approval ====================
    // Real supported "reconfirm" path (corrected doc): a Founder/Admin records a reconfirmation
    // by re-running the SAME approve endpoint on a listing that has left LIVE and returned to
    // PENDING_REVIEW (e.g. resubmitted), not by re-approving an already-LIVE listing — the
    // transition policy rejects LIVE->LIVE self-transitions (see ListingTransitionPolicy#validate).
    // This mirrors ListingWorkflowServiceTest#approveListing_secondApproval_preservesFirstPublishedAtAndUpdatesLastLiveAt,
    // exercised here at the controller/HTTP layer.

    @Test
    void approve_reapprovalAfterResubmission_returns200WithRefreshedConfirmedAt() throws Exception {
        OffsetDateTime originalFirstPublished = OffsetDateTime.now().minusDays(10);
        OffsetDateTime refreshedConfirmedAt = OffsetDateTime.now();

        Listing reapproved = buildListing(LISTING_ID, "LIVE", "house", "House in Udupi",
                "Udupi", new BigDecimal("8000000"), "A house");
        reapproved.setFirstPublishedAt(originalFirstPublished);
        reapproved.setLastConfirmedAt(refreshedConfirmedAt);
        reapproved.setReviewedAt(refreshedConfirmedAt);
        reapproved.setReviewedBy(ADMIN_ID);
        when(listingWorkflowService.approveListing(LISTING_ID, ADMIN_ID)).thenReturn(reapproved);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("LIVE"))
                .andExpect(jsonPath("$.firstPublishedAt").exists())
                .andExpect(jsonPath("$.confirmedAt").exists());

        verify(listingWorkflowService).approveListing(LISTING_ID, ADMIN_ID);
    }

    @Test
    void approve_reapprovalPath_withDealerRole_returns403() throws Exception {
        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires admin role"));

        verify(listingWorkflowService, never()).approveListing(any(), any());
    }

    // ==================== Test 2: Reject with reason -> 200, REJECTED ====================

    @Test
    void reject_withReasonAndAdminRole_returns200WithRejectedStatus() throws Exception {
        // #2287: rejectionReason must carry one of the five UI-supported codes as its
        // prefix (PendingListings.tsx rejectMutation sends "CODE: note"); a bare free-text
        // reason with no recognized code is now rejected server-side (see below tests).
Listing rejected = buildListing(LISTING_ID, "REJECTED", "house", "House",
                "Udupi", new BigDecimal("8000000"), "A house");
        rejected.setRejectionReason("INVALID_PHOTOS: Blurry images");
        rejected.setReviewedAt(OffsetDateTime.now());
        rejected.setReviewedBy(ADMIN_ID);
        when(listingWorkflowService.rejectListing(LISTING_ID, ADMIN_ID, "INVALID_PHOTOS: Blurry images"))
                .thenReturn(rejected);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"rejectionReason":"INVALID_PHOTOS: Blurry images"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.rejectionReason").value("INVALID_PHOTOS: Blurry images"));

        verify(listingWorkflowService).rejectListing(LISTING_ID, ADMIN_ID, "INVALID_PHOTOS: Blurry images");
    }

    // ==================== #2287: all five UI-supported codes accepted ====================

    @Test
    void reject_withEachSupportedCode_returns200() throws Exception {
        for (String code : java.util.List.of(
                "INCOMPLETE_INFO", "DUPLICATE_LISTING", "INVALID_PHOTOS", "POLICY_VIOLATION", "OTHER")) {
            reset(listingWorkflowService, listingResponseMapper, adminAuditService, listingRepository);
            setUp();

            Listing rejected = buildListing(LISTING_ID, "REJECTED", "house", "House",
                    "Udupi", new BigDecimal("8000000"), "A house");
            rejected.setRejectionReason(code);
            when(listingWorkflowService.rejectListing(LISTING_ID, ADMIN_ID, code)).thenReturn(rejected);

            mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                            .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"rejectionReason\":\"" + code + "\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("REJECTED"));

            verify(listingWorkflowService).rejectListing(LISTING_ID, ADMIN_ID, code);
        }
    }

    // ==================== #2287: malformed/unrecognized code -> 400 ====================

    @Test
    void reject_withUnrecognizedCode_returns400() throws Exception {
        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"rejectionReason":"NOT_A_REAL_CODE:some note"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Unrecognized rejection code: NOT_A_REAL_CODE"));

        verify(listingWorkflowService, never()).rejectListing(any(), any(), any());
    }

    @Test
    void reject_withMisspelledCodeNoColon_returns400() throws Exception {
        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"rejectionReason":"Blurry images"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Unrecognized rejection code: Blurry images"));

        verify(listingWorkflowService, never()).rejectListing(any(), any(), any());
    }

    // ==================== Test 3: Reject without reason -> 400 ====================

    @Test
    void reject_withoutReason_returns400() throws Exception {
mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
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
mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
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
mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
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

    // ==================== Test 7: Approve wrong status -> 409 ====================

    @Test
    void approve_wrongStatus_returns409() throws Exception {
when(listingWorkflowService.approveListing(LISTING_ID, ADMIN_ID))
                .thenThrow(new ListingStatusException(
                        "Cannot approve listing with status DRAFT"));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Cannot approve listing with status DRAFT"));
    }

    // ==================== Test 8: Approve not found -> 404 ====================

    @Test
    void approve_listingNotFound_returns404() throws Exception {
when(listingWorkflowService.approveListing(LISTING_ID, ADMIN_ID))
                .thenThrow(new ListingNotFoundException(LISTING_ID));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== Test 9: Reject not found -> 404 ====================

    @Test
    void reject_listingNotFound_returns404() throws Exception {
when(listingWorkflowService.rejectListing(LISTING_ID, ADMIN_ID, "OTHER: Bad listing"))
                .thenThrow(new ListingNotFoundException(LISTING_ID));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"rejectionReason":"OTHER: Bad listing"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== Test 10: Reject wrong status -> 409 ====================

    @Test
    void reject_wrongStatus_returns409() throws Exception {
when(listingWorkflowService.rejectListing(LISTING_ID, ADMIN_ID, "OTHER"))
                .thenThrow(new ListingStatusException(
                        "Cannot reject listing with status DRAFT"));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"rejectionReason":"OTHER"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Cannot reject listing with status DRAFT"));
    }

    // ==================== RE-89: Restore endpoint ====================

    @Test
    void restore_withAdminRole_archivedListing_returns200WithDraftStatus() throws Exception {
Listing restored = buildListing(LISTING_ID, "DRAFT", "land", "Plot in Manipal",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        when(listingWorkflowService.restoreListing(eq(LISTING_ID), any())).thenReturn(restored);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/restore")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("DRAFT"));

        verify(listingWorkflowService).restoreListing(eq(LISTING_ID), eq(ADMIN_ID));
        verify(adminAuditService).record(eq(ADMIN_ID), eq("listing_restored"), eq("listing"),
                eq(LISTING_ID), isNull(), anyString());
    }

    @Test
    void restore_listingNotArchived_returns409() throws Exception {
when(listingWorkflowService.restoreListing(eq(LISTING_ID), any()))
                .thenThrow(new ListingNotArchivedException(LISTING_ID));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/restore")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Listing is not archived: " + LISTING_ID));

        verify(adminAuditService, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    void restore_listingNotFound_returns404() throws Exception {
when(listingWorkflowService.restoreListing(eq(LISTING_ID), any()))
                .thenThrow(new ListingNotFoundException(LISTING_ID));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/restore")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    @Test
    void restore_withDealerRole_returns403() throws Exception {
mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/restore")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires admin role"));

        verify(listingWorkflowService, never()).restoreListing(any(), any());
    }

    // ==================== RE-93: Force-delete endpoint ====================

    @Test
    void adminForceDelete_asAdmin_returns204() throws Exception {
when(listingWorkflowService.adminForceDelete(LISTING_ID, ADMIN_ID)).thenReturn(true);

        mockMvc.perform(delete("/api/admin/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isNoContent());

        verify(listingWorkflowService).adminForceDelete(LISTING_ID, ADMIN_ID);
        verify(adminAuditService).record(eq(ADMIN_ID), eq("listing_force_deleted"),
                eq("listing"), eq(LISTING_ID), isNull(), anyString());
    }

    @Test
    void adminForceDelete_alreadyArchived_returns204WithoutAudit() throws Exception {
when(listingWorkflowService.adminForceDelete(LISTING_ID, ADMIN_ID)).thenReturn(false);

        mockMvc.perform(delete("/api/admin/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isNoContent());

        verify(listingWorkflowService).adminForceDelete(LISTING_ID, ADMIN_ID);
        verify(adminAuditService, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    void adminForceDelete_notFound_returns404() throws Exception {
doThrow(new ListingNotFoundException(LISTING_ID))
                .when(listingWorkflowService).adminForceDelete(LISTING_ID, ADMIN_ID);

        mockMvc.perform(delete("/api/admin/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isNotFound());

        verify(adminAuditService, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    void adminForceDelete_asDealer_returns403() throws Exception {
mockMvc.perform(delete("/api/admin/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden());

        verify(listingWorkflowService, never()).adminForceDelete(any(), any());
        verify(adminAuditService, never()).record(any(), any(), any(), any(), any(), any());
    }

    // ==================== RE-134: Return-for-edits endpoint ====================

    @Test
    void returnForEdits_withAdminRole_returns200WithDraftStatus() throws Exception {
Listing returned = buildListing(LISTING_ID, "DRAFT", "house", "House in Udupi",
                "Udupi", new BigDecimal("8000000"), "A house");
        when(listingWorkflowService.returnForEdits(LISTING_ID, ADMIN_ID, "Please add better photos"))
                .thenReturn(returned);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/return-for-edits")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"note":"Please add better photos"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("DRAFT"));

        verify(listingWorkflowService).returnForEdits(LISTING_ID, ADMIN_ID, "Please add better photos");
        verify(adminAuditService).record(eq(ADMIN_ID), eq("listing_returned_for_edits"), eq("listing"),
                eq(LISTING_ID), isNull(), anyString());
    }

    @Test
    void returnForEdits_blankNote_returns422() throws Exception {
mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/return-for-edits")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"note":"  "}
                                """))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("RETURN_NOTE_REQUIRED"));

        verify(listingWorkflowService, never()).returnForEdits(any(), any(), any());
    }

    @Test
    void returnForEdits_withDealerRole_returns403() throws Exception {
mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/return-for-edits")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"note":"Fix photos"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires admin role"));

        verify(listingWorkflowService, never()).returnForEdits(any(), any(), any());
    }

    @Test
    void returnForEdits_listingNotFound_returns404() throws Exception {
when(listingWorkflowService.returnForEdits(LISTING_ID, ADMIN_ID, "Fix photos"))
                .thenThrow(new ListingNotFoundException(LISTING_ID));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/return-for-edits")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"note":"Fix photos"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== RE-134: Claim-scraped endpoint ====================

    @Test
    void claimScraped_withAdminRole_returns200WithDraftStatus() throws Exception {
UUID ownerId = UUID.fromString("00000000-0000-0000-0000-000000000020");
        Listing claimed = buildListing(LISTING_ID, "DRAFT", "house", "Scraped House",
                "Manipal", new BigDecimal("4000000"), "A scraped house");
        claimed.setCreatedBy(ownerId);
        when(listingWorkflowService.claimScrapedListing(LISTING_ID, ownerId, ADMIN_ID))
                .thenReturn(claimed);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/claim-scraped")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ownerId":"%s"}
                                """.formatted(ownerId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("DRAFT"));

        verify(listingWorkflowService).claimScrapedListing(LISTING_ID, ownerId, ADMIN_ID);
        verify(adminAuditService).record(eq(ADMIN_ID), eq("listing_claimed_scraped"), eq("listing"),
                eq(LISTING_ID), isNull(), anyString());
    }

    @Test
    void claimScraped_nullOwnerId_returns400() throws Exception {
mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/claim-scraped")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("ownerId is required"));

        verify(listingWorkflowService, never()).claimScrapedListing(any(), any(), any());
    }

    @Test
    void claimScraped_alreadyClaimed_returns409() throws Exception {
UUID ownerId = UUID.fromString("00000000-0000-0000-0000-000000000020");
        when(listingWorkflowService.claimScrapedListing(LISTING_ID, ownerId, ADMIN_ID))
                .thenThrow(new ListingLifecycleException(
                        ListingErrorCode.ALREADY_CLAIMED,
                        "Listing already has an owner — cannot reassign"));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/claim-scraped")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ownerId":"%s"}
                                """.formatted(ownerId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_CLAIMED"));

        verify(adminAuditService, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    void claimScraped_withDealerRole_returns403() throws Exception {
mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/claim-scraped")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ownerId":"00000000-0000-0000-0000-000000000020"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires admin role"));

        verify(listingWorkflowService, never()).claimScrapedListing(any(), any(), any());
    }

    // ==================== RE-134: Approve-scraped endpoint ====================

    @Test
    void approveScraped_withAdminRole_returns200WithLiveStatus() throws Exception {
Listing approved = buildListing(LISTING_ID, "LIVE", "house", "Scraped House",
                "Manipal", new BigDecimal("4000000"), "A scraped house");
        approved.setReviewedAt(OffsetDateTime.now());
        approved.setReviewedBy(ADMIN_ID);
        when(listingWorkflowService.approveScrapedListing(LISTING_ID, ADMIN_ID))
                .thenReturn(approved);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve-scraped")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("LIVE"));

        verify(listingWorkflowService).approveScrapedListing(LISTING_ID, ADMIN_ID);
        verify(adminAuditService).record(eq(ADMIN_ID), eq("listing_approved_scraped"), eq("listing"),
                eq(LISTING_ID), isNull(), anyString());
    }

    @Test
    void approveScraped_incompleteListing_returns422() throws Exception {
when(listingWorkflowService.approveScrapedListing(LISTING_ID, ADMIN_ID))
                .thenThrow(new ListingLifecycleException(
                        ListingErrorCode.LISTING_INCOMPLETE,
                        "Listing is incomplete: Price must be greater than 0"));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve-scraped")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("LISTING_INCOMPLETE"));

        verify(adminAuditService, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    void approveScraped_withDealerRole_returns403() throws Exception {
mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve-scraped")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires admin role"));

        verify(listingWorkflowService, never()).approveScrapedListing(any(), any());
    }

    // ==================== RE-134: Restore-rejected endpoint ====================

    @Test
    void restoreRejected_withAdminRole_returns200WithLiveStatus() throws Exception {
Listing restored = buildListing(LISTING_ID, "LIVE", "house", "House in Udupi",
                "Udupi", new BigDecimal("8000000"), "A house");
        restored.setReviewedAt(OffsetDateTime.now());
        restored.setReviewedBy(ADMIN_ID);
        when(listingWorkflowService.restoreRejectedListing(LISTING_ID, ADMIN_ID, "Reviewed again — looks fine"))
                .thenReturn(restored);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/restore-rejected")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"moderationNote":"Reviewed again — looks fine"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("LIVE"));

        verify(listingWorkflowService).restoreRejectedListing(LISTING_ID, ADMIN_ID, "Reviewed again — looks fine");
        verify(adminAuditService).record(eq(ADMIN_ID), eq("listing_restored_rejected"), eq("listing"),
                eq(LISTING_ID), isNull(), anyString());
    }

    @Test
    void restoreRejected_blankNote_returns422() throws Exception {
mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/restore-rejected")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"moderationNote":""}
                                """))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("MODERATION_NOTE_REQUIRED"));

        verify(listingWorkflowService, never()).restoreRejectedListing(any(), any(), any());
    }

    @Test
    void restoreRejected_withDealerRole_returns403() throws Exception {
mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/restore-rejected")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"moderationNote":"Override reason"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires admin role"));

        verify(listingWorkflowService, never()).restoreRejectedListing(any(), any(), any());
    }

    @Test
    void restoreRejected_listingNotFound_returns404() throws Exception {
when(listingWorkflowService.restoreRejectedListing(LISTING_ID, ADMIN_ID, "Override reason"))
                .thenThrow(new ListingNotFoundException(LISTING_ID));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/restore-rejected")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"moderationNote":"Override reason"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== RE-134: Admin archive endpoint ====================

    @Test
    void archive_withAdminRole_returns200WithArchivedStatus() throws Exception {
Listing archived = buildListing(LISTING_ID, "ARCHIVED", "house", "House in Udupi",
                "Udupi", new BigDecimal("8000000"), "A house");
        when(listingWorkflowService.adminArchiveListing(LISTING_ID, ADMIN_ID, "Duplicate listing"))
                .thenReturn(archived);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/archive")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"reasonNote":"Duplicate listing"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("ARCHIVED"));

        verify(listingWorkflowService).adminArchiveListing(LISTING_ID, ADMIN_ID, "Duplicate listing");
        verify(adminAuditService).record(eq(ADMIN_ID), eq("listing_archived"), eq("listing"),
                eq(LISTING_ID), isNull(), anyString());
    }

    @Test
    void archive_withoutBody_returns200() throws Exception {
Listing archived = buildListing(LISTING_ID, "ARCHIVED", "land", "Plot in Manipal",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        when(listingWorkflowService.adminArchiveListing(eq(LISTING_ID), eq(ADMIN_ID), isNull()))
                .thenReturn(archived);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/archive")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("ARCHIVED"));

        verify(listingWorkflowService).adminArchiveListing(eq(LISTING_ID), eq(ADMIN_ID), isNull());
    }

    @Test
    void archive_withDealerRole_returns403() throws Exception {
mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/archive")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"reasonNote":"Remove this"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires admin role"));

        verify(listingWorkflowService, never()).adminArchiveListing(any(), any(), any());
    }

    @Test
    void archive_listingNotFound_returns404() throws Exception {
when(listingWorkflowService.adminArchiveListing(LISTING_ID, ADMIN_ID, "Remove this"))
                .thenThrow(new ListingNotFoundException(LISTING_ID));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/archive")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"reasonNote":"Remove this"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== RE-183: Audit JSON special-character escaping ====================

    @Test
    void reject_auditJsonContainsProperlyEscapedRejectionReason() throws Exception {
String specialReason = "INVALID_PHOTOS: Bad \"quality\" photos\nand a backslash\\here";
        Listing rejected = buildListing(LISTING_ID, "REJECTED", "house", "House",
                "Udupi", new BigDecimal("8000000"), "A house");
        rejected.setRejectionReason(specialReason);
        when(listingWorkflowService.rejectListing(LISTING_ID, ADMIN_ID, specialReason))
                .thenReturn(rejected);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("rejectionReason", specialReason))))
                .andExpect(status().isOk());

        org.mockito.ArgumentCaptor<String> auditJsonCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(adminAuditService).record(eq(ADMIN_ID), eq("listing_rejected"), eq("listing"),
                eq(LISTING_ID), isNull(), auditJsonCaptor.capture());

        Map<String, String> parsed = objectMapper.readValue(auditJsonCaptor.getValue(),
                new TypeReference<>() {});
        assertThat(parsed).containsEntry("status", "REJECTED");
        assertThat(parsed).containsEntry("reason", specialReason);
    }

    @Test
    void returnForEdits_auditJsonContainsProperlyEscapedNote() throws Exception {
String specialNote = "Please fix: use \"proper\" images\nno newlines";
        Listing returned = buildListing(LISTING_ID, "DRAFT", "house", "House",
                "Udupi", new BigDecimal("8000000"), "A house");
        when(listingWorkflowService.returnForEdits(LISTING_ID, ADMIN_ID, specialNote))
                .thenReturn(returned);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/return-for-edits")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("note", specialNote))))
                .andExpect(status().isOk());

        org.mockito.ArgumentCaptor<String> auditJsonCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(adminAuditService).record(eq(ADMIN_ID), eq("listing_returned_for_edits"), eq("listing"),
                eq(LISTING_ID), isNull(), auditJsonCaptor.capture());

        Map<String, String> parsed = objectMapper.readValue(auditJsonCaptor.getValue(),
                new TypeReference<>() {});
        assertThat(parsed).containsEntry("status", "DRAFT");
        assertThat(parsed).containsEntry("note", specialNote);
    }

    @Test
    void restoreRejected_auditJsonContainsProperlyEscapedModerationNote() throws Exception {
String specialNote = "Override: \"admin\" approved\ttab and backslash\\done";
        Listing restored = buildListing(LISTING_ID, "LIVE", "house", "House",
                "Udupi", new BigDecimal("8000000"), "A house");
        when(listingWorkflowService.restoreRejectedListing(LISTING_ID, ADMIN_ID, specialNote))
                .thenReturn(restored);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/restore-rejected")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("moderationNote", specialNote))))
                .andExpect(status().isOk());

        org.mockito.ArgumentCaptor<String> auditJsonCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(adminAuditService).record(eq(ADMIN_ID), eq("listing_restored_rejected"), eq("listing"),
                eq(LISTING_ID), isNull(), auditJsonCaptor.capture());

        Map<String, String> parsed = objectMapper.readValue(auditJsonCaptor.getValue(),
                new TypeReference<>() {});
        assertThat(parsed).containsEntry("status", "LIVE");
        assertThat(parsed).containsEntry("note", specialNote);
    }

    // ==================== #1794 Phase 1: GET /stale ====================

    @Test
    void stale_withAdminRole_returns200WithPagedResults() throws Exception {
        Listing staleListing = buildListing(LISTING_ID, "LIVE", "house", "Old Plot",
                "Manipal", new BigDecimal("5000000"), "Never confirmed");
        org.springframework.data.domain.Page<Listing> page = new org.springframework.data.domain.PageImpl<>(
                java.util.List.of(staleListing),
                org.springframework.data.domain.PageRequest.of(0, 20), 1L);
        when(listingRepository.findLiveListingsNotConfirmedSince(any(OffsetDateTime.class), any()))
                .thenReturn(page);

        mockMvc.perform(get("/api/admin/listings/stale")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.content.length()").value(1));

        org.mockito.ArgumentCaptor<OffsetDateTime> thresholdCaptor = org.mockito.ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(listingRepository).findLiveListingsNotConfirmedSince(thresholdCaptor.capture(), any());
        // Default days=14 — threshold should be ~14 days ago (allow a few seconds of test-run slack)
        OffsetDateTime expectedThreshold = OffsetDateTime.now().minusDays(14);
        assertThat(thresholdCaptor.getValue()).isCloseTo(expectedThreshold,
                org.assertj.core.api.Assertions.within(10, java.time.temporal.ChronoUnit.SECONDS));
    }

    @Test
    void stale_customDaysParam_computesThresholdFromDays() throws Exception {
        org.springframework.data.domain.Page<Listing> emptyPage = new org.springframework.data.domain.PageImpl<>(
                java.util.List.of(), org.springframework.data.domain.PageRequest.of(0, 20), 0L);
        when(listingRepository.findLiveListingsNotConfirmedSince(any(OffsetDateTime.class), any()))
                .thenReturn(emptyPage);

        mockMvc.perform(get("/api/admin/listings/stale").param("days", "30")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk());

        org.mockito.ArgumentCaptor<OffsetDateTime> thresholdCaptor = org.mockito.ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(listingRepository).findLiveListingsNotConfirmedSince(thresholdCaptor.capture(), any());
        OffsetDateTime expectedThreshold = OffsetDateTime.now().minusDays(30);
        assertThat(thresholdCaptor.getValue()).isCloseTo(expectedThreshold,
                org.assertj.core.api.Assertions.within(10, java.time.temporal.ChronoUnit.SECONDS));
    }

    @Test
    void stale_withoutAdminRole_returns403() throws Exception {
        mockMvc.perform(get("/api/admin/listings/stale")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden());

        verify(listingRepository, never()).findLiveListingsNotConfirmedSince(any(), any());
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
