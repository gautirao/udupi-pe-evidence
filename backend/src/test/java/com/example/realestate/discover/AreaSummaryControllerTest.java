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

import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(
        controllers = AreaSummaryController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({AreaSummaryControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class AreaSummaryControllerTest {

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
    private AreaSummaryService areaSummaryService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(areaSummaryService, userRoleService);
    }

    @Test
    void getAreas_returnsJsonWithCityAndAreasList() throws Exception {
        AreaSummary area = new AreaSummary(
                "IN|KA|Udupi|Manipal", "Manipal",
                13.35, 74.79,
                13.30, 74.74, 13.40, 74.84,
                5L, 400_000L, "rising", "limited",
                3L, null
        );
        when(areaSummaryService.getAreasByCity(eq("udupi"), isNull()))
                .thenReturn(new AreaSummaryResponse("udupi", List.of(area)));

        mockMvc.perform(get("/api/discover/areas").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("udupi")))
                .andExpect(jsonPath("$.areas", hasSize(1)))
                .andExpect(jsonPath("$.areas[0].areaKey", is("IN|KA|Udupi|Manipal")))
                .andExpect(jsonPath("$.areas[0].name", is("Manipal")))
                .andExpect(jsonPath("$.areas[0].listingCount", is(5)))
                .andExpect(jsonPath("$.areas[0].trendDirection", is("rising")))
                .andExpect(jsonPath("$.areas[0].schoolCount", is(3)));
    }

    @Test
    void getAreas_unknownCity_returnsEmptyList() throws Exception {
        when(areaSummaryService.getAreasByCity(eq("nowhere"), isNull()))
                .thenReturn(new AreaSummaryResponse("nowhere", List.of()));

        mockMvc.perform(get("/api/discover/areas").param("city", "nowhere"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("nowhere")))
                .andExpect(jsonPath("$.areas", hasSize(0)));
    }

    @Test
    void getAreas_zeroListingArea_returnsNullMedianOmitted() throws Exception {
        AreaSummary zeroArea = new AreaSummary(
                "IN|KA|Udupi|Amoghapura", "Amoghapura",
                13.34, 74.75,
                null, null, null, null,
                0L, null, null, "fallback",
                0L, null
        );
        when(areaSummaryService.getAreasByCity(eq("udupi"), isNull()))
                .thenReturn(new AreaSummaryResponse("udupi", List.of(zeroArea)));

        mockMvc.perform(get("/api/discover/areas").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].listingCount", is(0)))
                .andExpect(jsonPath("$.areas[0].medianPricePaise").doesNotExist())
                .andExpect(jsonPath("$.areas[0].schoolCount", is(0)));
    }

    @Test
    void getAreas_zeroSchoolArea_returnsSchoolCountZero() throws Exception {
        AreaSummary noSchoolArea = new AreaSummary(
                "IN|KA|Udupi|Kunjibettu", "Kunjibettu",
                13.33, 74.74,
                null, null, null, null,
                2L, 350_000L, "stable", "moderate",
                0L, null
        );
        when(areaSummaryService.getAreasByCity(eq("udupi"), isNull()))
                .thenReturn(new AreaSummaryResponse("udupi", List.of(noSchoolArea)));

        mockMvc.perform(get("/api/discover/areas").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].schoolCount", is(0)));
    }

    @Test
    void getAreas_multipleSchools_returnsCorrectCount() throws Exception {
        AreaSummary area = new AreaSummary(
                "IN|KA|Udupi|Manipal", "Manipal",
                13.35, 74.79,
                13.30, 74.74, 13.40, 74.84,
                10L, 500_000L, "rising", "high",
                7L, null
        );
        when(areaSummaryService.getAreasByCity(eq("udupi"), isNull()))
                .thenReturn(new AreaSummaryResponse("udupi", List.of(area)));

        mockMvc.perform(get("/api/discover/areas").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].schoolCount", is(7)));
    }

    // ── Cache-Control: public, max-age=120 ───────────────────────────────────

    @Test
    void getAreas_responseHasCacheControlPublicMaxAge120() throws Exception {
        when(areaSummaryService.getAreasByCity(eq("udupi"), isNull()))
                .thenReturn(new AreaSummaryResponse("udupi", List.of()));

        mockMvc.perform(get("/api/discover/areas").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=120")))
                .andExpect(header().string("Cache-Control", containsString("public")))
                .andExpect(header().string("Cache-Control", not(containsString("no-store"))));
    }

    // ── #1371: optional propertyType param contract ──────────────────────────

    @Test
    void getAreas_noPropertyType_callsServiceWithNullFilter() throws Exception {
        when(areaSummaryService.getAreasByCity(eq("udupi"), isNull()))
                .thenReturn(new AreaSummaryResponse("udupi", List.of()));

        mockMvc.perform(get("/api/discover/areas").param("city", "udupi"))
                .andExpect(status().isOk());

        ArgumentCaptor<String> typeCaptor = ArgumentCaptor.forClass(String.class);
        verify(areaSummaryService).getAreasByCity(eq("udupi"), typeCaptor.capture());
        assertThat(typeCaptor.getValue()).isNull();
    }

    @Test
    void getAreas_agriPropertyType_passesLiteralAgriculturalLand() throws Exception {
        AreaSummary agriArea = new AreaSummary(
                "IN|KA|Udupi|Manipal", "Manipal",
                13.35, 74.79,
                null, null, null, null,
                1L, null, null, "fallback",
                0L, 5.0
        );
        when(areaSummaryService.getAreasByCity(eq("udupi"), eq("agricultural_land")))
                .thenReturn(new AreaSummaryResponse("udupi", List.of(agriArea)));

        mockMvc.perform(get("/api/discover/areas")
                        .param("city", "udupi")
                        .param("propertyType", "agricultural_land"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].listingCount", is(1)))
                .andExpect(jsonPath("$.areas[0].agriAcreage", is(5.0)))
                // Distinct query string is the HTTP cache key (AC10) — same Cache-Control.
                .andExpect(header().string("Cache-Control", containsString("max-age=120")))
                .andExpect(header().string("Cache-Control", containsString("public")));

        // Literal must reach the service verbatim — not trimmed away or renamed.
        ArgumentCaptor<String> typeCaptor = ArgumentCaptor.forClass(String.class);
        verify(areaSummaryService).getAreasByCity(eq("udupi"), typeCaptor.capture());
        assertThat(typeCaptor.getValue()).isEqualTo("agricultural_land");
    }

    @Test
    void getAreas_blendedVsAgri_useDistinctServiceArgsAndDoNotCrossServe() throws Exception {
        AreaSummary blended = new AreaSummary(
                "IN|KA|Udupi|Manipal", "Manipal", 13.35, 74.79,
                null, null, null, null, 9L, null, null, "high", 0L, null);
        AreaSummary agri = new AreaSummary(
                "IN|KA|Udupi|Manipal", "Manipal", 13.35, 74.79,
                null, null, null, null, 1L, null, null, "fallback", 0L, 5.0);
        when(areaSummaryService.getAreasByCity(eq("udupi"), isNull()))
                .thenReturn(new AreaSummaryResponse("udupi", List.of(blended)));
        when(areaSummaryService.getAreasByCity(eq("udupi"), eq("agricultural_land")))
                .thenReturn(new AreaSummaryResponse("udupi", List.of(agri)));

        // Blended call → blended count, no acreage.
        mockMvc.perform(get("/api/discover/areas").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].listingCount", is(9)))
                .andExpect(jsonPath("$.areas[0].agriAcreage").doesNotExist());

        // Agri call → agri count + acreage.
        mockMvc.perform(get("/api/discover/areas")
                        .param("city", "udupi")
                        .param("propertyType", "agricultural_land"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].listingCount", is(1)))
                .andExpect(jsonPath("$.areas[0].agriAcreage", is(5.0)));

        verify(areaSummaryService).getAreasByCity(eq("udupi"), isNull());
        verify(areaSummaryService).getAreasByCity(eq("udupi"), eq("agricultural_land"));
    }

    @Test
    void getAreas_whitespacePropertyType_reachesServiceForBlankHandling() throws Exception {
        // The controller forwards the raw param; blank/whitespace → no-filter is normalised in the
        // service (verified in the IT). Here we assert the controller threads the value through and
        // serves with the standard Cache-Control.
        when(areaSummaryService.getAreasByCity(eq("udupi"), any()))
                .thenReturn(new AreaSummaryResponse("udupi", List.of()));

        mockMvc.perform(get("/api/discover/areas")
                        .param("city", "udupi")
                        .param("propertyType", "   "))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=120")));

        ArgumentCaptor<String> typeCaptor = ArgumentCaptor.forClass(String.class);
        verify(areaSummaryService).getAreasByCity(eq("udupi"), typeCaptor.capture());
        assertThat(typeCaptor.getValue()).isEqualTo("   ");
    }
}
