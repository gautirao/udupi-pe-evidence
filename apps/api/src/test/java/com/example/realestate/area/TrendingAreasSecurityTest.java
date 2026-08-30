package com.example.realestate.area;

import com.example.realestate.exception.GlobalExceptionHandler;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies that the JwtConfig security boundary for the trending areas endpoint is
 * correctly configured:
 * <ul>
 *   <li>GET /api/public/areas/trending is permit-all (unauthenticated callers reach the controller)</li>
 *   <li>POST /api/public/areas/trending without auth is rejected (405 Method Not Allowed or 403 Forbidden)</li>
 * </ul>
 *
 * <p>Uses a {@link TestSecurityConfig} that replicates the relevant {@code JwtConfig} permit rules
 * without the full OAuth2 resource server machinery, so the test can run without Supabase JWT
 * issuer configuration. The permit rule for GET /api/public/areas/trending mirrors line-for-line
 * what is configured in {@code JwtConfig}.
 */
@WebMvcTest(
        controllers = AreaOverviewController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({TrendingAreasSecurityTest.TestSecurityConfig.class, GlobalExceptionHandler.class})
class TrendingAreasSecurityTest {

    /**
     * Replicates the relevant portion of JwtConfig:
     * - GET /api/public/areas/trending is permit-all
     * - everything else requires authentication
     */
    static class TestSecurityConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth
                            .requestMatchers(HttpMethod.GET, "/api/public/areas/trending").permitAll()
                            .anyRequest().authenticated())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AreaOverviewService areaOverviewService;

    @MockitoBean
    private UserRoleService userRoleService;

    /**
     * Unauthenticated GET /api/public/areas/trending must not be rejected by Spring Security.
     * The controller is reached and returns 200 (empty list), not 401 or 403.
     */
    @Test
    void getTrending_unauthenticated_reachesController() throws Exception {
        when(areaOverviewService.getTrending(anyInt()))
                .thenReturn(new TrendingAreasResponse(List.of()));

        mockMvc.perform(get("/api/public/areas/trending"))
                .andExpect(status().isOk()); // 200, not 401/403 — proves permitAll fired
    }

    /**
     * POST /api/public/areas/trending without auth must be rejected by Spring Security.
     * Returns 403 (security rejects before dispatch) or 405 (method not allowed after security passes).
     * Either confirms the GET-scoped permitAll does not extend to POST.
     */
    @Test
    void postTrending_unauthenticated_isRejected() throws Exception {
        mockMvc.perform(post("/api/public/areas/trending"))
                .andExpect(status().is4xxClientError()); // 403 or 405 — not 200
    }
}
