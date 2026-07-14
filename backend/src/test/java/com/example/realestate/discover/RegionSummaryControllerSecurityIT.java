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
 * {@code permitAll} line for {@code GET /api/discover/cities/{citySlug}/regions} is correctly
 * wired (#1882 Track A PR1).
 *
 * <h2>What this test proves</h2>
 * <ol>
 *   <li>An anonymous GET (no {@code Authorization} header) returns HTTP 200 — not 401/403.</li>
 *   <li>An authenticated-only path ({@code /api/dashboard/listings}, which has no permitAll
 *       match in {@link JwtConfig}) returns HTTP 401 without a token, confirming the security
 *       chain is active and not globally permissive.</li>
 * </ol>
 *
 * <h2>Falsifiability</h2>
 * If the
 * {@code .requestMatchers(HttpMethod.GET, "/api/discover/cities/}<i>*</i>{@code /regions").permitAll()}
 * line is removed from {@link JwtConfig}, test (1) fails with HTTP 401 because the chain falls
 * through to {@code .anyRequest().authenticated()}.
 *
 * <h2>Setup</h2>
 * Mirrors {@code RegionalAreaGroupsSecurityIT}: a {@code @WebMvcTest} slice with the real
 * {@link JwtConfig} imported alongside its two API-key filter dependencies. {@code @WebMvcTest}
 * auto-detects {@link com.example.realestate.security.DbRoleJwtAuthenticationConverter} (a
 * {@code Converter} bean, one of the slice's auto-scanned bean kinds) without an explicit
 * {@code @Import} — its own {@link UserRoleService} dependency is mocked below. A no-op
 * {@link JwtDecoder} mock satisfies Spring Security's resource-server wiring without a real
 * Supabase issuer URI; OAuth2 auto-configuration is excluded so no external network call is made.
 */
@WebMvcTest(
        controllers = RegionSummaryController.class,
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
class RegionSummaryControllerSecurityIT {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private RegionSummaryService regionSummaryService;

    @MockitoBean
    private UserRoleService userRoleService;

    /**
     * Satisfies Spring Security's oauth2ResourceServer JWT wiring without a real issuer URI.
     * The decoder is never invoked for anonymous requests to permitAll paths.
     */
    @MockitoBean
    private JwtDecoder jwtDecoder;

    // ── AC — real JwtConfig: anonymous GET → 200, not 401/403 ────────────────
    //
    // This test FAILS if the JwtConfig permitAll line for this path is removed:
    //   .requestMatchers(HttpMethod.GET, "/api/discover/cities/*/regions").permitAll()
    // Without it, anyRequest().authenticated() causes Spring Security to return 401.

    @Test
    void regionsEndpoint_noAuthHeader_returns200() throws Exception {
        when(regionSummaryService.getRegions("udupi", null))
                .thenReturn(new RegionSummaryResponse(3, "udupi", List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/regions"))
                // Must not be 401 or 403 — this endpoint is public.
                .andExpect(status().isOk());
    }

    // ── Negative: real security chain is active (not globally permissive) ────
    //
    // /api/dashboard/listings is authenticated-only in JwtConfig (no permitAll match).
    // Without an Authorization header the real chain returns 401, proving the chain is
    // live and not overridden to anyRequest().permitAll() by accident.

    @Test
    void authRequiredEndpoint_noAuthHeader_returns401() throws Exception {
        mockMvc.perform(get("/api/dashboard/listings"))
                .andExpect(status().isUnauthorized());
    }
}
