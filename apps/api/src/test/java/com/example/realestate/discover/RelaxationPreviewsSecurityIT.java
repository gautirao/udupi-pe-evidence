package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.IngestionApiKeyFilter;
import com.example.realestate.security.JwtConfig;
import com.example.realestate.security.PrometheusApiKeyFilter;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Loads the REAL {@link JwtConfig} and proves the #2454 auth split between the two relaxation
 * preview endpoints is wired the way the issue requires:
 *
 * <ol>
 *   <li>{@code GET /api/discover/listings/relaxation-previews} (POLYGON) has NO permitAll entry,
 *       so an anonymous request is a 401 from the security chain — the controller, the policy and
 *       the service are never reached. This is the "unreachable while signed out" acceptance
 *       criterion, proven against the production security configuration rather than a test stub.
 *       Falsifiable: adding a permitAll line for this path to {@link JwtConfig} turns (1) into a
 *       200 and fails the test.</li>
 *   <li>The same request with a JWT is a 200, so the fallthrough is
 *       {@code anyRequest().authenticated()} and not some broader block.</li>
 *   <li>{@code GET /api/discover/areas/relaxation-previews} (AREA_SET / VIEWPORT) stays public:
 *       anonymous is 200, unchanged from #2018 slice 2.</li>
 * </ol>
 *
 * <p>Setup mirrors {@code RegionSummaryControllerSecurityIT}: a {@code @WebMvcTest} slice with the
 * real {@link JwtConfig} and its two API-key filter dependencies; a no-op {@link JwtDecoder} mock
 * satisfies the resource-server wiring without a real issuer; OAuth2 auto-configuration is excluded
 * so no network call is made.
 */
@WebMvcTest(
        controllers = {PolygonRelaxationPreviewsController.class, RelaxationPreviewsController.class},
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
class RelaxationPreviewsSecurityIT {

    private static final String POLYGON_PATH = "/api/discover/listings/relaxation-previews";
    private static final String AREAS_PATH = "/api/discover/areas/relaxation-previews";
    private static final String VALID_POLYGON = "[[13.3,74.7],[13.4,74.8],[13.3,74.8]]";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private RelaxationPreviewsService service;

    @MockitoBean
    private PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy;

    @MockitoBean
    private UserRoleService userRoleService;

    /** Satisfies Spring Security's oauth2ResourceServer JWT wiring without a real issuer URI. */
    @MockitoBean
    private JwtDecoder jwtDecoder;

    @BeforeEach
    void setUp() {
        when(service.findPreviewsForScope(anyString(), any(), any(), any())).thenReturn(
                new RelaxationPreviewsResponse("udupi", RelaxationScope.Kind.POLYGON, List.of(), 0L, List.of()));
        when(service.findPreviews(anyString(), any(), any(), any())).thenReturn(
                new RelaxationPreviewsResponse("udupi", List.of(), 0L, List.of()));
    }

    @Test
    @DisplayName("#2454 anonymous POLYGON relaxation previews are unreachable: 401 from the real chain, nothing downstream runs")
    void polygonEndpoint_anonymous_returns401_nothingReached() throws Exception {
        mockMvc.perform(get(POLYGON_PATH).param("city", "udupi").param("polygon", VALID_POLYGON))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(polygonGeographicSafetyPolicy, service);
    }

    @Test
    @DisplayName("#2454 the same POLYGON request with a JWT is served")
    void polygonEndpoint_withJwt_returns200() throws Exception {
        mockMvc.perform(get(POLYGON_PATH).param("city", "udupi").param("polygon", VALID_POLYGON).with(jwt()))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("the area-keyed / viewport endpoint stays public (unchanged from #2018 slice 2)")
    void areasEndpoint_anonymous_returns200() throws Exception {
        mockMvc.perform(get(AREAS_PATH).param("city", "udupi").param("areaKeys", "IN|KA|Udupi|Manipal"))
                .andExpect(status().isOk());
    }
}
