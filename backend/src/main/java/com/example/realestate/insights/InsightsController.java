package com.example.realestate.insights;

import com.example.realestate.dashboard.AreaInsightsDao;
import com.example.realestate.dashboard.AreaPriceWeekly;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository.OpportunityProjection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
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
    public ResponseEntity<?> avgPriceByArea(JwtAuthenticationToken auth,
                                             @RequestParam(defaultValue = "all") String propertyType,
                                             @RequestParam(defaultValue = "0") int bedrooms) {
        UUID userId = extractUserId(auth);
        ResponseEntity<?> denied = checkAccess(userId);
        if (denied != null) return denied;

        List<AreaPriceResponse> result = insightsService.getAvgPriceByArea(propertyType, bedrooms).stream()
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
                                         @RequestParam(name = "area_key") String areaKey,
                                         @RequestParam(defaultValue = "all") String propertyType,
                                         @RequestParam(defaultValue = "0") int bedrooms) {
        UUID userId = extractUserId(auth);
        ResponseEntity<?> denied = checkAccess(userId);
        if (denied != null) return denied;

        List<PriceTrendResponse> result = insightsService.getPriceTrend(areaKey, propertyType, bedrooms).stream()
                .map(w -> new PriceTrendResponse(
                        w.getWeekStartDate().toString(),
                        w.getMedianPricePerCentPaise(),
                        w.getListingCount(),
                        w.getP25PricePerCentPaise(),
                        w.getP75PricePerCentPaise()))
                .toList();

        log.info("GET /api/insights/price-trend -> 200 areaKey={} propertyType={} bedrooms={} count={} userId={}",
                areaKey, propertyType, bedrooms, result.size(), userId);
        return ResponseEntity.ok(result);
    }

    // ==================== 3. New listings ====================

    // NOTE: The underlying native SQL query has a hardcoded ORDER BY created_at DESC.
    // Do NOT pass a sort via Pageable (e.g., use PageRequest.of(page, size) in tests and
    // callers), otherwise Spring Data will append a conflicting ORDER BY clause.
    @GetMapping("/new-listings")
    public ResponseEntity<?> newListings(
            JwtAuthenticationToken auth,
            @RequestParam(defaultValue = "7") int days,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        UUID userId = extractUserId(auth);
        ResponseEntity<?> denied = checkAccess(userId);
        if (denied != null) return denied;

        if (days < 1 || days > 90) {
            days = 7;
        }

        Page<NewListingResponse> result = insightsService.getNewListings(userId, days, pageable)
                .map(l -> new NewListingResponse(
                        l.getId(), l.getPropertyType(), l.getLocality(),
                        l.getAreaKey(), l.getAreaLabel(),
                        l.getPricePaise(), l.getPricePerCentPaise(),
                        l.getLatitude(), l.getLongitude(),
                        l.getCreatedAt() != null ? l.getCreatedAt().toString() : null));

        log.info("GET /api/insights/new-listings -> 200 days={} count={} page={} userId={}",
                days, result.getNumberOfElements(), result.getNumber(), userId);
        return ResponseEntity.ok(result);
    }

    // ==================== 4. Recommendations ====================

    // NOTE: The underlying native SQL query has a hardcoded ORDER BY undervaluationScore DESC,
    // created_at DESC. Do NOT pass a sort via Pageable (e.g., use PageRequest.of(page, size)
    // in tests and callers), otherwise Spring Data will append a conflicting ORDER BY clause.
    @GetMapping("/recommendations")
    public ResponseEntity<?> recommendations(
            JwtAuthenticationToken auth,
            @PageableDefault(size = 20) Pageable pageable) {
        UUID userId = extractUserId(auth);
        ResponseEntity<?> denied = checkAccess(userId);
        if (denied != null) return denied;

        Page<RecommendationResponse> result = insightsService.getRecommendations(userId, pageable)
                .map(o -> new RecommendationResponse(
                        o.getId(), o.getPropertyType(), o.getLocality(),
                        o.getAreaKey(), o.getAreaLabel(),
                        o.getPricePaise(), o.getPricePerCentPaise(),
                        o.getMedianPricePerCentPaise(), o.getUndervaluationScore(),
                        o.getLatitude(), o.getLongitude(),
                        o.getCreatedAt() != null ? o.getCreatedAt().toString() : null));

        log.info("GET /api/insights/recommendations -> 200 count={} page={} userId={}",
                result.getNumberOfElements(), result.getNumber(), userId);
        return ResponseEntity.ok(result);
    }

    // ===== Access check =====

    /**
     * Returns a 403 ResponseEntity if the user's insights access has expired or is missing.
     * Returns null if access is valid (caller proceeds normally).
     */
    private ResponseEntity<?> checkAccess(UUID userId) {
        try {
            insightsService.checkInsightsAccess(userId);
            return null;
        } catch (InsightsService.InsightsAccessExpiredException e) {
            String expiresAt = e.getExpiresAt() != null ? e.getExpiresAt().toString() : null;
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new InsightsAccessError("INSIGHTS_ACCESS_EXPIRED", expiresAt,
                            "/api/payments/insights-pass"));
        }
    }

    // ===== Auth =====

    private static UUID extractUserId(JwtAuthenticationToken auth) {
        return UUID.fromString(auth.getToken().getSubject());
    }

    // ===== DTOs =====

    public record InsightsAccessError(String error, String expiresAt, String upgradePath) {}

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
