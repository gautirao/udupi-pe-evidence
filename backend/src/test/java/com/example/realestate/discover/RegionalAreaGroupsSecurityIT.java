package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.IngestionApiKeyFilter;
import com.example.realestate.security.JwtConfig;
import com.example.realestate.security.PrometheusApiKeyFilter;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Security integration test that loads the REAL {@link JwtConfig} and verifies the
 * {@code permitAll} line for {@code /api/discover/regional-area-groups} is correctly
 * wired.
 *
 * <h2>What this test proves</h2>
 * <ol>
 *   <li>An anonymous GET (no {@code Authorization} header) returns HTTP 200 — not 401/403.</li>
 *   <li>An authenticated-only path ({@code /api/discover/areas} is NOT on the permit list
 *       for GET without a token) returns HTTP 401, confirming the security chain is active
 *       and not globally permissive. (Note: /api/discover/areas IS permitAll in JwtConfig —
 *       use /api/dashboard/listings which is auth-required and does not need a real DB.)</li>
 * </ol>
 *
 * <h2>Falsifiability</h2>
 * If the {@code .requestMatchers(HttpMethod.GET, "/api/discover/regional-area-groups").permitAll()}
 * line is removed from {@link JwtConfig}, test (1) will fail with HTTP 401 because the chain
 * falls through to {@code .anyRequest().authenticated()}.
 *
 * <h2>Setup</h2>
 * {@code @WebMvcTest} slice with the real {@link JwtConfig} imported alongside its two
 * filter dependencies ({@link IngestionApiKeyFilter}, {@link PrometheusApiKeyFilter}).
 * A no-op {@link JwtDecoder} mock satisfies Spring Security's resource-server wiring
 * without requiring a real Supabase issuer URI. The OAuth2 auto-configuration is excluded
 * so no external network call is made. {@code app.ingestion.api-key} is supplied as a
 * test property because {@link IngestionApiKeyFilter} has no default for that value.
 */
@WebMvcTest(
        controllers = RegionalAreaGroupsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({JwtConfig.class, IngestionApiKeyFilter.class, PrometheusApiKeyFilter.class,
        GlobalExceptionHandler.class})
@TestPropertySource(properties = {
        "app.ingestion.api-key=test-key-for-security-it",
        "app.metrics.api-key=test-metrics-key"
})
class RegionalAreaGroupsSecurityIT {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private RegionalAreaGroupsService regionalAreaGroupsService;

    @MockitoBean
    private UserRoleService userRoleService;

    /**
     * Satisfies Spring Security's oauth2ResourceServer JWT wiring without a real
     * issuer URI. The decoder is never invoked for anonymous requests to permitAll paths.
     */
    @MockitoBean
    private JwtDecoder jwtDecoder;

    // ── AC1 — real JwtConfig: anonymous GET → 200, not 401/403 ──────────────
    //
    // This test FAILS if the JwtConfig permitAll line for this path is removed:
    //   .requestMatchers(HttpMethod.GET, "/api/discover/regional-area-groups").permitAll()
    // Without it, anyRequest().authenticated() causes Spring Security to return 401.

    @Test
    void regionalAreaGroups_noAuthHeader_returns200WithRealJwtConfig() throws Exception {
        when(regionalAreaGroupsService.getRegionalGroups("udupi", "agricultural_land", null))
                .thenReturn(new RegionalAreaGroupsResponse("udupi", List.of()));

        mockMvc.perform(get("/api/discover/regional-area-groups")
                        .param("city", "udupi")
                        .param("propertyType", "agricultural_land"))
                // Must not be 401 or 403 — this endpoint is public
                .andExpect(status().isOk());
    }

    // ── Negative: real security chain is active (not globally permissive) ────
    //
    // /api/dashboard/listings is authenticated-only in JwtConfig (no permitAll match).
    // Without Authorization header the real chain returns 401, proving the chain is
    // live and not overridden to anyRequest().permitAll() by accident.

    @Test
    void authRequiredEndpoint_noAuthHeader_returns401WithRealJwtConfig() throws Exception {
        mockMvc.perform(get("/api/dashboard/listings"))
                .andExpect(status().isUnauthorized());
    }
}
