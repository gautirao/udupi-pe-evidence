package com.example.realestate.dashboard;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for the Dashboard API price history endpoint.
 * Tests authentication, ordering, and paise-to-rupees conversion.
 */
@WebMvcTest(
        controllers = DashboardController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(DashboardControllerTest.TestConfig.class)
class DashboardControllerTest {

    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .build();
        }

        @Bean
        public AreaPriceWeeklyRepository areaPriceWeeklyRepository() {
            return mock(AreaPriceWeeklyRepository.class);
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AreaPriceWeeklyRepository areaPriceWeeklyRepository;

    @BeforeEach
    void setUp() {
        reset(areaPriceWeeklyRepository);
    }

    // ==================== Authentication Tests ====================

    @Test
    void getPriceHistory_withoutAuth_returnsForbidden() throws Exception {
        mockMvc.perform(get("/api/dashboard/areas/manipal/price-history"))
                .andExpect(status().isForbidden());
    }

    @Test
    void getPriceHistory_withoutAuth_withWeeksParam_returnsForbidden() throws Exception {
        mockMvc.perform(get("/api/dashboard/areas/manipal/price-history")
                        .param("weeks", "12"))
                .andExpect(status().isForbidden());
    }

    // ==================== Ordering Tests ====================

    @Test
    @WithMockUser
    void getPriceHistory_returnsDataInDescendingWeekOrder() throws Exception {
        // Arrange: repository returns data already sorted by week DESC
        List<AreaPriceWeekly> mockData = List.of(
                createWeeklyData("manipal", LocalDate.of(2026, 2, 3), 10, 500000L, 400000L, 600000L),
                createWeeklyData("manipal", LocalDate.of(2026, 1, 27), 8, 480000L, 380000L, 580000L),
                createWeeklyData("manipal", LocalDate.of(2026, 1, 20), 12, 520000L, 420000L, 620000L)
        );
        when(areaPriceWeeklyRepository.findRecentByAreaKey("manipal", 52)).thenReturn(mockData);

        // Act & Assert
        mockMvc.perform(get("/api/dashboard/areas/manipal/price-history"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                // Verify descending order by checking week_start_date values
                .andExpect(jsonPath("$[0].weekStartDate").value("2026-02-03"))
                .andExpect(jsonPath("$[1].weekStartDate").value("2026-01-27"))
                .andExpect(jsonPath("$[2].weekStartDate").value("2026-01-20"));

        verify(areaPriceWeeklyRepository).findRecentByAreaKey("manipal", 52);
    }

    // ==================== Paise to Rupees Conversion Tests ====================

    @Test
    @WithMockUser
    void getPriceHistory_convertsPaiseToRupeesCorrectly() throws Exception {
        // Arrange: 500000 paise = 5000.00 rupees
        List<AreaPriceWeekly> mockData = List.of(
                createWeeklyData("udupi", LocalDate.of(2026, 2, 3), 15, 500000L, 400000L, 600000L)
        );
        when(areaPriceWeeklyRepository.findRecentByAreaKey("udupi", 52)).thenReturn(mockData);

        // Act & Assert
        mockMvc.perform(get("/api/dashboard/areas/udupi/price-history"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].medianPricePerCentRupees").value(5000.00))
                .andExpect(jsonPath("$[0].p25PricePerCentRupees").value(4000.00))
                .andExpect(jsonPath("$[0].p75PricePerCentRupees").value(6000.00));
    }

    @Test
    @WithMockUser
    void getPriceHistory_handlesNullPriceValues() throws Exception {
        // Arrange: prices can be null if no listings in that week
        List<AreaPriceWeekly> mockData = List.of(
                createWeeklyData("empty-area", LocalDate.of(2026, 2, 3), 0, null, null, null)
        );
        when(areaPriceWeeklyRepository.findRecentByAreaKey("empty-area", 52)).thenReturn(mockData);

        // Act & Assert
        mockMvc.perform(get("/api/dashboard/areas/empty-area/price-history"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].listingCount").value(0))
                .andExpect(jsonPath("$[0].medianPricePerCentRupees").isEmpty())
                .andExpect(jsonPath("$[0].p25PricePerCentRupees").isEmpty())
                .andExpect(jsonPath("$[0].p75PricePerCentRupees").isEmpty());
    }

    @Test
    @WithMockUser
    void getPriceHistory_roundsToTwoDecimalPlaces() throws Exception {
        // Arrange: 12345 paise = 123.45 rupees (tests rounding)
        List<AreaPriceWeekly> mockData = List.of(
                createWeeklyData("test-area", LocalDate.of(2026, 2, 3), 5, 12345L, 12344L, 12346L)
        );
        when(areaPriceWeeklyRepository.findRecentByAreaKey("test-area", 52)).thenReturn(mockData);

        // Act & Assert
        mockMvc.perform(get("/api/dashboard/areas/test-area/price-history"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].medianPricePerCentRupees").value(123.45))
                .andExpect(jsonPath("$[0].p25PricePerCentRupees").value(123.44))
                .andExpect(jsonPath("$[0].p75PricePerCentRupees").value(123.46));
    }

    // ==================== Weeks Parameter Tests ====================

    @Test
    @WithMockUser
    void getPriceHistory_respectsWeeksParameter() throws Exception {
        when(areaPriceWeeklyRepository.findRecentByAreaKey("manipal", 12)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/manipal/price-history")
                        .param("weeks", "12"))
                .andExpect(status().isOk());

        verify(areaPriceWeeklyRepository).findRecentByAreaKey("manipal", 12);
    }

    @Test
    @WithMockUser
    void getPriceHistory_defaultsTo52Weeks() throws Exception {
        when(areaPriceWeeklyRepository.findRecentByAreaKey("manipal", 52)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/manipal/price-history"))
                .andExpect(status().isOk());

        verify(areaPriceWeeklyRepository).findRecentByAreaKey("manipal", 52);
    }

    @Test
    @WithMockUser
    void getPriceHistory_clampsTooLargeWeeksValue() throws Exception {
        // MAX_WEEKS is 520; values above should be clamped
        when(areaPriceWeeklyRepository.findRecentByAreaKey("manipal", 520)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/manipal/price-history")
                        .param("weeks", "9999"))
                .andExpect(status().isOk());

        verify(areaPriceWeeklyRepository).findRecentByAreaKey("manipal", 520);
    }

    @Test
    @WithMockUser
    void getPriceHistory_clampsTooSmallWeeksValue() throws Exception {
        // Values below 1 should be clamped to 1
        when(areaPriceWeeklyRepository.findRecentByAreaKey("manipal", 1)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/manipal/price-history")
                        .param("weeks", "0"))
                .andExpect(status().isOk());

        verify(areaPriceWeeklyRepository).findRecentByAreaKey("manipal", 1);
    }

    // ==================== Empty Result Tests ====================

    @Test
    @WithMockUser
    void getPriceHistory_unknownAreaKey_returnsEmptyArray() throws Exception {
        when(areaPriceWeeklyRepository.findRecentByAreaKey("nonexistent-area", 52)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/nonexistent-area/price-history"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ==================== Helper Methods ====================

    private AreaPriceWeekly createWeeklyData(
            String areaKey,
            LocalDate weekStartDate,
            int listingCount,
            Long medianPaise,
            Long p25Paise,
            Long p75Paise) {
        AreaPriceWeekly entity = new AreaPriceWeekly();
        entity.setId(UUID.randomUUID());
        entity.setAreaKey(areaKey);
        entity.setWeekStartDate(weekStartDate);
        entity.setListingCount(listingCount);
        entity.setMedianPricePerCentPaise(medianPaise);
        entity.setP25PricePerCentPaise(p25Paise);
        entity.setP75PricePerCentPaise(p75Paise);
        entity.setCreatedAt(OffsetDateTime.now());
        entity.setUpdatedAt(OffsetDateTime.now());
        return entity;
    }
}
