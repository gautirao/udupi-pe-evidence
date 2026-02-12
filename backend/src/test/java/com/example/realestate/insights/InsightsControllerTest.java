package com.example.realestate.insights;

import com.example.realestate.dashboard.AreaInsightsDao;
import com.example.realestate.dashboard.AreaPriceWeekly;
import com.example.realestate.listing.Listing;
import com.example.realestate.listing.ListingRepository.OpportunityProjection;
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

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(
        controllers = InsightsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(InsightsControllerTest.TestConfig.class)
class InsightsControllerTest {

    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

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
    private InsightsService insightsService;

    @BeforeEach
    void setUp() {
        reset(insightsService);
    }

    // ==================== Test 1: avg-price-by-area -> 200 ====================

    @Test
    void avgPriceByArea_returnsArray() throws Exception {
        var row = new AreaInsightsDao.AreaInsightRow(
                "india|karnataka|udupi|manipal", 15, 500000L, 600000L,
                new BigDecimal("0.8333"), OffsetDateTime.now());
        when(insightsService.getAvgPriceByArea()).thenReturn(List.of(row));

        mockMvc.perform(get("/api/insights/avg-price-by-area")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].areaKey").value("india|karnataka|udupi|manipal"))
                .andExpect(jsonPath("$[0].listingCount").value(15))
                .andExpect(jsonPath("$[0].medianPricePerCentPaise").value(500000));
    }

    // ==================== Test 2: price-trend -> 200 ====================

    @Test
    void priceTrend_returnsWeeklyData() throws Exception {
        AreaPriceWeekly w = new AreaPriceWeekly();
        w.setId(UUID.randomUUID());
        w.setAreaKey("india|karnataka|udupi|manipal");
        w.setWeekStartDate(LocalDate.of(2026, 2, 3));
        w.setMedianPricePerCentPaise(500000L);
        w.setListingCount(8);
        w.setP25PricePerCentPaise(400000L);
        w.setP75PricePerCentPaise(600000L);
        when(insightsService.getPriceTrend("india|karnataka|udupi|manipal"))
                .thenReturn(List.of(w));

        mockMvc.perform(get("/api/insights/price-trend")
                        .param("area_key", "india|karnataka|udupi|manipal")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].weekStartDate").value("2026-02-03"))
                .andExpect(jsonPath("$[0].medianPricePerCentPaise").value(500000))
                .andExpect(jsonPath("$[0].listingCount").value(8));
    }

    // ==================== Test 3: price-trend empty -> 200 [] ====================

    @Test
    void priceTrend_unknownArea_returnsEmptyArray() throws Exception {
        when(insightsService.getPriceTrend("nonexistent")).thenReturn(List.of());

        mockMvc.perform(get("/api/insights/price-trend")
                        .param("area_key", "nonexistent")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ==================== Test 4: new-listings with saved areas -> 200 ====================

    @Test
    void newListings_withSavedAreas_returnsListings() throws Exception {
        Listing listing = new Listing();
        listing.setId(UUID.randomUUID());
        listing.setPropertyType("land");
        listing.setLocality("Manipal");
        listing.setAreaKey("india|karnataka|udupi|manipal");
        listing.setPricePaise(5000000L);
        listing.setCreatedAt(OffsetDateTime.now());
        when(insightsService.getNewListings(USER_ID, 7)).thenReturn(List.of(listing));

        mockMvc.perform(get("/api/insights/new-listings")
                        .param("days", "7")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].propertyType").value("land"))
                .andExpect(jsonPath("$[0].locality").value("Manipal"));
    }

    // ==================== Test 5: new-listings no saved areas -> 200 [] ====================

    @Test
    void newListings_noSavedAreas_returnsEmptyArray() throws Exception {
        when(insightsService.getNewListings(USER_ID, 7)).thenReturn(List.of());

        mockMvc.perform(get("/api/insights/new-listings")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ==================== Test 6: recommendations -> 200 ====================

    @Test
    void recommendations_returnsResults() throws Exception {
        OpportunityProjection proj = mock(OpportunityProjection.class);
        when(proj.getId()).thenReturn(UUID.randomUUID());
        when(proj.getPropertyType()).thenReturn("land");
        when(proj.getLocality()).thenReturn("Manipal");
        when(proj.getAreaKey()).thenReturn("india|karnataka|udupi|manipal");
        when(proj.getPricePaise()).thenReturn(5000000L);
        when(proj.getUndervaluationScore()).thenReturn(0.25);
        when(proj.getMedianPricePerCentPaise()).thenReturn(600000L);
        when(insightsService.getRecommendations(USER_ID)).thenReturn(List.of(proj));

        mockMvc.perform(get("/api/insights/recommendations")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].propertyType").value("land"))
                .andExpect(jsonPath("$[0].undervaluationScore").value(0.25));
    }

    // ==================== Test 7: recommendations no saved areas -> 200 (general) ====================

    @Test
    void recommendations_noSavedAreas_returnsGeneralResults() throws Exception {
        OpportunityProjection proj = mock(OpportunityProjection.class);
        when(proj.getId()).thenReturn(UUID.randomUUID());
        when(proj.getPropertyType()).thenReturn("house");
        when(proj.getUndervaluationScore()).thenReturn(0.15);
        when(insightsService.getRecommendations(USER_ID)).thenReturn(List.of(proj));

        mockMvc.perform(get("/api/insights/recommendations")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    // ==================== Test 8: no JWT -> 403 ====================

    @Test
    void avgPriceByArea_withoutJwt_returns403() throws Exception {
        mockMvc.perform(get("/api/insights/avg-price-by-area"))
                .andExpect(status().isForbidden());
    }
}
