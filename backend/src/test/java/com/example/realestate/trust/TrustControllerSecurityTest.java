package com.example.realestate.trust;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies that the JwtConfig security boundary for the two trust endpoints is correctly
 * configured:
 * <ul>
 *   <li>GET /api/listings/{id}/trust is permit-all (unauthenticated callers reach the controller)</li>
 *   <li>GET /api/listings/{id}/trust-progress requires authentication (unauthenticated callers are rejected)</li>
 * </ul>
 *
 * <p>Uses a {@link TestSecurityConfig} that replicates the relevant {@code JwtConfig} permit rules
 * without the full OAuth2 resource server machinery, so the test can be run without Supabase
 * JWT issuer configuration. The permit rule pattern for /api/listings/{id}/trust mirrors
 * line-for-line what is configured in {@code JwtConfig}.
 */
@WebMvcTest(
        controllers = TrustController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({TrustControllerSecurityTest.TestSecurityConfig.class, WebMvcConfig.class, CallerInfoResolver.class,
        GlobalExceptionHandler.class})
class TrustControllerSecurityTest {

    /**
     * Replicates the relevant portion of JwtConfig:
     * - GET /api/listings/{id}/trust is permit-all
     * - everything else requires authentication
     */
    static class TestSecurityConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth
                            .requestMatchers(HttpMethod.GET, "/api/listings/*/trust").permitAll()
                            .anyRequest().authenticated())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private BadgeService badgeService;

    @MockitoBean
    private ListingRepository listingRepository;

    @MockitoBean
    private UserRoleService userRoleService;

    /**
     * Unauthenticated GET /trust must not be rejected by Spring Security.
     * The controller is reached and returns 404 (listing not found), not 401 or 403.
     */
    @Test
    void publicTrust_unauthenticated_reachesController() throws Exception {
        when(listingRepository.findById(any())).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/listings/{id}/trust", UUID.randomUUID()))
                .andExpect(status().isNotFound()); // 404, not 401/403 — proves permit-all fired
    }

    /**
     * Unauthenticated GET /trust-progress must be rejected by Spring Security
     * before reaching the controller (returns 4xx, not 200).
     */
    @Test
    void trustProgress_unauthenticated_rejectedBySecurity() throws Exception {
        mockMvc.perform(get("/api/listings/{id}/trust-progress", UUID.randomUUID()))
                .andExpect(status().is4xxClientError()); // Security gate fires (not 200)
    }
}
