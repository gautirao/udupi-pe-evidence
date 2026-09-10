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
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code @WebMvcTest} for {@link RelaxationPreviewsController} (#2018 slice 2) — param binding,
 * price unit conversion, and the "malformed filter never 400s" contract. Counting logic is covered
 * by {@code RelaxationPreviewsServiceIT} against a real database; this test only proves the HTTP
 * layer parses and delegates correctly, and that the JSON envelope has the documented shape.
 */
@WebMvcTest(
        controllers = RelaxationPreviewsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({RelaxationPreviewsControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class RelaxationPreviewsControllerTest {

    @TestConfiguration
    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                    .build();
        }
    }

    private static final String PATH = "/api/discover/areas/relaxation-previews";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private RelaxationPreviewsService service;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(service, userRoleService);
        when(service.findPreviews(anyString(), any(), any(), any()))
                .thenReturn(new RelaxationPreviewsResponse("udupi", List.of(), 0L, List.of()));
    }

    @Test
    @DisplayName("minimal request returns 200 and echoes the city")
    void minimalRequest_returns200() throws Exception {
        mockMvc.perform(get(PATH).param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city").value("udupi"));

        verify(service).findPreviews(eq("udupi"), isNull(), isNull(), any());
    }

    @Test
    @DisplayName("missing city is a 400, matching the sibling endpoint")
    void missingCity_returns400() throws Exception {
        mockMvc.perform(get(PATH)).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("areaKeys and limit are passed through as given")
    void areaKeysAndLimit_passedThrough() throws Exception {
        mockMvc.perform(get(PATH)
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Manipal", "IN|KA|Udupi|Malpe")
                        .param("limit", "3"))
                .andExpect(status().isOk());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> areaKeys = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<Integer> limit = ArgumentCaptor.forClass(Integer.class);
        verify(service).findPreviews(eq("udupi"), areaKeys.capture(), limit.capture(), any());

        assertThat(areaKeys.getValue()).containsExactly("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Malpe");
        assertThat(limit.getValue()).isEqualTo(3);
    }

    @Test
    @DisplayName("price params are converted from rupees to paise before reaching the service")
    void priceParams_convertedToPaise() throws Exception {
        mockMvc.perform(get(PATH)
                        .param("city", "udupi")
                        .param("priceMin", "1000000")
                        .param("priceMax", "5000000"))
                .andExpect(status().isOk());

        ArgumentCaptor<DiscoverListingPredicateBuilder.Filters> filters =
                ArgumentCaptor.forClass(DiscoverListingPredicateBuilder.Filters.class);
        verify(service).findPreviews(eq("udupi"), isNull(), isNull(), filters.capture());

        assertThat(filters.getValue().priceMinPaise()).isEqualTo(100_000_000L);
        assertThat(filters.getValue().priceMaxPaise()).isEqualTo(500_000_000L);
    }

    @Test
    @DisplayName("scope-defining filters the service owns are never pre-set by the controller")
    void scopeFilters_leftForTheServiceToSet() throws Exception {
        mockMvc.perform(get(PATH)
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Manipal"))
                .andExpect(status().isOk());

        ArgumentCaptor<DiscoverListingPredicateBuilder.Filters> filters =
                ArgumentCaptor.forClass(DiscoverListingPredicateBuilder.Filters.class);
        verify(service).findPreviews(eq("udupi"), any(), isNull(), filters.capture());

        assertThat(filters.getValue().areaKeys())
                .as("the service re-scopes from the areaKeys param; the controller must not")
                .isNull();
        assertThat(filters.getValue().viewportScope())
                .as("an AREA/AREA_SET scope is never also a viewport scope")
                .isNull();
        assertThat(filters.getValue().excludePropertyTypes()).isNull();
    }

    // ── #2454: no anonymous polygon path, by construction ─────────────────────────────────

    @Test
    @DisplayName("#2454 a well-formed polygon on the anonymous endpoint is a 400 and never reaches the service")
    void polygon_rejectedOnAnonymousEndpoint() throws Exception {
        mockMvc.perform(get(PATH)
                        .param("city", "udupi")
                        .param("polygon", "[[13.3,74.7],[13.4,74.8],[13.3,74.8]]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("polygon_scope_requires_authentication")));

        verifyNoInteractions(service);
    }

    @Test
    @DisplayName("#2454 a malformed polygon is rejected the same way — never silently dropped into an area-keyed count")
    void malformedPolygon_alsoRejected() throws Exception {
        mockMvc.perform(get(PATH)
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Manipal")
                        .param("polygon", "not-json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("polygon_scope_requires_authentication")));

        verifyNoInteractions(service);
    }

    // ── #2454: VIEWPORT scope via the #2015 bounds rules ──────────────────────────────────

    @Test
    @DisplayName("#2454 viewportScope is parsed by BboxParser and handed to the service as a VIEWPORT scope")
    void viewportScope_passedThroughAsScope() throws Exception {
        when(service.findPreviewsForScope(anyString(), any(), any(), any())).thenReturn(
                new RelaxationPreviewsResponse("udupi", RelaxationScope.Kind.VIEWPORT, List.of(), 0L, List.of()));

        mockMvc.perform(get(PATH)
                        .param("city", "udupi")
                        .param("viewportScope", "13.0,74.6,13.1,74.8")
                        .param("priceMax", "5000000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopeKind").value("VIEWPORT"))
                .andExpect(jsonPath("$.areaKeys").isEmpty());

        ArgumentCaptor<RelaxationScope> scope = ArgumentCaptor.forClass(RelaxationScope.class);
        ArgumentCaptor<DiscoverListingPredicateBuilder.Filters> filters =
                ArgumentCaptor.forClass(DiscoverListingPredicateBuilder.Filters.class);
        verify(service).findPreviewsForScope(eq("udupi"), scope.capture(), isNull(), filters.capture());
        verify(service, never()).findPreviews(anyString(), any(), any(), any());

        assertThat(scope.getValue()).isInstanceOf(RelaxationScope.Viewport.class);
        assertThat(((RelaxationScope.Viewport) scope.getValue()).bounds())
                .isEqualTo(new DiscoverListingPredicateBuilder.Bbox(13.0, 74.6, 13.1, 74.8));
        assertThat(filters.getValue().viewportScope())
                .as("the service re-scopes from the validated scope; the controller must not pre-set it")
                .isNull();
        assertThat(filters.getValue().priceMaxPaise()).isEqualTo(500_000_000L);
    }

    @Test
    @DisplayName("#2454 a malformed viewportScope is a 400 with BboxParser's reason — a scope is never silently repaired")
    void malformedViewportScope_returns400() throws Exception {
        mockMvc.perform(get(PATH)
                        .param("city", "udupi")
                        .param("viewportScope", "1,2,3"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("bbox_must_have_4_values")));

        verifyNoInteractions(service);
    }

    @Test
    @DisplayName("#2454 a viewportScope wider than the #2015 span cap is a 400 with the listings reason")
    void oversizedViewportScope_returns400() throws Exception {
        mockMvc.perform(get(PATH)
                        .param("city", "udupi")
                        .param("viewportScope", "0,60,20,80"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("viewport_scope_span_exceeds_max")));

        verifyNoInteractions(service);
    }

    @Test
    @DisplayName("#2454 areaKeys and viewportScope together violate #2016 exclusivity")
    void areaKeysAndViewportScope_returns400() throws Exception {
        mockMvc.perform(get(PATH)
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Manipal")
                        .param("viewportScope", "13.0,74.6,13.1,74.8"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("result_scope_must_be_exclusive")));

        verifyNoInteractions(service);
    }

    @Test
    @DisplayName("#2454 the area-keyed contract is unchanged: no viewportScope means the area-keyed path, scopeKind AREA_SET")
    void areaKeyedPath_unchanged() throws Exception {
        mockMvc.perform(get(PATH)
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Manipal"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopeKind").value("AREA_SET"));

        verify(service).findPreviews(eq("udupi"), any(), isNull(), any());
        verify(service, never()).findPreviewsForScope(anyString(), any(), any(), any());
    }

    @Test
    @DisplayName("a malformed bbox is dropped rather than surfaced as a 400")
    void malformedBbox_doesNot400() throws Exception {
        mockMvc.perform(get(PATH)
                        .param("city", "udupi")
                        .param("bbox", "1,2,3"))
                .andExpect(status().isOk());

        ArgumentCaptor<DiscoverListingPredicateBuilder.Filters> filters =
                ArgumentCaptor.forClass(DiscoverListingPredicateBuilder.Filters.class);
        verify(service).findPreviews(eq("udupi"), isNull(), isNull(), filters.capture());
        assertThat(filters.getValue().bbox()).isNull();
    }

    @Test
    @DisplayName("only the patch field for a preview's kind is serialized")
    void responseEnvelope_omitsIrrelevantPatchFields() throws Exception {
        when(service.findPreviews(anyString(), any(), any(), any())).thenReturn(
                new RelaxationPreviewsResponse("udupi", List.of("IN|KA|Udupi|Manipal"), 0L, List.of(
                        RelaxationPreview.priceMax(6_000_000L, 7L),
                        RelaxationPreview.bedrooms(List.of(2, 3), 11L))));

        mockMvc.perform(get(PATH).param("city", "udupi").param("areaKeys", "IN|KA|Udupi|Manipal"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.baselineCount").value(0))
                .andExpect(jsonPath("$.previews[0].kind").value("PRICE_MAX"))
                .andExpect(jsonPath("$.previews[0].priceMax").value(6000000))
                .andExpect(jsonPath("$.previews[0].resultingCount").value(7))
                .andExpect(jsonPath("$.previews[0].bedrooms").doesNotExist())
                .andExpect(jsonPath("$.previews[0].readyToMove").doesNotExist())
                .andExpect(jsonPath("$.previews[1].kind").value("BEDROOMS"))
                .andExpect(jsonPath("$.previews[1].bedrooms[0]").value(2))
                .andExpect(jsonPath("$.previews[1].bedrooms[1]").value(3))
                .andExpect(jsonPath("$.previews[1].priceMax").doesNotExist());
    }
}
