package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
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

import java.time.Instant;
import java.util.List;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for GET /api/discover/summary (#1745 P5).
 * Public/unauthenticated — mirrors {@link AreaSummaryControllerTest}'s permitAll test config.
 */
@WebMvcTest(
        controllers = DiscoverSummaryController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({DiscoverSummaryControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class DiscoverSummaryControllerTest {

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

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DiscoverSummaryPort service;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(service, userRoleService);
    }

    private static DiscoverSummaryResponse emptyResponse(String city, String groupBy) {
        return new DiscoverSummaryResponse(city, null, groupBy, 0L, List.of(), List.of(), Instant.now());
    }

    // ── 1. Happy path: 200 shape ──────────────────────────────────────────────

    @Test
    void getSummary_validCity_returns200WithShape() throws Exception {
        DiscoverSummaryResponse.RegionCount region =
                new DiscoverSummaryResponse.RegionCount("university-belt", "University Belt", 5L);
        DiscoverSummaryResponse.Hotspot hotspot =
                new DiscoverSummaryResponse.Hotspot("IN|KA|Udupi|Manipal", "Manipal", 5L, 13.35, 74.79);
        DiscoverSummaryResponse response = new DiscoverSummaryResponse(
                "udupi", null, "area_group", 5L, List.of(region), List.of(hotspot), Instant.now());
        when(service.getSummary(any())).thenReturn(response);

        mockMvc.perform(get("/api/discover/summary").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("udupi")))
                .andExpect(jsonPath("$.propertyType").doesNotExist())
                .andExpect(jsonPath("$.groupBy", is("area_group")))
                .andExpect(jsonPath("$.totalActiveListings", is(5)))
                .andExpect(jsonPath("$.regions", hasSize(1)))
                .andExpect(jsonPath("$.regions[0].regionKey", is("university-belt")))
                .andExpect(jsonPath("$.regions[0].regionLabel", is("University Belt")))
                .andExpect(jsonPath("$.regions[0].listingCount", is(5)))
                .andExpect(jsonPath("$.hotspots", hasSize(1)))
                .andExpect(jsonPath("$.hotspots[0].areaKey", is("IN|KA|Udupi|Manipal")))
                .andExpect(jsonPath("$.hotspots[0].name", is("Manipal")))
                .andExpect(jsonPath("$.hotspots[0].listingCount", is(5)))
                .andExpect(jsonPath("$.hotspots[0].geoCenterLat", is(13.35)))
                .andExpect(jsonPath("$.hotspots[0].geoCenterLon", is(74.79)))
                .andExpect(jsonPath("$.generatedAt").exists());
    }

    // ── 2. Unknown city → 200 empty (NOT 404) ─────────────────────────────────

    @Test
    void getSummary_unknownCity_returns200Empty() throws Exception {
        when(service.getSummary(any())).thenReturn(emptyResponse("nowhere", "area_group"));

        mockMvc.perform(get("/api/discover/summary").param("city", "nowhere"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("nowhere")))
                .andExpect(jsonPath("$.totalActiveListings", is(0)))
                .andExpect(jsonPath("$.regions", hasSize(0)))
                .andExpect(jsonPath("$.hotspots", hasSize(0)));
    }

    // ── 3. hotspotLimit default = 8 ───────────────────────────────────────────

    @Test
    void getSummary_noHotspotLimit_defaultsTo8() throws Exception {
        when(service.getSummary(any())).thenReturn(emptyResponse("udupi", "area_group"));

        mockMvc.perform(get("/api/discover/summary").param("city", "udupi"))
                .andExpect(status().isOk());

        ArgumentCaptor<SummaryQuery> captor = ArgumentCaptor.forClass(SummaryQuery.class);
        verify(service).getSummary(captor.capture());
        org.assertj.core.api.Assertions.assertThat(captor.getValue().hotspotLimit()).isEqualTo(8);
    }

    // ── 4. hotspotLimit clamp: 0 → 1 ───────────────────────────────────────────

    @Test
    void getSummary_hotspotLimitZero_clampedToOne() throws Exception {
        when(service.getSummary(any())).thenReturn(emptyResponse("udupi", "area_group"));

        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").param("hotspotLimit", "0"))
                .andExpect(status().isOk());

        ArgumentCaptor<SummaryQuery> captor = ArgumentCaptor.forClass(SummaryQuery.class);
        verify(service).getSummary(captor.capture());
        org.assertj.core.api.Assertions.assertThat(captor.getValue().hotspotLimit()).isEqualTo(1);
    }

    // ── 5. hotspotLimit clamp: negative → 1 ───────────────────────────────────

    @Test
    void getSummary_hotspotLimitNegative_clampedToOne() throws Exception {
        when(service.getSummary(any())).thenReturn(emptyResponse("udupi", "area_group"));

        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").param("hotspotLimit", "-1"))
                .andExpect(status().isOk());

        ArgumentCaptor<SummaryQuery> captor = ArgumentCaptor.forClass(SummaryQuery.class);
        verify(service).getSummary(captor.capture());
        org.assertj.core.api.Assertions.assertThat(captor.getValue().hotspotLimit()).isEqualTo(1);
    }

    // ── 6. hotspotLimit clamp: 25 → 20 ─────────────────────────────────────────

    @Test
    void getSummary_hotspotLimit25_clampedTo20() throws Exception {
        when(service.getSummary(any())).thenReturn(emptyResponse("udupi", "area_group"));

        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").param("hotspotLimit", "25"))
                .andExpect(status().isOk());

        ArgumentCaptor<SummaryQuery> captor = ArgumentCaptor.forClass(SummaryQuery.class);
        verify(service).getSummary(captor.capture());
        org.assertj.core.api.Assertions.assertThat(captor.getValue().hotspotLimit()).isEqualTo(20);
    }

    // ── 7. groupBy invalid → 400 ───────────────────────────────────────────────

    @Test
    void getSummary_invalidGroupBy_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").param("groupBy", "bogus"))
                .andExpect(status().isBadRequest());

        org.mockito.Mockito.verifyNoInteractions(service);
    }

    // ── 8. groupBy default = area_group ───────────────────────────────────────

    @Test
    void getSummary_noGroupBy_defaultsToAreaGroup() throws Exception {
        when(service.getSummary(any())).thenReturn(emptyResponse("udupi", "area_group"));

        mockMvc.perform(get("/api/discover/summary").param("city", "udupi"))
                .andExpect(status().isOk());

        ArgumentCaptor<SummaryQuery> captor = ArgumentCaptor.forClass(SummaryQuery.class);
        verify(service).getSummary(captor.capture());
        org.assertj.core.api.Assertions.assertThat(captor.getValue().groupBy()).isEqualTo("area_group");
    }

    // ── 9. groupBy=corridor accepted ──────────────────────────────────────────

    @Test
    void getSummary_corridorGroupBy_accepted() throws Exception {
        when(service.getSummary(any())).thenReturn(emptyResponse("udupi", "corridor"));

        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").param("groupBy", "corridor"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groupBy", is("corridor")));
    }

    // ── 10. Cache-Control + ETag headers ──────────────────────────────────────

    @Test
    void getSummary_responseHasCacheControlPublicMaxAge120AndETag() throws Exception {
        when(service.getSummary(any())).thenReturn(emptyResponse("udupi", "area_group"));

        mockMvc.perform(get("/api/discover/summary").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=120")))
                .andExpect(header().string("Cache-Control", containsString("public")))
                .andExpect(header().string("Cache-Control", not(containsString("no-store"))))
                .andExpect(header().exists("ETag"));
    }

    // ── 11. Same content → same ETag; different content → different ETag ────

    @Test
    void getSummary_sameContent_producesSameETag() throws Exception {
        when(service.getSummary(any()))
                .thenReturn(new DiscoverSummaryResponse("udupi", null, "area_group", 5L, List.of(), List.of(),
                        Instant.parse("2026-01-01T00:00:00Z")))
                .thenReturn(new DiscoverSummaryResponse("udupi", null, "area_group", 5L, List.of(), List.of(),
                        Instant.parse("2026-06-01T00:00:00Z")));

        String etag1 = mockMvc.perform(get("/api/discover/summary").param("city", "udupi"))
                .andReturn().getResponse().getHeader("ETag");
        String etag2 = mockMvc.perform(get("/api/discover/summary").param("city", "udupi"))
                .andReturn().getResponse().getHeader("ETag");

        org.assertj.core.api.Assertions.assertThat(etag1).isEqualTo(etag2);
    }

    @Test
    void getSummary_differentContent_producesDifferentETag() throws Exception {
        when(service.getSummary(any()))
                .thenReturn(new DiscoverSummaryResponse("udupi", null, "area_group", 5L, List.of(), List.of(),
                        Instant.now()))
                .thenReturn(new DiscoverSummaryResponse("udupi", null, "area_group", 9L, List.of(), List.of(),
                        Instant.now()));

        String etag1 = mockMvc.perform(get("/api/discover/summary").param("city", "udupi"))
                .andReturn().getResponse().getHeader("ETag");
        String etag2 = mockMvc.perform(get("/api/discover/summary").param("city", "udupi"))
                .andReturn().getResponse().getHeader("ETag");

        org.assertj.core.api.Assertions.assertThat(etag1).isNotEqualTo(etag2);
    }

    // ── 12. propertyType echoed when non-blank ────────────────────────────────

    @Test
    void getSummary_propertyTypeSet_echoedInResponse() throws Exception {
        when(service.getSummary(any())).thenReturn(
                new DiscoverSummaryResponse("udupi", "house", "area_group", 3L, List.of(), List.of(), Instant.now()));

        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").param("propertyType", "house"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.propertyType", is("house")));

        ArgumentCaptor<SummaryQuery> captor = ArgumentCaptor.forClass(SummaryQuery.class);
        verify(service).getSummary(captor.capture());
        org.assertj.core.api.Assertions.assertThat(captor.getValue().propertyType()).isEqualTo("house");
    }
}
