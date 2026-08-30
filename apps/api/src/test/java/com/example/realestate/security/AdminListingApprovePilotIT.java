package com.example.realestate.security;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.listing.api.AdminListingController;
import com.example.realestate.listing.api.ListingResponseMapper;
import com.example.realestate.listing.audit.AdminAuditService;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Pilot regression test proving that {@link AdminListingController#approve} enforces role
 * correctly via the new authority-based RBAC path ({@link DbRoleJwtAuthenticationConverter}
 * → {@link CallerInfoResolver} → {@code @PreAuthorize("#caller.isAdmin()")}).
 *
 * <h3>Authority path end-to-end</h3>
 * <ol>
 *   <li>{@code jwt().authorities(ROLE_ADMIN)} → {@link CallerInfoResolver} resolves
 *       {@code CallerInfo(admin)} → {@code @PreAuthorize("#caller.isAdmin()")} passes → 200.</li>
 *   <li>{@code jwt().authorities(ROLE_BROKER)} → {@link CallerInfoResolver} resolves
 *       {@code CallerInfo(broker)} → {@code @PreAuthorize("#caller.isAdmin()")} denies → 403.</li>
 *   <li>{@code jwt()} with no authority → {@link CallerInfoResolver} fallback returns empty
 *       → 403 before {@code @PreAuthorize} evaluates.</li>
 * </ol>
 *
 * <p>This test is in the {@code security} package and does NOT edit
 * {@code AdminListingControllerTest} (kept for backward compatibility with prior stubs).
 */
@WebMvcTest(
        controllers = AdminListingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({AdminListingApprovePilotIT.TestConfig.class, WebMvcConfig.class,
        CallerInfoResolver.class, GlobalExceptionHandler.class})
class AdminListingApprovePilotIT {

    private static final UUID ADMIN_ID   = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final UUID BROKER_ID  = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");

    /**
     * {@code @EnableMethodSecurity} is required for {@code @PreAuthorize("#caller.isAdmin()")} to
     * evaluate in the test context.
     */
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

    @MockitoBean
    private ListingWorkflowService listingWorkflowService;

    @MockitoBean
    private ListingResponseMapper listingResponseMapper;

    @MockitoBean
    private AdminAuditService adminAuditService;

    /**
     * Satisfies {@link AdminListingController}'s constructor dependency on
     * {@link com.example.realestate.listing.core.ListingRepository} (used by the controller's
     * {@code stale}/{@code pending} GET endpoints) so the {@code @WebMvcTest} context can load.
     * Not stubbed here — none of this pilot's tests exercise a GET endpoint.
     */
    @MockitoBean
    private com.example.realestate.listing.core.ListingRepository listingRepository;

    /**
     * Required to satisfy {@link CallerInfoResolver}'s constructor dependency (DB fallback path).
     * Not stubbed here — tests set {@code ROLE_ADMIN}/{@code ROLE_BROKER} authority on the jwt(),
     * so the primary authority path is taken and the DB fallback is not invoked.
     */
    @MockitoBean
    private UserRoleService userRoleService;

    // ===== Pilot proof: admin authority → 200 =====

    /**
     * Admin with {@code ROLE_ADMIN} authority → {@link CallerInfoResolver} resolves
     * {@code CallerInfo(role="admin", isAdmin=true)} → {@code @PreAuthorize} passes → 200.
     */
    @Test
    void approve_withRoleAdminAuthority_returns200() throws Exception {
        Listing approvedListing = new Listing();
        approvedListing.setId(LISTING_ID);
        approvedListing.setStatus("LIVE");
        when(listingWorkflowService.approveListing(LISTING_ID, ADMIN_ID)).thenReturn(approvedListing);
        when(listingResponseMapper.toResponse(any(Listing.class))).thenReturn(null);

        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))
                                   .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk());
    }

    // ===== Pilot proof: non-admin authority → 403 =====

    /**
     * Broker with {@code ROLE_BROKER} authority → {@link CallerInfoResolver} resolves
     * {@code CallerInfo(role="broker", isAdmin=false)} → {@code @PreAuthorize} denies → 403.
     */
    @Test
    void approve_withRoleBrokerAuthority_returns403() throws Exception {
        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))
                                   .authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isForbidden());
    }

    /**
     * Dealer with {@code ROLE_DEALER} authority → {@link CallerInfoResolver} resolves
     * {@code CallerInfo(role="dealer", isAdmin=false)} → {@code @PreAuthorize} denies → 403.
     */
    @Test
    void approve_withRoleDealerAuthority_returns403() throws Exception {
        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))
                                   .authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden());
    }

    /**
     * No authority → {@link CallerInfoResolver} finds no recognized authority, DB fallback
     * returns empty → 403 before {@code @PreAuthorize} evaluates.
     */
    @Test
    void approve_withNoAuthority_returns403() throws Exception {
        mockMvc.perform(post("/api/admin/listings/" + LISTING_ID + "/approve")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isForbidden());
    }
}
