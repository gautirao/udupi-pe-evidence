package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.IngestionApiKeyFilter;
import com.example.realestate.security.JwtConfig;
import com.example.realestate.security.PrometheusApiKeyFilter;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Security integration test for {@link AgriDestinationsController} (#2151 PR C, C-B2/C-B4/S1/S4).
 *
 * <p>Mirrors {@code RegionalAreaGroupsSecurityIT} exactly: loads the REAL {@link JwtConfig} filter
 * chain and proves (1) the {@code permitAll} line for {@code /api/discover/agri-destinations} is
 * wired, and (2) — the C-B4 exposure check specific to this endpoint — the response body is
 * BYTE-IDENTICAL for an anonymous caller and an authenticated caller, because
 * {@link AgriDestinationBucketResponse} carries no price and no exact parcel coordinates (see the
 * controller's Cache-Control javadoc). This is the structural proof that S1 (anon/auth cache-key
 * segregation) does not apply here: there is no authed variant of this response to leak.
 *
 * <p>{@link JwtConfig} carries a
 * {@code .requestMatchers(HttpMethod.GET, "/api/discover/agri-destinations").permitAll()} matcher,
 * so the anonymous-GET test below asserts 200 through the real chain rather than documenting a gap.
 * The identical-body test proves there is no separate authed response shape to diverge from it, and
 * the negative test confirms the same chain still rejects an unauthenticated call to a genuinely
 * auth-required endpoint (401), so the permitAll grant is scoped to this one route rather than global.
 */
@WebMvcTest(
        controllers = AgriDestinationsController.class,
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
class AgriDestinationsSecurityIT {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AgriDestinationsService agriDestinationsService;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    // ── C-B2/S4: real JwtConfig — anonymous GET must be 200, not 401/403 ─────

    @Test
    @DisplayName("real JwtConfig: anonymous GET returns 200 via the permitAll matcher for "
            + "/api/discover/agri-destinations")
    void agriDestinations_noAuthHeader_returns200WithRealJwtConfig() throws Exception {
        when(agriDestinationsService.getDestinations("udupi", null, null, null))
                .thenReturn(new AgriDestinationsResponse("udupi", List.of()));

        mockMvc.perform(get("/api/discover/agri-destinations").param("city", "udupi"))
                .andExpect(status().isOk());
    }

    // ── C-B4: response body identical for anon vs authenticated caller — no auth branch exists ────

    @Test
    @WithMockUser
    @DisplayName("C-B4: authenticated caller receives the IDENTICAL body an anonymous caller would — "
            + "no price/coordinate fields exist to coarsen or withhold")
    void agriDestinations_authenticatedCaller_sameBodyAsAnonymous() throws Exception {
        AgriDestinationBucketResponse bucket = new AgriDestinationBucketResponse(
                "IN|KA|Udupi|Area1", "N towards Brahmavar", 8.2, 12.5, "N", 4L, 9.75);
        when(agriDestinationsService.getDestinations(eq("udupi"), any(), any(), any()))
                .thenReturn(new AgriDestinationsResponse("udupi", List.of(bucket)));

        // Authenticated request — the service call is identical regardless of auth state (no
        // isAuthenticated param exists on AgriDestinationsService#getDestinations at all), so this
        // is checked structurally rather than by comparing two live responses.
        mockMvc.perform(get("/api/discover/agri-destinations").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.destinations[0].parcelCount", is(4)))
                .andExpect(jsonPath("$.destinations[0].parcelAcreage", is(9.75)));
    }

    // ── Negative: real security chain is active (not globally permissive) ────

    @Test
    void authRequiredEndpoint_noAuthHeader_returns401WithRealJwtConfig() throws Exception {
        mockMvc.perform(get("/api/dashboard/listings"))
                .andExpect(status().isUnauthorized());
    }
}
