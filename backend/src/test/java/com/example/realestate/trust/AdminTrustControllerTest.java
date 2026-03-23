package com.example.realestate.trust;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import org.junit.jupiter.api.BeforeEach;
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

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for {@link AdminTrustController}.
 *
 * <p>Covers:
 * <ul>
 *   <li>GET /api/admin/trust/pending-reviews — 403 non-admin, 200 admin with list</li>
 *   <li>POST /api/admin/trust/{id}/approve — 403, 404, 409, 200</li>
 *   <li>POST /api/admin/trust/{id}/reject  — 403, 404, 409, 200</li>
 * </ul>
 */
@WebMvcTest(
        controllers = AdminTrustController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({AdminTrustControllerTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class,
        GlobalExceptionHandler.class})
class AdminTrustControllerTest {

    private static final UUID ADMIN_ID      = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID NON_ADMIN_ID  = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID LISTING_ID    = UUID.fromString("00000000-0000-0000-0000-000000000099");
    private static final UUID DIMENSION_ID  = UUID.fromString("00000000-0000-0000-0000-000000000010");

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
    private ListingVerificationDimensionRepository dimensionRepository;

    @MockitoBean
    private ListingRepository listingRepository;

    @MockitoBean
    private BadgeService badgeService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(dimensionRepository, listingRepository, badgeService, userRoleService);
        // ADMIN_ID has role "admin" → isAdmin() = true
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        // NON_ADMIN_ID has role "broker" → isAdmin() = false
        when(userRoleService.getUserRole(NON_ADMIN_ID)).thenReturn(Optional.of("broker"));
    }

    // =========================================================================
    // GET /api/admin/trust/pending-reviews
    // =========================================================================

    /**
     * Non-admin caller -> 403.
     */
    @Test
    void getPendingReviews_notAdmin_returns403() throws Exception {
        mockMvc.perform(get("/api/admin/trust/pending-reviews")
                        .with(jwt().jwt(j -> j.subject(NON_ADMIN_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Admin caller with two PENDING dimensions -> 200, items contain expected JSON keys.
     */
    @Test
    void getPendingReviews_admin_returnsList() throws Exception {
        ListingVerificationDimension dim1 = pendingDimension(DIMENSION_ID, LISTING_ID, "PHOTOS");
        ListingVerificationDimension dim2 = pendingDimension(
                UUID.fromString("00000000-0000-0000-0000-000000000011"), LISTING_ID, "AUTHORITY");

        when(dimensionRepository.findAllByBadgeStateOrderByUpdatedAtAsc("PENDING"))
                .thenReturn(List.of(dim1, dim2));

        Listing listing = stubListing(LISTING_ID, "Test Flat", "Udupi", "broker");
        when(listingRepository.findAllById(any())).thenReturn(List.of(listing));

        mockMvc.perform(get("/api/admin/trust/pending-reviews")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].dimensionId").exists())
                .andExpect(jsonPath("$[0].listingId").exists())
                .andExpect(jsonPath("$[0].dimensionType").value("PHOTOS"))
                .andExpect(jsonPath("$[0].badgeState").value("PENDING"))
                .andExpect(jsonPath("$[0].listingTitle").value("Test Flat"))
                .andExpect(jsonPath("$[0].listingLocality").value("Udupi"))
                .andExpect(jsonPath("$[0].listingSellerType").value("broker"));
    }

    // =========================================================================
    // POST /api/admin/trust/{dimensionId}/approve
    // =========================================================================

    /**
     * Non-admin caller -> 403.
     */
    @Test
    void approve_notAdmin_returns403() throws Exception {
        mockMvc.perform(post("/api/admin/trust/{id}/approve", DIMENSION_ID)
                        .with(jwt().jwt(j -> j.subject(NON_ADMIN_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Dimension does not exist -> 404.
     */
    @Test
    void approve_dimensionNotFound_returns404() throws Exception {
        when(dimensionRepository.findById(DIMENSION_ID)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/admin/trust/{id}/approve", DIMENSION_ID)
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Dimension is not in PENDING state (EARNED) -> 409.
     */
    @Test
    void approve_notPending_returns409() throws Exception {
        ListingVerificationDimension earned = pendingDimension(DIMENSION_ID, LISTING_ID, "PHOTOS");
        earned.setBadgeState("EARNED");
        when(dimensionRepository.findById(DIMENSION_ID)).thenReturn(Optional.of(earned));

        mockMvc.perform(post("/api/admin/trust/{id}/approve", DIMENSION_ID)
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Dimension is PENDING and admin approves -> 200, badgeService.grantBadge called.
     */
    @Test
    void approve_success_returns200() throws Exception {
        ListingVerificationDimension dim = pendingDimension(DIMENSION_ID, LISTING_ID, "PHOTOS");
        when(dimensionRepository.findById(DIMENSION_ID)).thenReturn(Optional.of(dim));

        mockMvc.perform(post("/api/admin/trust/{id}/approve", DIMENSION_ID)
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Badge approved"));

        verify(badgeService).grantBadge(
                eq(LISTING_ID), eq("PHOTOS"), eq(ADMIN_ID), any());
    }

    // =========================================================================
    // POST /api/admin/trust/{dimensionId}/reject
    // =========================================================================

    /**
     * Non-admin caller -> 403.
     */
    @Test
    void reject_notAdmin_returns403() throws Exception {
        mockMvc.perform(post("/api/admin/trust/{id}/reject", DIMENSION_ID)
                        .with(jwt().jwt(j -> j.subject(NON_ADMIN_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Dimension does not exist -> 404.
     */
    @Test
    void reject_dimensionNotFound_returns404() throws Exception {
        when(dimensionRepository.findById(DIMENSION_ID)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/admin/trust/{id}/reject", DIMENSION_ID)
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Dimension is not in PENDING state (AVAILABLE) -> 409.
     */
    @Test
    void reject_notPending_returns409() throws Exception {
        ListingVerificationDimension available = pendingDimension(DIMENSION_ID, LISTING_ID, "PHOTOS");
        available.setBadgeState("AVAILABLE");
        when(dimensionRepository.findById(DIMENSION_ID)).thenReturn(Optional.of(available));

        mockMvc.perform(post("/api/admin/trust/{id}/reject", DIMENSION_ID)
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Dimension is PENDING and admin rejects -> 200, badgeService.rejectBadgeSubmission called.
     */
    @Test
    void reject_success_returns200() throws Exception {
        ListingVerificationDimension dim = pendingDimension(DIMENSION_ID, LISTING_ID, "PHOTOS");
        when(dimensionRepository.findById(DIMENSION_ID)).thenReturn(Optional.of(dim));

        mockMvc.perform(post("/api/admin/trust/{id}/reject", DIMENSION_ID)
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Badge submission rejected"));

        verify(badgeService).rejectBadgeSubmission(DIMENSION_ID, ADMIN_ID);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private ListingVerificationDimension pendingDimension(
            UUID id, UUID listingId, String dimensionType) {
        ListingVerificationDimension d = new ListingVerificationDimension();
        d.setListingId(listingId);
        d.setDimensionType(dimensionType);
        d.setBadgeState("PENDING");
        d.setUpdatedAt(OffsetDateTime.now());
        // Simulate the persisted ID via reflection workaround — UUID field is private,
        // no setter by design (set by JPA GeneratedValue). We use a helper subclass approach instead.
        setId(d, id);
        return d;
    }

    /**
     * Sets the private {@code id} field on {@link ListingVerificationDimension} via reflection.
     * Necessary because the ID is JPA-generated and has no public setter.
     */
    private static void setId(ListingVerificationDimension d, UUID id) {
        try {
            java.lang.reflect.Field f = ListingVerificationDimension.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(d, id);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException("Failed to set id via reflection in test", e);
        }
    }

    private static Listing stubListing(UUID id, String title, String locality, String sellerType) {
        Listing l = new Listing();
        l.setId(id);
        l.setTitle(title);
        l.setLocality(locality);
        l.setSellerType(sellerType);
        return l;
    }
}
