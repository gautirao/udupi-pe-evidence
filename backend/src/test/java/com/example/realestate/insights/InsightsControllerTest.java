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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import com.example.realestate.security.UserRoleService;
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
    private UserRoleService userRoleService;

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
        when(insightsService.getAvgPriceByArea(anyString(), anyInt())).thenReturn(List.of(row));

        mockMvc.perform(get("/api/insights/avg-price-by-area")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].areaKey").value("india|karnataka|udupi|manipal"))
                .andExpect(jsonPath("$[0].listingCount").value(15))
                .andExpect(jsonPath("$[0].medianPricePerCentPaise").value(500000));
    }

    @Test
    void avgPriceByArea_withPropertyTypeParam_passesTypeToService() throws Exception {
        when(insightsService.getAvgPriceByArea(eq("land"), anyInt())).thenReturn(List.of());

        mockMvc.perform(get("/api/insights/avg-price-by-area")
                        .param("propertyType", "land")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk());

        verify(insightsService).getAvgPriceByArea("land", 0);
    }

    @Test
    void avgPriceByArea_withoutPropertyTypeParam_defaultsToAll() throws Exception {
        when(insightsService.getAvgPriceByArea(anyString(), anyInt())).thenReturn(List.of());

        mockMvc.perform(get("/api/insights/avg-price-by-area")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk());

        verify(insightsService).getAvgPriceByArea("all", 0);
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
        when(insightsService.getPriceTrend(eq("india|karnataka|udupi|manipal"), anyString(), anyInt()))
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
        when(insightsService.getPriceTrend(eq("nonexistent"), anyString(), anyInt())).thenReturn(List.of());

        mockMvc.perform(get("/api/insights/price-trend")
                        .param("area_key", "nonexistent")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void priceTrend_withPropertyTypeParam_passesTypeToService() throws Exception {
        when(insightsService.getPriceTrend(anyString(), eq("land"), anyInt())).thenReturn(List.of());

        mockMvc.perform(get("/api/insights/price-trend")
                        .param("area_key", "india|karnataka|udupi|manipal")
                        .param("propertyType", "land")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk());

        verify(insightsService).getPriceTrend("india|karnataka|udupi|manipal", "land", 0);
    }

    @Test
    void priceTrend_withoutPropertyTypeParam_defaultsToAll() throws Exception {
        when(insightsService.getPriceTrend(anyString(), anyString(), anyInt())).thenReturn(List.of());

        mockMvc.perform(get("/api/insights/price-trend")
                        .param("area_key", "india|karnataka|udupi|manipal")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk());

        verify(insightsService).getPriceTrend("india|karnataka|udupi|manipal", "all", 0);
    }

    // ==================== Test 4: new-listings with saved areas -> 200 (Page) ====================

    @Test
    void newListings_withSavedAreas_returnsPagedListings() throws Exception {
        Listing listing = new Listing();
        listing.setId(UUID.randomUUID());
        listing.setPropertyType("land");
        listing.setLocality("Manipal");
        listing.setAreaKey("india|karnataka|udupi|manipal");
        listing.setPricePaise(5000000L);
        listing.setCreatedAt(OffsetDateTime.now());

        Page<Listing> page = new PageImpl<>(List.of(listing), PageRequest.of(0, 20), 1);
        when(insightsService.getNewListings(eq(USER_ID), eq(7), any(Pageable.class)))
                .thenReturn(page);

        mockMvc.perform(get("/api/insights/new-listings")
                        .param("days", "7")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].propertyType").value("land"))
                .andExpect(jsonPath("$.content[0].locality").value("Manipal"))
                .andExpect(jsonPath("$.page.totalElements").value(1))
                .andExpect(jsonPath("$.page.totalPages").value(1));
    }

    // ==================== Test 5: new-listings no saved areas -> 200 empty Page ====================

    @Test
    void newListings_noSavedAreas_returnsEmptyPage() throws Exception {
        Page<Listing> emptyPage = Page.empty(PageRequest.of(0, 20));
        when(insightsService.getNewListings(eq(USER_ID), eq(7), any(Pageable.class)))
                .thenReturn(emptyPage);

        mockMvc.perform(get("/api/insights/new-listings")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.page.totalElements").value(0));
    }

    // ==================== Test 6: new-listings pagination params forwarded ====================

    @Test
    void newListings_paginationParams_areForwardedToService() throws Exception {
        Page<Listing> emptyPage = Page.empty(PageRequest.of(0, 10));
        when(insightsService.getNewListings(eq(USER_ID), eq(7), any(Pageable.class)))
                .thenReturn(emptyPage);

        mockMvc.perform(get("/api/insights/new-listings")
                        .param("page", "0")
                        .param("size", "10")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk());

        // Verify service was called with a Pageable (pagination params forwarded)
        verify(insightsService).getNewListings(eq(USER_ID), eq(7), argThat(p ->
                p.getPageSize() == 10 && p.getPageNumber() == 0));
    }

    // ==================== Test 7: recommendations -> 200 (Page) ====================

    @Test
    void recommendations_returnsPagedResults() throws Exception {
        OpportunityProjection proj = mock(OpportunityProjection.class);
        when(proj.getId()).thenReturn(UUID.randomUUID());
        when(proj.getPropertyType()).thenReturn("land");
        when(proj.getLocality()).thenReturn("Manipal");
        when(proj.getAreaKey()).thenReturn("india|karnataka|udupi|manipal");
        when(proj.getPricePaise()).thenReturn(5000000L);
        when(proj.getUndervaluationScore()).thenReturn(0.25);
        when(proj.getMedianPricePerCentPaise()).thenReturn(600000L);

        Page<OpportunityProjection> page = new PageImpl<>(List.of(proj), PageRequest.of(0, 20), 1);
        when(insightsService.getRecommendations(eq(USER_ID), any(Pageable.class)))
                .thenReturn(page);

        mockMvc.perform(get("/api/insights/recommendations")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].propertyType").value("land"))
                .andExpect(jsonPath("$.content[0].undervaluationScore").value(0.25))
                .andExpect(jsonPath("$.page.totalElements").value(1))
                .andExpect(jsonPath("$.page.totalPages").value(1));
    }

    // ==================== Test 8: recommendations no saved areas -> 200 (general, paged) ====================

    @Test
    void recommendations_noSavedAreas_returnsGeneralPagedResults() throws Exception {
        OpportunityProjection proj = mock(OpportunityProjection.class);
        when(proj.getId()).thenReturn(UUID.randomUUID());
        when(proj.getPropertyType()).thenReturn("house");
        when(proj.getUndervaluationScore()).thenReturn(0.15);

        Page<OpportunityProjection> page = new PageImpl<>(List.of(proj), PageRequest.of(0, 20), 1);
        when(insightsService.getRecommendations(eq(USER_ID), any(Pageable.class)))
                .thenReturn(page);

        mockMvc.perform(get("/api/insights/recommendations")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.page.totalElements").value(1));
    }

    // ==================== Test 9: recommendations pagination params forwarded ====================

    @Test
    void recommendations_paginationParams_areForwardedToService() throws Exception {
        Page<OpportunityProjection> emptyPage = Page.empty(PageRequest.of(0, 10));
        when(insightsService.getRecommendations(eq(USER_ID), any(Pageable.class)))
                .thenReturn(emptyPage);

        mockMvc.perform(get("/api/insights/recommendations")
                        .param("page", "0")
                        .param("size", "10")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk());

        // Verify service was called with a Pageable reflecting size=10
        verify(insightsService).getRecommendations(eq(USER_ID), argThat(p ->
                p.getPageSize() == 10 && p.getPageNumber() == 0));
    }

    // ==================== Test 10: no JWT -> 403 ====================

    @Test
    void avgPriceByArea_withoutJwt_returns403() throws Exception {
        mockMvc.perform(get("/api/insights/avg-price-by-area"))
                .andExpect(status().isForbidden());
    }

    // ==================== Test 11: getAvgPrice_expiredAccess_returns403 ====================

    @Test
    void getAvgPrice_expiredAccess_returns403() throws Exception {
        doThrow(new InsightsService.InsightsAccessExpiredException(OffsetDateTime.now().minusDays(1)))
                .when(insightsService).checkInsightsAccess(any());

        mockMvc.perform(get("/api/insights/avg-price-by-area")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").exists());
    }

    // ==================== Test 12: getAvgPrice_nullAccess_returns403 ====================

    @Test
    void getAvgPrice_nullAccess_returns403() throws Exception {
        doThrow(new InsightsService.InsightsAccessExpiredException(null))
                .when(insightsService).checkInsightsAccess(any());

        mockMvc.perform(get("/api/insights/avg-price-by-area")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isForbidden());
    }

    // ==================== Test 13: getPriceTrend_expiredAccess_returns403 ====================

    @Test
    void getPriceTrend_expiredAccess_returns403() throws Exception {
        doThrow(new InsightsService.InsightsAccessExpiredException(OffsetDateTime.now().minusDays(1)))
                .when(insightsService).checkInsightsAccess(any());

        mockMvc.perform(get("/api/insights/price-trend")
                        .param("area_key", "Manipal")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isForbidden());
    }

    // ==================== Test 14: getNewListings_expiredAccess_returns403 ====================

    @Test
    void getNewListings_expiredAccess_returns403() throws Exception {
        doThrow(new InsightsService.InsightsAccessExpiredException(OffsetDateTime.now().minusDays(1)))
                .when(insightsService).checkInsightsAccess(any());

        mockMvc.perform(get("/api/insights/new-listings")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isForbidden());
    }

    // ==================== Test 15: getRecommendations_expiredAccess_returns403 ====================

    @Test
    void getRecommendations_expiredAccess_returns403() throws Exception {
        doThrow(new InsightsService.InsightsAccessExpiredException(OffsetDateTime.now().minusDays(1)))
                .when(insightsService).checkInsightsAccess(any());

        mockMvc.perform(get("/api/insights/recommendations")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isForbidden());
    }
}
