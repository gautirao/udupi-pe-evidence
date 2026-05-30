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

import java.util.List;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.mockito.Mockito.reset;
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
                3L
        );
        when(areaSummaryService.getAreasByCity("udupi"))
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
        when(areaSummaryService.getAreasByCity("nowhere"))
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
                0L
        );
        when(areaSummaryService.getAreasByCity("udupi"))
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
                0L
        );
        when(areaSummaryService.getAreasByCity("udupi"))
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
                7L
        );
        when(areaSummaryService.getAreasByCity("udupi"))
                .thenReturn(new AreaSummaryResponse("udupi", List.of(area)));

        mockMvc.perform(get("/api/discover/areas").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].schoolCount", is(7)));
    }

    // ── Cache-Control: public, max-age=120 ───────────────────────────────────

    @Test
    void getAreas_responseHasCacheControlPublicMaxAge120() throws Exception {
        when(areaSummaryService.getAreasByCity("udupi"))
                .thenReturn(new AreaSummaryResponse("udupi", List.of()));

        mockMvc.perform(get("/api/discover/areas").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=120")))
                .andExpect(header().string("Cache-Control", containsString("public")))
                .andExpect(header().string("Cache-Control", not(containsString("no-store"))));
    }
}
