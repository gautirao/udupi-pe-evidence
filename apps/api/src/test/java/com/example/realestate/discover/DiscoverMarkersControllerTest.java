package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.discover.navigation.NavigationGraph;
import com.example.realestate.discover.navigation.NavigationGraphCache;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for GET /api/discover/markers.
 * Uses anyRequest().authenticated() to enforce JWT; jwt() post-processor for happy-path tests.
 */
@WebMvcTest(
        controllers = DiscoverMarkersController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({DiscoverMarkersControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class DiscoverMarkersControllerTest {

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

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DiscoverMarkersService service;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private NavigationGraphCache navigationGraphCache;

    @MockitoBean
    private PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy;

    @MockitoBean
    private AreaSummaryService areaSummaryService;

    @BeforeEach
    void setUp() {
        reset(service, userRoleService, areaSummaryService);
    }

    // ── 1. No JWT → 401/403 ──────────────────────────────────────────────────

    @Test
    void noJwt_returns401() throws Exception {
        mockMvc.perform(get("/api/discover/markers").param("city", "udupi"))
                .andExpect(status().is4xxClientError());
    }

    // ── 2. Valid city → 200 ───────────────────────────────────────────────────

    @Test
    void validCity_returns200() throws Exception {
        DiscoverMarker marker = new DiscoverMarker("abc-id", 13.3, 74.7, 5_000_000L, "Malpe", "apartment", null, null);
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(marker), false, 1, 1L, 1000, false));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("udupi")))
                .andExpect(jsonPath("$.markers", hasSize(1)))
                .andExpect(jsonPath("$.markers[0].id", is("abc-id")))
                .andExpect(jsonPath("$.markers[0].lat", is(13.3)))
                .andExpect(jsonPath("$.markers[0].lon", is(74.7)))
                .andExpect(jsonPath("$.markers[0].pricePaise", is(5_000_000)))
                .andExpect(jsonPath("$.markers[0].propertyType", is("apartment")))
                .andExpect(jsonPath("$.truncated", is(false)))
                .andExpect(jsonPath("$.returnedElements", is(1)))
                .andExpect(jsonPath("$.totalFilteredElements", is(1)))
                .andExpect(jsonPath("$.limit", is(1000)))
                .andExpect(jsonPath("$.boundsApplied", is(false)));
    }

    // ── 3. Polygon with fewer than 3 vertices → 400 ───────────────────────────

    @Test
    void polygonWith2Vertices_returns400() throws Exception {
        String polygon = "[[13.3,74.7],[13.4,74.8]]";
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("polygon", polygon)
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 4. Partial school params → 400 ───────────────────────────────────────

    @Test
    void schoolLonWithoutSchoolLat_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("schoolLon", "74.0")
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 5. Service returns truncated=true → JSON reflects it ────────────────

    @Test
    void truncatedResponse_returnsTruncatedTrue() throws Exception {
        DiscoverMarker marker = new DiscoverMarker("abc-id", 13.3, 74.7, 5_000_000L, "Malpe", null, null, null);
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(marker), true, 1, 1500L, 1000, false));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.truncated", is(true)))
                .andExpect(jsonPath("$.returnedElements", is(1)))
                .andExpect(jsonPath("$.totalFilteredElements", is(1500)))
                .andExpect(jsonPath("$.limit", is(1000)));
    }

    // ── 6. Valid bbox → 200, bbox passed to service ───────────────────────────

    @Test
    void validBbox_returns200_andBboxPassedToService() throws Exception {
        DiscoverMarker marker = new DiscoverMarker("m1", 13.35, 74.75, null, "Malpe", null, null, null);
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(marker), false, 1, 1L, 1000, true));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("bbox", "13.3,74.7,13.4,74.8")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.markers[0].lat", is(13.35)))
                .andExpect(jsonPath("$.markers[0].lon", is(74.75)));

        verify(service).getMarkers(argThat(f ->
                f.bbox() != null
                && f.bbox().south() == 13.3
                && f.bbox().west() == 74.7
                && f.bbox().north() == 13.4
                && f.bbox().east() == 74.8
        ));
    }

    // ── 7. bbox with inverted lat (south > north) → 400 ──────────────────────

    @Test
    void bboxSouthGreaterThanNorth_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("bbox", "13.5,74.7,13.3,74.8")   // south=13.5 > north=13.3
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 8. bbox with non-numeric value → 400 ─────────────────────────────────

    @Test
    void bboxNonNumeric_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("bbox", "13.3,bad,13.4,74.8")
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 9. q param wiring ────────────────────────────────────────────────────

    @Test
    void qParam_nonEmpty_passedToFilters() throws Exception {
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, false));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("q", "villa")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getMarkers(argThat(f ->
                f.q() != null && f.q().equals("villa")
        ));
    }

    @Test
    void qParam_empty_passesNullToFilters() throws Exception {
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, false));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("q", "")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getMarkers(argThat(f -> f.q() == null));
    }

    @Test
    void qParam_absent_passesNullToFilters() throws Exception {
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, false));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        // no q param at all
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getMarkers(argThat(f -> f.q() == null));
    }

    @Test
    void qParam_withSurroundingWhitespace_isTrimmed() throws Exception {
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, false));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("q", "  villa  ")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getMarkers(argThat(f ->
                f.q() != null && f.q().equals("villa")
        ));
    }

    @Test
    void qParam_exceeds500Chars_returns400() throws Exception {
        String longQ = "a".repeat(501);

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("q", longQ)
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── excludePropertyType param wiring ─────────────────────────────────────

    @Test
    void getMarkers_withExcludePropertyType_passesFiltersToService() throws Exception {
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, false));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("excludePropertyType", "agricultural_land")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getMarkers(argThat(f ->
                f.excludePropertyTypes() != null
                && f.excludePropertyTypes().size() == 1
                && f.excludePropertyTypes().contains("agricultural_land")
        ));
    }

    @Test
    void getMarkers_withoutExcludePropertyType_noExclusionInFilters() throws Exception {
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, false));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getMarkers(argThat(f -> f.excludePropertyTypes() == null));
    }

    // ── Cache-Control: no-store (authenticated endpoint) ─────────────────────

    @Test
    void getMarkers_responseHasCacheControlNoStore() throws Exception {
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, false));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(header().string("Cache-Control", not(containsString("public"))));
    }

    @Test
    void nodeKey_isResolvedToDescendantAreas() throws Exception {
        DiscoverMarkersResponse mockResp = new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0, 5000, false);
        when(service.getMarkers(any())).thenReturn(mockResp);

        NavigationGraph mockGraph = mock(NavigationGraph.class);
        when(mockGraph.containsNodeKey("d:n")).thenReturn(true);
        when(mockGraph.descendantAreaKeysOf("d:n")).thenReturn(List.of("IN|KA|Udupi|A1", "IN|KA|Udupi|A2"));
        when(navigationGraphCache.getActiveGraph("udupi")).thenReturn(java.util.Optional.of(mockGraph));

        mockMvc.perform(get("/api/discover/markers")
                .param("city", "udupi")
                .param("nodeKey", "d:n")
                .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getMarkers(argThat(filters ->
                filters.city().equals("udupi") &&
                filters.areaKeys() != null &&
                filters.areaKeys().containsAll(List.of("IN|KA|Udupi|A1", "IN|KA|Udupi|A2"))
        ));
    }

    @Test
    void nodeKey_rejectsRootNode() throws Exception {
        NavigationGraph mockGraph = mock(NavigationGraph.class);
        when(mockGraph.containsNodeKey("root")).thenReturn(true);
        when(navigationGraphCache.getActiveGraph("udupi")).thenReturn(java.util.Optional.of(mockGraph));

        mockMvc.perform(get("/api/discover/markers")
                .param("city", "udupi")
                .param("nodeKey", "root")
                .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("node_listings_not_eligible: root node is excluded"));
    }

    // Markers is a payload-scoping endpoint, not a bounded-browse endpoint: the >15-descendant
    // eligibility cap is owned by the listings endpoint only. A broad node must still resolve
    // and scope the query to its descendant Areas (never fall back to whole-city data).
    @Test
    void nodeKey_acceptsBroadNode_16Descendants() throws Exception {
        DiscoverMarkersResponse mockResp = new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0, 5000, false);
        when(service.getMarkers(any())).thenReturn(mockResp);

        NavigationGraph mockGraph = mock(NavigationGraph.class);
        when(mockGraph.containsNodeKey("d:n")).thenReturn(true);
        // Return 16 dummy areas
        List<String> largeList = java.util.stream.IntStream.range(0, 16)
                .mapToObj(i -> "Area" + i).toList();
        when(mockGraph.descendantAreaKeysOf("d:n")).thenReturn(largeList);
        when(navigationGraphCache.getActiveGraph("udupi")).thenReturn(java.util.Optional.of(mockGraph));

        mockMvc.perform(get("/api/discover/markers")
                .param("city", "udupi")
                .param("nodeKey", "d:n")
                .with(jwt()))
                .andExpect(status().isOk());

        // Status alone is not sufficient: a 200 returning whole-city (unscoped) data would be
        // the dangerous false pass. Assert the service was actually called with the resolved,
        // 16-element descendant-area scope.
        verify(service).getMarkers(argThat(f ->
                f.areaKeys() != null
                && f.areaKeys().size() == 16
                && f.areaKeys().containsAll(largeList)
        ));
    }

    // Boundary test: exactly 15 descendants must still pass on markers (pins the comparison
    // operator alongside the 16-descendant acceptance case above).
    @Test
    void nodeKey_acceptsExactly15Descendants() throws Exception {
        DiscoverMarkersResponse mockResp = new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0, 5000, false);
        when(service.getMarkers(any())).thenReturn(mockResp);

        NavigationGraph mockGraph = mock(NavigationGraph.class);
        when(mockGraph.containsNodeKey("d:n")).thenReturn(true);
        List<String> exactList = java.util.stream.IntStream.range(0, 15)
                .mapToObj(i -> "Area" + i).toList();
        when(mockGraph.descendantAreaKeysOf("d:n")).thenReturn(exactList);
        when(navigationGraphCache.getActiveGraph("udupi")).thenReturn(java.util.Optional.of(mockGraph));

        mockMvc.perform(get("/api/discover/markers")
                .param("city", "udupi")
                .param("nodeKey", "d:n")
                .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getMarkers(argThat(f ->
                f.areaKeys() != null
                && f.areaKeys().size() == 15
                && f.areaKeys().containsAll(exactList)
        ));
    }

    @Test
    void nodeKey_invalidNodeKey_returns400() throws Exception {
        NavigationGraph mockGraph = mock(NavigationGraph.class);
        when(mockGraph.containsNodeKey("bogus")).thenReturn(false);
        when(navigationGraphCache.getActiveGraph("udupi")).thenReturn(java.util.Optional.of(mockGraph));

        mockMvc.perform(get("/api/discover/markers")
                .param("city", "udupi")
                .param("nodeKey", "bogus")
                .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_node_key"));

        verifyNoInteractions(service);
    }

    // ── #2016: result-scope exclusivity — AREA_SET/POLYGON/VIEWPORT (mirrors listings) ──

    private static final String VALID_POLYGON = "[[13.3,74.7],[13.4,74.8],[13.3,74.8]]";
    private static final String VALID_BBOX = "13.3,74.7,13.4,74.8";

    @Test
    void areaKeysAndPolygon_returns400_resultScopeMustBeExclusive() throws Exception {
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Manipal")
                        .param("polygon", VALID_POLYGON)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("result_scope_must_be_exclusive")));

        verifyNoInteractions(service);
    }

    @Test
    void areaKeysAndViewportScope_returns400_resultScopeMustBeExclusive() throws Exception {
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Manipal")
                        .param("viewportScope", VALID_BBOX)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("result_scope_must_be_exclusive")));

        verifyNoInteractions(service);
    }

    @Test
    void polygonAndViewportScope_returns400_resultScopeMustBeExclusive() throws Exception {
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("polygon", VALID_POLYGON)
                        .param("viewportScope", VALID_BBOX)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("result_scope_must_be_exclusive")));

        verifyNoInteractions(service);
    }

    // nodeKey + polygon / viewportScope → 400 — review fix-cycle-1: exclusivity must run AFTER
    // nodeKey resolves to effectiveAreaKeys, not just check the raw (absent) areaKeys param.

    @Test
    void nodeKeyAndPolygon_returns400_resultScopeMustBeExclusive() throws Exception {
        NavigationGraph graph = mock(NavigationGraph.class);
        when(navigationGraphCache.getActiveGraph("udupi")).thenReturn(java.util.Optional.of(graph));
        when(graph.containsNodeKey("d:n")).thenReturn(true);
        when(graph.descendantAreaKeysOf("d:n")).thenReturn(List.of("IN|KA|Udupi|A1", "IN|KA|Udupi|A2"));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("nodeKey", "d:n")
                        .param("polygon", VALID_POLYGON)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("result_scope_must_be_exclusive")));

        verifyNoInteractions(service);
    }

    @Test
    void nodeKeyAndViewportScope_returns400_resultScopeMustBeExclusive() throws Exception {
        NavigationGraph graph = mock(NavigationGraph.class);
        when(navigationGraphCache.getActiveGraph("udupi")).thenReturn(java.util.Optional.of(graph));
        when(graph.containsNodeKey("d:n")).thenReturn(true);
        when(graph.descendantAreaKeysOf("d:n")).thenReturn(List.of("IN|KA|Udupi|A1", "IN|KA|Udupi|A2"));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("nodeKey", "d:n")
                        .param("viewportScope", VALID_BBOX)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("result_scope_must_be_exclusive")));

        verifyNoInteractions(service);
    }

    // CRITICAL REGRESSION GUARD: bbox (the always-on render/perf viewport prefilter) must stay
    // excluded from the new exclusivity check and keep combining with areaKeys as today.
    @Test
    void areaKeysAndBbox_returns200_bboxExcludedFromExclusivityCheck() throws Exception {
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, true));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Manipal")
                        .param("bbox", VALID_BBOX)
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getMarkers(argThat(f ->
                f.areaKeys() != null && f.areaKeys().contains("IN|KA|Udupi|Manipal")
                && f.bbox() != null
        ));
    }

    // Same regression guard for polygon + bbox.
    @Test
    void polygonAndBbox_returns200_bboxExcludedFromExclusivityCheck() throws Exception {
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, true));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("polygon", VALID_POLYGON)
                        .param("bbox", VALID_BBOX)
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getMarkers(argThat(f ->
                f.polygon() != null && f.bbox() != null
        ));
    }

    // viewportScope alone → 200, populated on the outbound Filters (#2015)
    //
    // Was previously "inert" pre-#2015/#2016; the predicate builder and query pipeline now
    // thread viewportScope through end-to-end, so this asserts the populated field rather than
    // merely a 200 status.

    @Test
    void viewportScopeAlone_returns200_andViewportScopePassedToService() throws Exception {
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, false));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("viewportScope", VALID_BBOX)
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getMarkers(argThat(f ->
                f.viewportScope() != null
                && f.viewportScope().south() == 13.3
                && f.viewportScope().west() == 74.7
                && f.viewportScope().north() == 13.4
                && f.viewportScope().east() == 74.8
        ));
    }

    // viewportScope south > north → 400 (inverted bounds)

    @Test
    void viewportScopeSouthGreaterThanNorth_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("viewportScope", "13.5,74.7,13.3,74.8")   // south=13.5 > north=13.3
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // viewportScope latitude out of [-90,90] range → 400 (oversized/invalid bounds)
    //
    // BboxParser (shared by bbox and viewportScope) has no dedicated max-span/max-area check —
    // "oversized bounds" maps to the existing lat/lon range validation ("bbox_lat_out_of_range").

    @Test
    void viewportScopeLatitudeOutOfRange_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("viewportScope", "13.3,74.7,95,74.8")   // north=95 > 90
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // viewportScope malformed (3 values) → 400, reuses bbox validation

    @Test
    void viewportScopeMalformed_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("viewportScope", "13.3,74.7,13.4")   // only 3 values
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    @Test
    void scopeFingerprint_echoedBackUnchanged() throws Exception {
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, false));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("scopeFingerprint", "fp-abc123")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopeFingerprint", is("fp-abc123")));
    }

    @Test
    void scopeFingerprint_absent_isNullInResponse() throws Exception {
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, false));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopeFingerprint").doesNotExist());
    }

    // ── #2420: polygon geographic-safety policy wiring ────────────────────────
    // Threshold/geometry behaviour is covered by PolygonGeographicSafetyPolicyIT (real
    // Testcontainers PostGIS). These tests only prove the controller calls the policy for a
    // POLYGON scope, surfaces its rejection as the documented 4xx reason, and never calls the
    // service when rejected.

    @Test
    void polygonRejectedByGeographicSafetyPolicy_outsideCity_returns400() throws Exception {
        doThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST, "polygon_outside_searchable_city"))
                .when(polygonGeographicSafetyPolicy).validate(eq("udupi"), any());

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("polygon", VALID_POLYGON)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("polygon_outside_searchable_city")));

        verifyNoInteractions(service);
    }

    @Test
    void polygonRejectedByGeographicSafetyPolicy_tooBroad_returns400() throws Exception {
        doThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST, "polygon_scope_too_broad"))
                .when(polygonGeographicSafetyPolicy).validate(eq("udupi"), any());

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("polygon", VALID_POLYGON)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("polygon_scope_too_broad")));

        verifyNoInteractions(service);
    }

    @Test
    void polygonAcceptedByGeographicSafetyPolicy_returns200_serviceCalledWithPolygon() throws Exception {
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, true));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("polygon", VALID_POLYGON)
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(polygonGeographicSafetyPolicy).validate(eq("udupi"), any());
        verify(service).getMarkers(argThat(f -> f.polygon() != null));
    }

    // ── #2767: schoolAreaKey (server-derived Area bounds) over real HTTP ──────
    // The client never supplies coordinates for the Area constraint: the controller resolves a
    // canonical Area key to that Area's own bounds. Real-PostGIS coherence is proven by
    // SchoolAreaBoundsTrustBoundary2767IT; these tests pin request binding + the fail-closed reasons.

    private static final String AREA_KEY_2767 = "IN|KA|Udupi|Kunjibettu";

    @Test
    void schoolAreaKey_resolvesToServerBounds_andReachesTheQueryObject() throws Exception {
        when(areaSummaryService.findAreaBounds("udupi", AREA_KEY_2767)).thenReturn(
                java.util.Optional.of(new AreaSummaryService.AreaBounds(13.30, 74.70, 13.40, 74.80)));
        when(service.getMarkers(any())).thenReturn(new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, true));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("schoolLat", "13.35")
                        .param("schoolLon", "74.75")
                        .param("schoolRadiusKm", "2")
                        .param("schoolAreaKey", AREA_KEY_2767)
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getMarkers(argThat(q -> q.areaBbox() != null && q.areaBbox().south() == 13.30 && q.areaBbox().west() == 74.70 && q.areaBbox().north() == 13.40 && q.areaBbox().east() == 74.80));
    }

    @Test
    void clientSuppliedAreaBbox_isIgnored_neverReachesTheQueryObject() throws Exception {
        when(service.getMarkers(any())).thenReturn(new DiscoverMarkersResponse("udupi", List.of(), false, 0, 0L, 1000, true));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("schoolLat", "13.35")
                        .param("schoolLon", "74.75")
                        .param("areaBbox", "10.0,70.0,19.0,79.0")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getMarkers(argThat(q -> q.areaBbox() == null));
        verifyNoInteractions(areaSummaryService);
    }

    @Test
    void schoolAreaKey_withoutSchool_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("schoolAreaKey", AREA_KEY_2767)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("school_area_key_requires_school")));

        verifyNoInteractions(service);
    }

    @Test
    void schoolAreaKey_multipleValues_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("schoolLat", "13.35")
                        .param("schoolLon", "74.75")
                        .param("schoolAreaKey", AREA_KEY_2767, "IN|KA|Udupi|Malpe")
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("school_area_key_must_be_single")));

        verifyNoInteractions(service);
    }

    @Test
    void schoolAreaKey_blank_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("schoolLat", "13.35")
                        .param("schoolLon", "74.75")
                        .param("schoolAreaKey", " ")
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("school_area_key_must_be_single")));

        verifyNoInteractions(service);
    }

    @Test
    void schoolAreaKey_unknownForCity_returns400() throws Exception {
        // Default mock: findAreaBounds(...) -> Optional.empty() (unknown / other-city / inactive-city).
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("schoolLat", "13.35")
                        .param("schoolLon", "74.75")
                        .param("schoolAreaKey", "IN|KA|Mangalore|Hampankatta")
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("invalid_school_area_key")));

        verifyNoInteractions(service);
    }

    @Test
    void schoolAreaKey_areaWithNullBounds_returns400() throws Exception {
        when(areaSummaryService.findAreaBounds("udupi", AREA_KEY_2767)).thenReturn(
                java.util.Optional.of(new AreaSummaryService.AreaBounds(null, null, null, null)));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("schoolLat", "13.35")
                        .param("schoolLon", "74.75")
                        .param("schoolAreaKey", AREA_KEY_2767)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("school_area_bounds_unavailable")));

        verifyNoInteractions(service);
    }

    @Test
    void schoolAreaKey_withPolygon_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("schoolLat", "13.35")
                        .param("schoolLon", "74.75")
                        .param("polygon", VALID_POLYGON)
                        .param("schoolAreaKey", AREA_KEY_2767)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("school_area_key_excludes_polygon")));

        verifyNoInteractions(service);
    }
}
