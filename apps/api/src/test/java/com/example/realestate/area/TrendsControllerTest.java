package com.example.realestate.area;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for GET /api/trends/options and GET /api/trends/overview.
 * Both endpoints are public — no JWT required.
 */
@WebMvcTest(
        controllers = TrendsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({TrendsControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class TrendsControllerTest {

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
    private AreaOverviewService areaOverviewService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(areaOverviewService, userRoleService);
    }

    // ==================== GET /api/trends/options ====================

    @Test
    void getOptions_validCity_returns200WithDefaultAreas() throws Exception {
        TrendsOptionsResponse response = new TrendsOptionsResponse(
                "udupi",
                List.of(
                        new TrendsOptionsResponse.TrendsOptionDto("IN|KA|Udupi|Manipal", "Manipal"),
                        new TrendsOptionsResponse.TrendsOptionDto("IN|KA|Udupi|Udupi", "Udupi"),
                        new TrendsOptionsResponse.TrendsOptionDto("IN|KA|Udupi|Karkala", "Karkala")
                )
        );
        when(areaOverviewService.getOptions(eq("udupi"), anyInt())).thenReturn(response);

        mockMvc.perform(get("/api/trends/options").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city").value("udupi"))
                .andExpect(jsonPath("$.defaultAreas").isArray())
                .andExpect(jsonPath("$.defaultAreas.length()").value(3))
                .andExpect(jsonPath("$.defaultAreas[0].areaKey").value("IN|KA|Udupi|Manipal"))
                .andExpect(jsonPath("$.defaultAreas[0].areaLabel").value("Manipal"));
    }

    @Test
    void getOptions_defaultLimit_forwardsLimit3ToService() throws Exception {
        when(areaOverviewService.getOptions(eq("udupi"), eq(3)))
                .thenReturn(new TrendsOptionsResponse("udupi", List.of()));

        mockMvc.perform(get("/api/trends/options").param("city", "udupi"))
                .andExpect(status().isOk());

        verify(areaOverviewService).getOptions("udupi", 3);
    }

    @Test
    void getOptions_emptyResult_returns200WithEmptyList() throws Exception {
        when(areaOverviewService.getOptions(eq("mangalore"), anyInt()))
                .thenReturn(new TrendsOptionsResponse("mangalore", List.of()));

        mockMvc.perform(get("/api/trends/options").param("city", "mangalore"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.defaultAreas").isArray())
                .andExpect(jsonPath("$.defaultAreas.length()").value(0));
    }

    @Test
    void getOptions_missingCityParam_returns400() throws Exception {
        mockMvc.perform(get("/api/trends/options"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getOptions_noAuthHeader_returns200() throws Exception {
        when(areaOverviewService.getOptions(eq("udupi"), anyInt()))
                .thenReturn(new TrendsOptionsResponse("udupi", List.of()));

        mockMvc.perform(get("/api/trends/options").param("city", "udupi"))
                .andExpect(status().isOk());
    }

    // ==================== GET /api/trends/overview ====================

    @Test
    void getOverview_validAreaKey_returns200() throws Exception {
        AreaOverviewResponse response = new AreaOverviewResponse(
                "IN|KA|Udupi|Manipal", "Manipal", "IN|KA|Udupi", "Udupi",
                "full", 42,
                new AreaOverviewResponse.SnapshotData(8500000L, 6000000L, 12000000L,
                        null, "rising", 8.2),
                null, List.of(), List.of(),
                new AreaOverviewResponse.ActivityData(30, 10)
        );
        when(areaOverviewService.assembleResponse("IN|KA|Udupi|Manipal")).thenReturn(response);

        mockMvc.perform(get("/api/trends/overview")
                        .param("areaKey", "IN|KA|Udupi|Manipal"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areaKey").value("IN|KA|Udupi|Manipal"))
                .andExpect(jsonPath("$.areaLabel").value("Manipal"))
                .andExpect(jsonPath("$.confidence").value("full"))
                .andExpect(jsonPath("$.listingCount90d").value(42));
    }

    @Test
    void getOverview_unknownAreaKey_returns404() throws Exception {
        when(areaOverviewService.assembleResponse("UNKNOWN"))
                .thenThrow(new AreaNotFoundException("UNKNOWN"));

        mockMvc.perform(get("/api/trends/overview").param("areaKey", "UNKNOWN"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getOverview_missingAreaKeyParam_returns400() throws Exception {
        mockMvc.perform(get("/api/trends/overview"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getOverview_noAuthHeader_returns200() throws Exception {
        AreaOverviewResponse response = new AreaOverviewResponse(
                "IN|KA|Udupi|Manipal", "Manipal", "IN|KA|Udupi", "Udupi",
                "full", 10, null, null, List.of(), List.of(), null
        );
        when(areaOverviewService.assembleResponse("IN|KA|Udupi|Manipal")).thenReturn(response);

        mockMvc.perform(get("/api/trends/overview").param("areaKey", "IN|KA|Udupi|Manipal"))
                .andExpect(status().isOk());
    }
}
