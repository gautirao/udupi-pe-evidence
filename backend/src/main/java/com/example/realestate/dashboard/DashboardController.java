package com.example.realestate.dashboard;

import com.example.realestate.listing.Listing;
import com.example.realestate.listing.ListingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Dashboard API for querying pre-aggregated statistics.
 * All endpoints require JWT authentication (enforced via SecurityFilterChain).
 */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private static final Logger log = LoggerFactory.getLogger(DashboardController.class);
    private static final BigDecimal PAISE_TO_RUPEES = new BigDecimal("100");
    private static final int DEFAULT_WEEKS = 52;
    private static final int MAX_WEEKS = 520; // ~10 years
    private static final int DEFAULT_MAP_LIMIT = 200;
    private static final int MAX_MAP_LIMIT = 500;

    private final AreaPriceWeeklyRepository areaPriceWeeklyRepository;
    private final ListingRepository listingRepository;

    public DashboardController(AreaPriceWeeklyRepository areaPriceWeeklyRepository,
                               ListingRepository listingRepository) {
        this.areaPriceWeeklyRepository = areaPriceWeeklyRepository;
        this.listingRepository = listingRepository;
    }

    @GetMapping("/areas/{areaKey}/price-history")
    public ResponseEntity<List<PriceHistoryResponse>> getPriceHistory(
            @PathVariable String areaKey,
            @RequestParam(name = "weeks", defaultValue = "52") int weeks) {

        int effectiveWeeks = Math.min(Math.max(weeks, 1), MAX_WEEKS);
        log.info("Fetching price history areaKey={} weeks={}", areaKey, effectiveWeeks);

        List<AreaPriceWeekly> data = areaPriceWeeklyRepository.findRecentByAreaKey(areaKey, effectiveWeeks);

        List<PriceHistoryResponse> response = data.stream()
                .map(this::toResponse)
                .toList();

        log.debug("Returning {} weeks of price history for areaKey={}", response.size(), areaKey);
        return ResponseEntity.ok(response);
    }

    private PriceHistoryResponse toResponse(AreaPriceWeekly entity) {
        return new PriceHistoryResponse(
                entity.getWeekStartDate(),
                entity.getListingCount(),
                paiseToRupees(entity.getMedianPricePerCentPaise()),
                paiseToRupees(entity.getP25PricePerCentPaise()),
                paiseToRupees(entity.getP75PricePerCentPaise())
        );
    }

    private BigDecimal paiseToRupees(Long paise) {
        if (paise == null) {
            return null;
        }
        return new BigDecimal(paise).divide(PAISE_TO_RUPEES, 2, RoundingMode.HALF_UP);
    }

    // ==================== Map Listings Endpoint ====================

    @GetMapping("/map/listings")
    public ResponseEntity<?> getMapListings(
            @RequestParam double minLat,
            @RequestParam double minLng,
            @RequestParam double maxLat,
            @RequestParam double maxLng,
            @RequestParam(required = false) BigDecimal minPpc,
            @RequestParam(required = false) BigDecimal maxPpc,
            @RequestParam(name = "freshDays", defaultValue = "7") int freshDays,
            @RequestParam(name = "limit", defaultValue = "200") int limit) {

        if (minLat > maxLat || minLng > maxLng) {
            return ResponseEntity.badRequest().body("Invalid bounding box: min must be <= max");
        }

        int effectiveLimit = Math.min(Math.max(limit, 1), MAX_MAP_LIMIT);

        Long minPpcPaise = minPpc != null ? minPpc.multiply(PAISE_TO_RUPEES).longValue() : null;
        Long maxPpcPaise = maxPpc != null ? maxPpc.multiply(PAISE_TO_RUPEES).longValue() : null;

        OffsetDateTime createdAfter = freshDays > 0
                ? OffsetDateTime.now().minusDays(freshDays)
                : null;

        log.info("Map listings query bbox=[{},{} -> {},{}] ppc=[{},{}] freshDays={} limit={}",
                minLat, minLng, maxLat, maxLng, minPpcPaise, maxPpcPaise, freshDays, effectiveLimit);

        List<Listing> listings = listingRepository.findInBoundingBox(
                minLat, minLng, maxLat, maxLng,
                minPpcPaise, maxPpcPaise,
                createdAfter, effectiveLimit);

        List<MapListingResponse> response = listings.stream()
                .map(this::toMapListingResponse)
                .toList();

        log.debug("Returning {} map listings", response.size());
        return ResponseEntity.ok(response);
    }

    private MapListingResponse toMapListingResponse(Listing listing) {
        return new MapListingResponse(
                listing.getId(),
                listing.getDescription(),
                paiseToRupees(listing.getPricePaise()),
                paiseToRupees(listing.getPricePerCentPaise()),
                listing.getAreaKey(),
                listing.getAreaLabel(),
                listing.getLatitude(),
                listing.getLongitude(),
                listing.getCreatedAt());
    }

    /**
     * Response DTO for price history endpoint.
     * Prices are in rupees (converted from paise stored in DB).
     */
    public record PriceHistoryResponse(
            LocalDate weekStartDate,
            int listingCount,
            BigDecimal medianPricePerCentRupees,
            BigDecimal p25PricePerCentRupees,
            BigDecimal p75PricePerCentRupees
    ) {
    }

    public record MapListingResponse(
            UUID id,
            String title,
            BigDecimal priceRupees,
            BigDecimal pricePerCentRupees,
            String areaKey,
            String areaLabel,
            Double latitude,
            Double longitude,
            OffsetDateTime createdAt
    ) {
    }
}
