package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.UserRoleService;
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

import java.time.OffsetDateTime;
import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for GET /api/discover/listings.
 * Uses anyRequest().authenticated() to enforce JWT; jwt() post-processor for happy-path tests.
 * Spring Security without AuthenticationEntryPoint returns 403 for unauthenticated requests.
 */
@WebMvcTest(
        controllers = DiscoverListingsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({DiscoverListingsControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class DiscoverListingsControllerTest {

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
    private DiscoverListingsService service;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private com.example.realestate.discover.navigation.NavigationGraphCache navigationGraphCache;

    @MockitoBean
    private PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy;

    @BeforeEach
    void setUp() {
        reset(service, userRoleService);
    }

    // ── 1. No JWT → 401/403 ──────────────────────────────────────────────────

    @Test
    void noJwt_returns401() throws Exception {
        mockMvc.perform(get("/api/discover/listings").param("city", "udupi"))
                .andExpect(status().is4xxClientError());
    }

    // ── 2. Valid request → 200, service called ────────────────────────────────

    @Test
    void validRequest_returns200() throws Exception {
        DiscoverListingResponse listing = new DiscoverListingResponse(
                "abc", "L-001", "house", "Test title", "Malpe", "IN|KA|Udupi|Malpe",
                5_000_000L, null, null, 100.0, "sq m", 3, 13.3, 74.7,
                null, OffsetDateTime.now(), null, null, null, null,
                5, false, null, null, "A", null, "OWNER", "sale", "LIVE", null, null,
                null  // #2433 commercialFacts — this fixture declares no commercial facts
        );
        DiscoverListingsPage page = new DiscoverListingsPage(
                List.of(listing), 0, 20, 1L, 1, null);

        when(service.getListings(any())).thenReturn(page);

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.page", is(0)))
                .andExpect(jsonPath("$.totalElements", is(1)));

        verify(service).getListings(argThat(q -> q.city().equals("udupi")));
    }

    // ── 3. size=200 → clamped to 50 in service call ──────────────────────────

    @Test
    void sizeAboveMax_clampedTo50() throws Exception {
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 50, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("size", "200")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getListings(argThat(q -> q.size() == 50));
    }

    // ── 4. page=-1 → 400 ─────────────────────────────────────────────────────

    @Test
    void negativePageParam_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("page", "-1")
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 5. polygon with 2 vertices → 400 ─────────────────────────────────────

    @Test
    void polygonWith2Vertices_returns400() throws Exception {
        String polygon = "[[13.3,74.7],[13.4,74.8]]";
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("polygon", polygon)
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 6. schoolLat without schoolLon → 400 ─────────────────────────────────

    @Test
    void schoolLatWithoutSchoolLon_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("schoolLat", "13.0")
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 7. includeAggregates=true → service called with includeAggregates=true ──

    @Test
    void includeAggregatesTrue_passedToService() throws Exception {
        DiscoverListingsAggregates agg = new DiscoverListingsAggregates(
                List.of(new DiscoverListingsAggregates.LocalityCount("Malpe", 10)));
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, agg));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("includeAggregates", "true")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getListings(argThat(DiscoverListingsQuery::includeAggregates));
    }

    // ── 8. Valid bbox → 200, bbox passed to service ───────────────────────────

    @Test
    void validBbox_returns200_andBboxPassedToService() throws Exception {
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("bbox", "13.3,74.7,13.4,74.8")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getListings(argThat(q ->
                q.bbox() != null
                && q.bbox().south() == 13.3
                && q.bbox().west() == 74.7
                && q.bbox().north() == 13.4
                && q.bbox().east() == 74.8
        ));
    }

    // ── 9. bbox south > north → 400 ───────────────────────────────────────────

    @Test
    void bboxSouthGreaterThanNorth_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("bbox", "13.5,74.7,13.3,74.8")   // south=13.5 > north=13.3
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 10. bbox with 3 values (malformed) → 400 ─────────────────────────────

    @Test
    void bboxMalformed_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("bbox", "13.3,74.7,13.4")         // only 3 values
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 11. bbox with non-numeric value → 400 ────────────────────────────────

    @Test
    void bboxNonNumeric_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("bbox", "13.3,74.7,abc,74.8")
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── Cache-Control: no-store (authenticated endpoint) ─────────────────────

    @Test
    void getListings_responseHasCacheControlNoStore() throws Exception {
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(header().string("Cache-Control", not(containsString("public"))));
    }

    // ── 12. Valid nodeKey → resolves descendants and passes to service ───────

    @Test
    void validNodeKey_resolvesDescendants_andPassesToService() throws Exception {
        com.example.realestate.discover.navigation.NavigationGraph graph = mock(com.example.realestate.discover.navigation.NavigationGraph.class);
        when(navigationGraphCache.getActiveGraph("udupi")).thenReturn(java.util.Optional.of(graph));
        when(graph.containsNodeKey("d:n")).thenReturn(true);
        when(graph.descendantAreaKeysOf("d:n")).thenReturn(List.of("a:alpha", "a:bravo"));
        
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("nodeKey", "d:n")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getListings(argThat(q ->
                q.areaKeys() != null && q.areaKeys().containsAll(List.of("a:alpha", "a:bravo")) && q.areaKeys().size() == 2
        ));
    }

    // ── 13. Invalid nodeKey → 400 ────────────────────────────────────────────

    @Test
    void invalidNodeKey_returns400() throws Exception {
        com.example.realestate.discover.navigation.NavigationGraph graph = mock(com.example.realestate.discover.navigation.NavigationGraph.class);
        when(navigationGraphCache.getActiveGraph("udupi")).thenReturn(java.util.Optional.of(graph));
        when(graph.containsNodeKey("invalid:key")).thenReturn(false);

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("nodeKey", "invalid:key")
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 14. Root nodeKey → 400 (never eligible per owner contract) ───────────

    @Test
    void rootNodeKey_returns400_neverEligible() throws Exception {
        com.example.realestate.discover.navigation.NavigationGraph graph = mock(com.example.realestate.discover.navigation.NavigationGraph.class);
        when(navigationGraphCache.getActiveGraph("udupi")).thenReturn(java.util.Optional.of(graph));
        when(graph.containsNodeKey("root")).thenReturn(true);

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("nodeKey", "root")
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("root node is excluded")));

        verifyNoInteractions(service);
    }

    // ── 15. nodeKey with >15 descendant areas → 400 ──────────────────────────

    @Test
    void nodeKeyWithMoreThan15DescendantAreas_returns400() throws Exception {
        com.example.realestate.discover.navigation.NavigationGraph graph = mock(com.example.realestate.discover.navigation.NavigationGraph.class);
        when(navigationGraphCache.getActiveGraph("udupi")).thenReturn(java.util.Optional.of(graph));
        when(graph.containsNodeKey("d:broad")).thenReturn(true);
        // 16 descendant areas exceeds the <=15 contract
        when(graph.descendantAreaKeysOf("d:broad")).thenReturn(
                List.of("a1","a2","a3","a4","a5","a6","a7","a8","a9","a10","a11","a12","a13","a14","a15","a16"));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("nodeKey", "d:broad")
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("descendant area count exceeds 15")));

        verifyNoInteractions(service);
    }

    // ── 16. nodeKey with exactly 15 descendant areas → 200 (inclusive boundary)

    @Test
    void nodeKeyWithExactly15DescendantAreas_returns200() throws Exception {
        com.example.realestate.discover.navigation.NavigationGraph graph = mock(com.example.realestate.discover.navigation.NavigationGraph.class);
        when(navigationGraphCache.getActiveGraph("udupi")).thenReturn(java.util.Optional.of(graph));
        when(graph.containsNodeKey("c:fifteen")).thenReturn(true);
        when(graph.descendantAreaKeysOf("c:fifteen")).thenReturn(
                List.of("a1","a2","a3","a4","a5","a6","a7","a8","a9","a10","a11","a12","a13","a14","a15"));

        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("nodeKey", "c:fifteen")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getListings(argThat(q ->
                q.areaKeys() != null && q.areaKeys().size() == 15
        ));
    }

    // ── #2016: result-scope exclusivity — AREA_SET/POLYGON/VIEWPORT ──────────

    private static final String VALID_POLYGON = "[[13.3,74.7],[13.4,74.8],[13.3,74.8]]";
    private static final String VALID_BBOX = "13.3,74.7,13.4,74.8";

    // ── 17. areaKeys + polygon → 400 (two active result scopes) ──────────────

    @Test
    void areaKeysAndPolygon_returns400_resultScopeMustBeExclusive() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Manipal")
                        .param("polygon", VALID_POLYGON)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("result_scope_must_be_exclusive")));

        verifyNoInteractions(service);
    }

    // ── 18. areaKeys + viewportScope → 400 (two active result scopes) ────────

    @Test
    void areaKeysAndViewportScope_returns400_resultScopeMustBeExclusive() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Manipal")
                        .param("viewportScope", VALID_BBOX)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("result_scope_must_be_exclusive")));

        verifyNoInteractions(service);
    }

    // ── 19. polygon + viewportScope → 400 (two active result scopes) ─────────

    @Test
    void polygonAndViewportScope_returns400_resultScopeMustBeExclusive() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("polygon", VALID_POLYGON)
                        .param("viewportScope", VALID_BBOX)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("result_scope_must_be_exclusive")));

        verifyNoInteractions(service);
    }

    // ── 19b. nodeKey + polygon → 400 — review fix-cycle-1: exclusivity must run AFTER
    //         nodeKey resolves to effectiveAreaKeys, not just check the raw (absent) areaKeys
    //         param, since nodeKey is the dominant AREA_SET path from live area-first nav.

    @Test
    void nodeKeyAndPolygon_returns400_resultScopeMustBeExclusive() throws Exception {
        com.example.realestate.discover.navigation.NavigationGraph graph = mock(com.example.realestate.discover.navigation.NavigationGraph.class);
        when(navigationGraphCache.getActiveGraph("udupi")).thenReturn(java.util.Optional.of(graph));
        when(graph.containsNodeKey("d:n")).thenReturn(true);
        when(graph.descendantAreaKeysOf("d:n")).thenReturn(List.of("a:alpha", "a:bravo"));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("nodeKey", "d:n")
                        .param("polygon", VALID_POLYGON)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("result_scope_must_be_exclusive")));

        verifyNoInteractions(service);
    }

    // ── 19c. nodeKey + viewportScope → 400 — same review fix-cycle-1 guard ───

    @Test
    void nodeKeyAndViewportScope_returns400_resultScopeMustBeExclusive() throws Exception {
        com.example.realestate.discover.navigation.NavigationGraph graph = mock(com.example.realestate.discover.navigation.NavigationGraph.class);
        when(navigationGraphCache.getActiveGraph("udupi")).thenReturn(java.util.Optional.of(graph));
        when(graph.containsNodeKey("d:n")).thenReturn(true);
        when(graph.descendantAreaKeysOf("d:n")).thenReturn(List.of("a:alpha", "a:bravo"));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("nodeKey", "d:n")
                        .param("viewportScope", VALID_BBOX)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("result_scope_must_be_exclusive")));

        verifyNoInteractions(service);
    }

    // ── 20. areaKeys + bbox → 200 — CRITICAL REGRESSION GUARD: bbox (the
    //        always-on render/perf viewport prefilter) must stay excluded from
    //        the new exclusivity check and keep combining with areaKeys as today.

    @Test
    void areaKeysAndBbox_returns200_bboxExcludedFromExclusivityCheck() throws Exception {
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Manipal")
                        .param("bbox", VALID_BBOX)
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getListings(argThat(q ->
                q.areaKeys() != null && q.areaKeys().contains("IN|KA|Udupi|Manipal")
                && q.bbox() != null
        ));
    }

    // ── 21. polygon + bbox → 200 — CRITICAL REGRESSION GUARD: same as above,
    //        for the polygon + bbox combination (existing behaviour, not the defect).

    @Test
    void polygonAndBbox_returns200_bboxExcludedFromExclusivityCheck() throws Exception {
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("polygon", VALID_POLYGON)
                        .param("bbox", VALID_BBOX)
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getListings(argThat(q ->
                q.polygon() != null && q.bbox() != null
        ));
    }

    // ── 22. viewportScope alone → 200, populated on the outbound query (#2015) ─
    //
    // Was previously "inert" pre-#2015/#2016; the predicate builder and query pipeline now
    // thread viewportScope through end-to-end, so this asserts the populated field rather than
    // merely a 200 status.

    @Test
    void viewportScopeAlone_returns200_andViewportScopePassedToService() throws Exception {
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("viewportScope", VALID_BBOX)
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getListings(argThat(q ->
                q.viewportScope() != null
                && q.viewportScope().south() == 13.3
                && q.viewportScope().west() == 74.7
                && q.viewportScope().north() == 13.4
                && q.viewportScope().east() == 74.8
        ));
    }

    // ── 22b. viewportScope south > north → 400 (inverted bounds) ──────────────

    @Test
    void viewportScopeSouthGreaterThanNorth_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("viewportScope", "13.5,74.7,13.3,74.8")   // south=13.5 > north=13.3
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 22c. viewportScope latitude out of [-90,90] range → 400 (oversized/invalid bounds) ─
    //
    // BboxParser (shared by bbox and viewportScope) has no dedicated max-span/max-area check —
    // "oversized bounds" maps to the existing lat/lon range validation ("bbox_lat_out_of_range").

    @Test
    void viewportScopeLatitudeOutOfRange_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("viewportScope", "13.3,74.7,95,74.8")   // north=95 > 90
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 23. viewportScope malformed (3 values) → 400, reuses bbox validation ─

    @Test
    void viewportScopeMalformed_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("viewportScope", "13.3,74.7,13.4")   // only 3 values
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 23b. viewportScope span exceeds MAX_BOUNDS_SPAN_DEGREES → 400 ─────────
    //
    // Distinct from 22c above: this rectangle is fully within the valid lat/lon range
    // (BboxParser's checks pass), so only a dedicated oversized-bounds guard can reject it.

    @Test
    void viewportScopeSpanExceedsMax_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("viewportScope", "10,70,25,85")   // 15° lat span, 15° lon span
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 23c. bbox span exceeds MAX_BOUNDS_SPAN_DEGREES → 400 (consistent cap) ─

    @Test
    void bboxSpanExceedsMax_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("bbox", "10,70,25,85")   // 15° lat span, 15° lon span
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 23d. viewportScope span exactly at MAX_BOUNDS_SPAN_DEGREES → accepted ─

    @Test
    void viewportScopeSpanExactlyAtMax_returns200() throws Exception {
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("viewportScope", "5,70,15,80")   // exactly 10° lat span, 10° lon span
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getListings(argThat(q ->
                q.viewportScope() != null
                && q.viewportScope().south() == 5
                && q.viewportScope().north() == 15));
    }

    // ── 24. scopeFingerprint supplied → echoed back unchanged in the response ─

    @Test
    void scopeFingerprint_echoedBackUnchanged() throws Exception {
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null, "fp-abc123"));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("scopeFingerprint", "fp-abc123")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopeFingerprint", is("fp-abc123")));

        verify(service).getListings(argThat(q -> "fp-abc123".equals(q.scopeFingerprint())));
    }

    // ── 25. scopeFingerprint absent → field omitted from JSON (NON_NULL) ─────

    @Test
    void scopeFingerprint_absent_omittedFromJson() throws Exception {
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopeFingerprint").doesNotExist());

        verify(service).getListings(argThat(q -> q.scopeFingerprint() == null));
    }

    // ── #2420: polygon geographic-safety policy wiring ────────────────────────
    // Threshold/geometry behaviour is covered by PolygonGeographicSafetyPolicyIT (real
    // Testcontainers PostGIS). These tests only prove the controller calls the policy for a
    // POLYGON scope, surfaces its rejection as the documented 4xx reason, and never calls the
    // service when rejected — and that an accepted polygon behaves exactly as before (#2420
    // DoD: "ordinary valid POLYGON query results remain unchanged").

    @Test
    void polygonRejectedByGeographicSafetyPolicy_outsideCity_returns400() throws Exception {
        doThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST, "polygon_outside_searchable_city"))
                .when(polygonGeographicSafetyPolicy).validate(eq("udupi"), anyList());

        mockMvc.perform(get("/api/discover/listings")
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
                .when(polygonGeographicSafetyPolicy).validate(eq("udupi"), anyList());

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("polygon", VALID_POLYGON)
                        .with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("polygon_scope_too_broad")));

        verifyNoInteractions(service);
    }

    @Test
    void polygonAcceptedByGeographicSafetyPolicy_returns200_serviceCalledWithPolygon() throws Exception {
        // Default MockitoBean behaviour: validate(...) is a no-op — mirrors an accepted polygon.
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("polygon", VALID_POLYGON)
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(polygonGeographicSafetyPolicy).validate(eq("udupi"), anyList());
        verify(service).getListings(argThat(q -> q.polygon() != null));
    }

    @Test
    void noPolygon_geographicSafetyPolicyNeverInvoked() throws Exception {
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(polygonGeographicSafetyPolicy).validate(eq("udupi"), isNull());
    }

    // ── #2431: commercialSubtypes over real HTTP ─────────────────────────────
    //
    // CommercialSubtypeFilter2431IT proves the SQL semantics against a real database, but it
    // invokes the controller METHOD directly, so it cannot see Spring's request binding. A typo
    // in the @RequestParam name, or a param that never reaches the query object, would pass that
    // IT and fail in production. These tests close exactly that gap: they go through MockMvc, so
    // the parameter is bound from a real query string.

    @Test
    void commercialSubtypes_isBoundFromTheQueryStringAndReachesTheQueryObject() throws Exception {
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("commercialSubtypes", "SHOP")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getListings(argThat(q ->
                q.commercialSubtypes() != null && q.commercialSubtypes().equals(List.of("SHOP"))));
    }

    @Test
    void commercialSubtypes_repeatedParamBindsBothValues() throws Exception {
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("commercialSubtypes", "SHOP")
                        .param("commercialSubtypes", "OFFICE")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getListings(argThat(q ->
                q.commercialSubtypes() != null
                        && q.commercialSubtypes().containsAll(List.of("SHOP", "OFFICE"))));
    }

    @Test
    void commercialSubtypes_absent_leavesTheQueryUnfiltered_andReachesTheServiceAsNull() throws Exception {
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getListings(argThat(q -> q.commercialSubtypes() == null));
    }

    @Test
    void commercialSubtypes_unknownValue_returns400_andTheServiceIsNeverCalled() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("commercialSubtypes", "RESTAURANT")
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        // Rejection happens at the boundary — proven by the side effect, not just the status:
        // a 400 that still ran the query would be a different (and worse) implementation.
        verify(service, never()).getListings(any());
    }

    /**
     * DELIBERATE REVERSAL of the #2431 assertion, matching the one #2458 already made at the
     * integration level in {@code CommercialSubtypeFilter2431IT#nonAmbiguousSubtypes_areAccepted}.
     * That lane reversed the IT but not this controller-boundary twin, so this test asserted a
     * contract main no longer implements and was failing ON MAIN: {@code
     * ALLOWED_COMMERCIAL_SUBTYPES} is now {SHOP, OFFICE, BUILDING, WAREHOUSE, LAND}.
     *
     * <p>The reasoning is #2458's, not this lane's: an approved MIXED selection (Shop +
     * Warehouse) needs ONE predicate spanning both axes, which the old property_type-only
     * shape made unreachable.
     *
     * <p>Acceptance is all this claims. WHICH rows each subtype matches is pinned by the
     * #2458 membership matrix, not here.
     */
    @Test
    void commercialSubtypes_nonAmbiguousSubtype_isAccepted() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("commercialSubtypes", "WAREHOUSE")
                        .with(jwt()))
                .andExpect(status().isOk());

        // Asserted by the SIDE EFFECT, not just the status. A 200 that never reached the
        // service would mean the value was silently dropped rather than accepted — which is
        // exactly the failure a reversal like this could introduce unnoticed.
        verify(service).getListings(any());
    }

    /**
     * Re-pinned, and the re-pinning is the point.
     *
     * <p>This previously sent THREE values against a cap that was 2. #2458 widened the
     * vocabulary to five, and {@code MAX_COMMERCIAL_SUBTYPE_VALUES} is DERIVED as
     * {@code ALLOWED_COMMERCIAL_SUBTYPES.size()} — so the cap silently moved 2 to 5 and three
     * values stopped being "too many". Nobody had to edit this test for it to stop testing
     * anything; it just started passing through a guard it no longer reached, then failed
     * outright once the whole request became valid.
     *
     * <p><b>Derived from the cap, not a literal.</b> A literal {@code 6} goes stale the same
     * way {@code 3} did, the next time the vocabulary widens. {@code MAX + 1} always means
     * "one past the cap", which is what this test is for.
     *
     * <p><b>Duplicates are deliberate and necessary.</b> With the cap equal to the vocabulary
     * size, more than MAX <i>distinct valid</i> values cannot exist — so the guard is only
     * reachable by repetition. That is coherent with what the cap is actually for: the param
     * is repeatable on a public cached endpoint, and the guard bounds cache-key cardinality
     * from unbounded repetition, not the number of distinct subtypes a buyer may select. The
     * cap check runs on the RAW list BEFORE the allowlist loop, so repetition of a VALID value
     * reaches it — which is why every value here is valid.
     *
     * <p><b>WHICH guard fired is asserted, not just the status.</b> Three different guards in
     * {@code CommercialSubtypeParam#validate} all return 400, so a bare {@code isBadRequest()}
     * cannot distinguish the cap from the allowlist or the empty-list check. That is exactly how
     * the previous version drifted unnoticed. Asserted on the BODY rather than
     * {@code status().reason()}: {@code GlobalExceptionHandler} catches
     * {@code ResponseStatusException} and renders the reason as {@code {"error": ...}}, leaving
     * the raw HTTP reason phrase null — so a {@code status().reason(...)} assertion fails even
     * when the correct guard fired (measured, not assumed).
     */
    /**
     * DISCRIMINATING CONTROL for the cap test below, and the reason that test is not vacuous.
     *
     * <p>Because {@code MAX_COMMERCIAL_SUBTYPE_VALUES} equals the vocabulary size, more than MAX
     * <i>distinct valid</i> values cannot exist — so the cap test must use duplicates. That
     * raises a fair objection: perhaps the DUPLICATION is what gets rejected, through a dedupe
     * or allowlist path, and the cap never fires at all. A cap test that is really exercising a
     * different guard would be an assertion that cannot fail, passing.
     *
     * <p>This arm settles it by varying ONLY the property under test. Same endpoint, same value,
     * same duplication — exactly MAX repetitions instead of MAX + 1 — and it returns 200. So
     * duplication alone is not rejected, and the 400 one value later is the COUNT crossing the
     * cap, not the repetition.
     *
     * <p>Consistent with the code: {@code CommercialSubtypeParam#validate} tests
     * {@code raw.size() > MAX} on the RAW list before the allowlist loop, and deduping happens
     * later in {@code DiscoverFilterNormalizer#normalizeCommercialSubtypes} through a
     * LinkedHashSet that never throws. There is no "dedupe rejects" path to confuse it with.
     */
    @Test
    void commercialSubtypes_atExactlyTheCap_isAccepted() throws Exception {
        var request = get("/api/discover/listings").param("city", "udupi");
        for (int i = 0; i < DiscoverFilterNormalizer.MAX_COMMERCIAL_SUBTYPE_VALUES; i++) {
            request = request.param("commercialSubtypes", "SHOP");
        }

        mockMvc.perform(request.with(jwt())).andExpect(status().isOk());

        verify(service).getListings(any());
    }

    @Test
    void commercialSubtypes_tooManyValues_returns400() throws Exception {
        var request = get("/api/discover/listings").param("city", "udupi");
        for (int i = 0; i <= DiscoverFilterNormalizer.MAX_COMMERCIAL_SUBTYPE_VALUES; i++) {
            request = request.param("commercialSubtypes", "SHOP");
        }

        mockMvc.perform(request.with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("commercial_subtypes_exceeds_max_values"));

        verify(service, never()).getListings(any());
    }

    @Test
    void commercialSubtype_isSerialisedOntoTheResponseWhenPresent() throws Exception {
        DiscoverListingResponse shop = new DiscoverListingResponse(
                "abc", "L-001", "commercial", "Shop unit", "Malpe", "IN|KA|Udupi|Malpe",
                5_000_000L, null, null, 100.0, "sq m", null, 13.3, 74.7,
                null, OffsetDateTime.now(), null, null, null, null,
                5, false, null, null, "A", null, "OWNER", "sale", "LIVE", "SHOP", null, null);
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(shop), 0, 20, 1L, 1, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].commercialSubtype").value("SHOP"));
    }

    @Test
    void commercialSubtype_isOMITTED_notNull_whenTheListingHasNoRecordedSubtype() throws Exception {
        DiscoverListingResponse legacy = new DiscoverListingResponse(
                "abc", "L-001", "commercial", "Legacy commercial", "Malpe", "IN|KA|Udupi|Malpe",
                5_000_000L, null, null, 100.0, "sq m", null, 13.3, 74.7,
                null, OffsetDateTime.now(), null, null, null, null,
                5, false, null, null, "A", null, "OWNER", "sale", "LIVE", null, null, null);
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(legacy), 0, 20, 1L, 1, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk())
                // The record is NON_NULL-serialised, so an unrecorded subtype is absent from the
                // JSON entirely rather than present as null — a consumer cannot mistake it for a
                // value it has to render.
                .andExpect(jsonPath("$.content[0].commercialSubtype").doesNotExist());
    }
}
