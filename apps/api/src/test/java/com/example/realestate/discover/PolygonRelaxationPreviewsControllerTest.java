package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code @WebMvcTest} for {@link PolygonRelaxationPreviewsController} (#2454): the authenticated
 * POLYGON variant of the relaxation previews. Mirrors {@code DiscoverListingsControllerTest}'s
 * #2420 block — the policy is mocked here because threshold/geometry behaviour is proven by
 * {@code PolygonGeographicSafetyPolicyIT} against real PostGIS; what this file proves is that the
 * controller calls the policy for the polygon, surfaces its rejection with the listings path's
 * reason code, and never touches the service when rejected. The real-security "anonymous → 401"
 * proof lives in {@code RelaxationPreviewsSecurityIT} with the real {@code JwtConfig}.
 */
@WebMvcTest(
        controllers = PolygonRelaxationPreviewsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({PolygonRelaxationPreviewsControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class PolygonRelaxationPreviewsControllerTest {

    @TestConfiguration
    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .build();
        }
    }

    private static final String PATH = "/api/discover/listings/relaxation-previews";
    private static final String VALID_POLYGON = "[[13.3,74.7],[13.4,74.8],[13.3,74.8]]";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private RelaxationPreviewsService service;

    @MockitoBean
    private PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(service, polygonGeographicSafetyPolicy, userRoleService);
        when(service.findPreviewsForScope(anyString(), any(), any(), any())).thenReturn(
                new RelaxationPreviewsResponse("udupi", RelaxationScope.Kind.POLYGON, List.of(), 0L, List.of()));
    }

    @Test
    @DisplayName("no JWT is rejected before anything else runs")
    void noJwt_isRejected() throws Exception {
        mockMvc.perform(get(PATH).param("city", "udupi").param("polygon", VALID_POLYGON))
                .andExpect(status().is4xxClientError());

        verifyNoInteractions(polygonGeographicSafetyPolicy, service);
    }

    @Test
    @DisplayName("an accepted polygon reaches the service as a POLYGON scope, with the filter set's polygon left for the service")
    void acceptedPolygon_serviceCalledWithPolygonScope() throws Exception {
        mockMvc.perform(get(PATH)
                        .param("city", "udupi")
                        .param("polygon", VALID_POLYGON)
                        .param("priceMax", "5000000")
                        .param("limit", "2")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(jsonPath("$.scopeKind").value("POLYGON"));

        verify(polygonGeographicSafetyPolicy).validate(eq("udupi"), anyList());

        ArgumentCaptor<RelaxationScope> scope = ArgumentCaptor.forClass(RelaxationScope.class);
        ArgumentCaptor<DiscoverListingPredicateBuilder.Filters> filters =
                ArgumentCaptor.forClass(DiscoverListingPredicateBuilder.Filters.class);
        verify(service).findPreviewsForScope(eq("udupi"), scope.capture(), eq(2), filters.capture());

        assertThat(scope.getValue()).isInstanceOf(RelaxationScope.Polygon.class);
        assertThat(((RelaxationScope.Polygon) scope.getValue()).polygon()).hasSize(3);
        assertThat(filters.getValue().polygon()).isNull();
        assertThat(filters.getValue().areaKeys()).isNull();
        assertThat(filters.getValue().viewportScope()).isNull();
        assertThat(filters.getValue().priceMaxPaise()).isEqualTo(500_000_000L);
    }

    @Test
    @DisplayName("a polygon the safety policy rejects is a 400 with the listings reason, and is never counted")
    void policyRejection_outsideCity_returns400_serviceNeverCalled() throws Exception {
        doThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_outside_searchable_city"))
                .when(polygonGeographicSafetyPolicy).validate(eq("udupi"), anyList());

        mockMvc.perform(get(PATH).param("city", "udupi").param("polygon", VALID_POLYGON).with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("polygon_outside_searchable_city")));

        verifyNoInteractions(service);
    }

    @Test
    @DisplayName("a polygon too broad for the safety policy is a 400 with the listings reason, and is never counted")
    void policyRejection_tooBroad_returns400_serviceNeverCalled() throws Exception {
        doThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_scope_too_broad"))
                .when(polygonGeographicSafetyPolicy).validate(eq("udupi"), anyList());

        mockMvc.perform(get(PATH).param("city", "udupi").param("polygon", VALID_POLYGON).with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("polygon_scope_too_broad")));

        verifyNoInteractions(service);
    }

    @Test
    @DisplayName("a missing polygon is a 400 — this endpoint has no other scope to fall back to")
    void missingPolygon_returns400() throws Exception {
        mockMvc.perform(get(PATH).param("city", "udupi").with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(polygonGeographicSafetyPolicy, service);
    }

    @Test
    @DisplayName("fewer than 3 vertices is a 400 with the listings reason")
    void tooFewVertices_returns400() throws Exception {
        mockMvc.perform(get(PATH).param("city", "udupi").param("polygon", "[[13.3,74.7],[13.4,74.8]]").with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("polygon_must_have_at_least_3_vertices")));

        verifyNoInteractions(polygonGeographicSafetyPolicy, service);
    }

    @Test
    @DisplayName("invalid polygon JSON is a 400 with the listings reason — never silently dropped")
    void invalidJson_returns400() throws Exception {
        mockMvc.perform(get(PATH).param("city", "udupi").param("polygon", "not-json").with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("polygon_invalid_json")));

        verifyNoInteractions(polygonGeographicSafetyPolicy, service);
    }

    @Test
    @DisplayName("a malformed bbox (render prefilter, not the scope) is dropped rather than surfaced, as on the sibling")
    void malformedBbox_doesNot400() throws Exception {
        mockMvc.perform(get(PATH)
                        .param("city", "udupi")
                        .param("polygon", VALID_POLYGON)
                        .param("bbox", "1,2,3")
                        .with(jwt()))
                .andExpect(status().isOk());

        ArgumentCaptor<DiscoverListingPredicateBuilder.Filters> filters =
                ArgumentCaptor.forClass(DiscoverListingPredicateBuilder.Filters.class);
        verify(service).findPreviewsForScope(eq("udupi"), any(), isNull(), filters.capture());
        assertThat(filters.getValue().bbox()).isNull();
    }
}
