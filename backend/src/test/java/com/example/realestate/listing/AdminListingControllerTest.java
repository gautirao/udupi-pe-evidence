package com.example.realestate.listing;

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
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for AdminListingController (admin approve/reject endpoints).
 * Uses jwt() post-processor to inject JwtAuthenticationToken; mocks ListingService.
 */
@WebMvcTest(
        controllers = AdminListingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(AdminListingControllerTest.TestConfig.class)
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
    private ListingService listingService;

    @MockitoBean
    private ListingImageRepository listingImageRepository;

    @MockitoBean
    private AdminAuditService adminAuditService;

    @BeforeEach
    void setUp() {
        reset(listingService, listingImageRepository, adminAuditService);
        // Default stub: no images for any listing; tests that check imageCount override this.
        when(listingImageRepository.countByListingId(any())).thenReturn(0L);
    }

    // ==================== Test 1: Approve -> 200, LIVE ====================

    @Test
    void approve_withAdminRole_returns200WithLiveStatus() throws Exception {
        when(listingService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));

        Listing approved = buildListing(LISTING_ID, "LIVE", "land", "Plot in Manipal",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        approved.setReviewedAt(OffsetDateTime.now());
        approved.setReviewedBy(ADMIN_ID);
        when(listingService.approveListing(LISTING_ID, ADMIN_ID)).thenReturn(approved);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("LIVE"));

        verify(listingService).approveListing(LISTING_ID, ADMIN_ID);
    }

    // ==================== Test 2: Reject with reason -> 200, REJECTED ====================

    @Test
    void reject_withReasonAndAdminRole_returns200WithRejectedStatus() throws Exception {
        when(listingService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));

        Listing rejected = buildListing(LISTING_ID, "REJECTED", "house", "House",
                "Udupi", new BigDecimal("8000000"), "A house");
        rejected.setRejectionReason("Blurry images");
        rejected.setReviewedAt(OffsetDateTime.now());
        rejected.setReviewedBy(ADMIN_ID);
        when(listingService.rejectListing(LISTING_ID, ADMIN_ID, "Blurry images"))
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

        verify(listingService).rejectListing(LISTING_ID, ADMIN_ID, "Blurry images");
    }

    // ==================== Test 3: Reject without reason -> 400 ====================

    @Test
    void reject_withoutReason_returns400() throws Exception {
        when(listingService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"rejectionReason":""}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Rejection reason is required"));

        verify(listingService, never()).rejectListing(any(), any(), any());
    }

    // ==================== Test 4: Reject with null reason -> 400 ====================

    @Test
    void reject_withNullReason_returns400() throws Exception {
        when(listingService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/reject")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Rejection reason is required"));

        verify(listingService, never()).rejectListing(any(), any(), any());
    }

    // ==================== Test 5: Non-admin (dealer) -> 403 ====================

    @Test
    void approve_withDealerRole_returns403() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires admin role"));

        verify(listingService, never()).approveListing(any(), any());
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
        when(listingService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        when(listingService.approveListing(LISTING_ID, ADMIN_ID))
                .thenThrow(new ListingService.ListingStatusException(
                        "Cannot approve listing with status DRAFT"));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Cannot approve listing with status DRAFT"));
    }

    // ==================== Test 8: Approve not found -> 404 ====================

    @Test
    void approve_listingNotFound_returns404() throws Exception {
        when(listingService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        when(listingService.approveListing(LISTING_ID, ADMIN_ID))
                .thenThrow(new ListingService.ListingNotFoundException(LISTING_ID));

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== Test 9: Reject not found -> 404 ====================

    @Test
    void reject_listingNotFound_returns404() throws Exception {
        when(listingService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        when(listingService.rejectListing(LISTING_ID, ADMIN_ID, "Bad listing"))
                .thenThrow(new ListingService.ListingNotFoundException(LISTING_ID));

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
        when(listingService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        when(listingService.rejectListing(LISTING_ID, ADMIN_ID, "Reason"))
                .thenThrow(new ListingService.ListingStatusException(
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
