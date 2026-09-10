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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Filter-parsing parity between {@link RelaxationPreviewsController}, its #2454 authenticated
 * POLYGON sibling {@link PolygonRelaxationPreviewsController}, and
 * {@link NearbyAreaCandidatesController} (#2018 slice 2, raised by exact-head review of
 * {@code 0e0fac01} as a non-blocking completion item; widened to three endpoints by #2454).
 *
 * <p><b>The risk this closes.</b> All three endpoints promise counts that agree with what the
 * shopper will actually see, and all get that guarantee by handing a {@code Filters} value to the
 * shared {@link DiscoverListingPredicateBuilder}. But each controller does its OWN request-param
 * parsing on the way in — rupees-to-paise conversion, list binding, silent bbox normalization. A
 * shared predicate builder does nothing to protect against the parsers drifting apart: if one
 * endpoint ever read {@code priceMax} in paise, or dropped a param the listings query honours, its
 * previews would be confidently, silently wrong while every other test still passed.
 *
 * <p>So this test drives the controllers with a byte-identical filter query string and asserts the
 * {@code Filters} they construct are equal on every component they share. It deliberately does not
 * touch the database: the claim under test is about parsing, and a DB would only obscure it. The
 * count-equality half of the #2454 invariant (a POLYGON/VIEWPORT preview equals the listings
 * predicate's COUNT for the same scope + relaxed filters) is proven on Testcontainers in
 * {@code RelaxationPreviewsServiceIT}.
 *
 * <p>The components that legitimately differ are asserted individually, not skipped — the scope
 * components ({@code areaKeys}, {@code polygon}, {@code viewportScope}) are the service's to set
 * from the validated scope on both relaxation endpoints, and {@code excludePropertyTypes} is
 * accepted by none of them.
 */
@WebMvcTest(
        controllers = {
                RelaxationPreviewsController.class,
                PolygonRelaxationPreviewsController.class,
                NearbyAreaCandidatesController.class
        },
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({RelaxationPreviewsFilterParityTest.TestConfig.class, GlobalExceptionHandler.class})
class RelaxationPreviewsFilterParityTest {

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

    private static final String AREAS_PATH = "/api/discover/areas/relaxation-previews";
    private static final String POLYGON_PATH = "/api/discover/listings/relaxation-previews";
    private static final String NEARBY_PATH = "/api/discover/areas/nearby-candidates";
    private static final String POLYGON = "[[12.9,77.5],[12.95,77.55],[12.9,77.6]]";

    @Autowired private MockMvc mockMvc;
    @MockitoBean private RelaxationPreviewsService relaxationService;
    @MockitoBean private NearbyAreaCandidatesService nearbyService;
    @MockitoBean private PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy;
    @MockitoBean private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        when(relaxationService.findPreviews(anyString(), any(), any(), any()))
                .thenReturn(new RelaxationPreviewsResponse("bangalore", List.of(), 0L, List.of()));
        when(relaxationService.findPreviewsForScope(anyString(), any(), any(), any()))
                .thenReturn(new RelaxationPreviewsResponse(
                        "bangalore", RelaxationScope.Kind.POLYGON, List.of(), 0L, List.of()));
        when(nearbyService.findCandidates(anyString(), any(), any(), any()))
                .thenReturn(new NearbyAreaCandidatesResponse("bangalore", List.of(), List.of()));
    }

    /**
     * Every NON-SCOPE filter param all three endpoints accept, with values chosen to be
     * individually falsifiable. The scope param is added per endpoint by the callers below.
     */
    private static MockHttpServletRequestBuilder withEveryFilter(String path) {
        return get(path)
                .param("city", "bangalore")
                .param("propertyTypes", "apartment", "villa")
                .param("priceMin", "1000000")
                .param("priceMax", "5000000")
                .param("dateFrom", "2026-01-01")
                .param("dateTo", "2026-06-30")
                .param("bedrooms", "2", "3")
                .param("sellerTypes", "owner", "broker")
                .param("backOnMarket", "true")
                .param("newToMarket", "true")
                .param("reraRegistered", "true")
                .param("readyToMove", "true")
                .param("schoolLat", "13.05")
                .param("schoolLon", "77.62")
                .param("schoolRadiusKm", "3.5")
                .param("q", "corner plot")
                .param("bbox", "12.9,77.5,13.1,77.7")
                .param("listingPurpose", "sale");
    }

    private DiscoverListingPredicateBuilder.Filters captureAreas() throws Exception {
        mockMvc.perform(withEveryFilter(AREAS_PATH)).andExpect(status().isOk());
        ArgumentCaptor<DiscoverListingPredicateBuilder.Filters> captor =
                ArgumentCaptor.forClass(DiscoverListingPredicateBuilder.Filters.class);
        verify(relaxationService).findPreviews(anyString(), any(), any(), captor.capture());
        return captor.getValue();
    }

    private DiscoverListingPredicateBuilder.Filters captureViewport() throws Exception {
        mockMvc.perform(withEveryFilter(AREAS_PATH).param("viewportScope", "12.9,77.5,13.0,77.6"))
                .andExpect(status().isOk());
        ArgumentCaptor<DiscoverListingPredicateBuilder.Filters> captor =
                ArgumentCaptor.forClass(DiscoverListingPredicateBuilder.Filters.class);
        verify(relaxationService).findPreviewsForScope(anyString(), any(), any(), captor.capture());
        return captor.getValue();
    }

    private DiscoverListingPredicateBuilder.Filters capturePolygon() throws Exception {
        mockMvc.perform(withEveryFilter(POLYGON_PATH).param("polygon", POLYGON).with(jwt()))
                .andExpect(status().isOk());
        ArgumentCaptor<DiscoverListingPredicateBuilder.Filters> captor =
                ArgumentCaptor.forClass(DiscoverListingPredicateBuilder.Filters.class);
        verify(relaxationService).findPreviewsForScope(anyString(), any(), any(), captor.capture());
        return captor.getValue();
    }

    private DiscoverListingPredicateBuilder.Filters captureNearby() throws Exception {
        mockMvc.perform(withEveryFilter(NEARBY_PATH).param("polygon", POLYGON)).andExpect(status().isOk());
        ArgumentCaptor<DiscoverListingPredicateBuilder.Filters> captor =
                ArgumentCaptor.forClass(DiscoverListingPredicateBuilder.Filters.class);
        verify(nearbyService).findCandidates(anyString(), any(), any(), captor.capture());
        return captor.getValue();
    }

    /** Every component that is a FILTER (not a scope) must be parsed identically. */
    private static void assertSharedFiltersEqual(
            DiscoverListingPredicateBuilder.Filters a, DiscoverListingPredicateBuilder.Filters b) {
        assertThat(a.city()).isEqualTo(b.city());
        assertThat(a.propertyTypes()).isEqualTo(b.propertyTypes());
        // The unit trap: PropertyFilters carries rupees, the predicate carries paise. If these two
        // ever disagree, every previewed count silently becomes wrong by a factor of 100.
        assertThat(a.priceMinPaise()).isEqualTo(b.priceMinPaise());
        assertThat(a.priceMaxPaise()).isEqualTo(b.priceMaxPaise());
        assertThat(a.dateFrom()).isEqualTo(b.dateFrom());
        assertThat(a.dateTo()).isEqualTo(b.dateTo());
        assertThat(a.bedrooms()).isEqualTo(b.bedrooms());
        assertThat(a.sellerTypes()).isEqualTo(b.sellerTypes());
        assertThat(a.backOnMarket()).isEqualTo(b.backOnMarket());
        assertThat(a.newToMarket()).isEqualTo(b.newToMarket());
        assertThat(a.reraRegistered()).isEqualTo(b.reraRegistered());
        assertThat(a.readyToMove()).isEqualTo(b.readyToMove());
        assertThat(a.schoolLat()).isEqualTo(b.schoolLat());
        assertThat(a.schoolLon()).isEqualTo(b.schoolLon());
        assertThat(a.schoolRadiusKm()).isEqualTo(b.schoolRadiusKm());
        assertThat(a.bbox()).isEqualTo(b.bbox());
        assertThat(a.q()).isEqualTo(b.q());
        assertThat(a.listingPurpose()).isEqualTo(b.listingPurpose());
        assertThat(a.excludePropertyTypes()).isNull();
        assertThat(b.excludePropertyTypes()).isNull();
    }

    @Test
    @DisplayName("the area-keyed relaxation endpoint and nearby-candidates parse an identical filter string identically")
    void filterParsing_areasVersusNearby() throws Exception {
        DiscoverListingPredicateBuilder.Filters relaxation = captureAreas();
        DiscoverListingPredicateBuilder.Filters nearby = captureNearby();

        assertSharedFiltersEqual(relaxation, nearby);

        // Scope components: left for the service on the relaxation side; the nearby endpoint
        // (#2017) still accepts a polygon FILTER, which the relaxation endpoint refuses (below).
        assertThat(relaxation.areaKeys()).as("the service re-scopes from its own param").isNull();
        assertThat(nearby.areaKeys()).isNull();
        assertThat(relaxation.polygon()).as("never present on the anonymous endpoint").isNull();
        assertThat(nearby.polygon()).hasSize(3);
        assertThat(relaxation.viewportScope()).isNull();
        assertThat(nearby.viewportScope()).isNull();
    }

    @Test
    @DisplayName("#2454 the VIEWPORT variant parses the same filter string identically to the area-keyed one")
    void filterParsing_viewportVersusAreas() throws Exception {
        DiscoverListingPredicateBuilder.Filters viewport = captureViewport();
        DiscoverListingPredicateBuilder.Filters areas = captureAreas();

        assertSharedFiltersEqual(viewport, areas);
        assertThat(viewport.viewportScope())
                .as("the service re-scopes from the validated scope; the controller must not pre-set it")
                .isNull();
        assertThat(viewport.areaKeys()).isNull();
        assertThat(viewport.polygon()).isNull();
    }

    @Test
    @DisplayName("#2454 the POLYGON variant parses the same filter string identically to the area-keyed one")
    void filterParsing_polygonVersusAreas() throws Exception {
        DiscoverListingPredicateBuilder.Filters polygon = capturePolygon();
        DiscoverListingPredicateBuilder.Filters areas = captureAreas();

        assertSharedFiltersEqual(polygon, areas);
        assertThat(polygon.polygon())
                .as("the service re-scopes from the validated scope; the controller must not pre-set it")
                .isNull();
        assertThat(polygon.areaKeys()).isNull();
        assertThat(polygon.viewportScope()).isNull();
    }

    @Test
    @DisplayName("#2454 the POLYGON variant hands the service exactly the polygon the request carried")
    void polygonScope_isTheRequestPolygon() throws Exception {
        mockMvc.perform(withEveryFilter(POLYGON_PATH).param("polygon", POLYGON).with(jwt()))
                .andExpect(status().isOk());

        ArgumentCaptor<RelaxationScope> scope = ArgumentCaptor.forClass(RelaxationScope.class);
        verify(relaxationService).findPreviewsForScope(anyString(), scope.capture(), any(), any());
        assertThat(scope.getValue()).isInstanceOf(RelaxationScope.Polygon.class);
        assertThat(((RelaxationScope.Polygon) scope.getValue()).polygon())
                .containsExactly(List.of(12.9, 77.5), List.of(12.95, 77.55), List.of(12.9, 77.6));
    }

    @Test
    @DisplayName("#2454 the anonymous relaxation endpoint refuses a polygon outright — the same string nearby-candidates accepts")
    void polygonOnAnonymousRelaxationEndpoint_isRefused() throws Exception {
        mockMvc.perform(withEveryFilter(AREAS_PATH).param("polygon", POLYGON))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("polygon_scope_requires_authentication")));

        verifyNoInteractions(relaxationService);
    }

    @Test
    @DisplayName("the parsed values are the RIGHT ones, not merely equal to each other")
    void filterParsing_producesTheExpectedValues() throws Exception {
        // Parity alone would still pass if every controller were wrong in the same way, so the
        // absolute values are pinned too.
        DiscoverListingPredicateBuilder.Filters f = captureAreas();

        assertThat(f.city()).isEqualTo("bangalore");
        assertThat(f.propertyTypes()).containsExactly("apartment", "villa");
        assertThat(f.priceMinPaise()).isEqualTo(100_000_000L);
        assertThat(f.priceMaxPaise()).isEqualTo(500_000_000L);
        assertThat(f.bedrooms()).containsExactly(2, 3);
        assertThat(f.sellerTypes()).containsExactly("owner", "broker");
        assertThat(f.readyToMove()).isTrue();
        assertThat(f.schoolRadiusKm()).isEqualTo(3.5);
        assertThat(f.q()).isEqualTo("corner plot");
        assertThat(f.listingPurpose()).isEqualTo("sale");
        assertThat(f.bbox()).isNotNull();
    }
}
