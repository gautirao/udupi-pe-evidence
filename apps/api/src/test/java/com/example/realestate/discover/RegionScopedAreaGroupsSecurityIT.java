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
 * Security integration test that loads the REAL {@link JwtConfig} and verifies the new
 * {@code permitAll} matcher for
 * {@code GET /api/discover/cities/{citySlug}/regions/{regionKey}/groups} (#1910 PR1) is correctly
 * wired AND scoped — i.e. it does not widen matching beyond its exact path pattern.
 *
 * <h2>What this test proves</h2>
 * <ol>
 *   <li>An anonymous GET on the new path returns HTTP 200 — not 401/403.</li>
 *   <li>A pre-existing authenticated-only route ({@code /api/dashboard/listings}) is unaffected
 *       by the new matcher — still returns 401 without a token.</li>
 *   <li>A path just OUTSIDE the new matcher's exact pattern
 *       ({@code /api/discover/cities/{citySlug}/regions/{regionKey}/groups/extra}) is NOT newly
 *       permitted — falls through to {@code anyRequest().authenticated()} and returns 401,
 *       proving the glob {@code /api/discover/cities/*&#47;regions/*&#47;groups} does not
 *       over-match.</li>
 *   <li>The pre-existing sibling {@code /api/discover/cities/*&#47;regions} matcher (#1882) is
 *       still independently active and unaffected by the new line (chain-order stability).</li>
 * </ol>
 *
 * <h2>Falsifiability</h2>
 * If the
 * {@code .requestMatchers(HttpMethod.GET, "/api/discover/cities/}<i>*</i>{@code /regions/}<i>*</i>
 * {@code /groups").permitAll()} line is removed from {@link JwtConfig}, test (1) fails with HTTP
 * 401. If the matcher pattern were accidentally widened (e.g. to a trailing {@code /**}), test
 * (3) would fail by unexpectedly returning 200.
 *
 * <h2>Setup</h2>
 * Mirrors {@code RegionSummaryControllerSecurityIT}: a {@code @WebMvcTest} slice with the real
 * {@link JwtConfig} imported alongside its two API-key filter dependencies.
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
class RegionScopedAreaGroupsSecurityIT {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private RegionSummaryService regionSummaryService;

    @MockitoBean
    private AreaGroupsService areaGroupsService;

    @MockitoBean
    private UserRoleService userRoleService;

    /**
     * Satisfies Spring Security's oauth2ResourceServer JWT wiring without a real issuer URI.
     * The decoder is never invoked for anonymous requests to permitAll paths.
     */
    @MockitoBean
    private JwtDecoder jwtDecoder;

    // ── (1) real JwtConfig: anonymous GET on the new path → 200, not 401/403 ────

    @Test
    void regionScopedGroupsEndpoint_noAuthHeader_returns200() throws Exception {
        when(areaGroupsService.getRegionScopedGroupsByCity("udupi", "CENTRAL", null))
                .thenReturn(new RegionScopedAreaGroup.Response("udupi", "CENTRAL", List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/regions/CENTRAL/groups"))
                .andExpect(status().isOk());
    }

    // ── (2) negative control: real security chain is active (not globally permissive) ──

    @Test
    void authRequiredEndpoint_noAuthHeader_returns401() throws Exception {
        mockMvc.perform(get("/api/dashboard/listings"))
                .andExpect(status().isUnauthorized());
    }

    // ── (3) matcher isolation: a path just outside the exact pattern is NOT newly permitted ──

    @Test
    void pathJustOutsideNewMatcherPattern_isNotPermitted() throws Exception {
        mockMvc.perform(get("/api/discover/cities/udupi/regions/CENTRAL/groups/extra"))
                .andExpect(status().isUnauthorized());
    }

    // ── (4) sibling #1882 matcher remains independently active ──────────────────

    @Test
    void siblingRegionsEndpoint_stillPermitted_afterNewMatcherAdded() throws Exception {
        when(regionSummaryService.getRegions("udupi", null))
                .thenReturn(new RegionSummaryResponse(3, "udupi", List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/regions"))
                .andExpect(status().isOk());
    }
}
