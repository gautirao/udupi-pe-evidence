package com.example.realestate.insights;

import com.example.realestate.dashboard.AreaInsightsDao;
import com.example.realestate.dashboard.AreaPriceWeekly;
import com.example.realestate.listing.Listing;
import com.example.realestate.listing.ListingRepository.OpportunityProjection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/insights")
public class InsightsController {

    private static final Logger log = LoggerFactory.getLogger(InsightsController.class);

    private final InsightsService insightsService;

    public InsightsController(InsightsService insightsService) {
        this.insightsService = insightsService;
    }

    // ==================== 1. Avg price by area ====================

    @GetMapping("/avg-price-by-area")
    public ResponseEntity<List<AreaPriceResponse>> avgPriceByArea(JwtAuthenticationToken auth) {
        UUID userId = extractUserId(auth);

        List<AreaPriceResponse> result = insightsService.getAvgPriceByArea().stream()
                .map(row -> new AreaPriceResponse(
                        row.areaKey(),
                        row.listingCount(),
                        row.medianPricePerCentPaise(),
                        row.cityMedianPricePerCentPaise(),
                        row.priceIndex()))
                .toList();

        log.info("GET /api/insights/avg-price-by-area -> 200 count={} userId={}", result.size(), userId);
        return ResponseEntity.ok(result);
    }

    // ==================== 2. Price trend ====================

    @GetMapping("/price-trend")
    public ResponseEntity<?> priceTrend(JwtAuthenticationToken auth,
                                         @RequestParam(name = "area_key") String areaKey) {
        UUID userId = extractUserId(auth);

        List<PriceTrendResponse> result = insightsService.getPriceTrend(areaKey).stream()
                .map(w -> new PriceTrendResponse(
                        w.getWeekStartDate().toString(),
                        w.getMedianPricePerCentPaise(),
                        w.getListingCount(),
                        w.getP25PricePerCentPaise(),
                        w.getP75PricePerCentPaise()))
                .toList();

        log.info("GET /api/insights/price-trend -> 200 areaKey={} count={} userId={}",
                areaKey, result.size(), userId);
        return ResponseEntity.ok(result);
    }

    // ==================== 3. New listings ====================

    @GetMapping("/new-listings")
    public ResponseEntity<List<NewListingResponse>> newListings(JwtAuthenticationToken auth,
                                                                 @RequestParam(defaultValue = "7") int days) {
        UUID userId = extractUserId(auth);

        if (days < 1 || days > 90) {
            days = 7;
        }

        List<NewListingResponse> result = insightsService.getNewListings(userId, days).stream()
                .map(l -> new NewListingResponse(
                        l.getId(), l.getPropertyType(), l.getLocality(),
                        l.getAreaKey(), l.getAreaLabel(),
                        l.getPricePaise(), l.getPricePerCentPaise(),
                        l.getLatitude(), l.getLongitude(),
                        l.getCreatedAt() != null ? l.getCreatedAt().toString() : null))
                .toList();

        log.info("GET /api/insights/new-listings -> 200 days={} count={} userId={}", days, result.size(), userId);
        return ResponseEntity.ok(result);
    }

    // ==================== 4. Recommendations ====================

    @GetMapping("/recommendations")
    public ResponseEntity<List<RecommendationResponse>> recommendations(JwtAuthenticationToken auth) {
        UUID userId = extractUserId(auth);

        List<RecommendationResponse> result = insightsService.getRecommendations(userId).stream()
                .map(o -> new RecommendationResponse(
                        o.getId(), o.getPropertyType(), o.getLocality(),
                        o.getAreaKey(), o.getAreaLabel(),
                        o.getPricePaise(), o.getPricePerCentPaise(),
                        o.getMedianPricePerCentPaise(), o.getUndervaluationScore(),
                        o.getLatitude(), o.getLongitude(),
                        o.getCreatedAt() != null ? o.getCreatedAt().toString() : null))
                .toList();

        log.info("GET /api/insights/recommendations -> 200 count={} userId={}", result.size(), userId);
        return ResponseEntity.ok(result);
    }

    // ===== Auth =====

    private static UUID extractUserId(JwtAuthenticationToken auth) {
        return UUID.fromString(auth.getToken().getSubject());
    }

    // ===== DTOs =====

    public record AreaPriceResponse(String areaKey, int listingCount,
                                     Long medianPricePerCentPaise,
                                     Long cityMedianPricePerCentPaise,
                                     BigDecimal priceIndex) {}

    public record PriceTrendResponse(String weekStartDate, Long medianPricePerCentPaise,
                                      int listingCount, Long p25PricePerCentPaise,
                                      Long p75PricePerCentPaise) {}

    public record NewListingResponse(UUID id, String propertyType, String locality,
                                      String areaKey, String areaLabel,
                                      Long pricePaise, Long pricePerCentPaise,
                                      Double latitude, Double longitude,
                                      String createdAt) {}

    public record RecommendationResponse(UUID id, String propertyType, String locality,
                                          String areaKey, String areaLabel,
                                          Long pricePaise, Long pricePerCentPaise,
                                          Long medianPricePerCentPaise,
                                          Double undervaluationScore,
                                          Double latitude, Double longitude,
                                          String createdAt) {}
}
