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
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for GET /api/public/areas/trending.
 * No JWT is required — endpoint is public.
 */
@WebMvcTest(
        controllers = AreaOverviewController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({TrendingAreasControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class TrendingAreasControllerTest {

    /** Minimal security config: permit all (mirrors production permitAll on this path). */
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

    // ==================== Happy path — default limit ====================

    @Test
    void getTrending_defaultLimit_returns200WithAreas() throws Exception {
        TrendingAreasResponse.TrendingAreaDto dto1 = new TrendingAreasResponse.TrendingAreaDto(
                "IN|KA|Bengaluru|Koramangala", "Koramangala", "Bengaluru", 115000000L, 342
        );
        TrendingAreasResponse.TrendingAreaDto dto2 = new TrendingAreasResponse.TrendingAreaDto(
                "IN|KA|Bengaluru|Indiranagar", "Indiranagar", "Bengaluru", 98000000L, 210
        );
        when(areaOverviewService.getTrending(6)).thenReturn(new TrendingAreasResponse(List.of(dto1, dto2)));

        mockMvc.perform(get("/api/public/areas/trending"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas").isArray())
                .andExpect(jsonPath("$.areas.length()").value(2))
                .andExpect(jsonPath("$.areas[0].areaKey").value("IN|KA|Bengaluru|Koramangala"))
                .andExpect(jsonPath("$.areas[0].areaLabel").value("Koramangala"))
                .andExpect(jsonPath("$.areas[0].districtLabel").value("Bengaluru"))
                .andExpect(jsonPath("$.areas[0].medianPricePaise").value(115000000))
                .andExpect(jsonPath("$.areas[0].listingCount90d").value(342))
                .andExpect(jsonPath("$.areas[1].areaKey").value("IN|KA|Bengaluru|Indiranagar"));
    }

    // ==================== Explicit limit param forwarded to service ====================

    @Test
    void getTrending_explicitLimit_forwardsLimitToService() throws Exception {
        when(areaOverviewService.getTrending(3)).thenReturn(new TrendingAreasResponse(List.of()));

        mockMvc.perform(get("/api/public/areas/trending").param("limit", "3"))
                .andExpect(status().isOk());

        verify(areaOverviewService).getTrending(3);
    }

    // ==================== Empty result — 200, not 404 ====================

    @Test
    void getTrending_emptyTable_returns200WithEmptyList() throws Exception {
        when(areaOverviewService.getTrending(anyInt())).thenReturn(new TrendingAreasResponse(List.of()));

        mockMvc.perform(get("/api/public/areas/trending"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas").isArray())
                .andExpect(jsonPath("$.areas.length()").value(0));
    }

    // ==================== No Authorization header — still 200 ====================

    @Test
    void getTrending_noAuthHeader_returns200() throws Exception {
        when(areaOverviewService.getTrending(6)).thenReturn(new TrendingAreasResponse(List.of()));

        // Deliberately no Authorization header
        mockMvc.perform(get("/api/public/areas/trending"))
                .andExpect(status().isOk());
    }

    // ==================== medianPricePaise null — serialised as null ====================

    @Test
    void getTrending_nullMedianPrice_serialisedAsNull() throws Exception {
        TrendingAreasResponse.TrendingAreaDto dto = new TrendingAreasResponse.TrendingAreaDto(
                "IN|KA|Udupi|Manipal", "Manipal", "Udupi", null, 5
        );
        when(areaOverviewService.getTrending(6)).thenReturn(new TrendingAreasResponse(List.of(dto)));

        mockMvc.perform(get("/api/public/areas/trending"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].medianPricePaise").doesNotExist());
    }

    // ==================== Non-integer limit — 400 Bad Request ====================

    /**
     * GlobalExceptionHandler extends ResponseEntityExceptionHandler, which handles
     * MethodArgumentTypeMismatchException via handleTypeMismatch → 400 Bad Request.
     * Passing a non-integer value for the {@code limit} param must return 400, not 500.
     */
    @Test
    void getTrending_nonIntegerLimit_returns400() throws Exception {
        mockMvc.perform(get("/api/public/areas/trending").param("limit", "abc"))
                .andExpect(status().isBadRequest());
    }
}
