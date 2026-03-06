package com.example.realestate.dashboard;

import com.example.realestate.listing.Listing;
import com.example.realestate.listing.ListingRepository;
import com.example.realestate.listing.ListingRepository.OpportunityProjection;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for the Dashboard API endpoints.
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

        @Bean
        public AreaInsightsDao areaInsightsDao() {
            return mock(AreaInsightsDao.class);
        }

        @Bean
        public ListingRepository listingRepository() {
            return mock(ListingRepository.class);
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AreaPriceWeeklyRepository areaPriceWeeklyRepository;

    @Autowired
    private AreaInsightsDao areaInsightsDao;

    @Autowired
    private ListingRepository listingRepository;

    @BeforeEach
    void setUp() {
        reset(areaPriceWeeklyRepository, areaInsightsDao, listingRepository);
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
        when(areaPriceWeeklyRepository.findRecentByAreaKey("manipal", "all", 0, 52)).thenReturn(mockData);

        // Act & Assert
        mockMvc.perform(get("/api/dashboard/areas/manipal/price-history"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                // Verify descending order by checking week_start_date values
                .andExpect(jsonPath("$[0].weekStartDate").value("2026-02-03"))
                .andExpect(jsonPath("$[1].weekStartDate").value("2026-01-27"))
                .andExpect(jsonPath("$[2].weekStartDate").value("2026-01-20"));

        verify(areaPriceWeeklyRepository).findRecentByAreaKey("manipal", "all", 0, 52);
    }

    // ==================== Paise to Rupees Conversion Tests ====================

    @Test
    @WithMockUser
    void getPriceHistory_convertsPaiseToRupeesCorrectly() throws Exception {
        // Arrange: 500000 paise = 5000.00 rupees
        List<AreaPriceWeekly> mockData = List.of(
                createWeeklyData("udupi", LocalDate.of(2026, 2, 3), 15, 500000L, 400000L, 600000L)
        );
        when(areaPriceWeeklyRepository.findRecentByAreaKey("udupi", "all", 0, 52)).thenReturn(mockData);

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
        when(areaPriceWeeklyRepository.findRecentByAreaKey("empty-area", "all", 0, 52)).thenReturn(mockData);

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
        when(areaPriceWeeklyRepository.findRecentByAreaKey("test-area", "all", 0, 52)).thenReturn(mockData);

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
        when(areaPriceWeeklyRepository.findRecentByAreaKey("manipal", "all", 0, 12)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/manipal/price-history")
                        .param("weeks", "12"))
                .andExpect(status().isOk());

        verify(areaPriceWeeklyRepository).findRecentByAreaKey("manipal", "all", 0, 12);
    }

    @Test
    @WithMockUser
    void getPriceHistory_defaultsTo52Weeks() throws Exception {
        when(areaPriceWeeklyRepository.findRecentByAreaKey("manipal", "all", 0, 52)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/manipal/price-history"))
                .andExpect(status().isOk());

        verify(areaPriceWeeklyRepository).findRecentByAreaKey("manipal", "all", 0, 52);
    }

    @Test
    @WithMockUser
    void getPriceHistory_clampsTooLargeWeeksValue() throws Exception {
        // MAX_WEEKS is 520; values above should be clamped
        when(areaPriceWeeklyRepository.findRecentByAreaKey("manipal", "all", 0, 520)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/manipal/price-history")
                        .param("weeks", "9999"))
                .andExpect(status().isOk());

        verify(areaPriceWeeklyRepository).findRecentByAreaKey("manipal", "all", 0, 520);
    }

    @Test
    @WithMockUser
    void getPriceHistory_clampsTooSmallWeeksValue() throws Exception {
        // Values below 1 should be clamped to 1
        when(areaPriceWeeklyRepository.findRecentByAreaKey("manipal", "all", 0, 1)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/manipal/price-history")
                        .param("weeks", "0"))
                .andExpect(status().isOk());

        verify(areaPriceWeeklyRepository).findRecentByAreaKey("manipal", "all", 0, 1);
    }

    // ==================== Empty Result Tests ====================

    @Test
    @WithMockUser
    void getPriceHistory_unknownAreaKey_returnsEmptyArray() throws Exception {
        when(areaPriceWeeklyRepository.findRecentByAreaKey("nonexistent-area", "all", 0, 52)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/nonexistent-area/price-history"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ==================== Area Insights: Authentication Tests ====================

    @Test
    void getInsights_withoutAuth_returnsForbidden() throws Exception {
        mockMvc.perform(get("/api/dashboard/areas/insights"))
                .andExpect(status().isForbidden());
    }

    // ==================== Area Insights: Sort Validation ====================

    @Test
    @WithMockUser
    void getInsights_unknownSort_returnsBadRequest() throws Exception {
        mockMvc.perform(get("/api/dashboard/areas/insights")
                        .param("sort", "bogus"))
                .andExpect(status().isBadRequest());
    }

    // ==================== Area Insights: Sorting ====================

    @Test
    @WithMockUser
    void getInsights_defaultSort_isMedianDesc() throws Exception {
        when(areaInsightsDao.findInsights("median_desc", 50, 5, "all", 0)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/insights"))
                .andExpect(status().isOk());

        verify(areaInsightsDao).findInsights("median_desc", 50, 5, "all", 0);
    }

    @Test
    @WithMockUser
    void getInsights_medianAsc_passesCorrectSort() throws Exception {
        when(areaInsightsDao.findInsights("median_asc", 50, 5, "all", 0)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/insights")
                        .param("sort", "median_asc"))
                .andExpect(status().isOk());

        verify(areaInsightsDao).findInsights("median_asc", 50, 5, "all", 0);
    }

    @Test
    @WithMockUser
    void getInsights_activityDesc_passesCorrectSort() throws Exception {
        when(areaInsightsDao.findInsights("activity_desc", 50, 5, "all", 0)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/insights")
                        .param("sort", "activity_desc"))
                .andExpect(status().isOk());

        verify(areaInsightsDao).findInsights("activity_desc", 50, 5, "all", 0);
    }

    @Test
    @WithMockUser
    void getInsights_responsePreservesOrder() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        List<AreaInsightsDao.AreaInsightRow> mockData = List.of(
                new AreaInsightsDao.AreaInsightRow("area-a", 20, 900000L, 800000L, new BigDecimal("1.1250"), now),
                new AreaInsightsDao.AreaInsightRow("area-b", 15, 700000L, 800000L, new BigDecimal("0.8750"), now),
                new AreaInsightsDao.AreaInsightRow("area-c", 10, 500000L, 800000L, new BigDecimal("0.6250"), now)
        );
        when(areaInsightsDao.findInsights("median_desc", 50, 5, "all", 0)).thenReturn(mockData);

        mockMvc.perform(get("/api/dashboard/areas/insights"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].areaKey").value("area-a"))
                .andExpect(jsonPath("$[1].areaKey").value("area-b"))
                .andExpect(jsonPath("$[2].areaKey").value("area-c"));
    }

    // ==================== Area Insights: Paise to Rupees Conversion ====================

    @Test
    @WithMockUser
    void getInsights_convertsPaiseToRupeesCorrectly() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        List<AreaInsightsDao.AreaInsightRow> mockData = List.of(
                new AreaInsightsDao.AreaInsightRow("test-area", 10, 500000L, 300000L, new BigDecimal("1.6667"), now)
        );
        when(areaInsightsDao.findInsights("median_desc", 50, 5, "all", 0)).thenReturn(mockData);

        mockMvc.perform(get("/api/dashboard/areas/insights"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].medianPricePerCentRupees").value(5000.00))
                .andExpect(jsonPath("$[0].cityMedianPricePerCentRupees").value(3000.00))
                .andExpect(jsonPath("$[0].priceIndex").value(1.6667));
    }

    @Test
    @WithMockUser
    void getInsights_handlesNullPrices() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        List<AreaInsightsDao.AreaInsightRow> mockData = List.of(
                new AreaInsightsDao.AreaInsightRow("null-area", 5, null, null, null, now)
        );
        when(areaInsightsDao.findInsights("median_desc", 50, 5, "all", 0)).thenReturn(mockData);

        mockMvc.perform(get("/api/dashboard/areas/insights"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].areaKey").value("null-area"))
                .andExpect(jsonPath("$[0].listingCount").value(5))
                .andExpect(jsonPath("$[0].medianPricePerCentRupees").isEmpty())
                .andExpect(jsonPath("$[0].cityMedianPricePerCentRupees").isEmpty())
                .andExpect(jsonPath("$[0].priceIndex").isEmpty());
    }

    // ==================== Area Insights: minCount Filter ====================

    @Test
    @WithMockUser
    void getInsights_passesMinCountToDao() throws Exception {
        when(areaInsightsDao.findInsights("median_desc", 50, 10, "all", 0)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/insights")
                        .param("minCount", "10"))
                .andExpect(status().isOk());

        verify(areaInsightsDao).findInsights("median_desc", 50, 10, "all", 0);
    }

    @Test
    @WithMockUser
    void getInsights_minCountFlooredAtZero() throws Exception {
        when(areaInsightsDao.findInsights("median_desc", 50, 0, "all", 0)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/insights")
                        .param("minCount", "-5"))
                .andExpect(status().isOk());

        verify(areaInsightsDao).findInsights("median_desc", 50, 0, "all", 0);
    }

    // ==================== Area Insights: Limit ====================

    @Test
    @WithMockUser
    void getInsights_limitCappedAt200() throws Exception {
        when(areaInsightsDao.findInsights("median_desc", 200, 5, "all", 0)).thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/areas/insights")
                        .param("limit", "999"))
                .andExpect(status().isOk());

        verify(areaInsightsDao).findInsights("median_desc", 200, 5, "all", 0);
    }

    // ==================== Map Listings: Auth Tests ====================

    @Test
    void getMapListings_withoutAuth_returnsForbidden() throws Exception {
        mockMvc.perform(get("/api/dashboard/map/listings")
                        .param("minLat", "10.0").param("minLng", "74.0")
                        .param("maxLat", "11.0").param("maxLng", "75.0"))
                .andExpect(status().isForbidden());
    }

    // ==================== Map Listings: Bbox Validation Tests ====================

    @Test
    @WithMockUser
    void getMapListings_minLatGreaterThanMaxLat_returnsBadRequest() throws Exception {
        mockMvc.perform(get("/api/dashboard/map/listings")
                        .param("minLat", "12.0").param("minLng", "74.0")
                        .param("maxLat", "10.0").param("maxLng", "75.0"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser
    void getMapListings_minLngGreaterThanMaxLng_returnsBadRequest() throws Exception {
        mockMvc.perform(get("/api/dashboard/map/listings")
                        .param("minLat", "10.0").param("minLng", "76.0")
                        .param("maxLat", "11.0").param("maxLng", "75.0"))
                .andExpect(status().isBadRequest());
    }

    // ==================== Map Listings: Happy Path ====================

    @Test
    @WithMockUser
    void getMapListings_returnsListingsWithPaiseToRupeesConversion() throws Exception {
        Listing listing = createListing(
                10.5, 74.5, "IN|KA|Udupi|Manipal", "Manipal, Udupi",
                "3 cent plot in Manipal", 1500000L, 500000L);

        when(listingRepository.findInBoundingBox(
                eq(10.0), eq(74.0), eq(11.0), eq(75.0),
                isNull(), isNull(), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(listing)));

        mockMvc.perform(get("/api/dashboard/map/listings")
                        .param("minLat", "10.0").param("minLng", "74.0")
                        .param("maxLat", "11.0").param("maxLng", "75.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].title").value("3 cent plot in Manipal"))
                .andExpect(jsonPath("$.content[0].priceRupees").value(15000.00))
                .andExpect(jsonPath("$.content[0].pricePerCentRupees").value(5000.00))
                .andExpect(jsonPath("$.content[0].areaKey").value("IN|KA|Udupi|Manipal"))
                .andExpect(jsonPath("$.content[0].areaLabel").value("Manipal, Udupi"))
                .andExpect(jsonPath("$.content[0].latitude").value(10.5))
                .andExpect(jsonPath("$.content[0].longitude").value(74.5));
    }

    // ==================== Map Listings: Price Filter Tests ====================

    @Test
    @WithMockUser
    void getMapListings_priceFilterConvertsRupeesToPaise() throws Exception {
        when(listingRepository.findInBoundingBox(
                eq(10.0), eq(74.0), eq(11.0), eq(75.0),
                eq(300000L), eq(700000L), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        // minPpc=3000 rupees = 300000 paise, maxPpc=7000 rupees = 700000 paise
        mockMvc.perform(get("/api/dashboard/map/listings")
                        .param("minLat", "10.0").param("minLng", "74.0")
                        .param("maxLat", "11.0").param("maxLng", "75.0")
                        .param("minPpc", "3000").param("maxPpc", "7000"))
                .andExpect(status().isOk());

        verify(listingRepository).findInBoundingBox(
                eq(10.0), eq(74.0), eq(11.0), eq(75.0),
                eq(300000L), eq(700000L), any(), any(Pageable.class));
    }

    @Test
    @WithMockUser
    void getMapListings_noPriceFilter_passesNullPpcParams() throws Exception {
        when(listingRepository.findInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                isNull(), isNull(), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/dashboard/map/listings")
                        .param("minLat", "10.0").param("minLng", "74.0")
                        .param("maxLat", "11.0").param("maxLng", "75.0"))
                .andExpect(status().isOk());

        verify(listingRepository).findInBoundingBox(
                eq(10.0), eq(74.0), eq(11.0), eq(75.0),
                isNull(), isNull(), any(), any(Pageable.class));
    }

    // ==================== Map Listings: FreshDays Tests ====================

    @Test
    @WithMockUser
    void getMapListings_freshDaysZero_passesNullCreatedAfter() throws Exception {
        when(listingRepository.findInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                isNull(), isNull(), isNull(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/dashboard/map/listings")
                        .param("minLat", "10.0").param("minLng", "74.0")
                        .param("maxLat", "11.0").param("maxLng", "75.0")
                        .param("freshDays", "0"))
                .andExpect(status().isOk());

        verify(listingRepository).findInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                isNull(), isNull(), isNull(), any(Pageable.class));
    }

    @Test
    @WithMockUser
    void getMapListings_negativeFreshDays_passesNullCreatedAfter() throws Exception {
        when(listingRepository.findInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                isNull(), isNull(), isNull(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/dashboard/map/listings")
                        .param("minLat", "10.0").param("minLng", "74.0")
                        .param("maxLat", "11.0").param("maxLng", "75.0")
                        .param("freshDays", "-5"))
                .andExpect(status().isOk());

        verify(listingRepository).findInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                isNull(), isNull(), isNull(), any(Pageable.class));
    }

    @Test
    @WithMockUser
    void getMapListings_defaultFreshDays_passesNonNullCreatedAfter() throws Exception {
        when(listingRepository.findInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                isNull(), isNull(), argThat(t -> t != null), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        // Default freshDays=7, so createdAfter should be non-null
        mockMvc.perform(get("/api/dashboard/map/listings")
                        .param("minLat", "10.0").param("minLng", "74.0")
                        .param("maxLat", "11.0").param("maxLng", "75.0"))
                .andExpect(status().isOk());

        verify(listingRepository).findInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                isNull(), isNull(), argThat(t -> t != null), any(Pageable.class));
    }

    // ==================== Map Listings: Pagination Tests ====================

    @Test
    @WithMockUser
    void getMapListings_defaultPageSizeIs200() throws Exception {
        // Global max-page-size=100 caps the @PageableDefault(size=200) to 100 at runtime.
        when(listingRepository.findInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                any(), any(), any(), argThat(p -> p.getPageSize() == 100)))
                .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/dashboard/map/listings")
                        .param("minLat", "10.0").param("minLng", "74.0")
                        .param("maxLat", "11.0").param("maxLng", "75.0"))
                .andExpect(status().isOk());

        verify(listingRepository).findInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                any(), any(), any(), argThat(p -> p.getPageSize() == 100));
    }

    @Test
    @WithMockUser
    void getMapListings_customPageSize() throws Exception {
        when(listingRepository.findInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                any(), any(), any(), argThat(p -> p.getPageSize() == 50)))
                .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/dashboard/map/listings")
                        .param("minLat", "10.0").param("minLng", "74.0")
                        .param("maxLat", "11.0").param("maxLng", "75.0")
                        .param("size", "50"))
                .andExpect(status().isOk());

        verify(listingRepository).findInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                any(), any(), any(), argThat(p -> p.getPageSize() == 50));
    }

    // ==================== Opportunity Finder Tests ====================

    @Test
    void getOpportunities_withoutAuth_returnsForbidden() throws Exception {
        mockMvc.perform(get("/api/dashboard/opportunities"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser
    void getOpportunities_invalidThresholdTooLow_returnsBadRequest() throws Exception {
        mockMvc.perform(get("/api/dashboard/opportunities")
                        .param("threshold", "0.05"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("threshold must be between 0.1 and 1.0"));
    }

    @Test
    @WithMockUser
    void getOpportunities_invalidThresholdTooHigh_returnsBadRequest() throws Exception {
        mockMvc.perform(get("/api/dashboard/opportunities")
                        .param("threshold", "1.5"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("threshold must be between 0.1 and 1.0"));
    }

    @Test
    @WithMockUser
    void getOpportunities_defaultParameters_passedToRepository() throws Exception {
        when(listingRepository.findOpportunities(null, 0.80, 14, 50))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/opportunities"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        verify(listingRepository).findOpportunities(null, 0.80, 14, 50);
    }

    @Test
    @WithMockUser
    void getOpportunities_capsLimitAt200() throws Exception {
        when(listingRepository.findOpportunities(null, 0.80, 14, 200))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/opportunities")
                        .param("limit", "999"))
                .andExpect(status().isOk());

        verify(listingRepository).findOpportunities(null, 0.80, 14, 200);
    }

    @Test
    @WithMockUser
    void getOpportunities_withAreaKeyFilter() throws Exception {
        when(listingRepository.findOpportunities("IN|KA|Manipal|Eshwar Nagar", 0.80, 14, 50))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/opportunities")
                        .param("areaKey", "IN|KA|Manipal|Eshwar Nagar"))
                .andExpect(status().isOk());

        verify(listingRepository).findOpportunities("IN|KA|Manipal|Eshwar Nagar", 0.80, 14, 50);
    }

    @Test
    @WithMockUser
    void getOpportunities_returnsMappedResponseWithCorrectFields() throws Exception {
        UUID listingId = UUID.randomUUID();
        OffsetDateTime createdAt = OffsetDateTime.now();

        OpportunityProjection projection = createOpportunityProjection(
                listingId, "land", "Manipal", "Manipal, Karnataka",
                5000000L, 300000L, new BigDecimal("10.5"),
                "IN|KA|Udupi|Manipal", 13.35, 74.79,
                createdAt, 500000L, 0.4);

        when(listingRepository.findOpportunities(null, 0.80, 14, 50))
                .thenReturn(List.of(projection));

        mockMvc.perform(get("/api/dashboard/opportunities"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(listingId.toString()))
                .andExpect(jsonPath("$[0].title").value("Land in Manipal"))
                .andExpect(jsonPath("$[0].propertyType").value("land"))
                .andExpect(jsonPath("$[0].priceRupees").value(50000.00))
                .andExpect(jsonPath("$[0].pricePerCentRupees").value(3000.00))
                .andExpect(jsonPath("$[0].areaCent").value(10.5))
                .andExpect(jsonPath("$[0].areaKey").value("IN|KA|Udupi|Manipal"))
                .andExpect(jsonPath("$[0].areaLabel").value("Manipal, Karnataka"))
                .andExpect(jsonPath("$[0].lat").value(13.35))
                .andExpect(jsonPath("$[0].lng").value(74.79))
                .andExpect(jsonPath("$[0].areaMedianPricePerCentRupees").value(5000.00))
                .andExpect(jsonPath("$[0].undervaluationScore").value(0.4));
    }

    @Test
    @WithMockUser
    void getOpportunities_sortPreserved_undervaluationScoreDesc() throws Exception {
        OpportunityProjection highScore = createOpportunityProjection(
                UUID.randomUUID(), "land", "A-Town", "A", 100L, 100L,
                BigDecimal.ONE, "area-a", null, null,
                OffsetDateTime.now(), 500L, 0.8);
        OpportunityProjection lowScore = createOpportunityProjection(
                UUID.randomUUID(), "house", "B-Town", "B", 100L, 100L,
                BigDecimal.ONE, "area-b", null, null,
                OffsetDateTime.now(), 500L, 0.3);

        when(listingRepository.findOpportunities(null, 0.80, 14, 50))
                .thenReturn(List.of(highScore, lowScore));

        mockMvc.perform(get("/api/dashboard/opportunities"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].undervaluationScore").value(0.8))
                .andExpect(jsonPath("$[1].undervaluationScore").value(0.3));
    }

    @Test
    @WithMockUser
    void getOpportunities_emptyResult_whenNoMatches() throws Exception {
        when(listingRepository.findOpportunities(null, 0.80, 14, 50))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/dashboard/opportunities"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @WithMockUser
    void getOpportunities_titleFallsBackToAreaLabel_whenLocalityNull() throws Exception {
        OpportunityProjection projection = createOpportunityProjection(
                UUID.randomUUID(), "house", null, "Udupi, Karnataka",
                100L, 100L, BigDecimal.ONE, "area-x",
                null, null, OffsetDateTime.now(), 500L, 0.5);

        when(listingRepository.findOpportunities(null, 0.80, 14, 50))
                .thenReturn(List.of(projection));

        mockMvc.perform(get("/api/dashboard/opportunities"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("House in Udupi, Karnataka"));
    }

    @Test
    @WithMockUser
    void getOpportunities_titleNull_whenLocalityAndAreaLabelBothNull() throws Exception {
        OpportunityProjection projection = createOpportunityProjection(
                UUID.randomUUID(), "house", null, null,
                100L, 100L, BigDecimal.ONE, "area-x",
                null, null, OffsetDateTime.now(), 500L, 0.5);

        when(listingRepository.findOpportunities(null, 0.80, 14, 50))
                .thenReturn(List.of(projection));

        mockMvc.perform(get("/api/dashboard/opportunities"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").isEmpty());
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

    private Listing createListing(
            double lat, double lng, String areaKey, String areaLabel,
            String description, Long pricePaise, Long pricePerCentPaise) {
        Listing listing = new Listing();
        listing.setId(UUID.randomUUID());
        listing.setLatitude(lat);
        listing.setLongitude(lng);
        listing.setAreaKey(areaKey);
        listing.setAreaLabel(areaLabel);
        listing.setDescription(description);
        listing.setPricePaise(pricePaise);
        listing.setPricePerCentPaise(pricePerCentPaise);
        listing.setDuplicate(false);
        listing.setCreatedAt(OffsetDateTime.now());
        return listing;
    }

    private OpportunityProjection createOpportunityProjection(
            UUID id, String propertyType, String locality, String areaLabel,
            Long pricePaise, Long pricePerCentPaise, BigDecimal areaCent,
            String areaKey, Double lat, Double lng,
            OffsetDateTime createdAt, Long medianPricePerCentPaise,
            double undervaluationScore) {
        OpportunityProjection p = mock(OpportunityProjection.class);
        when(p.getId()).thenReturn(id);
        when(p.getPropertyType()).thenReturn(propertyType);
        when(p.getLocality()).thenReturn(locality);
        when(p.getAreaLabel()).thenReturn(areaLabel);
        when(p.getPricePaise()).thenReturn(pricePaise);
        when(p.getPricePerCentPaise()).thenReturn(pricePerCentPaise);
        when(p.getAreaCent()).thenReturn(areaCent);
        when(p.getAreaKey()).thenReturn(areaKey);
        when(p.getLatitude()).thenReturn(lat);
        when(p.getLongitude()).thenReturn(lng);
        when(p.getCreatedAt()).thenReturn(createdAt);
        when(p.getMedianPricePerCentPaise()).thenReturn(medianPricePerCentPaise);
        when(p.getUndervaluationScore()).thenReturn(undervaluationScore);
        return p;
    }
}
