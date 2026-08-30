package com.example.realestate.config;

import com.example.realestate.notification.NotificationController;
import com.example.realestate.notification.NotificationRepository;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Regression tests for the CORS preflight fix (CorsConfig + JwtConfig).
 *
 * Previously, OPTIONS /api/* returned 404 because CorsFilter was wired inside
 * Spring Security's filter chain. When the preflight wasn't caught it fell
 * through to Spring MVC, which has no OPTIONS handler → 404.
 *
 * Fix: CorsFilter registered as a standalone FilterRegistrationBean at
 * HIGHEST_PRECEDENCE+1, running before the security chain entirely.
 *
 * These tests import the real CorsConfig so the FilterRegistrationBean is
 * present in the MockMvc filter stack, reproducing the production setup.
 */
@WebMvcTest(
        controllers = NotificationController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({CorsPreflightTest.TestSecurityConfig.class, CorsConfig.class})
@TestPropertySource(properties = "cors.allowed-origins=https://udupi-property-explorer.pages.dev")
class CorsPreflightTest {

    private static final String ALLOWED_ORIGIN = "https://udupi-property-explorer.pages.dev";
    private static final String DISALLOWED_ORIGIN = "https://evil.example.com";

    /** Mirrors the relevant parts of JwtConfig used in production. */
    static class TestSecurityConfig {
        @Bean
        SecurityFilterChain testFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth
                            .requestMatchers(HttpMethod.OPTIONS).permitAll()
                            .anyRequest().authenticated())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private NotificationRepository notificationRepository;

    @MockitoBean
    private UserRoleService userRoleService;

    // ==================== Regression: OPTIONS on a protected endpoint ====================

    /**
     * Core regression: before the fix this returned 404.
     * CorsFilter must short-circuit the preflight with 200 + CORS headers.
     */
    @Test
    void options_allowedOrigin_returns200WithAccessControlAllowOrigin() throws Exception {
        mockMvc.perform(options("/api/notifications")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "Authorization"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ALLOWED_ORIGIN));
    }

    /** CorsFilter must allow the Authorization header used by the JWT client. */
    @Test
    void options_allowedOrigin_allowsAuthorizationHeader() throws Exception {
        mockMvc.perform(options("/api/notifications")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "Authorization"))
                .andExpect(status().isOk())
                .andExpect(header().exists("Access-Control-Allow-Headers"));
    }

    // ==================== Regression: PATCH preflight must be allowed (#689) ====================

    /**
     * PATCH is used by POI approve/pin endpoints. Before the fix, PATCH was
     * missing from CorsConfig's allowed methods list, causing preflight 403.
     */
    @Test
    void options_patchMethod_allowedOrigin_returns200() throws Exception {
        mockMvc.perform(options("/api/listings/123/pois/456/approve")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("Access-Control-Request-Method", "PATCH")
                        .header("Access-Control-Request-Headers", "Authorization,Content-Type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ALLOWED_ORIGIN));
    }

    // ==================== Security: unknown origin must be rejected ====================

    /** An origin not in CORS_ALLOWED_ORIGINS must be rejected — no CORS header. */
    @Test
    void options_disallowedOrigin_returnsForbiddenWithNoCorsHeader() throws Exception {
        mockMvc.perform(options("/api/notifications")
                        .header("Origin", DISALLOWED_ORIGIN)
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "Authorization"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
}
